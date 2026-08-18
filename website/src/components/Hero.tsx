import { ArrowDownRight } from "lucide-react";
import type { DetectedPlatform } from "../lib/platform";
import { FALLBACK_RELEASE_URL, formatBytes, nativeAsset, type ReleaseInfo } from "../lib/releases";
import AppWindow from "./AppWindow";
import BuiltBy from "./BuiltBy";

type Props = {
  release: ReleaseInfo | null;
  platform: DetectedPlatform;
  loading: boolean;
  error: string | null;
};

export default function Hero({ release, platform, loading, error }: Props) {
  const asset = release ? nativeAsset(release.assets, platform.os, platform.arch) : null;
  const href = asset?.url ?? FALLBACK_RELEASE_URL;

  return (
    <section
      id="top"
      className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-16 pt-12 md:px-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12 lg:pb-24 lg:pt-20"
    >
      <div className="enter flex max-w-[640px] flex-col justify-center">
        <p className="kicker">Offline-first · under 10 MB</p>
        <h1 className="display mt-5 text-[clamp(48px,10vw,96px)] text-ink">
          Notes that{" "}
          <em className="not-italic">
            <span className="pill-draw relative inline-block rounded-pill bg-marigold px-4 py-1">
              link
            </span>
          </em>
          .
        </h1>
        <p className="mt-8 max-w-[34rem] font-display text-[18px] leading-[1.45] text-ink-soft sm:text-[20px]">
          Point Marky at a folder and start writing. Your notes stay plain Markdown on your own
          disk, wiki links work between them, and there is no account to make or server to sync
          with.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={href}
            className="btn-accent group inline-flex min-h-12 items-center justify-center gap-3 rounded-sm px-5 py-3 text-[15px] font-medium"
          >
            <span>
              {loading
                ? "Checking GitHub…"
                : asset
                  ? `Download for ${platform.label}`
                  : "Get the latest release"}
            </span>
            <ArrowDownRight
              size={18}
              className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
            />
          </a>
          <a
            href="#download"
            className="inline-flex min-h-12 items-center justify-center rounded-sm px-4 py-3 text-[14px] font-medium text-ink/90 underline-offset-4 hover:underline"
          >
            All platforms
          </a>
        </div>

        <p className="mt-4 font-mono text-[12px] leading-5 text-ink-faint">
          {error && (
            <span>
              Couldn’t reach GitHub just now.{" "}
              <a href={FALLBACK_RELEASE_URL} className="underline">
                Open the releases page
              </a>
              .
            </span>
          )}
          {!error && (
            <span>
              {release ? release.tag : "Latest"}
              {asset
                ? ` · ${platform.archLabel} · ${formatBytes(asset.size)}`
                : ` · ${platform.label}`}
              {" · under 10 MB"}
            </span>
          )}
        </p>

        <BuiltBy className="mt-8" />
      </div>

      <AppWindow />
    </section>
  );
}
