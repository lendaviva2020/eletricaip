import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTenantSetting } from "@/hooks/use-tenant-setting";
import { useI18n } from "@/lib/i18n";

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

// labelKey (não texto): traduzido na renderização conforme o idioma ativo.
const ITEMS: { key: string; labelKey: string; channel: string }[] = [
  { key: "email_critical_alarm", labelKey: "pages.notifCriticalAlarm", channel: "Email" },
  { key: "email_protocol_failure", labelKey: "pages.notifProtocolFail", channel: "Email" },
  { key: "email_new_member", labelKey: "pages.notifNewMember", channel: "Email" },
  { key: "inapp_critical_alarm", labelKey: "pages.notifCriticalAlarm", channel: "In-app" },
  { key: "inapp_protocol_failure", labelKey: "pages.notifProtocolFail", channel: "In-app" },
  { key: "inapp_new_member", labelKey: "pages.notifNewMember", channel: "In-app" },
  { key: "push_critical_alarm", labelKey: "pages.notifCriticalAlarm", channel: "Push" },
];

function NotificationsPage() {
  const { t } = useI18n();
  const { value: prefs, update, isSaving } = useTenantSetting("notification_prefs", DEFAULT_PREFS);

  const toggle = (k: string) => update({ [k]: !prefs[k] });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> {t("pages2.notifications")}
        </h1>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {ITEMS.map((i) => (
              <div key={i.key} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{t(i.labelKey)}</p>
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
        <p className="text-[11px] text-muted-foreground">{t("pages.notifSavedHint")}</p>
      </div>
    </div>
  );
}
