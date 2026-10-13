import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikee, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

interface ElectricalGenerationRequest {
  project_id: string;
  tenant_id: string;
  generation_type: "single_line" | "motor_circuit" | "protection_coordination" | "cable_sizing" | "full_project";
  input_data: {
    // Dados de entrada para geração
    motors?: Array<{
      id: string;
      power_kW: number;
      voltage_V: number;
      start_method: "DOL" | "SOFT" | "VFD" | "STAR_DELTA";
      duty_cycle: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";
      ambient_temp_C?: number;
      altitude_m?: number;
    }>;
    loads?: Array<{
      id: string;
      type: "motor" | "lighting" | "socket" | "hvac" | "special";
      power_kW: number;
      voltage_V: number;
      quantity: number;
      diversity_factor?: number;
      demand_factor?: number;
    }>;
    transformer?: {
      power_kVA: number;
      primary_kV: number;
      secondary_V: number;
      impedance_pct: number;
      vector_group: string;
    };
    cables?: Array<{
      from: string;
      to: string;
      length_m: number;
      installation_method: "A1" | "A2" | "B1" | "B2" | "C" | "D" | "E" | "F" | "G";
      grouping_factor?: number;
      ambient_temp_C?: number;
    }>;
    protections?: Array<{
      id: string;
      type: "MCB" | "MCCB" | "ACB" | "fuse" | "RCD" | "thermal_overload" | "motor_protection";
      rating_A: number;
      curve?: "B" | "C" | "D" | "K" | "Z";
      poles?: number;
      sensitivity_mA?: number;
    }>;
    earthing_system: "TN-S" | "TN-C" | "TN-C-S" | "TT" | "IT";
    standards: string[];
  };
  options: {
    language: "pt-BR" | "en";
    detail_level: "summary" | "detailed" | "executive";
    include_calculations: boolean;
    include_bom: boolean;
    include_dxf: boolean;
  };
}

interface ElectricalGenerationResponse {
  success: boolean;
  data?: {
    unifilar: {
      nodes: Array<{
        id: string;
        kind: string;
        label: string;
        position: { x: number; y: number };
        params: Record<string, any>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        kind: "power" | "signal" | "pipe";
        cable_id?: string;
      }>;
    };
    multifilar: {
      circuits: Array<{
        id: string;
        name: string;
        phases: string[];
        cable: { type: string; section_mm2: number; length_m: number };
        protection: string;
        load_kW: number;
        current_A: number;
      }>;
    };
    calculations: {
      motor_circuits: Array<{
        motor_id: string;
        In_A: number;
        Istart_A: number;
        cable_mm2: number;
        breaker_A: number;
        contactor_A: number;
        thermal_overload_A: number;
        cable_length_m: number;
        voltage_drop_pct: number;
      }>;
      feeders: Array<{
        from: string;
        to: string;
        current_A: number;
        cable_mm2: number;
        length_m: number;
        voltage_drop_pct: number;
      }>;
      short_circuit: {
        Ik3ph_kA: number;
        Ik1ph_kA: number;
        X_R_ratio: number;
      };
      protection_coordination: Array<{
        upstream: string;
        downstream: string;
        selective: boolean;
        discrimination_limit_A: number;
      }>;
    };
    bill_of_materials: Array<{
      item: string;
      description: string;
      quantity: number;
      unit: string;
      spec: string;
    }>;
    ladder_program: {
      st_code: string;
      il_code: string;
      rungs_count: number;
    };
    dxf_base64?: string;
    pdf_base64?: string;
  };
  warnings: string[];
  errors: string[];
}

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SYSTEM_PROMPT = `Você é um Engenheiro Eletricista Sênior especializado em projetos industriais brasileiros.
Sua expertise inclui: NBR 5410, NBR 14039, NR-10, NR-12, IEC 60909, IEC 60947, IEC 60204, IEEE 1584.
Você deve gerar projetos elétricos completos, precisos e em conformidade normativa.

REGRAS OBRIGATÓRIAS:
1. Sempre cite a norma e o artigo aplicável em cada decisão
2. Use fatores de segurança conservadores (lado da segurança)
3. Dimensionamento: cabo ≥ 1,25 × In, disjuntor ≥ 1,25 × In (curva adequada)
4. Proteção: DR 30mA em circuitos de tomada, DR seletivo em circuitos críticos
5. Aterramento: TN-S preferencial, DR 300mA em IT, proteção contra surtos
6. E-STOP: NR-12 obrigatório, categoria 0 ou 1 conforme risco
6. Aterramento: NR-10, NBR 5410, NBR 14039
7. Documentação: memorial de cálculo, lista de materiais, unifilar, multifilar, ladder

FORMATO DE RESPOSTA: JSON estruturado conforme schema definido.
NUNCA retorne markdown, texto livre ou explicações fora do JSON.`;

async function callDeepSeek(prompt: string, systemPrompt: string): Promise<any> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from DeepSeek");
  return JSON.parse(content);
}

