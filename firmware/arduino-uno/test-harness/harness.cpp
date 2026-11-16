#include "Arduino.h"
#include <cassert>
#include <iostream>
uint8_t MCUSR = 0; int pinLevel[20]; int pinModeOf[20]; int pinInputLevel[20];
unsigned long fakeMillis = 0; std::vector<std::pair<int,int>> writeLog; void (*isrFn)() = nullptr;
int analogValues[6] = {512, 512, 0, 0, 0, 0}; FakeSerial Serial;
#include "sketch.inc"
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { std::cout << "FALHOU: " << msg << "\n"; fails++; } else std::cout << "ok: " << msg << "\n"; } while (0)
static uint8_t xr(const std::string& s) { uint8_t x = 0; for (char c : s) x ^= (uint8_t)c; return x; }
static void send(const std::string& body, bool crc = true) {
  std::string line = body;
  if (crc) { char t[5]; snprintf(t, 5, "*%02X", xr(body)); line += t; }
  line += "\n"; for (char c : line) Serial.in.push_back(c);
}
static void step(int ms = 10) { fakeMillis += ms; loop(); }
static std::string takeOut() { std::string s = Serial.out; Serial.out.clear(); return s; }
int main() {
  for (int p = 0; p < 20; p++) { pinInputLevel[p] = HIGH; pinLevel[p] = -1; }
  pinInputLevel[2] = LOW;           // E-STOP NF fechado = normal
  pinInputLevel[8] = LOW;           // Q1 fechado
  setup();
  // 1) saídas inicializam DESLIGADAS (ativo em LOW => HIGH) antes do pinMode
  bool orderOk = true;
  for (int p : {4,5,6,7}) { if (pinLevel[p] != HIGH || pinModeOf[p] != OUTPUT) orderOk = false; }
  CHECK(orderOk, "saídas iniciam desligadas (HIGH em relé ativo em LOW)");
  CHECK(writeLog.size() >= 4 && writeLog[0].second == HIGH, "nível desligado escrito antes de virar saída");
  std::string hello = takeOut();
  CHECK(hello.rfind("HELLO:EAI-UNO-1.0:UNO-R3:4,5,6,7:8,9:2*", 0) == 0, "HELLO com pinos: " + hello.substr(0, 40));
  // 2) liga K1 com checksum
  send("CMD:4:1"); step();
  std::string out = takeOut();
  CHECK(out.find("ACK:4:1") != std::string::npos && pinLevel[4] == LOW, "CMD liga D4 (LOW) e responde ACK");
  // 3) checksum errado é recusado
  Serial.in.clear(); for (char c : std::string("CMD:5:1*00\n")) Serial.in.push_back(c); step();
  out = takeOut();
  CHECK(out.find("ERR:CRC") != std::string::npos && pinLevel[5] == HIGH, "checksum errado → ERR:CRC, D5 continua desligado");
  // 4) intertravamento KM1/KM2
  send("CMD:6:1"); step(); takeOut();
  send("CMD:7:1"); step(); out = takeOut();
  CHECK(out.find("ERR:ILK") != std::string::npos && pinLevel[7] == HIGH, "intertravamento recusa KM2 com KM1 ligado");
  // 5) pino que não é saída
  send("CMD:12:1"); step(); out = takeOut();
  CHECK(out.find("ERR:PIN") != std::string::npos, "pino não configurado → ERR:PIN");
  // 6) telemetria
  step(300); out = takeOut();
  CHECK(out.find("DATA:") != std::string::npos, "telemetria DATA enviada: " + out.substr(0, 60));
  // 7) E-STOP por interrupção desliga tudo e trava
  pinInputLevel[2] = HIGH; if (isrFn) isrFn();
  CHECK(pinLevel[4] == HIGH && pinLevel[6] == HIGH, "E-STOP (interrupção) desliga todas as saídas");
  send("CMD:4:1"); step(); out = takeOut();
  CHECK(out.find("ERR:ESTOP") != std::string::npos && pinLevel[4] == HIGH, "com E-STOP ativo, ligar é recusado");
  pinInputLevel[2] = LOW; send("CMD:4:1"); step(); out = takeOut();
  CHECK(out.find("ERR:ESTOP") != std::string::npos, "E-STOP liberado mas sem RST: continua travado");
  send("RST"); step(); send("CMD:4:1"); step(); out = takeOut();
  CHECK(out.find("ACK:4:1") != std::string::npos && pinLevel[4] == LOW, "após RST, comando volta a funcionar");
  // 8) perda do host desliga tudo
  step(2000); out = takeOut();
  CHECK(out.find("ERR:HOST") != std::string::npos && pinLevel[4] == HIGH, "sem host por > 1,5 s: desliga tudo e avisa ERR:HOST");
  // 9) linha gigante não estoura o buffer
  send(std::string(200, 'X')); step(); out = takeOut();
  CHECK(pinLevel[4] == HIGH, "linha de 200 bytes descartada sem efeito");
  // 10) desligar é sempre aceito
  send("CMD:4:1"); step(); send("CMD:4:0"); step(); out = takeOut();
  CHECK(out.find("ACK:4:0") != std::string::npos && pinLevel[4] == HIGH, "desligar responde ACK:4:0");
  std::cout << (fails ? "FALHAS: " : "TODOS OK ") << fails << "\n";
  return fails ? 1 : 0;
}
