# Política de Privacidade

**LGPD (Lei 13.709/2018) e GDPR — Como tratamos seus dados**

- **Aplicação:** EletricAI Industrial OS
- **Última atualização:** 12 de outubro de 2026
- **Versão:** 1.0
- **Responsável pelo tratamento:** EletricAI Tecnologia Ltda. (CNPJ: 00.000.000/0001-00)
- **Encarregado de Dados (DPO):** privacidade@eletricai.com

---

## 1. Objetivo e Escopo

Esta Política de Privacidade descreve como a EletricAI Industrial OS ("nós", "nosso", "a Plataforma") coleta, usa, armazena, compartilha e protege seus dados pessoais quando você acessa e utiliza nossos serviços, em conformidade com a Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018) e o Regulamento Geral de Proteção de Dados da UE — GDPR (Regulamento 2016/679).

Ao criar uma conta ou utilizar a Plataforma, você declara ter lido, compreendido e concordado com os termos aqui descritos.

---

## 2. Definições

| Termo                        | Definição                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Titular**                  | Pessoa natural a quem se referem os dados pessoais (você, usuário).                                                                                                    |
| **Dados Pessoais**           | Informação relacionada a pessoa natural identificada ou identificável (exemplo: nome, e-mail, IP).                                                                     |
| **Dados Pessoais Sensíveis** | Dados sobre origem racial/étnica, convicção religiosa, opinião política, filiação sindical, saúde, vida sexual, genética ou biométrica. Não coletamos dados sensíveis. |
| **Tratamento**               | Toda operação realizada com dados pessoais (coleta, armazenamento, uso, compartilhamento, exclusão, etc.).                                                             |
| **Controlador**              | EletricAI Tecnologia Ltda., a quem compete as decisões sobre o tratamento.                                                                                             |
| **Operador**                 | Terceiros que tratam dados em nosso nome (exemplo: Supabase, Stripe, Mercado Pago, Upstash).                                                                           |
| **Anonimização**             | Processo técnico que impede a associação do dado a um indivíduo.                                                                                                       |

---

## 3. Dados Coletados e Finalidades

### 3.1 Dados Fornecidos pelo Titular

| Categoria               | Exemplos                                       | Finalidade                                             | Base Legal (LGPD Art. 7º / GDPR Art. 6º)                  |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| **Identificação**       | Nome completo, e-mail corporativo              | Criação de conta, autenticação, comunicação contratual | Execução de contrato (LGPD Art. 7º, V / GDPR Art. 6º, b)  |
| **Autenticação**        | Hash de senha (bcrypt), tokens OAuth (Google)  | Login seguro, sessões, MFA                             | Execução de contrato / Interesse legítimo (segurança)     |
| **Perfil Profissional** | Cargo, setor, empresa (tenant)                 | Personalização, controle de acesso por tenant (RBAC)   | Execução de contrato                                      |
| **Faturamento**         | Dados de cobrança (via Stripe ou Mercado Pago) | Processamento de assinaturas, emissão de notas fiscais | Execução de contrato / Obrigação legal (LGPD Art. 7º, II) |

### 3.2 Dados Coletados Automaticamente

| Categoria             | Exemplos                                                                    | Finalidade                                                                     | Base Legal                                              |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Logs de Acesso**    | IP, user-agent, timestamp, páginas visitadas                                | Segurança (detecção de abuso), auditoria, analytics agregado                   | Interesse legítimo (LGPD Art. 7º, IX / GDPR Art. 6º, f) |
| **Telemetria de Uso** | Ações na interface, tempo em telas, erros de frontend                       | Melhoria de experiência, debugging, métricas de adoção                         | Interesse legítimo / Consentimento                      |
| **Dados de Projeto**  | Diagramas, lógica Ladder/FBD, configurações PLC, modelos 3D, telemetria IoT | Execução das funcionalidades contratadas (engenharia, simulação, digital twin) | Execução de contrato                                    |
| **Conversas com IA**  | Prompts, respostas, histórico de chat (até 40 mensagens)                    | Prestação do serviço de IA (Arquiteto, Chat, Canvas)                           | Execução de contrato                                    |
| **Chaves de API IoT** | Hash SHA-256 da chave e prefixo                                             | Autenticação de dispositivos IoT no endpoint público                           | Execução de contrato                                    |

### 3.3 Dados Não Coletados

- **Dados sensíveis:** saúde, biometria, origem racial, opiniões políticas, entre outros.
- **Dados de menores de 18 anos:** serviço B2B exclusivo para profissionais.
- **Localização geográfica precisa:** dados de GPS não são coletados.
- **Conteúdo de áudio e vídeo:** exceto se o usuário fizer upload explícito de arquivos de mídia.

---

## 4. Compartilhamento com Terceiros (Operadores)

Seus dados podem ser compartilhados com os seguintes operadores, que atuam sob nossas instruções contratuais e cláusulas de proteção de dados:

