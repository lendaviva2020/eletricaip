import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Edit2, Mail, Phone, Globe, MapPin, Briefcase, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { getClient } from "@/lib/clients.functions";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [{ title: "Cliente · EletricAI" }],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const getFn = useServerFn(getClient);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => getFn({ data: { id: clientId } }),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando cliente…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "Cliente não encontrado."}
        </p>
        <Button variant="outline" onClick={() => navigate({ to: "/clients" })}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const c = data.client;
  const projects = data.projects;

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4" /> Clientes
            </Link>
          </Button>
          <Button onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4" /> Editar
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 flex items-start gap-5 flex-wrap">
            {c.logo_url ? (
              <img
                src={c.logo_url}
                alt={c.name}
                className="h-16 w-16 rounded-xl object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-xl grid place-items-center text-2xl font-semibold text-primary bg-primary/15">
                {c.name[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">{c.name}</h1>
                <Badge variant="outline">{c.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {c.sector || "—"} {c.cnpj ? `· CNPJ ${c.cnpj}` : ""}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <KPI label="Projetos" value={String(projects.length)} />
                <KPI label="SLA" value={`${Number(c.sla_pct).toFixed(1)}%`} />
                <KPI label="Contato" value={c.contact_name || "—"} />
                <KPI
                  label="Desde"
                  value={new Date(c.created_at).toLocaleDateString("pt-BR")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="projects">Projetos ({projects.length})</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoRow icon={Mail} label="Email" value={c.email} />
            <InfoRow icon={Phone} label="Telefone" value={c.phone} />
            <InfoRow icon={Globe} label="Website" value={c.website} link />
            <InfoRow icon={MapPin} label="Endereço" value={c.address} />
            <InfoRow icon={Briefcase} label="Setor" value={c.sector} />
            <InfoRow icon={FileText} label="CNPJ" value={c.cnpj} />
          </TabsContent>

          <TabsContent value="projects" className="mt-4">
            {projects.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl py-12 text-center">
                Nenhum projeto vinculado a este cliente.
              </div>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-5 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.status ?? "—"} · atualizado{" "}
                          {new Date(p.updated_at).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardContent className="p-5 text-sm whitespace-pre-wrap">
                {c.notes || (
                  <span className="text-muted-foreground">Nenhuma nota registrada.</span>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} initial={c} />
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5 truncate">{value}</div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-muted grid place-items-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {value ? (
            link ? (
              <a
                href={value.startsWith("http") ? value : `https://${value}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {value}
              </a>
            ) : (
              <div className="text-sm break-all">{value}</div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
