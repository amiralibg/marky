import { ArrowUp, Bug, Lightbulb, LogOut, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import AuthSheet from "../components/AuthSheet";
import PageIntro from "../components/PageIntro";
import { useAuth } from "../lib/auth";
import {
  ApiError,
  api,
  STATUS_LABEL,
  type FeedbackPost,
  type PostStatus,
  type PostType,
} from "../lib/feedback";
import { useReveal } from "../lib/motion";

type Sort = "top" | "new";

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "top", label: "Most voted" },
  { id: "new", label: "Newest" },
];

const STATUSES: Array<{ id: PostStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "planned", label: "Planned" },
  { id: "in-progress", label: "In progress" },
  { id: "done", label: "Done" },
];

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

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One row of the board: vote counter on the left, pitch on the right. */
function PostCard({
  post,
  onToggleVote,
}: {
  post: FeedbackPost;
  onToggleVote: (post: FeedbackPost) => void;
}) {
  const ref = useReveal<HTMLElement>({ threshold: 0.04 });

  return (
    <article ref={ref} className="reveal paper-surface flex gap-5 p-5 md:p-6">
      <button
        type="button"
        onClick={() => onToggleVote(post)}
        aria-pressed={post.voted}
        aria-label={post.voted ? `Remove vote from ${post.title}` : `Vote for ${post.title}`}
        className={`flex h-fit w-14 shrink-0 flex-col items-center gap-0.5 rounded-sm border py-2 transition-colors duration-200 ${
          post.voted
            ? "border-transparent bg-accent text-white"
            : "border-line bg-surface text-ink-soft hover:border-ink/25 hover:text-ink"
        }`}
      >
        <ArrowUp size={16} strokeWidth={2.2} aria-hidden />
        <span className="font-mono text-[13px] font-semibold">{post.voteCount}</span>
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{post.title}</h2>
          <Pill>{post.type === "bug" ? "Bug" : "Feature"}</Pill>
          <Pill tone={post.status === "done" ? "accent" : "quiet"}>
            {STATUS_LABEL[post.status]}
          </Pill>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-[1.65] text-ink-soft">
          {post.body}
        </p>
        <p className="mt-3 font-mono text-[12px] text-ink-faint">
          {post.author} · {shortDate(post.createdAt)}
        </p>
      </div>
    </article>
  );
}

