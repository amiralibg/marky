import { fetch } from "@tauri-apps/plugin-http";
import { stat } from "@tauri-apps/plugin-fs";
import { readWorkspaceFiles, writeMarkdownFileOnDisk, ensureFolderExists } from "./fileSystem";
import { markSelfWrite } from "./selfWrite";

/**
 * S3-compatible object storage sync (MinIO, Backblaze B2, Wasabi, Hetzner, AWS…).
 *
 * Agreed v1 shape (TODO.md): a manual "Sync now" push/pull against a
 * user-configured endpoint and bucket, using **path-style** URLs so non-AWS
 * providers work. Conflicts resolve last-write-wins by mtime per file, and
 * remote files are never deleted.
 *
 * Requests are SigV4-signed here and sent through `tauri-plugin-http`: plain
 * webview fetch is CORS-blocked by buckets without a permissive policy.
 */

const textEncoder = new TextEncoder();

/** RFC 3986 percent-encoding (encodeURIComponent leaves !'()* unescaped). */
export const awsUriEncode = (value, encodeSlash = true) =>
  value.replace(/[^A-Za-z0-9-_.~]/g, (ch) => {
    if (ch === "/" && !encodeSlash) return ch;
    return Array.from(textEncoder.encode(ch))
      .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
      .join("");
  });

const sha256Hex = async (data) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hmacRaw = async (key, data) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? textEncoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(data)));
};

const hmacHex = async (key, data) =>
  [...(await hmacRaw(key, data))].map((b) => b.toString(16).padStart(2, "0")).join("");

const amzDateFormat = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** SigV4 signing key chain: kSecret → kDate → kRegion → kService → kSigning. */
export const deriveSigningKey = async (secretKey, dateStamp, region, service = "s3") =>
  hmacRaw(
    await hmacRaw(await hmacRaw(await hmacRaw(`AWS4${secretKey}`, dateStamp), region), service),
    "aws4_request"
  );

/** Canonical query string: params sorted by key, RFC 3986 encoded. */
export const canonicalizeQuery = (params) =>
  Object.keys(params)
    .sort()
    .map((key) => `${awsUriEncode(key)}=${awsUriEncode(String(params[key]))}`)
    .join("&");

