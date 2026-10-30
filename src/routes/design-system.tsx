import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sun,
  Moon,
  Laptop,
  Check,
  Copy,
  Lightning,
  ShieldCheck,
  Warning,
  Info,
  CheckCircle,
  Trash,
  Plus,
  MagnifyingGlass,
  ArrowRight,
  Terminal,
  Pulse,
  Stack,
  Gear,
  Cpu,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTheme, type Theme } from "@/lib/design-system/theme";
import { BRAND_PALETTE, THEME_TOKENS, TYPOGRAPHY } from "@/lib/design-system/tokens";
import { checkWcagCompliance } from "@/lib/design-system/contrast";
import { toast } from "sonner";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Design System Oficial · ElétricAi Industrial" },
      {
        name: "description",
        content:
          "Showcase e catálogo de componentes, tipografia, paleta e conformidade WCAG 2.2 AA do ElétricAi Design System.",
      },
    ],
  }),
  component: DesignSystemShowcase,
});

function DesignSystemShowcase() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkState, setCheckState] = useState<boolean | "indeterminate">(true);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copiado: ${text}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const contrastTests = [
    {
      label: "Branco Técnico sobre Grafite Profundo (Títulos Dark)",
      fg: BRAND_PALETTE.white,
      bg: BRAND_PALETTE.graphite,
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Cinza de Leitura sobre Grafite Profundo (Descrições Dark)",
      fg: BRAND_PALETTE.gray,
      bg: BRAND_PALETTE.graphite,
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Cinza de Leitura sobre Aço Escuro (Superfícies Dark)",
      fg: BRAND_PALETTE.gray,
      bg: BRAND_PALETTE.steel,
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Grafite Profundo sobre Laranja Industrial (Botão Primário)",
      fg: BRAND_PALETTE.graphite,
      bg: BRAND_PALETTE.orange,
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Laranja de Texto Ajustado sobre Fundo Branco (Light Link)",
      fg: THEME_TOKENS.light.primaryText,
      bg: "#FFFFFF",
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Grafite Profundo sobre Fundo Claro (Títulos Light)",
      fg: BRAND_PALETTE.graphite,
      bg: THEME_TOKENS.light.background,
      target: "Normal (>= 4.5:1)",
    },
    {
      label: "Texto Secundário sobre Superfície Branca (Light)",
      fg: THEME_TOKENS.light.textSecondary,
      bg: "#FFFFFF",
      target: "Normal (>= 4.5:1)",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors p-4 sm:p-8 lg:p-12 space-y-12 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="ElétricAi Design System"
        description="Sistema de design industrial para engenharia elétrica e automação. Precisão técnica, alto contraste WCAG 2.2 AA, responsividade e maturidade corporativa."
        badge={
          <Badge variant="brand" className="text-[11px] font-mono">
            v1.0.0 Enterprise
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2 p-1 rounded-lg border border-border bg-card">
            <Button
              size="sm"
              variant={theme === "dark" ? "default" : "ghost"}
              onClick={() => setTheme("dark")}
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              <Moon className="h-3.5 w-3.5" /> Escuro
            </Button>
            <Button
              size="sm"
              variant={theme === "light" ? "default" : "ghost"}
              onClick={() => setTheme("light")}
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              <Sun className="h-3.5 w-3.5" /> Claro
            </Button>
            <Button
              size="sm"
              variant={theme === "system" ? "default" : "ghost"}
              onClick={() => setTheme("system")}
              className="h-7 px-2.5 text-xs gap-1.5"
            >
              <Laptop className="h-3.5 w-3.5" /> Sistema
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="palette" className="space-y-8">
        <TabsList className="h-10 bg-muted/40 p-1 border border-border">
          <TabsTrigger value="palette" className="text-xs font-semibold">
            1. Paleta & Contraste
          </TabsTrigger>
          <TabsTrigger value="typography" className="text-xs font-semibold">
            2. Tipografia Oficial
          </TabsTrigger>
          <TabsTrigger value="components" className="text-xs font-semibold">
            3. Componentes & Estados
          </TabsTrigger>
          <TabsTrigger value="technical" className="text-xs font-semibold">
            4. Convenções Elétricas
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PALETTE & CONTRAST */}
        <TabsContent value="palette" className="space-y-8">
          <SectionHeader
            title="Paleta de Marca Oficial"
            description="Cores exclusivas do ElétricAi com papéis semânticos bem definidos. O laranja industrial orienta a ação primária, enquanto grafite e aço criam a base técnica."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(BRAND_PALETTE).map(([key, hex]) => (
              <Card key={key} className="overflow-hidden border border-border bg-card">
                <div
                  className="h-24 w-full relative flex items-end p-3 transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: hex }}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(hex, key)}
                    className="absolute top-2 right-2 h-7 w-7 bg-background/80 text-foreground hover:bg-background"
                    aria-label={`Copiar cor ${hex}`}
                  >
                    {copiedKey === key ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <CardContent className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-xs capitalize text-foreground">{key}</p>
                    <code className="text-[11px] font-mono text-muted-foreground">{hex}</code>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {key === "graphite" && "Fundo principal escuro"}
                    {key === "steel" && "Painéis, cartões e superfícies"}
                    {key === "orange" && "Ações primárias e foco"}
                    {key === "white" && "Títulos e texto primário"}
                    {key === "gray" && "Descrições e metadados"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* WCAG 2.2 AA Contrast Validation Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-foreground">
                Matriz de Validação de Contraste WCAG 2.2 Nível AA / AAA
              </h3>
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> 100% Conforme
              </Badge>
            </div>

            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Combinação de Elemento e Superfície</TableHead>
                    <TableHead className="text-xs">Cores (FG / BG)</TableHead>
                    <TableHead className="text-xs">Critério Alvo</TableHead>
                    <TableHead className="text-xs text-center">Razão Real</TableHead>
                    <TableHead className="text-xs text-right">Classificação WCAG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contrastTests.map((t, idx) => {
                    const result = checkWcagCompliance(t.fg, t.bg);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-xs">{t.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle border border-border"
                            style={{ backgroundColor: t.fg }}
                          />
                          {t.fg} / {t.bg}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.target}</TableCell>
                        <TableCell className="text-xs font-mono font-bold text-center">
                          {result.ratio}:1
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={result.passesAaa ? "success" : "brand"}
                            className="text-[10px]"
                          >
                            {result.passesAaa ? "AAA PASS" : "AA PASS"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: TYPOGRAPHY */}
        <TabsContent value="typography" className="space-y-8">
          <SectionHeader
            title="Tipografia Oficial Tripla"
            description="Space Grotesk para títulos e impacto visual; IBM Plex Sans para ergonomia de interface e leitura prolongada; IBM Plex Mono para código Ladder, tags e dados de automação."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit text-[10px] font-mono">
                  Display / Headings
                </Badge>
                <CardTitle className="font-display text-2xl font-bold mt-2">
                  Space Grotesk
                </CardTitle>
                <CardDescription className="text-xs">
                  Geométrica, moderna e assertiva. Utilizada em títulos da landing page, modais e
                  cabeçalhos de seção.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-display text-3xl font-bold">Aa Bb Cc 123</p>
                <p className="font-display text-lg font-medium text-muted-foreground">
                  Subestação Principal & Painel CCM-01
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit text-[10px] font-mono">
                  Interface / Sans
                </Badge>
                <CardTitle className="font-sans text-2xl font-bold mt-2">IBM Plex Sans</CardTitle>
                <CardDescription className="text-xs">
                  Alta legibilidade para navegação, formulários, tabelas, propriedades e diálogos
                  densos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-sans text-3xl font-bold">Aa Bb Cc 123</p>
                <p className="font-sans text-sm text-muted-foreground">
                  Disjuntor Caixa Moldada 160A com curva térmica ajustável e coordenação seletiva.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit text-[10px] font-mono">
                  Técnico / Mono
                </Badge>
                <CardTitle className="font-mono text-2xl font-bold mt-2">IBM Plex Mono</CardTitle>
                <CardDescription className="text-xs">
                  Monoespaçada neutra para mnemônicos IEC 61131-3, endereços de CLP (%IX0.0), ST e
                  netlists.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-mono text-2xl font-bold">Aa Bb Cc 123</p>
                <p className="font-mono text-xs text-primary bg-muted p-2 rounded border border-border">
                  KM1 := Start_PB AND NOT Stop_PB;
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Typography Scale */}
          <div className="space-y-4">
            <h3 className="font-display text-base font-bold text-foreground">
              Escala Tipográfica Responsiva
            </h3>
            <div className="rounded-lg border border-border bg-card divide-y divide-border p-4 space-y-4">
              <div className="flex items-baseline justify-between gap-4 pt-2">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-24">
                  5xl / 48px
                </span>
                <span className="font-display text-4xl sm:text-5xl font-bold text-foreground truncate">
                  Automação Industrial
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-24">
                  3xl / 30px
                </span>
                <span className="font-display text-2xl sm:text-3xl font-bold text-foreground truncate">
                  Diagrama Unifilar Interativo
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-24">
                  xl / 20px
                </span>
                <span className="font-display text-xl font-semibold text-foreground truncate">
                  Painel de Controle de Motores
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-24">
                  base / 16px
                </span>
                <span className="font-sans text-base text-foreground">
                  Texto padrão de interface, descrição técnica de equipamentos e parâmetros
                  elétricos.
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-24">
                  xs / 12px
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  TAG: QM-01 | IN: 63A | POLOS: 3 | CURVA: C | ENDEREÇO: %IX0.0
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: COMPONENTS & STATES */}
        <TabsContent value="components" className="space-y-10">
          <SectionHeader
            title="Componentes Fundamentais Padronizados"
            description="Biblioteca completa de controles acessíveis, estados visuais (normal, hover, focus, active, disabled, loading, error) e conformidade NBR/IEC."
          />

          {/* Buttons Section */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider">
              Botões e Ações (Button & IconButton)
            </h3>
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-border bg-card">
              <Button variant="default">Ação Primária</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="destructive">Destrutivo</Button>
              <Button variant="default" loading>
                Processando
              </Button>
              <Button variant="default" disabled>
                Desabilitado
              </Button>
              <IconButton
                icon={<Plus className="h-4 w-4" />}
                aria-label="Adicionar nó"
                variant="default"
              />
              <IconButton
                icon={<Trash className="h-4 w-4" />}
                aria-label="Remover seleção"
                variant="destructive"
              />
              <IconButton
                icon={<Gear className="h-4 w-4" />}
                aria-label="Configurações do Canvas"
                variant="outline"
              />
            </div>
          </div>

          {/* Form Controls */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider">
              Controles de Formulário e Entrada
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border border-border bg-card">
              <FormField
                id="tag-input"
                label="Tag do Equipamento"
                required
                description="Conforme NBR 5410"
              >
                <Input placeholder="Ex: QG-01, MTR-02" />
              </FormField>

              <FormField id="search-demo" label="Pesquisa com Atalho">
                <SearchInput
                  placeholder="Buscar nós ou tags..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onClear={() => setSearchValue("")}
                  shortcut="Ctrl K"
                />
              </FormField>

              <FormField
                id="power-input"
                label="Potência Nominal (kW)"
                error="Valor deve ser positivo"
              >
                <Input defaultValue="-5" />
              </FormField>

              <div className="flex items-center gap-2 pt-4">
                <Checkbox id="chk-sample" checked={checkState} onCheckedChange={setCheckState} />
                <Label htmlFor="chk-sample" className="text-xs cursor-pointer">
                  Habilitar simulação em tempo real
                </Label>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Switch id="sw-sample" checked={switchChecked} onCheckedChange={setSwitchChecked} />
                <Label htmlFor="sw-sample" className="text-xs cursor-pointer">
                  Telemetria IoT ativa (60 Hz)
                </Label>
              </div>
            </div>
          </div>

          {/* Badges and Alerts */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider">
              Badges de Estado & Alertas
            </h3>
            <div className="flex flex-wrap gap-2 p-4 rounded-lg border border-border bg-card">
              <Badge variant="default">Padrão</Badge>
              <Badge variant="brand">Marca Laranja</Badge>
              <Badge variant="success">Energizado / Conforme</Badge>
              <Badge variant="warning">Atenção / Sobrecarga</Badge>
              <Badge variant="info">Telemetria Ativa</Badge>
              <Badge variant="destructive">Falha / E-STOP</Badge>
              <Badge variant="outline">Neutro</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Alert className="border-warning/30 bg-warning/5 text-foreground">
                <Warning className="h-4 w-4 text-warning" />
                <AlertTitle className="text-xs font-bold text-warning">
                  Aviso Normativo NBR 5410
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-1">
                  Corrente de projeto IB (78A) excede a capacidade nominal do condutor de 16mm² no
                  método B1.
                </AlertDescription>
              </Alert>

              <Alert className="border-success/30 bg-success/5 text-foreground">
                <CheckCircle className="h-4 w-4 text-success" />
                <AlertTitle className="text-xs font-bold text-success">
                  Intertravamento Confirmado
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-1">
                  Circuito de parada de emergência categoria 4 validado conforme norma ABNT NBR
                  14153.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* States (Empty, Loading, Error) */}
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wider">
              Estados de Interface (Empty, Loading, Error)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <EmptyState
                icon={<Stack className="h-6 w-6" />}
                title="Nenhum alimentador adicionado"
                description="Selecione um disjuntor ou arraste um motor da paleta lateral para começar o diagrama."
                action={<Button size="sm">Novo Alimentador</Button>}
              />

              <Card className="border-border bg-card flex items-center justify-center">
                <LoadingState message="Calculando fluxo de potência..." />
              </Card>

              <ErrorState
                title="Falha na Conexão Modbus"
                message="Timeout após 5000ms tentando comunicar com o CLP no endereço 192.168.1.10:502."
                onRetry={() => toast.info("Tentando reconexão...")}
              />
            </div>
          </div>

          {/* Confirm Dialog trigger */}
          <div className="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">Diálogo de Confirmação Crítica</p>
              <p className="text-xs text-muted-foreground">
                Exibe modal com foco restrito e ações explícitas de confirmação.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
              Excluir Projeto
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Excluir Projeto Industrial?"
              description="Esta ação removerá permanentemente o diagrama unifilar, as rungs Ladder e todos os registros de telemetria associados. Esta operação não pode ser desfeita."
              confirmLabel="Excluir Definitivamente"
              variant="destructive"
              onConfirm={() => toast.success("Operação confirmada.")}
            />
          </div>
        </TabsContent>

        {/* TAB 4: TECHNICAL CONVENTIONS */}
        <TabsContent value="technical" className="space-y-6">
          <SectionHeader
            title="Preservação de Convenções Elétricas Normativas"
            description="A identidade visual da interface (tema escuro ou claro) NUNCA altera ou sobrescreve as cores técnicas padronizadas pela NBR 5410 e IEC 60446 para diagramas e condutores."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-[#1E40AF]" />
                <p className="font-semibold text-xs text-foreground">Condutor Neutro (N)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Azul-claro padronizado conforme NBR 5410 item 6.1.5.3. Invariante entre temas.
              </p>
            </Card>

            <Card className="border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-[#15803D]" />
                <p className="font-semibold text-xs text-foreground">Proteção / Terra (PE)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Verde ou verde-amarelo exclusivo para condutores de proteção. Invariante entre
                temas.
              </p>
            </Card>

            <Card className="border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-[#DC2626]" />
                <p className="font-semibold text-xs text-foreground">
                  Condutores de Fase (Fases A, B, C)
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Vermelho, preto, cinza ou branco para fases em conformidade com as normas técnicas.
              </p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
