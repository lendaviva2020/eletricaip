#!/usr/bin/env bash
# Testa o firmware base do Arduino Uno:
#  1) a lógica (E-STOP, intertravamento, watchdog do host, checksum) num
#     simulador em C++ do PC, com Arduino.h de teste;
#  2) se o avr-g++ estiver instalado, compila para o ATmega328P e confere o
#     uso de flash (32 KB, 0,5 KB do bootloader) e de SRAM (2 KB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INO="$ROOT/firmware/arduino-uno/eletricai_uno_base/eletricai_uno_base.ino"
HARNESS="$ROOT/firmware/arduino-uno/test-harness"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp "$INO" "$WORK/sketch.inc"
g++ -std=c++17 -Wall -Wextra -Werror -I"$HARNESS" -I"$WORK" "$HARNESS/harness.cpp" -o "$WORK/harness"
"$WORK/harness"

if command -v avr-g++ >/dev/null 2>&1 && [ -d /usr/share/arduino/hardware/arduino/avr/cores/arduino ]; then
  CORE=/usr/share/arduino/hardware/arduino/avr/cores/arduino
  VAR=/usr/share/arduino/hardware/arduino/avr/variants/standard
  FLAGS="-mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -Os -ffunction-sections -fdata-sections"
  { echo '#include <Arduino.h>'; cat "$INO"; } > "$WORK/sketch.cpp"
  objs=()
  for src in "$CORE"/*.c "$CORE"/*.cpp "$WORK/sketch.cpp"; do
    obj="$WORK/$(basename "$src").o"
    case "$src" in
      *.c) avr-gcc $FLAGS -I"$CORE" -I"$VAR" -c "$src" -o "$obj" ;;
      "$WORK/sketch.cpp") avr-g++ $FLAGS -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -Wall -Wextra -Werror -I"$CORE" -I"$VAR" -c "$src" -o "$obj" ;;
      *) avr-g++ $FLAGS -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -w -I"$CORE" -I"$VAR" -c "$src" -o "$obj" ;;
    esac
    objs+=("$obj")
  done
  avr-gcc -mmcu=atmega328p -Os -Wl,--gc-sections "${objs[@]}" -o "$WORK/fw.elf"
  read -r text data bss _ < <(avr-size "$WORK/fw.elf" | tail -1)
  flash=$((text + data)); sram=$((data + bss))
  echo "flash ${flash} B / 32256 B · SRAM ${sram} B / 2048 B"
  [ "$flash" -le 32256 ] || { echo "Firmware excede a flash do Uno"; exit 1; }
  [ "$sram" -le 1536 ] || { echo "SRAM estática acima de 75% (pilha sem folga)"; exit 1; }
else
  echo "avr-g++/arduino-core ausentes: compilação AVR pulada (só simulação)."
fi
