import { ArrowUp, Bug, Lightbulb, Plus, RotateCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import AuthSheet from "../components/AuthSheet";
import Sheet from "../components/Sheet";
import { FIELD_CLASS } from "../components/Field";
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
type TypeFilter = PostType | "all";
type StatusFilter = PostStatus | "all";
type Option<T extends string> = { id: T; label: string };

const SORTS: Array<Option<Sort>> = [
  { id: "top", label: "Top" },
  { id: "new", label: "New" },
];

const TYPES: Array<Option<TypeFilter>> = [
  { id: "all", label: "All" },
  { id: "feature", label: "Features" },
  { id: "bug", label: "Bugs" },
];

const STATUSES: Array<Option<StatusFilter>> = [
  { id: "all", label: "Everything" },
  ...(Object.keys(STATUS_LABEL) as PostStatus[]).map((id) => ({ id, label: STATUS_LABEL[id] })),
];

/* Status is shown as steps of the same ink. The accent is kept for the one
   filled action on the page, so it never appears twice. */
const STATUS_DOT: Record<PostStatus, string> = {
  open: "bg-ink/25",
  planned: "bg-ink/45",
  "in-progress": "bg-ink/70",
  done: "bg-accent",
  closed: "bg-ink/15",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One row of the board. The vote count is the left column because it is what
 * the page is sorted by and what people scan for.
 */
function PostCard({
  post,
  onToggleVote,
}: {
  post: FeedbackPost;
  onToggleVote: (post: FeedbackPost) => void;
}) {
  const ref = useReveal<HTMLElement>({ threshold: 0.04 });
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  // Whether the text actually overflows three lines depends on the viewport,
  // not on a character count, so it is measured rather than guessed. Without
  // this, "More" appeared on posts that were already showing in full.
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const measure = () => setClamped(node.scrollHeight - node.clientHeight > 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [post.body]);

  // Blank lines inside a clamped paragraph get counted as lines and hand the
  // ellipsis to an empty row, so the preview runs the body together and the
  // expanded view puts the author's line breaks back.
  const preview = open ? post.body : post.body.replace(/\s*\n+\s*/g, " ");

  return (
    <article
      ref={ref}
      className="reveal group relative rounded-md border border-line bg-surface p-4 transition-colors duration-200 hover:border-ink/20 sm:p-5"
    >
      <div className="flex gap-4">
        {/* Voting inverts the surface rather than taking the accent. Two filled
            accent shapes on one screen read as two primary actions. */}
        <button
          type="button"
          onClick={() => onToggleVote(post)}
          aria-pressed={post.voted}
          aria-label={post.voted ? `Remove your vote from ${post.title}` : `Vote for ${post.title}`}
          className={`flex h-fit w-11 shrink-0 flex-col items-center gap-0.5 rounded-sm border py-1.5 transition-colors duration-200 ${
            post.voted
              ? "border-ink bg-ink text-canvas"
              : "border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink"
          }`}
        >
          <ArrowUp size={14} strokeWidth={2.2} aria-hidden />
          <span className="font-mono text-[13px] font-semibold tabular-nums">{post.voteCount}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.4] tracking-[-0.01em]">
              {post.title}
            </h2>
            {/* Open is the default and sits on nearly every card, so it is left
                off. A badge every row carries is one more thing to read past. */}
            {post.status !== "open" && (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[post.status]}`} />
                {STATUS_LABEL[post.status]}
              </span>
            )}
          </div>

          <p
            ref={bodyRef}
            className={`mt-1.5 break-words text-[14px] leading-[1.65] text-ink-soft ${
              open ? "whitespace-pre-wrap" : "line-clamp-3"
            }`}
          >
            {preview}
          </p>
          {(clamped || open) && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="mt-1 font-mono text-[11px] text-ink-faint underline underline-offset-2 transition-colors hover:text-ink"
            >
              {open ? "Less" : "More"}
            </button>
          )}

          <p className="mt-3 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink-faint">
            <span className="inline-flex items-center gap-1 text-ink-soft">
              {post.type === "bug" ? (
                <Bug size={12} aria-hidden />
              ) : (
                <Lightbulb size={12} aria-hidden />
              )}
              {post.type === "bug" ? "Bug" : "Feature"}
            </span>
            <span aria-hidden>·</span>
            <span>{post.author}</span>
            <span aria-hidden>·</span>
            <span>{shortDate(post.createdAt)}</span>
          </p>
        </div>
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
      setType("feature");
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        role="group"
        aria-label="Kind of post"
        className="grid grid-cols-2 gap-1 rounded-sm border border-line bg-canvas p-1"
      >
        {(["feature", "bug"] as PostType[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            aria-pressed={type === option}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] py-1.5 text-[13px] font-medium transition-colors duration-200 ${
              type === option
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(28_27_24/0.08)]"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {option === "bug" ? (
              <Bug size={13} aria-hidden />
            ) : (
              <Lightbulb size={13} aria-hidden />
            )}
            {option === "bug" ? "Bug" : "Feature"}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Title</span>
        <input
          name="title"
          required
          minLength={5}
          maxLength={120}
          placeholder={type === "bug" ? "What went wrong?" : "What should it do?"}
          className={FIELD_CLASS}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Details</span>
        <textarea
          name="body"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder={
            type === "bug"
              ? "What you did, what happened, and what you expected instead."
              : "What you want, and what you would use it for."
          }
          className={`${FIELD_CLASS} resize-y leading-[1.6]`}
        />
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn-accent inline-flex h-11 w-full items-center justify-center rounded-sm text-[14px] font-medium transition-colors disabled:opacity-60"
      >
        {busy ? "Posting…" : "Post it"}
      </button>
    </form>
  );
}

const SKELETON_CARDS = ["w-3/4", "w-11/12", "w-2/3", "w-5/6"];

export default function Feedback() {
  const auth = useAuth();
  const introRef = useReveal<HTMLElement>();
  const [sort, setSort] = useState<Sort>("top");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [composing, setComposing] = useState(false);
  const [authSheet, setAuthSheet] = useState<null | "signin" | "register">(null);
  // Bumped to force a refetch. Without it, posting while already on
  // Newest + All left the filters untouched, the effect never re-ran, and the
  // brand-new post was nowhere on the board.
  const [refreshKey, setRefreshKey] = useState(0);

  const signedIn = Boolean(auth.user);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    api
      .listPosts(sort, status, type)
      .then((next) => {
        if (controller.signal.aborted) return;
        setPosts(next);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
    // Signing in has to repaint the board with your own votes filled in. The id
    // rather than the user object, because verifying the stored session on
    // mount hands back a fresh object for the same person.
  }, [sort, status, type, refreshKey, auth.user?.id]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  async function toggleVote(post: FeedbackPost) {
    if (!auth.user) {
      // A vote from a stranger is the friendliest possible sign-in prompt.
      setAuthSheet("signin");
      return;
    }
    // Optimistic. The counter should move under the cursor, not a round trip later.
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
      if (err instanceof ApiError && err.status === 401) {
        auth.signOut();
        setAuthSheet("signin");
      }
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

  function openCompose() {
    if (!signedIn) {
      setAuthSheet("register");
      return;
    }
    setComposing(true);
  }

  const filtered = status !== "all" || type !== "all";
  const loading = state === "loading";

  return (
    <main>
      <section className="mx-auto max-w-[52rem] px-6 py-14 md:px-10 md:py-20">
        {/* One left-aligned column rather than a headline and a lede pushed to
            opposite edges. The board underneath is a single column too, and the
            two should share an axis. */}
        <header ref={introRef} className="reveal">
          <p className="kicker">Feedback</p>
          <h1 className="display mt-4 max-w-[15ch] text-[clamp(38px,6.5vw,64px)]">
            What should Marky do next?
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-[1.6] text-ink-soft">
            Ask for a feature, report a bug, or vote for something someone else asked for. I read
            every post, and anything I build turns up in the changelog.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={openCompose}
              className="btn-accent inline-flex min-h-10 items-center gap-1.5 rounded-pill px-4 py-1.5 text-[14px] font-medium"
            >
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              New post
            </button>
            <p className="font-mono text-[12px] text-ink-faint">
              {signedIn ? (
                <>
                  {auth.user?.displayName}.{" "}
                  <button
                    type="button"
                    onClick={() => auth.signOut()}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthSheet("signin")}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    Sign in
                  </button>{" "}
                  to vote or post.
                </>
              )}
            </p>
          </div>
        </header>

        {/* One bar holds every control. The old sticky rail put the filters in
            a third column that read as an unrelated block of small type. */}
        <div className="mt-10 rounded-md border border-line bg-surface md:mt-12">
          <div
            role="group"
            aria-label="Filter by status"
            className="flex gap-1 overflow-x-auto p-2"
          >
            {STATUSES.map((option) => (
              <Chip
                key={option.id}
                active={status === option.id}
                onClick={() => setStatus(option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
            <Segmented label="Kind" options={TYPES} value={type} onChange={setType} />
            <Segmented label="Sort" options={SORTS} value={sort} onChange={setSort} />
            <p className="ml-auto pr-1 font-mono text-[12px] text-ink-faint">
              {loading ? "…" : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {loading && (
            <div className="space-y-3" aria-hidden>
              {SKELETON_CARDS.map((width, index) => (
                <div
                  key={index}
                  className="flex animate-pulse gap-4 rounded-md border border-line bg-surface p-5"
                >
                  <div className="h-12 w-11 shrink-0 rounded-sm bg-ink/[0.07]" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className={`h-3.5 rounded-sm bg-ink/[0.07] ${width}`} />
                    <div className="h-3.5 w-full rounded-sm bg-ink/[0.07]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {state === "error" && (
            <div className="rounded-md border border-line bg-surface p-6">
              <p className="text-[15px] leading-[1.7] text-ink-soft">Could not load the board.</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line px-4 py-1.5 text-[13px] font-medium text-ink transition-colors duration-200 hover:bg-ink/[0.04]"
              >
                <RotateCw size={13} aria-hidden />
                Try again
              </button>
            </div>
          )}

          {state === "ready" &&
            (posts.length > 0 ? (
              <div className="space-y-3">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onToggleVote={toggleVote} />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-line bg-surface px-6 py-12 text-center">
                <p className="text-[15px] leading-[1.7] text-ink-soft">
                  {filtered ? "Nothing matches those filters." : "No posts yet."}
                </p>
                <div className="mt-5 flex justify-center">
                  {filtered ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("all");
                        setType("all");
                      }}
                      className="inline-flex min-h-10 items-center rounded-pill border border-line px-4 py-1.5 text-[13px] font-medium text-ink transition-colors duration-200 hover:bg-ink/[0.04]"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCompose}
                      className="btn-accent inline-flex min-h-10 items-center gap-1.5 rounded-pill px-4 py-1.5 text-[13px] font-medium"
                    >
                      <Plus size={14} strokeWidth={2.2} aria-hidden />
                      Post the first idea
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Composing in a dialog rather than a panel wedged into the page, which
            pushed the whole board down the moment anyone opened it. */}
        <Sheet
          open={composing && signedIn}
          onClose={() => setComposing(false)}
          size="md"
          title="New post"
          description="One idea per post. It goes up under your display name."
        >
          <ComposeForm
            onPosted={() => {
              setComposing(false);
              // Land on the view the new post is actually in.
              setStatus("all");
              setType("all");
              setSort("new");
              refresh();
            }}
          />
        </Sheet>

        <AuthSheet
          open={authSheet !== null}
          intent={authSheet ?? "signin"}
          onClose={() => setAuthSheet(null)}
        />
      </section>
    </main>
  );
}

function Chip({
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
      className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
        active ? "bg-ink text-canvas" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** A single-choice control: one hairline box, the chosen option filled. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<Option<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="kicker">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 rounded-pill border border-line p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-pill px-3 py-1 text-[12px] font-medium transition-colors duration-200 ${
              value === option.id ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
