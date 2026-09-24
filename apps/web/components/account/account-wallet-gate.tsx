"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase-auth";
import { WalletBalance } from "@/components/wallet-balance";

export function AccountWalletGate() {
  const [authenticated, setAuthenticated] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;

    async function sync() {
      const currentRevision = ++revision.current;
      const token = await getAccessToken().catch(() => null);
      if (!active || revision.current !== currentRevision) return;
      setAuthenticated(Boolean(token));
    }

    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === "hidi_supabase_session") void sync();
    }

    void sync();
    window.addEventListener("hidi-auth-updated", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      revision.current += 1;
      window.removeEventListener("hidi-auth-updated", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!authenticated) return null;
  return <WalletBalance compact />;
}
