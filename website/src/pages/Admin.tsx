import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, Check, Copy, Download, RotateCw, Search, Trash2 } from "lucide-react";
import Sheet from "../components/Sheet";
import { FIELD_CLASS, PasswordField } from "../components/Field";
import { usePlainCanvas } from "../lib/canvas";
import {
  ApiError,
  api,
  STATUS_LABEL,
  type AdminFeedbackPost,
  type AdminStats,
  type DownloadStats,
  type OsKey,
  type PostStatus,
  type ReleaseDownloads,
} from "../lib/feedback";

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as PostStatus[];

/* Steps of the same ink rather than five hues. The accent stays reserved for
   the one filled action on the page. */
const STATUS_SHADE: Record<PostStatus, string> = {
  open: "bg-ink/[0.18]",
  planned: "bg-ink/[0.38]",
  "in-progress": "bg-ink/[0.62]",
  done: "bg-ink",
  closed: "bg-ink/[0.08]",
};

const OS: Array<{ id: OsKey; label: string; shade: string }> = [
  { id: "macos", label: "macOS", shade: "bg-ink" },
  { id: "windows", label: "Windows", shade: "bg-ink/[0.55]" },
  { id: "linux", label: "Linux", shade: "bg-ink/[0.25]" },
];

type Metric = "posts" | "votes";

const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "posts", label: "Posts" },
  { id: "votes", label: "Votes" },
];

const num = (value: number) => value.toLocaleString("en-GB");

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * A band of the dashboard: mono label, hairline rule, content. Bands rather
 * than cards, because a tool with nine cards on it reads as nine unrelated
 * widgets instead of one page.
 */
