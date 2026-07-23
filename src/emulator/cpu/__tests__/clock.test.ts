import { describe, expect, test } from "vitest";
import { CpuFlag } from "../cpu";
import { cpuWith, cpuWithAsm } from "./cpuTestUtils";

describe("cycle-stepped CPU", () => {
  test("performs one bus access per clock and finishes at an instruction boundary", () => {
    const { cpu, memory } = cpuWithAsm("LDA #$42");

    cpu.clock();
    expect(memory.reads).toEqual([0x8000]);
    expect(cpu.pc).toBe(0x8001);
    expect(cpu.a).toBe(0);
    expect(cpu.atInstructionBoundary).toBe(false);
    expect(cpu.sequenceKind).toBe("instruction");
    expect(cpu.currentOpcode).toBe(0xa9);
    expect(cpu.cycleInSequence).toBe(1);

    cpu.clock();
    expect(memory.reads).toEqual([0x8000, 0x8001]);
    expect(cpu.a).toBe(0x42);
    expect(cpu.pc).toBe(0x8002);
    expect(cpu.atInstructionBoundary).toBe(true);
    expect(cpu.sequenceKind).toBeUndefined();
    expect(cpu.currentOpcode).toBeUndefined();
    expect(cpu.cycleInSequence).toBe(0);
    expect(cpu.totalCycles).toBe(2);
  });

  test("runs the seven-cycle power-on bus sequence", () => {
    const { cpu, memory } = cpuWith();
    memory.data[0xfffc] = 0x34;
    memory.data[0xfffd] = 0x12;

    cpu.powerOn();
    expect(cpu.sequenceKind).toBe("reset");
    expect(cpu.cycleInSequence).toBe(0);
    expect(cpu.currentOpcode).toBeUndefined();
    cpu.clock();
    expect(cpu.step()).toBe(6);
    expect(cpu.pc).toBe(0x1234);
    expect(cpu.sp).toBe(0xfd);
    expect(cpu.status).toBe(CpuFlag.interrupt | CpuFlag.unused);
    expect(cpu.sequenceKind).toBeUndefined();
    expect(cpu.cycleInSequence).toBe(0);
    expect(memory.reads).toEqual([0x0000, 0x0000, 0x0100, 0x01ff, 0x01fe, 0xfffc, 0xfffd]);
  });

  test("warm reset preserves registers and decrements the current SP three times", () => {
    const { cpu, memory } = cpuWithAsm("NOP");
    cpu.step();
    cpu.a = 0x11;
    cpu.x = 0x22;
    cpu.y = 0x33;
    cpu.sp = 0x80;
    cpu.status = CpuFlag.carry | CpuFlag.decimal | CpuFlag.break;
    memory.data[0xfffc] = 0x34;
    memory.data[0xfffd] = 0x12;
    memory.clearTrace();

    cpu.reset();
    expect(cpu.a).toBe(0x11);
    expect(cpu.x).toBe(0x22);
    expect(cpu.y).toBe(0x33);
    expect(cpu.totalCycles).toBe(2);
    expect(cpu.status).toBe(CpuFlag.carry | CpuFlag.decimal | CpuFlag.interrupt | CpuFlag.unused);

    cpu.clock();
    expect(cpu.sequenceKind).toBe("reset");
    expect(cpu.cycleInSequence).toBe(1);
    expect(cpu.currentOpcode).toBeUndefined();
    expect(cpu.step()).toBe(6);
    expect(cpu.pc).toBe(0x1234);
    expect(cpu.sp).toBe(0x7d);
    expect(cpu.totalCycles).toBe(9);
    expect(memory.reads).toEqual([0x8001, 0x8001, 0x0180, 0x017f, 0x017e, 0xfffc, 0xfffd]);
  });

  test("keeps a masked IRQ pending and observes the CLI recognition delay", () => {
    const { cpu, memory } = cpuWithAsm("NOP\nCLI\nNOP");
    memory.data[0xfffe] = 0x00;
    memory.data[0xffff] = 0x90;
    cpu.requestIrq();

    expect(cpu.step()).toBe(2);
    expect(cpu.pc).toBe(0x8001);
    expect(cpu.step()).toBe(2);
    expect(cpu.status & CpuFlag.interrupt).toBe(0);
    expect(cpu.step()).toBe(2);
    expect(cpu.pc).toBe(0x8003);
    memory.clearTrace();

    cpu.clock();
    expect(cpu.sequenceKind).toBe("irq");
    expect(cpu.cycleInSequence).toBe(1);
    expect(cpu.currentOpcode).toBeUndefined();
    expect(cpu.step()).toBe(6);
    expect(cpu.pc).toBe(0x9000);
    expect(memory.accesses).toEqual([
      { type: "read", address: 0x8003, value: 0x00 },
      { type: "read", address: 0x8003, value: 0x00 },
      { type: "write", address: 0x01fd, value: 0x80 },
      { type: "write", address: 0x01fc, value: 0x03 },
      { type: "write", address: 0x01fb, value: CpuFlag.unused },
      { type: "read", address: 0xfffe, value: 0x00 },
      { type: "read", address: 0xffff, value: 0x90 },
    ]);
  });

  test("services an IRQ recognized on the final cycle of SEI", () => {
    const { cpu, memory } = cpuWithAsm("SEI\nNOP");
    cpu.status &= ~CpuFlag.interrupt;
    memory.data[0xfffe] = 0x00;
    memory.data[0xffff] = 0x90;

    cpu.clock();
    cpu.setIrqLine(true);
    cpu.clock();
    expect(cpu.status & CpuFlag.interrupt).toBe(CpuFlag.interrupt);
    cpu.clock();
    expect(cpu.sequenceKind).toBe("irq");
    expect(cpu.cycleInSequence).toBe(1);
    expect(cpu.currentOpcode).toBeUndefined();
    expect(cpu.step()).toBe(6);
    expect(cpu.pc).toBe(0x9000);
  });

  test("gives a pending NMI priority over IRQ and clears the break bit", () => {
    const { cpu, memory } = cpuWithAsm("CLI\nNOP");
    memory.data[0xfffa] = 0x34;
    memory.data[0xfffb] = 0x12;
    memory.data[0xfffe] = 0x78;
    memory.data[0xffff] = 0x56;
    cpu.step();
    cpu.requestIrq();
    cpu.requestNmi();
    memory.clearTrace();

    cpu.clock();
    expect(cpu.sequenceKind).toBe("nmi");
    expect(cpu.cycleInSequence).toBe(1);
    expect(cpu.currentOpcode).toBeUndefined();
    expect(cpu.step()).toBe(6);
    expect(cpu.pc).toBe(0x1234);
    expect(memory.writes[2].value & CpuFlag.break).toBe(0);
  });

  test("latches NMI only on a rising edge", () => {
    const { cpu, memory } = cpuWithAsm("NOP");
    memory.data[0xfffa] = 0x00;
    memory.data[0xfffb] = 0x90;
    memory.data[0x9000] = 0xea;
    cpu.setNmiLine(true);

    expect(cpu.step()).toBe(7);
    expect(cpu.pc).toBe(0x9000);
    expect(cpu.step()).toBe(2);
    expect(cpu.pc).toBe(0x9001);

    cpu.setNmiLine(false);
    cpu.setNmiLine(true);
    expect(cpu.step()).toBe(7);
  });

  test("uses the old I flag for PLP recognition and the restored flag for RTI", () => {
    const plp = cpuWithAsm("PLP\nNOP");
    plp.memory.data[0x01fe] = CpuFlag.unused;
    plp.memory.data[0xfffe] = 0x00;
    plp.memory.data[0xffff] = 0x90;
    plp.cpu.requestIrq();
    plp.cpu.step();
    expect(plp.cpu.status & CpuFlag.interrupt).toBe(0);
    expect(plp.cpu.step()).toBe(2);
    expect(plp.cpu.step()).toBe(7);

    const rti = cpuWithAsm("RTI");
    rti.cpu.sp = 0xfa;
    rti.memory.data[0x01fb] = CpuFlag.unused;
    rti.memory.data[0x01fc] = 0x00;
    rti.memory.data[0x01fd] = 0x90;
    rti.memory.data[0xfffe] = 0x34;
    rti.memory.data[0xffff] = 0x12;
    rti.cpu.requestIrq();
    rti.cpu.step();
    expect(rti.cpu.pc).toBe(0x9000);
    expect(rti.cpu.step()).toBe(7);
    expect(rti.cpu.pc).toBe(0x1234);
  });

  test("rejects unsupported opcodes at fetch time", () => {
    const { cpu } = cpuWith(0x02);
    expect(() => cpu.clock()).toThrow("undefined opcode $02 at $8000");
  });
});

