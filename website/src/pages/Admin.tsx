import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Search } from "lucide-react";
import PageIntro from "../components/PageIntro";
import {
  ApiError,
  api,
  STATUS_LABEL,
  type AdminFeedbackPost,
  type AdminStats,
  type PostStatus,
} from "../lib/feedback";

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as PostStatus[];

/* Status segments read as steps of the same ink — hierarchy without new hues;
   the single accent stays reserved for actions. */
const STATUS_SHADE: Record<PostStatus, string> = {
  open: "bg-ink/[0.18]",
  planned: "bg-ink/[0.38]",
  "in-progress": "bg-ink/[0.62]",
  done: "bg-ink",
  closed: "bg-ink/[0.08]",
};

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

/** One number in the stat band: display-size serif over a mono caption. */
function Stat({ value, caption }: { value: number | string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-5 first:pl-0 md:px-7">
      <span className="font-display text-[44px] leading-none tracking-[-0.03em]">{value}</span>
      <span className="kicker">{caption}</span>
    </div>
  );
}

/** The last 14 days of posting, as bare bars on a hairline floor. */
function ActivityChart({ daily }: { daily: AdminStats["daily"] }) {
  const max = Math.max(1, ...daily.map((day) => day.posts));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5 border-b border-line pb-px">
        {daily.map((day) => (
          <div
            key={day.date}
            title={`${dayLabel(day.date)} — ${day.posts} post${day.posts === 1 ? "" : "s"}`}
            className={`min-w-2 flex-1 rounded-t-[3px] transition-colors ${
              day.posts > 0 ? "bg-ink/70 hover:bg-ink" : "bg-line"
            }`}
            style={{ height: `${Math.max(day.posts > 0 ? 8 : 3, (day.posts / max) * 100)}%` }}
          />
        ))}
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
                title={`${segment.label} — ${segment.count}`}
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
            <span className="text-ink-soft">{segment.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-sm border border-line bg-canvas px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="paper-surface mt-10 max-w-md space-y-3 p-6 md:p-8">
      <h2 className="font-display text-[22px] tracking-[-0.02em]">Admin sign-in</h2>
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className={inputClass}
        autoComplete="email"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className={inputClass}
        autoComplete="current-password"
      />
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="btn-accent inline-flex h-10 w-full items-center justify-center rounded-sm text-[14px] font-medium transition-colors disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** One moderation row: the pitch plus a status select and a delete button. */
function Row({
  post,
  onStatusChange,
  onDelete,
}: {
  post: AdminFeedbackPost;
  onStatusChange: (id: string, status: PostStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-line align-top transition-colors hover:bg-ink/[0.02]">
      <td className="max-w-[28rem] py-4 pr-4">
        <p className="font-semibold">{post.title}</p>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-ink-soft">
          {post.body}
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
          {post.authorName} · {post.authorEmail} · {post.type} · {shortDate(post.createdAt)}
        </p>
      </td>
      <td className="py-4 pr-4 align-middle">
        <select
          value={post.status}
          onChange={(event) => onStatusChange(post.id, event.target.value as PostStatus)}
          aria-label={`Status of ${post.title}`}
          className="rounded-sm border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:border-accent"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-4 text-right align-middle">
        <button
          type="button"
          onClick={() => onDelete(post.id)}
          aria-label={`Delete ${post.title}`}
          className="rounded-sm px-2 py-1 text-[13px] text-red-600 transition-colors hover:bg-red-600/10 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function Admin() {
  const [signedIn, setSignedIn] = useState(() => api.admin.hasToken());
  const [posts, setPosts] = useState<AdminFeedbackPost[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setState("loading");
    Promise.all([api.admin.listPosts(), api.admin.stats().catch(() => null)])
      .then(([nextPosts, nextStats]) => {
        if (!alive) return;
        setPosts(nextPosts);
        // Analytics are additive — the table must survive a stats hiccup.
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
  }, [signedIn]);

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

  async function changeStatus(id: string, status: PostStatus) {
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, status } : post)));
    try {
      await api.admin.setStatus(id, status);
      flash(`Marked ${STATUS_LABEL[status].toLowerCase()}.`);
      api.admin
        .stats()
        .then(setStats)
        .catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        api.admin.clearToken();
        setSignedIn(false);
        return;
      }
      flash("Could not save that status.");
    }
  }

  async function remove(id: string) {
    const target = posts.find((post) => post.id === id);
    if (!target || !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    setPosts((current) => current.filter((post) => post.id !== id));
    try {
      await api.admin.deletePost(id);
      api.admin
        .stats()
        .then(setStats)
        .catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        api.admin.clearToken();
        setSignedIn(false);
        return;
      }
      setPosts((current) =>
        [target, ...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
      flash("Could not delete that post.");
    }
  }

  if (!signedIn) {
    return (
      <main>
        <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
          <PageIntro
            kicker="Moderation"
            title="Feedback admin."
            lede="Triaging the board: set statuses, remove spam."
          />
          <AdminLogin onSignedIn={() => setSignedIn(true)} />
        </section>
      </main>
    );
  }

  const openCount = posts.filter((post) => post.status === "open").length;

  return (
    <main>
      <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
        <div className="flex items-start justify-between gap-6">
          <PageIntro
            kicker="Moderation"
            title="The board, at a glance."
            lede="Newest first. Status changes go live immediately."
          />
          <button
            type="button"
            onClick={() => {
              api.admin.clearToken();
              setSignedIn(false);
            }}
            className="mt-4 shrink-0 rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </div>

        {/* Stat band: one surface, divided by hairlines rather than carded off. */}
        <div className="paper-surface mt-10 grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>*:nth-child(odd)]:sm:border-l-0 max-sm:[&>*:nth-child(n+3)]:border-t">
          <Stat value={stats?.totals.posts ?? "—"} caption="Ideas" />
          <Stat value={stats?.totals.votes ?? "—"} caption="Votes" />
          <Stat value={stats?.totals.users ?? "—"} caption="Members" />
          <Stat value={stats ? openCount : "—"} caption="Awaiting triage" />
        </div>

        {state === "loading" && (
          <div className="mt-10 space-y-4" aria-hidden>
            <div className="h-24 animate-pulse rounded-sm bg-ink/[0.05]" />
            <div className="h-40 animate-pulse rounded-sm bg-ink/[0.05]" />
          </div>
        )}

        {state === "error" && signedIn && (
          <p className="mt-12 text-[15px] text-ink-soft">
            The board could not be loaded. Reload to retry.
          </p>
        )}

        {state === "ready" && (
          <>
            {notice && (
              <p role="status" className="mt-6 text-[14px] text-accent-text">
                {notice}
              </p>
            )}

            {stats && (
              <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
                <div>
                  <h2 className="kicker">Last 14 days</h2>
                  <div className="mt-4">
                    <ActivityChart daily={stats.daily} />
                  </div>

                  <h2 className="kicker mt-10">Features vs bugs</h2>
                  <div className="mt-4">
                    <SplitBar
                      segments={[
                        { label: "Features", count: stats.byType.feature ?? 0, shade: "bg-ink/75" },
                        { label: "Bugs", count: stats.byType.bug ?? 0, shade: "bg-ink/[0.25]" },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-10">
                  <div>
                    <h2 className="kicker">Pipeline</h2>
                    <div className="mt-4">
                      <SplitBar
                        segments={STATUS_OPTIONS.map((status) => ({
                          label: STATUS_LABEL[status],
                          count: stats.byStatus[status] ?? 0,
                          shade: STATUS_SHADE[status],
                        }))}
                      />
                    </div>
                  </div>

                  {stats.top.length > 0 && (
                    <div>
                      <h2 className="kicker">Most wanted</h2>
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
              </div>
            )}

            {/* Moderation list */}
            <div className="mt-16 flex flex-wrap items-center gap-2">
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
              <label className="relative ml-auto">
                <span className="sr-only">Search feedback</span>
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, body, author…"
                  className="w-56 rounded-pill border border-line bg-surface py-1.5 pl-8 pr-3 text-[13px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
                />
              </label>
            </div>

            {visible.length > 0 ? (
              <table className="mt-6 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                    <th scope="col" className="pb-2 pr-4 font-normal">
                      Feedback
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-normal">
                      Status
                    </th>
                    <th scope="col" className="pb-2 font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((post) => (
                    <Row
                      key={post.id}
                      post={post}
                      onStatusChange={changeStatus}
                      onDelete={remove}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-10 text-[15px] text-ink-soft">
                {posts.length === 0 ? "The board is empty." : "Nothing matches that filter."}
              </p>
            )}
          </>
        )}
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
      className={`rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
        active
          ? "border-transparent bg-ink text-canvas"
          : "border-line text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
