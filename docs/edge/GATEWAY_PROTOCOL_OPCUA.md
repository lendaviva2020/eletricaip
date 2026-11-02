# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## PROTOCOL SPECIFICATION: OPC UA READ-ONLY ADAPTER

**Norma de Referência:** OPC UA (IEC 62541), Partes 2, 4, 5 e 8  
**Módulo Responsável:** `src/lib/edge/drivers/opcua-driver.ts`  
**Suíte de Homologação:** `src/__tests__/edge-opcua-homologation.test.ts`

---

## 1. ESCOPO E CAPACIDADES

O driver OPC UA do ElétricAi Edge Gateway atua como um **OPC UA Client Read-Only** capaz de conectar-se a servidores OPC UA integrados em CLPs (Siemens S7-1500, Rockwell ControlLogix com FactoryTalk, Beckhoff TwinCAT, Schneider M580 e servidores de dados industriais como Kepware KEPServerEX).

### Matriz de Capacidades
- **Read (Leitura Síncrona / Sob Demanda):** Homologada.
- **Subscriptions & Monitored Items (Publicação por Exceção):** Homologada.
- **Browse de Nós (Address Space Navigation):** Homologada.
- **Write (Escrita Física em Nós):** Bloqueada intencionalmente no Gate 3.

---

## 2. PARÂMETROS DE CONFIGURAÇÃO

| Parâmetro | Descrição | Exemplo |
| :--- | :--- | :--- |
| `endpointUrl` | URL do endpoint OPC UA | `opc.tcp://192.168.10.50:4840/server` |
| `securityPolicy` | Política de criptografia | `Basic256Sha256`, `Aes128_Sha256_RsaOaep` |
| `securityMode` | Modo de segurança de mensagens | `SignAndEncrypt` |
| `clientCertificatePem` | Certificado X.509 da aplicação cliente | Chave pública em formato PEM |
| `trustedServerCertificates`| Lista de fingerprints confiáveis | `["A1B2C3...F0"]` |
| `publishingIntervalMs` | Intervalo de publicação de assinaturas | `1000` (1 segundo) |
| `samplingIntervalMs` | Intervalo de amostragem interna do CLP | `250` (250 ms) |

---

## 3. MAPEAMENTO DE STATUSCODES OPC UA

O driver converte os códigos de status de 32 bits da especificação OPC UA para os estados de qualidade canônicos do ElétricAi:

| Faixa de StatusCode | Severidade OPC UA | Qualidade Canônica ElétricAi | Comportamento no SCADA |
| :--- | :--- | :--- | :--- |
| `0x00000000 - 0x3FFFFFFF` | **Good** | `GOOD` | Valor válido, telemetria normal, alimenta Historian. |
| `0x40000000 - 0x7FFFFFFF` | **Uncertain** | `UNCERTAIN` | Alerta de precisão degradada ou sensor não calibrado. |
| `0x80000000 - 0xFFFFFFFF` | **Bad** | `BAD` | Sensor com falha, comunicação perdida; alarme disparado. |

---

## 4. CICLO DE VIDA DE SUBSCRIPTIONS

1. O Gateway estabelece a sessão segura (`CreateSession` e `ActivateSession`).
2. Cria uma subscription com `PublishingInterval` negociado.
3. Adiciona os monitored items especificados pelo usuário com filtro `DataChangeFilter`.
4. O servidor envia notificações apenas quando o valor muda ou o ciclo expira.
5. Em caso de perda momentânea de conexão TCP, o driver armazena a última sequência, reconecta automaticamente e restabelece a subscrição sem intervenção humana.
