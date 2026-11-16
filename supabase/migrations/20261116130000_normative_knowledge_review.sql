-- Revisão da Base Normativa EletricAI (2026-11-16).
--
-- Conferência dos 28 resumos de 20261116120000 contra fontes públicas
-- secundárias (material didático de universidades, guias de fabricantes de
-- cabos e publicações técnicas). Correções:
--   1. IEC 60909: κ varia de 1,02 a 2,0 (κ = 1,02 + 0,98·e^(−3R/X)), não 1,0.
--   2. Motor: o fator 1,25 × In é regra do NEC 430.22, não texto da NBR 5410;
--      a NBR 5410 trata circuitos de motores em 6.5.1.
--   3. Neutro: retirado número de tabela não confirmado.
--   4. DR 30 mA: incluídas tomadas internas que possam alimentar
--      equipamentos na área externa.
--   5. NBR 14039: registrada a edição 2021 e a revisão prevista.
--   6. Todos os resumos: metadata.revisao/aviso — são resumos indicativos,
--      a conferir na edição vigente antes de uso em projeto de cliente.
--
-- Idempotente: cada UPDATE localiza o trecho pelo início do texto antigo
-- (não casa de novo depois de corrigido); metadata usa jsonb || (sobrescreve).

UPDATE public.normative_chunks
SET chunk_text = $nb$IEC 60909-0 — corrente de curto-circuito trifásica inicial I"k = c × Un / (√3 × Zk), com fator de tensão c (em baixa tensão, cmax = 1,05 para tolerância de tensão de 6% e 1,10 para 10%; em média tensão, 1,10). A corrente de pico é ip = κ × √2 × I"k, com κ = 1,02 + 0,98 × e^(−3R/X), variando de 1,02 (circuito resistivo) a 2,0 (circuito puramente indutivo). O esforço térmico e a capacidade de interrupção dos dispositivos são verificados contra esses valores.$nb$
WHERE chunk_text LIKE $nb$IEC 60909-0 — corrente de curto-circuito trifásica inicial%κ entre 1,0 e 2,0%$nb$;

UPDATE public.normative_chunks
SET chunk_text = $nb$Corrente nominal de motor trifásico: In = P / (√3 × U × η × cos φ), com P a potência mecânica no eixo em watts, U a tensão de linha, η o rendimento e cos φ o fator de potência, ambos da placa ou catálogo. A NBR 5410 (6.5.1) trata dos circuitos de motores, incluindo a queda de tensão na partida. Na prática de projeto, o condutor que alimenta um único motor em regime contínuo é dimensionado para pelo menos 1,25 × In (critério do NEC 430.22, adotado como referência); confirmar o critério aplicável na edição vigente da NBR 5410.$nb$
WHERE chunk_text LIKE $nb$Corrente nominal de motor trifásico:%o condutor deve suportar 1,25 × In quando alimenta um único motor em regime contínuo.$nb$;

UPDATE public.normative_chunks
SET chunk_text = $nb$NBR 5410 6.2.6.2 — condutor neutro: em circuitos monofásicos e em circuitos com conteúdo harmônico relevante o neutro tem a mesma seção da fase. Em circuitos trifásicos equilibrados com fase acima de 25 mm² (cobre) e taxa de terceira harmônica até 15%, o neutro pode ter seção reduzida conforme a tabela de seção reduzida do neutro da própria norma, desde que protegido contra sobrecorrente. Com terceira harmônica acima de 33%, a corrente de neutro pode superar a de fase e o neutro deve ser dimensionado por ela.$nb$
WHERE chunk_text LIKE $nb$NBR 5410 6.2.6.2 — condutor neutro:%conforme a Tabela 48.%$nb$;

UPDATE public.normative_chunks
SET chunk_text = $nb$NBR 5410 5.1.3.2.2 — uso obrigatório de dispositivo DR de alta sensibilidade (IΔn ≤ 30 mA) em: circuitos de locais com banheira ou chuveiro; tomadas em áreas externas; tomadas em áreas internas que possam alimentar equipamentos na área externa; tomadas de cozinhas, copas, lavanderias, áreas de serviço, garagens e demais áreas internas molhadas ou sujeitas a lavagem; circuitos que alimentem equipamentos em áreas externas.$nb$
WHERE chunk_text LIKE $nb$NBR 5410 5.1.3.2.2 — uso obrigatório de dispositivo DR%$nb$
  AND chunk_text NOT LIKE $nb$%áreas internas que possam alimentar equipamentos na área externa%$nb$;

UPDATE public.normative_chunks
SET chunk_text = $nb$NBR 14039 (edição 2021; revisão em andamento) — aplica-se a instalações de 1,0 kV a 36,2 kV. A subestação de entrada exige proteção geral em média tensão: por disjuntor acionado por relé secundário com funções de sobrecorrente de fase e neutro (50/51 e 50N/51N) ou, dentro dos limites da concessionária, por chave seccionadora com fusíveis. Barramentos, transformadores e massas devem ser interligados à malha de aterramento. Os limites e o padrão de entrada da concessionária local prevalecem.$nb$
WHERE chunk_text LIKE $nb$NBR 14039 — aplica-se a instalações de 1,0 kV a 36,2 kV.%$nb$;

UPDATE public.normative_chunks c
SET metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
  'revisao', '2026-11-16',
  'aviso', 'Resumo técnico indicativo; conferir na edição vigente da norma antes de uso em projeto.'
)
FROM public.normative_documents d
WHERE d.id = c.document_id
  AND d.source_type = 'resumo_tecnico_eletricai';
