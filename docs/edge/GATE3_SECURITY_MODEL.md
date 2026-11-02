# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATE 3 SECURITY MODEL & OT DEFENSE-IN-DEPTH

**Normas de Referência:** IEC 62443-3-3, IEC 62443-4-2, NIST SP 800-82 Rev. 3, ISO 27001

---

## 1. PRINCÍPIOS FUNDAMENTAIS DE SEGURANÇA OT

1. **Defesa em Profundidade (Defense-in-Depth):** Múltiplas camadas de proteção redundantes entre a rede corporativa (IT), a nuvem e a rede de automação e controle (OT).
2. **Segmentação por Zonas e Conduítes (IEC 62443):**
   - **Zona 0/1:** Sensores, atuadores e entradas/saídas de processo.
   - **Zona 2:** Controladores lógicos programáveis (CLPs), IHM locais e inversores.
   - **Zona 3:** Rede de supervisão e controle local da planta. O Edge Gateway reside na borda da Zona 3.
   - **Zona DMZ Industrial:** Ponto de terminação de firewalls antes do tráfego para a nuvem.
3. **Conexões Apenas de Saída (Outbound-only):** O Gateway inicia conexões HTTPS/WSS seguras para a Cloud. Nenhuma porta de escuta aberta para a Internet pública é permitida na fábrica.

---

## 2. IDENTIDADE DA ESTAÇÃO E AUTENTICAÇÃO

- **Identidade Criptográfica Única:** Cada Gateway possui um `gatewayId` gerado aleatoriamente e um par de chaves assimétricas X.509.
- **Fingerprint de Certificado:** O hash SHA-256 da chave pública do Gateway é registrado no backend no momento do provisionamento.
- **Validação Estrita de Vínculo:** O servidor rejeita qualquer tentativa de comunicação onde o `organizationId` ou `plantId` não correspondam ao registro autenticado do Gateway. Tentativas de falsificação cruzada geram alarme crítico de segurança (`MULTI_TENANT_SECURITY_VIOLATION`).

---

## 3. PROVISIONAMENTO SEGURO (ONBOARDING)

```
[Administrador na Nuvem]
       │
       ▼ Gera token temporário (expiração em 15 min)
[Código: EGW-PROV-XXXXXXXXXXXXXXXX]
       │
       ▼ Fornecido via canal seguro ao técnico de campo
[Técnico insere na instalação do Gateway]
       │
       ▼ Gateway envia requisição de provisionamento via TLS
[Cloud valida token, consome atomicamente (burn) e emite credenciais]
       │
       ▼ Gateway recebe Identity e Token de Estação
[Token consumido é invalidado para sempre]
```

### Regras de Token:
- **Uso Único:** O código de provisionamento é queimado (burn) atomicamente na primeira requisição. Reutilizações são bloqueadas imediatamente com `TOKEN_ALREADY_USED`.
- **Expiração Rápida:** Tokens não utilizados expiram em 15 minutos.

---

## 4. ISOLAMENTO DE COMUNICAÇÃO POR PROTOCOLO

### 4.1 OPC UA
- **Rejeição de Downgrade:** SecurityPolicy `None` é terminantemente bloqueada em ambiente produtivo.
- **Criptografia e Assinatura:** Uso obrigatório de `SignAndEncrypt` com políticas `Basic256Sha256` ou `Aes128_Sha256_RsaOaep`.
- **Trust List:** Validação mútua de certificados. Certificados do servidor OPC UA não cadastrados na Trust List geram recusa de conexão (`CERTIFICATE_INVALID`).

### 4.2 Modbus TCP
- **Isolamento de Rede:** Modbus TCP opera estritamente dentro da rede OT interna. O Gateway atua como leitor e não expõe o CLP para redes externas.
- **Modbus Security:** Suporte preparado para Modbus Security na porta 802 com encapsulamento TLS.
- **Allowlist de Destinos:** O Gateway só conecta a endereços IP e Unit IDs previamente cadastrados e autorizados.

### 4.3 MQTT Sparkplug B
- **Validação de Tópicos (ACL):** O Gateway valida o `groupId` no namespace `spBv1.0/{groupId}/...`. Mensagens de grupos não autorizados são rejeitadas sumariamente.
- **Controle de Sequência:** O sequenciamento de pacotes (0 a 255) é monitorado. Quebras de sequência ativam procedimento de Rebirth para restauração segura de métricas.

---

## 5. BLOQUEIO DE CONTROLE FÍSICO (GATE 3 READ-ONLY)

- **Ausência de Comandos:** Todos os métodos de acionamento físico (partida de motores, abertura de válvulas, reset de falhas, alteração de setpoints em registradores de controle) estão omitidos da interface pública de drivers.
- **Funções de Emergência:** O E-STOP físico e os relés de segurança certificados continuam cabeados e independentes no chão de fábrica, sem qualquer bypass pelo SCADA ou pelo Gateway.
