// AI Industrial Architect — DeepSeek-powered.
// Recebe um briefing em linguagem natural e devolve um sistema elétrico industrial
// estruturado via tool calling (JSON garantido).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é o "EletricAI Architect", um engenheiro elétrico industrial sênior brasileiro.
A partir de uma descrição em linguagem natural (mesmo curta), você projeta um SISTEMA ELÉTRICO COMPLETO seguindo NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3:
- escolhe transformador (kVA, U primário/secundário) por carga total + diversidade
- dimensiona CCM (colunas e cubículos)
- para cada motor define: P (kW), U, In, partida (DOL/SOFT/VFD), cabo (mm²), disjuntor (A) e curva
- inclui DR (RCD), aterramento PE, E-STOP por máquina (NR-12), proteções, contatores, relés térmicos, fontes 24V, instrumentação (PT100, pressão, vazão, nível)
- cria topologia: lista de nodes (id, kind, label, params, posição) e edges (source→target, kind: power|signal|pipe)
- explica decisões em "rationale" curto e técnico em PT-BR citando normas
KINDS válidos: breaker, contactor, relay, transformer, vfd, softstarter, psu, busbar, ccm, motor, conveyor, screw, valve, pump, tank, reactor, cylinder, pt100, pressure, flow, level, estop, lightcurtain, encoder.
CATEGORIES: power | mech | inst | logic.
POSIÇÕES coerentes em grid: trafo no topo, barramento abaixo, CCM, motores em colunas. Coordenadas { x: 60..1200, y: 40..900 }, espaçamento ≥ 160 px.
SEMPRE inclua pelo menos um E-STOP e um disjuntor DR (RCD) na entrada do CCM.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    rationale: { type: "string" },
    transformer: {
      type: "object",
      properties: {
        kVA: { type: "number" },
        primary_kV: { type: "number" },
        secondary_V: { type: "number" },
      },
      required: ["kVA", "primary_kV", "secondary_V"],
    },
    ccm: {
      type: "object",
      properties: { columns: { type: "number" }, cells: { type: "number" } },
      required: ["columns", "cells"],
    },
    motors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          power_kW: { type: "number" },
          voltage_V: { type: "number" },
          startMethod: { type: "string", enum: ["DOL", "SOFT", "VFD"] },
          role: { type: "string" },
        },
        required: ["id", "power_kW"],
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          category: { type: "string", enum: ["power", "mech", "inst", "logic"] },
          label: { type: "string" },
          params: { type: "object", additionalProperties: true },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
        required: ["id", "kind", "category", "label", "position"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          kind: { type: "string", enum: ["power", "signal", "pipe"] },
        },
        required: ["source", "target", "kind"],
      },
    },
  },
  required: ["title", "rationale", "transformer", "ccm", "motors", "nodes", "edges"],
};

const TOOL = {
  type: "function",
  function: {
    name: "design_industrial_system",
    description: "Devolve o sistema elétrico industrial completo estruturado.",
    parameters: SCHEMA,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, context } = await req.json();
    if (!prompt || typeof prompt !== "string") return json({ error: "prompt is required" }, 400);

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json({ error: "DEEPSEEK_API_KEY não configurada" }, 500);

    const userMsg = context
      ? `Briefing:\n${prompt}\n\nContexto atual do projeto (JSON):\n${JSON.stringify(context).slice(0, 8000)}`
      : prompt;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "design_industrial_system" } },
        temperature: 0.3,
      }),
    });

    if (resp.status === 429) return json({ error: "DeepSeek: limite de requisições. Tente novamente." }, 429);
    if (resp.status === 401) return json({ error: "DeepSeek: chave inválida. Verifique DEEPSEEK_API_KEY." }, 401);
    if (resp.status === 402) return json({ error: "DeepSeek: créditos esgotados." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("DeepSeek error:", resp.status, t);
      return json({ error: "Falha na geração: " + t }, 500);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      const content = data?.choices?.[0]?.message?.content ?? "";
      return json({ error: "Resposta sem tool_call. " + content.slice(0, 200) }, 500);
    }

    let parsed: any;
    try { parsed = JSON.parse(call.function.arguments); }
    catch (e) { return json({ error: "JSON inválido do modelo: " + (e as Error).message }, 500); }

    return json({ ok: true, system: parsed, provider: "deepseek" });
  } catch (e) {
    console.error("ai-industrial-architect error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
