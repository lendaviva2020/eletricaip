import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Trash2, Check, Copy } from "lucide-react";
import {
  listTenantMembers,
  listTenantInvites,
  createInvite,
  revokeInvite,
  removeMember,
  updateMemberRole,
} from "@/lib/tenants.functions";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/settings/team")({
  head: () => ({ meta: [{ title: "Equipe · EletricAI" }] }),
  component: TeamPage,
});

const ROLES = ["admin", "engineer", "operator", "viewer"] as const;
type Role = typeof ROLES[number];

function TeamPage() {
  const { tenants, active, switchTo } = useActiveTenant();
  const members = useServerFn(listTenantMembers);
  const invites = useServerFn(listTenantInvites);
  const invite = useServerFn(createInvite);
  const revoke = useServerFn(revokeInvite);
  const kick = useServerFn(removeMember);
  const setRole = useServerFn(updateMemberRole);
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRoleVal] = useState<Role>("engineer");

  const { data: memberList = [] } = useQuery({
    queryKey: ["tenant-members", active?.id],
    queryFn: () => members({}),
    enabled: !!active,
  });
  const { data: inviteList = [] } = useQuery({
    queryKey: ["tenant-invites", active?.id],
    queryFn: () => invites({}),
    enabled: !!active,
  });

  async function handleInvite() {
    if (!email.trim()) return;
    try {
      const inv = await invite({ data: { email: email.trim(), role } });
      toast.success(`Convite criado. Link: ${window.location.origin}/invite/${inv.token}`);
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["tenant-invites", active?.id] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-4xl mx-auto">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      <h1 className="text-2xl font-bold mb-6">Equipe & Workspaces</h1>

      <section className="mb-8">
        <h2 className="font-semibold mb-3">Workspaces</h2>
        <div className="space-y-2">
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between border border-border rounded-md px-4 py-3">
              <div>
                <p className="font-medium">{t.name} <span className="text-xs text-muted-foreground">({t.plan})</span></p>
                <p className="text-xs text-muted-foreground">Papel: {t.role}</p>
              </div>
              {t.isActive ? (
                <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3 h-3" /> Ativo</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => switchTo(t.id)}>Trocar</Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Convidar membro</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
          <div>
            <Label htmlFor="invemail">E-mail</Label>
            <Input id="invemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRoleVal(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={handleInvite}>Convidar</Button></div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-semibold mb-3">Convites pendentes</h2>
        {inviteList.filter((i) => !i.accepted_at).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
        ) : (
          <div className="space-y-2">
            {inviteList.filter((i) => !i.accepted_at).map((i) => (
              <div key={i.id} className="flex items-center justify-between border border-border rounded-md px-4 py-2 text-sm">
                <div>
                  <span className="font-medium">{i.email}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {i.role}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${i.token}`);
                    toast.success("Link copiado");
                  }}><Copy className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await revoke({ data: { inviteId: i.id } });
                    await qc.invalidateQueries({ queryKey: ["tenant-invites", active?.id] });
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3">Membros</h2>
        <div className="space-y-2">
          {memberList.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between border border-border rounded-md px-4 py-2 text-sm">
              <div>
                <p className="font-medium">{m.full_name || m.user_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">Desde {new Date(m.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.role} onValueChange={async (v) => {
                  await setRole({ data: { userId: m.user_id, role: v as Role } });
                  await qc.invalidateQueries({ queryKey: ["tenant-members", active?.id] });
                }}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm("Remover este membro?")) return;
                  try {
                    await kick({ data: { userId: m.user_id } });
                    await qc.invalidateQueries({ queryKey: ["tenant-members", active?.id] });
                  } catch (e) { toast.error((e as Error).message); }
                }}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
