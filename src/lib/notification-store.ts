import { create } from "zustand";

export type NotificationType =
  | "simulation_complete"
  | "credits_low"
  | "team_invite"
  | "alarm"
  | "export_ready"
  | "info";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  dropdownOpen: boolean;
  loading: boolean;
  synced: boolean;

  setDropdownOpen: (open: boolean) => void;
  toggleDropdown: () => void;
  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notif: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setSynced: (synced: boolean) => void;
}

function computeUnread(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.readAt).length;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  dropdownOpen: false,
  loading: false,
  synced: false,

  setDropdownOpen: (open) => set({ dropdownOpen: open }),
  toggleDropdown: () => set((s) => ({ dropdownOpen: !s.dropdownOpen })),
  setLoading: (loading) => set({ loading }),
  setSynced: (synced) => set({ synced }),

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: computeUnread(notifications), loading: false, synced: true }),

  addNotification: (notif) =>
    set((s) => ({
      notifications: [notif, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + (notif.readAt ? 0 : 1),
    })),

  markAsRead: (id) =>
    set((s) => {
      const notifications = s.notifications.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
      );
      return { notifications, unreadCount: computeUnread(notifications) };
    }),

  markAllAsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
      ),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((s) => {
      const notifications = s.notifications.filter((n) => n.id !== id);
      return { notifications, unreadCount: computeUnread(notifications) };
    }),
}));
