import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  UserPlus,
  Trash,
  Check,
  Copy,
  Users,
  Buildings,
  ShieldCheck,
  UserGear,
  User,
  Eye,
  EnvelopeSimple,
  Clock,
  CircleNotch,
  ArrowsClockwise,
  DotsThree,
  WifiHigh,
  WifiSlash,
  Robot,
  Pulse,
  CaretRight,
  SignOut,
  MagnifyingGlass,
  Funnel,
  Folders,
  Gauge,
  WarningCircle,
  CheckCircle,
  X,
  Cpu,
} from "@phosphor-icons/react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PermissionMatrix } from "@/components/premium/permission-matrix";

export const Route = createFileRoute("/settings/team")({
  head: () => ({ meta: [{ title: "Centro Operacional · EletricAI" }] }),
  component: TeamPage,
});

const ROLES = ["admin", "engineer", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_CONFIG: Record<Role, { icon: typeof ShieldCheck; label: string; desc: string }> = {
  admin: { icon: ShieldCheck, label: "Admin", desc: "Acesso total à configuração do workspace" },
  engineer: { icon: UserGear, label: "Engenheiro", desc: "Pode editar projetos e normas" },
  operator: { icon: User, label: "Operador", desc: "Visualização e operação do SCADA" },
  viewer: { icon: Eye, label: "Visualizador", desc: "Acesso somente leitura" },
};

function TeamPage() {
  const navigate = useNavigate();
  const { tenants, active, switchTo, loading: tenantLoading } = useActiveTenant();
  const membersFn = useServerFn(listTenantMembers);
  const invitesFn = useServerFn(listTenantInvites);
  const inviteFn = useServerFn(createInvite);
  const revokeFn = useServerFn(revokeInvite);
  const kickFn = useServerFn(removeMember);
  const setRoleFn = useServerFn(updateMemberRole);
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRoleVal] = useState<Role>("engineer");
  const [busy, setBusy] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState("engenharia");
  const [inviteName, setInviteName] = useState("");
  const [inviteSector, setInviteSector] = useState("engenharia");

  const {
    data: memberList = [],
    isLoading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["tenant-members", active?.id],
    queryFn: () => membersFn({}),
    enabled: !!active?.id,
  });

  const {
    data: inviteList = [],
    isLoading: invitesLoading,
    error: invitesError,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ["tenant-invites", active?.id],
    queryFn: () => invitesFn({}),
    enabled: !!active?.id,
  });

  const handleInvite = useCallback(async () => {
    if (!email.trim()) return;
    setBusy("invite");
    try {
      const inv = await inviteFn({
        data: {
          email: email.trim(),
          role,
          invitedName: inviteName.trim() || undefined,
          invitedSector: inviteSector || undefined,
        },
      });
      toast.success(`Convite criado. Link: ${window.location.origin}/invite/${inv.token}`);
      setEmail("");
      setInviteName("");
      setInviteOpen(false);
      await qc.invalidateQueries({ queryKey: ["tenant-invites", active?.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [email, role, inviteFn, inviteName, inviteSector, active?.id, qc]);

  const handleRevoke = useCallback(
    async (id: string) => {
      setBusy(`revoke:${id}`);
      try {
        await revokeFn({ data: { inviteId: id } });
        await qc.invalidateQueries({ queryKey: ["tenant-invites", active?.id] });
        toast.success("Convite revogado.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [revokeFn, active?.id, qc],
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!confirm("Remover este membro do workspace?")) return;
      setBusy(`kick:${userId}`);
      try {
        await kickFn({ data: { userId } });
        await qc.invalidateQueries({ queryKey: ["tenant-members", active?.id] });
        toast.success("Membro removido.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [kickFn, active?.id, qc],
  );

  const handleUpdateRole = useCallback(
    async (userId: string, newRole: Role) => {
      setBusy(`role:${userId}`);
      try {
        await setRoleFn({ data: { userId, role: newRole } });
        await qc.invalidateQueries({ queryKey: ["tenant-members", active?.id] });
        toast.success("Papel atualizado.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [setRoleFn, active?.id, qc],
  );

  const handleWorkspaceSwitch = useCallback(
    async (id: string) => {
      try {
        await switchTo(id);
        toast.success("Workspace alterado.");
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [switchTo],
  );

  const workspaces = tenants;
  const displayMembers = memberList;
  const displayInvites = inviteList;
  const loadingMembers = membersLoading;

  const onlineCount = displayMembers.length;
  const filteredMembers = displayMembers.filter(
    (m) =>
      !memberSearch.trim() ||
      (m.full_name || "").toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.user_id || "").toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const orgTree = [
    {
      id: "empresa",
      label: "EletricAI Industrial",
      icon: Buildings,
      children: [
        { id: "engenharia", label: "Engenharia", icon: UserGear, count: 3 },
        { id: "automacao", label: "Automação", icon: Cpu, count: 2 },
        { id: "manutencao", label: "Manutenção", icon: Gauge, count: 1 },
        { id: "supervisao", label: "Supervisão", icon: Eye, count: 1 },
        { id: "diretoria", label: "Diretoria", icon: ShieldCheck, count: 1 },
      ],
    },
  ];

  const permRows = [
    { label: "Projetos", key: "projects", view: true, edit: true, execute: true, admin: false },
    {
      label: "Normas técnicas",
      key: "normas",
      view: true,
      edit: true,
      execute: false,
      admin: false,
    },
    { label: "SCADA / PLC", key: "scada", view: true, edit: false, execute: true, admin: false },
    { label: "IA & Automações", key: "ai", view: true, edit: false, execute: true, admin: false },
    { label: "Usuários", key: "users", view: true, edit: false, execute: false, admin: true },
    { label: "Faturamento", key: "billing", view: true, edit: false, execute: false, admin: true },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* ─── Header ─── */}
      <header className="h-12 shrink-0 border-b border-border bg-panel flex items-center px-6 z-20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            aria-label="Voltar para configurações"
            onClick={() => navigate({ to: "/settings" })}
            className="flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Centro Operacional</p>
              <p className="text-[10px] text-muted-foreground/60">
                Gestão de equipe · {active?.name ?? "EletricAI Industrial"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${onlineCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"}`}
            />
            <span className="text-xs text-muted-foreground/80">{onlineCount} membros</span>
          </div>
          <div className="w-px h-6 bg-border/40" />
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Convidar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setPermOpen(true)}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Permissões
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto p-6">
          {(membersError || invitesError) && (
            <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs flex items-center justify-between text-destructive">
              <div className="flex items-center gap-2">
                <WarningCircle className="h-4 w-4 shrink-0" />
                <span>
                  Falha ao sincronizar dados da equipe:{" "}
                  {(membersError as Error)?.message || (invitesError as Error)?.message}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-destructive/30 hover:bg-destructive/20"
                onClick={() => {
                  refetchMembers();
                  refetchInvites();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {!active && (
            <div className="mb-6 rounded-xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground flex items-center gap-2">
              <WarningCircle className="h-4 w-4 shrink-0" />
              <span>
                Nenhum workspace ativo selecionado. Selecione um workspace na lista ao lado para
                gerenciar membros e convites.
              </span>
            </div>
          )}

          {/* ─── Top Stats ─── */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="rounded-md border border-border p-3.5 bg-card">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Membros
              </span>
              <p className="text-xl font-semibold mt-1">
                {displayMembers.length}{" "}
                <span className="text-xs text-muted-foreground/60 font-normal">total</span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3.5 bg-card">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Ativos
              </span>
              <p className="text-xl font-semibold mt-1">
                {onlineCount}{" "}
                <span className="text-xs text-muted-foreground/60 font-normal">registrados</span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3.5 bg-card">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Convites
              </span>
              <p className="text-xl font-semibold mt-1">
                {displayInvites.length}{" "}
                <span className="text-xs text-muted-foreground/60 font-normal">pendentes</span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3.5 bg-card">
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Workspaces
              </span>
              <p className="text-xl font-semibold mt-1">
                {workspaces.length}{" "}
                <span className="text-xs text-muted-foreground/60 font-normal">ativos</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* ─── Coluna Esquerda: Organograma ─── */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3 flex items-center gap-1.5">
                <Folders className="h-3 w-3" /> Organização
              </span>
              <Card>
                <CardContent className="p-3 space-y-1">
                  {orgTree[0].children.map((child) => {
                    const ChildIcon = child.icon;
                    const isSelected = selectedOrg === child.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedOrg(child.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground/70 hover:bg-muted/30"
                        }`}
                      >
                        <ChildIcon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : ""}`} />
                        <span className="flex-1 text-left">{child.label}</span>
                        <span
                          className={`text-[10px] ${isSelected ? "text-primary/70" : "text-muted-foreground/40"}`}
                        >
                          {child.count}
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Workspaces */}
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mt-5 mb-3 flex items-center gap-1.5">
                <Buildings className="h-3 w-3" /> Workspaces
              </span>
              <div className="space-y-2">
                {workspaces.map((w: any) => {
                  const isActive = w.isActive;
                  return (
                    <div
                      key={w.id}
                      className={`rounded-lg border p-3 transition-all ${isActive ? "border-primary/30 bg-primary/[0.03]" : "border-border/30 hover:border-border/60"}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-md ${isActive ? "bg-primary/10" : "bg-muted/30"}`}
                        >
                          <Buildings
                            className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "text-muted-foreground/50"}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{w.name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                            <span>{w.plan}</span>
                            <span>·</span>
                            <span>{w.role}</span>
                          </div>
                        </div>
                        {isActive ? (
                          <Badge variant="default" className="text-[8px] h-4 gap-0.5">
                            <Check className="h-2 w-2" />
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleWorkspaceSwitch(w.id)}
                          >
                            <SignOut className="h-3 w-3 text-muted-foreground/50" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── Centro: Membros ─── */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium">
                  Membros ({filteredMembers.length})
                </span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                    <Input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Buscar membro..."
                      className="h-7 w-36 pl-7 text-[10px] rounded-md"
                    />
                  </div>
                </div>
              </div>

              {loadingMembers ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <CircleNotch className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Carregando membros…</span>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/40 p-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium">Nenhum membro encontrado</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    Envie convites para adicionar engenheiros e operadores a este workspace.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.map((m: any) => {
                    const memberRole = (m.role || "viewer") as Role;
                    const isCurrentUser = m.user_id === "current";
                    const initials = (m.full_name || m.user_id || "??").slice(0, 2).toUpperCase();
                    const isOnline = true;

                    return (
                      <div
                        key={m.user_id}
                        className="group relative rounded-md border border-border bg-card p-3.5 hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="relative shrink-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-secondary border border-border font-mono font-semibold text-xs text-foreground">
                              {initials}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${isOnline ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                            />
                          </div>
                          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="sm:col-span-2">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">
                                  {m.full_name || m.user_id?.slice(0, 8)}
                                </p>
                                {isCurrentUser && (
                                  <Badge variant="secondary" className="text-[8px] h-3.5">
                                    você
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                                {m.email ||
                                  `Membro desde ${m.created_at ? new Date(m.created_at).toLocaleDateString("pt-BR") : "recentemente"}`}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground/40 block">
                                Setor
                              </span>
                              <span className="text-[11px] font-medium capitalize">
                                {selectedOrg}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground/40 block">
                                Acesso
                              </span>
                              <span className="text-[11px] font-medium capitalize">
                                {ROLE_CONFIG[memberRole]?.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Select
                              value={memberRole}
                              onValueChange={(v) => {
                                handleUpdateRole(m.user_id, v as Role);
                              }}
                            >
                              <SelectTrigger className="h-7 w-28 text-[10px] rounded-md">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => {
                                  const RI = ROLE_CONFIG[r].icon;
                                  return (
                                    <SelectItem key={r} value={r} className="text-[10px]">
                                      <div className="flex items-center gap-1.5">
                                        <RI className="h-3 w-3" />
                                        {ROLE_CONFIG[r].label}
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {!isCurrentUser && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-destructive"
                                onClick={() => {
                                  handleRemoveMember(m.user_id);
                                }}
                                disabled={busy === `kick:${m.user_id}`}
                              >
                                {busy === `kick:${m.user_id}` ? (
                                  <CircleNotch className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Convites pendentes */}
              {displayInvites.length > 0 && (
                <div className="mt-6">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3">
                    Convites pendentes ({displayInvites.length})
                  </span>
                  <div className="space-y-2">
                    {displayInvites.map((i: any) => {
                      const RoleIcon = ROLE_CONFIG[i.role as Role]?.icon || User;
                      return (
                        <div
                          key={i.id}
                          className="rounded-lg border border-dashed border-border/40 p-3 flex items-center gap-3"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/30">
                            <EnvelopeSimple className="h-4 w-4 text-primary/60" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{i.email}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                              <RoleIcon className="h-2.5 w-2.5" />
                              {ROLE_CONFIG[i.role as Role]?.label || i.role}
                              {i.createdAt && (
                                <>
                                  <span>·</span>
                                  <Clock className="h-2.5 w-2.5" />
                                  {new Date(i.createdAt).toLocaleDateString("pt-BR")}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/invite/${i.token || i.id}`,
                                );
                                toast.success("Link copiado");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => handleRevoke(i.id)}
                              disabled={busy === `revoke:${i.id}`}
                            >
                              {busy === `revoke:${i.id}` ? (
                                <CircleNotch className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Coluna Direita: Atividade ─── */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3 flex items-center gap-1.5">
                <Pulse className="h-3 w-3" /> Atividade recente
              </span>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground/60 px-2 py-6 text-center">
                    Sem atividade de auditoria registrada recentemente neste workspace.
                  </p>
                </CardContent>
              </Card>

              {/* Membros do time */}
              <div className="mt-4 rounded-md border border-border p-3.5 bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Robot className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 font-medium">
                    Membros da equipe
                  </span>
                </div>
                {memberList.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {memberList.slice(0, 5).map((m: any) => {
                      const initials = (m.full_name || m.user_id || "??").slice(0, 2).toUpperCase();
                      return (
                        <div
                          key={m.user_id}
                          className="flex items-center justify-between text-[11px] py-1"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/40 text-[8px] font-semibold text-muted-foreground/70 shrink-0">
                              {initials}
                            </div>
                            <span className="truncate text-muted-foreground/80 font-medium">
                              {m.full_name || m.user_id?.slice(0, 8)}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[9px] capitalize shrink-0 ml-1">
                            {m.role}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 py-2">
                    Nenhum colaborador registrado além do criador.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Invite Modal ─── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Convidar membro
            </DialogTitle>
            <DialogDescription>
              O convidado receberá um link por e-mail para acessar o workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground/70">Nome completo</Label>
                <Input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Maria Souza"
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground/70">E-mail</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="maria@empresa.com"
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground/70">Setor</Label>
                <Select value={inviteSector} onValueChange={setInviteSector}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engenharia" className="text-xs">
                      Engenharia
                    </SelectItem>
                    <SelectItem value="automacao" className="text-xs">
                      Automação
                    </SelectItem>
                    <SelectItem value="manutencao" className="text-xs">
                      Manutenção
                    </SelectItem>
                    <SelectItem value="supervisao" className="text-xs">
                      Supervisão
                    </SelectItem>
                    <SelectItem value="diretoria" className="text-xs">
                      Diretoria
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground/70">Nível de acesso</Label>
                <Select value={role} onValueChange={(v) => setRoleVal(v as Role)}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => {
                      const RoleIcon = ROLE_CONFIG[r].icon;
                      return (
                        <SelectItem key={r} value={r} className="text-xs">
                          <div className="flex items-center gap-2">
                            <RoleIcon className="h-3 w-3" />
                            {ROLE_CONFIG[r].label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border/40 p-3 bg-muted/10">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 font-medium block mb-2">
                Preview da permissão
              </span>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle className="h-3 w-3" /> Visualizar projetos
                </div>
                <div
                  className={`flex items-center gap-2 ${role !== "viewer" ? "text-emerald-500" : "text-muted-foreground/30"}`}
                >
                  <CheckCircle className="h-3 w-3" /> Editar normas
                </div>
                <div
                  className={`flex items-center gap-2 ${role === "admin" || role === "engineer" || role === "operator" ? "text-emerald-500" : "text-muted-foreground/30"}`}
                >
                  <CheckCircle className="h-3 w-3" /> Executar SCADA
                </div>
                <div
                  className={`flex items-center gap-2 ${role === "admin" ? "text-emerald-500" : "text-muted-foreground/30"}`}
                >
                  <CheckCircle className="h-3 w-3" /> Administrar sistema
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleInvite}
              disabled={busy === "invite"}
              className="gap-1.5 text-xs"
            >
              {busy === "invite" ? (
                <CircleNotch className="h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3" />
              )}
              Enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Permission Modal ─── */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Matriz de permissões
            </DialogTitle>
            <DialogDescription>
              Configure as permissões granulares para cada papel da equipe.
            </DialogDescription>
          </DialogHeader>
          <PermissionMatrix rows={permRows} />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPermOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button size="sm" className="text-xs gap-1.5">
              <Check className="h-3 w-3" /> Salvar permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