async function getProjectData(supabase: any, projectId: string) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) throw new Error(`Project not found: ${error.message}`);
  return project;
}

async function getAiConfig(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("ai_electrical_config")
    .select("config_key, config_value")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw new Error(`Failed to load AI config: ${error.message}`);

  const config: Record<string, any> = {};
  for (const row of data || []) {
    config[row.config_key] = row.config_value;
  }
  return config;
}

async function getProjectDiagram(supabase: any, projectId: string) {
  const { data: nodes, error: nodesError } = await supabase
    .from("project_nodes")
    .select("*")
    .eq("project_id", projectId);

  const { data: edges, error: edgesError } = await supabase
    .from("project_edges")
    .select("*")
    .eq("project_id", projectId);

  if (nodesError) throw new Error(`Failed to load nodes: ${nodesError.message}`);
  if (edgesError) throw new Error(`Failed to load edges: ${edgesError.message}`);

  return { nodes: nodes || [], edges: edges || [] };
}

async function generateElectricalProject(req: ElectricalGenerationRequest): Promise<ElectricalGenerationResponse> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const project = await getProjectData(supabase, req.project_id);
  const aiConfig = await getAiConfig(supabase, req.tenant_id);
  const diagram = await getProjectDiagram(supabase, req.project_id);

  const prompt = `
GERAR PROJETO ELÉTRICO INDUSTRIAL COMPLETO

DADOS DO PROJETO:
- Projeto: ${project.name} (${project.id})
- Tenant: ${req.tenant_id}
- Tipo de geração: ${req.generation_type}
- Idioma: ${req.options.language}
- Nível de detalhe: ${req.options.detail_level}

CONFIGURAÇÃO DA PLANTA:
${JSON.stringify(req.input_data, null, 2)}

DIAGRAMA UNIFILAR EXISTENTE:
${JSON.stringify(diagram, null, 2)}

CONFIGURAÇÕES IA:
${JSON.stringify(aiConfig, null, 2)}

OPÇÕES:
${JSON.stringify(req.options, null, 2)}

INSTRUÇÕES:
1. Se generation_type = "full_project": gere tudo (unifilar, multifilar, cálculos, ladder, BOM, DXF, PDF)
2. Se generation_type = "single_line": apenas unifilar + cálculos de alimentadores
3. Se generation_type = "motor_circuit": circuitos de motor completos
4. Se generation_type = "protection_coordination": seletividade + curto-circuito
5. Se generation_type = "cable_sizing": dimensionamento de cabos

REGRAS DE ENGENHARIA:
- NBR 5410: Instalações BT (dimensionamento, proteção, aterramento)
- NBR 14039: Instalações MT
- NR-10: Segurança em eletricidade
- NR-12: Segurança em máquinas (E-STOP, intertravamentos)
- IEC 60909: Curto-circuito
- IEC 60947: Aparelhagem
- IEEE 1584: Arco elétrico
- IEC 60204-1: Equipamentos de máquinas (Ladder)

CÁLCULOS OBRIGATÓRIOS:
1. Corrente nominal motores: In = P / (√3 × U × cosφ × η)
6. Partida: DOL=7×In, Soft=3.5×In, VFD=1.1×In, Star-Delta=2.3×In
7. Cabo: 1,25×In, tabela IEC 60364, fatores de correção
7. Disjuntor: curva C/D, 1,25×In, seletividade
8. Queda de tensão: ≤3% circuitos iluminação, ≤5% força
8. Curto-circuito: IEC 60909, Ik3ph, Ik1ph, X/R
9. Seletividade: discriminação total/parcial, limitadores
10. Arco elétrico: IEEE 1584, incidente energy, PPE

GERAR JSON ESTRUTURADO CONFORME SCHEMA.
NÃO INCLUA MARKDOWN OU TEXTO LIVRE FORA DO JSON.`;

  const aiResponse = await callDeepSeek(prompt, SYSTEM_PROMPT);

  // Validar resposta básica
  if (!aiResponse.success) {
    return {
      success: false,
      errors: aiResponse.errors || ["Falha na geração"],
      warnings: aiResponse.warnings || [],
    };
  }

  // Salvar resultado no banco
  const { error: saveError } = await supabase
    .from("electrical_simulation_results")
    .insert({
      project_id: req.project_id,
      simulation_type: "full_project",
      standard: "NBR_5410",
      input_data: req.input_data,
      results: aiResponse.data,
      computation_time_ms: 0, // TODO: medir
    });

  if (saveError) {
    console.error("Failed to save generation result:", saveError);
  }

  return aiResponse;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json() as ElectricalGenerationRequest;

    // Validações básicas
    if (!body.project_id || !body.tenant_id) {
      return new Response(JSON.stringify({
        success: false,
        errors: ["project_id e tenant_id são obrigatórios"],
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await generateElectricalProject(body);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("AI Electrical Generator error:", err);
    return new Response(JSON.stringify({
      success: false,
      errors: [err instanceof Error ? err.message : String(err)],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});