import type { AddressingMode, Operation } from "./instructions";
import { INSTRUCTIONS } from "./instructions";

export interface CpuBus {
  /** Reads one byte from the CPU address space. */
  read(address: number): number;

  /** Writes one byte to the CPU address space. */
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

export type SequenceKind = "instruction" | "reset" | "irq" | "nmi";

type OperandPattern = "read" | "write" | "modify";
type InstructionPattern = OperandPattern | "branch" | "control" | "accumulator" | "implied";

/** Serializable state for a CPU sequence that is currently in flight. */
export interface CpuExecutionState {
  /** Identifies whether the CPU is executing an instruction, RESET, IRQ, or NMI sequence. */
  kind: SequenceKind;
  /** Number of cycles already completed in this sequence; zero before its first cycle. */
  cycle: number;
  /** Fetched opcode; available for instruction sequences after the opcode-fetch cycle. */
  opcode?: number;
  /** Decoded instruction operation, such as LDA or BRK; only present for instructions. */
  operation?: Operation;
  /** Decoded addressing mode; only present for instructions after opcode fetch. */
  mode?: AddressingMode;
  /** Reusable low-byte latch for operands, addresses, return addresses, and vectors. */
  lo: number;
  /** Reusable high-byte latch for operands, addresses, return addresses, and vectors. */
  hi: number;
  /** Final effective address, branch target, or stack-restored return address. */
  address: number;
  /** Pre-carry address used for indexed dummy reads and page-cross branch reads. */
  provisionalAddress: number;
  /** Data byte retained between read, dummy-write, and final-write cycles. */
  data: number;
  /** Whether indexed addressing or a taken branch crossed a 256-byte page boundary. */
  pageCrossed: boolean;
  /** Whether the condition of the active branch instruction evaluated to true. */
  branchTaken: boolean;
  /** First vector address for IRQ or NMI entry; absent for instructions and RESET. */
  vector?: number;
}

/** Serializable CPU state, including any partially completed sequence. */
export interface CpuState {
  a: number;
  x: number;
  y: number;
  sp: number;
  pc: number;
  status: number;
  totalCycles: number;
  irqLine: boolean;
  irqRecognized: boolean;
  nmiLine: boolean;
  nmiLatched: boolean;
  execution?: CpuExecutionState;
}

const RESET_VECTOR = 0xfffc;
const NMI_VECTOR = 0xfffa;
const IRQ_VECTOR = 0xfffe;

const readOperations = new Set<Operation>([
  "ADC",
  "AND",
  "BIT",
  "CMP",
  "CPX",
  "CPY",
  "EOR",
  "LDA",
  "LDX",
  "LDY",
  "ORA",
  "SBC",
]);
const writeOperations = new Set<Operation>(["STA", "STX", "STY"]);
const modifyOperations = new Set<Operation>(["ASL", "DEC", "INC", "LSR", "ROL", "ROR"]);

const branchOperations = new Set<Operation>([
  "BCC",
  "BCS",
  "BEQ",
  "BMI",
  "BNE",
  "BPL",
  "BVC",
  "BVS",
]);
const controlOperations = new Set<Operation>([
  "JMP",
  "JSR",
  "RTS",
  "BRK",
  "RTI",
  "PHA",
  "PHP",
  "PLA",
  "PLP",
]);

/** Creates zeroed latch state for a new execution sequence. */
function createExecutionState(kind: SequenceKind, vector?: number): CpuExecutionState {
  return {
    kind,
    cycle: 0,
    lo: 0,
    hi: 0,
    address: 0,
    provisionalAddress: 0,
    data: 0,
    pageCrossed: false,
    branchTaken: false,
    vector,
  };
}

/** Cycle-stepped Ricoh 2A03 CPU core. One clock performs at most one bus access. */
export class Cpu {
  a = 0;
  x = 0;
  y = 0;
  sp = 0xfd;
  pc = 0;
  status = CpuFlag.interrupt | CpuFlag.unused;
  /** Number of completed CPU clocks since the most recent power-on. */
  totalCycles = 0;

