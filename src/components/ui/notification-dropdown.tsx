import { useEffect, useRef } from "react";
import { Bell, CheckCheck, X, AlertTriangle, Info, Users, Zap, Download } from "lucide-react";
import { useNotificationStore, type AppNotification } from "@/lib/notification-store";
import { supabase } from "@/integrations/supabase/client";

const ICONS: Record<string, typeof Bell> = {
  simulation_complete: Zap,
  credits_low: AlertTriangle,
  team_invite: Users,
  alarm: AlertTriangle,
  export_ready: Download,
  info: Info,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function NotificationItem({ notif, onRead }: { notif: AppNotification; onRead: () => void }) {
  const Icon = ICONS[notif.type] || Info;
  const isUnread = !notif.readAt;

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-b-0 cursor-pointer transition-colors hover:bg-accent/30 ${
        isUnread ? "bg-primary/5" : "opacity-70"
      }`}
      onClick={onRead}
    >
      <div className={`shrink-0 mt-0.5 ${isUnread ? "text-primary" : "text-muted-foreground"}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[11px] font-medium truncate ${isUnread ? "text-foreground" : "text-muted-foreground"}`}
          >
            {notif.title}
          </span>
          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">{notif.message}</p>
        <span className="text-[9px] text-muted-foreground/50 mt-1 block">
          {timeAgo(notif.createdAt)}
        </span>
      </div>
    </div>
  );
}

function isUuid(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function NotificationDropdown() {
  const {
    notifications,
    unreadCount,
    dropdownOpen,
    toggleDropdown,
    setDropdownOpen,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, setDropdownOpen]);

  const handleMarkRead = (id: string) => {
    markAsRead(id);
    if (isUuid(id)) {
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .then();
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
    const unreadIds = notifications.filter((n) => !n.readAt && isUuid(n.id)).map((n) => n.id);
    if (unreadIds.length > 0) {
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .then();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggleDropdown}
        className="relative h-8 w-8 rounded flex items-center justify-center hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[14px] px-1 flex items-center justify-center rounded-full bg-warning text-[9px] font-bold text-warning-foreground leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-[320px] max-h-[420px] rounded-lg border border-border bg-background/95 backdrop-blur-lg shadow-2xl flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[11px] font-mono font-bold text-foreground uppercase tracking-wider">
              Notificações
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar tudo
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Bell className="h-6 w-6 opacity-30" />
                <span className="text-[11px] font-mono">Nenhuma notificação</span>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notif={n} onRead={() => handleMarkRead(n.id)} />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-3 py-1.5 flex justify-between items-center">
            <span className="text-[9px] text-muted-foreground/50">
              {notifications.length > 0
                ? `${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}`
                : "Tudo em dia"}
            </span>
            <button
              onClick={() => setDropdownOpen(false)}
              className="text-[9px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
