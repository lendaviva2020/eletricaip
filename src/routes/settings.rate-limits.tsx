import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save, Trash2, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listAiRateLimitConfigs,
  upsertAiRateLimitConfig,
  deleteAiRateLimitConfig,
} from "@/lib/security/ai-rate-limit-config.functions";
import { getIsPlatformAdmin } from "@/lib/billing.functions";

export const Route = createFileRoute("/settings/rate-limits")({
  head: () => ({
    meta: [
      { title: "Rate Limits · EletricAI" },
      { name: "description", content: "Ajuste janelas de burst e limites de fallback por usuário." },
    ],
  }),
  component: RateLimitsPage,
});

interface Row {
  id?: string;
  user_id: string | null;
  burst_window_ms: number;
  burst_max: number;
  fallback_window_ms: number;
  fallback_max: number;
  note: string | null;
  updated_at?: string;
}

const EMPTY: Row = {
  user_id: null,
  burst_window_ms: 10_000,
  burst_max: 10,
  fallback_window_ms: 10_000,
  fallback_max: 10,
  note: "",
};

function RateLimitsPage() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getIsPlatformAdmin);
  const fetchList = useServerFn(listAiRateLimitConfigs);
  const upsertFn = useServerFn(upsertAiRateLimitConfig);
  const deleteFn = useServerFn(deleteAiRateLimitConfig);

  const adminQ = useQuery({ queryKey: ["is-platform-admin"], queryFn: () => fetchAdmin() });
  const listQ = useQuery({
    queryKey: ["ai-rate-limit-configs"],
    queryFn: () => fetchList(),
    enabled: !!adminQ.data,
  });

  const [draft, setDraft] = useState<Row>(EMPTY);

  const upsertM = useMutation({
    mutationFn: (row: Row) =>
      upsertFn({
        data: {
          id: row.id,
          user_id: row.user_id,
          burst_window_ms: row.burst_window_ms,
          burst_max: row.burst_max,
          fallback_window_ms: row.fallback_window_ms,
          fallback_max: row.fallback_max,
          note: row.note ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["ai-rate-limit-configs"] });
      setDraft(EMPTY);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Configuração removida");
      qc.invalidateQueries({ queryKey: ["ai-rate-limit-configs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  if (adminQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando permissões…</div>;
  }

  if (!adminQ.data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div>
              <div className="font-medium">Acesso restrito</div>
              <div className="text-sm text-muted-foreground">
                Apenas administradores da plataforma podem acessar esta tela.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows: Row[] = (listQ.data?.rows ?? []) as Row[];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Rate Limits de IA</h1>
          <p className="text-sm text-muted-foreground">
            Janelas de burst (Upstash) e limites de fallback per-instance. Deixe
            o usuário vazio para definir a configuração <strong>global</strong>.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["ai-rate-limit-configs"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Recarregar
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Nova configuração / editar
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="User ID (UUID, vazio = global)">
              <Input
                value={draft.user_id ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, user_id: e.target.value.trim() || null })
                }
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </Field>
            <Field label="Burst window (ms)">
              <Input
                type="number"
                min={1000}
                max={3_600_000}
                value={draft.burst_window_ms}
                onChange={(e) => setDraft({ ...draft, burst_window_ms: Number(e.target.value) })}
              />
            </Field>
            <Field label="Burst máx (req)">
              <Input
                type="number"
                min={1}
                max={10_000}
                value={draft.burst_max}
                onChange={(e) => setDraft({ ...draft, burst_max: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fallback window (ms)">
              <Input
                type="number"
                min={1000}
                max={3_600_000}
                value={draft.fallback_window_ms}
                onChange={(e) => setDraft({ ...draft, fallback_window_ms: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fallback máx (req)">
              <Input
                type="number"
                min={1}
                max={10_000}
                value={draft.fallback_max}
                onChange={(e) => setDraft({ ...draft, fallback_max: Number(e.target.value) })}
              />
            </Field>
            <Field label="Nota (opcional)">
              <Input
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                maxLength={500}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            {draft.id && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY)}>
                Cancelar
              </Button>
            )}
            <Button
              size="sm"
              disabled={upsertM.isPending}
              onClick={() => upsertM.mutate(draft)}
            >
              <Save className="mr-2 h-4 w-4" /> Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Alvo</th>
                  <th className="px-3 py-2 text-left">Burst</th>
                  <th className="px-3 py-2 text-left">Fallback</th>
                  <th className="px-3 py-2 text-left">Nota</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!listQ.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Nenhuma configuração. Usando defaults (10 req / 10s).
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.user_id ? (
                        r.user_id
                      ) : (
                        <Badge variant="secondary">global</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.burst_max} / {r.burst_window_ms}ms
                    </td>
                    <td className="px-3 py-2">
                      {r.fallback_max} / {r.fallback_window_ms}ms
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDraft(r)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={deleteM.isPending}
                        onClick={() => r.id && deleteM.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
