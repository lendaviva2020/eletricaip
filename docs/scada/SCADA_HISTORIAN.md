# SCADA SUPERVISÓRIO — Historiador de Processo e Tendências

**Documento:** Arquitetura do Historiador e Motor de Tendências Multi-Pen  
**Padrão:** ISA-101 / IEC 61131-3

---

## 1. Topologia do Historiador

O historiador industrial integrado ao SCADA combina armazenamento efêmero em alta frequência para gráficos de tela com persistência analítica para relatórios:

1. **Ring Buffer em Memória (Live Buffer)**:
   - Mantém os últimos 120 ciclos de amostragem em memória volátil.
   - Fornece dados instantâneos para os gráficos Recharts com tempo de renderização inferior a 16 ms (60 FPS).
2. **Compressão e Deadband**:
   - Descarta variações menores que 0,05% da escala para otimização de tráfego e renderização fluida.
3. **Agregação Estatística On-the-fly**:
   - Calcula em tempo real para a janela selecionada:
     - Valor Mínimo ($V_{min}$)
     - Valor Máximo ($V_{max}$)
     - Média Aritmética ($\bar{V}$)
     - Desvio Padrão ($\sigma$)

---

## 2. Exportação de Amostras

O operador pode exportar a qualquer momento a série temporal bruta ou consolidada em formato CSV:
- Formato UTF-8 com separador de vírgula.
- Cabeçalhos padronizados com nome da tag e unidade de engenharia.
- Compatibilidade nativa com Excel, PowerBI, MATLAB e Python/Pandas.
