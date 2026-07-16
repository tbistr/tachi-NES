import type { AddressingMode, Instruction } from "./instructions";
import { INSTRUCTIONS } from "./instructions";

export interface CpuBus {
  read(address: number): number;
  write(address: number, value: number): void;
}

export const CpuFlag = {
  carry: 1,
  zero: 2,
  interrupt: 4,
  decimal: 8,
  break: 0x10,
  unused: 0x20,
  overflow: 0x40,
  negative: 0x80,
} as const;

type Operand =
  | { kind: "none"; pageCrossed: false }
  | { kind: "value"; value: number; pageCrossed: false }
  | { kind: "address"; address: number; pageCrossed: boolean };

export class Cpu {
  // https://www.nesdev.org/wiki/CPU_power_up_state#CPU
  a = 0;
  x = 0;
  y = 0;
  sp = 0xfd;
  pc = 0;
  status = CpuFlag.interrupt | CpuFlag.unused;
  cyclesRemaining = 0;
  private irqPending = false;
  private nmiPending = false;
  private readonly bus: CpuBus;

  /** Creates a CPU connected to the provided memory bus. */
  constructor(bus: CpuBus) {
    this.bus = bus;
  }

  /** Restores the CPU to its reset state and loads the reset vector. */
  reset() {
    // https://www.nesdev.org/wiki/CPU_power_up_state#CPU
    this.a = this.x = this.y = 0;
    this.sp = 0xfd;
    this.status = CpuFlag.interrupt | CpuFlag.unused;
    this.pc = this.read16(0xfffc);
    // The 2A03 reset sequence takes 7 CPU cycles.
    // https://forums.nesdev.org/viewtopic.php?t=7573
    this.cyclesRemaining = 7;
    this.irqPending = this.nmiPending = false;
  }

  /** Advances the CPU by one clock cycle. */
  clock() {
    if (this.cyclesRemaining > 0) {
      this.cyclesRemaining--;
      return;
    }
    if (this.nmiPending) {
      this.nmiPending = false;
      this.interrupt(0xfffa);
      this.cyclesRemaining = 6;
      return;
    }
    if (this.irqPending && !this.flag(CpuFlag.interrupt)) {
      this.irqPending = false;
      this.interrupt(0xfffe);
      this.cyclesRemaining = 6;
      return;
    }
    this.step();
  }

  /** Executes one complete instruction and returns the number of consumed cycles. */
  step() {
    const at = this.pc;
    const opcode = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    const instruction = INSTRUCTIONS[opcode];
    if (!instruction)
      throw new Error(
        `undefined opcode $${opcode.toString(16).padStart(2, "0")} at $${at.toString(16).padStart(4, "0")}`,
      );
    const operand = this.resolveOperand(instruction.mode);

    let cycles =
      instruction.cycles + (instruction.extraCycleOnPageCross && operand.pageCrossed ? 1 : 0);

    cycles += this.execute(instruction, operand);
    this.status = (this.status | CpuFlag.unused) & ~CpuFlag.break;

    this.cyclesRemaining = cycles - 1;
    return cycles;
  }

  /** Latches a maskable interrupt request for the next instruction boundary. */
  requestIrq() {
    this.irqPending = true;
  }

  /** Latches a non-maskable interrupt request for the next instruction boundary. */
  requestNmi() {
    this.nmiPending = true;
  }

  /** Reads one byte from the 16-bit CPU address space. */
  private read(a: number) {
    return this.bus.read(a & 0xffff) & 0xff;
  }

  /** Reads a little-endian word from memory. */
  private read16(a: number) {
    return this.read(a) | (this.read(a + 1) << 8);
  }

  /** Pushes CPU state and transfers control through an interrupt vector. */
  private interrupt(vector: number) {
    this.push16(this.pc);
    this.push((this.status | CpuFlag.unused) & ~CpuFlag.break);
    this.setFlag(CpuFlag.interrupt, true);
    this.pc = this.read16(vector);
  }

  /** Pushes one byte onto the hardware stack. */
  private push(v: number) {
    this.bus.write(0x100 | this.sp, v & 0xff);
    this.sp = (this.sp - 1) & 0xff;
  }

  /** Pushes a 16-bit value onto the hardware stack, high byte first. */
  private push16(v: number) {
    this.push(v >> 8);
    this.push(v);
  }

  /** Returns whether a processor status flag is set. */
  private flag(f: number) {
    return (this.status & f) !== 0;
  }

  /** Sets or clears a processor status flag. */
  private setFlag(f: number, on: boolean) {
    this.status = on ? this.status | f : this.status & ~f;
  }

