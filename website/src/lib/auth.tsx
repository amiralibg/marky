import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api, session, type PublicUser } from "./feedback";

type Auth = {
  user: PublicUser | null;
  /** Signs in (or up) and remembers the session. */
  login: (input: { email: string; password: string }) => Promise<PublicUser>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<PublicUser>;
  signOut: () => void;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => session.read()?.user ?? null);

  // The stored session is shown immediately — waiting on a round trip to render
  // a signed-in board would flash "sign in" at everyone — and then verified.
  // A token that has expired or whose account is gone is dropped here rather
  // than at the visitor's first failed vote.
  useEffect(() => {
    if (!session.read()) return;
    let alive = true;
    api
      .me()
      .then((fresh) => {
        if (alive) setUser(fresh);
      })
      .catch((err) => {
        // Only a rejection from the server unseats the session. A flaky network
        // (ApiError 0) must not sign people out mid-flight.
        if (!alive || !(err instanceof ApiError) || err.status !== 401) return;
        session.clear();
        setUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const next = await api.login(input);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const next = await api.register(input);
      setUser(next);
      return next;
    },
    []
  );

  const signOut = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  const value = useMemo<Auth>(
    () => ({ user, login, register, signOut }),
    [user, login, register, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
