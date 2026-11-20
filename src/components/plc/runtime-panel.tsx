/**
 * Aba "Runtime" do editor CLP: mapa de E/S (tag → endereço real de campo),
 * geração do pacote do programa (Ladder + FB Studio + tela HMI), publicação,
 * aprovação e implantação nos gateways que rodam o ElétricAi Runtime.
 *
 * A nuvem nunca arma o gateway: o arme é local (WebVisu com PIN). Esta tela
 * entrega pacotes APROVADOS e pode pedir PARADA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash,
  DownloadSimple,
  CloudArrowUp,
  SealCheck,
  Prohibit,
  Stop,
  Play,
  Copy,
} from "@phosphor-icons/react";
import { usePlcStore } from "@/lib/plc/store";
import { useEditorStore } from "@/lib/editor/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useHmiStore } from "@/lib/hmi/hmi-store";
import { useCurrentProject } from "@/lib/current-project";
import { IoMapSchema, MODBUS_AREAS, type IoMap } from "@/lib/runtime/io-map";
import { buildRuntimePackage, type BuildPackageResult } from "@/lib/runtime/program-package";
import {
  approveRuntimePackage,
  createRuntimeDevice,
  listRuntime,
  publishRuntimePackage,
  revokeRuntimeDevice,
  revokeRuntimePackage,
  setRuntimeDeviceStop,
  setRuntimeDeviceTarget,
  type RuntimeDeviceRow,
  type RuntimePackageRow,
} from "@/lib/runtime/runtime.functions";

type Draft = {
  connections: Array<Record<string, unknown>>;
  points: Array<Record<string, unknown>>;
  estopTag?: string;
};

const EMPTY: Draft = { connections: [], points: [] };

function asDraft(raw: unknown): Draft {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<Draft>;
    return {
      connections: Array.isArray(r.connections) ? r.connections : [],
      points: Array.isArray(r.points) ? r.points : [],
      ...(typeof r.estopTag === "string" && r.estopTag ? { estopTag: r.estopTag } : {}),
    };
  }
  return EMPTY;
}

const cell = "px-2 py-1 border-b border-border/60";
const input =
  "h-7 w-full rounded border border-border bg-input/60 px-1.5 text-[11px] font-mono outline-none focus:ring-1 focus:ring-ring";
const btn =
  "inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider hover:bg-accent disabled:opacity-40";

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^[A-Z_]+:\s*/, "");
}

