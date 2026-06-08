import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTenantSetting } from "@/hooks/use-tenant-setting";

export const Route = createFileRoute("/settings/notifications")({
  head: () => ({ meta: [{ title: "Notificações · EletricAI" }] }),
  component: NotificationsPage,
});

const DEFAULT_PREFS: Record<string, boolean> = {
  email_critical_alarm: true,
  email_protocol_failure: true,
  email_new_member: false,
  inapp_critical_alarm: true,
  inapp_protocol_failure: true,
  inapp_new_member: true,
  push_critical_alarm: false,
};

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
  const { value: prefs, update, isSaving } = useTenantSetting(
    "notification_prefs",
    DEFAULT_PREFS,
  );

  const toggle = (k: string) => update({ [k]: !prefs[k] });

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
                <Switch
                  checked={!!prefs[i.key]}
                  onCheckedChange={() => toggle(i.key)}
                  disabled={isSaving}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          As preferências ficam salvas no seu workspace e se aplicam a todos os dispositivos.
        </p>
      </div>
    </div>
  );
}
