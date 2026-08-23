import { afterEach, describe, expect, it, vi } from "vitest";
import {
  awsUriEncode,
  canonicalizeQuery,
  decideAction,
  deriveSigningKey,
  signS3Request,
} from "./s3Sync";

const hex = async (key, data) =>
  [...(await deriveSigningKey(key, data.slice(0, 8), "us-east-1"))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("awsUriEncode", () => {
  it("percent-encodes everything outside the AWS unreserved set", () => {
    expect(awsUriEncode("a b+c/d?")).toBe("a%20b%2Bc%2Fd%3F");
  });

  it("keeps unreserved characters untouched", () => {
    expect(awsUriEncode("A-z0_9.~")).toBe("A-z0_9.~");
  });

  it("can preserve slashes for path-style canonical URIs", () => {
    expect(awsUriEncode("notes/2026/my note.md", false)).toBe("notes/2026/my%20note.md");
  });

  it("encodes non-ASCII as UTF-8 bytes", () => {
    expect(awsUriEncode("é")).toBe("%C3%A9");
  });
});

describe("canonicalizeQuery", () => {
  it("sorts by key and encodes both sides", () => {
    expect(canonicalizeQuery({ "list-type": "2", prefix: "notes/a b" })).toBe(
      "list-type=2&prefix=notes%2Fa%20b"
    );
  });
});

describe("decideAction", () => {
  const local = 1_000_000;
  const remoteNewer = local + 60_000;
  const remoteOlder = local - 60_000;

  it("pushes when there is no remote copy", () => {
    expect(decideAction({ localMtimeMs: local })).toBe("push");
  });

  it("pulls when there is no local copy", () => {
    expect(decideAction({ remoteMtimeMs: remoteNewer })).toBe("pull");
  });

  it("skips when both sides match the last sync's record", () => {
    // A pulled file gets a fresh local mtime newer than the remote — without
    // the saved-state check every sync would push it straight back.
    expect(
      decideAction({
        localMtimeMs: local + 30_000,
        remoteMtimeMs: remoteOlder,
        savedLocalMtimeMs: local + 30_000,
        savedRemoteMtimeMs: remoteOlder,
      })
    ).toBe("skip");
  });

  it("pulls when only the remote moved since the last sync", () => {
    expect(
      decideAction({
        localMtimeMs: local,
        remoteMtimeMs: remoteNewer,
        savedLocalMtimeMs: local,
        savedRemoteMtimeMs: remoteOlder,
      })
    ).toBe("pull");
  });

  it("pushes when only the local file moved since the last sync", () => {
    expect(
      decideAction({
        localMtimeMs: local + 120_000,
        remoteMtimeMs: remoteOlder,
        savedLocalMtimeMs: local,
        savedRemoteMtimeMs: remoteOlder,
      })
    ).toBe("push");
  });

  it("falls back to last-write-wins by mtime without saved state", () => {
    expect(decideAction({ localMtimeMs: local, remoteMtimeMs: remoteNewer })).toBe("pull");
    expect(decideAction({ localMtimeMs: local, remoteMtimeMs: remoteOlder })).toBe("push");
  });

  it("treats sub-second mtime differences as clock skew and pushes", () => {
    expect(decideAction({ localMtimeMs: local, remoteMtimeMs: local + 500 })).toBe("push");
  });
});

describe("signS3Request", () => {
  // The worked SigV4 example from the AWS docs (GET object with a Range
  // header). Matching it byte-for-byte proves the whole signing chain.
  const config = {
    endpoint: "https://examplebucket.s3.amazonaws.com",
    bucket: "examplebucket",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };

  afterEach(() => vi.restoreAllMocks());

  it("reproduces the AWS documentation test vector", async () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const headers = await signS3Request(
      {
        method: "GET",
        url,
        headers: {
          Range: "bytes=0-9",
          "x-amz-content-sha256":
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
      config,
      new Date("2013-05-24T00:00:00Z")
    );

    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("signs list requests with an encoded query string", async () => {
    const url = new URL("https://minio.local:9000/vault");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", "notes/my folder");
    const headers = await signS3Request(
      { method: "GET", url },
      { ...config, endpoint: "https://minio.local:9000", bucket: "vault" },
      new Date("2026-08-01T12:00:00Z")
    );
    expect(headers.host).toBe("minio.local:9000");
    expect(headers.authorization).toContain("/20260801/us-east-1/s3/aws4_request");
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("derives a stable signing key", async () => {
    const keyHex = await hex("secret", "20260801-rest-of-scope");
    expect(keyHex).toMatch(/^[0-9a-f]{64}$/);
  });
});