  /** Resolves an instruction operand using its addressing mode. */
  private resolveOperand(mode: AddressingMode): Operand {
    const fetch = () => {
      const value = this.read(this.pc);
      this.pc = (this.pc + 1) & 0xffff;
      return value;
    };
    const fetch16 = () => {
      const v = this.read16(this.pc);
      this.pc = (this.pc + 2) & 0xffff;
      return v;
    };
    const readZp16 = (a: number) => this.read(a) | (this.read((a + 1) & 0xff) << 8);

    const zpIndexed = (index: number): Operand => {
      const address = (fetch() + index) & 0xff;
      return { kind: "address", address, pageCrossed: false };
    };
    const indexed = (base: number, index: number): Operand => {
      const address = (base + index) & 0xffff;
      return { kind: "address", address, pageCrossed: (base & 0xff00) !== (address & 0xff00) };
    };

    // https://www.nesdev.org/wiki/CPU_addressing_modes
    switch (mode) {
      // Indexed addressing
      case "zpx":
        return zpIndexed(this.x);
      case "zpy":
        return zpIndexed(this.y);
      case "abx":
        return indexed(fetch16(), this.x);
      case "aby":
        return indexed(fetch16(), this.y);
      case "izx": {
        const p = (fetch() + this.x) & 0xff;
        return { kind: "address", address: readZp16(p), pageCrossed: false };
      }
      case "izy":
        return indexed(readZp16(fetch()), this.y);

      // Other addressing
      case "imp":
      case "acc":
        return { kind: "none", pageCrossed: false };
      case "imm":
        return { kind: "value", value: fetch(), pageCrossed: false };
      case "zp":
        return { kind: "address", address: fetch(), pageCrossed: false };
      case "abs":
        return { kind: "address", address: fetch16(), pageCrossed: false };
      case "rel":
        return { kind: "value", value: fetch(), pageCrossed: false };
      case "ind": {
        // The 6502 has a hardware bug where the high byte of an indirect address wraps around if the low byte is $FF.
        // This means that if you try to read a 16-bit address from $xxFF, it will read the low byte from $xxFF and the high byte from $xx00 instead of $xxFF + 1.
        // example: if p = $03FF, then lo = $03FF, hi = ($03FF & $FF00) | (($03FF + 1) & $00FF) = $0300
        // See https://www.nesdev.org/wiki/Instruction_reference#JMP
        const p = fetch16(),
          lo = this.read(p),
          hi = this.read((p & 0xff00) | ((p + 1) & 0xff));
        return { kind: "address", address: lo | (hi << 8), pageCrossed: false };
      }
    }
  }