describe("CPU bus traces", () => {
  test("zero-page indexed reads perform the unindexed dummy read", () => {
    const { cpu, memory } = cpuWithAsm("LDX #$20\nLDA $f0,X");
    memory.data[0x10] = 0x42;
    cpu.step();
    memory.clearTrace();

    cpu.step();
    expect(memory.reads).toEqual([0x8002, 0x8003, 0x00f0, 0x0010]);
  });

  test("absolute indexed reads expose the page-cross dummy read", () => {
    const { cpu, memory } = cpuWithAsm("LDX #$01\nLDA $20ff,X");
    memory.data[0x2100] = 0x42;
    cpu.step();
    memory.clearTrace();

    cpu.step();
    expect(memory.reads).toEqual([0x8002, 0x8003, 0x8004, 0x2000, 0x2100]);
  });

  test("indexed stores always perform a dummy read before writing", () => {
    const { cpu, memory } = cpuWithAsm("STA $20ff,X");
    cpu.x = 1;
    cpu.a = 0x42;

    cpu.step();
    expect(memory.accesses).toEqual([
      { type: "read", address: 0x8000, value: 0x9d },
      { type: "read", address: 0x8001, value: 0xff },
      { type: "read", address: 0x8002, value: 0x20 },
      { type: "read", address: 0x2000, value: 0x00 },
      { type: "write", address: 0x2100, value: 0x42 },
    ]);
  });

  test("read-modify-write performs read, dummy write, and final write", () => {
    const { cpu, memory } = cpuWithAsm("ASL $10");
    memory.data[0x10] = 0x40;

    expect(cpu.step()).toBe(5);
    expect(memory.accesses.slice(2)).toEqual([
      { type: "read", address: 0x0010, value: 0x40 },
      { type: "write", address: 0x0010, value: 0x40 },
      { type: "write", address: 0x0010, value: 0x80 },
    ]);
  });
});
