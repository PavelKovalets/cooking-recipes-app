import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../lib/api";
import type { PublicUser } from "../lib/types";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  isAdmin: boolean;
  isRegistered: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<PublicUser>;
  logout: () => void;
  setUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token is persisted, fetch the current user.
  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => {
        if (active) setUserState(res.user);
      })
      .catch(() => {
        // Invalid/expired token (or blocked) — drop it.
        setToken(null);
        if (active) setUserState(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setToken(res.token);
    setUserState(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await api.register({ email, password, displayName });
      setToken(res.token);
      setUserState(res.user);
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    api.logout().catch(() => undefined);
    setToken(null);
    setUserState(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === "admin",
      isRegistered: user != null,
      login,
      register,
      logout,
      setUser: setUserState,
    }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