  private readonly bus: CpuBus;
  private execution?: CpuExecutionState;
  private irqLine = false;
  private irqRecognized = false;
  private nmiLine = false;
  private nmiLatched = false;
  private clockActive = false;
  private busAccessedThisClock = false;

  /** Creates a CPU connected to the bus used for all memory accesses. */
  constructor(bus: CpuBus) {
    this.bus = bus;
  }

  /** Returns whether no instruction, RESET, IRQ, or NMI sequence is in flight. */
  get atInstructionBoundary() {
    return this.execution === undefined;
  }

  /** Returns the active execution-sequence kind, or undefined while idle. */
  get sequenceKind() {
    return this.execution?.kind;
  }

  /** Returns the one-based cycle within the active sequence, or zero while idle. */
  get cycleInSequence() {
    return this.execution?.cycle ?? 0;
  }

  /** Returns the active instruction opcode, or undefined outside instruction execution. */
  get currentOpcode() {
    return this.execution?.opcode;
  }

  /** Reads and normalizes one byte from the 16-bit CPU address space. */
  private read(address: number) {
    this.recordBusAccess();
    return this.bus.read(address & 0xffff) & 0xff;
  }

  /** Writes a normalized byte to the 16-bit CPU address space. */
  private write(address: number, value: number) {
    this.recordBusAccess();
    this.bus.write(address & 0xffff, value & 0xff);
  }

  /** Records one bus access and rejects accesses outside or repeated within a CPU clock. */
  private recordBusAccess() {
    if (!this.clockActive) throw new Error("CPU bus access attempted outside a clock");
    if (this.busAccessedThisClock) throw new Error("CPU clock attempted more than one bus access");
    this.busAccessedThisClock = true;
  }

  /** Writes a byte at the current stack position and then decrements SP. */
  private pushStack(value: number) {
    this.write(0x100 | this.sp, value);
    this.sp = (this.sp - 1) & 0xff;
  }

  /** Increments SP and then reads a byte from the resulting stack position. */
  private pullStack() {
    this.sp = (this.sp + 1) & 0xff;
    return this.read(0x100 | this.sp);
  }

  /** Returns whether a processor-status flag is currently set. */
  private flag(flag: number) {
    return (this.status & flag) !== 0;
  }

  /** Sets or clears one processor-status flag without changing other flags. */
  private setFlag(flag: number, enabled: boolean) {
    this.status = enabled ? this.status | flag : this.status & ~flag;
  }

  /** Fetches a byte at PC and advances PC with 16-bit wrapping. */
  private fetchPc() {
    const value = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return value;
  }

  /** Initializes deterministic power-on state and starts the RESET sequence. */
  powerOn() {
    this.a = this.x = this.y = 0;
    this.sp = 0;
    this.pc = 0;
    this.status = CpuFlag.interrupt | CpuFlag.unused;
    this.irqLine = this.irqRecognized = this.nmiLine = this.nmiLatched = false;
    this.totalCycles = 0;
    this.beginResetSequence();
  }

  /** Starts a warm RESET while preserving registers and the lifetime cycle counter. */
  reset() {
    this.status = (this.status | CpuFlag.interrupt | CpuFlag.unused) & ~CpuFlag.break;
    this.beginResetSequence();
  }

  /** Aborts the current sequence and starts the seven-cycle RESET state machine. */
  private beginResetSequence() {
    this.irqRecognized = this.nmiLatched = false;
    this.execution = createExecutionState("reset");
  }

  /** Advances the CPU by exactly one clock, performing at most one bus access. */
  clock() {
    if (this.clockActive) throw new Error("CPU clock is not reentrant");
    this.clockActive = true;
    this.busAccessedThisClock = false;
    try {
      this.executeClock();
    } finally {
      this.clockActive = false;
    }
  }

