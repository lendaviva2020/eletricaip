// Mapa de conhecimento da IA por editor do EletricAI — FONTE ÚNICA.
//
// Todos os prompts (patch do canvas, Arquiteto, chat) montam suas regras a
// partir daqui, para que a IA trabalhe do MESMO jeito em todo o app e do mesmo
// jeito que os motores determinísticos (reparo de ligações, numeração IEC 81346,
// dimensionamento NBR 5410, verificador de E-STOP). Se mudar uma regra aqui,
// confira o motor correspondente — e vice-versa. Documentação: docs/IA_EDITORES.md.
//
// Princípios que valem para todos os editores:
//  1. Nada inventado: dado de obra (comprimento de cabo, corrente medida,
//     endereço físico) só entra se o usuário informou. Sem dado → pendência.
//  2. Correção não recria o que já existe: ajusta o equipamento existente.
//  3. Simulação nunca vira comando em campo (AGENTS.md regra 21).

export type RulesLocale = "pt-BR" | "en";

export type EditorId = "unifilar" | "multifilar" | "ladder" | "studio" | "scada";

const PT: Record<EditorId, string> = {
  unifilar: `## UNIFILAR (folha "unifilar") — grafo elétrico de potência
- O desenho é um GRAFO: equipamento = nó, condutor = ligação (edge kind "power"). Posição na tela não liga nada.
- ENTRADA, de cima para baixo: transformador/alimentação → disjuntor geral (tag "Q0") → seccionadora (disconnector) e/ou DR geral (rcd), quando existirem, em SÉRIE → barramento (busbar). Nunca ligue o Q0 direto no barramento se houver seccionadora/DR entre eles.
- RAMAIS saem do barramento (sourcePort "B1", "B2"… um por ramal):
  • Partida direta / estrela-triângulo: disjuntor → contator → relé térmico (OBRIGATÓRIO) → motor.
  • Inversor / soft-starter: disjuntor → (contator de isolação opcional) → inversor/soft → motor (sem relé térmico: o acionamento protege o motor).
  • Tomadas: disjuntor → DR 30 mA → tomada (NBR 5410 §5.1.3.2.2). Fonte 24 V: disjuntor → fonte.
- PROTEÇÃO: In do disjuntor ≥ Ib; relé térmico com faixa cobrindo o In do motor; Icc do disjuntor ≥ curto presumido.
- CABOS ficam NA LIGAÇÃO, nunca como equipamento: edge.cable = { section_mm2, length_m, installation (A1…F), insulation (PVC|EPR|XLPE) }. Para alterar um cabo existente use updateEdges[].cable. NUNCA crie nó "cabo"/"condutor". A seção é dimensionada pelo sistema (NBR 5410: Ib ≤ In ≤ I'z; motor I'z ≥ 1,25·In). length_m SÓ se o usuário informou o comprimento — nunca estime; sem comprimento, peça ao usuário.
- Só o cabo de CAMPO (painel → carga) e o ALIMENTADOR (fonte externa → painel) precisam de comprimento; a fiação interna do painel não.
- COORDENAÇÃO: In do disjuntor ≥ Ib a jusante; relé térmico ajustado entre 0,95 e 1,25 × In do motor; contator (AC-3) ≥ In do motor; disjuntor de ramal com In MENOR que o geral (seletividade); Icu (icc_kA) ≥ curto presumido no barramento (IEC 60909 pelo trafo — uk_pct de placa, se o usuário informou).
- TAGS (IEC 81346-2, uma letra de classe + número sequencial por tipo): disjuntor/seccionadora Q, DR/fusível/relé térmico F, contator/relé K, transformador/fonte/inversor/soft T, barramento W, motor M, tomada/borne X, sensor B, botoeira/E-STOP S. Q0 é o geral. O sistema renumera em sequência — não invente DJ1, QF-01 etc.
- PE (terra) obrigatório em motor e tomada; E-STOP físico por máquina (NR-12).`,

  multifilar: `## MULTIFILAR — derivado do unifilar
- O multifilar é GERADO a partir do unifilar (fases L1/L2/L3, N, PE). Nunca edite o multifilar por patch: corrija o unifilar.
- Cores NBR 5410: fases preto/cinza/vermelho (ou marrom/preto/cinza), neutro azul-claro, PE verde-amarelo. Monofásico usa F+N(+PE); trifásico 3F(+N)+PE.
- Número de polos do disjuntor deve corresponder às fases da carga (1P monofásico F+N com neutro protegido conforme o esquema, 3P/4P trifásico).
- Bornes só na fronteira painel ↔ campo: -X1 potência, -X2 comando. Terminais reais IEC 60947: 1/L1-2/T1, A1-A2 (bobina), 13-14 (NA), 21-22 (NF), 95-96 (térmico NF), 97-98 (térmico NA), U1/V1/W1 (motor).`,

  ladder: `## LADDER (IEC 61131-3 LD) — instruções suportadas: XIC, XIO, OTE, OTL, OTU, TON, TOF, TP, CTU
- XIC = "examinar se 1" (contato NA lógico); XIO = "examinar se 0" (contato NF lógico). Linhas paralelas = OU; contatos na mesma linha = E.
- FAIL-SAFE (NR-12 / IEC 60204-1): parada, E-STOP e relé térmico são contatos NF FÍSICOS — a entrada fica em 1 quando está tudo OK. No ladder eles entram com XIC em SÉRIE (1 = íntegro). Fio rompido = 0 = desliga. Nunca use XIO para ler uma entrada de segurança NF.
- PARTIDA COM SELO: [XIC PARADA_OK] [XIC TERMICO_OK] [XIC ESTOP_OK] ( [XIC PARTIDA] OU [XIC K1] ) → OTE K1. O contato de selo é a própria bobina/auxiliar do contator, em PARALELO com o botão de partida.
- REVERSÃO: K_FRENTE bloqueia K_RE com XIO K_FRENTE no rung de K_RE (e vice-versa), além do intertravamento elétrico.
- ESTRELA-TRIÂNGULO: K_LINHA + K_ESTRELA; TON ~5–10 s; ao fim do TON desliga K_ESTRELA e liga K_TRIANGULO; K_ESTRELA e K_TRIANGULO intertravados (XIO mútuo).
- Uma bobina (OTE) por saída em todo o programa (sem bobina dupla). OTL sempre com OTU correspondente.
- Endereços: entradas %I, saídas %Q, memórias %M. Use o MESMO nome de tag do unifilar (K1, M1, F1, S1) para manter a referência cruzada.
- A parada de emergência é um CIRCUITO FÍSICO cabeado; o rung de E-STOP no CLP é intertravamento adicional, nunca o único meio.`,

  studio: `## FB ELECTRIC STUDIO (FBD/LAD por páginas) — mesmo motor IEC do ladder
- Blocos IEC: AND/OR/NOT/XOR, SR/RS (RS = reset dominante para segurança), TON/TOF/TP, CTU/CTD/CTUD, comparadores, MOVE, aritmética, PID/PI.
- Comando de motor: RS com S = partida, R = NOT(parada_ok E térmico_ok E estop_ok) — reset dominante, entradas NF fail-safe (1 = íntegro).
- A página "Gerar do unifilar" cria um comando por motor do unifilar; não sobrescreva páginas do usuário — crie uma nova página.
- Endereços de E/S vêm do hardware configurado; se faltar E/S, avise em vez de inventar endereço.`,

  scada: `## SCADA / HMI (ISA-101, ISA-18.2)
- Cor forte só para anormalidade: vermelho = alarme/falha, âmbar = desvio/simulação; estado normal em cinza.
- Alarme ISA-18.2: toda definição tem prioridade (alta/média/baixa), banda morta (histerese) e ação do operador; alarme de segurança nunca vai para prateleira.
- Tag sem fonte = "sem sinal"/0, nunca valor plausível inventado. Dados simulados exibem o banner de SIMULAÇÃO.
- Nenhum comando sai para equipamento real: botões da HMI só atuam na simulação (AGENTS.md regra 21).`,
};

