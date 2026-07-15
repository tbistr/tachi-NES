import type { Bus } from "../bus/bus";
import { INSTRUCTIONS } from "./instructions";

export class Cpu {
  a = 0;
  x = 0;
  y = 0;
  sp = 0xfd;
  pc = 0;
  status = 0x24;
  cycles = 0;
  private readonly bus: Bus;
  constructor(bus: Bus) {
    this.bus = bus;
  }
  reset() {
    this.pc = this.bus.read(0xfffc) | (this.bus.read(0xfffd) << 8);
    this.sp = 0xfd;
    this.status = 0x24;
    this.cycles = 7;
  }
  clock() {
    if (this.cycles > 0) {
      this.cycles--;
      return;
    }
    const opcode = this.bus.read(this.pc++);
    const instruction = INSTRUCTIONS[opcode];
    switch (opcode) {
      case 0xa9:
        this.a = this.bus.read(this.pc++);
        this.setZeroNegative(this.a);
        break;
      case 0x4c: {
        const lo = this.bus.read(this.pc++);
        this.pc = lo | (this.bus.read(this.pc) << 8);
        break;
      }
      case 0x00:
        this.pc++;
        break;
      default:
        this.pc += (instruction?.bytes ?? 1) - 1;
    }
    this.cycles = (instruction?.cycles ?? 2) - 1;
  }
  private setZeroNegative(value: number) {
    this.status = value === 0 ? this.status | 2 : this.status & ~2;
    this.status = (value & 0x80) !== 0 ? this.status | 0x80 : this.status & ~0x80;
  }
}
