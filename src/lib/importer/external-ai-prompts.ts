// External AI Prompts & Project Bundle Serializer
// Generates ready-to-copy system prompts for ChatGPT, Claude, DeepSeek, and local LLMs
// and serializes the current active canvas into a valid `eletricai.canvas-bundle` v1.0.0.

import type { DiagramDoc } from "@/lib/diagram/schema";
import type { LadderRung } from "@/lib/ladder/types";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type EletricAiCanvasBundle,
  type BundleNode,
  type BundleEdge,
  type BundleLadderRung,
  type SupportedDiagramType,
} from "./types";
import { resolveComponentKind } from "./bundle-schema";

export interface BundleExportOptions {
  projectName?: string;
  diagramType?: SupportedDiagramType;
  units?: "metric" | "imperial";
  author?: string;
  rungs?: LadderRung[];
  tags?: any[];
}

/**
 * Serializes the current active canvas (DiagramDoc) into an `eletricai.canvas-bundle` v1.0.0.
 */
export function exportCurrentCanvasToBundle(
  doc: DiagramDoc,
  options: BundleExportOptions = {},
): EletricAiCanvasBundle {
  const nodes: BundleNode[] = Object.values(doc.nodes || {}).map((n) => {
    const rawParams = (n.params ? { ...n.params } : {}) as Record<string, any>;
    return {
      id: n.id,
      type: (rawParams.kind || "load") as any,
      label: n.label || (rawParams.tag ? String(rawParams.tag) : n.id),
      position: {
        x: Math.round(n.position?.x ?? 0),
        y: Math.round(n.position?.y ?? 0),
      },
      rotation: n.rotation || 0,
      properties: rawParams as Record<string, string | number | boolean | null>,
    };
  });

  const edges: BundleEdge[] = Object.values(doc.edges || {}).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    fromTerminal: e.sourcePort,
    toTerminal: e.targetPort,
    kind: e.kind === "pipe" ? "pipe" : e.kind === "signal" ? "signal" : "power",
    circuitConfig: e.circuitConfig,
  }));

  let ladder: { rungs: BundleLadderRung[] } | undefined = undefined;
  if (options.rungs && options.rungs.length > 0) {
    ladder = {
      rungs: options.rungs.map((r: any) => ({
        id: r.id,
        comment: r.label || r.comment || "",
        output: {
          kind: r.output?.kind || "OTE",
          operand: r.output?.operand || "",
        },
        branches: Array.isArray(r.branches)
          ? r.branches.map((b: any[]) =>
              b.map((c: any) => ({
                kind: c.kind,
                operand: c.operand,
              })),
            )
          : [],
      })),
    };
  }

  const bundle: EletricAiCanvasBundle = {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: options.projectName || "Projeto ElétricAi",
      diagramType: options.diagramType || "unifilar",
      units: options.units || "metric",
      standards: ["NBR 5410", "NR-10", "NR-12", "IEC 60947"],
      frequencyHz: 60,
    },
    nodes,
    edges,
    ...(ladder ? { ladder } : {}),
    metadata: {
      author: options.author || "Engenheiro ElétricAi",
      generator: "eletricai-canvas-exporter",
      generatedAt: new Date().toISOString(),
    },
  };

  return bundle;
}

/**
 * Returns formatted JSON string for a given bundle.
 */
export function exportCanvasBundleJson(bundle: EletricAiCanvasBundle, pretty = true): string {
  return pretty ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle);
}

export interface PromptGenerationOptions {
  currentBundle?: EletricAiCanvasBundle;
  targetDiagramType?: SupportedDiagramType;
  customRequirements?: string;
  includeLadder?: boolean;
}

/**
 * Generates an exhaustive, industrial-grade prompt for external LLMs (ChatGPT, Claude, DeepSeek).
 * Explains schema, coordinates, components, electrical properties, and output format.
 */
