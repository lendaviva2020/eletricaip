// Notification service — pushes notifications locally and optionally to Supabase
import { supabase } from "@/integrations/supabase/client";
import {
  useNotificationStore,
  type AppNotification,
  type NotificationType,
} from "./notification-store";
import type { Json } from "@/integrations/supabase/types";

let _tenantId: string | null = null;
let _userId: string | null = null;

export function setNotifierContext(tenantId: string | null, userId: string | null): void {
  _tenantId = tenantId;
  _userId = userId;
}

export async function pushNotification(
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  const local: AppNotification = { id, type, title, message, data, readAt: null, createdAt };
  useNotificationStore.getState().addNotification(local);

  if (_tenantId && _userId) {
    try {
      const insertPayload: Record<string, unknown> = {
        tenant_id: _tenantId,
        user_id: _userId,
        type,
        title,
        message,
        data: (data ?? {}) as Json,
      };
      await (
        supabase.from("notifications") as unknown as {
          insert: (payload: Record<string, unknown>) => Promise<unknown>;
        }
      ).insert(insertPayload);
    } catch {
      // fallback — notification already shown locally
    }
  }
}