  /** Executes and commits one clock while clock() owns the bus-access guard. */
  private executeClock() {
    // If no sequence is in flight, select the next instruction or recognized interrupt.
    if (!this.execution) {
      if (this.nmiLatched) {
        this.nmiLatched = false;
        this.execution = createExecutionState("nmi", NMI_VECTOR);
      } else if (this.irqRecognized) {
        this.irqRecognized = false;
        this.execution = createExecutionState("irq", IRQ_VECTOR);
      } else {
        this.execution = createExecutionState("instruction");
      }
    }

    // Execute one cycle of the active sequence and commit its effects.
    const interruptDisabledAtCycleStart = this.flag(CpuFlag.interrupt);
    const completed = this.executeCycle(this.execution!);
    if (!this.busAccessedThisClock)
      throw new Error("CPU clock must perform exactly one bus access");
    this.execution!.cycle++;
    this.totalCycles++;

    if (completed) {
      this.irqRecognized = this.irqLine && !interruptDisabledAtCycleStart;
      this.status = (this.status | CpuFlag.unused) & ~CpuFlag.break;
      this.execution = undefined;
    }
  }

  /** Clocks until the current instruction or pending interrupt sequence completes. */
  step() {
    let cycles = 0;
    do {
      this.clock();
      cycles++;
    } while (this.execution);
    return cycles;
  }

  /** Sets the level-sensitive IRQ input and recognizes it immediately at a boundary. */
  setIrqLine(asserted: boolean) {
    this.irqLine = asserted;
    if (asserted && this.atInstructionBoundary && !this.flag(CpuFlag.interrupt))
      this.irqRecognized = true;
  }

  /** Asserts IRQ until the caller clears it with `setIrqLine(false)`. */
  requestIrq() {
    this.setIrqLine(true);
  }

  /** Sets the NMI input and latches a request on its rising edge. */
  setNmiLine(asserted: boolean) {
    if (asserted && !this.nmiLine) this.nmiLatched = true;
    this.nmiLine = asserted;
  }

  /** Latches one NMI request without changing the externally visible NMI line. */
  requestNmi() {
    this.nmiLatched = true;
  }

  /** Returns a detached, JSON-serializable snapshot of the complete CPU state. */
  saveState(): CpuState {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      sp: this.sp,
      pc: this.pc,
      status: this.status,
      totalCycles: this.totalCycles,
      irqLine: this.irqLine,
      irqRecognized: this.irqRecognized,
      nmiLine: this.nmiLine,
      nmiLatched: this.nmiLatched,
      execution: this.execution ? { ...this.execution } : undefined,
    };
  }

  /** Restores a state previously returned by saveState without accessing the bus. */
  loadState(state: CpuState) {
    if (this.clockActive) throw new Error("cannot restore CPU state during a clock");
    this.a = state.a;
    this.x = state.x;
    this.y = state.y;
    this.sp = state.sp;
    this.pc = state.pc;
    this.status = state.status;
    this.totalCycles = state.totalCycles;
    this.irqLine = state.irqLine;
    this.irqRecognized = state.irqRecognized;
    this.nmiLine = state.nmiLine;
    this.nmiLatched = state.nmiLatched;
    this.execution = state.execution ? { ...state.execution } : undefined;
  }

  /** Executes one explicit state-machine cycle for the active sequence. */
  private executeCycle(execution: CpuExecutionState) {
    const cycle = execution.cycle + 1;
    switch (execution.kind) {
      case "reset":
        return this.executeResetCycle(execution, cycle);
      case "irq":
      case "nmi":
        return this.executeInterruptCycle(execution, cycle);
      case "instruction":
        return this.executeInstructionCycle(execution, cycle);
    }
  }