/** Build the signed headers (including Authorization) for one request. */
export const signS3Request = async (
  { method, url, body = "", headers = {} },
  config,
  now = new Date()
) => {
  const region = config.region || "us-east-1";
  const amzDate = amzDateFormat(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash =
    headers["x-amz-content-sha256"] || (await sha256Hex(typeof body === "string" ? body : ""));

  // The pathname is already percent-encoded exactly once (buildObjectUrl
  // encodes each key segment); SigV4 signs the encoded form as-is.
  const canonicalUri = url.pathname;
  const canonicalQuery = url.search ? canonicalizeQuery(Object.fromEntries(url.searchParams)) : "";

  const allHeaders = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  // Canonical headers are lowercase-named and sorted.
  for (const [name, value] of Object.entries(headers)) {
    allHeaders[name.toLowerCase()] = String(value).trim();
  }
  delete allHeaders.authorization;
  const sortedNames = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${String(allHeaders[name]).trim()}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n"
  );

  const signingKey = await deriveSigningKey(config.secretAccessKey, dateStamp, region);
  const signature = await hmacHex(signingKey, stringToSign);

  return {
    ...allHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
};

export const isS3Configured = (config = {}) =>
  Boolean(config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey);

/**
 * Path-style URL (`https://host/bucket/prefix/key`) so MinIO/B2/Wasabi/Hetzner
 * work without DNS wildcard certificates. `withPrefix=false` builds the
 * bucket-root URL (listing addresses its prefix through the query string).
 */
export const buildObjectUrl = (config, key = "", { withPrefix = true } = {}) => {
  let endpoint = (config.endpoint || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(endpoint)) endpoint = `https://${endpoint}`;
  const prefix = withPrefix ? (config.prefix || "").replace(/^\/+|\/+$/g, "") : "";
  const segments = [prefix, key].filter(Boolean).map((seg) => awsUriEncode(seg, false));
  const pathSuffix = [encodeURIComponent(config.bucket), ...segments].join("/");
  return new URL(`${endpoint}/${pathSuffix}`);
};

const s3Fetch = async (config, method, keyOrUrl, { body } = {}) => {
  const url = typeof keyOrUrl === "string" ? buildObjectUrl(config, keyOrUrl) : keyOrUrl;
  const headers = await signS3Request({ method, url, body: body ?? "" }, config);
  return fetch(url.toString(), {
    method,
    headers,
    ...(body != null ? { body } : {}),
  });
};

/** Every note object under the prefix, across ListObjectsV2 pages. */
export const listRemoteObjects = async (config) => {
  const objects = [];
  let continuationToken;

  do {
    const params = { "list-type": "2" };
    if (config.prefix) params.prefix = String(config.prefix).replace(/^\/+|\/+$/g, "");
    if (continuationToken) params["continuation-token"] = continuationToken;

    const url = buildObjectUrl(config, "", { withPrefix: false });
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await s3Fetch(config, "GET", url);
    if (!res.ok) throw new Error(`Listing failed (${res.status}): ${await res.text()}`);

    const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
    for (const node of doc.querySelectorAll("Contents")) {
      const key = node.querySelector("Key")?.textContent;
      const modified = node.querySelector("LastModified")?.textContent;
      if (key && modified) objects.push({ key, lastModifiedMs: Date.parse(modified) });
    }
    continuationToken =
      doc.querySelector("IsTruncated")?.textContent === "true"
        ? doc.querySelector("NextContinuationToken")?.textContent
        : undefined;
  } while (continuationToken);

  return objects;
};

export const getS3Object = async (config, key) => {
  const res = await s3Fetch(config, "GET", key);
  if (!res.ok) throw new Error(`Download failed for ${key} (${res.status})`);
  return res.text();
};

export const putS3Object = async (config, key, content) => {
  const res = await s3Fetch(config, "PUT", key, { body: content });
  if (!res.ok) throw new Error(`Upload failed for ${key} (${res.status}): ${await res.text()}`);
};

const deleteS3Object = async (config, key) => {
  const res = await s3Fetch(config, "DELETE", key);
  if (!res.ok) throw new Error(`Delete failed for ${key} (${res.status})`);
};

/**
 * Verify the bucket is reachable AND writable: upload and delete a marker
 * object. A listing alone would pass with read-only credentials and then fail
 * confusingly at first upload.
 */
export const testS3Connection = async (config) => {
  try {
    const probeKey = config.prefix
      ? `${String(config.prefix).replace(/^\/+|\/+$/g, "")}/.marky-probe`
      : ".marky-probe";
    await putS3Object(config, probeKey, String(Date.now()));
    const objectCount = (await listRemoteObjects(config)).length;
    try {
      await deleteS3Object(config, probeKey);
    } catch {
      // Cleanup is best-effort; the connection already proved itself.
    }
    return { ok: true, objectCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

const joinLocalPath = (root, relative) => `${root.replace(/[\\/]+$/, "")}/${relative}`;
const dirnameOf = (filePath) => filePath.split("/").slice(0, -1).join("/");

/**
 * What one file needs given both sides' state. Pure — exported for tests.
 *
 * `saved*` are the mtimes recorded at the end of the last completed sync.
 * When both sides still match those, nothing changed anywhere — this is what
 * keeps a freshly pulled file (whose local mtime is "now", newer than the
 * remote's) from being pushed straight back on the next pass. Without any
 * saved state (first sync against a bucket), fall back to raw last-write-wins
 * by mtime, tolerating 1s of clock skew.
 *
 * Remote deletes never propagate: missing remotely means push, missing
 * locally means pull.
 */
export const decideAction = ({
  localMtimeMs = null,
  remoteMtimeMs = null,
  savedLocalMtimeMs = null,
  savedRemoteMtimeMs = null,
}) => {
  if (remoteMtimeMs == null) return "push";
  if (localMtimeMs == null) return "pull";
  const unchangedLocally = savedLocalMtimeMs != null && savedLocalMtimeMs === localMtimeMs;
  const unchangedRemotely = savedRemoteMtimeMs != null && savedRemoteMtimeMs === remoteMtimeMs;
  if (unchangedLocally && unchangedRemotely) return "skip";
  if (!unchangedRemotely && remoteMtimeMs > localMtimeMs + 1000) return "pull";
  return "push";
};

/**
 * Per-workspace record of what each side looked like at the end of the last
 * successful sync. Kept in localStorage alongside settings — losing it just
 * means the next sync falls back to mtime comparison.
 */
export const syncStateStorageKey = (rootFolderPath, config) =>
  `marky-s3-sync-state:${rootFolderPath.replace(/[\\/]+$/, "")}:${config.bucket}:${
    config.prefix || ""
  }`;

const loadSyncState = (storageKey) => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
};

const saveSyncState = (storageKey, state) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Quota errors shouldn't fail an otherwise complete sync.
  }
};

const stripPrefix = (key, prefix) =>
  prefix ? key.replace(new RegExp(`^${prefix.replace(/^\/+|\/+$/g, "")}/`), "") : key;

/**
 * One manual sync pass over the open workspace.
 * @returns {{pushed: number, pulled: number, skipped: number}}
 */
export const syncWorkspaceToS3 = async (
  config,
  { rootFolderPath, ignorePatterns = [], onProgress = () => {} } = {}
) => {
  if (!rootFolderPath) throw new Error("Open a workspace before syncing");
  if (!isS3Configured(config)) throw new Error("S3 sync is not configured");

  const localFiles = (await readWorkspaceFiles(rootFolderPath, ignorePatterns, [])).filter(
    (f) => !f.is_dir
  );
  const localByRelative = new Map(
    localFiles.map((f) => [
      f.path.replace(/\\/g, "/").slice(rootFolderPath.replace(/[\\/]+$/, "").length + 1),
      f,
    ])
  );

  const remoteObjects = await listRemoteObjects(config);
  const remoteByRelative = new Map(
    remoteObjects.map((o) => [stripPrefix(o.key, config.prefix), o])
  );

  const storageKey = syncStateStorageKey(rootFolderPath, config);
  const syncState = loadSyncState(storageKey);
  const nextSyncState = {};

  const result = { pushed: 0, pulled: 0, skipped: 0 };
  const relatives = new Set([...localByRelative.keys(), ...remoteByRelative.keys()]);
  const errors = [];

  for (const relative of relatives) {
    const local = localByRelative.get(relative);
    const remote = remoteByRelative.get(relative);
    const saved = syncState[relative] || {};
    const action = decideAction({
      localMtimeMs: local ? local.modified : null,
      remoteMtimeMs: remote ? remote.lastModifiedMs : null,
      savedLocalMtimeMs: saved.localMtimeMs,
      savedRemoteMtimeMs: saved.remoteMtimeMs,
    });
    if (action === "skip") {
      // Keep the record so future passes can keep proving "nothing changed".
      if (saved.localMtimeMs != null) nextSyncState[relative] = saved;
      else
        nextSyncState[relative] = {
          localMtimeMs: local?.modified ?? null,
          remoteMtimeMs: remote?.lastModifiedMs ?? null,
        };
      result.skipped += 1;
      continue;
    }

    const absolutePath = joinLocalPath(rootFolderPath, relative);
    try {
      if (action === "push") {
        onProgress(`Uploading ${relative}`);
        markSelfWrite(absolutePath);
        // Bare relative key — buildObjectUrl applies the prefix itself.
        await putS3Object(config, relative, local.content ?? "");
        // The server stamps its own LastModified on upload; read the real
        // value back so the saved pair matches exactly on the next pass.
        let remoteMtimeMs = null;
        try {
          const head = await s3Fetch(config, "HEAD", relative);
          const lastModified = head.headers?.get?.("last-modified");
          if (lastModified) remoteMtimeMs = Date.parse(lastModified);
        } catch {
          // A failed HEAD only costs a mtime match next time, not the sync.
        }
        nextSyncState[relative] = { localMtimeMs: local.modified, remoteMtimeMs };
        result.pushed += 1;
      } else {
        onProgress(`Downloading ${relative}`);
        const content = await getS3Object(config, relative);
        await ensureFolderExists(dirnameOf(absolutePath));
        await writeMarkdownFileOnDisk(absolutePath, content);
        // Re-stat so the saved local mtime is the exact value the next scan
        // will see — otherwise the pull would look like a local change.
        let localMtimeMs = null;
        try {
          const stats = await stat(absolutePath);
          localMtimeMs = Math.floor(stats.mtime?.getTime?.() ?? 0) || null;
        } catch {
          // A failed stat only costs a mtime comparison next pass.
        }
        nextSyncState[relative] = { localMtimeMs, remoteMtimeMs: remote.lastModifiedMs };
        result.pulled += 1;
      }
    } catch (err) {
      errors.push(`${relative}: ${err.message}`);
    }
  }

  saveSyncState(storageKey, nextSyncState);

  if (errors.length > 0) {
    result.errors = errors;
    throw new Error(
      `${errors.length} file${errors.length !== 1 ? "s" : ""} failed to sync — ${errors[0]}`
    );
  }

  return result;
};
