import { useEffect, useState } from "react";
import PageIntro from "../components/PageIntro";
import { ApiError, api, STATUS_LABEL, type AdminFeedbackPost, type PostStatus } from "../lib/feedback";

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as PostStatus[];

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
    "w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="paper-surface mt-12 max-w-md space-y-3 p-6 md:p-8">
      <h2 className="font-display text-[22px] tracking-[-0.02em]">Admin sign-in</h2>
      <input name="email" type="email" required placeholder="Email" className={inputClass} autoComplete="email" />
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
        className="btn-accent inline-flex h-10 w-full items-center justify-center rounded-sm text-[14px] font-medium disabled:opacity-60"
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
    <tr className="border-b border-line align-top">
      <td className="max-w-[28rem] py-4 pr-4">
        <p className="font-semibold">{post.title}</p>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-ink-soft">
          {post.body}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink-faint">
          {post.authorName} · {post.authorEmail} · {post.type} · {post.voteCount} votes
        </p>
      </td>
      <td className="py-4 pr-4">
        <select
          value={post.status}
          onChange={(event) => onStatusChange(post.id, event.target.value as PostStatus)}
          aria-label={`Status of ${post.title}`}
          className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px]"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-4">
        <button
          type="button"
          onClick={() => onDelete(post.id)}
          aria-label={`Delete ${post.title}`}
          className="text-[13px] text-red-600 hover:underline dark:text-red-400"
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
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setState("loading");
    api.admin
      .listPosts()
      .then((next) => {
        if (!alive) return;
        setPosts(next);
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

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  async function changeStatus(id: string, status: PostStatus) {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, status } : post))
    );
    try {
      await api.admin.setStatus(id, status);
      flash(`Marked ${STATUS_LABEL[status].toLowerCase()}.`);
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        api.admin.clearToken();
        setSignedIn(false);
        return;
      }
      setPosts((current) => [target, ...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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

  return (
    <main>
      <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
        <div className="flex items-start justify-between gap-6">
          <PageIntro
            kicker="Moderation"
            title={`${posts.length} post${posts.length === 1 ? "" : "s"} on the board.`}
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

        {notice && (
          <p role="status" className="mt-6 text-[14px] text-accent-text">
            {notice}
          </p>
        )}

        {state === "loading" && (
          <p className="mt-12 animate-pulse text-[15px] text-ink-faint">Loading posts…</p>
        )}

        {state === "error" && signedIn && (
          <p className="mt-12 text-[15px] text-ink-soft">The list could not be loaded. Reload to retry.</p>
        )}

        {state === "ready" &&
          (posts.length > 0 ? (
            <table className="mt-10 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                  <th scope="col" className="pb-2 pr-4 font-normal">Feedback</th>
                  <th scope="col" className="pb-2 pr-4 font-normal">Status</th>
                  <th scope="col" className="pb-2 font-normal"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <Row key={post.id} post={post} onStatusChange={changeStatus} onDelete={remove} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-10 text-[15px] text-ink-soft">The board is empty.</p>
          ))}
      </section>
    </main>
  );
}
