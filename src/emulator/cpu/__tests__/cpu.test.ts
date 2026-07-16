import { describe, expect, test } from "vitest";
import { CpuFlag } from "../cpu";
import { cpuWith, cpuWithAsm } from "./cpuTestUtils";
import { INSTRUCTIONS } from "../instructions";

describe("6502 CPU", () => {
  test("defines all 151 official opcodes", () => {
    expect(INSTRUCTIONS.filter(Boolean)).toHaveLength(151);
  });
  test("ADC sets carry, overflow, negative and zero correctly", () => {
    const { cpu } = cpuWithAsm(`
      LDA #$50
      ADC #$50
      ADC #$60
    `);
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0xa0);
    expect(cpu.status & CpuFlag.overflow).toBe(CpuFlag.overflow);
    expect(cpu.status & CpuFlag.negative).toBe(CpuFlag.negative);
    cpu.step();
    expect(cpu.a).toBe(0x00);
    expect(cpu.status & CpuFlag.carry).toBe(CpuFlag.carry);
    expect(cpu.status & CpuFlag.zero).toBe(CpuFlag.zero);
  });
  test("zero-page indirect addressing wraps at $ff", () => {
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
  test.each([
    ["INC", 0xe6, 0x7f, 0x80],
    ["ASL", 0x06, 0x40, 0x80],
  ])(
    "%s writes the original value before the modified value",
    (_name, opcode, original, modified) => {
      const { cpu, memory } = cpuWith(opcode, 0x10);
      memory.data[0x10] = original;
      cpu.step();
      expect(memory.writes).toEqual([
        { address: 0x10, value: original },
        { address: 0x10, value: modified },
      ]);
    },
  );

  test("JMP indirect emulates the NMOS page-boundary bug", () => {
    const { cpu, memory } = cpuWithAsm("JMP ($30ff)");
    memory.data[0x30ff] = 0x34;
    memory.data[0x3000] = 0x12;
    memory.data[0x3100] = 0x99;
    cpu.step();
    expect(cpu.pc).toBe(0x1234);
  });
  test("JSR and RTS preserve the return address", () => {
    const { cpu, memory } = cpuWithAsm("JSR $9000");
    memory.data[0x9000] = 0x60; // RTS
    cpu.step();
    expect(cpu.pc).toBe(0x9000);
    cpu.step();
    expect(cpu.pc).toBe(0x8003);
  });
  test("taken branch adds one cycle and page crossing adds another", () => {
    const { cpu } = cpuWithAsm("BNE $8004");
    expect(cpu.step()).toBe(3);

    const { cpu: crossingCpu } = cpuWithAsm("BNE $8101", 0x80fd);
    expect(crossingCpu.step()).toBe(4);
    expect(crossingCpu.pc).toBe(0x8101);
  });
});