function ComposeForm({ onPosted }: { onPosted: () => void }) {
  const [type, setType] = useState<PostType>("feature");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api.createPost({
        title: String(data.get("title") ?? ""),
        body: String(data.get("body") ?? ""),
        type,
      });
      form.reset();
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        name="title"
        required
        minLength={5}
        maxLength={120}
        placeholder="A short, specific title"
        className={inputClass}
      />
      <textarea
        name="body"
        required
        minLength={10}
        maxLength={4000}
        rows={5}
        placeholder="What you need and why — the more concrete, the more likely it ships."
        className={`${inputClass} resize-y leading-[1.6]`}
      />
      <div className="flex flex-wrap items-center gap-2">
        {(["feature", "bug"] as PostType[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            aria-pressed={type === option}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
              type === option
                ? "border-transparent bg-ink text-canvas"
                : "border-line text-ink-soft hover:text-ink"
            }`}
          >
            {option === "bug" ? <Bug size={13} aria-hidden /> : <Lightbulb size={13} aria-hidden />}
            {option === "bug" ? "Bug report" : "Feature request"}
          </button>
        ))}
        <button
          type="submit"
          disabled={busy}
          className="btn-accent ml-auto inline-flex h-9 items-center rounded-sm px-4 text-[14px] font-medium disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post it"}
        </button>
      </div>
      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

const SKELETON_CARDS = ["w-3/4", "w-full w-11/12", "w-full w-2/3", "w-5/6"];

export default function Feedback() {
  const auth = useAuth();
  const [sort, setSort] = useState<Sort>("top");
  const [status, setStatus] = useState<PostStatus | "all">("all");
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [composing, setComposing] = useState(false);
  const [authSheet, setAuthSheet] = useState<null | "signin" | "register">(null);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    api
      .listPosts(sort, status, "all")
      .then((next) => {
        if (controller.signal.aborted) return;
        setPosts(next);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [sort, status]);

  async function toggleVote(post: FeedbackPost) {
    if (!auth.user) {
      // A vote from a stranger is the friendliest possible sign-in prompt.
      setAuthSheet("signin");
      return;
    }
    // Optimistic: the counter should move under the cursor, not after a round trip.
    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === post.id
          ? {
              ...candidate,
              voted: !candidate.voted,
              voteCount: candidate.voteCount + (candidate.voted ? -1 : 1),
            }
          : candidate
      )
    );
    try {
      const result = await api.toggleVote(post.id);
      setPosts((current) =>
        current.map((candidate) =>
          candidate.id === post.id
            ? { ...candidate, voted: result.voted, voteCount: result.voteCount }
            : candidate
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) auth.signOut();
      // Roll back to the server truth we had before the optimistic flip.
      setPosts((current) =>
        current.map((candidate) =>
          candidate.id === post.id
            ? { ...candidate, voted: post.voted, voteCount: post.voteCount }
            : candidate
        )
      );
    }
  }

  const signedIn = Boolean(auth.user);

  return (
    <main>
      <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
        <PageIntro
          kicker="Feedback"
          title="Tell us what Marky is missing."
          lede={
            <>
              Request features, report bugs, vote for what matters to you. Everything here is read
              by one person who ships the app — and the changelog proves ideas do land.
            </>
          }
          aside={
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => (signedIn ? setComposing((open) => !open) : setAuthSheet("signin"))}
                aria-expanded={signedIn ? composing : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                  signedIn && composing ? "bg-ink text-canvas" : "btn-accent"
                }`}
              >
                <Plus size={14} strokeWidth={2.2} aria-hidden />
                Share an idea
              </button>
              {signedIn ? (
                <button
                  type="button"
                  onClick={() => auth.signOut()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-faint transition-colors duration-200 hover:text-ink"
                >
                  <LogOut size={13} aria-hidden />
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthSheet("register")}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-faint transition-colors duration-200 hover:text-ink"
                >
                  Create account
                </button>
              )}
            </div>
          }
        />

        {composing && signedIn && (
          <div className="paper-surface mt-12 max-w-2xl p-6 md:p-8">
            <h2 className="font-display text-[22px] tracking-[-0.02em]">New feedback</h2>
            <div className="mt-4">
              <ComposeForm
                onPosted={() => {
                  setComposing(false);
                  setStatus("all");
                  setSort("new");
                }}
              />
            </div>
          </div>
        )}

        <AuthSheet
          open={authSheet !== null}
          intent={authSheet ?? "signin"}
          onClose={() => setAuthSheet(null)}
        />

        {/* Filter row holds its height while the list loads, so the cards do
            not shove everything below them down when they arrive. */}
        <div
          className={`mt-12 flex flex-wrap gap-2 ${state === "loading" ? "animate-pulse" : ""}`}
          role="group"
          aria-label="Filter feedback"
        >
          {SORTS.map((option) => (
            <FilterChip
              key={option.id}
              active={sort === option.id}
              disabled={state === "loading"}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </FilterChip>
          ))}
          <span className="mx-1 hidden w-px self-stretch bg-line sm:block" aria-hidden />
          {STATUSES.map((option) => (
            <FilterChip
              key={option.id}
              active={status === option.id}
              disabled={state === "loading"}
              onClick={() => setStatus(option.id)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>

        {state === "loading" && (
          <div className="mt-8 space-y-4" aria-hidden>
            {SKELETON_CARDS.map((width, index) => (
              <div key={index} className="paper-surface flex animate-pulse gap-5 p-6">
                <div className="h-16 w-14 shrink-0 rounded-sm bg-ink/[0.07]" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <Bar width={width} />
                  <Bar width="w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state === "error" && (
          <div className="paper-surface mt-8 max-w-[34rem] p-6">
            <p className="text-[15px] leading-[1.7] text-ink-soft">
              The board could not be loaded right now. Give it a moment and reload the page.
            </p>
          </div>
        )}

        {state === "ready" &&
          (posts.length > 0 ? (
            <div className="mt-8 space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onToggleVote={toggleVote} />
              ))}
            </div>
          ) : (
            <p className="mt-8 text-[15px] text-ink-soft">
              Nothing here yet{status !== "all" ? " with that status" : ""} — be the first to post.
            </p>
          ))}
      </section>
    </main>
  );
}

function Bar({ width }: { width: string }) {
  return <div className={`h-3.5 rounded-sm bg-ink/[0.07] ${width}`} />;
}

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
