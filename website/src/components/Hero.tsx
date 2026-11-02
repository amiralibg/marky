import { ArrowDownRight } from "lucide-react";
import { useState } from "react";
import type { DetectedPlatform } from "../lib/platform";
import { FALLBACK_RELEASE_URL, formatBytes, nativeAsset, type ReleaseInfo } from "../lib/releases";
import AppWindow, { type ReadingFont } from "./AppWindow";
import BuiltBy from "./BuiltBy";

type Props = {
  release: ReleaseInfo | null;
  platform: DetectedPlatform;
  loading: boolean;
  error: string | null;
};

const FONTS: Array<{ id: ReadingFont; label: string }> = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mixed", label: "Mixed" },
];

export default function Hero({ release, platform, loading, error }: Props) {
  const asset = release ? nativeAsset(release.assets, platform.os, platform.arch) : null;
  const href = asset?.url ?? FALLBACK_RELEASE_URL;
  const [font, setFont] = useState<ReadingFont>("sans");

  return (
    <section id="top" className="section-x pb-14 pt-12 md:pb-20 md:pt-20">
      <div className="enter">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <h1 className="display text-[clamp(52px,10.5vw,124px)] !leading-[0.98] text-ink">
            Notes that <span className="hero-bracket">[[</span>
            <span className="hero-link">link</span>
            <span className="hero-bracket">]]</span>
          </h1>

          <div className="lg:pb-2">
            <p className="lede max-w-[34rem]">
              Point Marky at a folder and start writing. Your notes stay plain Markdown on your own
              disk, wiki links work between them, and there is no account to make or server to sync
              with.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={href}
                className="btn-accent group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-sm px-4 py-2.5 text-[15px] font-medium"
              >
                <span>
                  {loading
                    ? "Checking GitHub…"
                    : asset
                      ? `Download for ${platform.label}`
                      : "Get the latest release"}
                </span>
                <ArrowDownRight
                  size={17}
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                />
              </a>
              <a
                href="#download"
                className="inline-flex min-h-11 items-center justify-center rounded-sm px-3 py-2.5 text-[14px] font-medium text-ink-soft transition-colors duration-150 hover:bg-ink/[0.05] hover:text-ink"
              >
                All platforms
              </a>
            </div>

            <p className="mt-3 font-mono text-[12px] leading-5 text-ink-faint">
              {error ? (
                <span>
                  Couldn’t reach GitHub just now.{" "}
                  <a href={FALLBACK_RELEASE_URL} className="underline">
                    Open the releases page
                  </a>
                  .
                </span>
              ) : (
                <span>
                  {release ? release.tag : "Latest"}
                  {asset
                    ? ` · ${platform.archLabel} · ${formatBytes(asset.size)}`
                    : ` · ${platform.label}`}
                  {" · under 10 MB"}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="enter mt-10 md:mt-14">
        <AppWindow readingFont={font} />
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] leading-6 text-ink-soft">
          This is a working copy. Switch views, tick a task, follow a link.
        </p>
        <div className="flex items-center gap-3">
          <span id="typeface-label" className="text-[13px] text-ink-faint">
            Typeface
          </span>
          <div className="seg" role="group" aria-labelledby="typeface-label">
            {FONTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={font === item.id}
                onClick={() => setFont(item.id)}
                className="seg-btn"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <BuiltBy className="mt-8" />
    </section>
  );
}
