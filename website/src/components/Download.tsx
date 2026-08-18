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
  // Tux from Simple Icons (CC0). The mark that used to be here was a
  // hand-drawn approximation that rendered as an unreadable blob at 18px.
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z" />
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
            Native packages for both ARM64 and AMD64. On Linux, .deb and .rpm come first; the
            AppImage is there if you want something portable, though it is a bigger download.
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
              The latest release does not have a build for this combination yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
