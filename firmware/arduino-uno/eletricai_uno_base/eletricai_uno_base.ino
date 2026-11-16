// ============================================================================
// EletricAI - firmware da bancada "Bancada EletricAI"
// Placa: Arduino Uno R3 (ATmega328P, 5 V, 2 KB SRAM) - USB CH340 ou 16U2
// Gerado pelo EletricAI (EAI-UNO-1.0). Arduino IDE: placa "Arduino Uno".
//
// LIGACOES
//   E-STOP (NF ao GND)  -> D2 (interrupcao)
//   Saida  D4  -> modulo rele (ativo em LOW): K1 Bomba principal
//   Saida  D5  -> modulo rele (ativo em LOW): K2 Bomba reserva
//   Saida  D6  -> modulo rele (ativo em LOW): KM1 Motor avante | intertravado com D7
//   Saida  D7  -> modulo rele (ativo em LOW): KM2 Motor reverso | intertravado com D6
//   Entrada D8 (NA ao GND, pull-up): Q1 aux
//   Entrada D9 (NA ao GND, pull-up): Q2 aux
//   Analogica A0: Corrente K1 (acs712_5a)
//   Analogica A1: Tensao rede (zmpt101b)
//
// SEGURANCA (leia antes de energizar)
//  - Cada saida aciona um MODULO RELE optoacoplado de 5 V, nunca a bobina do
//    contator direto (pino: 20 mA recomendados, 40 mA absoluto; chip: 200 mA).
//  - Este firmware NAO e funcao de seguranca (NR-12 / ISO 13849). O E-STOP
//    real deve cortar a alimentacao das cargas por circuito fisico cabeado.
//  - Watchdog de 1 s, perda do host e E-STOP desligam TODAS as saidas.
// ============================================================================
#include <avr/wdt.h>
#include <stdlib.h>
#include <string.h>

#define FW_VERSION "EAI-UNO-1.0"
#define BAUD 115200UL
#define HOST_TIMEOUT_MS 1500UL
#define TELEMETRY_MS 250UL
#define ESTOP_PIN 2
#define CMD_BUF 48
#define LINE_BUF 112
#define MAX_SAMPLES 1000

#define N_OUT 4
static const uint8_t OUT_PINS[] = {4, 5, 6, 7};
static const uint8_t OUT_ACTIVE_LOW[] = {1, 1, 1, 1};
static const int8_t OUT_INTERLOCK[] = {-1, -1, 3, 2};
#define N_IN 2
static const uint8_t IN_PINS[] = {8, 9};
#define N_AN 2
static const uint8_t AN_CH[] = {0, 1};

static volatile uint8_t outState[N_OUT > 0 ? N_OUT : 1];
static volatile bool estopLatched = false;
static bool hostLost = true;
static unsigned long lastHostMs = 0;
static unsigned long lastTelemetryMs = 0;
static uint16_t seq = 0;

static char cmdBuf[CMD_BUF];
static uint8_t cmdLen = 0;
static bool cmdOverflow = false;
static char lineBuf[LINE_BUF];

static uint32_t anSum[N_AN > 0 ? N_AN : 1];
static uint32_t anSumSq[N_AN > 0 ? N_AN : 1];
static uint16_t anCount = 0;

// ---------------------------------------------------------------- saidas
static inline uint8_t offLevel(uint8_t i) { return OUT_ACTIVE_LOW[i] ? HIGH : LOW; }
static inline uint8_t onLevel(uint8_t i) { return OUT_ACTIVE_LOW[i] ? LOW : HIGH; }

static void writeOutput(uint8_t i, bool on) {
  digitalWrite(OUT_PINS[i], on ? onLevel(i) : offLevel(i));
  outState[i] = on ? 1 : 0;
}

static void allOff() {
  for (uint8_t i = 0; i < N_OUT; i++) writeOutput(i, false);
}

static bool estopActive() {
  // NF ao GND com pull-up: fechado = LOW (normal); aberto ou rompido = HIGH.
  return digitalRead(ESTOP_PIN) == HIGH;
}