export function generateExternalAiPrompt(options: PromptGenerationOptions = {}): string {
  const diagramType = options.targetDiagramType || "unifilar";
  const custom = options.customRequirements ? options.customRequirements.trim() : "";

  let prompt = `# INSTRUÇÕES PARA CRIAÇÃO DE PROJETO ELÉTRICO COMPATÍVEL COM O CANVAS ELÉTRICAI

Você é um Engenheiro Eletricista Sênior e Especialista em Automação Industrial (ABNT NBR 5410, NR-10, NR-12 e IEC 60947).
Sua tarefa é elaborar a arquitetura completa de um projeto elétrico/automação e fornecer o resultado **ESTRITAMENTE** no formato JSON padronizado **ElétricAi Canvas Bundle (v1.0.0)**.

O usuário importará seu JSON diretamente para o Canvas do ElétricAi sem consumir créditos de IA interna. Portanto, o arquivo deve ser sintaticamente perfeito, sem erros e aderente ao contrato abaixo.

---

### 1. CONTRATO JSON OBRIGATÓRIO (eletricai.canvas-bundle v1.0.0)

\`\`\`json
{
  "format": "eletricai.canvas-bundle",
  "schemaVersion": "1.0.0",
  "project": {
    "name": "Nome do Painel ou Instalação",
    "diagramType": "${diagramType}",
    "units": "metric",
    "standards": ["NBR 5410", "NR-10", "NR-12", "IEC 60947"],
    "systemVoltageV": 380,
    "frequencyHz": 60
  },
  "nodes": [
    {
      "id": "DJ-GERAL",
      "type": "breaker",
      "label": "Disjuntor Geral 160A",
      "position": { "x": 200, "y": 100 },
      "rotation": 0,
      "properties": {
        "tag": "QGBT-DJ01",
        "In": 160,
        "poles": 3,
        "curve": "C"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "DJ-GERAL",
      "target": "BARRAMENTO-01",
      "kind": "power",
      "circuitConfig": "3F+N+PE"
    }
  ]
}
\`\`\`

---

### 2. COMPONENTES VÁLIDOS ("type")
Utilize exclusivamente os tipos canônicos abaixo (ou aliases em português conhecidos):
- **Proteção e Manobra**: \`breaker\` (disjuntor), \`rcd\` (DR / IDR / DPS), \`contactor\` (contator), \`relay\` (relé térmico / sobrecarga), \`fuse\` (fusível), \`disconnector\` (seccionadora).
- **Alimentação e Barramentos**: \`transformer\` (trafo), \`psu\` (fonte 24Vdc), \`busbar\` (barramento), \`ccm\` (coluna CCM).
- **Acionamentos**: \`vfd\` (inversor de frequência), \`softstarter\` (soft-starter).
- **Cargas**: \`motor\` (motor trifásico/monofásico), \`load\` (carga genérica), \`lamp\` (iluminação), \`socket\` (tomadas TUG/TUE).
- **Segurança e Sensores**: \`estop\` (botão de emergência cogumelo), \`lightcurtain\` (cortina de luz), \`pt100\`, \`pressure\`, \`flow\`, \`level\`, \`encoder\`.
- **Pontos de Ligação e Terra**: \`ground\` (terra PE), \`neutral\` (neutro N), \`terminal\` (borne de passagem).

---

### 3. PROPRIEDADES ELÉTRICAS ESSENCIAIS ("properties")
- **Motores**: \`power_kW\` ou \`P\` (ex: 7.5), \`voltage_V\` ou \`U\` (ex: 380), \`in_A\` ou \`In\` (ex: 15.2), \`startMethod\` ("direct" | "star-delta" | "softstarter" | "vfd"), \`tag\`.
- **Disjuntores**: \`In\` (corrente nominal em A), \`poles\` (1, 2, 3 ou 4), \`curve\` ("B", "C" ou "D"), \`tag\`.
- **Transformadores**: \`kVA\` ou \`P\` (ex: 75), \`primary_kV\` (ex: 13.8), \`secondary_V\` (ex: 380).
- **Condutores nas Edges**: \`kind\` ("power" | "signal" | "pipe" | "ground"), \`circuitConfig\` ("3F+N+PE" | "3F" | "F+N+PE" | "F+N" | "PE" | "N").

---

### 4. DISPOSIÇÃO ESPACIAL NO CANVAS (COORDENADAS 2D)
O Canvas do ElétricAi é um plano bidimensional em pixels:
- **Fluxo vertical de potência**:
  - Topo (Y = 80 a 150): Entrada da concessionária / Transformador / Fonte.
  - Intermediário Superior (Y = 220 a 300): Disjuntor Geral / QGBT / Barramento Principal.
  - Ramais de Distribuição (Y = 400 a 550): Disjuntores de ramal, Contatores, Inversores.
  - Cargas Finais (Y = 650 a 800): Motores, Cargas, Painéis remotos.
- **Espaçamento horizontal (X)**:
  - Deixe cerca de 180 a 250 pixels entre colunas ou ramais paralelos (ex: Ramal 1 em X = 200, Ramal 2 em X = 450, Ramal 3 em X = 700).

---

### 5. LADDER / CLP (Opcional, quando o projeto exigir automação)
Se incluir lógica de comando de CLP, adicione a seção \`ladder\`:
\`\`\`json
"ladder": {
  "rungs": [
    {
      "id": "rung_0",
      "comment": "Rung 0: Partida com Botão de Emergência e Retenção",
      "output": { "kind": "OTE", "operand": "K1_MOTOR" },
      "branches": [
        [
          { "kind": "XIC", "operand": "E_STOP_OK" },
          { "kind": "XIC", "operand": "BT_LIGA" }
        ],
        [
          { "kind": "XIC", "operand": "K1_MOTOR" }
        ]
      ]
    }
  ]
}
\`\`\`

---

### 6. REGRAS DE SEGURANÇA E HIGIENE DO PACOTE
1. Retorne **EXCLUSIVAMENTE** o bloco JSON puro ou envolto em um bloco único de código markdown (\`\`\`json ... \`\`\`).
2. NÃO inclua texto explicativo antes ou depois do JSON.
3. NÃO utilize protótipos de JavaScript (\`__proto__\`, \`constructor\`).
4. Todos os números devem ser finitos (sem \`NaN\`, sem \`Infinity\`).
5. As IDs de todos os nós devem ser únicas e todas as edges devem ligar nós existentes.
`;

  if (options.currentBundle) {
    prompt += `\n---\n### PROJETO BASE ATUALMENTE ABERTO NO CANVAS:\n\`\`\`json\n${JSON.stringify(options.currentBundle, null, 2)}\n\`\`\`\n\nModifique, expanda ou adicione os elementos solicitados preservando a coerência técnica com o projeto base acima.\n`;
  }

  if (custom) {
    prompt += `\n---\n### ESPECIFICAÇÃO TÉCNICA DO PROJETO DESEJADO:\n${custom}\n`;
  } else {
    prompt += `\n---\n### ESPECIFICAÇÃO TÉCNICA DO PROJETO DESEJADO:\nPor favor, crie um projeto elétrico industrial completo conforme as melhores práticas de engenharia.\n`;
  }

  return prompt;
}
