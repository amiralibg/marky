/**
 * Release notes for the changelog page.
 *
 * Two sources, on purpose. The build bakes a snapshot into /releases.json so the
 * page has something to draw on its first frame and keeps working when GitHub's
 * unauthenticated limit (60 requests an hour, per IP) is spent. The live API is
 * then asked in the background, so a release published after the last deploy
 * still shows up without rebuilding the site — the same promise the download
 * buttons make.
 *
 * No React in this file: vite.config.ts imports toEntry() to build the snapshot
 * in exactly the shape the page expects.
 */

/** Marky itself, or the separately versioned MCP server. */
export type Channel = "app" | "mcp";

export type ChangelogEntry = {
  /** Git tag, e.g. `v1.8.0` or `mcp-v2.0.0`. Unique, so it doubles as the key. */
  tag: string;
  /** Tag without the channel prefix and the `v`, e.g. `1.8.0`. */
  version: string;
  url: string;
  /** ISO 8601, or null for a release GitHub never published. */
  date: string | null;
  /** Release notes as Markdown, with the redundant title heading removed. */
  body: string;
  channel: Channel;
  prerelease: boolean;
};

export type GithubReleasePayload = {
  tag_name: string;
  name?: string | null;
  html_url: string;
  published_at?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
};

export type Snapshot = {
  generatedAt: string;
  entries: ChangelogEntry[];
};

export const SNAPSHOT_URL = "/releases.json";
const GITHUB_REPO = "amiralibg/marky";
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`;

export const CHANNEL_LABEL: Record<Channel, string> = {
  app: "Marky",
  mcp: "MCP server",
};

function channelOf(tag: string): Channel {
  return /^mcp[-@/]/i.test(tag) ? "mcp" : "app";
}

function versionOf(tag: string) {
  return tag.replace(/^mcp[-@/]/i, "").replace(/^v/i, "");
}

/**
 * Drops the leading `# Marky v1.8.0` heading. Every release note opens with one
 * and the card already prints the version above the notes, so keeping it means
 * showing the version twice, in two different sizes. `#` or `##`, because the
 * MCP server's notes title themselves at the second level; it is only removed
 * when the heading names the version, so a real section heading survives.
 */
function stripTitleHeading(body: string, tag: string) {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  const match = /^#{1,2}[ \t]+(.+?)[ \t]*(?:\n|$)/.exec(trimmed);
  if (!match) return trimmed;
  const heading = match[1].toLowerCase();
  const version = versionOf(tag).toLowerCase();
  if (!heading.includes(version)) return trimmed;
  return trimmed.slice(match[0].length).trim();
}

export function toEntry(payload: GithubReleasePayload): ChangelogEntry {
  const tag = payload.tag_name;
  return {
    tag,
    version: versionOf(tag),
    url: payload.html_url,
    date: payload.published_at ?? null,
    body: stripTitleHeading(payload.body ?? "", tag),
    channel: channelOf(tag),
    prerelease: Boolean(payload.prerelease),
  };
}

/** Newest first. GitHub's own ordering follows creation, which drifts from the
 *  publication order whenever a release is drafted ahead of time. */
export function sortEntries(entries: ChangelogEntry[]) {
  return [...entries].sort((a, b) => {
    const at = a.date ? Date.parse(a.date) : 0;
    const bt = b.date ? Date.parse(b.date) : 0;
    if (at !== bt) return bt - at;
    return b.tag.localeCompare(a.tag);
  });
}

export function toEntries(payloads: GithubReleasePayload[]) {
  return sortEntries(payloads.filter((release) => !release.draft).map(toEntry));
}

/**
 * The SPA fallback answers any unknown path with index.html, so a missing
 * snapshot arrives as a 200 full of HTML rather than a 404. Check the type.
 */
async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("Expected JSON");
  return (await response.json()) as T;
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<ChangelogEntry[]> {
  const snapshot = await readJson<Snapshot>(await fetch(SNAPSHOT_URL, { signal }));
  return sortEntries(snapshot.entries ?? []);
}

export async function fetchLiveReleases(signal?: AbortSignal): Promise<ChangelogEntry[]> {
  const payloads = await readJson<GithubReleasePayload[]>(
    await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, signal })
  );
  return toEntries(payloads);
}

export function formatReleaseDate(date: string | null) {
  if (!date) return "Unreleased";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
