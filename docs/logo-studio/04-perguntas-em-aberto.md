# Fase 0 — Perguntas em Aberto e Pontos de Decisão Críticos

**Data:** 2026-11-12  
**Objetivo:** Resolver ambiguidades técnicas, jurídicas e de segurança identificadas durante a auditoria antes de escrever código na **Fase 1**. Nenhuma suposição crítica será assumida silenciosamente.

---

## P1 — Crítico (Segurança Industrial): Conflito sobre Escrita Física na Fase 10
- **O que a Auditoria encontrou:** O repositório inteiro (Gates 3.2 a 4.3.2) aplica a invariante imutável `IS_PHYSICAL_CONTROL_ALLOWED = false as const` em `src/lib/studio/canonical/types.ts`, `src/lib/industrial/types.ts`, drivers Modbus (`FC5/6/15/16` bloqueados), OPC UA (`Write`/`Call` bloqueados) e Sparkplug B (`NCMD`/`DCMD` bloqueados), além de dezenas de testes automatizados que exigem falha caso escrita física seja habilitada.
- **O que a Seção 3 do pedido cita:** *"Comunicação com dispositivos reais usa somente protocolos documentados publicamente, fica atrás de feature flag, em modo somente leitura por padrão, com confirmação explícita e auditoria para qualquer escrita."*
- **Pergunta ao Dono do Produto:**
  1. Na Fase 10, o módulo deve permanecer **estritamente read-only / simulado** mantendo `IS_PHYSICAL_CONTROL_ALLOWED = false` (recomendado para segurança NR-10/NR-12 em SaaS multi-tenant), **ou** você deseja introduzir uma segunda camada exclusivamente no Edge Daemon local (fora do browser/Cloud) com dupla confirmação física, assinatura criptográfica e RBAC de engenheiro autorizado, mantendo a trava Cloud em `false`?

---

## P2 — Nomenclatura Exata (`PRODUCT_NAME` e Feature Flag)
- **O que a Auditoria encontrou:** No briefing constam os termos *"eletric Studio"* (Seção 2), *"LOGO Studio"* (Decisão D3) e *"logoStudio"* (chave da feature flag, Seção 5), além da regra inegociável da Seção 3: nunca usar marcas registradas de terceiros (`LOGO!`) espalhadas e isolar o nome em uma única constante `PRODUCT_NAME`.
- **Pergunta:**
  1. Qual deve ser o valor exato de exibição da constante `PRODUCT_NAME` na interface (`"eletric Studio"`, `"ElétricAi Compact Studio"`, ou outro)?
  2. Podemos manter o identificador técnico interno da feature flag exatamente como `logoStudio` (conforme Seção 5) enquanto o texto visível ao usuário vem exclusivamente de `PRODUCT_NAME` / i18n?
  3. Qual será o valor padrão da feature flag `logoStudio` para novos tenants e para a sua conta de engenharia durante o desenvolvimento (`false` para produção, habilitada via painel/configuração para admin/homologação)?

---

## P3 — Relação UX no Workspace: Unificação vs Convivência de Editores
- **O que a Auditoria encontrou:** Hoje `ModeTabs` (`src/lib/workspace-data.ts`) já possui as abas separadas: `Ladder`, `FBD`, `PLC` e `Studio IEC` (CODESYS Parity, criado no Gate 4.0).
- **Pergunta:**
  1. Como o usuário acessará o novo módulo `eletric Studio` no `IndustrialWorkspace`?
     - **(Opção A — Recomendada para D3):** Uma nova aba condicional (`compact_studio`, exibida quando a flag `logoStudio` estiver ativa) que unifica o ambiente completo (Diagrama FBD/LAD alternável sobre o mesmo programa + Hardware Compacto + Simulador), **e** os editores FBD/LAD compartilhando a mesma base de runtime.
     - **(Opção B):** Evoluir diretamente as abas `FBD`, `Ladder` e `PLC` existentes quando o dispositivo configurado no projeto for da classe compacta, sem criar uma 11ª aba no `ModeTabs`.

---

## P4 — Política de Convergência das Pilhas Duplicadas (`src/lib/fbd/` vs `src/lib/studio/`)
- **O que a Auditoria encontrou:** Há dois motores FBD ativos em diretórios diferentes (`src/lib/fbd/engine/` usado pelo `FbdCanvas`, e `src/lib/studio/iec/languages/fbd-engine.ts` usado pelo `EngineeringStudio`), além de `src/lib/fbd/runtime.ts` (legado).
- **Pergunta:**
  1. Autoriza (após testes de caracterização na Fase 1/2) depreciar/remover `src/lib/fbd/runtime.ts` (legado não usado) e fazer o `EngineeringStudio` delegar blocos FBD para o núcleo unificado tipado (`src/lib/fbd/engine/`), garantindo D3 ("nenhum segundo motor de execução")?

---

## P5 — Origem e Curadoria do Catálogo de Hardware Compacto (Fase 5)
- **O que a Auditoria encontrou:** A Seção 7G exige catálogo orientado a dados com origem da informação e data da verificação, marcando claramente o que não foi verificado.
- **Pergunta:**
  1. Você prefere que o catálogo inicial contenha **perfis técnicos representativos baseados exclusivamente em fichas técnicas públicas** (ex.: classe 8DI/4DO 24VDC, expansões 4DI/4DO, 2AI, 2AQ, módulo RTD PT100/1000, fonte 24VDC) com nomes funcionais genéricos compatíveis (`ELC-BA8-24DC`, etc.) ou part numbers oficiais reais de catálogos públicos? (Lembrando que números exatos não conferidos serão marcados como `verified: false` até validação em datasheet público.)

---

## P6 — Compatibilidade de Importação/Exportação
- **O que a Auditoria encontrou:** Já existe exportador parcial PLCopen XML (`src/lib/plc/plcopen-export.ts`) e adaptador de importação (`src/lib/importer/adapters/plcopen-adapter.ts`). A Seção 3 diz que formatos nativos proprietários (`.lsc` / `.lld`) ficam fora do escopo salvo se houver especificação pública documentada (não há especificação pública oficial da Siemens para o binário/XML interno completo de versões recentes de `.lsc` sem engenharia reversa).
- **Confirmação solicitada:** Confirmado manter **fora de escopo** a importação/exportação de arquivos `.lsc` / `.lld` nativos e focar em:
  1. **Formato JSON canônico versionado ElétricAi** (`eletricStudio` dentro do projeto v3);
  2. **CSV sanitizado** para tabela de nomes simbólicos/comentários de E/S;
  3. **PLCopen XML (TC6 v2.01)** para intercâmbio padronizado IEC 61131-3?
