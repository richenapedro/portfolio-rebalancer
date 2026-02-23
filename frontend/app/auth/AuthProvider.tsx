"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { signOut, useSession } from "next-auth/react";
import {
  authLogin,
  authLogout,
  authMe,
  authSignup,
  authOauthExchange,
  type MeResponse,
} from "@/lib/api";

export type AuthUser = MeResponse;

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  oauthLogin: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type OAuthSession = {
  provider?: "google" | "facebook";
  id_token?: string;
  access_token?: string;
};

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: session } = useSession();

  const refresh = useCallback(async () => {
    try {
      // 1) Try backend session first
      const me = await authMe(); // ✅ recommended to return MeResponse | null on 401
      if (me) {
        setUser(me);
        return;
      }

      // 2) Fallback: if NextAuth has an OAuth session, bridge to backend cookie session
      const s = session as unknown as OAuthSession | null;

      if (
        s?.provider === "google" &&
        typeof s.id_token === "string" &&
        s.id_token
      ) {
        await authOauthExchange("google", s.id_token);
        const me2 = await authMe();
        setUser(me2 ?? null);
        return;
      }

      // Facebook not enabled for now
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const me = await authLogin(email, password);
    setUser(me);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const me = await authSignup(email, password);
    setUser(me);
  }, []);

  // ✅ LOGOUT DUPLO: backend cookie + NextAuth session
  const logout = useCallback(async () => {
    try {
      await authLogout(); // kills FastAPI cookie session
    } finally {
      // kills NextAuth session (Google) so /login won't auto-authenticate
      await signOut({ redirect: false });
      setUser(null);
    }
  }, []);

  // kept for compatibility with existing callers
  const oauthLogin = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, refresh, login, signup, logout, oauthLogin }),
    [user, loading, refresh, login, signup, logout, oauthLogin],
  );

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}