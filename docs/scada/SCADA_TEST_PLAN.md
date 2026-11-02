# SCADA SUPERVISÓRIO — Plano de Testes & Validação

**Documento:** Plano de Testes de Integração e Homologação de Qualidade  
**Ambiente:** Vitest + Playwright + TypeScript Strict

---

## 1. Escopo de Testes

Os testes cobrem todas as camadas do sistema:

1. **Testes Unitários da Store SCADA (`src/__tests__/scada-supervisory-system.test.ts`)**:
   - Inicialização correta de KPIs conforme imagem de referência.
   - Atuação autoritativa do comando de Parada de Emergência (E-STOP).
   - Rearme seguro sem religamento automático.
   - Gerenciamento de alarmes ISA-18.2 (Reconhecimento individual e em lote).
   - Comandos de equipamentos (Partida, Parada, Auto, Manual).
   - Forçamento e liberação de TAGs com registro em trilha de auditoria.
   - Navegação por todas as 11 visões.
   - Estado de gateways de comunicação.

2. **Testes de Regressão Global**:
   - Execução completa da suíte de 86 arquivos de teste e 711 testes unitários com 100% de aprovação.

3. **Verificação de Compilação e Formatação**:
   - `bun run typecheck`: 0 erros de TypeScript.
   - `bun run lint`: 0 erros de ESLint.
   - `bun run format:check`: 100% dos arquivos formatados com Prettier.
   - `bun run build`: Geração de bundles de produção e SSR sem erros.
