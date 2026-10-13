# Termos de Uso — EletricAI Industrial OS

**Última atualização:** 12 de outubro de 2026
**Versão:** 1.1 (nova §17 — confidencialidade de projetos industriais)
**Operador:** EletricAI Tecnologia Ltda. (CNPJ: 00.000.000/0001-00)
**Contato:** contato@eletricai.com · **Privacidade/DPO:** privacidade@eletricai.com
**Endereço:** Av. Paulista, 1000 — São Paulo/SP — CEP 01310-100

Ao criar uma conta ou utilizar a Plataforma, você declara ter lido, compreendido e aceito estes Termos e a [Política de Privacidade](/privacidade). Se não concordar, não utilize os serviços.

---

## 1. Objeto e definições

1.1. A **Plataforma** é um SaaS B2B para engenharia elétrica e automação industrial: projetos elétricos (unifilar/multifilar), lógica de controle (Ladder/FBD), configuração de PLC, telas SCADA/HMI, simulação, digital twin 3D com telemetria IoT, cálculos, catálogo de componentes e recursos de IA assistiva (Arquiteto, Chat, patches de diagrama).

1.2. **Usuário:** pessoa natural que acessa a Plataforma. **Cliente/Tenant:** organização contratante (empresa, planta, integrador). **Plano:** free, basic, pro ou premium, com limites e preços próprios.

1.3. Estes Termos regem o uso por todos os Usuários e Tenants. Propostas comerciais, Order Forms e DPAs específicos prevalecem sobre estes Termos em caso de conflito, naquilo em que divergirem.

## 2. Elegibilidade, conta e segurança

2.1. A Plataforma destina-se a **profissionais maiores de 18 anos**, para uso corporativo. Ao cadastrar-se, você declara ter capacidade e poderes para vincular o Tenant indicado.

2.2. Cadastro por e-mail/senha ou Google OAuth (Supabase Auth). Você é responsável por manter a confidencialidade das credenciais e por toda atividade na sua conta.

2.3. **Papéis e responsabilidades no Tenant:** `owner`, `admin`, `engineer`, `operator`, `viewer`. Owners/admins respondem pelos convites, papéis atribuídos e uso feito pelos membros do seu Tenant — incluindo os deveres de confidencialidade da §17.

2.4. Comunique imediatamente qualquer uso não autorizado para contato@eletricai.com. Reservamo-nos o direito de suspender contas em caso de suspeita fundada de fraude, abuso ou violação destes Termos.

## 3. Licença de uso e propriedade intelectual

3.1. Concedemos ao Cliente uma licença **limitada, não exclusiva, intransferível e revogável** de acesso e uso da Plataforma durante a vigência da assinatura, exclusivamente para fins internos do Tenant.

3.2. A Plataforma, incluindo software, marcas, layout, documentação e modelos de IA proprietários, pertence à EletricAI ou a seus licenciantes. Nada nestes Termos transfere propriedade intelectual.

3.3. **Conteúdo do Cliente** (diagramas, lógicas, configurações, modelos 3D, telemetria, documentos, prompts e projetos) permanece de propriedade do Cliente. O Cliente nos concede licença limitada para hospedar, processar, exibir e fazer backup desse conteúdo **exclusivamente para prestar os serviços** (incluindo inferência de IA quando o recurso for usado).

3.4. **Feedback:** sugestões de melhoria poderão ser incorporadas livremente, sem compensação, salvo acordo escrito em contrário.

## 4. Uso aceitável — proibições

4.1. É vedado, sem limitação:
- (a) violar lei aplicável, direitos de terceiros ou normas técnicas de segurança (NR-10/NR-12, NBR 5410) na operação assistida pela Plataforma;
- (b) tentar acessar dados de outros Tenants, explorar vulnerabilidades, fazer engenharia reversa, scraping em massa ou burlar rate limits, quotas e controles de acesso;
- (c) enviar malware, contornar o sandbox de scripts SCADA, ou executar código fora dos mecanismos previstos;
- (d) usar a IA para gerar instruções destinadas a causar dano a pessoas, bens, infraestrutura crítica ou para fins ilícitos;
- (e) revender, sublicenciar ou disponibilizar a Plataforma a terceiros fora do Tenant, salvo autorização escrita;
- (f) remover avisos de propriedade, ou representar-se como a EletricAI.

4.2. Podemos remover conteúdo e suspender ou encerrar contas que violem esta seção, observado o devido processo da seção 12.

## 5. Planos, pagamentos e créditos de IA

