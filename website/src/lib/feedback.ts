/**
 * Typed client for the feedback API, served same-origin at /api (nginx proxies
 * it to the API container in production; the Vite dev server proxies it too).
 */

const TOKEN_KEY = "marky.feedback.token";

export type PostStatus = "open" | "planned" | "in-progress" | "done" | "closed";
export type PostType = "feature" | "bug";

export const STATUS_LABEL: Record<PostStatus, string> = {
  open: "Open",
  planned: "Planned",
  "in-progress": "In progress",
  done: "Done",
  closed: "Closed",
};

export type FeedbackPost = {
  id: string;
  title: string;
  body: string;
  type: PostType;
  status: PostStatus;
  voteCount: number;
  author: string;
  createdAt: string;
  voted: boolean;
};

export type AdminFeedbackPost = Omit<FeedbackPost, "author" | "voted"> & {
  authorEmail: string;
  authorName: string;
};

export type AdminStats = {
  totals: { posts: number; votes: number; users: number };
  byStatus: Partial<Record<PostStatus, number>>;
  byType: Partial<Record<PostType, number>>;
  daily: Array<{ date: string; posts: number }>;
  top: Array<{ id: string; title: string; voteCount: number; status: PostStatus }>;
};

export type PublicUser = { id: string; email: string; displayName: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  const authed = session.read();
  if (authed && !path.startsWith("/api/admin")) headers.Authorization = `Bearer ${authed.token}`;

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status}).`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** The signed-in visitor's session, persisted in localStorage. */
export const session = {
  read(): { token: string; user: PublicUser } | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as { token: string; user: PublicUser }) : null;
    } catch {
      return null;
    }
  },
  write(token: string, user: PublicUser) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, user }));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

function adminHeaders(): Record<string, string> {
  // Admin tokens live apart from visitor sessions so signing out of the board
  // cannot end a moderation review mid-way.
  const token = sessionStorage.getItem("marky.admin.token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async listPosts(sort: "top" | "new", status: PostStatus | "all", type: PostType | "all") {
    const query = new URLSearchParams({ sort, status, type });
    const data = await request<{ posts: FeedbackPost[] }>(`/api/posts?${query}`);
    return data.posts;
  },

  async createPost(input: { title: string; body: string; type: PostType }) {
    return request<{ id: string }>("/api/posts", { method: "POST", body: JSON.stringify(input) });
  },

  async toggleVote(postId: string) {
    return request<{ voted: boolean; voteCount: number }>(`/api/posts/${postId}/vote`, {
      method: "POST",
    });
  },

  async register(input: { email: string; password: string; displayName: string }) {
    const data = await request<{ token: string; user: PublicUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    session.write(data.token, data.user);
    return data.user;
  },

  async login(input: { email: string; password: string }) {
    const data = await request<{ token: string; user: PublicUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    session.write(data.token, data.user);
    return data.user;
  },

  admin: {
    saveToken(token: string) {
      sessionStorage.setItem("marky.admin.token", token);
    },
    hasToken() {
      return Boolean(sessionStorage.getItem("marky.admin.token"));
    },
    clearToken() {
      sessionStorage.removeItem("marky.admin.token");
    },

    async login(email: string, password: string) {
      const data = await request<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      api.admin.saveToken(data.token);
    },

    async listPosts() {
      const data = await request<{ posts: AdminFeedbackPost[] }>("/api/admin/posts", {
        headers: adminHeaders(),
      });
      return data.posts;
    },

    async stats() {
      return request<AdminStats>("/api/admin/stats", { headers: adminHeaders() });
    },

    async setStatus(postId: string, status: PostStatus) {
      return request(`/api/admin/posts/${postId}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status }),
      });
    },

    async deletePost(postId: string) {
      return request<void>(`/api/admin/posts/${postId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    },
  },
};
