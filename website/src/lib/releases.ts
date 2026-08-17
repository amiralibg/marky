export type Os = "macos" | "windows" | "linux";
export type Arch = "arm64" | "amd64";
export type PackageFormat = "dmg" | "exe" | "msi" | "appimage" | "deb" | "rpm";

export type ClassifiedAsset = {
  name: string;
  url: string;
  size: number;
  os: Os;
  arch: Arch;
  format: PackageFormat;
};

export type ReleaseInfo = {
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  assets: ClassifiedAsset[];
};

const GITHUB_REPO = "amiralibg/marky";
const CACHE_KEY = "marky-latest-release";
const CACHE_MS = 10 * 60 * 1000;

function shouldSkip(name: string) {
  const n = name.toLowerCase();
  if (n === "latest.json") return true;
  if (n.endsWith(".sig") || n.endsWith(".blockmap")) return true;
  if (n.includes(".app.tar") || n.endsWith(".tar.gz") || n.endsWith(".tar.xz")) return true;
  return false;
}

const FORMAT_BY_EXT: Array<{ test: RegExp; format: PackageFormat; os: Os }> = [
  { test: /\.dmg$/i, format: "dmg", os: "macos" },
  { test: /(-setup)?\.exe$/i, format: "exe", os: "windows" },
  { test: /\.msi$/i, format: "msi", os: "windows" },
  { test: /\.appimage$/i, format: "appimage", os: "linux" },
  { test: /\.deb$/i, format: "deb", os: "linux" },
  { test: /\.rpm$/i, format: "rpm", os: "linux" },
];

function detectFormat(name: string): { format: PackageFormat; os: Os } | null {
  const n = name.toLowerCase();
  for (const row of FORMAT_BY_EXT) {
    if (row.test.test(n)) return { format: row.format, os: row.os };
  }
  return null;
}

function detectOsFromTokens(name: string, fallback: Os): Os {
  const n = name.toLowerCase();
  if (/\b(darwin|macos|osx|mac)\b/.test(n) || n.includes("macos") || n.includes("darwin")) {
    return "macos";
  }
  if (/\b(windows|win32|win64|win)\b/.test(n) || n.includes("windows")) {
    return "windows";
  }
  if (/\b(linux|ubuntu|debian|fedora|appimage)\b/.test(n)) {
    return "linux";
  }
  return fallback;
}

/**
 * Arch tokens are matched independently of Tauri's current naming
 * (aarch64 / arm64 / amd64 / x64 / x86_64) so renamed assets still classify.
 */
function detectArch(name: string): Arch {
  const n = name.toLowerCase();
  if (/(aarch64|arm64|armv8|apple.?silicon)/i.test(n)) return "arm64";
  if (/(x86[_-]64|amd64|x64|intel|win64)/i.test(n)) return "amd64";
  return "amd64";
}

export function classifyAsset(name: string, url: string, size: number): ClassifiedAsset | null {
  if (shouldSkip(name)) return null;
  const detected = detectFormat(name);
  if (!detected) return null;
  const os = detectOsFromTokens(name, detected.os);
  const arch = detectArch(name);
  return { name, url, size, os, arch, format: detected.format };
}

type GithubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type GithubRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string | null;
  assets: GithubAsset[];
};

export function parseRelease(payload: GithubRelease): ReleaseInfo {
  const assets = payload.assets
    .map((asset) => classifyAsset(asset.name, asset.browser_download_url, asset.size))
    .filter((asset): asset is ClassifiedAsset => asset !== null);

  return {
    tag: payload.tag_name,
    name: payload.name || payload.tag_name,
    url: payload.html_url,
    publishedAt: payload.published_at,
    assets,
  };
}

export function preferredAsset(
  assets: ClassifiedAsset[],
  os: Os,
  arch: Arch
): ClassifiedAsset | null {
  const pool = assets.filter((asset) => asset.os === os && asset.arch === arch);
  for (const format of FORMAT_RANK[os]) {
    const match = pool.find((asset) => asset.format === format);
    if (match) return match;
  }
  return pool[0] ?? null;
}

const FORMAT_RANK: Record<Os, PackageFormat[]> = {
  macos: ["dmg"],
  windows: ["exe", "msi"],
  linux: ["deb", "rpm", "appimage"],
};

export function assetsFor(assets: ClassifiedAsset[], os: Os, arch: Arch) {
  const rank = FORMAT_RANK[os];
  return assets
    .filter((asset) => asset.os === os && asset.arch === arch)
    .sort((a, b) => rank.indexOf(a.format) - rank.indexOf(b.format));
}

/** Native packages only — AppImage is a portable bundle, not the <10 MB pitch. */
export function nativeAsset(assets: ClassifiedAsset[], os: Os, arch: Arch): ClassifiedAsset | null {
  const match = preferredAsset(assets, os, arch);
  if (match && match.format !== "appimage") return match;
  return assetsFor(assets, os, arch).find((asset) => asset.format !== "appimage") ?? match;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

type CacheShape = { savedAt: number; release: ReleaseInfo };

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CacheShape;
      if (Date.now() - cached.savedAt < CACHE_MS) return cached.release;
    }
  } catch {
    /* ignore quota / private mode */
  }

  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub releases failed (${response.status})`);
  }

  const release = parseRelease((await response.json()) as GithubRelease);

  try {
    const payload: CacheShape = { savedAt: Date.now(), release };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }

  return release;
}

export const FALLBACK_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