  /** Performs one cycle of the RESET sequence. */
  private executeResetCycle(state: CpuExecutionState, cycle: number) {
    // https://www.nesdev.org/wiki/CPU_interrupts#IRQ_and_NMI_tick-by-tick_execution
    switch (cycle) {
      case 1:
      case 2:
        this.read(this.pc);
        return false;
      case 3:
      case 4:
      case 5:
        this.read(0x100 | this.sp);
        this.sp = (this.sp - 1) & 0xff;
        return false;
      case 6:
        state.lo = this.read(RESET_VECTOR);
        return false;
      case 7:
        state.hi = this.read(RESET_VECTOR + 1);
        this.pc = state.lo | (state.hi << 8);
        return true;
    }
    throw new Error(`invalid RESET cycle ${cycle}`);
  }

  /** Performs one cycle of IRQ or NMI entry. */
  private executeInterruptCycle(state: CpuExecutionState, cycle: number) {
    // https://www.nesdev.org/wiki/CPU_interrupts#IRQ_and_NMI_tick-by-tick_execution
    const vector = state.vector!;
    switch (cycle) {
      case 1:
      case 2:
        this.read(this.pc);
        return false;
      case 3:
        this.pushStack(this.pc >> 8);
        return false;
      case 4:
        this.pushStack(this.pc);
        return false;
      case 5:
        this.pushStack((this.status | CpuFlag.unused) & ~CpuFlag.break);
        this.setFlag(CpuFlag.interrupt, true);
        return false;
      case 6:
        state.lo = this.read(vector);
        return false;
      case 7:
        state.hi = this.read(vector + 1);
        this.pc = state.lo | (state.hi << 8);
        return true;
    }
    throw new Error(`invalid ${state.kind.toUpperCase()} cycle ${cycle}`);
  }

  /** Fetches or advances one cycle of an instruction. */
  private executeInstructionCycle(state: CpuExecutionState, cycle: number) {
    if (cycle === 1) {
      const at = this.pc;
      const opcode = this.fetchPc();
      const instruction = INSTRUCTIONS[opcode];
      if (!instruction)
        throw new Error(
          `undefined opcode $${opcode.toString(16).padStart(2, "0")} at $${at.toString(16).padStart(4, "0")}`,
        );
      state.opcode = opcode;
      state.operation = instruction.operation;
      state.mode = instruction.mode;
      return false;
    }

    const instructionPattern = (operation: Operation, mode: AddressingMode): InstructionPattern => {
      if (branchOperations.has(operation)) return "branch";
      if (controlOperations.has(operation)) return "control";
      if (mode === "acc") return "accumulator";
      if (mode === "imp") return "implied";
      if (readOperations.has(operation)) return "read";
      if (writeOperations.has(operation)) return "write";
      if (modifyOperations.has(operation)) return "modify";
      throw new Error(`${operation} cannot be classified`);
    };

    // Bus accesses for each cycle are described in here: https://xotmatrix.com/6502/6502-single-cycle-execution.html
    const pattern = instructionPattern(state.operation!, state.mode!);
    switch (pattern) {
      // No memory access
      case "accumulator":
        this.read(this.pc);
        this.a = this.executeOperationWithResult(state.operation!, this.a);
        return true;
      case "implied":
        this.read(this.pc);
        this.executeOperation(state.operation!);
        return true;

      // Memory access
      case "read":
      case "write":
      case "modify":
        return this.executeOperationWithAddressing(state, cycle, pattern);

      // Control flow
      case "branch":
        return this.executeBranchOperation(state, cycle);
      case "control":
        return this.executeControlOperation(state, cycle);
    }
    throw new Error(`instruction $${state.opcode?.toString(16)} has no execution pattern`);
  }

