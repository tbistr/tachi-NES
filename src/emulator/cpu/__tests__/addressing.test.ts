import { describe, expect, test } from "vitest";
import { cpuWith, cpuWithAsm } from "./cpuTestUtils";

describe("addressing modes", () => {
  test("indexed-indirect pointer location and high byte wrap in zero page", () => {
    const { cpu, memory } = cpuWithAsm(`
      LDX #$02
      LDA ($fd,X)
    `);
    memory.data[0xff] = 0x34;
    memory.data[0x00] = 0x12;
    memory.data[0x1234] = 0x42;
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
  });

  test("indirect-indexed pointer high byte wraps in zero page", () => {
    const { cpu, memory } = cpuWithAsm(`
      LDY #$01
      LDA ($ff),Y
    `);
    memory.data[0xff] = 0xff;
    memory.data[0x00] = 0x20;
    memory.data[0x2100] = 0x42;
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
  });

  test("JMP indirect emulates the NMOS page-boundary bug", () => {
    const { cpu, memory } = cpuWithAsm("JMP ($30ff)");
    memory.data[0x30ff] = 0x34;
    memory.data[0x3000] = 0x12;
    memory.data[0x3100] = 0x99;
    cpu.step();
    expect(cpu.pc).toBe(0x1234);
  });

  test("the program counter wraps from $ffff to $0000", () => {
    const { cpu, memory } = cpuWith();
    cpu.pc = 0xffff;
    memory.data[0xffff] = 0xa9;
    memory.data[0x0000] = 0x42;
    cpu.step();
    expect(cpu.a).toBe(0x42);
    expect(cpu.pc).toBe(0x0001);
  });
});
