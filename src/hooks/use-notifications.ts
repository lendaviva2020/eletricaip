import { useEffect, useRef } from "react";
import { useNotificationStore, type AppNotification } from "@/lib/notification-store";
import { setNotifierContext, pushNotification } from "@/lib/notification-service";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

function toAppNotif(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function useNotifications() {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const userId = user?.id ?? null;

  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const setLoading = useNotificationStore((s) => s.setLoading);
  const setSynced = useNotificationStore((s) => s.setSynced);
  const loading = useNotificationStore((s) => s.loading);
  const synced = useNotificationStore((s) => s.synced);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    setLoading(true);

    supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single()
      .then(({ data: profile }) => {
        if (cancelled) return;
        const tenantId = profile?.tenant_id ?? null;
        setNotifierContext(tenantId, userId);

        if (!tenantId) {
          setNotifications([]);
          return;
        }

        supabase
          .from("notifications")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100)
          .then(({ data: rows }) => {
            if (cancelled) return;
            const notifs = (rows ?? []).map(toAppNotif);
            setNotifications(notifs);

            const channel = supabase.channel(`notifications-${tenantId}-${userId}`);
            channel.on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `tenant_id=eq.${tenantId}`,
              },
              (payload: RealtimePostgresChangesPayload<any>) => {
                const row = payload.new;
                if (row && row.user_id === userId) {
                  addNotification(toAppNotif(row));
                }
              },
            );
            channel.subscribe();
            channelRef.current = channel;
          });
      });

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, setLoading, setNotifications, addNotification]);

  return { pushNotification, loading, synced, markAsRead };
}
