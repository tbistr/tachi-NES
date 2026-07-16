import { describe, expect, test } from "vitest";
import { cpuWith, cpuWithAsm } from "./cpuTestUtils";

describe("addressing modes", () => {
  test("zero-page indexed addressing wraps at $ff", () => {
    const { cpu, memory } = cpuWithAsm(`
      LDX #$20
      LDA $f0,X
    `);
    memory.data[0x10] = 0x42;
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
  });

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

  test("indirect-indexed addressing adds a cycle when crossing a page", () => {
    const { cpu, memory } = cpuWithAsm(`
      LDY #$01
      LDA ($10),Y
    `);
    memory.data[0x10] = 0xff;
    memory.data[0x11] = 0x20;
    memory.data[0x2100] = 0x42;
    cpu.step();
    expect(cpu.step()).toBe(6);
    expect(cpu.a).toBe(0x42);
  });

  test.each([
    ["absolute,X", "LDX #$01\nLDA $20ff,X"],
    ["absolute,Y", "LDY #$01\nLDA $20ff,Y"],
  ])("%s read adds a cycle when crossing a page", (_name, source) => {
    const { cpu, memory } = cpuWithAsm(source);
    memory.data[0x2100] = 0x42;
    cpu.step();
    expect(cpu.step()).toBe(5);
    expect(cpu.a).toBe(0x42);
  });

  test("indexed stores do not add a conditional page-cross cycle", () => {
    const { cpu, memory } = cpuWithAsm(`
      LDX #$01
      LDA #$42
      STA $20ff,X
    `);
    cpu.step();
    cpu.step();
    expect(cpu.step()).toBe(5);
    expect(memory.data[0x2100]).toBe(0x42);
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
