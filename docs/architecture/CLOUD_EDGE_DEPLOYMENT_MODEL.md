# ELÉTRICAI INDUSTRIAL OS — MODELO DE IMPLANTAÇÃO INDUSTRIAL
## ESPECIFICAÇÃO DE TOPOLOGIA, HARDWARE, SISTEMA OPERACIONAL E IMPLANTAÇÃO (GATE 3.4)

**Documento:** `docs/architecture/CLOUD_EDGE_DEPLOYMENT_MODEL.md`  
**Versão:** `1.0.0` (Gate 3.4)  
**Classificação:** `APPROVED_FOR_CLOUD_EDGE_ARCHITECTURE_INTEGRATION`  
**Normas de Referência:** IEC 61000-6-2/4 (EMC), IEC 60068 (Temperatura/Vibração), DIN EN 60715 (Trilho DIN)

---

## 1. VISÃO GERAL DE IMPLANTAÇÃO

O **ElétricAi Edge Gateway** foi projetado para atuar como um *appliance* industrial autônomo, capaz de operar ininterruptamente 24/7/365 em ambientes agressivos de subestações, centros de controle de motores (CCM) e salas de painéis de chão de fábrica.

A implantação suporta dois modelos de infraestrutura:
1. **Edge Appliance Dedicado (Recomendado):** Computador industrial (IPC) montado em trilho DIN, alimentado em 24Vdc redundante, com interfaces de rede físicas segregadas (*Dual-NIC*).
2. **Máquina Virtual / Container Local (Ambiente de Planta Conectada):** Instância Linux rodando em cluster hypervisor local (KVM, Proxmox, VMware ESXi ou Docker) na DMZ industrial.

---

## 2. ESPECIFICAÇÃO DE HARDWARE E PLATAFORMAS SUPORTADAS

### 2.1. Matriz de Compatibilidade de Arquiteturas

| Arquitetura | Plataformas de Referência Homologadas | Requisitos Mínimos | Requisitos Recomendados |
|---|---|---|---|
| **Linux x86_64** | Advantech UNO, Beckhoff CX, Siemens Microbox IPC, Dell Edge Gateway 3000/5000, Phoenix Contact EPC | 2 Cores x86_64, 2 GB RAM, 16 GB SSD/eMMC | 4 Cores, 4 GB RAM, 64 GB NVMe SSD Industrial |
| **Linux ARM64** | Kunbus Revolution Pi (RevPi Connect), Raspberry Pi CM4 Industrial, Toradex Colibri/Verdin | 2 Cores Cortex-A53/A72, 2 GB LPDDR4, 16 GB eMMC | 4 Cores Cortex-A72, 4 GB RAM, 32 GB eMMC pSLC |

### 2.2. Requisitos de Ambiente Físico e Instalação em Painel

- **Alimentação Elétrica:** 24 Vdc (18 a 32 Vdc) com fonte ininterrupta (UPS/Nobreak 24Vdc para automação).
- **Montagem Mecânica:** Trilho DIN padrão (DIN EN 60715, 35 mm).
- **Temperatura de Operação:** -20 °C a +60 °C (sem ventilação forçada / *fanless*).
- **Grau de Proteção:** IP30 / IP40 para instalação abrigada em cubículo elétrico ou QGBT.
- **Isolamento Galvânico:** Portas seriais e interfaces Ethernet com isolamento mínimo de 1.5 kV.

---

## 3. TOPOLOGIA DE REDE INDUSTRIAL E DUAL-NIC HARDENING

A integridade do isolamento entre a rede corporativa/internet e os controladores industriais é garantida fisicamente pela configuração **Dual-NIC**:

