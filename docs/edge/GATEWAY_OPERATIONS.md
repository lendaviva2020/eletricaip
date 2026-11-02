# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATEWAY OPERATIONS, DIAGNOSTICS & TELEMETRY MANUAL

**Público-Alvo:** Engenheiros de Automação, Técnicos de Instrumentação e Operadores de Planta

---

## 1. INDICADORES OPERACIONAIS NO SCADA SUPERVISÓRIO

No painel de supervisão e na visão de comunicação (`communication`), o operador acompanha em tempo real:

| Indicador | Estado | Ação Operacional Recomendada |
| :--- | :--- | :--- |
| **Gateway Online** | Normal (Verde) | Comunicação íntegra com a nuvem e com os CLPs. Nenhuma ação necessária. |
| **Gateway Offline** | Crítico (Vermelho) | Perda total de conectividade com a estação. Verificar alimentação do IPC e link de rede. |
| **Gateway Degraded** | Atenção (Amarelo) | Gateway ativo, mas com um ou mais drivers industriais em falha/timeout. |
| **Buffer Near Limit** | Alarme (Laranja) | Fila de store-and-forward atingiu >80% de ocupação. Indisponibilidade de internet prolongada. |
| **Sync Pending** | Informativo (Azul) | Gateway reconectado descarregando amostras acumuladas durante a queda. |
| **Certificate Expiring**| Alerta Preventivo | Certificado da estação próximo da data limite (renovação necessária em 30 dias). |

---

## 2. PROCEDIMENTOS DE DIAGNÓSTICO EM CAMPO

### 2.1 Verificação de Logs do Serviço Linux:
```bash
# Visualizar logs em tempo real do Gateway
journalctl -u eletricai-gateway.service -f -n 100

# Filtrar erros críticos de drivers
journalctl -u eletricai-gateway.service -p err..emerg
```

### 2.2 Teste de Conectividade de Borda com Ferramentas Nativas:
```bash
# Testar resolução e porta do endpoint OPC UA
nc -zv 192.168.10.50 4840

# Testar porta Modbus TCP
nc -zv 192.168.10.120 502

# Testar saída segura para a Cloud
curl -Iv https://api.eletricai.com/health
```

---

## 3. PROCEDIMENTO DE REINICIALIZAÇÃO E SHUTDOWN SEGURO

```bash
# Parada segura do serviço (realiza flush ordenado de transações em disco)
sudo systemctl stop eletricai-gateway.service

# Reinício do serviço
sudo systemctl restart eletricai-gateway.service
```
O encerramento do daemon fecha os descritores de arquivo do SQLite com commit limpo e encerra sessões OPC UA e MQTT enviando pacotes de encerramento normal, evitando conexões zumbis nos controladores.