5.1. **Planos e limites:** cada plano possui limites de projetos, membros, telemetria, storage e **créditos mensais de IA**. Os limites vigentes estão descritos em `/settings/billing` e na proposta contratada.

5.2. **Cobrança:** assinaturas via **Stripe** e/ou **Mercado Pago** (cartão, boleto, PIX onde disponível). Preços em BRL, cobrados antecipadamente por ciclo. Impostos incidentes no Brasil serão acrescidos/recolhidos conforme a legislação.

5.3. **Webhooks e conciliação:** eventos de pagamento são processados de forma idempotente; divergências são conciliadas contra a API oficial do processador. O status de assinatura no Tenant reflete o estado confirmado pelo processador, não apenas a ação do usuário no checkout.

5.4. **Créditos de IA:** consumidos por operação (geração de arquitetura, chat, patches) conforme tabela de custos. Créditos não utilizados **não acumulam** para o mês seguinte, salvo plano enterprise com disposição diversa. O esgotamento suspende apenas os recursos de IA, não o acesso ao restante da Plataforma.

5.5. **Reajuste e alteração de preços:** comunicados com **30 dias de antecedência**; o novo valor aplica-se a partir do ciclo seguinte. O Cliente pode cancelar antes da vigência (seção 6).

5.6. **Inadimplência:** após 15 dias de atraso, os recursos pagos poderão ser suspensos (modo leitura); após 60 dias, a conta poderá ser degradada para o plano free, preservados os direitos de exportação da seção 8.

## 6. Vigência, cancelamento e renovação

6.1. Assinaturas renovam-se automaticamente por iguais períodos até o cancelamento em `/settings/billing` ou por solicitação a contato@eletricai.com.

6.2. O cancelamento produz efeitos ao fim do ciclo pago (sem reembolso proporcional), mantido o acesso até essa data, salvo disposição legal em contrário.

6.3. Podemos encerrar contas gratuitas inativas por mais de **12 meses**, mediante aviso de 30 dias e oportunidade de exportação.

## 7. Direito de arrependimento e reembolsos (CDC / consumidor)

7.1. Para contratações feitas **fora do estabelecimento comercial por pessoa física consumidora final**, aplica-se o direito de arrependimento de **7 dias** (CDC, art. 49), com devolução integral dos valores pagos no período.

7.2. Para clientes **pessoa jurídica em uso B2B**, não há reembolso proporcional após o início do ciclo, exceto: (a) falha grave e não sanada do serviço em 15 dias após notificação; (b) cobrança em duplicidade ou erro comprovado — neste caso, estorno integral do valor indevido em até 10 dias úteis.

## 8. Dados do Cliente, portabilidade e backup

8.1. O Cliente pode **exportar** seus projetos a qualquer tempo (PDF memorial, DXF, BOM, snapshot JSON via versões de projeto), inclusive durante o período de suspensão por inadimplência.

8.2. Após o encerramento, mantemos os dados por **90 dias** (janela de recuperação) e depois os excluímos, ressalvadas retenções legais (fiscais: 5 anos para faturas). Backups pontuais (Supabase PITR, 7 dias) expiram por rotação automática.

8.3. Solicitações de portabilidade/exclusão seguem a Política de Privacidade (privacidade@eletricai.com, prazo de 15 dias úteis).

## 9. Inteligência Artificial — escopo, limites e isenções

9.1. Os recursos de IA são **assistivos**: geram propostas de projeto, explicações e patches sujeitos a **validação automática (normativa + simulação de E-STOP) e revisão humana obrigatória**. A IA pode errar, omitir proteções ou propor dimensionamentos inadequados.

9.2. **Nenhum conteúdo gerado por IA deve ser energizado, instalado ou operado sem revisão e aprovação de profissional legalmente habilitado** (engenheiro eletricista com CREA, conforme aplicável), com ART quando exigida.

9.3. **Upload/OCR de PDF na IA:** quando indicado como simulação/mock na interface, o recurso não executa extração real — não confie nele para decisões normativas.

9.4. Prompts e contexto de projeto enviados à IA passam por sanitização anti-injeção e limites de tamanho; o histórico de chat (até 40 mensagens) é sanitizado antes do envio ao provedor do modelo (DeepSeek).

9.5. Não utilizamos o conteúdo do Cliente para treinar modelos de terceiros; o provedor do modelo opera sob contrato com retenção zero para treinamento.

## 10. Segurança operacional — avisos críticos

