import { Cpu, type CpuBus } from "../cpu";
import { assemble } from "../asm";

export class TestMemory implements CpuBus {
  data = new Uint8Array(0x10000);
  reads: number[] = [];
  writes: Array<{ address: number; value: number }> = [];
  accesses: Array<
    | { type: "read"; address: number; value: number }
    | { type: "write"; address: number; value: number }
  > = [];

  read(address: number) {
    address &= 0xffff;
    this.reads.push(address);
    const value = this.data[address];
    this.accesses.push({ type: "read", address, value });
    return value;
  }

  write(address: number, value: number) {
    address &= 0xffff;
    value &= 0xff;
    this.writes.push({ address, value });
    this.accesses.push({ type: "write", address, value });
    this.data[address] = value;
  }

  clearTrace() {
    this.reads.length = 0;
    this.writes.length = 0;
    this.accesses.length = 0;
  }
}

export function cpuWith(...program: number[]) {
  const memory = new TestMemory();
  memory.data.set(program, 0x8000);
  const cpu = new Cpu(memory);
  cpu.pc = 0x8000;
  return { cpu, memory };
}

export function cpuWithAsm(source: string, origin = 0x8000) {
  const memory = new TestMemory();
  memory.data.set(assemble(source, origin), origin);
  const cpu = new Cpu(memory);
  cpu.pc = origin;
  return { cpu, memory };
}
