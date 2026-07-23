/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseInes } from "../../cartridge/ines";
import { Cpu, type CpuBus, type CpuState } from "../cpu";
import { INSTRUCTIONS, instructionBytes, type AddressingMode } from "../instructions";

const hex = (value: number, width: number) => value.toString(16).toUpperCase().padStart(width, "0");

/** Minimal NROM CPU bus with side-effect-free reads for trace formatting. */
class NestestBus implements CpuBus {
  private readonly ram = new Uint8Array(0x800);
  private readonly io = new Uint8Array(0x6000).fill(0xff);
  private readonly prg: Uint8Array;

  constructor(prg: Uint8Array) {
    this.prg = prg;
  }

  read(address: number) {
    return this.peek(address);
  }

  write(address: number, value: number) {
    address &= 0xffff;
    value &= 0xff;
    if (address < 0x2000) this.ram[address & 0x7ff] = value;
    else if (address < 0x8000) this.io[address - 0x2000] = value;
  }

  peek(address: number) {
    address &= 0xffff;
    if (address < 0x2000) return this.ram[address & 0x7ff];
    if (address < 0x8000) return this.io[address - 0x2000];
    return this.prg[(address - 0x8000) % this.prg.length];
  }
}

/** Returns a detached ArrayBuffer suitable for the iNES parser. */
function loadRom() {
  return Uint8Array.from(readFileSync(new URL("./fixtures/nestest.nes", import.meta.url))).buffer;
}

/** Reads a little-endian 16-bit value, wrapping the high-byte address in zero page. */
function readZeroPagePointer(bus: NestestBus, address: number) {
  return bus.peek(address & 0xff) | (bus.peek((address + 1) & 0xff) << 8);
}

/** Formats an instruction operand and its effective-memory annotation. */
function formatOperand(
  mode: AddressingMode,
  operation: string,
  pc: number,
  lo: number,
  hi: number,
  state: CpuState,
  bus: NestestBus,
) {
  const word = lo | (hi << 8);
  switch (mode) {
    case "imp":
      return "";
    case "acc":
      return "A";
    case "imm":
      return `#$${hex(lo, 2)}`;
    case "zp":
      return `$${hex(lo, 2)} = ${hex(bus.peek(lo), 2)}`;
    case "zpx": {
      const address = (lo + state.x) & 0xff;
      return `$${hex(lo, 2)},X @ ${hex(address, 2)} = ${hex(bus.peek(address), 2)}`;
    }
    case "zpy": {
      const address = (lo + state.y) & 0xff;
      return `$${hex(lo, 2)},Y @ ${hex(address, 2)} = ${hex(bus.peek(address), 2)}`;
    }
    case "abs":
      return operation === "JMP" || operation === "JSR"
        ? `$${hex(word, 4)}`
        : `$${hex(word, 4)} = ${hex(bus.peek(word), 2)}`;
    case "abx": {
      const address = (word + state.x) & 0xffff;
      return `$${hex(word, 4)},X @ ${hex(address, 4)} = ${hex(bus.peek(address), 2)}`;
    }
    case "aby": {
      const address = (word + state.y) & 0xffff;
      return `$${hex(word, 4)},Y @ ${hex(address, 4)} = ${hex(bus.peek(address), 2)}`;
    }
    case "ind": {
      const target = bus.peek(word) | (bus.peek((word & 0xff00) | ((word + 1) & 0xff)) << 8);
      return `($${hex(word, 4)}) = ${hex(target, 4)}`;
    }
    case "izx": {
      const pointer = (lo + state.x) & 0xff;
      const address = readZeroPagePointer(bus, pointer);
      return `($${hex(lo, 2)},X) @ ${hex(pointer, 2)} = ${hex(address, 4)} = ${hex(bus.peek(address), 2)}`;
    }
    case "izy": {
      const base = readZeroPagePointer(bus, lo);
      const address = (base + state.y) & 0xffff;
      return `($${hex(lo, 2)}),Y = ${hex(base, 4)} @ ${hex(address, 4)} = ${hex(bus.peek(address), 2)}`;
    }
    case "rel": {
      const offset = lo < 0x80 ? lo : lo - 0x100;
      return `$${hex((pc + 2 + offset) & 0xffff, 4)}`;
    }
  }
}

/** Generates one Nintendulator-compatible nestest trace line from CPU state. */
function formatTraceLine(state: CpuState, bus: NestestBus) {
  const opcode = bus.peek(state.pc);
  const instruction = INSTRUCTIONS[opcode];
  if (!instruction) throw new Error(`unsupported opcode $${hex(opcode, 2)}`);
  const length = instructionBytes(instruction.mode);
  const bytes = Array.from({ length }, (_, index) => bus.peek(state.pc + index));
  const byteText = bytes.map((byte) => hex(byte, 2)).join(" ");
  const operand = formatOperand(
    instruction.mode,
    instruction.operation,
    state.pc,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    state,
    bus,
  );
  const assembly = operand ? `${instruction.operation} ${operand}` : instruction.operation;
  const elapsedPpuCycles = state.totalCycles * 3;
  const ppuScanline = Math.floor(elapsedPpuCycles / 341) % 262;
  const ppuCycle = elapsedPpuCycles % 341;
  return (
    `${hex(state.pc, 4)}  ${byteText.padEnd(9)} ${assembly.padEnd(32)}` +
    `A:${hex(state.a, 2)} X:${hex(state.x, 2)} Y:${hex(state.y, 2)} ` +
    `P:${hex(state.status, 2)} SP:${hex(state.sp, 2)} ` +
    `PPU:${ppuScanline.toString().padStart(3)},${ppuCycle.toString().padStart(3)} ` +
    `CYC:${state.totalCycles}`
  );
}

describe("nestest golden trace", () => {
  test("generates the expected official-opcode log", () => {
    const want = readFileSync(new URL("./fixtures/nestest.log.golden", import.meta.url), "utf8")
      .trimEnd()
      .split(/\r?\n/);
    const firstUnofficial = want.findIndex((line) => line.includes("*"));
    expect(firstUnofficial).toBe(5003);

    const bus = new NestestBus(parseInes(loadRom()).prg);
    const cpu = new Cpu(bus);
    cpu.loadState({
      pc: 0xc000,
      a: 0,
      x: 0,
      y: 0,
      status: 0x24,
      sp: 0xfd,
      totalCycles: 7,
      irqLine: false,
      irqRecognized: false,
      nmiLine: false,
      nmiLatched: false,
    });

    const got: string[] = [];
    for (let instruction = 0; instruction < firstUnofficial; instruction++) {
      got.push(formatTraceLine(cpu.saveState(), bus));
      cpu.step();
    }

    expect(`${got.join("\n")}\n`).toBe(`${want.slice(0, firstUnofficial).join("\n")}\n`);
  });
});
