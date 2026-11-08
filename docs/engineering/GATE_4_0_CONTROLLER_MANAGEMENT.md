# GATE 4.0 — CONTROLLER FLEET MANAGEMENT, DIGITAL TWIN & X.509 CERTIFICATES
## GESTÃO CENTRALIZADA DE CONTROLADORES, SINCRONISMO DE GÊMEO DIGITAL E SEGURANÇA CRIPTOGRÁFICA

### 1. OBJETIVO E VISÃO GERAL

O subsistema de gestão de frota do ElétricAi Industrial OS implementa capacidades empresariais análogas ao **CODESYS Automation Server**:
- Monitoramento contínuo do parque de controladores e estações remotas de automação.
- Sincronização e rastreamento de desvio de versão (**Version Drift**) entre o modelo canônico do projeto e o runtime dos PLCs em campo.
- Gestão do ciclo de vida de certificados de segurança digital **X.509** para sessões seguras OPC UA e TLS.
- Controle de acesso granular baseado em papéis (**RBAC - Role-Based Access Control**).

---

### 2. SINCRONISMO DE GÊMEO DIGITAL (DIGITAL TWIN) E DETECÇÃO DE DRIFT

Cada controlador físico ou virtual possui uma réplica de dados (*Digital Twin*):
- O hash criptográfico SHA-256 do bytecode IR compilado no Studio é comparado ao hash do programa ativo no runtime do controlador.
- Se os hashes divergirem, o controlador é sinalizado com o estado `DRIFT_DETECTED`, alertando o engenheiro de que o código em execução no chão de fábrica difere do repositório versionado.

---

### 3. CONTROLE DE ACESSO BASEADO EM PAPÉIS (RBAC)

| Papel | Permissões Concedidas |
|---|---|
| `ADMIN` | Acesso Irrestrito: Visualização SCADA, Reconhecimento de Alarmes, Gestão de Receitas, Modificação de Lógica, Compilação, Forçamento de Variáveis, Download, Gestão de Certificados e Gestão de Usuários |
| `ENGINEER` | Engenharia Plena: Todas as permissões técnicas (edição, compilação, download e forçamento), exceto criação de usuários administradores |
| `OPERATOR` | Operação de Linha: Visualização de sinóticos SCADA, reconhecimento de alarmes e aplicação de receitas homologadas |
| `VIEWER` | Somente Leitura: Visualização passiva de painéis e telas sem capacidade de comando |

---

### 4. GESTÃO DE CERTIFICADOS DIGITAIS X.509

O `IndustrialCertificateManager`:
- Centraliza os certificados dos controladores para comunicação criptografada OPC UA (Basic256Sha256, Aes128_Sha256_RsaOaep) e HTTPS.
- Realiza verificação diária automática de datas de validade (`validFrom`, `validTo`).
- Emite avisos preventivos de expiração com antecedência de 30 dias (`EXPIRING_SOON`) para evitar interrupções operacionais por recusa de handshake TLS.
