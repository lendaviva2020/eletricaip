# ElétricAi Runtime — guia de instalação e segurança

O ElétricAi Runtime executa, num PC, Raspberry Pi ou gateway Linux, o MESMO
programa dos editores (Ladder + FB Electric Studio), lê e escreve o campo por
Modbus TCP e serve a IHM local (WebVisu) na rede interna.

```
Editor CLP → aba Runtime ──(pacote aprovado, SHA-256)──► Gateway: ElétricAi Runtime
  mapa de E/S + Ladder + FB Studio + tela HMI            ├─ varredura (motores dos editores)
                                                          ├─ imagem de processo
                                                          ├─ Modbus TCP (leitura/escrita)
                                                          └─ WebVisu local (PIN)
Gateway ──(estado, eventos, telemetria por exceção)──► Nuvem (SCADA, histórico, auditoria)
```

## Fluxo

1. **Editor CLP → Runtime**: cadastre as conexões (IP do módulo de E/S Modbus TCP ou
   bancada virtual), mapeie cada tag do programa para um endereço de campo e
   escolha a **emergência do campo** (entrada NF, 1 = íntegra).
2. **Gerar pacote** → **Publicar**. O servidor revalida e recalcula o hash.
3. **Aprovar** (owner/admin/engenheiro; fica na trilha de auditoria).
4. **Gateway**: cadastre o gateway (o token aparece uma vez), escolha o pacote
   aprovado a implantar.
5. No gateway, com Node.js 20+:

```bash
bun run build:runtime            # gera dist-runtime/eletricai-runtime.mjs
ELETRICAI_CLOUD_URL=https://<seu app> \
ELETRICAI_DEVICE_TOKEN=<token do gateway> \
ELETRICAI_LOCAL_PIN=<PIN com 6+ caracteres> \
node dist-runtime/eletricai-runtime.mjs
```

Variáveis opcionais: `ELETRICAI_WEBVISU_HOST` (padrão `0.0.0.0`),
`ELETRICAI_WEBVISU_PORT` (8080), `ELETRICAI_TLS_CERT`/`ELETRICAI_TLS_KEY` (HTTPS
local), `ELETRICAI_STATE_DIR` (cache do pacote aprovado para reiniciar sem
internet). Sem nuvem: `ELETRICAI_PACKAGE_FILE` + `ELETRICAI_PACKAGE_HASH`
(pacote baixado no editor) — roda só em SOMBRA, porque a aprovação não pode ser
conferida. Binários sem Node: `bun run build:runtime:compile:linux-arm64` (Raspberry
Pi 64 bits) ou `:linux-x64`.

6. Abra `http://<ip do gateway>:8080`, entre com o PIN, confira "Por que não está
   escrevendo" e **Armar** (pede o PIN de novo).

## Modos

| Modo | O que faz |
| --- | --- |
| **SOMBRA** | Lê o campo e executa a lógica; **não escreve nada**. Sempre o modo inicial. |
| **EM OPERAÇÃO** | Armado localmente: escreve as saídas habilitadas. |
| **SEGURO** | Houve falha em operação: escreve o **valor seguro** de todas as saídas e espera novo arme local. Nunca religa sozinho. |

## Condições para escrever no campo (todas)

- pacote **aprovado** na nuvem e hash conferido no gateway;
- **arme local** no WebVisu com PIN (a nuvem não arma; só pode PARAR);
- emergência do campo mapeada e **íntegra**;
- todas as entradas com leitura recente (comunicação ok);
- varredura dentro do orçamento (watchdog: 2 × ciclo, mínimo 250 ms);
- a saída tem **Escreve** marcado, **valor seguro** e o valor está nos limites.

Qualquer falha em operação → SEGURO. Pacote novo só carrega fora de operação
(como o download de um CLP exige STOP). Encerrar o processo (SIGTERM) escreve os
valores seguros antes de sair.

## Limites (leia antes de ligar em campo)

- **Um botão de software não substitui o circuito físico de emergência**
  (NR-10, NR-12, ISO 13849-1, IEC 60204-1). A emergência mapeada é uma camada a
  mais, nunca a única.
- Configure o **watchdog de comunicação do próprio módulo de E/S** (desligar
  saídas sem mestre por X ms): se o gateway travar ou cair a rede, só o módulo
  consegue desligar as saídas.
- O Runtime não é um CLP de segurança (SIL/PL). Funções de segurança ficam em
  relé/CLP de segurança certificado.
- Drivers desta versão: Modbus TCP e bancada virtual. OPC UA, MQTT, Modbus RTU e
  GPIO ainda não escrevem pelo Runtime.
- A validação em campo e a liberação para operação são do engenheiro responsável.
