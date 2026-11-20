// Etiquetas de arco elétrico para impressão — HTML autônomo, PURO.
// Todo texto vem de dados do projeto (nomes, título) e é ESCAPADO; o arquivo não
// tem script. Só quadros com cálculo concluído geram etiqueta.
import type { BoardArcFlash } from "./connection/arc-flash";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const fmt = (v: number | undefined, digits = 2) =>
  v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

export function buildArcFlashLabelsHtml(
  boards: BoardArcFlash[],
  opts: { projectTitle?: string; premises: string[]; disclaimer: string },
): string | null {
  const done = boards.filter((b) => b.status !== "pending");
  if (done.length === 0) return null;
  const title = escapeHtml(opts.projectTitle?.trim() || "Projeto");
  const labels = done
    .map((b) => {
      const danger = b.status === "danger";
      const head = danger ? "PERIGO" : "ADVERTÊNCIA";
      return `<article class="label${danger ? " danger" : ""}">
  <header>${head} — RISCO DE ARCO ELÉTRICO E CHOQUE</header>
  <h2>${escapeHtml(b.name)}</h2>
  <table>
    <tr><th>Energia incidente</th><td>${fmt(b.incidentEnergy_cal_cm2)} cal/cm² a ${fmt(b.workingDistance_mm / 1000)} m</td></tr>
    <tr><th>Categoria de EPI (NFPA 70E)</th><td>${danger ? "Sem EPI adequado — trabalho energizado proibido" : String(b.ppe_category)}</td></tr>
    <tr><th>Limite de aproximação ao arco</th><td>${fmt((b.arcBoundary_mm ?? 0) / 1000)} m</td></tr>
    <tr><th>Tensão nominal</th><td>${fmt(b.voltage_V, 0)} V</td></tr>
    <tr><th>Curto presumido / corrente de arco</th><td>${fmt(b.Ibf_kA)} kA / ${fmt(b.arcingCurrent_kA)} kA</td></tr>
    <tr><th>Tempo de eliminação</th><td>${fmt(b.clearingTime_s)} s${b.durationCapped ? " (limitado a 2 s)" : ""}</td></tr>
  </table>
  <footer>${title} · NR-10 · IEEE 1584-2002 · cálculo indicativo</footer>
</article>`;
    })
    .join("\n");
  const premises = opts.premises.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de arco elétrico — ${title}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#000;background:#fff}
.label{border:3px solid #000;width:100mm;margin:0 8mm 8mm 0;display:inline-block;vertical-align:top;page-break-inside:avoid}
.label header{background:#f5a400;font-weight:700;padding:6px;text-align:center;font-size:13px}
.label.danger header{background:#c00000;color:#fff}
.label h2{margin:6px;font-size:16px}
.label table{width:100%;border-collapse:collapse;font-size:11px}
.label th,.label td{border-top:1px solid #000;padding:3px 6px;text-align:left}
.label footer{font-size:9px;padding:4px 6px;border-top:1px solid #000}
.note{font-size:11px;max-width:210mm}
@media print{.note{page-break-before:always}}
</style></head><body>
${labels}
<section class="note"><p><strong>${escapeHtml(opts.disclaimer)}</strong></p><ul>${premises}</ul></section>
</body></html>`;
}
