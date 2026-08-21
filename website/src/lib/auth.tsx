import { createContext, useContext, useState, type ReactNode } from "react";
import { api, session, type PublicUser } from "./feedback";

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

  const value: Auth = {
    user,
    async login(input) {
      const next = await api.login(input);
      setUser(next);
      return next;
    },
    async register(input) {
      const next = await api.register(input);
      setUser(next);
      return next;
    },
    signOut() {
      session.clear();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