  /** Executes one instruction cycle with a addressing mode that requires memory access. */
  private executeOperationWithAddressing(
    state: CpuExecutionState,
    cycle: number,
    pattern: OperandPattern,
  ) {
    const execute = (accessCycle: number) => {
      switch (pattern) {
        case "read":
          if (accessCycle === 0) this.executeOperation(state.operation!, this.read(state.address));
          else throw new Error(`invalid read access cycle ${accessCycle}`);
          return true;
        case "write":
          if (accessCycle === 0)
            this.write(state.address, this.executeOperationWithResult(state.operation!));
          else throw new Error(`invalid write access cycle ${accessCycle}`);
          return true;
        case "modify":
          if (accessCycle === 0) {
            state.data = this.read(state.address);
            return false;
          } else if (accessCycle === 1) {
            this.write(state.address, state.data);
            return false;
          } else if (accessCycle === 2) {
            this.write(
              state.address,
              this.executeOperationWithResult(state.operation!, state.data),
            );
            return true;
          }
          throw new Error(`invalid modify access cycle ${accessCycle}`);
      }
      throw new Error(`${state.operation} does not support a memory operand`);
    };

    const executeIndexed = (accessCycle: number) => {
      switch (pattern) {
        case "read":
          if (accessCycle === 0) {
            const value = this.read(state.provisionalAddress);
            if (!state.pageCrossed) this.executeOperation(state.operation!, value);
            return !state.pageCrossed;
          } else if (accessCycle === 1 && state.pageCrossed) {
            this.executeOperation(state.operation!, this.read(state.address));
            return true;
          }
          throw new Error(`invalid indexed read cycle ${accessCycle}`);
        case "write":
          if (accessCycle === 0) {
            this.read(state.provisionalAddress);
            return false;
          } else if (accessCycle === 1) {
            this.write(state.address, this.executeOperationWithResult(state.operation!));
            return true;
          }
          throw new Error(`invalid indexed write cycle ${accessCycle}`);
        case "modify":
          if (accessCycle === 0) this.read(state.provisionalAddress);
          else if (accessCycle === 1) state.data = this.read(state.address);
          else if (accessCycle === 2) this.write(state.address, state.data);
          else if (accessCycle === 3) {
            this.write(
              state.address,
              this.executeOperationWithResult(state.operation!, state.data),
            );
            return true;
          } else throw new Error(`invalid indexed modify cycle ${accessCycle}`);
          return false;
      }
    };

    const setIndexedAddress = (base: number, index: number) => {
      state.address = (base + index) & 0xffff;
      state.provisionalAddress = (base & 0xff00) | (state.address & 0xff);
      state.pageCrossed = state.provisionalAddress !== state.address;
    };

    switch (state.mode) {
      case "imm":
        this.executeOperation(state.operation!, this.fetchPc());
        return true;
      case "zp":
        if (cycle === 2) {
          state.address = this.fetchPc();
          return false;
        }
        return execute(cycle - 3);
      case "zpx":
      case "zpy":
        if (cycle === 2) {
          state.lo = this.fetchPc();
          return false;
        }
        if (cycle === 3) {
          this.read(state.lo);
          const index = state.mode === "zpx" ? this.x : this.y;
          state.address = (state.lo + index) & 0xff;
          return false;
        }
        return execute(cycle - 4);
      case "abs":
        if (cycle === 2) {
          state.lo = this.fetchPc();
          return false;
        }
        if (cycle === 3) {
          state.hi = this.fetchPc();
          state.address = state.lo | (state.hi << 8);
          return false;
        }
        return execute(cycle - 4);
      case "abx":
      case "aby":
        if (cycle === 2) {
          state.lo = this.fetchPc();
          return false;
        }
        if (cycle === 3) {
          state.hi = this.fetchPc();
          const base = state.lo | (state.hi << 8);
          const index = state.mode === "abx" ? this.x : this.y;
          setIndexedAddress(base, index);
          return false;
        }
        return executeIndexed(cycle - 4);
      case "izx":
        if (cycle === 2) state.lo = this.fetchPc();
        else if (cycle === 3) {
          this.read(state.lo);
          state.lo = (state.lo + this.x) & 0xff;
        } else if (cycle === 4) state.data = this.read(state.lo);
        else if (cycle === 5) {
          state.hi = this.read((state.lo + 1) & 0xff);
          state.address = state.data | (state.hi << 8);
        } else return execute(cycle - 6);
        return false;
      case "izy":
        if (cycle === 2) state.lo = this.fetchPc();
        else if (cycle === 3) state.data = this.read(state.lo);
        else if (cycle === 4) {
          state.hi = this.read((state.lo + 1) & 0xff);
          const base = state.data | (state.hi << 8);
          setIndexedAddress(base, this.y);
        } else return executeIndexed(cycle - 5);
        return false;
    }
    throw new Error(`unsupported operand mode ${state.mode}`);
  }

