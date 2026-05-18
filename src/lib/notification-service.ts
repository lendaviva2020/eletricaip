import { supabase } from "@/integrations/supabase/client";
import {
  useNotificationStore,
  type AppNotification,
  type NotificationType,
} from "./notification-store";

let _tenantId: string | null = null;
let _userId: string | null = null;

export function setNotifierContext(tenantId: string | null, userId: string | null) {
  _tenantId = tenantId;
  _userId = userId;
}

export async function pushNotification(
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, any>,
): Promise<void> {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  const local: AppNotification = { id, type, title, message, data, readAt: null, createdAt };
  useNotificationStore.getState().addNotification(local);

  if (_tenantId && _userId) {
    try {
      await supabase.from("notifications").insert({
        tenant_id: _tenantId,
        user_id: _userId,
        type,
        title,
        message,
        data: data ?? {},
      });
    } catch {
      // fallback — notification already shown locally
    }
  }
}
