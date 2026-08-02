# EletricAI Industrial OS — Tudo que já foi construído

SaaS multi-tenant, 100% no navegador, para engenharia elétrica e automação industrial: CAD elétrico, programação de CLP, SCADA, Digital Twin e geração de projetos por IA — num único workspace.

---

## 1. Conta, acesso e empresa (tenant)

- Cadastro, login, "esqueci minha senha" e redefinição de senha.
- Onboarding de criação da empresa (tenant) com dados básicos.
- Convite de membros por link/token, com aceite pela página de convite.
- Equipe com papéis e permissões; separação total de dados entre empresas.
- Tour guiado pós-criação da empresa, levando o usuário até o Workspace Industrial e mostrando os modos Unifilar / Ladder / FBD / SCADA.
- Tela de sessão expirada em vez de tela vazia.

## 2. Painel e gestão de projetos

- Dashboard inicial com visão geral.
- Lista de projetos: criar, abrir, renomear, organizar.
- Autosave contínuo do projeto, com log de salvamentos e status de persistência.
- Histórico de revisões e restauração de versões.
- Compartilhamento de projeto por modal (link/convidados).
- Clientes: cadastro de clientes, ficha individual e logo (armazenamento privado).

## 3. Workspace Industrial (o coração do app)

Um único editor com abas de modo, painel de propriedades à direita, painel inferior e barra superior.

**Unifilar (WebGL)** — desenho de diagramas elétricos com:
- Paleta/catálogo de componentes industriais.
- Portas e handles nos componentes, ligação de cabos ortogonais, seleção por marquee, multi-seleção com arraste, snap na grade, menu de contexto.
- Undo/redo completo em todas as ações.
- Cálculos elétricos e validação normativa (NBR 5410, NR-10, NR-12).

**Ladder (IEC 61131-3)**
- Grade de rungs com colunas configuráveis (3 a 12).
- Contatos, bobinas, selo, temporizadores TON/TOF/TP e contador CTU rodando em runtime.
- Validador de lógica com apontamento de erros.
- Autocomplete de tags.
- Importação de arquivos IL/ST com preview do rung importado (glyphs `─┤ ├─`, `─( )─`), avisos de parsing e opção de anexar ou substituir.

**FBD (Blocos de função)**
- Edição de blocos com parâmetros sincronizados ao runtime.
- Validação visual de ligações e exportação.

**SCADA**
- Telas de supervisão com widgets vinculados a tags (diálogo de bind de tag).
- Scripts do usuário executados em sandbox isolada (worker), sem risco para a aplicação.
- Motor SCADA em tempo real.

**CLP**
- Compilação de ST, mapa de I/O, validação de slots.
- Exportação PLCopen XML.

**Simulação e alarmes**
- Simulação determinística da lógica antes de ir para o hardware.
- Central de alarmes que gera notificações no app.
- Painel de controle de circuito (Play/Stop, pulso/manopla), lâmpada indicadora e rastreio de energização ("linha vermelha") com diagnóstico de falha.
- Colaboração em tempo real: cursores de múltiplos usuários no mesmo diagrama.

## 4. Digital Twin

- Cena 3D do ativo com dados de demonstração carregados automaticamente.
- Upload de modelos 3D próprios (GLB/GLTF até 75 MB) em bucket privado por empresa, com acesso por URL assinada.
- Telemetria em tempo real gravada em lote no histórico de amostras de tags.
- Modo "E-se?" (What-If): sobrescrever valores de tags, criar e comparar cenários, com a gravação de telemetria pausada durante a simulação hipotética.

## 5. Inteligência Artificial

- Arquiteto Industrial por IA: descreve o projeto em português e a IA gera/edita o diagrama.
- Preview do diff antes de aplicar qualquer alteração da IA; todo patch é reversível (undo).
- Chat com IA dentro do canvas e página de chat dedicada.
- Créditos de IA com validação exclusivamente no servidor (não é possível burlar pelo navegador), badge de créditos e modal de upgrade.
- Analytics reais de uso e custo de IA: consumo por mês e ranking de operações mais caras.

## 6. Integrações industriais e tempo real

- OPC-UA e Modbus TCP (com proteção contra acesso a hosts não autorizados).
- MQTT e ingestão de IoT por endpoint público autenticado.
- Página de tempo real com leituras de dispositivos.
- Configuração de protocolos e normas por empresa em Configurações.

## 7. Catálogo, BOM e exportações

- Catálogo de componentes/materiais.
- BOM (lista de materiais) gerada a partir do projeto.
- Exportação do projeto em PDF e DXF.

## 8. Cobrança e planos

- Planos, limites por plano e tela de faturamento.
- Stripe e Mercado Pago integrados por webhook assinado e verificado.

## 9. Configurações (14 áreas)

Perfil (com avatar e detecção de alterações não salvas), aparência/tema, notificações, equipe, integrações, protocolos, segurança, faturamento, status da IA, autosave, diagnósticos, monitor de segurança, limites de uso (rate limits) — com áreas restritas a administradores.

## 10. Observabilidade e confiabilidade (uso interno)

- Painel de Diagnósticos: status do Supabase, permissões, contadores de erros 500/503 em tempo real, distinção entre falhas de servidor e de renderização, e gráficos ao vivo.
- Monitor de Segurança com auditoria de RLS, buckets privados e políticas.
- Rate limiting de IA e IoT com fallback local e circuit breaker quando o serviço externo cai; limites ajustáveis por usuário ou globais na tela de Rate Limits.
- Notificações internas, captura de erros e páginas de erro amigáveis.
- 101 testes automatizados passando (navegação, persistência, switches de UI, importação Ladder, telemetria do Twin, What-If, etc.).
- CI no GitHub Actions com lint, format check, testes e build de produção; deploy na Vercel.

---

## Pendências conhecidas

1. **Leaked Password Protection** — precisa ser habilitado manualmente no painel do Supabase (Auth → Providers → Password). Não há API para automatizar.
2. **Publicação** — a correção da tela branca em produção (bootstrap SPA legado removido) já está no preview; produção só atualiza após republicar.

---

Nenhuma alteração de código é necessária para esta entrega — é apenas o inventário solicitado.
