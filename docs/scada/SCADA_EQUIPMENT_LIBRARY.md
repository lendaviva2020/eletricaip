# SCADA SUPERVISÓRIO — Biblioteca e Inventário de Equipamentos

**Documento:** Especificação Técnica de Equipamentos Canônicos  
**Instalação de Referência:** ETE - Estação de Tratamento de Efluentes  
**Padrões:** IEC 60617 (Símbolos Gráficos), IEC 61131-3, NBR 5410

---

## 1. Equipamentos Principais Integrados

O inventário do SCADA unifica equipamentos elétricos, mecânicos e de instrumentação, compartilhando dados com o Unifilar, Multifilar, Ladder e Digital Twin:

### 1.1. Subestação & Distribuição de Energia
- **TR-01 (Transformador Principal)**:
  - Potência: 750 kVA
  - Tensão Primária / Secundária: 13,8 kV / 380 V (60 Hz)
  - Esquema de Aterramento: TN-S
  - Temperatura Operacional: 58,4 °C
  - Telemetria vinculada: `ETE.TR01.V_SEC`, `ETE.TR01.TEMP`, `ETE.TR01.PWR`

- **QM-01 (Quadro Geral de Baixa Tensão - QGBT)**:
  - Tensão de Barramento: 380 V trifásico
  - Corrente de Carga: 480,2 A
  - Potência Ativa Total: 248,5 kW
  - Fator de Potência: 0,94
  - Disjuntor Geral: Caixa Moldada 630A com relé eletrônico

### 1.2. Automação e Controle
- **PLC-01 (Controlador Lógico Programável)**:
  - CPU: Siemens SIMATIC S7-1500 (CPU 1515-2 PN)
  - Cartões de E/S: DI 16x24VDC, DO 16x24VDC, AI 8xU/I, AO 4xU/I
  - Ciclo de Varredura (Scan Cycle): 100 ms
  - Status: RUN (Supervisão contínua com LED heartbeat ativo)

### 1.3. Hidromecânica & Processo
- **T-101 (Tanque de Sedimentação Primária)**:
  - Capacidade: 350 m³
  - Nível Nominal de Operação: 75,2 %
  - Instrumentação: Transmissor de nível ultrassônico LT-01

- **P-01 (Bomba Centrífuga de Recalque 01)**:
  - Motor: M-01 (37 kW / 50 CV, 380 V, 68,4 A, 1760 RPM)
  - Vazão Operacional: 92,4 m³/h
  - Pressão de Descarga: 3,8 bar
  - Status: RUNNING (Indicador verde com animação de rotação de rotor)

- **T-102 (Tanque de Aeração / Tratamento Biológico)**:
  - Capacidade: 500 m³
  - Nível Nominal de Operação: 62,0 %
  - Oxigênio Dissolvido (OD): 2,4 mg/L
  - Instrumentação: Transmissor de nível LT-02 e sensor ótico de OD

- **P-02 (Bomba Centrífuga de Recalque 02)**:
  - Motor: M-02 (37 kW / 50 CV, 380 V, 67,1 A, 1755 RPM)
  - Vazão Operacional: 90,3 m³/h
  - Pressão de Descarga: 3,7 bar
  - Status: RUNNING

- **F-01 (Filtro Multimídia de Leito Profundo)**:
  - Meio Filtrante: Antracito, areia graduada e pedregulho
  - Pressão de Entrada (PT-01): 2,4 bar
  - Pressão Diferencial (DP): 0,95 bar
  - Ciclo: Retrolavagem automática programada a cada 24h ou por diferencial de pressão

- **T-105 (Tanque de Despejo Tratado / Efluente Final)**:
  - Capacidade: 200 m³
  - Nível Operacional: 81,0 %
  - Qualidade: pH 7,2 • Turbidez 1,8 NTU
  - Instrumentação: Transmissor de nível LT-05, analisador multiparâmetro

### 1.4. Válvulas e Atuadores
- **V-01 a V-08**: Válvulas borboleta com atuador pneumático e retorno por mola (sinal 24VDC), monitoradas com sensor de fim de curso aberto/fechado.