function Band({
  label,
  aside,
  children,
  className = "",
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-14 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="kicker">{label}</h2>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** One number in a stat grid: display-size serif over a mono caption. */
function Stat({
  value,
  caption,
  note,
}: {
  value: number | string;
  caption: string;
  note?: string;
}) {
  return (
    <div className="-ml-px -mt-px flex min-w-0 flex-col gap-1 border-l border-t border-line px-5 py-5 md:px-7">
      <span className="font-display text-[36px] leading-none tracking-[-0.03em] tabular-nums md:text-[44px]">
        {value}
      </span>
      <span className="kicker">{caption}</span>
      {/* Reserved whether or not there is a note, so the cells stay level. */}
      <span className="min-h-[1rem] font-mono text-[11px] text-ink-faint">{note}</span>
    </div>
  );
}

/** Label, track, count. The shape people expect a download table to have. */
function BarRow({
  label,
  count,
  max,
  total,
  shade = "bg-ink/70",
  title,
}: {
  label: string;
  count: number;
  max: number;
  total: number;
  shade?: string;
  title?: string;
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-x-4">
      <span className="truncate font-mono text-[12px] text-ink-soft" title={title ?? label}>
        {label}
      </span>
      <span aria-hidden className="h-2 rounded-pill bg-ink/[0.06]">
        <span
          className={`block h-full rounded-pill ${shade}`}
          style={{ width: `${max > 0 ? Math.max(count > 0 ? 2 : 0, (count / max) * 100) : 0}%` }}
        />
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums text-ink">
        {num(count)}
        <span className="ml-2 hidden text-ink-faint sm:inline">{share}%</span>
      </span>
    </li>
  );
}

/** The last 14 days of activity, as bare bars on a hairline floor. */
function ActivityChart({ daily, metric }: { daily: AdminStats["daily"]; metric: Metric }) {
  const values = daily.map((day) => day[metric]);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const noun = metric === "posts" ? "post" : "vote";

  return (
    <div>
      {/* Bare bars with no stated ceiling are a shape, not a measurement. */}
      <div className="mb-2 flex items-baseline justify-between font-mono text-[11px] text-ink-faint">
        <span>peak {max}</span>
        <span>
          {total} in 14 days
        </span>
      </div>
      <div className="flex h-24 items-end gap-1.5 border-b border-line pb-px">
        {daily.map((day) => {
          const value = day[metric];
          return (
            <div
              key={day.date}
              title={`${dayLabel(day.date)}: ${value} ${noun}${value === 1 ? "" : "s"}`}
              className={`min-w-2 flex-1 rounded-t-[3px] transition-colors ${
                value > 0 ? "bg-ink/70 hover:bg-ink" : "bg-line"
              }`}
              style={{ height: `${Math.max(value > 0 ? 8 : 3, (value / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-ink-faint">
        <span>{dayLabel(daily[0].date)}</span>
        <span>{dayLabel(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  );
}

/** A single horizontal band split into labelled segments. */
function SplitBar({
  segments,
}: {
  segments: Array<{ label: string; count: number; shade?: string }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div>
      <div className="flex h-3 gap-px overflow-hidden rounded-pill bg-line">
        {total > 0 &&
          segments.map((segment) =>
            segment.count === 0 ? null : (
              <div
                key={segment.label}
                title={`${segment.label}: ${num(segment.count)}`}
                style={{ flexGrow: segment.count }}
                className={segment.shade ?? "bg-ink/50"}
              />
            )
          )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-faint"
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${segment.shade ?? "bg-ink/50"}`} />
            {segment.label}
            <span className="text-ink-soft">
              {num(segment.count)}
              {total > 0 && (
                <span className="text-ink-faint">
                  {" "}
                  · {Math.round((segment.count / total) * 100)}%
                </span>
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Installs, which is the number worth putting at the top of the page. One
 * oversized figure, the platform split beside it, then every recent version.
 */
function Downloads({ stats }: { stats: DownloadStats }) {
  const releaseMax = Math.max(1, ...stats.perRelease.map((row) => row.total));
  const share = (row: ReleaseDownloads) =>
    OS.filter((os) => row.byOs[os.id] > 0)
      .map((os) => `${os.label} ${num(row.byOs[os.id])}`)
      .join(" · ");

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
      <div>
        <p className="font-display text-[clamp(56px,10vw,88px)] leading-[0.86] tracking-[-0.045em] tabular-nums">
          {num(stats.total)}
        </p>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink-soft">
          installers downloaded across {stats.releases}{" "}
          {stats.releases === 1 ? "release" : "releases"}.
        </p>

        <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6">
          <div>
            <dt className="kicker">Latest</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {stats.latest ? stats.latest.tag : "none yet"}
            </dd>
            <dd className="font-mono text-[11px] text-ink-faint">
              {stats.latest ? `${num(stats.latest.count)} downloads` : " "}
            </dd>
          </div>
          <div>
            <dt className="kicker">Shipped</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">
              {stats.daysSinceLatest === null
                ? "—"
                : stats.daysSinceLatest === 0
                  ? "today"
                  : `${stats.daysSinceLatest}d ago`}
            </dd>
            <dd className="font-mono text-[11px] text-ink-faint">
              {stats.latest?.publishedAt ? shortDate(stats.latest.publishedAt) : " "}
            </dd>
          </div>
          <div>
            <dt className="kicker">Per release</dt>
            <dd className="mt-1.5 font-mono text-[13px] tabular-nums text-ink">
              {num(stats.perReleaseAverage)}
            </dd>
            <dd className="font-mono text-[11px] text-ink-faint">average</dd>
          </div>
          <div>
            <dt className="kicker">Read at</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-ink">{clockTime(stats.fetchedAt)}</dd>
            <dd className="font-mono text-[11px] text-ink-faint">cached 30 min</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-9">
        <div>
          <h3 className="kicker">By platform</h3>
          <ul className="mt-4 space-y-2.5">
            {OS.map((os) => (
              <BarRow
                key={os.id}
                label={os.label}
                count={stats.byOs[os.id]}
                max={Math.max(1, ...OS.map((other) => stats.byOs[other.id]))}
                total={stats.total}
                shade={os.shade}
              />
            ))}
          </ul>
        </div>

        {stats.perRelease.length > 0 && (
          <div>
            <h3 className="kicker">By version</h3>
            <ul className="mt-4 space-y-2.5">
              {stats.perRelease.map((row) => (
                <BarRow
                  key={row.tag}
                  label={row.tag}
                  title={share(row) || row.tag}
                  count={row.total}
                  max={releaseMax}
                  total={stats.total}
                />
              ))}
            </ul>
            <p className="mt-5 font-mono text-[11px] leading-[1.6] text-ink-faint">
              .dmg, .exe, .msi, .AppImage, .deb and .rpm only. Update manifests and signatures are
              left out, or the auto-updater would show up as installs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sign-in is its own screen. Nothing behind it is browsable, so the page gives
 * half of itself to an inked panel and puts the form on the other half rather
 * than stranding a small card in the middle of an empty canvas.
 */
function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await api.admin.login(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Wrong email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Surface inversion carries the hierarchy here, so nothing on this
          screen needs a second colour to look important. */}
      <div className="relative flex flex-col justify-center bg-ink px-6 py-14 text-canvas md:px-12">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-canvas/55">Marky</p>
        <h1 className="mt-4 font-display text-[clamp(44px,7vw,76px)] leading-[0.9] tracking-[-0.04em]">
          Admin
        </h1>
        <p className="mt-5 max-w-[26rem] text-[16px] leading-[1.6] text-canvas/70">
          Behind this are the download counts, the feedback board, and the delete button. Only I
          have the password.
        </p>
        {/* Pinned rather than in the flow, so the block above stays centred on
            the panel however tall the viewport is. */}
        <p className="mt-10 font-mono text-[11px] leading-[1.7] text-canvas/45 lg:absolute lg:inset-x-12 lg:bottom-10 lg:mt-0">
          Sessions last 12 hours and are kept in this tab only.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-14 md:px-12">
        <form onSubmit={submit} className="w-full max-w-[23rem]">
          <h2 className="font-display text-[26px] leading-none tracking-[-0.03em]">Sign in</h2>

          <div className="mt-7 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Email</span>
              <input
                name="email"
                type="email"
                required
                className={FIELD_CLASS}
                autoComplete="email"
                inputMode="email"
                autoFocus
              />
            </label>
            <PasswordField
              label="Password"
              name="password"
              required
              autoComplete="current-password"
            />
            {/* Reserved, so the button does not jump when a wrong password
                pushes a line of red text in above it. */}
            <p
              role="alert"
              className="min-h-[1.25rem] text-[13px] leading-[1.25rem] text-red-600 dark:text-red-400"
            >
              {error}
            </p>
            <button
              type="submit"
              disabled={busy}
              className="btn-accent inline-flex h-11 w-full items-center justify-center rounded-sm text-[14px] font-medium transition-colors disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function StatusSelect({
  post,
  onChange,
}: {
  post: AdminFeedbackPost;
  onChange: (id: string, status: PostStatus) => void;
}) {
  return (
    <select
      value={post.status}
      onChange={(event) => onChange(post.id, event.target.value as PostStatus)}
      aria-label={`Status of ${post.title}`}
      className="w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent sm:w-auto"
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}

function DeleteButton({ post, onDelete }: { post: AdminFeedbackPost; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label={`Delete ${post.title}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] text-red-600 transition-colors hover:bg-red-600/10 dark:text-red-400"
    >
      <Trash2 size={13} aria-hidden />
      Delete
    </button>
  );
}

function Meta({ post }: { post: AdminFeedbackPost }) {
  return (
    <p className="mt-1.5 break-words font-mono text-[11px] text-ink-faint">
      {post.authorName} · {post.authorEmail} · {post.type === "bug" ? "Bug" : "Feature"} ·{" "}
      {shortDate(post.createdAt)} · {post.voteCount} {post.voteCount === 1 ? "vote" : "votes"}
    </p>
  );
}

/**
 * The visible posts as a Markdown digest, shaped for handing to an agent: one
 * block per post with the metadata it needs up front and the body verbatim.
 */
function postsToMarkdown(list: AdminFeedbackPost[]) {
  const stamp = new Date().toLocaleString("en-GB");
  const items = list.map((post) =>
    [
      `## ${post.title}`,
      "",
      `- Type: ${post.type === "bug" ? "Bug" : "Feature"}`,
      `- Status: ${STATUS_LABEL[post.status]}`,
      `- Votes: ${post.voteCount}`,
      `- From: ${post.authorName} <${post.authorEmail}>`,
      `- Date: ${shortDate(post.createdAt)}`,
      `- Id: ${post.id}`,
      "",
      post.body.trim(),
    ].join("\n")
  );
  return [
    `# Marky feedback export`,
    "",
    `${list.length} ${list.length === 1 ? "post" : "posts"}, generated ${stamp}.`,
    "",
    items.join("\n\n---\n\n"),
  ].join("\n");
}

export default function Admin() {
  usePlainCanvas();

  const [signedIn, setSignedIn] = useState(() => api.admin.hasToken());
  const [posts, setPosts] = useState<AdminFeedbackPost[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<Metric>("posts");
  const [refreshKey, setRefreshKey] = useState(0);
  // The post awaiting a delete confirmation, if any.
  const [pendingDelete, setPendingDelete] = useState<AdminFeedbackPost | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setState("loading");
    Promise.all([api.admin.listPosts(), api.admin.stats().catch(() => null)])
      .then(([nextPosts, nextStats]) => {
        if (!alive) return;
        setPosts(nextPosts);
        // Analytics are additive. The table must survive a stats hiccup.
        setStats(nextStats);
        setState("ready");
      })
      .catch((err) => {
        if (!alive) return;
        // A 401 here means the 12h admin session ran out mid-review.
        if (err instanceof ApiError && err.status === 401) {
          api.admin.clearToken();
          setSignedIn(false);
        }
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [signedIn, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (statusFilter !== "all" && post.status !== statusFilter) return false;
      if (!needle) return true;
      return [post.title, post.body, post.authorName, post.authorEmail].some((field) =>
        field.toLowerCase().includes(needle)
      );
    });
  }, [posts, statusFilter, query]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  /** A 401 from any moderation call means the session lapsed; bail to login. */
  function handleExpiry(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      api.admin.clearToken();
      setSignedIn(false);
      return true;
    }
    return false;
  }

  function refreshStats() {
    api.admin
      .stats()
      .then(setStats)
      .catch(() => {});
  }

  async function changeStatus(id: string, status: PostStatus) {
    const previous = posts.find((post) => post.id === id)?.status;
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, status } : post)));
    try {
      await api.admin.setStatus(id, status);
      flash(`Marked ${STATUS_LABEL[status].toLowerCase()}.`);
      refreshStats();
    } catch (err) {
      if (handleExpiry(err)) return;
      // The select showed the new value optimistically. Put it back, so the row
      // does not claim a status the server never accepted.
      if (previous) {
        setPosts((current) =>
          current.map((post) => (post.id === id ? { ...post, status: previous } : post))
        );
      }
      flash("Could not save that status.");
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setPosts((current) => current.filter((post) => post.id !== target.id));
    try {
      await api.admin.deletePost(target.id);
      flash("Deleted.");
      refreshStats();
    } catch (err) {
      if (handleExpiry(err)) return;
      setPosts((current) =>
        [target, ...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
      flash("Could not delete that post.");
    }
  }

  // Transient on-button confirmations. The header notice is easy to miss, so
  // the button itself says what just happened.
  const [copiedFlash, setCopiedFlash] = useState<"done" | "failed" | null>(null);
  const [exportedFlash, setExportedFlash] = useState(false);

  async function copyVisible() {
    try {
      await navigator.clipboard.writeText(postsToMarkdown(visible));
      setCopiedFlash("done");
      flash(`Copied ${visible.length} ${visible.length === 1 ? "post" : "posts"} as Markdown.`);
    } catch {
      setCopiedFlash("failed");
      flash("Could not reach the clipboard.");
    }
    window.setTimeout(() => setCopiedFlash(null), 2000);
  }

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), posts: visible }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marky-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportedFlash(true);
    flash(`Exported ${visible.length} ${visible.length === 1 ? "post" : "posts"}.`);
    window.setTimeout(() => setExportedFlash(false), 2000);
  }

  if (!signedIn) return <AdminLogin onSignedIn={() => setSignedIn(true)} />;

  const openCount = posts.filter((post) => post.status === "open").length;
  const downloads = stats?.downloads ?? null;

  return (
    <main>
      <section className="mx-auto max-w-[1280px] px-6 py-12 md:px-10 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="kicker">Marky admin</p>
            <h1 className="mt-2.5 font-display text-[clamp(30px,4vw,42px)] leading-none tracking-[-0.035em]">
              Dashboard
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Reserved width, so a status change does not shove the buttons. */}
            <p role="status" className="mr-1 hidden text-[13px] text-accent-text sm:block">
              {notice}
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={state === "loading"}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink disabled:opacity-50"
            >
              <RotateCw
                size={13}
                aria-hidden
                className={state === "loading" ? "animate-spin" : undefined}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                api.admin.clearToken();
                setSignedIn(false);
              }}
              className="inline-flex min-h-9 items-center rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>

        {state === "loading" && (
          <div className="mt-14 space-y-4" aria-hidden>
            <div className="h-28 animate-pulse rounded-sm bg-ink/[0.05]" />
            <div className="h-56 animate-pulse rounded-sm bg-ink/[0.05]" />
          </div>
        )}

        {state === "error" && (
          <div className="paper-surface mt-14 max-w-[34rem] p-6">
            <p className="text-[15px] leading-[1.7] text-ink-soft">Could not load the board.</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line px-4 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.04]"
            >
              <RotateCw size={13} aria-hidden />
              Try again
            </button>
          </div>
        )}

        {state === "ready" && (
          <>
            {/* Installs lead the page. They are the only number here that says
                anything about the app rather than about the board. */}
            <Band label="Downloads">
              {downloads ? (
                <Downloads stats={downloads} />
              ) : (
                <p className="text-[15px] leading-[1.7] text-ink-soft">
                  GitHub did not answer. The counts come back on the next refresh.
                </p>
              )}
            </Band>

            <Band label="The board">
              <div className="grid grid-cols-2 overflow-hidden sm:grid-cols-4">
                <Stat
                  value={stats?.totals.posts ?? "—"}
                  caption="Posts"
                  note={openCount > 0 ? `${openCount} awaiting triage` : "all triaged"}
                />
                <Stat value={stats?.totals.votes ?? "—"} caption="Votes" />
                <Stat value={stats?.totals.users ?? "—"} caption="Members" />
                <Stat
                  value={stats ? (stats.byStatus.done ?? 0) : "—"}
                  caption="Shipped"
                  note={stats ? `${stats.byStatus["in-progress"] ?? 0} in progress` : undefined}
                />
              </div>
            </Band>

            {stats && (
              <>
                <Band
                  label="Last 14 days"
                  aside={
                    <div
                      role="group"
                      aria-label="Chart metric"
                      className="flex gap-1 rounded-pill border border-line p-1"
                    >
                      {METRICS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={metric === option.id}
                          onClick={() => setMetric(option.id)}
                          className={`rounded-pill px-3 py-1 text-[12px] font-medium transition-colors duration-200 ${
                            metric === option.id
                              ? "bg-ink text-canvas"
                              : "text-ink-soft hover:text-ink"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <ActivityChart daily={stats.daily} metric={metric} />
                </Band>

                <Band label="Pipeline">
                  <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                    <div className="space-y-8">
                      <div>
                        <h3 className="kicker mb-3">By status</h3>
                        <SplitBar
                          segments={STATUS_OPTIONS.map((status) => ({
                            label: STATUS_LABEL[status],
                            count: stats.byStatus[status] ?? 0,
                            shade: STATUS_SHADE[status],
                          }))}
                        />
                      </div>
                      <div>
                        <h3 className="kicker mb-3">By kind</h3>
                        <SplitBar
                          segments={[
                            {
                              label: "Features",
                              count: stats.byType.feature ?? 0,
                              shade: "bg-ink/75",
                            },
                            { label: "Bugs", count: stats.byType.bug ?? 0, shade: "bg-ink/[0.25]" },
                          ]}
                        />
                      </div>
                    </div>

                    {stats.top.length > 0 && (
                      <div>
                        <h3 className="kicker">Most wanted</h3>
                        <ol className="mt-4 space-y-3">
                          {stats.top.map((post, index) => (
                            <li key={post.id} className="flex items-baseline gap-3">
                              <span className="w-5 shrink-0 text-right font-mono text-[12px] text-ink-faint">
                                {index + 1}
                              </span>
                              <span
                                className="min-w-0 flex-1 truncate text-[14px]"
                                title={post.title}
                              >
                                {post.title}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[12px] text-ink-soft">
                                <ArrowUp size={11} aria-hidden /> {post.voteCount}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </Band>
              </>
            )}

            <Band
              label="Moderation"
              aside={
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-ink-faint">
                    {visible.length} of {posts.length}
                  </span>
                  <button
                    type="button"
                    onClick={copyVisible}
                    disabled={visible.length === 0}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                      copiedFlash === "done"
                        ? "border-transparent bg-ink text-canvas"
                        : copiedFlash === "failed"
                          ? "border-transparent bg-red-600/10 text-red-600 dark:text-red-400"
                          : "border-line text-ink-faint hover:text-ink"
                    }`}
                  >
                    {copiedFlash === "done" ? (
                      <Check size={13} aria-hidden />
                    ) : (
                      <Copy size={13} aria-hidden />
                    )}
                    {copiedFlash === "done" ? "Copied" : copiedFlash === "failed" ? "Failed" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={exportJson}
                    disabled={visible.length === 0}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                      exportedFlash
                        ? "border-transparent bg-ink text-canvas"
                        : "border-line text-ink-faint hover:text-ink"
                    }`}
                  >
                    {exportedFlash ? (
                      <Check size={13} aria-hidden />
                    ) : (
                      <Download size={13} aria-hidden />
                    )}
                    {exportedFlash ? "Exported" : "Export"}
                  </button>
                </div>
              }
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div
                  role="group"
                  aria-label="Filter by status"
                  className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-10 md:px-10 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
                >
                  <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                    All
                  </FilterChip>
                  {STATUS_OPTIONS.map((status) => (
                    <FilterChip
                      key={status}
                      active={statusFilter === status}
                      onClick={() => setStatusFilter(status)}
                    >
                      {STATUS_LABEL[status]}
                    </FilterChip>
                  ))}
                </div>
                <label className="relative lg:ml-auto">
                  <span className="sr-only">Search feedback</span>
                  <Search
                    size={14}
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title, body, author"
                    className="w-full rounded-pill border border-line bg-surface py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent lg:w-64"
                  />
                </label>
              </div>

              {visible.length > 0 ? (
                <>
                  {/* Phones get stacked cards. A three-column table at 380px is
                      either a horizontal scroll or an unreadable squeeze. */}
                  <ul className="mt-5 space-y-3 lg:hidden">
                    {visible.map((post) => (
                      <li key={post.id} className="paper-surface p-4">
                        <p className="font-semibold leading-[1.35]">{post.title}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-ink-soft">
                          {post.body}
                        </p>
                        <Meta post={post} />
                        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                          <StatusSelect post={post} onChange={changeStatus} />
                          <div className="ml-auto">
                            <DeleteButton post={post} onDelete={() => setPendingDelete(post)} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="paper-surface mt-5 hidden overflow-hidden lg:block">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line bg-ink/[0.02] font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                          <th scope="col" className="px-6 py-3 font-normal">
                            Feedback
                          </th>
                          <th scope="col" className="px-4 py-3 font-normal">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 font-normal">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((post) => (
                          <tr
                            key={post.id}
                            className="border-b border-line align-top transition-colors last:border-b-0 hover:bg-ink/[0.02]"
                          >
                            <td className="max-w-[32rem] px-6 py-4">
                              <p className="font-semibold">{post.title}</p>
                              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-ink-soft">
                                {post.body}
                              </p>
                              <Meta post={post} />
                            </td>
                            <td className="px-4 py-4 align-middle">
                              <StatusSelect post={post} onChange={changeStatus} />
                            </td>
                            <td className="px-6 py-4 text-right align-middle">
                              <DeleteButton post={post} onDelete={() => setPendingDelete(post)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="mt-5 text-[15px] text-ink-soft">
                  {posts.length === 0 ? "No posts yet." : "Nothing matches that filter."}
                </p>
              )}
            </Band>
          </>
        )}

        {/* An in-page dialog rather than window.confirm, which freezes the whole
            tab and cannot be styled or dismissed with Escape. */}
        <Sheet
          open={pendingDelete !== null}
          onClose={() => setPendingDelete(null)}
          title="Delete this post?"
          description={
            pendingDelete
              ? `"${pendingDelete.title}" and its ${pendingDelete.voteCount} ${
                  pendingDelete.voteCount === 1 ? "vote" : "votes"
                } will be removed. This cannot be undone.`
              : undefined
          }
        >
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="inline-flex h-11 items-center justify-center rounded-sm border border-line px-4 text-[14px] font-medium text-ink-soft transition-colors hover:text-ink sm:h-10"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-sm bg-red-600 px-4 text-[14px] font-medium text-white transition-colors hover:bg-red-700 sm:h-10"
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          </div>
        </Sheet>
      </section>
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
        active
          ? "border-transparent bg-ink text-canvas"
          : "border-line text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