| Operador           | Serviço                                                        | Dados Compartilhados                                            | Localização dos Servidores | Garantias                                                       |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| **Supabase Inc.**  | Auth, Database (PostgreSQL), Storage, Realtime, Edge Functions | Dados de conta, projetos, telemetria, arquivos, conversas de IA | EUA / UE                   | DPA, SCCs, SOC2 Type II, ISO 27001                              |
| **Stripe Inc.**    | Pagamentos (cartão, boleto, PIX via Stripe)                    | Dados de cobrança, e-mail, metadados de assinatura              | EUA / UE                   | PCI DSS Level 1, DPA, SCCs                                      |
| **Mercado Pago**   | Pagamentos locais (PIX, boleto, cartão BR)                     | Dados de cobrança, CPF/CNPJ, e-mail                             | Brasil                     | LGPD compliance, PCI DSS                                        |
| **Upstash**        | Rate limiting distribuído (AI, IoT, Auth, API)                 | ID do usuário (hash), contadores de requisição, timestamps      | EUA / UE                   | DPA, SOC2, Criptografia em trânsito e repouso                   |
| **DeepSeek (API)** | Modelos de linguagem (LLM) para IA                             | Prompts sanitizados, contexto de projeto (sem PII direta)       | China / Singapura          | Contrato de processamento, retenção zero (não treina com dados) |
| **Vercel Inc.**    | Hospedagem (Edge/Serverless), logs de acesso                   | IP, user-agent, metadados de requisição                         | Global (Edge)              | DPA, SOC2, ISO 27001                                            |
| **Google**         | Login social (OAuth)                                           | E-mail, nome, foto de perfil                                    | Global                     | DPA, GDPR compliance                                            |

> **Nota:** Não vendemos, alugamos nem compartilhamos dados com terceiros para fins de marketing ou publicidade direcionada.

---

## 5. Transferência Internacional de Dados

Como utilizamos provedores globais, seus dados podem ser processados fora do Brasil ou da União Europeia. Garantimos o cumprimento das seguintes medidas:

- Cláusulas Contratuais Padrão (SCCs) com todos os operadores fora do EEE.
- Decisão de adequação onde aplicável.
- Criptografia ponta a ponta e pseudonimização para transferências a países sem adequação direta (como a API do DeepSeek, em que os prompts são sanitizados e não contêm dados pessoais identificáveis).

---

## 6. Retenção e Exclusão

Aplicamos os seguintes períodos-objetivo de retenção. As rotinas automatizadas de expurgo estão em implantação progressiva; até sua conclusão, a exclusão é executada por processo operacional interno dentro dos prazos abaixo:

| Categoria de Dados             | Período-objetivo de Retenção                        | Critério                                                          |
| ------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| **Conta e Perfil**             | Durante a vigência da conta + 90 dias após exclusão | Execução de contrato / Legítimo interesse (recuperação acidental) |
| **Dados de Projetos**          | Durante a conta ativa + 1 ano                       | Execução de contrato / Obrigação contratual                       |
| **Logs de Acesso e Auditoria** | 12 meses                                            | Interesse legítimo (segurança e compliance)                       |
| **Conversas com IA**           | 24 meses (configurável pelo administrador)          | Execução de contrato / Melhoria contínua                          |
| **Dados de Faturamento**       | 5 anos                                              | Obrigação legal (Art. 206 do Código Tributário Nacional)          |
| **Backups (Supabase PITR)**    | Conforme a janela do plano contratado               | Resiliência operacional                                           |
| **Dados Anonimizados**         | Indefinidamente                                     | Não considerados dados pessoais (LGPD Art. 3º, §1º)               |

**Exclusão sob solicitação:** Você pode solicitar a exclusão completa a qualquer momento pelo e-mail do DPO. A solicitação é atendida em até 15 dias úteis e a exclusão é propagada aos operadores em até 30 dias, ressalvadas as retenções legais (ex.: dados fiscais).

---

## 7. Segurança da Informação

Adotamos medidas técnicas e organizacionais proporcionais ao risco (LGPD Art. 46 / GDPR Art. 32):