  /** Applies the register, flag, or value-producing effect of a non-control operation. */
  private executeOperation(operation: Operation, value?: number): number | undefined {
    const operand = () => {
      if (value === undefined) throw new Error(`${operation} requires an operand`);
      return value;
    };

    // https://www.nesdev.org/wiki/Instruction_reference
    switch (operation) {
      // Access
      case "LDA":
        this.a = this.setZN(operand());
        return;
      case "STA":
        return this.a;
      case "LDX":
        this.x = this.setZN(operand());
        return;
      case "STX":
        return this.x;
      case "LDY":
        this.y = this.setZN(operand());
        return;
      case "STY":
        return this.y;

      // Transfer
      case "TAX":
        this.x = this.setZN(this.a);
        return;
      case "TXA":
        this.a = this.setZN(this.x);
        return;
      case "TAY":
        this.y = this.setZN(this.a);
        return;
      case "TYA":
        this.a = this.setZN(this.y);
        return;

      // Arithmetic
      case "ADC":
        this.adc(operand());
        return;
      case "SBC":
        this.adc(operand() ^ 0xff);
        return;
      case "INC":
        return this.setZN(operand() + 1);
      case "DEC":
        return this.setZN(operand() - 1);
      case "INX":
        this.x = this.setZN(this.x + 1);
        return;
      case "DEX":
        this.x = this.setZN(this.x - 1);
        return;
      case "INY":
        this.y = this.setZN(this.y + 1);
        return;
      case "DEY":
        this.y = this.setZN(this.y - 1);
        return;

      // Shift
      case "ASL": {
        const value = operand();
        this.setFlag(CpuFlag.carry, (value & 0x80) !== 0);
        return this.setZN(value << 1);
      }
      case "LSR": {
        const value = operand();
        this.setFlag(CpuFlag.carry, (value & 1) !== 0);
        return this.setZN(value >>> 1);
      }
      case "ROL": {
        const value = operand();
        const carry = this.flag(CpuFlag.carry) ? 1 : 0;
        this.setFlag(CpuFlag.carry, (value & 0x80) !== 0);
        return this.setZN((value << 1) | carry);
      }
      case "ROR": {
        const value = operand();
        const carry = this.flag(CpuFlag.carry) ? 0x80 : 0;
        this.setFlag(CpuFlag.carry, (value & 1) !== 0);
        return this.setZN((value >>> 1) | carry);
      }

      // Bitwise
      case "AND":
        this.a = this.setZN(this.a & operand());
        return;
      case "ORA":
        this.a = this.setZN(this.a | operand());
        return;
      case "EOR":
        this.a = this.setZN(this.a ^ operand());
        return;
      case "BIT": {
        const value = operand();
        this.setFlag(CpuFlag.zero, (this.a & value) === 0);
        this.setFlag(CpuFlag.overflow, (value & 0x40) !== 0);
        this.setFlag(CpuFlag.negative, (value & 0x80) !== 0);
        return;
      }

      // Compare
      case "CMP":
        this.cmp(this.a, operand());
        return;
      case "CPX":
        this.cmp(this.x, operand());
        return;
      case "CPY":
        this.cmp(this.y, operand());
        return;

      // Branch
      // Jump
      // this.executeControlOperation()

      // Stack
      // this.executeControlOperation()
      case "TSX":
        this.x = this.setZN(this.sp);
        return;
      case "TXS":
        this.sp = this.x;
        return;

      // Flags
      case "CLC":
        this.setFlag(CpuFlag.carry, false);
        return;
      case "SEC":
        this.setFlag(CpuFlag.carry, true);
        return;
      case "CLI":
        this.setFlag(CpuFlag.interrupt, false);
        return;
      case "SEI":
        this.setFlag(CpuFlag.interrupt, true);
        return;
      case "CLD":
        this.setFlag(CpuFlag.decimal, false);
        return;
      case "SED":
        this.setFlag(CpuFlag.decimal, true);
        return;
      case "CLV":
        this.setFlag(CpuFlag.overflow, false);
        return;

      // Other
      case "NOP":
        return;
    }
    throw new Error(`${operation} uses a dedicated execution sequence`);
  }

