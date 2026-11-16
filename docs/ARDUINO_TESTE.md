# Teste com Arduino / ESP32 — leituras reais no EletricAI

Fluxo real (sem simulação): o dispositivo envia `POST` HTTPS para
`/api/public/iot/ingest` com uma **API key** da sua organização; a leitura é
gravada em `iot_readings` e aparece em **Tempo real** (`/realtime`).

## 1. Pré-requisitos no app

1. **Plano Pro Empresa ou Premium** na organização — o banco recusa leituras de outros
   planos (`plan_required`). Como admin da plataforma, troque o plano da sua
   empresa em **Configurações → Faturamento** (fica registrado na auditoria).
2. Em **Tempo real → Chaves de API**, crie uma chave com escopo `iot:ingest`.
   Ela aparece **uma única vez** (o banco guarda só o hash SHA-256).
3. O dispositivo é criado sozinho na primeira leitura, com o nome do
   `device_external_id` enviado (ex.: `bancada-temp-01`).

## 2. Contrato da API

```
POST https://SEU-DOMINIO/api/public/iot/ingest
Authorization: Bearer <API_KEY>
Content-Type: application/json

{ "device_external_id": "bancada-temp-01", "value": 23.4, "quality": "GOOD", "message_id": "42" }
```

| Campo | Regra |
| --- | --- |
| `device_external_id` | 1–128 caracteres; identifica o sensor |
| `value` | número finito (a leitura) |
| `quality` | opcional, até 16 caracteres (`GOOD`, `BAD`, `UNCERTAIN`) |
| `message_id` | opcional; reenvio com o mesmo id é ignorado (sem duplicar) |
| `ttl_ms` | opcional, 100–60000 |

Respostas: `200 {ok:true}` · `400 bad_input` · `401 missing_api_key`/`unauthorized` ·
`402 plan_required` · `429` limite (120 leituras/min por chave e por IP).
Envie no máximo **1 leitura por segundo** por sensor.

## 3. ESP32 (Wi-Fi + HTTPS) — recomendado

Placa: ESP32 DevKit. Sensor de exemplo: potenciômetro no GPIO34 (troque pela
leitura do seu sensor).

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASS = "SUA_SENHA";
const char* URL       = "https://SEU-DOMINIO/api/public/iot/ingest";
const char* API_KEY   = "COLE_A_CHAVE_AQUI";   // nunca publique esta chave
const char* DEVICE_ID = "bancada-temp-01";

uint32_t seq = 0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWi-Fi conectado");
}

void loop() {
  float value = analogRead(34) * (3.3f / 4095.0f);   // tensão lida (V)

  WiFiClientSecure client;
  // Só para o teste de bancada. Em produção, use client.setCACert(<CA raiz>).
  client.setInsecure();

  HTTPClient http;
  http.begin(client, URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_KEY);

  String body = String("{\"device_external_id\":\"") + DEVICE_ID +
                "\",\"value\":" + String(value, 3) +
                ",\"message_id\":\"" + String(++seq) + "\"}";
  int code = http.POST(body);
  Serial.printf("HTTP %d  %s\n", code, http.getString().c_str());
  http.end();

  delay(2000);   // 1 leitura a cada 2 s
}
```

Abra o **Monitor Serial** (115200): `HTTP 200 {"ok":true,...}` = gravado.

## 4. Arduino Uno/Nano (sem Wi-Fi) — ponte pelo PC

O Uno não faz HTTPS. Ele imprime a leitura na serial e um script no PC envia.

Sketch:

```cpp
void setup() { Serial.begin(9600); }
void loop() {
  float v = analogRead(A0) * (5.0 / 1023.0);
  Serial.println(v, 3);
  delay(2000);
}
```

Ponte (Python 3, `pip install pyserial requests`):

```python
import os, time, serial, requests

PORT = os.environ.get("PORTA", "COM3")      # Linux: /dev/ttyACM0
URL = os.environ["ELETRICAI_URL"]           # https://SEU-DOMINIO/api/public/iot/ingest
KEY = os.environ["ELETRICAI_API_KEY"]       # não deixe a chave no código
DEVICE = "bancada-uno-01"