const EN: Record<EditorId, string> = {
  unifilar: `## SINGLE-LINE (sheet "unifilar") — electrical power graph
- The drawing is a GRAPH: device = node, conductor = edge (kind "power"). Screen position connects nothing.
- INFEED, top to bottom: transformer/supply → main breaker (tag "Q0") → disconnector and/or main RCD when present, in SERIES → busbar. Never wire Q0 straight to the busbar if a disconnector/RCD sits between them.
- BRANCHES leave the busbar (sourcePort "B1", "B2"… one per branch):
  • DOL / star-delta: breaker → contactor → thermal overload relay (MANDATORY) → motor.
  • VFD / soft-starter: breaker → (optional isolation contactor) → drive → motor (no thermal relay: the drive protects the motor).
  • Sockets: breaker → 30 mA RCD → socket. 24 V PSU: breaker → PSU.
- PROTECTION: breaker In ≥ Ib; thermal relay range covers motor In; breaker breaking capacity ≥ prospective short-circuit.
- CABLES live ON THE EDGE, never as a device: edge.cable = { section_mm2, length_m, installation (A1…F), insulation (PVC|EPR|XLPE) }. To change an existing cable use updateEdges[].cable. NEVER create a "cable"/"conductor" node. Section is sized by the system (Ib ≤ In ≤ I'z; motor I'z ≥ 1.25·In). length_m ONLY when the user stated the length — never estimate; otherwise ask.
- Only FIELD cables (panel → load) and the FEEDER (external source → panel) need a length; internal panel wiring does not.
- COORDINATION: breaker In ≥ downstream Ib; thermal relay set between 0.95 and 1.25 × motor In; contactor (AC-3) ≥ motor In; branch breaker In LOWER than the main (selectivity); Icu (icc_kA) ≥ prospective busbar short circuit (IEC 60909 from the transformer — nameplate uk_pct when the user gave it).
- TAGS (IEC 81346-2, one class letter + sequential number per type): breaker/disconnector Q, RCD/fuse/thermal relay F, contactor/relay K, transformer/PSU/drive T, busbar W, motor M, socket/terminal X, sensor B, push-button/E-STOP S. Q0 is the main breaker. The system renumbers sequentially.
- PE mandatory on motors and sockets; physical E-STOP per machine (ISO 13849 / IEC 60204-1).`,

  multifilar: `## MULTI-LINE — derived from the single-line
- The multi-line is GENERATED from the single-line (L1/L2/L3, N, PE). Never patch the multi-line: fix the single-line.
- Breaker poles must match the load phases. Terminals only at the panel ↔ field boundary (-X1 power, -X2 control). Real IEC 60947 terminals: 1/L1-2/T1, A1-A2, 13-14 (NO), 21-22 (NC), 95-96 (overload NC), U1/V1/W1.`,

  ladder: `## LADDER (IEC 61131-3 LD) — supported: XIC, XIO, OTE, OTL, OTU, TON, TOF, TP, CTU
- XIC = examine if 1; XIO = examine if 0. Parallel lines = OR; same line = AND.
- FAIL-SAFE: stop, E-STOP and overload relay are PHYSICAL NC contacts — the input is 1 when healthy. In ladder they are XIC in SERIES (1 = healthy). Never read an NC safety input with XIO.
- SEAL-IN START: [XIC STOP_OK] [XIC OL_OK] [XIC ESTOP_OK] ( [XIC START] OR [XIC K1] ) → OTE K1.
- REVERSING: XIO of the opposite contactor in each rung. STAR-DELTA: TON 5–10 s, star/delta mutually interlocked.
- One OTE per output (no double coil); every OTL has its OTU. Use the same tag names as the single-line (K1, M1, F1, S1).
- The emergency stop is a HARDWIRED circuit; the PLC rung is an additional interlock, never the only means.`,

  studio: `## FB ELECTRIC STUDIO (FBD/LAD pages) — same IEC engine as ladder
- Motor command: RS with S = start, R = NOT(stop_ok AND overload_ok AND estop_ok) — reset-dominant, NC fail-safe inputs. Never overwrite user pages; never invent I/O addresses.`,

  scada: `## SCADA / HMI (ISA-101, ISA-18.2)
- Strong color only for abnormal states (red alarm, amber deviation/simulation); normal in gray. Every alarm has priority, deadband and operator action; safety alarms are never shelved. No source = "no signal", never an invented value. HMI buttons act on simulation only.`,
};

/** Bloco de regras de um ou mais editores, no idioma pedido. */
export function editorRules(editors: readonly EditorId[], locale: RulesLocale = "pt-BR"): string {
  const table = locale === "en" ? EN : PT;
  return editors.map((e) => table[e]).join("\n\n");
}

/** Princípios transversais (nada inventado, correção não recria, simulação ≠ campo). */
export function corePrinciples(locale: RulesLocale = "pt-BR"): string {
  return locale === "en"
    ? `## CORE PRINCIPLES
- Never invent field data (cable length, measured current, physical address). Missing → ask the user / report as pending.
- A correction adjusts what exists; it never recreates existing equipment.
- Simulation never becomes a command to real equipment.`
    : `## PRINCÍPIOS
- Nunca invente dado de obra (comprimento de cabo, corrente medida, endereço físico). Faltou → pergunte ao usuário / registre como pendência.
- Correção ajusta o que existe; nunca recria equipamento existente.
- Simulação nunca vira comando em equipamento real.`;
}

export const ALL_EDITORS: readonly EditorId[] = [
  "unifilar",
  "multifilar",
  "ladder",
  "studio",
  "scada",
];