  /** Performs one relative-branch cycle without dynamically inserting work. */
  private executeBranchOperation(state: CpuExecutionState, cycle: number) {
    if (cycle === 2) {
      const offset = this.fetchPc();
      const cond = () => {
        switch (state.operation!) {
          case "BCC":
            return (this.status & CpuFlag.carry) === 0;
          case "BCS":
            return (this.status & CpuFlag.carry) !== 0;
          case "BEQ":
            return (this.status & CpuFlag.zero) !== 0;
          case "BNE":
            return (this.status & CpuFlag.zero) === 0;
          case "BPL":
            return (this.status & CpuFlag.negative) === 0;
          case "BMI":
            return (this.status & CpuFlag.negative) !== 0;
          case "BVC":
            return (this.status & CpuFlag.overflow) === 0;
          case "BVS":
            return (this.status & CpuFlag.overflow) !== 0;
          default:
            throw new Error(`${state.operation} is not a branch operation`);
        }
      };
      state.branchTaken = cond();
      if (!state.branchTaken) return true;
      const previousPc = this.pc;
      state.address = (previousPc + (offset < 0x80 ? offset : offset - 0x100)) & 0xffff;
      state.provisionalAddress = (previousPc & 0xff00) | (state.address & 0xff);
      state.pageCrossed = state.provisionalAddress !== state.address;
      return false;
    } else if (cycle === 3 && state.branchTaken) {
      this.read(this.pc);
      this.pc = state.address;
      return !state.pageCrossed;
    } else if (cycle === 4 && state.pageCrossed) {
      this.read(state.provisionalAddress);
      return true;
    } else throw new Error(`invalid ${state.operation} branch cycle ${cycle}`);
  }

