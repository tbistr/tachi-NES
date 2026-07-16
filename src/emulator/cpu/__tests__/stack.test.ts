import { describe, expect, test } from "vitest";
import { CpuFlag } from "../cpu";
import { cpuWithAsm } from "./cpuTestUtils";

describe("hardware stack", () => {
  test("PHA writes before decrementing SP and PLA increments before reading", () => {
    const { cpu, memory } = cpuWithAsm(`
      PHA
      PLA
    `);
    cpu.a = 0x42;
    cpu.sp = 0x00;
    cpu.step();
    expect(memory.data[0x0100]).toBe(0x42);
    expect(cpu.sp).toBe(0xff);
    cpu.a = 0;
    cpu.step();
    expect(cpu.a).toBe(0x42);
    expect(cpu.sp).toBe(0x00);
  });

  test("PHP pushes break and unused bits while PLP normalizes them", () => {
    const { cpu, memory } = cpuWithAsm(`
      PHP
      PLP
    `);
    cpu.status = CpuFlag.carry;
    cpu.step();
    expect(memory.data[0x01fd]).toBe(CpuFlag.carry | CpuFlag.break | CpuFlag.unused);
    memory.data[0x01fd] = CpuFlag.break | CpuFlag.negative;
    cpu.step();
    expect(cpu.status).toBe(CpuFlag.unused | CpuFlag.negative);
  });

  test("JSR pushes the return address high byte first and RTS restores it", () => {
    const { cpu, memory } = cpuWithAsm("JSR $9000");
    memory.data[0x9000] = 0x60; // RTS
    cpu.step();
    expect(memory.writes).toEqual([
      { address: 0x01fd, value: 0x80 },
      { address: 0x01fc, value: 0x02 },
    ]);
    expect(cpu.sp).toBe(0xfb);
    cpu.step();
    expect(cpu.pc).toBe(0x8003);
    expect(cpu.sp).toBe(0xfd);
  });

  test("BRK pushes PC+2 and status before loading the IRQ vector", () => {
    const { cpu, memory } = cpuWithAsm(`
      BRK
      NOP
    `);
    cpu.status = CpuFlag.carry | CpuFlag.unused;
    memory.data[0xfffe] = 0x34;
    memory.data[0xffff] = 0x12;
    cpu.step();
    expect(memory.writes).toEqual([
      { address: 0x01fd, value: 0x80 },
      { address: 0x01fc, value: 0x02 },
      {
        address: 0x01fb,
        value: CpuFlag.carry | CpuFlag.break | CpuFlag.unused,
      },
    ]);
    expect(cpu.pc).toBe(0x1234);
    expect(cpu.status & CpuFlag.interrupt).toBe(CpuFlag.interrupt);
  });

  test("RTI restores status and PC without incrementing the return address", () => {
    const { cpu, memory } = cpuWithAsm("RTI");
    cpu.sp = 0xfa;
    memory.data[0x01fb] = CpuFlag.break | CpuFlag.negative;
    memory.data[0x01fc] = 0x34;
    memory.data[0x01fd] = 0x12;
    cpu.step();
    expect(cpu.status).toBe(CpuFlag.unused | CpuFlag.negative);
    expect(cpu.pc).toBe(0x1234);
    expect(cpu.sp).toBe(0xfd);
  });
});