10.1. **Simulação não atesta aptidão para operação.** Os motores de Ladder/FBD simulam lógica; **não** simulam circuitos elétricos de potência nem comportamento de PLC físico. Resultados de simulação, verificação de E-STOP e validadores normativos são **apoio ao projeto, não certificação**.

10.2. **Nenhum recurso da Plataforma — inclusive IA, MCP, comandos IoT ou integrações Modbus/OPC-UA — deve acionar equipamentos reais sem arquitetura explícita de autorização, confirmação humana e dispositivos físicos de segurança** (relés de segurança, seccionadoras, LOTO, conforme NR-10/NR-12).

10.3. A fila de comandos IoT (`iot_command_log`) possui watchdog/fail-safe lógico, mas **não substitui** intertravamentos físicos e procedimentos de bloqueio/sinalização na planta.

10.4. O Cliente é exclusivamente responsável por: comissionamento, testes em campo, aterramento, proteções, parametrização de dispositivos e conformidade com normas (NBR 5410/14039, NR-10/12, IEC 61131, ISA-18.2).

## 11. Nível de serviço, suporte e manutenção

11.1. Meta de disponibilidade: **99,5% mensal** para o núcleo autenticado (excluídas manutenções programadas com aviso de 48h e eventos de força maior).

11.2. Suporte por e-mail (contato@eletricai.com) em horário comercial, com priorização por severidade. Status e diagnósticos em `/settings/diagnostics` e `/settings/ai-status`.

11.3. Telemetria, Realtime e upload de modelos 3D dependem de conectividade e limites do plano; indisponibilidades de provedores (Supabase, Vercel, Upstash, DeepSeek, Stripe/MP) serão comunicadas e mitigadas por fallback/fail-closed documentado, sem constituir descumprimento quando fora do nosso controle razoável.

## 12. Suspensão e encerramento por violação

12.1. Em caso de violação material destes Termos, notificaremos o Tenant com prazo de **10 dias para sanar**, salvo risco iminente à segurança, a terceiros ou à Plataforma — hipótese em que a suspensão poderá ser imediata e proporcional.

12.2. Na rescisão por justa causa imputável ao Cliente, não haverá reembolso do ciclo vigente. Garantiremos a janela de exportação da seção 8.2 sempre que operacionalmente viável e lícito.

## 13. Garantias, limitação de responsabilidade e indenização

13.1. A Plataforma é fornecida **"no estado em que se encontra"**, sem garantias de adequação a finalidade específica além do compromisso de operar conforme a documentação e o plano contratado.

13.2. **Limitação:** em nenhuma hipótese nossa responsabilidade agregada excederá **o total pago pelo Cliente nos 12 meses anteriores ao evento**. Não respondemos por lucros cessantes, perda de dados decorrente de mau uso ou de descumprimento das seções 9–10, nem por danos indiretos.

13.3. Nada nesta seção limita responsabilidade por dolo, fraude, violação de propriedade intelectual ou obrigações irrenunciáveis por lei.

13.4. O Cliente nos indenizará por reclamações de terceiros decorrentes de seu uso indevido, de seus projetos/instalações ou do descumprimento destes Termos.

## 14. Privacidade e proteção de dados

14.1. O tratamento de dados pessoais rege-se pela [Política de Privacidade](/privacidade), parte integrante destes Termos, em conformidade com a **LGPD (Lei 13.709/2018)** e o **GDPR**.

14.2. Infraestrutura: Supabase (Auth/DB/Storage/Realtime), Vercel (hospedagem), Upstash (rate limiting), DeepSeek (LLM), Stripe e Mercado Pago (cobrança), Google (OAuth opcional) — conforme detalhado na Política.

## 15. Alterações dos Termos

15.1. Poderemos atualizar estes Termos para refletir mudanças legais, técnicas ou comerciais, mediante aviso por e-mail e/ou banner com **30 dias de antecedência** para mudanças materiais. O uso continuado após a vigência constitui aceitação. Em caso de discordância, o Cliente poderá cancelar (seção 6) antes da vigência.

15.2. O histórico de versões permanece disponível no repositório e mediante solicitação.

## 16. Lei aplicável, foro e disposições gerais

16.1. Estes Termos regem-se pelas leis da **República Federativa do Brasil**. Fica eleito o **foro da Comarca de São Paulo/SP**, com renúncia a qualquer outro.

16.2. **Integralidade e cessão:** estes Termos, com a Política e a proposta contratada, constituem o acordo integral. O Cliente não poderá ceder sem nosso consentimento; poderemos ceder em reorganizações societárias, garantida a continuidade dos serviços.