```
+---------------------------------------------------------------------------------+
|                                 ELÉTRICAI CLOUD                                 |
|                        https://app.eletricai.com (TCP 443)                      |
+---------------------------------------------------------------------------------+
                                         ▲
                                         │ Conexão Outbound mTLS (TLS 1.3)
                                         │ TCP 443 (Somente Saída)
                                         ▼
+---------------------------------------------------------------------------------+
| REDE TI / DMZ INDUSTRIAL (Sub-rede 10.10.20.0/24 - Acesso à Internet)           |
+---------------------------------------------------------------------------------+
                                         │ eth1 (10.10.20.45)
                                         ▼
+---------------------------------------------------------------------------------+
|                   ELÉTRICAI EDGE GATEWAY (IPC DIN RAIL)                        |
|                                                                                 |
|   eth1 (IT Interface): DHCP / IP Estático com Default Gateway para Nuvem        |
|   eth0 (OT Interface): IP Estático (ex: 192.168.1.10/24), SEM Default Gateway    |
|                                                                                 |
|   [Kernel Hardening]                                                            |
|   - sysctl net.ipv4.ip_forward = 0 (Roteamento entre interfaces DESABILITADO)    |
|   - sysctl net.ipv4.conf.all.rp_filter = 1 (Anti-spoofing ativo)                |
|   - Firewall local: DROP de qualquer tráfego INBOUND não solicitado             |
+---------------------------------------------------------------------------------+
                                         ▲
                                         │ eth0 (192.168.1.10)
+---------------------------------------------------------------------------------+
| REDE TO / CHÃO DE FÁBRICA (Sub-rede 192.168.1.0/24 - Totalmente Isolada)        |
+---------------------------------------------------------------------------------+
          │                                  │                         │
          ▼                                  ▼                         ▼
   +---------------+                  +---------------+         +---------------+
   | Siemens S7    |                  | Multimedidor  |         | Inversor WEG  |
   | 192.168.1.20  |                  | 192.168.1.30  |         | 192.168.1.40  |
   | (OPC UA:4840) |                  | (Modbus:502)  |         | (Modbus:502)  |
   +---------------+                  +---------------+         +---------------+
```

---

## 4. PROCEDIMENTO DE INSTALAÇÃO E ATIVAÇÃO EM CAMPO

### 4.1. Passo a Passo de Comissionamento

1. **Fixação Mecânica e Conexão:** Instalar o IPC no trilho DIN do painel de automação. Conectar `eth0` ao switch de automação e `eth1` ao switch de rede corporativa/DMZ com saída para a internet.
2. **Geração do Token de Provisionamento:** No console do ElétricAi Cloud, acessar `Configurações > Gateways > Novo Gateway`. Informar a Organização e a Planta. O sistema gera um token de uso único com validade de 15 minutos.
3. **Execução do Instalador:** No terminal local do IPC (ou via SSH local temporário em console de serviço), executar:
   ```bash
   sudo eletricai-edge provision --token "tok_prov_eletricai_sec_994adfcb"
   ```
4. **Validação Automática:**
   - O daemon gera o par de chaves local e submete a CSR.
   - A Cloud queima o token e emite o certificado x509.
   - O daemon cria o serviço systemd e inicia a sincronização.
5. **Verificação Operacional:**
   ```bash
   sudo systemctl status eletricai-edge
   ```
   No SCADA Web, o indicador do gateway transita de `PROVISIONING` para `ONLINE` com o selo verde de telemetria ativa.

---

## 5. ALTA DISPONIBILIDADE, WATCHDOG E BUFFER OFFLINE

### 5.1. Unidade de Serviço do Systemd (`/etc/systemd/system/eletricai-edge.service`)

```ini
[Unit]
Description=EletricAi Edge Industrial Gateway Daemon
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=eletricai-edge
Group=eletricai-edge
WorkingDirectory=/opt/eletricai/edge
ExecStart=/opt/eletricai/edge/bin/eletricai-edge-daemon --config /etc/eletricai/edge.config.json
Restart=always
RestartSec=5s
LimitNOFILE=65536
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/eletricai/outbox.db /var/log/eletricai

[Install]
WantedBy=multi-user.target
```

### 5.2. Dimensionamento da Memória e Buffer SQLite WAL

- **Tamanho do Buffer Offline:** Configurado por padrão para até **10.000.000 de amostras**, garantindo retenção contínua de telemetria por mais de **72 horas** em caso de queda completa do link de internet da fábrica.
- **Política de Sobrecarga:** Caso o armazenamento local atinja 95% da quota configurada, a política `DROP_OLDEST_NON_CRITICAL` preserva alarmes, eventos de proteção e variáveis críticas, descartando apenas amostras de tendência analógica de alta frequência, com sinalização de degradação imediata (`isDegraded: true`).
