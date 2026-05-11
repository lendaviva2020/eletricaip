// AI Industrial Architect — Edge Function (Supabase / Deno)
// Receives a natural-language brief and returns a structured industrial system
// (transformer + CCM + motors + cables + breakers + nodes/edges) using
// Lovable AI Gateway with tool-calling for guaranteed JSON shape.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é o "EletricAI Architect", um engenheiro elétrico industrial sênior.
A partir de uma descrição em linguagem natural (mesmo curta), você projeta um SISTEMA ELÉTRICO COMPLETO:
- escolhe o transformador (kVA, U primário/secundário) com base na carga total + diversidade
- dimensiona o CCM (colunas e cubículos)
- para cada motor define: P (kW), U, In, Istart, partida (DOL/SOFT/VFD), bitola de cabo (mm²) e disjuntor (A)
- inclui proteções, contatores, relés, fontes 24V, instrumentação (PT100, pressão, vazão, nível) quando fizer sentido
- cria a topologia: lista de nodes (id, kind, label, params, posição) e edges (source→target, kind: power|signal|pipe)
- explica decisões em "rationale" (curto, técnico, em PT-BR)
Use kinds VÁLIDOS: breaker, contactor, relay, transformer, vfd, softstarter, psu, busbar, ccm, motor, conveyor, screw, valve, pump, tank, reactor, cylinder, pt100, pressure, flow, level, estop, lightcurtain, encoder.
Categorias: power | mech | inst | logic.
Posicione nós em grid coerente: trafo no topo, barramento abaixo, CCM, depois motores em colunas. Use coordenadas { x: 60..1200, y: 40..900 } com espaçamento ≥ 160px.`;

const TOOL = {
  type: "function",
  function: {
    name: "design_industrial_system",
    description: "Devolve o sistema elétrico industrial completo estruturado.",
    parameters: {
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
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, context } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "prompt is required" }, 400);
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const userMsg = context
      ? `Briefing:\n${prompt}\n\nContexto atual do projeto (JSON):\n${JSON.stringify(context).slice(0, 8000)}`
      : prompt;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "design_industrial_system" } },
      }),
    });

    if (resp.status === 429) return json({ error: "Limite de requisições. Tente novamente em instantes." }, 429);
    if (resp.status === 402) return json({ error: "Créditos da IA esgotados. Adicione créditos em Settings → Workspace → Usage." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return json({ error: "Falha na geração: " + t }, 500);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) return json({ error: "Resposta sem tool_call." }, 500);

    let parsed: any;
    try { parsed = JSON.parse(call.function.arguments); }
    catch (e) { return json({ error: "JSON inválido do modelo: " + (e as Error).message }, 500); }

    return json({ ok: true, system: parsed });
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