  /** Performs one control-flow or hardware-stack instruction cycle. */
  private executeControlOperation(state: CpuExecutionState, cycle: number) {
    switch (state.operation) {
      case "JMP":
        if (cycle === 2) {
          state.lo = this.fetchPc();
          return false;
        } else if (state.mode === "abs" && cycle === 3) {
          state.hi = this.read(this.pc);
          this.pc = state.lo | (state.hi << 8);
          return true;
        } else if (state.mode === "ind") {
          if (cycle === 3) {
            state.hi = this.fetchPc();
            state.address = state.lo | (state.hi << 8);
            return false;
          } else if (cycle === 4) {
            state.lo = this.read(state.address);
            return false;
          } else if (cycle === 5) {
            state.hi = this.read((state.address & 0xff00) | ((state.address + 1) & 0xff));
            this.pc = state.lo | (state.hi << 8);
            return true;
          }
        }
        throw new Error(`invalid JMP cycle ${cycle}`);
      case "JSR":
        if (cycle === 2) state.lo = this.fetchPc();
        else if (cycle === 3) this.read(0x100 | this.sp);
        else if (cycle === 4) this.pushStack(this.pc >> 8);
        else if (cycle === 5) this.pushStack(this.pc);
        else if (cycle === 6) {
          state.hi = this.read(this.pc);
          this.pc = state.lo | (state.hi << 8);
        } else throw new Error(`invalid JSR cycle ${cycle}`);
        return cycle === 6;
      case "RTS":
        if (cycle === 2) this.read(this.pc);
        else if (cycle === 3) this.read(0x100 | this.sp);
        else if (cycle === 4) state.lo = this.pullStack();
        else if (cycle === 5) {
          state.hi = this.pullStack();
          state.address = state.lo | (state.hi << 8);
        } else if (cycle === 6) {
          this.read(state.address);
          this.pc = (state.address + 1) & 0xffff;
        } else throw new Error(`invalid RTS cycle ${cycle}`);
        return cycle === 6;
      case "BRK":
        if (cycle === 2) this.fetchPc();
        else if (cycle === 3) this.pushStack(this.pc >> 8);
        else if (cycle === 4) this.pushStack(this.pc);
        else if (cycle === 5) {
          this.pushStack(this.status | CpuFlag.break | CpuFlag.unused);
          this.setFlag(CpuFlag.interrupt, true);
        } else if (cycle === 6) state.lo = this.read(IRQ_VECTOR);
        else if (cycle === 7) {
          state.hi = this.read(IRQ_VECTOR + 1);
          this.pc = state.lo | (state.hi << 8);
        } else throw new Error(`invalid BRK cycle ${cycle}`);
        return cycle === 7;
      case "RTI":
        if (cycle === 2) this.read(this.pc);
        else if (cycle === 3) this.read(0x100 | this.sp);
        else if (cycle === 4) this.status = (this.pullStack() | CpuFlag.unused) & ~CpuFlag.break;
        else if (cycle === 5) state.lo = this.pullStack();
        else if (cycle === 6) {
          state.hi = this.pullStack();
          this.pc = state.lo | (state.hi << 8);
        } else throw new Error(`invalid RTI cycle ${cycle}`);
        return cycle === 6;

      // Stack
      case "PHA":
      case "PHP":
        if (cycle === 2) this.read(this.pc);
        else if (cycle === 3)
          this.pushStack(
            state.operation === "PHA" ? this.a : this.status | CpuFlag.break | CpuFlag.unused,
          );
        else throw new Error(`invalid ${state.operation} cycle ${cycle}`);
        return cycle === 3;
      case "PLA":
      case "PLP":
        if (cycle === 2) this.read(this.pc);
        else if (cycle === 3) this.read(0x100 | this.sp);
        else if (cycle === 4) {
          const value = this.pullStack();
          if (state.operation === "PLA") this.a = this.setZN(value);
          else this.status = (value | CpuFlag.unused) & ~CpuFlag.break;
        } else throw new Error(`invalid ${state.operation} cycle ${cycle}`);
        return cycle === 4;
    }
    throw new Error(`${state.operation} is not a control operation`);
  }

  /** Executes a non-control operation and returns its result, throwing if none is produced. */
  private executeOperationWithResult(operation: Operation, operand?: number) {
    const result = this.executeOperation(operation, operand);
    if (result === undefined) throw new Error(`${operation} does not produce a value`);
    return result;
  }

  /** Normalizes a byte, updates zero/negative flags, and returns the byte. */
  private setZN(value: number) {
    value &= 0xff;
    this.setFlag(CpuFlag.zero, value === 0);
    this.setFlag(CpuFlag.negative, (value & 0x80) !== 0);
    return value;
  }

  /** Performs binary RP2A03 addition and updates A, C, V, Z, and N. */
  private adc(operand: number) {
    const sum = this.a + operand + (this.flag(CpuFlag.carry) ? 1 : 0);
    const result = sum & 0xff;
    this.setFlag(CpuFlag.carry, sum > 0xff);
    this.setFlag(CpuFlag.overflow, (~(this.a ^ operand) & (this.a ^ result) & 0x80) !== 0);
    this.a = this.setZN(result);
  }

  /** Compares a register with an operand and updates C, Z, and N. */
  private cmp(register: number, operand: number) {
    this.setFlag(CpuFlag.carry, register >= operand);
    this.setZN(register - operand);
  }
}
