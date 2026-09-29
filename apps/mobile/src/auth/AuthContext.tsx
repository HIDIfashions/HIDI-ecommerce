import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { HidiSession, clearSession, validSession } from "./session";

type AuthContextValue = {
  loading: boolean;
  session: HidiSession | null;
  refresh: () => Promise<HidiSession | null>;
  setSession: (session: HidiSession | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<HidiSession | null>(null);

  const refresh = useCallback(async () => {
    const next = await validSession();
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ loading, session, refresh, setSession, signOut }), [loading, session, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
