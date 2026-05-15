import { useCallback, useEffect, useState } from "react";
import {
  listMyTenants,
  switchActiveTenant,
  type TenantSummary,
} from "@/lib/tenants.functions";
import { supabase } from "@/integrations/supabase/client";

export function useActiveTenant() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setTenants([]);
        return;
      }
      const list = await listMyTenants();
      setTenants(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const active = tenants.find((t) => t.isActive) ?? tenants[0] ?? null;

  const switchTo = useCallback(
    async (tenantId: string) => {
      await switchActiveTenant({ data: { tenantId } });
      await refresh();
    },
    [refresh],
  );

  return { tenants, active, loading, error, refresh, switchTo };
}