  /** Executes the operation associated with a decoded instruction.
   *  Returns the number of additional cycles consumed by the instruction. */
  private execute(i: Instruction, o: Operand) {
    const address = () => {
      if (o.kind !== "address") throw new Error("Instruction requires an address operand");
      return o.address;
    };
    const value = () => {
      if (o.kind === "value") return o.value;
      return this.read(address());
    };

    const store = (v: number) => this.bus.write(address(), v & 0xff);

    // TODO: Clock level emulation of the 6502's read-modify-write instructions is more complex than this.
    const readModifyWrite = (modify: (v: number) => number) => {
      const target = address();
      const original = this.read(target);
      this.bus.write(target, original);
      const modified = modify(original) & 0xff;
      this.bus.write(target, modified);
      return modified;
    };

    const setZN = (v: number) => {
      v &= 0xff;
      this.setFlag(CpuFlag.zero, v === 0);
      this.setFlag(CpuFlag.negative, (v & 0x80) !== 0);
      return v;
    };
    const adc = (v: number) => {
      const sum = this.a + v + (this.flag(CpuFlag.carry) ? 1 : 0);
      const result = sum & 0xff;
      this.setFlag(CpuFlag.carry, sum > 0xff);
      this.setFlag(CpuFlag.overflow, (~(this.a ^ v) & (this.a ^ result) & 0x80) !== 0);
      this.a = setZN(result);
    };
    const shift = (fn: (v: number) => number) => {
      if (o.kind === "none") this.a = setZN(fn(this.a));
      else readModifyWrite((v) => setZN(fn(v)));
    };
    const compare = (register: number, v: number) => {
      this.setFlag(CpuFlag.carry, register >= v);
      setZN(register - v);
    };

    const branch = (condition: boolean, offset: number) => {
      if (!condition) return 0;
      const previousPc = this.pc;
      this.pc = (this.pc + (offset < 0x80 ? offset : offset - 0x100)) & 0xffff;
      return 1 + ((previousPc & 0xff00) !== (this.pc & 0xff00) ? 1 : 0);
    };

    const pull = () => {
      this.sp = (this.sp + 1) & 0xff;
      return this.read(0x100 | this.sp);
    };
    const pull16 = () => {
      const lo = pull(),
        hi = pull();
      return lo | (hi << 8);
    };

    // https://www.nesdev.org/wiki/Instruction_reference
    switch (i.operation) {
      // Access
      case "LDA":
        this.a = setZN(value());
        break;
      case "STA":
        store(this.a);
        break;
      case "LDX":
        this.x = setZN(value());
        break;
      case "STX":
        store(this.x);
        break;
      case "LDY":
        this.y = setZN(value());
        break;
      case "STY":
        store(this.y);
        break;

      // Transfer
      case "TAX":
        this.x = setZN(this.a);
        break;
      case "TXA":
        this.a = setZN(this.x);
        break;
      case "TAY":
        this.y = setZN(this.a);
        break;
      case "TYA":
        this.a = setZN(this.y);
        break;

      // Arithmetic
      case "ADC":
        adc(value());
        break;
      case "SBC":
        adc(value() ^ 0xff);
        break;
      case "INC":
        readModifyWrite((v) => setZN(v + 1));
        break;
      case "DEC":
        readModifyWrite((v) => setZN(v - 1));
        break;
      case "INX":
        this.x = setZN(this.x + 1);
        break;
      case "DEX":
        this.x = setZN(this.x - 1);
        break;
      case "INY":
        this.y = setZN(this.y + 1);
        break;
      case "DEY":
        this.y = setZN(this.y - 1);
        break;

      // Shift
      case "ASL":
        shift((v) => {
          this.setFlag(CpuFlag.carry, (v & 0x80) !== 0);
          return v << 1;
        });
        break;
      case "LSR":
        shift((v) => {
          this.setFlag(CpuFlag.carry, (v & 1) !== 0);
          return v >>> 1;
        });
        break;
      case "ROL":
        shift((v) => {
          const c = this.flag(CpuFlag.carry) ? 1 : 0;
          this.setFlag(CpuFlag.carry, (v & 0x80) !== 0);
          return (v << 1) | c;
        });
        break;
      case "ROR":
        shift((v) => {
          const c = this.flag(CpuFlag.carry) ? 0x80 : 0;
          this.setFlag(CpuFlag.carry, (v & 1) !== 0);
          return (v >>> 1) | c;
        });
        break;

      // Bitwise
      case "AND":
        this.a = setZN(this.a & value());
        break;
      case "ORA":
        this.a = setZN(this.a | value());
        break;
      case "EOR":
        this.a = setZN(this.a ^ value());
        break;
      case "BIT": {
        const v = value();
        this.setFlag(CpuFlag.zero, (this.a & v) === 0);
        this.setFlag(CpuFlag.overflow, (v & 0x40) !== 0);
        this.setFlag(CpuFlag.negative, (v & 0x80) !== 0);
        break;
      }

      // Compare
      case "CMP":
        compare(this.a, value());
        break;
      case "CPX":
        compare(this.x, value());
        break;
      case "CPY":
        compare(this.y, value());
        break;

      // Branch
      case "BCC":
        return branch(!this.flag(CpuFlag.carry), value());
      case "BCS":
        return branch(this.flag(CpuFlag.carry), value());
      case "BEQ":
        return branch(this.flag(CpuFlag.zero), value());
      case "BNE":
        return branch(!this.flag(CpuFlag.zero), value());
      case "BPL":
        return branch(!this.flag(CpuFlag.negative), value());
      case "BMI":
        return branch(this.flag(CpuFlag.negative), value());
      case "BVC":
        return branch(!this.flag(CpuFlag.overflow), value());
      case "BVS":
        return branch(this.flag(CpuFlag.overflow), value());

      // Jump
      case "JMP":
        this.pc = address();
        break;
      case "JSR":
        this.push16((this.pc - 1) & 0xffff);
        this.pc = address();
        break;
      case "RTS":
        this.pc = (pull16() + 1) & 0xffff;
        break;
      case "BRK":
        this.pc = (this.pc + 1) & 0xffff;
        this.push16(this.pc);
        this.push(this.status | CpuFlag.break | CpuFlag.unused);
        this.setFlag(CpuFlag.interrupt, true);
        this.pc = this.read16(0xfffe);
        break;
      case "RTI":
        this.status = (pull() | CpuFlag.unused) & ~CpuFlag.break;
        this.pc = pull16();
        break;

      // Stack
      case "PHA":
        this.push(this.a);
        break;
      case "PLA":
        this.a = setZN(pull());
        break;
      case "PHP":
        this.push(this.status | CpuFlag.break | CpuFlag.unused);
        break;
      case "PLP":
        this.status = (pull() | CpuFlag.unused) & ~CpuFlag.break;
        break;
      case "TXS":
        this.sp = this.x;
        break;
      case "TSX":
        this.x = setZN(this.sp);
        break;

      // Flags
      case "CLC":
        this.setFlag(CpuFlag.carry, false);
        break;
      case "SEC":
        this.setFlag(CpuFlag.carry, true);
        break;
      case "CLI":
        this.setFlag(CpuFlag.interrupt, false);
        break;
      case "SEI":
        this.setFlag(CpuFlag.interrupt, true);
        break;
      case "CLD":
        this.setFlag(CpuFlag.decimal, false);
        break;
      case "SED":
        this.setFlag(CpuFlag.decimal, true);
        break;
      case "CLV":
        this.setFlag(CpuFlag.overflow, false);
        break;

      // Other
      case "NOP":
        break;

      default:
        i.operation satisfies never;
    }
    return 0;
  }
}
