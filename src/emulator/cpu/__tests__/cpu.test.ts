import { describe, expect, test } from "vitest";
import { Cpu, CpuFlag, type CpuBus } from "../cpu";
import { INSTRUCTIONS } from "../instructions";
class Memory implements CpuBus {
  data = new Uint8Array(0x10000);
  writes: Array<{ address: number; value: number }> = [];
  read(address: number) {
    return this.data[address & 0xffff];
  }
  write(address: number, value: number) {
    address &= 0xffff;
    value &= 0xff;
    this.writes.push({ address, value });
    this.data[address] = value;
  }
}
function cpuWith(...program: number[]) {
  const memory = new Memory();
  memory.data.set(program, 0x8000);
  const cpu = new Cpu(memory);
  cpu.pc = 0x8000;
  return { cpu, memory };
}
describe("6502 CPU", () => {
  test("defines all 151 official opcodes", () => {
    expect(INSTRUCTIONS.filter(Boolean)).toHaveLength(151);
  });
  test("ADC sets carry, overflow, negative and zero correctly", () => {
    const { cpu } = cpuWith(0xa9, 0x50, 0x69, 0x50, 0x69, 0x60);
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
    const { cpu, memory } = cpuWith(0xa0, 0x01, 0xb1, 0xff);
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
    const { cpu, memory } = cpuWith(0x6c, 0xff, 0x30);
    memory.data[0x30ff] = 0x34;
    memory.data[0x3000] = 0x12;
    memory.data[0x3100] = 0x99;
    cpu.step();
    expect(cpu.pc).toBe(0x1234);
  });
  test("JSR and RTS preserve the return address", () => {
    const { cpu, memory } = cpuWith(0x20, 0x00, 0x90, 0xea);
    memory.data[0x9000] = 0x60;
    cpu.step();
    expect(cpu.pc).toBe(0x9000);
    cpu.step();
    expect(cpu.pc).toBe(0x8003);
  });
  test("taken branch adds one cycle and page crossing adds another", () => {
    const { cpu, memory } = cpuWith(0xd0, 0x02);
    expect(cpu.step()).toBe(3);
    cpu.pc = 0x80fd;
    memory.data[0x80fd] = 0xd0;
    memory.data[0x80fe] = 0x02;
    expect(cpu.step()).toBe(4);
    expect(cpu.pc).toBe(0x8101);
  });
});