- **Criptografia em trânsito:** todas as conexões utilizam HTTPS/WSS. A versão mínima do TLS é imposta pela infraestrutura (Vercel, Supabase, Upstash, Stripe), conforme a documentação de cada provedor.
- **Criptografia em repouso:** fornecida pela infraestrutura (Supabase para PostgreSQL/Storage, Vercel e Upstash), conforme a documentação de cada provedor.
- **Autenticação forte:** Supabase Auth com verificação local de JWT (JWKS, com fallback HS256 legado e validação remota). A autenticação de dois fatores (MFA) está planejada e ainda não disponível; enquanto isso, aplicamos rate limiting nos fluxos de login e encerramento global de sessão.
- **Duração das sessões:** seguimos os tempos de expiração padrão do Supabase Auth (configuráveis no painel do projeto), com atualização automática de tokens no cliente.
- **Armazenamento de segredos:** Chaves de API (DeepSeek, Stripe, Mercado Pago, Upstash, service role do Supabase) existem exclusivamente em variáveis de ambiente no servidor e nunca são embarcadas no código do navegador.
- **Tokens IoT:** armazenados como hash SHA-256 não reversível com prefixo de identificação e escopo limitado (`iot:ingest`).
- **Proteções operacionais:** rate limiting distribuído (Redis) com negação segura (fail-closed) para IA e IoT quando o limitador está indisponível; guarda anti-SSRF nas conexões Modbus TCP; ambiente isolado (Web Worker, sem DOM/rede/armazenamento) para scripts de usuário no SCADA; isolamento por tenant no banco de dados através de Row Level Security (RLS) nas tabelas de dados de cliente.
- **Backups:** recuperação pontual (PITR) e backups automáticos fornecidos pelo Supabase, conforme o plano contratado do projeto.

---

## 8. Direitos do Titular

Em conformidade com a LGPD (Art. 18) e GDPR (Arts. 15–22), você possui os seguintes direitos:

- **Confirmação e Acesso:** Solicitar a confirmação do tratamento e cópia dos seus dados.
- **Correção:** Retificar dados incompletos, inexatos ou desatualizados.
- **Anonimização, Bloqueio ou Eliminação:** Aplicável a dados desnecessários, excessivos ou tratados em desacordo com a lei.
- **Portabilidade:** Receber seus dados em formato estruturado e interoperável (JSON/CSV).
- **Informação sobre Compartilhamento:** Saber com quais entidades terceiras seus dados foram compartilhados.
- **Revogação do Consentimento e Oposição:** Revogar consentimentos anteriores ou opor-se a tratamentos baseados em legítimo interesse.
- **Revisão de Decisões Automatizadas:** Solicitar a revisão de decisões tomadas unicamente por tratamento automatizado.

### Atendimento a Solicitações:

- **E-mail:** privacidade@eletricai.com
- **Prazo de resposta:** Até 15 dias úteis (LGPD Art. 18, §1º).
- **Identificação:** Informe o e-mail da conta e, se possível, o ID do usuário (UUID). Para sua segurança, poderemos solicitar confirmação de identidade.

---

## 9. Cookies e Armazenamento Local

### 9.1 Classificação

| Tipo                         | Exemplos                                               | Finalidade                                                        | Consentimento                                    |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------ |
| **Estritamente Necessários** | Session tokens, preferências de estado local           | Manter a sessão ativa, preferências de interface e estado offline | Não exige consentimento (execução de contrato)   |
| **Funcionais**               | Tema (claro/escuro), idioma, configurações de ambiente | Personalização da experiência de uso                              | Não exige consentimento (preferência do usuário) |
| **Analytics / Performance**  | Não utilizados                                         | N/A                                                               | N/A                                              |
| **Marketing / Publicidade**  | Não utilizados                                         | N/A                                                               | N/A                                              |

### 9.2 Detalhes Técnicos

- **Supabase Auth:** Armazena tokens JWT de acesso e atualização no armazenamento local do navegador para manter a sessão do usuário.
- **Zustand Persist:** Guarda preferências de interface e configurações de tempo de execução no armazenamento local.
- **Terceiros:** Não utilizamos cookies de terceiros para rastreamento ou anúncios (como Google Analytics ou Meta Pixel).

### 9.3 Gestão pelo Usuário

Você pode limpar os dados armazenados localmente a qualquer momento através das configurações do seu navegador ou ao realizar o logout na plataforma.

---

## 10. Dados de Menores de Idade

A plataforma é destinada exclusivamente a profissionais maiores de 18 anos (B2B). O cadastro exige declaração de maioridade. Não coletamos intencionalmente dados de menores de 18 anos. Caso seja identificado o cadastro de um menor sem autorização legal, a conta será encerrada e os dados serão excluídos imediatamente.

---

## 11. Alterações nesta Política

- Notificaremos as alterações materiais com pelo menos 30 dias de antecedência por e-mail ou aviso na plataforma.
- O histórico de versões anteriores pode ser solicitado pelo e-mail de contato do DPO.
- A continuidade do uso dos serviços após a entrada em vigor das alterações implica aceite da nova versão.

---

## 12. Lei Aplicável e Foro

Esta Política é regida pelas leis da República Federativa do Brasil e, quando aplicável, pelo Regulamento Geral de Proteção de Dados da UE (GDPR).

Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias decorrentes deste documento.

---

## 13. Contato

**EletricAI Tecnologia Ltda.**

- **Encarregado de Dados (DPO):** privacidade@eletricai.com
- **Endereço:** Av. Paulista, 1000 - São Paulo/SP - CEP 01310-100
- **Website:** [https://eletricai.com](https://eletricai.com)
- **Telefone:** +55 11 0000-0000
