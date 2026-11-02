# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## PROTOCOL SPECIFICATION: MODBUS TCP READ-ONLY ADAPTER

**Norma de Referência:** Modbus Application Protocol Specification V1.1b3  
**Módulo Responsável:** `src/lib/edge/drivers/modbus-driver.ts`  
**Suíte de Homologação:** `src/__tests__/edge-modbus-homologation.test.ts`

---

## 1. ESCOPO E CAPACIDADES

O driver Modbus TCP do ElétricAi Edge Gateway atua como um **Modbus Client / Master Read-Only** de alto desempenho para consulta de multimedidores de grandezas elétricas, inversores de frequência, relés de proteção de média tensão e remotas de I/O de chão de fábrica.

### Function Codes Homologados:
- **FC 01 (0x01) — Read Coils:** Leitura de saídas digitais em formato Booleano (1 bit).
- **FC 02 (0x02) — Read Discrete Inputs:** Leitura de entradas digitais em formato Booleano (1 bit).
- **FC 03 (0x03) — Read Holding Registers:** Leitura de registradores de 16 bits de retenção.
- **FC 04 (0x04) — Read Input Registers:** Leitura de registradores de 16 bits de entrada analógica.

### Bloqueio Rígido de Escrita:
Function Codes de escrita física (FC 05, FC 06, FC 15, FC 16) estão estritamente omitidos do driver.

---

## 2. FORMATOS DE DADOS E ENDIANNESS

Dispositivos industriais utilizam diferentes organizações de bytes e palavras para representar números de 32 bits (inteiros ou ponto flutuante IEEE 754). O driver suporta formalmente as 4 convenções:

| Identificador | Convenção de Bytes | Ordem de Palavras | Dispositivos Típicos |
| :--- | :--- | :--- | :--- |
| `BIG_ENDIAN` | ABCD | Big-Endian / Big-Endian | Schneider Electric, Siemens, ABB |
| `LITTLE_ENDIAN` | DCBA | Little-Endian / Little-Endian | Automações legadas baseadas em x86 |
| `WORD_SWAPPED` | CDAB | Mid-Big (Word-Swapped) | Multimedidores Kron, Honeywell, Yokogawa |
| `BYTE_SWAPPED` | BADC | Mid-Little (Byte-Swapped) | Controladores específicos |

---

## 3. MAPEAMENTO DE ENDEREÇAMENTO

O driver aceita tanto a convenção **Zero-based** (0 a 65535) quanto **One-based** (1 a 65536):
- Se `isZeroBased: true`: O endereço de rede enviado no pacote PDU é exatamente o endereço informado.
- Se `isZeroBased: false`: O endereço de rede enviado é `address - 1`.

### Fator de Escala de Engenharia:
$$EU = \text{RawValue} \times \text{scaleMultiplier} + \text{scaleOffset}$$
Permite converter diretamente leituras de registradores brutos (ex.: 284 para $28,4^\circ\text{C}$ com multiplicador 0.1).