16.3. **Força maior:** nenhuma parte responde por atrasos decorrentes de eventos fora de seu controle razoável (falhas de provedores globais, desastres, atos governamentais).

16.4. **Contato:** contato@eletricai.com (comercial/suporte) · privacidade@eletricai.com (DPO/privacidade).

## 17. Confidencialidade de projetos industriais

17.1. **Definição.** São **Informações Confidenciais do Cliente**: diagramas unifilares/multifilares, lógicas Ladder/FBD, parametrizações de PLC e instrumentos, telas SCADA, modelos 3D, telemetria e dados operacionais da planta, memoriais de cálculo, listas de materiais, documentos enviados à Plataforma e quaisquer segredos industriais ou de negócio acessíveis por meio do serviço (incluídos os protegidos pelo art. 195, XI, da Lei 9.279/1996). São **Informações Confidenciais da EletricAI**: código-fonte, modelos e prompts proprietários, roadmap não público, credenciais de infraestrutura e termos comerciais não publicados.

17.2. **Deveres da EletricAI.** Tratamos o conteúdo do Tenant como confidencial e:
- (a) **acesso por necessidade:** somente sistemas automatizados e pessoal autorizado sob dever de sigilo acessam o conteúdo, e apenas para prestar, proteger ou dar suporte ao serviço (nunca para finalidade comercial própria);
- (b) **isolamento técnico:** segregação lógica por Tenant com controle de acesso por papéis (`owner/admin/engineer/operator/viewer`), autorização por projeto e URLs assinadas de curta duração — conforme as medidas descritas na Política de Privacidade (§7);
- (c) **vedação de divulgação:** não divulgamos o conteúdo do Tenant a terceiros, exceto aos operadores listados na Política (§4), sob cláusulas de proteção de dados, e mediante ordem legal (neste caso, avisaremos o Tenant com antecedência sempre que lícito);
- (d) **vedação de treinamento:** não utilizamos o conteúdo do Cliente para treinar modelos de IA próprios ou de terceiros (§9.5);
- (e) **incidentes:** comunicaremos ao Tenant, sem demora injustificada, qualquer incidente que comprometa a confidencialidade do seu conteúdo, com a descrição, as medidas adotadas e os canais de acompanhamento.

17.3. **Deveres do Cliente.** O Tenant deve: (a) gerenciar membros, papéis e convites segundo o princípio do menor privilégio; (b) proteger credenciais, chaves de API IoT e URLs assinadas; (c) classificar internamente o que é sigiloso antes de subir à Plataforma; (d) revogar prontamente o acesso de ex-colaboradores e terceiros; (e) não expor conteúdo sigiloso em áreas compartilhadas fora do seu Tenant (ex.: prompts em canais públicos, exports enviados por engano).

17.4. **Exceções.** Não são confidenciais as informações que: (a) já eram públicas sem violação destes Termos; (b) o receptor já possuía licitamente antes do acesso; (c) foram desenvolvidas de forma independente e comprovável; (d) devam ser divulgadas por lei ou ordem judicial/administrativa (limitada ao estritamente exigido, com aviso prévio ao titular quando lícito).

17.5. **Vigência do sigilo.** Os deveres desta seção valem durante a assinatura e por **5 (cinco) anos** após o encerramento, para qualquer fim. Segredos industriais protegidos por lei permanecem sigilosos enquanto mantiverem esse caráter.

17.6. **Devolução e eliminação.** Ao encerrar, o Cliente pode exportar seu conteúdo (§8.1); após a janela de 90 dias (§8.2) e ressalvadas retenções legais, eliminamos o conteúdo dos sistemas ativos e propagamos a eliminação aos operadores (§6 da Política). Backups expiram por rotação. Pedidos antecipados seguem o fluxo de eliminação (privacidade@eletricai.com).

17.7. **Descumprimento.** A violação desta seção autoriza a parte prejudicada a buscar tutela de urgência, sem prejuízo de perdas e danos. O Cliente responde por acessos indevidos originados da má gestão de membros, papéis e credenciais do seu Tenant (§2.3).

17.8. **Acordos específicos.** NDAs ou cláusulas de confidencialidade assinados em propostas/Order Forms **prevalecem** sobre esta seção naquilo em que divergirem.

---

*Ao clicar em "Criar conta", "Entrar" ou "Assinar", você confirma a aceitação destes Termos e da Política de Privacidade.*
