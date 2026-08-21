import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "../lib/markdown";
import { useReveal } from "../lib/motion";
import PageIntro from "../components/PageIntro";
import {
  CHANNEL_LABEL,
  fetchLiveReleases,
  fetchSnapshot,
  formatReleaseDate,
  type ChangelogEntry,
  type Channel,
} from "../lib/changelog";
import { FALLBACK_RELEASE_URL, GITHUB_REPO_URL } from "../lib/releases";
import { Link, useInitialHashScroll } from "../lib/router";

type Filter = "all" | Channel;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "app", label: CHANNEL_LABEL.app },
  { id: "mcp", label: CHANNEL_LABEL.mcp },
];

/**
 * Snapshot first so the list is there on the first frame, then the live API,
 * which carries anything released since the last deploy. A failed live fetch is
 * silent whenever the snapshot already rendered — there is nothing for a
 * visitor to do about GitHub's rate limit, and the page is not wrong, only a
 * deploy behind.
 */
function useChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    let settled = false;

    fetchSnapshot(controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted || !snapshot.length) return;
        settled = true;
        setEntries(snapshot);
        setState("ready");
      })
      .catch(() => {
        /* the live fetch below is the real source; this is only a head start */
      })
      .finally(() =>
        fetchLiveReleases(controller.signal)
          .then((live) => {
            if (controller.signal.aborted || !live.length) return;
            settled = true;
            setEntries(live);
            setState("ready");
          })
          .catch(() => {
            if (!controller.signal.aborted && !settled) setState("error");
          })
      );

    return () => controller.abort();
  }, []);

  return { entries, state };
}

/** Lights the version in the rail that the reader is level with. */
function useActiveTag(tags: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = tags.join("|");

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    if (!ids.length) return;

    const io = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Only the band just below the sticky header counts as "here", so the
      // rail follows the entry being read rather than the tallest one on screen.
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 }
    );

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) io.observe(element);
    }
    return () => io.disconnect();
  }, [key]);

  return active ?? tags[0] ?? null;
}

function Pill({ children, tone = "quiet" }: { children: string; tone?: "quiet" | "accent" }) {
  return (
    <span
      className={`rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${
        tone === "accent" ? "bg-accent-dim text-accent-text" : "border border-line text-ink-faint"
      }`}
    >
      {children}
    </span>
  );
}

/** Roughly the width of the three filter labels, so the row holds its place. */
const SKELETON_CHIPS = ["w-[104px]", "w-[78px]", "w-[106px]"];

/** One muted bar of the placeholder. Widths are passed in so the fake text has
 *  the ragged right edge real paragraphs do. */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-sm bg-ink/[0.07] ${className}`} />;
}

function SkeletonGroup({ lines }: { lines: string[] }) {
  return (
    <div className="mt-7 space-y-3">
      <Bar className="h-2.5 w-24" />
      {lines.map((width, index) => (
        <Bar key={index} className={`h-3.5 ${width}`} />
      ))}
    </div>
  );
}

// Three cards of unequal length, which is roughly what a release note looks
// like and enough height to keep the footer off the screen while loading.
const SKELETON_CARDS: string[][][] = [
  [
    ["w-full", "w-11/12", "w-3/4"],
    ["w-full", "w-10/12", "w-full", "w-2/3"],
  ],
  [
    ["w-11/12", "w-full", "w-1/2"],
    ["w-full", "w-9/12"],
  ],
  [
    ["w-full", "w-3/4"],
    ["w-10/12", "w-full", "w-7/12"],
  ],
];

/**
 * Mirrors the loaded layout — same grid, same rail, same card padding — so the
 * page is close to its real height before the releases arrive. Without it the
 * page was one line tall while loading, which put the footer under the heading
 * and then threw it a few thousand pixels down the moment the notes rendered.
 */
function ChangelogSkeleton() {
  return (
    <div
      className="mt-12 grid animate-pulse gap-10 md:mt-16 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14"
      aria-hidden
    >
      <div className="hidden lg:block">
        <div className="space-y-1">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="px-3 py-2">
              <Bar className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        {SKELETON_CARDS.map((groups, card) => (
          <div key={card} className="paper-surface p-6 md:p-8">
            <div className="flex items-center gap-3 border-b border-line pb-5">
              <Bar className="h-7 w-20" />
              <Bar className="ml-auto h-3 w-28" />
            </div>
            <div className="pb-1">
              {groups.map((lines, group) => (
                <SkeletonGroup key={group} lines={lines} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Entry({ entry, latest }: { entry: ChangelogEntry; latest: boolean }) {
  const ref = useReveal<HTMLElement>({ threshold: 0.04 });

  return (
    <article
      id={entry.tag}
      ref={ref}
      className="reveal paper-surface scroll-mt-24 p-6 md:p-8"
      aria-labelledby={`${entry.tag}-heading`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-5">
        <h2 id={`${entry.tag}-heading`} className="font-display text-[28px] tracking-[-0.03em]">
          <Link
            to={`/changelog#${entry.tag}`}
            className="hover:text-accent-text"
            aria-label={`Link to version ${entry.version}`}
          >
            {entry.version}
          </Link>
        </h2>
        {latest && <Pill tone="accent">Latest</Pill>}
        {entry.channel === "mcp" && <Pill>{CHANNEL_LABEL.mcp}</Pill>}
        {entry.prerelease && <Pill>Pre-release</Pill>}
        <time
          dateTime={entry.date ?? undefined}
          className="ml-auto font-mono text-[12px] text-ink-faint"
        >
          {formatReleaseDate(entry.date)}
        </time>
      </header>

      <div className="break-words pt-5">
        {entry.body ? (
          <Markdown source={entry.body} />
        ) : (
          <p className="text-[15px] text-ink-soft">No notes were written for this release.</p>
        )}
      </div>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ink-faint hover:text-ink"
        >
          Release on GitHub
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </a>
        {latest && entry.channel === "app" && (
          <Link to="/#download" className="text-accent-text hover:underline">
            Download {entry.version}
          </Link>
        )}
      </footer>
    </article>
  );
}

