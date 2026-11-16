// Arduino mínimo simulado em PC para testar a LÓGICA do firmware gerado.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <string>
#include <deque>
#include <vector>
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define RISING 3
#define WDTO_1S 6
extern uint8_t MCUSR;
extern int pinLevel[20]; extern int pinModeOf[20]; extern int pinInputLevel[20];
extern unsigned long fakeMillis; extern std::vector<std::pair<int,int>> writeLog;
extern void (*isrFn)(); extern int analogValues[6];
inline unsigned long millis() { return fakeMillis; }
inline void digitalWrite(uint8_t p, uint8_t v) { pinLevel[p] = v; writeLog.push_back({p, v}); }
inline int digitalRead(uint8_t p) { return pinModeOf[p] == OUTPUT ? pinLevel[p] : pinInputLevel[p]; }
inline void pinMode(uint8_t p, uint8_t m) { pinModeOf[p] = m; }
inline int analogRead(uint8_t ch) { return analogValues[ch]; }
inline int digitalPinToInterrupt(int p) { return p == 2 ? 0 : 1; }
inline void attachInterrupt(int, void (*f)(), int) { isrFn = f; }
inline void wdt_enable(int) {} inline void wdt_disable() {} inline void wdt_reset() {}
struct FakeSerial {
  std::deque<char> in; std::string out;
  void begin(unsigned long) {}
  int available() { return (int)in.size(); }
  int read() { char c = in.front(); in.pop_front(); return c; }
  void print(const char* s) { out += s; }
  void println(const char* s) { out += s; out += "\r\n"; }
};
extern FakeSerial Serial;