// Interrupcao: corta as saidas imediatamente, sem esperar o laco.
static void estopIsr() {
  for (uint8_t i = 0; i < N_OUT; i++) {
    digitalWrite(OUT_PINS[i], offLevel(i));
    outState[i] = 0;
  }
  estopLatched = true;
}

// ---------------------------------------------------------------- serial
static uint8_t xorChecksum(const char *s) {
  uint8_t x = 0;
  while (*s) x ^= (uint8_t)*s++;
  return x;
}

static void sendLine(const char *body) {
  char tail[5];
  snprintf(tail, sizeof(tail), "*%02X", xorChecksum(body));
  Serial.print(body);
  Serial.println(tail);
}

static void appendPinList(char *dst, size_t cap, const uint8_t *pins, uint8_t n) {
  char item[6];
  for (uint8_t i = 0; i < n; i++) {
    snprintf(item, sizeof(item), i == 0 ? "%u" : ",%u", pins[i]);
    strncat(dst, item, cap - strlen(dst) - 1);
  }
}

static void sendHello() {
  snprintf(lineBuf, sizeof(lineBuf), "HELLO:%s:UNO-R3:", FW_VERSION);
  appendPinList(lineBuf, sizeof(lineBuf), OUT_PINS, N_OUT);
  strncat(lineBuf, ":", sizeof(lineBuf) - strlen(lineBuf) - 1);
  appendPinList(lineBuf, sizeof(lineBuf), IN_PINS, N_IN);
  char tail[6];
  snprintf(tail, sizeof(tail), ":%u", (unsigned)N_AN);
  strncat(lineBuf, tail, sizeof(lineBuf) - strlen(lineBuf) - 1);
  sendLine(lineBuf);
}

static int8_t outIndex(uint8_t pin) {
  for (uint8_t i = 0; i < N_OUT; i++) if (OUT_PINS[i] == pin) return (int8_t)i;
  return -1;
}

static void handleCommand(char *line) {
  char *star = strrchr(line, '*');
  if (star) {
    *star = '\0';
    unsigned long sent = strtoul(star + 1, NULL, 16);
    if (strlen(star + 1) != 2 || sent != xorChecksum(line)) {
      sendLine("ERR:CRC");
      return;
    }
  }
  lastHostMs = millis();
  hostLost = false;

  if (strcmp(line, "PING") == 0) return;
  if (strcmp(line, "CFG?") == 0) { sendHello(); return; }
  if (strcmp(line, "ALL:0") == 0) { allOff(); return; }
  if (strcmp(line, "RST") == 0) {
    if (estopActive()) { sendLine("ERR:ESTOP:released_required"); return; }
    estopLatched = false;
    return;
  }
  if (strncmp(line, "CMD:", 4) == 0) {
    char *p = line + 4;
    char *sep = strchr(p, ':');
    if (!sep) { sendLine("ERR:FMT"); return; }
    *sep = '\0';
    long pin = strtol(p, NULL, 10);
    long state = strtol(sep + 1, NULL, 10);
    int8_t idx = (pin >= 2 && pin <= 13) ? outIndex((uint8_t)pin) : -1;
    if (idx < 0 || (state != 0 && state != 1)) { sendLine("ERR:PIN"); return; }
    if (state == 1) {
      if (estopLatched || estopActive()) { sendLine("ERR:ESTOP"); return; }
      int8_t partner = OUT_INTERLOCK[idx];
      if (partner >= 0 && outState[partner]) { sendLine("ERR:ILK"); return; }
    }
    writeOutput((uint8_t)idx, state == 1);
    snprintf(lineBuf, sizeof(lineBuf), "ACK:%ld:%ld", pin, state);
    sendLine(lineBuf);
    return;
  }
  sendLine("ERR:FMT");
}

