export type Operation =
  | "ADC"
  | "AND"
  | "ASL"
  | "BCC"
  | "BCS"
  | "BEQ"
  | "BIT"
  | "BMI"
  | "BNE"
  | "BPL"
  | "BRK"
  | "BVC"
  | "BVS"
  | "CLC"
  | "CLD"
  | "CLI"
  | "CLV"
  | "CMP"
  | "CPX"
  | "CPY"
  | "DEC"
  | "DEX"
  | "DEY"
  | "EOR"
  | "INC"
  | "INX"
  | "INY"
  | "JMP"
  | "JSR"
  | "LDA"
  | "LDX"
  | "LDY"
  | "LSR"
  | "NOP"
  | "ORA"
  | "PHA"
  | "PHP"
  | "PLA"
  | "PLP"
  | "ROL"
  | "ROR"
  | "RTI"
  | "RTS"
  | "SBC"
  | "SEC"
  | "SED"
  | "SEI"
  | "STA"
  | "STX"
  | "STY"
  | "TAX"
  | "TAY"
  | "TSX"
  | "TXA"
  | "TXS"
  | "TYA";

export type AddressingMode =
  | "imp"
  | "acc"
  | "imm"
  | "zp"
  | "zpx"
  | "zpy"
  | "abs"
  | "abx"
  | "aby"
  | "ind"
  | "izx"
  | "izy"
  | "rel";

export type Instruction = {
  operation: Operation;
  mode: AddressingMode;
  bytes: number;
  cycles: number;
  extraCycleOnPageCross?: boolean;
};

const bytesByAddressingMode: Record<AddressingMode, number> = {
  imp: 1,
  acc: 1,
  imm: 2,
  zp: 2,
  zpx: 2,
  zpy: 2,
  abs: 3,
  abx: 3,
  aby: 3,
  ind: 3,
  izx: 2,
  izy: 2,
  rel: 2,
};

type OpcodeDefinition = readonly [
  opcode: number,
  mode: AddressingMode,
  cycles: number,
  extraCycleOnPageCross?: boolean,
];

const opcodeTable: Array<Instruction | undefined> = new Array(256);

/** Registers every opcode variant for an official 6502 instruction. */
function defineInstruction(operation: Operation, definitions: readonly OpcodeDefinition[]) {
  for (const [opcode, mode, cycles, extraCycleOnPageCross] of definitions) {
    if (opcodeTable[opcode]) throw new Error("Duplicate opcode");
    if (cycles < 1) throw new Error("Invalid cycle count");
    opcodeTable[opcode] = {
      operation,
      mode,
      bytes: bytesByAddressingMode[mode],
      cycles,
      extraCycleOnPageCross,
    };
  }
}

// See below for the full list of official 6502 addressing modes and instructions.
// https://www.nesdev.org/wiki/CPU_addressing_modes
// https://www.nesdev.org/wiki/Instruction_reference

// Access
defineInstruction("LDA", [
  [0xa9, "imm", 2],
  [0xa5, "zp", 3],
  [0xb5, "zpx", 4],
  [0xad, "abs", 4],
  [0xbd, "abx", 4, true],
  [0xb9, "aby", 4, true],
  [0xa1, "izx", 6],
  [0xb1, "izy", 5, true],
]);
defineInstruction("STA", [
  [0x85, "zp", 3],
  [0x95, "zpx", 4],
  [0x8d, "abs", 4],
  [0x9d, "abx", 5],
  [0x99, "aby", 5],
  [0x81, "izx", 6],
  [0x91, "izy", 6],
]);
defineInstruction("LDX", [
  [0xa2, "imm", 2],
  [0xa6, "zp", 3],
  [0xb6, "zpy", 4],
  [0xae, "abs", 4],
  [0xbe, "aby", 4, true],
]);
defineInstruction("STX", [
  [0x86, "zp", 3],
  [0x96, "zpy", 4],
  [0x8e, "abs", 4],
]);
defineInstruction("LDY", [
  [0xa0, "imm", 2],
  [0xa4, "zp", 3],
  [0xb4, "zpx", 4],
  [0xac, "abs", 4],
  [0xbc, "abx", 4, true],
]);
defineInstruction("STY", [
  [0x84, "zp", 3],
  [0x94, "zpx", 4],
  [0x8c, "abs", 4],
]);

// Transfer
defineInstruction("TAX", [[0xaa, "imp", 2]]);
defineInstruction("TXA", [[0x8a, "imp", 2]]);
defineInstruction("TAY", [[0xa8, "imp", 2]]);
defineInstruction("TYA", [[0x98, "imp", 2]]);

// Arithmetic
defineInstruction("ADC", [
  [0x69, "imm", 2],
  [0x65, "zp", 3],
  [0x75, "zpx", 4],
  [0x6d, "abs", 4],
  [0x7d, "abx", 4, true],
  [0x79, "aby", 4, true],
  [0x61, "izx", 6],
  [0x71, "izy", 5, true],
]);
defineInstruction("SBC", [
  [0xe9, "imm", 2],
  [0xe5, "zp", 3],
  [0xf5, "zpx", 4],
  [0xed, "abs", 4],
  [0xfd, "abx", 4, true],
  [0xf9, "aby", 4, true],
  [0xe1, "izx", 6],
  [0xf1, "izy", 5, true],
]);
defineInstruction("INC", [
  [0xe6, "zp", 5],
  [0xf6, "zpx", 6],
  [0xee, "abs", 6],
  [0xfe, "abx", 7],
]);
defineInstruction("DEC", [
  [0xc6, "zp", 5],
  [0xd6, "zpx", 6],
  [0xce, "abs", 6],
  [0xde, "abx", 7],
]);
defineInstruction("INX", [[0xe8, "imp", 2]]);
defineInstruction("DEX", [[0xca, "imp", 2]]);
defineInstruction("INY", [[0xc8, "imp", 2]]);
defineInstruction("DEY", [[0x88, "imp", 2]]);

