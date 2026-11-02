# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATE 3 TEST PLAN & VERIFICATION SPECIFICATION

**Data:** 02 de Novembro de 2026  
**Padrão:** IEC 62443, ISO/IEC 25010 (Software Quality Requirements)

---

## 1. MATRIZ DE TESTES E SUÍTES AUTOMATIZADAS

A homologação do Gate 3 é validada por 4 suítes especializadas de teste unitário e de integração:

| Suíte de Teste | Arquivo no Repositório | Escopo de Verificação | Quantidade de Testes |
| :--- | :--- | :--- | :--- |
| **OPC UA Homologation** | `src/__tests__/edge-opcua-homologation.test.ts` | Endpoints, Certificados, Trust List, Browse, Read, Subscriptions, StatusCodes, Reconnect, Store-and-Forward | 10 testes |
| **Modbus TCP Homologation** | `src/__tests__/edge-modbus-homologation.test.ts` | Coils, Discrete Inputs, Holding Registers, Input Registers, Endianness (4 modos), Escala, Zero/One based | 8 testes |
| **MQTT Sparkplug B Homologation**| `src/__tests__/edge-sparkplug-homologation.test.ts`| NBIRTH, DBIRTH, NDATA, DDATA, NDEATH, Controle de Sequência (0-255), Validação de Tópicos ACL | 6 testes |
| **Integrated Gateway & Benchmarks**| `src/__tests__/edge-integrated-gateway.test.ts` | Provisionamento de token, Burn atômico, Multi-tenant boundary, Queda de WAN, Replay idempotente, Benchmarks | 5 testes |
| **TOTAL GERAL DE TESTES DO GATE 3** | | | **29 testes 100% Green** |

---

## 2. PROCEDIMENTO DE EXECUÇÃO DOS QUALITY GATES

Para reproduzir a homologação completa de forma independente:
```bash
# Executar todos os testes do Edge Gateway
bun x vitest run edge

# Executar todas as suítes SCADA
bun x vitest run scada

# Executar a suíte completa de testes do repositório (98 arquivos / 779 testes)
bun run test

# Executar verificação de tipos TypeScript sem emissão
bun run typecheck

# Executar compilação de produção Vite SSR/Client
bun run build
```
Todos os comandos devem finalizar com Exit Code 0.
