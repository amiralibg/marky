import { useEffect, useMemo, useRef, useState } from "react";
import { archLabel, osLabel, type DetectedPlatform } from "../lib/platform";
import { useReveal } from "../lib/motion";
import {
  FALLBACK_RELEASE_URL,
  assetsFor,
  formatBytes,
  preferredAsset,
  type Arch,
  type Os,
  type PackageFormat,
  type ReleaseInfo,
} from "../lib/releases";

const PLATFORMS: Os[] = ["macos", "windows", "linux"];
const ARCHES: Arch[] = ["arm64", "amd64"];

const FORMAT_LABEL: Record<PackageFormat, string> = {
  dmg: "Disk image (.dmg)",
  exe: "Installer (.exe)",
  msi: "Windows package (.msi)",
  appimage: "AppImage (portable, larger)",
  deb: "Debian / Ubuntu (.deb)",
  rpm: "Fedora / RHEL (.rpm)",
};

type Props = {
  release: ReleaseInfo | null;
  platform: DetectedPlatform;
};

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.3c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.3c.6-.9 1.1-1.9 1.4-2.9-3.7-1.4-3.7-5.5-3.7-5.7Zm-3.5-6.5c.6-.8 1.1-1.9.9-3-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4Z" />
    </svg>
  );
}

function WindowsMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.2 10.4 4.2v7.1H3V5.2Zm8.2-1.2L21 2.5v8.8h-9.8V4Zm0 8.8H21v8.8l-9.8-1.4V12.8ZM3 12.8h7.4v7.1L3 18.8v-6Z" />
    </svg>
  );
}

function LinuxMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.2 2.5c.8 0 1.8.9 2.2 2.4.3 1 .2 2.1-.2 2.9.8.4 1.6 1.4 2 2.6.5 1.6.3 3.2-.6 4.1.7.3 1.4.9 1.8 1.8.6 1.3.4 2.8-.6 3.4-.4.3-.9.3-1.3.2.2 1.2.1 2.6-.6 3.4-.8.9-2.1.9-3 .2-.7.6-1.8.8-2.7.2-.8-.5-1.1-1.5-1.1-2.5-.6.2-1.3 0-1.7-.5-.7-.8-.6-2.2.1-3.4.5-.8 1.2-1.4 2-1.7-.8-1-1-2.6-.4-4.1.4-1.2 1.3-2.2 2.2-2.6-.3-.8-.4-1.8 0-2.8.4-1.3 1.4-2.2 2.3-2.2Z" />
    </svg>
  );
}

const ICONS = {
  macos: AppleMark,
  windows: WindowsMark,
  linux: LinuxMark,
} as const;

export default function Download({ release, platform }: Props) {
  const [os, setOs] = useState<Os>(platform.os);
  const [arch, setArch] = useState<Arch>(platform.arch);
  const touched = useRef(false);
  const copyRef = useReveal<HTMLDivElement>();
  const panelRef = useReveal<HTMLDivElement>();

  // refineArch() resolves after mount, so without this guard a visitor who
  // picks a platform in that window has their choice silently reset.
  useEffect(() => {
    if (touched.current) return;
    setOs(platform.os);
    setArch(platform.arch);
  }, [platform]);

  const primary = release ? preferredAsset(release.assets, os, arch) : null;
  const list = useMemo(() => {
    const all = release ? assetsFor(release.assets, os, arch) : [];
    return all.filter((asset) => asset.name !== primary?.name);
  }, [release, os, arch, primary]);

  return (
    <section id="download" className="mx-auto max-w-[1440px] px-6 py-20 md:px-10 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div ref={copyRef} className="reveal">
          <p className="kicker">Installers · under 10 MB</p>
          <h2 className="display mt-4 text-[clamp(36px,8vw,72px)]">Mac, Windows, Linux.</h2>
          <p className="mt-6 max-w-[28rem] font-display text-[18px] leading-[1.5] text-ink-soft">
            Native packages for ARM64 and AMD64. On Linux we lead with .deb and .rpm — the AppImage
            is a larger portable option underneath.
          </p>
          {release && (
            <p className="mt-6 font-mono text-[12px] text-ink-faint">
              Current {release.tag}
              {" · "}
              <a href={release.url} className="underline underline-offset-4 hover:text-ink">
                release notes
              </a>
            </p>
          )}
        </div>

        <div
          ref={panelRef}
          className="reveal rounded-md border border-line bg-surface p-5 md:p-8"
          style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
        >
          {/* Deliberately a group of toggles, not a tablist: these filter the
              panel below in place rather than swapping tabpanels, and a tablist
              without tabpanels or arrow-key roving is announced as broken. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Operating system">
            {PLATFORMS.map((id) => {
              const Icon = ICONS[id];
              const selected = os === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    touched.current = true;
                    setOs(id);
                    setArch(
                      id === platform.os ? platform.arch : id === "macos" ? "arm64" : "amd64"
                    );
                  }}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-[14px] font-medium transition-colors duration-200 sm:flex-none ${
                    selected
                      ? "bg-ink text-surface"
                      : "text-ink/70 hover:bg-ink/[0.04] hover:text-ink"
                  }`}
                >
                  <Icon />
                  {osLabel(id)}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex gap-2" role="group" aria-label="Architecture">
            {ARCHES.map((id) => {
              const selected = arch === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    touched.current = true;
                    setArch(id);
                  }}
                  className={`min-h-10 rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                    selected
                      ? "bg-ink text-surface"
                      : "border border-line text-ink/70 hover:text-ink"
                  }`}
                >
                  {archLabel(os, id)}
                </button>
              );
            })}
          </div>

          {primary ? (
            <a
              href={primary.url}
              className="btn-accent mt-8 flex min-h-14 flex-col items-start justify-center gap-1 rounded-sm px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="text-[15px] font-medium">
                Download {osLabel(os)} · {archLabel(os, arch)}
              </span>
              <span className="font-mono text-[12px] text-[#fffdf8]/80">
                {FORMAT_LABEL[primary.format]} · {formatBytes(primary.size)}
              </span>
            </a>
          ) : (
            <a
              href={FALLBACK_RELEASE_URL}
              className="mt-8 block rounded-sm border border-line px-5 py-4 text-[15px] font-medium hover:bg-ink/[0.03]"
            >
              Open GitHub releases
            </a>
          )}

          {list.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Also available
              </p>
              <ul className="mt-1 divide-y divide-line">
                {list.map((asset) => (
                  <li key={asset.name}>
                    <a
                      href={asset.url}
                      className="flex min-h-11 items-center justify-between gap-4 py-3 text-[14px] transition-colors duration-200 hover:text-ink"
                    >
                      <span className="truncate font-medium text-ink/90">
                        {FORMAT_LABEL[asset.format]}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-ink-faint">
                        {formatBytes(asset.size)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!primary && list.length === 0 && (
            <p className="mt-6 text-[14px] text-ink-faint">
              No matching files in the latest release yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
