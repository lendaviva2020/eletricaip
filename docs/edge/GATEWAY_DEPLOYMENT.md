# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATEWAY DEPLOYMENT & HOST HARDENING GUIDE

**Sistemas Operacionais:** Linux x86_64 / Linux ARM64 (Debian 12, Ubuntu 22.04 LTS, Yocto)  
**Ambiente de Execução:** Standalone Daemon / systemd Service / Docker Container

---

## 1. REQUISITOS DE HARDWARE E SISTEMA

| Componente | Requisito Mínimo (Lab / 100 TAGs) | Requisito Recomendado (Planta / 1.000 TAGs) |
| :--- | :--- | :--- |
| **Arquitetura** | x86_64 ou ARM64 | x86_64 ou ARM64 (Industrial PC com dissipação passiva) |
| **CPU** | 2 núcleos (1.5 GHz) | 4 núcleos (2.0 GHz ou superior) |
| **Memória RAM** | 2 GB DDR4 | 4 GB a 8 GB DDR4 com ECC |
| **Armazenamento** | 16 GB SSD/eMMC | 32 GB a 64 GB NVMe/eMMC industrial |
| **Interfaces de Rede** | 2 portas Ethernet RJ45 (IT / OT) | 2 ou mais portas gigabit isoladas galvanicamente |
| **Alimentação** | 12-24 VDC industrial | Redundante 24 VDC com no-break (UPS) |

---

## 2. TOPOLOGIA DE REDE (DUAL-HOMED INTERFACES)

O Gateway deve operar com duas interfaces de rede físicas separadas:
- **Interface `eth0` (Rede OT):** Conectada ao switch industrial dos CLPs (ex.: `192.168.10.x`). Sem gateway padrão de Internet.
- **Interface `eth1` (Rede Corporativa / DMZ):** Conectada ao firewall corporativo com saída HTTPS restrita para os domínios do ElétricAi Cloud. Roteamento IP entre as interfaces deve ser desabilitado no kernel Linux (`net.ipv4.ip_forward = 0`).

---

## 3. INSTALAÇÃO COMO SERVIÇO SYSTEMD

### Arquivo da Unidade: `/etc/systemd/system/eletricai-gateway.service`
```ini
[Unit]
Description=EletricAi Master Edge Gateway Industrial Daemon
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=eletricai
Group=eletricai
WorkingDirectory=/opt/eletricai/edge
ExecStart=/usr/bin/node /opt/eletricai/edge/dist/gateway-daemon.js
Restart=always
RestartSec=5s
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SyslogIdentifier=eletricai-edge

# Hardening do Host
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### Comandos de Ativação:
```bash
sudo systemctl daemon-reload
sudo systemctl enable eletricai-gateway.service
sudo systemctl start eletricai-gateway.service
sudo systemctl status eletricai-gateway.service
```

---

## 4. INSTALAÇÃO VIA CONTAINER DOCKER

### Dockerfile Industrial de Borda:
```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tzdata ca-certificates
ENV NODE_ENV=production
COPY package.json bun.lockb ./
COPY dist ./dist
VOLUME ["/app/data"]
USER node
CMD ["node", "dist/gateway-daemon.js"]
```

### Docker Compose:
```yaml
version: "3.8"
services:
  eletricai-gateway:
    image: eletricai/edge-gateway:3.0.0
    restart: always
    network_mode: "host"
    volumes:
      - /etc/eletricai:/etc/eletricai:ro
      - /var/lib/eletricai/buffer:/app/data
    environment:
      - GATEWAY_CONFIG=/etc/eletricai/gateway.json
      - BUFFER_PATH=/app/data/outbox.db
```
