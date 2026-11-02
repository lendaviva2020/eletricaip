# SCADA SUPERVISÓRIO — Motor de Alarmes ISA-18.2

**Documento:** Gestão de Alarmes Industriais  
**Norma:** ANSI/ISA-18.2-2016 (Management of Alarm Systems for the Process Industries)

---

## 1. Classificação de Severidade

Os alarmes do SCADA seguem rigorosamente a matriz de criticidade da ISA-18.2:

| Nível | Prioridade | Cor Indicativa | Descrição e Ação Requerida |
|---|---|---|---|
| P1 | **CRITICAL** | Vermelho (#EF4444) Pulsante | Risco iminente à segurança humana, integridade de equipamentos ou conformidade ambiental. Ação imediata exigida. |
| P2 | **HIGH** | Âmbar (#F59E0B) | Desvio significativo de processo que pode levar a parada não programada se não corrigido em minutos. |
| P3 | **MEDIUM** | Laranja (#FB923C) | Condição anormal de operação (ex: nível de tanque elevado mas contido). |
| P4 | **LOW** | Azul (#3B82F6) | Aviso informativo de desvio leve ou necessidade de calibração. |

---

## 2. Ciclo de Vida do Alarme

O ciclo de vida dos alarmes no SCADA obedece à máquina de estados finita da ISA-18.2:

```
          [ Normal ]
              |
              | Condição anormal detectada
              v
     [ NÃO RECONHECIDO (UNACK) ] <------+
              |                         |
              | Operador reconhece      | Volta a ocorrer
              v                         |
      [ RECONHECIDO (ACK) ]             |
              |                         |
              | Variável volta ao normal|
              v                         |
       [ NORMALIZADO / LIMPO ] ---------+
```

---

## 3. Filosofia de Racionalização de Alarmes

Para prevenir o fenômeno de **Alarm Flooding** (inundação de alarmes em situações de contingência):
- Alarmes possuem banda morta (deadband) para impedir chattering em torno do setpoint.
- O acionamento de Parada de Emergência agrupa alarmes secundários causados pela perda de fluxo para não sobrecarregar a atenção do operador.
- Função de **Reconhecimento em Lote (Ack All)** disponível apenas para operadores com credenciais válidas.