export default function Changelog() {
  const { entries, state } = useChangelog();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.channel === filter)),
    [entries, filter]
  );

  const latestTag = useMemo(
    () => entries.find((entry) => entry.channel === "app" && !entry.prerelease)?.tag ?? null,
    [entries]
  );

  const hasMcp = entries.some((entry) => entry.channel === "mcp");
  const activeTag = useActiveTag(visible.map((entry) => entry.tag));
  useInitialHashScroll(entries.length > 0);

  return (
    <main>
      <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
        <PageIntro
          kicker="Changelog"
          title="Every release, in order."
          lede={
            <>
              What changed in each version, newest first — read straight from the GitHub releases,
              so this page is never a version behind the download button.
            </>
          }
          aside={
            // The filter row only exists once the releases have been counted,
            // so hold its height while they load rather than nudging the whole
            // page down when it appears.
            state === "loading" ? (
              <div className="mt-5 flex animate-pulse flex-wrap gap-2" aria-hidden>
                {SKELETON_CHIPS.map((width) => (
                  <div key={width} className={`h-[34px] rounded-pill bg-ink/[0.07] ${width}`} />
                ))}
              </div>
            ) : hasMcp ? (
              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter releases">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    aria-pressed={filter === option.id}
                    className={`rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                      filter === option.id
                        ? "border-transparent bg-ink text-canvas"
                        : "border-line text-ink-soft hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null
          }
        />

        {state === "loading" && (
          <>
            <p className="sr-only" role="status">
              Fetching releases…
            </p>
            <ChangelogSkeleton />
          </>
        )}

        {state === "error" && (
          <div className="paper-surface mt-16 max-w-[34rem] p-6">
            <p className="text-[15px] leading-[1.7] text-ink-soft">
              The releases could not be loaded — GitHub&rsquo;s API limits anonymous requests to 60
              an hour, and this page asks for the full list. Every version is on{" "}
              <a
                href={`${GITHUB_REPO_URL}/releases`}
                target="_blank"
                rel="noreferrer"
                className="text-accent-text underline underline-offset-2"
              >
                the releases page
              </a>{" "}
              in the meantime.
            </p>
          </div>
        )}

        {state === "ready" && (
          <div className="mt-12 grid gap-10 md:mt-16 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14">
            {/* Hidden below lg, where a sticky rail would eat a third of the
                screen and the list is a short scroll anyway. */}
            <nav className="hidden lg:block" aria-label="Versions">
              <ol className="sticky top-24 max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto pr-2">
                {visible.map((entry) => (
                  <li key={entry.tag}>
                    <Link
                      to={`/changelog#${entry.tag}`}
                      aria-current={activeTag === entry.tag ? "location" : undefined}
                      className={`flex items-baseline gap-2 rounded-sm px-3 py-2 font-mono text-[12px] transition-colors duration-200 ${
                        activeTag === entry.tag
                          ? "bg-ink/[0.06] text-ink"
                          : "text-ink-faint hover:text-ink"
                      }`}
                    >
                      <span>{entry.version}</span>
                      {entry.channel === "mcp" && (
                        <span className="text-[10px] uppercase tracking-[0.1em]">MCP</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="min-w-0 space-y-6">
              {visible.map((entry) => (
                <Entry key={entry.tag} entry={entry} latest={entry.tag === latestTag} />
              ))}

              <p className="pt-4 text-[13px] text-ink-faint">
                Older builds and their installers stay on{" "}
                <a
                  href={FALLBACK_RELEASE_URL.replace(/\/latest$/, "")}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  GitHub releases
                </a>
                .
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