export function RuntimePanel() {
  const project = usePlcStore((s) => s.project);
  const setIoMap = usePlcStore((s) => s.setIoMap);
  const rungs = useEditorStore((s) => s.rungs);
  const editorTags = useEditorStore((s) => s.editorTags);
  const studio = useUnifiedProjectStore((s) => s.doc.compactStudio);
  const hmi = useHmiStore((s) => s.doc);
  const stored = useCurrentProject((s) => s.project);
  // Projeto aberto no workspace (URL) — vale também para o projeto de
  // demonstração, que não fica registrado como "projeto atual".
  const urlProjectId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("projectId")
      : null;
  const current =
    stored && (!urlProjectId || stored.id === urlProjectId)
      ? stored
      : urlProjectId && /^[0-9a-f-]{36}$/i.test(urlProjectId)
        ? { id: urlProjectId, name: stored?.name ?? "Projeto" }
        : null;

  const draft = useMemo(() => asDraft(project.ioMap), [project.ioMap]);
  const parsed = useMemo(() => IoMapSchema.safeParse(draft), [draft]);
  const update = (next: Draft) => setIoMap(next);

  const programTags = useMemo(() => {
    const t = new Set<string>();
    for (const r of rungs)
      for (const row of r.cells) for (const c of row) if (c.operand) t.add(c.operand);
    for (const s of studio?.ioSymbols ?? []) t.add(s.symbolicName || s.address);
    for (const v of project.variables) if (v.name) t.add(v.name);
    return [...t].filter(Boolean).sort();
  }, [rungs, studio, project.variables]);

  // ── conexões
  const [connForm, setConnForm] = useState({
    id: "io1",
    host: "",
    port: "502",
    unitId: "1",
    pollMs: "100",
  });
  const addModbus = () => {
    const candidate = {
      id: connForm.id.trim(),
      kind: "modbus_tcp",
      host: connForm.host.trim(),
      port: num(connForm.port) ?? 502,
      unitId: num(connForm.unitId) ?? 1,
      pollMs: num(connForm.pollMs) ?? 100,
      timeoutMs: 1000,
    };
    const r = IoMapSchema.safeParse({ connections: [candidate], points: [] });
    if (!r.success) return toast.error(r.error.issues[0]?.message ?? "conexão inválida");
    if (draft.connections.some((c) => c.id === candidate.id))
      return toast.error("id de conexão já existe");
    update({ ...draft, connections: [...draft.connections, candidate] });
  };
  const addSimulated = () => {
    if (draft.connections.some((c) => c.id === "sim")) return;
    update({
      ...draft,
      connections: [
        ...draft.connections,
        { id: "sim", kind: "simulated", label: "Bancada virtual" },
      ],
    });
  };

  // ── pontos
  const addPoint = () => {
    const conn = draft.connections[0];
    if (!conn) return toast.error("cadastre uma conexão de campo primeiro");
    const used = new Set(draft.points.map((p) => p.tag));
    const tag = programTags.find((t) => !used.has(t)) ?? "";
    update({
      ...draft,
      points: [
        ...draft.points,
        {
          tag,
          direction: "input",
          dataType: "BOOL",
          connectionId: conn.id,
          ...(conn.kind === "modbus_tcp" ? { modbus: { area: "discrete_input", address: 0 } } : {}),
          writeEnabled: false,
        },
      ],
    });
  };
  const setPoint = (i: number, patch: Record<string, unknown>) => {
    const points = draft.points.map((p, k) => (k === i ? { ...p, ...patch } : p));
    update({ ...draft, points });
  };
  const setModbus = (i: number, patch: Record<string, unknown>) => {
    const p = draft.points[i];
    setPoint(i, { modbus: { ...((p.modbus as Record<string, unknown>) ?? {}), ...patch } });
  };

  // ── pacote
  const [label, setLabel] = useState("");
  const [built, setBuilt] = useState<BuildPackageResult | null>(null);
  const build = async () => {
    if (!current?.id) return toast.error("abra um projeto salvo para gerar o pacote");
    const initialTags: Record<string, unknown> = {};
    for (const t of Object.values(editorTags))
      if (t.direction === "memory") initialTags[t.name] = t.value;
    const r = await buildRuntimePackage({
      projectId: current.id,
      projectName: current.name,
      label,
      scanMs: Math.min(1000, Math.max(10, Math.round(project.cycleTimeMs || 20))),
      rungs,
      studio: studio ?? null,
      hmi: hmi.equipment.length ? hmi : null,
      ioMap: draft,
      initialTags,
    });
    setBuilt(r);
    if (!r.ok) toast.error(r.errors[0]);
  };
  const download = () => {
    if (!built?.ok) return;
    const blob = new Blob([JSON.stringify(built.pkg)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `runtime-${built.hash.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── nuvem
  const [cloud, setCloud] = useState<{
    available: boolean;
    role: string | null;
    packages: RuntimePackageRow[];
    devices: RuntimeDeviceRow[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");

  const refresh = useCallback(async () => {
    if (!current?.id) return;
    try {
      setCloud(await listRuntime({ data: { projectId: current.id } }));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [current?.id]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const projectId = current?.id ?? "";
  const approved = cloud?.packages.filter((p) => p.approved_at && !p.revoked_at) ?? [];
  const errors = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  const ioMap: IoMap | null = parsed.success ? parsed.data : null;

  return (
    <div className="space-y-4 p-4 text-xs">
      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed">
        <strong>ElétricAi Runtime — escrita em campo.</strong> O gateway só escreve nas saídas com o
        pacote <em>aprovado</em>, a emergência do campo mapeada e íntegra, comunicação ok e o{" "}
        <em>arme local</em> feito no WebVisu com PIN. Qualquer falha põe as saídas no valor seguro e
        exige novo arme. Um botão de software não substitui o circuito físico de emergência (NR-10 /
        NR-12).
      </div>

      {/* Conexões */}
      <section className="rounded border border-border bg-card/40">
        <header className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          1 · Conexões de campo
        </header>
        <div className="space-y-2 p-3">
          {draft.connections.map((c, i) => (
            <div key={String(c.id)} className="flex items-center justify-between gap-2 font-mono">
              <span>
                {String(c.id)} ·{" "}
                {c.kind === "modbus_tcp"
                  ? `Modbus TCP ${String(c.host)}:${String(c.port)} (unidade ${String(c.unitId)}, ${String(c.pollMs)} ms)`
                  : "simulada (bancada virtual)"}
              </span>
              <button
                className={btn}
                onClick={() =>
                  update({ ...draft, connections: draft.connections.filter((_, k) => k !== i) })
                }
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input
              className={input}
              placeholder="id"
              value={connForm.id}
              onChange={(e) => setConnForm({ ...connForm, id: e.target.value })}
              aria-label="id da conexão"
            />
            <input
              className={`${input} sm:col-span-2`}
              placeholder="IP do módulo de E/S"
              value={connForm.host}
              onChange={(e) => setConnForm({ ...connForm, host: e.target.value })}
              aria-label="host"
            />
            <input
              className={input}
              placeholder="porta"
              value={connForm.port}
              onChange={(e) => setConnForm({ ...connForm, port: e.target.value })}
              aria-label="porta"
            />
            <input
              className={input}
              placeholder="unidade"
              value={connForm.unitId}
              onChange={(e) => setConnForm({ ...connForm, unitId: e.target.value })}
              aria-label="unidade"
            />
            <input
              className={input}
              placeholder="leitura ms"
              value={connForm.pollMs}
              onChange={(e) => setConnForm({ ...connForm, pollMs: e.target.value })}
              aria-label="intervalo de leitura"
            />
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={addModbus}>
              <Plus className="h-3 w-3" /> Modbus TCP
            </button>
            <button className={btn} onClick={addSimulated}>
              <Plus className="h-3 w-3" /> Bancada virtual
            </button>
          </div>
        </div>
      </section>

      {/* Pontos */}
      <section className="rounded border border-border bg-card/40">
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            2 · Mapa de E/S ({draft.points.length})
          </span>
          <button className={btn} onClick={addPoint}>
            <Plus className="h-3 w-3" /> Ponto
          </button>
        </header>
        <datalist id="runtime-program-tags">
          {programTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                {[
                  "Tag",
                  "Sentido",
                  "Tipo",
                  "Conexão",
                  "Área",
                  "Endereço",
                  "Escala",
                  "Escreve",
                  "Seguro",
                  "Mín",
                  "Máx",
                  "",
                ].map((h) => (
                  <th key={h} className={cell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.points.map((p, i) => {
                const m = (p.modbus as Record<string, unknown> | undefined) ?? {};
                const conn = draft.connections.find((c) => c.id === p.connectionId);
                const isOut = p.direction === "output";
                return (
                  <tr key={i}>
                    <td className={cell}>
                      <input
                        className={input}
                        list="runtime-program-tags"
                        value={String(p.tag ?? "")}
                        onChange={(e) => setPoint(i, { tag: e.target.value })}
                        aria-label="tag"
                      />
                    </td>
                    <td className={cell}>
                      <select
                        className={input}
                        value={String(p.direction)}
                        onChange={(e) =>
                          setPoint(i, {
                            direction: e.target.value,
                            ...(e.target.value === "input" ? { writeEnabled: false } : {}),
                          })
                        }
                      >
                        <option value="input">entrada</option>
                        <option value="output">saída</option>
                      </select>
                    </td>
                    <td className={cell}>
                      <select
                        className={input}
                        value={String(p.dataType)}
                        onChange={(e) =>
                          setPoint(i, { dataType: e.target.value, safeValue: undefined })
                        }
                      >
                        <option>BOOL</option>
                        <option>INT</option>
                        <option>REAL</option>
                      </select>
                    </td>
                    <td className={cell}>
                      <select
                        className={input}
                        value={String(p.connectionId)}
                        onChange={(e) => setPoint(i, { connectionId: e.target.value })}
                      >
                        {draft.connections.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {String(c.id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={cell}>
                      {conn?.kind === "modbus_tcp" ? (
                        <select
                          className={input}
                          value={String(m.area ?? "")}
                          onChange={(e) => setModbus(i, { area: e.target.value })}
                        >
                          {MODBUS_AREAS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cell}>
                      {conn?.kind === "modbus_tcp" && (
                        <input
                          className={input}
                          value={m.address === undefined ? "" : String(m.address)}
                          onChange={(e) => setModbus(i, { address: num(e.target.value) })}
                          aria-label="endereço"
                        />
                      )}
                    </td>
                    <td className={cell}>
                      {conn?.kind === "modbus_tcp" && p.dataType !== "BOOL" && (
                        <input
                          className={input}
                          value={m.scale === undefined ? "1" : String(m.scale)}
                          onChange={(e) => setModbus(i, { scale: num(e.target.value) })}
                          aria-label="escala"
                        />
                      )}
                    </td>
                    <td className={cell}>
                      <input
                        type="checkbox"
                        disabled={!isOut}
                        checked={p.writeEnabled === true}
                        onChange={(e) => setPoint(i, { writeEnabled: e.target.checked })}
                        aria-label="escrita habilitada"
                      />
                    </td>
                    <td className={cell}>
                      {isOut &&
                        (p.dataType === "BOOL" ? (
                          <select
                            className={input}
                            value={p.safeValue === undefined ? "" : String(p.safeValue)}
                            onChange={(e) =>
                              setPoint(i, {
                                safeValue:
                                  e.target.value === "" ? undefined : e.target.value === "true",
                              })
                            }
                          >
                            <option value="">—</option>
                            <option value="false">0 (desligado)</option>
                            <option value="true">1</option>
                          </select>
                        ) : (
                          <input
                            className={input}
                            value={p.safeValue === undefined ? "" : String(p.safeValue)}
                            onChange={(e) => setPoint(i, { safeValue: num(e.target.value) })}
                            aria-label="valor seguro"
                          />
                        ))}
                    </td>
                    <td className={cell}>
                      {isOut && p.dataType !== "BOOL" && (
                        <input
                          className={input}
                          value={p.min === undefined ? "" : String(p.min)}
                          onChange={(e) => setPoint(i, { min: num(e.target.value) })}
                          aria-label="mínimo"
                        />
                      )}
                    </td>
                    <td className={cell}>
                      {isOut && p.dataType !== "BOOL" && (
                        <input
                          className={input}
                          value={p.max === undefined ? "" : String(p.max)}
                          onChange={(e) => setPoint(i, { max: num(e.target.value) })}
                          aria-label="máximo"
                        />
                      )}
                    </td>
                    <td className={cell}>
                      <button
                        className={btn}
                        onClick={() =>
                          update({ ...draft, points: draft.points.filter((_, k) => k !== i) })
                        }
                        aria-label="remover ponto"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <label className="font-mono text-[11px]">
            Emergência do campo (entrada NF, 1 = íntegra):
          </label>
          <select
            className={`${input} w-48`}
            value={draft.estopTag ?? ""}
            onChange={(e) =>
              update({
                ...draft,
                ...(e.target.value ? { estopTag: e.target.value } : { estopTag: undefined }),
              })
            }
          >
            <option value="">— não mapeada —</option>
            {draft.points
              .filter((p) => p.direction === "input" && p.dataType === "BOOL")
              .map((p) => (
                <option key={String(p.tag)} value={String(p.tag)}>
                  {String(p.tag)}
                </option>
              ))}
          </select>
        </div>
        {errors.length > 0 && (
          <ul
            className="space-y-0.5 px-3 pb-3 text-[11px] text-destructive"
            data-testid="runtime-iomap-errors"
          >
            {errors.slice(0, 12).map((e, k) => (
              <li key={k}>• {e}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Pacote */}
      <section className="rounded border border-border bg-card/40">
        <header className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          3 · Pacote do programa
        </header>
        <div className="space-y-2 p-3">
          <p className="text-muted-foreground">
            Junta {rungs.length} rede(s) Ladder, {studio?.pages.length ?? 0} página(s) do FB Studio,{" "}
            {hmi.equipment.length} equipamento(s) da tela HMI e o mapa de E/S. Ciclo:{" "}
            {Math.min(1000, Math.max(10, Math.round(project.cycleTimeMs || 20)))} ms.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${input} w-64`}
              placeholder="rótulo da versão (ex.: rev 3 — partida M1)"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 120))}
            />
            <button className={btn} onClick={() => void build()} disabled={!ioMap}>
              Gerar pacote
            </button>
            <button className={btn} onClick={download} disabled={!built?.ok}>
              <DownloadSimple className="h-3 w-3" /> Baixar .json
            </button>
            <button
              className={btn}
              disabled={!built?.ok || busy || !cloud?.available}
              onClick={() =>
                built?.ok &&
                void run(
                  () => publishRuntimePackage({ data: { projectId, label, package: built.pkg } }),
                  "Pacote publicado — falta aprovar",
                )
              }
            >
              <CloudArrowUp className="h-3 w-3" /> Publicar
            </button>
          </div>
          {built?.ok && (
            <div className="font-mono text-[11px]" data-testid="runtime-built">
              SHA-256 {built.hash} · {(built.bytes / 1024).toFixed(1)} KB
              {built.warnings.map((w) => (
                <div key={w} className="text-amber-600 dark:text-amber-300">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
          {built && !built.ok && (
            <ul className="text-[11px] text-destructive">
              {built.errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Versões e dispositivos */}
      <section className="rounded border border-border bg-card/40">
        <header className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          4 · Versões publicadas e gateways
        </header>
        {!current?.id ? (
          <p className="p-3 text-muted-foreground">
            Abra um projeto salvo para publicar e implantar.
          </p>
        ) : cloud && !cloud.available ? (
          <p className="p-3 text-muted-foreground">
            O Runtime está sendo ativado no servidor (tabelas pendentes).
          </p>
        ) : (
          <div className="space-y-4 p-3">
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className={cell}>Versão</th>
                  <th className={cell}>Hash</th>
                  <th className={cell}>Situação</th>
                  <th className={cell} />
                </tr>
              </thead>
              <tbody>
                {(cloud?.packages ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className={cell}>
                      v{p.version} {p.label}
                    </td>
                    <td className={`${cell} font-mono`}>{p.sha256.slice(0, 12)}</td>
                    <td className={cell}>
                      {p.revoked_at
                        ? "revogado"
                        : p.approved_at
                          ? "aprovado"
                          : "aguardando aprovação"}
                    </td>
                    <td className={`${cell} space-x-1 text-right`}>
                      {!p.approved_at && !p.revoked_at && (
                        <button
                          className={btn}
                          disabled={busy}
                          onClick={() => {
                            if (
                              !confirm(
                                `Aprovar v${p.version} para execução em campo? A aprovação fica registrada em seu nome.`,
                              )
                            )
                              return;
                            void run(
                              () => approveRuntimePackage({ data: { projectId, packageId: p.id } }),
                              "Versão aprovada",
                            );
                          }}
                        >
                          <SealCheck className="h-3 w-3" /> Aprovar
                        </button>
                      )}
                      {!p.revoked_at && (
                        <button
                          className={btn}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => revokeRuntimePackage({ data: { projectId, packageId: p.id } }),
                              "Versão revogada",
                            )
                          }
                        >
                          <Prohibit className="h-3 w-3" /> Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {cloud && cloud.packages.length === 0 && (
                  <tr>
                    <td className={cell} colSpan={4}>
                      Nenhuma versão publicada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="space-y-2">
              {(cloud?.devices ?? []).map((d) => {
                const st = d.last_state as { blockers?: string[]; lastScanMs?: number };
                const online = d.last_seen_at
                  ? Date.now() - Date.parse(d.last_seen_at) < 30_000
                  : false;
                return (
                  <div key={d.id} className="rounded border border-border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono">
                        {d.name} · {d.token_prefix}… ·{" "}
                        {d.revoked_at
                          ? "revogado"
                          : online
                            ? `${d.last_mode ?? "?"} · ${st.lastScanMs ?? "?"} ms`
                            : "sem contato"}
                      </span>
                      {!d.revoked_at && (
                        <span className="flex flex-wrap gap-1">
                          <select
                            className={`${input} w-44`}
                            value={d.target_package_id ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              void run(
                                () =>
                                  setRuntimeDeviceTarget({
                                    data: {
                                      projectId,
                                      deviceId: d.id,
                                      packageId: e.target.value || null,
                                    },
                                  }),
                                "Implantação atualizada",
                              )
                            }
                          >
                            <option value="">— nenhum pacote —</option>
                            {approved.map((p) => (
                              <option key={p.id} value={p.id}>
                                v{p.version} {p.sha256.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                          <button
                            className={btn}
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  setRuntimeDeviceStop({
                                    data: { projectId, deviceId: d.id, stop: !d.stop_requested },
                                  }),
                                d.stop_requested
                                  ? "Pedido de parada retirado"
                                  : "Parada solicitada",
                              )
                            }
                          >
                            {d.stop_requested ? (
                              <Play className="h-3 w-3" />
                            ) : (
                              <Stop className="h-3 w-3" />
                            )}
                            {d.stop_requested ? "Retirar parada" : "Parar"}
                          </button>
                          <button
                            className={btn}
                            disabled={busy}
                            onClick={() => {
                              if (!confirm(`Revogar ${d.name}? O token deixa de funcionar.`))
                                return;
                              void run(
                                () => revokeRuntimeDevice({ data: { projectId, deviceId: d.id } }),
                                "Dispositivo revogado",
                              );
                            }}
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                    {online && st.blockers && st.blockers.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Não escreve porque: {st.blockers.join("; ")}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${input} w-56`}
                  placeholder="nome do gateway (ex.: Painel CCM-01)"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value.slice(0, 80))}
                />
                <button
                  className={btn}
                  disabled={busy || !deviceName.trim()}
                  onClick={() =>
                    void run(async () => {
                      const r = await createRuntimeDevice({
                        data: { projectId, name: deviceName.trim() },
                      });
                      setNewToken(r.token);
                      setDeviceName("");
                    }, "Gateway cadastrado")
                  }
                >
                  <Plus className="h-3 w-3" /> Gateway
                </button>
              </div>
              {newToken && (
                <div
                  className="rounded border border-primary/50 bg-primary/5 p-3 font-mono text-[11px]"
                  data-testid="runtime-new-token"
                >
                  <p className="mb-1 font-sans">
                    Token do gateway — aparece <strong>só agora</strong>. Configure no gateway e
                    guarde em local seguro:
                  </p>
                  <pre className="whitespace-pre-wrap break-all">{`ELETRICAI_CLOUD_URL=${typeof window !== "undefined" ? window.location.origin : ""}
ELETRICAI_DEVICE_TOKEN=${newToken}
ELETRICAI_LOCAL_PIN=<PIN de pelo menos 6 caracteres>
node eletricai-runtime.mjs`}</pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      className={btn}
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(newToken)
                          .then(() => toast.success("Token copiado"))
                      }
                    >
                      <Copy className="h-3 w-3" /> Copiar token
                    </button>
                    <button className={btn} onClick={() => setNewToken(null)}>
                      Já guardei
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
