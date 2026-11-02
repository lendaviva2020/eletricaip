# SCADA SUPERVISÓRIO — Modelo de Dados Unificado (Schema v3)

**Documento:** Integração com o Modelo Canônico de Engenharia  
**Arquivo Fonte:** `src/lib/model/unified-schema.ts` e `src/lib/scada/types.ts`

---

## 1. Relacionamento Entidade-Objeto

O SCADA não cria entidades duplicadas; ele vincula widgets visuais e telemetria diretamente às entidades canônicas do projeto:

```
+-----------------------------------------------------------+
|                    CanonicalEquipment                     |
| id: string (UUID)                                         |
| tag: string ("ETE.P01")                                   |
| name: string ("Bomba Centrífuga P-01")                    |
| category: "drive" / "PUMP"                                |
| ratings: { voltageV: 380, powerKw: 37, currentA: 68.4 }   |
+-----------------------------+-----------------------------+
                              |
       +----------------------+----------------------+
       | 1..n                                        | 1..n
+------v--------------------+                 +------v--------------------+
|       CanonicalTag        |                 |     ScadaWidgetLayout     |
| id: string (UUID)         |                 | id: string (UUID)         |
| name: "ETE.P01.FLOW"      |                 | boundEquipmentId: "P-01"  |
| dataType: "REAL"          |                 | boundTagId: "tag-p01-flow"|
| unit: "m³/h"              |                 | position: { x, y }        |
| linkedEquipmentId: "P-01" |                 | category: "mech"          |
+---------------------------+                 +---------------------------+
```

---

## 2. Tipos de Dados Suportados

Em conformidade com a IEC 61131-3:
- `BOOL`: Estados binários (ligado/desligado, aberto/fechado, alarme ativo).
- `INT`: Contadores e posições inteiras (16 bits sinalizado).
- `REAL`: Ponto flutuante IEEE 754 de precisão simples para grandezas físicas (vazão, nível, pressão, temperatura).
- `STRING`: Mensagens textuais e diagnósticos.
- `TIME`: Durações e tempos de temporizadores.
