# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATEWAY PROVISIONING & ONBOARDING WORKFLOW

**Padrão:** IEC 62443-4-2 (Identification & Authentication)  
**Módulo Responsável:** `src/lib/edge/provisioning.ts`

---

## 1. FLUXO PASSO A PASSO DE PROVISIONAMENTO

### Passo 1: Emissão do Token de Provisionamento no ElétricAi Cloud
O administrador de automação ou engenheiro responsável acessa a plataforma ElétricAi Cloud na seção **Configurações > Gateways & Conectividade** e clica em **Novo Gateway**:
1. Seleciona a **Organização** e a **Planta Industrial**.
2. Define o identificador da **Estação** (ex.: `station_ete_rack_01`).
3. O sistema gera um código alfanumérico seguro com formato:
   `EGW-PROV-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
4. O token possui validade padrão de 15 minutos e status inicial `isConsumed = false`.

### Passo 2: Execução do Assistente de Inicialização no Edge Gateway
No hardware industrial on-premise (via linha de comando CLI ou script de bootstrap):
```bash
eletricai-edge-gateway provision --token EGW-PROV-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
O Gateway coleta dados do hardware local (Station Hardware ID, arquitetura da CPU, interfaces de rede) e gera um par de chaves criptográficas X.509 ou calcula o fingerprint SHA-256 da chave pública.

### Passo 3: Envio da Requisição de Provisionamento
O Gateway dispara uma requisição POST HTTPS/TLS para o endpoint da Cloud:
```json
{
  "provisioningToken": "EGW-PROV-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "gatewayVersion": "3.0.0-industrial",
  "stationHardwareId": "ADV-UNO-2271G-001",
  "certificateFingerprint": "B4F1A2...89C0"
}
```

### Passo 4: Validação Atômica no Backend
O serviço `EdgeProvisioningService` executa as validações:
1. Verifica se o token existe no banco. Se não existir: `INVALID_TOKEN`.
2. Verifica se já foi utilizado. Se `isConsumed === true`: `TOKEN_ALREADY_USED`.
3. Verifica se expirou (`now > expiresAt`). Se expirou: `TOKEN_EXPIRED`.
4. Realiza o **burn atômico**: marca `isConsumed = true` e grava `consumedAt = Date.now()`.
5. Emite a identidade definitiva do Gateway:
   - `gatewayId`: identificador único global (UUID).
   - `authToken`: segredo criptográfico para autenticação contínua.
   - `installationId`: vínculo formal com a planta e a estação.

### Passo 5: Armazenamento Seguro e Início de Operação
O Gateway salva as credenciais emitidas no armazenamento seguro local do sistema operacional com permissões restritas (ex.: `/etc/eletricai/gateway.json` com `chmod 600`) e transiciona para o estado `ONLINE`. O painel SCADA da planta passa a exibir o Gateway ativo com indicadores de saúde verde.

---

## 2. REVOGAÇÃO E ROTAÇÃO DE CREDENCIAIS

Caso um hardware seja substituído ou desativado:
1. O administrador aciona **Revogar Gateway** na plataforma Web.
2. O `authToken` é expurgado da tabela de sessões ativas.
3. O Gateway tem o acesso bloqueado imediatamente em todas as tentativas subsequentes de sincronização.
4. Para reativar uma nova máquina, um novo token temporário é emitido obrigatoriamente.
