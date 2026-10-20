# Tiny Design: Temperature Converter CLI

A deliberately small design doc for smoke-testing agentkit locally.

## 1. Overview
A command-line tool `tconv` that converts temperatures between Celsius, Fahrenheit and Kelvin.

## 2. Stack
Node.js (LTS) with TypeScript (strict). Tests use Vitest. No runtime dependencies.

## 3. Conversion library
- `convert(value: number, from: Unit, to: Unit): number`, where `Unit` is `'C' | 'F' | 'K'`.
- Results are rounded to 2 decimal places.
- Throws `RangeError` with the message `below absolute zero` for any input below 0 K.

## 4. CLI
- Usage: `tconv <value> <from> <to>`, e.g. `tconv 100 C F` prints `212`.
- Invalid unit or non-numeric value: print `usage: tconv <value> <C|F|K> <C|F|K>` to stderr and exit with code 2.
- Below absolute zero: print `error: below absolute zero` to stderr and exit with code 1.

## 5. Open question
Should the CLI accept lowercase units (`c`, `f`, `k`)? Not decided.
