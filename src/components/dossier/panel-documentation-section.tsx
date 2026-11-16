/**
 * Documentação de painel EletricAI dentro do dossiê: verificação,
 * lista de cabos, referência cruzada bobina ↔ contatos e dispositivos.
 */
import { useMemo, useState } from "react";
import type { PanelDocumentation } from "@/lib/documentation";
import { useI18n } from "@/lib/i18n";

type Tab = "check" | "cables" | "xref" | "devices";
const TABS: Tab[] = ["check", "cables", "xref", "devices"];

const SEVERITY_CLASS = {
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  info: "bg-muted text-muted-foreground border-border",
} as const;

export function PanelDocumentationSection({ doc }: { doc: PanelDocumentation }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("check");
  const counts = useMemo(
    () => ({
      error: doc.issues.filter((i) => i.severity === "error").length,
      warning: doc.issues.filter((i) => i.severity === "warning").length,
    }),
    [doc.issues],
  );

  return (
    <section className="space-y-3" data-testid="panel-documentation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("panelDoc.title")}</h4>
        <div className="flex gap-2 text-[11px]">
          <span className={`rounded border px-2 py-0.5 ${SEVERITY_CLASS.error}`}>
            {t("panelDoc.errors", { n: counts.error })}
          </span>
          <span className={`rounded border px-2 py-0.5 ${SEVERITY_CLASS.warning}`}>
            {t("panelDoc.warnings", { n: counts.warning })}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("panelDoc.desc")}</p>

      <div role="tablist" className="flex flex-wrap gap-1">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
            }
          >
            {t(`panelDoc.tab_${k}`)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        {tab === "check" &&
          (doc.issues.length === 0 ? (
            <p className="p-3 text-xs text-success">{t("panelDoc.noIssues")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {doc.issues.map((i, idx) => (
                <li key={`${i.code}-${i.ref}-${idx}`} className="flex gap-2 px-3 py-2 text-xs">
                  <span
                    className={`h-fit shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[i.severity]}`}
                  >
                    {t(`panelDoc.sev_${i.severity}`)}
                  </span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          ))}

        {tab === "cables" && (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-semibold">
              <tr>
                <th className="px-3 py-2">{t("panelDoc.cable")}</th>
                <th className="px-3 py-2">{t("panelDoc.from")}</th>
                <th className="px-3 py-2">{t("panelDoc.to")}</th>
                <th className="px-3 py-2">{t("panelDoc.composition")}</th>
                <th className="px-3 py-2">{t("panelDoc.length")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doc.cables.map((c) => (
                <tr key={c.cable}>
                  <td className="px-3 py-1.5 font-mono font-bold">{c.cable}</td>
                  <td className="px-3 py-1.5 font-mono">{c.from}</td>
                  <td className="px-3 py-1.5 font-mono">{c.to}</td>
                  <td className="px-3 py-1.5">{c.composition}</td>
                  <td className="px-3 py-1.5">
                    {c.lengthM === null ? (
                      <span className="text-warning">{t("panelDoc.pending")}</span>
                    ) : (
                      `${c.lengthM} m`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "xref" && (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-semibold">
              <tr>
                <th className="px-3 py-2">{t("panelDoc.device")}</th>
                <th className="px-3 py-2">{t("panelDoc.coil")}</th>
                <th className="px-3 py-2">{t("panelDoc.contacts")}</th>
                <th className="px-3 py-2">{t("panelDoc.summary")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doc.crossReference.map((r) => (
                <tr key={r.equipmentId}>
                  <td className="px-3 py-1.5 font-mono font-bold">{r.designation}</td>
                  <td className="px-3 py-1.5">{r.coilLocations.join(", ") || "—"}</td>
                  <td className="px-3 py-1.5 font-mono">
                    {r.contacts.map((c) => `${c.terminals} (${c.location})`).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-1.5">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "devices" && (
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-semibold">
              <tr>
                <th className="px-3 py-2">{t("panelDoc.designation")}</th>
                <th className="px-3 py-2">{t("panelDoc.type")}</th>
                <th className="px-3 py-2">{t("panelDoc.description")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doc.devices.map((d) => (
                <tr key={d.equipmentId}>
                  <td className="px-3 py-1.5 font-mono font-bold">
                    {d.designation}
                    {d.suggested && (
                      <span className="ml-2 rounded bg-warning/15 px-1 text-[10px] text-warning">
                        {t("panelDoc.suggested")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{d.catalogType}</td>
                  <td className="px-3 py-1.5">{d.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