// Shift
defineInstruction("ASL", [
  [0x0a, "acc", 2],
  [0x06, "zp", 5],
  [0x16, "zpx", 6],
  [0x0e, "abs", 6],
  [0x1e, "abx", 7],
]);
defineInstruction("LSR", [
  [0x4a, "acc", 2],
  [0x46, "zp", 5],
  [0x56, "zpx", 6],
  [0x4e, "abs", 6],
  [0x5e, "abx", 7],
]);
defineInstruction("ROL", [
  [0x2a, "acc", 2],
  [0x26, "zp", 5],
  [0x36, "zpx", 6],
  [0x2e, "abs", 6],
  [0x3e, "abx", 7],
]);
defineInstruction("ROR", [
  [0x6a, "acc", 2],
  [0x66, "zp", 5],
  [0x76, "zpx", 6],
  [0x6e, "abs", 6],
  [0x7e, "abx", 7],
]);

// Bitwise
defineInstruction("AND", [
  [0x29, "imm", 2],
  [0x25, "zp", 3],
  [0x35, "zpx", 4],
  [0x2d, "abs", 4],
  [0x3d, "abx", 4, true],
  [0x39, "aby", 4, true],
  [0x21, "izx", 6],
  [0x31, "izy", 5, true],
]);
defineInstruction("ORA", [
  [0x09, "imm", 2],
  [0x05, "zp", 3],
  [0x15, "zpx", 4],
  [0x0d, "abs", 4],
  [0x1d, "abx", 4, true],
  [0x19, "aby", 4, true],
  [0x01, "izx", 6],
  [0x11, "izy", 5, true],
]);
defineInstruction("EOR", [
  [0x49, "imm", 2],
  [0x45, "zp", 3],
  [0x55, "zpx", 4],
  [0x4d, "abs", 4],
  [0x5d, "abx", 4, true],
  [0x59, "aby", 4, true],
  [0x41, "izx", 6],
  [0x51, "izy", 5, true],
]);
defineInstruction("BIT", [
  [0x24, "zp", 3],
  [0x2c, "abs", 4],
]);

// Compare
defineInstruction("CMP", [
  [0xc9, "imm", 2],
  [0xc5, "zp", 3],
  [0xd5, "zpx", 4],
  [0xcd, "abs", 4],
  [0xdd, "abx", 4, true],
  [0xd9, "aby", 4, true],
  [0xc1, "izx", 6],
  [0xd1, "izy", 5, true],
]);
defineInstruction("CPX", [
  [0xe0, "imm", 2],
  [0xe4, "zp", 3],
  [0xec, "abs", 4],
]);
defineInstruction("CPY", [
  [0xc0, "imm", 2],
  [0xc4, "zp", 3],
  [0xcc, "abs", 4],
]);

// Branch
// The branch instructions take +1 cycle if the branch is taken, and an additional +1 cycle if the branch crosses a page boundary.
// The extra cycle on page crossing is calculated in Cpu.branch(), so we don't need to include it in the instruction definition here.
defineInstruction("BCC", [[0x90, "rel", 2]]);
defineInstruction("BCS", [[0xb0, "rel", 2]]);
defineInstruction("BEQ", [[0xf0, "rel", 2]]);
defineInstruction("BNE", [[0xd0, "rel", 2]]);
defineInstruction("BPL", [[0x10, "rel", 2]]);
defineInstruction("BMI", [[0x30, "rel", 2]]);
defineInstruction("BVC", [[0x50, "rel", 2]]);
defineInstruction("BVS", [[0x70, "rel", 2]]);

// Jump
defineInstruction("JMP", [
  [0x4c, "abs", 3],
  [0x6c, "ind", 5],
]);
defineInstruction("JSR", [[0x20, "abs", 6]]);
defineInstruction("RTS", [[0x60, "imp", 6]]);
defineInstruction("BRK", [[0x00, "imp", 7]]);
defineInstruction("RTI", [[0x40, "imp", 6]]);

// Stack
defineInstruction("PHA", [[0x48, "imp", 3]]);
defineInstruction("PLA", [[0x68, "imp", 4]]);
defineInstruction("PHP", [[0x08, "imp", 3]]);
defineInstruction("PLP", [[0x28, "imp", 4]]);
defineInstruction("TXS", [[0x9a, "imp", 2]]);
defineInstruction("TSX", [[0xba, "imp", 2]]);

// Flags
defineInstruction("CLC", [[0x18, "imp", 2]]);
defineInstruction("SEC", [[0x38, "imp", 2]]);
defineInstruction("CLI", [[0x58, "imp", 2]]);
defineInstruction("SEI", [[0x78, "imp", 2]]);
defineInstruction("CLD", [[0xd8, "imp", 2]]);
defineInstruction("SED", [[0xf8, "imp", 2]]);
defineInstruction("CLV", [[0xb8, "imp", 2]]);

// Other
defineInstruction("NOP", [[0xea, "imp", 2]]);

export const INSTRUCTIONS: ReadonlyArray<Instruction | undefined> = Object.freeze(opcodeTable);
