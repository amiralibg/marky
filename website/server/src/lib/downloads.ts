import { config } from "../config.js";

export type OsKey = "macos" | "windows" | "linux";

export type ReleaseDownloads = {
  tag: string;
  publishedAt: string | null;
  total: number;
  byOs: Record<OsKey, number>;
};

export type DownloadStats = {
  total: number;
  byOs: Record<OsKey, number>;
  latest: { tag: string; count: number; publishedAt: string | null } | null;
  releases: number;
  /** Newest first, capped so the dashboard renders a fixed-height list. */
  perRelease: ReleaseDownloads[];
  /** Mean installs per published release. Zero when there are no releases. */
  perReleaseAverage: number;
  /** Days since the newest release went out, or null if there is none. */
  daysSinceLatest: number | null;
  /** When the numbers were pulled from GitHub. */
  fetchedAt: string;
};

type GithubAsset = { name: string; download_count: number };
type GithubRelease = {
  tag_name: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
};

const RELEASE_LIMIT = 8;

/**
 * Installer extensions only. Update manifests, signatures and blockmaps are
 * fetched by the auto-updater on a schedule, so counting them would report
 * traffic rather than installs.
 */
function osFor(name: string): OsKey | null {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg")) return "macos";
  if (n.endsWith(".exe") || n.endsWith(".msi")) return "windows";
  if (n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm")) return "linux";
  return null;
}

// Unauthenticated GitHub allows 60 calls an hour per IP. One admin refreshing
// the dashboard must not burn through that, so the answer is held for 30
// minutes and every dashboard load in between reuses it.
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; value: DownloadStats } | null = null;
let inflight: Promise<DownloadStats | null> | null = null;

async function load(): Promise<DownloadStats> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "marky-feedback-api",
  };
  // A token lifts the limit to 5000/hour and is optional.
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${config.githubRepo}/releases?per_page=100`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);

  const json = (await res.json()) as GithubRelease[];
  if (!Array.isArray(json)) throw new Error("unexpected payload");

  const published = json.filter((release) => !release.draft && !release.prerelease);
  const byOs: Record<OsKey, number> = { macos: 0, windows: 0, linux: 0 };
  let total = 0;

  // One pass builds both the site-wide totals and the per-version rows the
  // dashboard charts, so the two can never disagree.
  const perReleaseAll: ReleaseDownloads[] = published.map((release) => {
    const row: ReleaseDownloads = {
      tag: release.tag_name,
      publishedAt: release.published_at,
      total: 0,
      byOs: { macos: 0, windows: 0, linux: 0 },
    };
    for (const asset of release.assets ?? []) {
      const os = osFor(asset.name);
      if (!os) continue;
      row.byOs[os] += asset.download_count;
      row.total += asset.download_count;
      byOs[os] += asset.download_count;
      total += asset.download_count;
    }
    return row;
  });

  const newest = perReleaseAll[0] ?? null;
  const publishedAt = newest?.publishedAt ? Date.parse(newest.publishedAt) : NaN;

  return {
    total,
    byOs,
    latest: newest
      ? { tag: newest.tag, publishedAt: newest.publishedAt, count: newest.total }
      : null,
    releases: published.length,
    perRelease: perReleaseAll.slice(0, RELEASE_LIMIT),
    perReleaseAverage: published.length > 0 ? Math.round(total / published.length) : 0,
    daysSinceLatest: Number.isNaN(publishedAt)
      ? null
      : Math.max(0, Math.floor((Date.now() - publishedAt) / 86_400_000)),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Best-effort. GitHub being rate limited or down must never take the dashboard
 * with it, so a failure returns the last good answer if there is one and null
 * otherwise. The client renders the download panel only when this is present.
 */
export async function downloadStats(): Promise<DownloadStats | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (inflight) return inflight;

  inflight = load()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .catch((err) => {
      console.warn("[downloads] GitHub fetch failed:", err instanceof Error ? err.message : err);
      return cache?.value ?? null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
