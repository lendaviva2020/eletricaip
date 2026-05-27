import { createFileRoute } from "@tanstack/react-router";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings/notifications")({
  head: () => ({ meta: [{ title: "Notificações · EletricAI" }] }),
  component: NotificationsPage,
});

interface NotifState {
  prefs: Record<string, boolean>;
  toggle: (k: string) => void;
}

export const useNotifPrefs = create<NotifState>()(
  persist(
    (set) => ({
      prefs: {
        email_critical_alarm: true,
        email_protocol_failure: true,
        email_new_member: false,
        inapp_critical_alarm: true,
        inapp_protocol_failure: true,
        inapp_new_member: true,
        push_critical_alarm: false,
      },
      toggle: (k) => set((s) => ({ prefs: { ...s.prefs, [k]: !s.prefs[k] } })),
    }),
    { name: "eletricai-notif-prefs" },
  ),
);

const ITEMS: { key: string; label: string; channel: string }[] = [
  { key: "email_critical_alarm", label: "Alarme crítico", channel: "Email" },
  { key: "email_protocol_failure", label: "Falha de protocolo", channel: "Email" },
  { key: "email_new_member", label: "Novo membro na equipe", channel: "Email" },
  { key: "inapp_critical_alarm", label: "Alarme crítico", channel: "In-app" },
  { key: "inapp_protocol_failure", label: "Falha de protocolo", channel: "In-app" },
  { key: "inapp_new_member", label: "Novo membro na equipe", channel: "In-app" },
  { key: "push_critical_alarm", label: "Alarme crítico", channel: "Push" },
];

function NotificationsPage() {
  const prefs = useNotifPrefs((s) => s.prefs);
  const toggle = useNotifPrefs((s) => s.toggle);
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> Notificações
        </h1>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {ITEMS.map((i) => (
              <div key={i.key} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{i.label}</p>
                  <p className="text-xs text-muted-foreground">Canal: {i.channel}</p>
                </div>
                <Switch checked={!!prefs[i.key]} onCheckedChange={() => toggle(i.key)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