ser = serial.Serial(PORT, 9600, timeout=5)
seq = 0
while True:
    line = ser.readline().decode(errors="ignore").strip()
    try:
        value = float(line)
    except ValueError:
        continue
    seq += 1
    r = requests.post(URL, timeout=10,
        headers={"Authorization": f"Bearer {KEY}"},
        json={"device_external_id": DEVICE, "value": value, "message_id": str(seq)})
    print(r.status_code, r.text[:120])
```

## 5. Problemas comuns

| Sintoma | Causa |
| --- | --- |
| `401 unauthorized` | chave errada, revogada, expirada ou sem escopo `iot:ingest` |
| `plan_required` | organização no plano Grátis ou Autônomo (IoT a partir do Pro Empresa) |
| `device_limit` | plano já tem o máximo de dispositivos (Pro Empresa: 10; Premium: 50) — reutilize um `device_external_id` |
| `429` | mais de 120 leituras/min por chave ou por IP |
| `400 bad_input` | `value` não numérico (ex.: `nan`) ou JSON malformado |
| ESP32 `-1`/`-11` | sem internet, DNS ou HTTPS — teste a URL no navegador do celular na mesma rede |

## Segurança

- A chave dá permissão de **gravar leituras** da sua organização: trate como senha,
  uma chave por dispositivo, revogue em **Tempo real** se vazar.
- Leitura apenas: nenhum comando sai do app para o dispositivo neste fluxo
  (regra 21 — nada atua em equipamento real sem projeto de autorização).

## Bancada pelo próprio navegador (Arduino Uno R3, sem ESP32)

1. No editor **unifilar**, abra **Bancada Arduino** na barra lateral.
2. Em "Origem", escolha **Contatores do unifilar** (cada contator vira um relé em D4, D5, D6, D7, D10…) ou **Bancada de exemplo**.
3. Clique em **Baixar firmware (.ino)** e grave na IDE do Arduino (placa "Arduino Uno"; o CH340 dos clones SMD pede o driver WCH no Windows).
4. Ligação mínima:
   - **E-STOP**: contato NF entre D2 e GND (aberto ou fio rompido = parado; só volta com "Rearmar").
   - **Relés**: MÓDULO relé optoacoplado de 5 V (ativo em nível baixo) nos pinos de saída. Nunca ligue bobina de contator direto no pino (máx. 20 mA).
   - **Auxiliar do disjuntor**: contato NA entre o pino de entrada (D8, D9, D3) e GND.
   - **Analógicas**: ACS712 / SCT-013 (com resistor de carga) / ZMPT101B em A0–A5, sempre 0–5 V.
5. Use **Chrome ou Edge no computador** (HTTPS): **Conectar Arduino** → escolha a porta. O Uno reinicia e se identifica.
6. Para ligar um relé: ative **Habilitar comando de campo** e confirme a janela. Bloqueios mostram o motivo (E-STOP, intertravamento, disjuntor aberto, NBR 5410).

O firmware desliga todas as saídas sozinho se o navegador parar de falar com ele por 1,5 s, no E-STOP e se travar (watchdog). Isso é uma camada extra: a segurança das pessoas continua sendo o circuito físico de emergência (NR-10/NR-12).

### Enviar as leituras reais para a nuvem

Com o Arduino conectado, ative **Enviar para a nuvem** no painel. As leituras entram no **Realtime** da sua empresa (menu Realtime), com uma aba por grandeza: `A0`, `A1` (corrente/tensão com unidade), `out.D4`… (relé ligado = 1), `in.D8`… (contato fechado = 1) e `estop`.

- Requer login e plano **Pro Empresa** ou **Premium**; a bancada conta como **um** dispositivo.
- Só valores que mudaram (ou um a cada 60 s) são enviados, para não encher o banco.
- Não funciona no projeto de demonstração.