static void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!cmdOverflow && cmdLen > 0) {
        cmdBuf[cmdLen] = '\0';
        handleCommand(cmdBuf);
      }
      cmdLen = 0;
      cmdOverflow = false;
    } else if (cmdLen < CMD_BUF - 1) {
      cmdBuf[cmdLen++] = c;
    } else {
      cmdOverflow = true;
    }
  }
}

// ------------------------------------------------------------- telemetria
static void sampleAnalog() {
  if (anCount >= MAX_SAMPLES) return;
  for (uint8_t i = 0; i < N_AN; i++) {
    uint16_t v = (uint16_t)analogRead(AN_CH[i]);
    anSum[i] += v;
    anSumSq[i] += (uint32_t)v * v;
  }
  anCount++;
}

static void sendTelemetry() {
  char part[12];
  snprintf(lineBuf, sizeof(lineBuf), "DATA:%u:", seq++);
  for (uint8_t i = 0; i < N_AN; i++) {
    long mean10 = anCount ? (long)((anSum[i] * 10UL) / anCount) : 0;
    snprintf(part, sizeof(part), i == 0 ? "%ld" : ",%ld", mean10);
    strncat(lineBuf, part, sizeof(lineBuf) - strlen(lineBuf) - 1);
  }
  strncat(lineBuf, ":", sizeof(lineBuf) - strlen(lineBuf) - 1);
  for (uint8_t i = 0; i < N_AN; i++) {
    long rms10 = 0;
    if (anCount) {
      float mean = (float)anSum[i] / anCount;
      float var = (float)anSumSq[i] / anCount - mean * mean;
      rms10 = (long)(sqrt(var > 0 ? var : 0) * 10.0f);
    }
    snprintf(part, sizeof(part), i == 0 ? "%ld" : ",%ld", rms10);
    strncat(lineBuf, part, sizeof(lineBuf) - strlen(lineBuf) - 1);
    anSum[i] = 0;
    anSumSq[i] = 0;
  }
  anCount = 0;
  uint16_t inMask = 0, outMask = 0;
  for (uint8_t i = 0; i < N_IN; i++) if (digitalRead(IN_PINS[i]) == HIGH) inMask |= (1U << IN_PINS[i]);
  for (uint8_t i = 0; i < N_OUT; i++) if (outState[i]) outMask |= (1U << OUT_PINS[i]);
  snprintf(part, sizeof(part), ":%u", inMask);
  strncat(lineBuf, part, sizeof(lineBuf) - strlen(lineBuf) - 1);
  snprintf(part, sizeof(part), ":%u", outMask);
  strncat(lineBuf, part, sizeof(lineBuf) - strlen(lineBuf) - 1);
  strncat(lineBuf, (estopLatched || estopActive()) ? ":1" : ":0", sizeof(lineBuf) - strlen(lineBuf) - 1);
  sendLine(lineBuf);
}

// ------------------------------------------------------------------ setup
void setup() {
  MCUSR = 0;
  wdt_disable();
  for (uint8_t i = 0; i < N_OUT; i++) {
    digitalWrite(OUT_PINS[i], offLevel(i)); // nivel "desligado" ANTES de virar saida
    pinMode(OUT_PINS[i], OUTPUT);
    outState[i] = 0;
  }
  for (uint8_t i = 0; i < N_IN; i++) pinMode(IN_PINS[i], INPUT_PULLUP);
  pinMode(ESTOP_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ESTOP_PIN), estopIsr, RISING);
  estopLatched = estopActive();
  Serial.begin(BAUD);
  sendHello();
  lastHostMs = millis();
  wdt_enable(WDTO_1S);
}

// ------------------------------------------------------------------- loop
void loop() {
  wdt_reset();
  readSerial();

  if (estopActive()) {
    if (!estopLatched) allOff();
    estopLatched = true;
  }
  if (!hostLost && (millis() - lastHostMs > HOST_TIMEOUT_MS)) {
    hostLost = true;
    allOff();
    sendLine("ERR:HOST");
  }

  sampleAnalog();
  if (millis() - lastTelemetryMs >= TELEMETRY_MS) {
    lastTelemetryMs = millis();
    sendTelemetry();
  }
}
