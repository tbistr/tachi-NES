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

/** Returns the encoded instruction length for an addressing mode. */
export function instructionBytes(mode: AddressingMode) {
  return bytesByAddressingMode[mode];
}

type OpcodeDefinition = readonly [opcode: number, mode: AddressingMode];

const opcodeTable: Array<Instruction | undefined> = new Array(256);

/** Registers every opcode variant for an official 6502 instruction. */
function defineInstruction(operation: Operation, definitions: readonly OpcodeDefinition[]) {
  for (const [opcode, mode] of definitions) {
    if (opcodeTable[opcode]) throw new Error("Duplicate opcode");
    opcodeTable[opcode] = { operation, mode };
  }
}

// See below for the full list of official 6502 addressing modes and instructions.
// https://www.nesdev.org/wiki/CPU_addressing_modes
// https://www.nesdev.org/wiki/Instruction_reference

// Access
defineInstruction("LDA", [
  [0xa9, "imm"],
  [0xa5, "zp"],
  [0xb5, "zpx"],
  [0xad, "abs"],
  [0xbd, "abx"],
  [0xb9, "aby"],
  [0xa1, "izx"],
  [0xb1, "izy"],
]);
defineInstruction("STA", [
  [0x85, "zp"],
  [0x95, "zpx"],
  [0x8d, "abs"],
  [0x9d, "abx"],
  [0x99, "aby"],
  [0x81, "izx"],
  [0x91, "izy"],
]);
defineInstruction("LDX", [
  [0xa2, "imm"],
  [0xa6, "zp"],
  [0xb6, "zpy"],
  [0xae, "abs"],
  [0xbe, "aby"],
]);
defineInstruction("STX", [
  [0x86, "zp"],
  [0x96, "zpy"],
  [0x8e, "abs"],
]);
defineInstruction("LDY", [
  [0xa0, "imm"],
  [0xa4, "zp"],
  [0xb4, "zpx"],
  [0xac, "abs"],
  [0xbc, "abx"],
]);
defineInstruction("STY", [
  [0x84, "zp"],
  [0x94, "zpx"],
  [0x8c, "abs"],
]);

// Transfer
defineInstruction("TAX", [[0xaa, "imp"]]);
defineInstruction("TXA", [[0x8a, "imp"]]);
defineInstruction("TAY", [[0xa8, "imp"]]);
defineInstruction("TYA", [[0x98, "imp"]]);

// Arithmetic
defineInstruction("ADC", [
  [0x69, "imm"],
  [0x65, "zp"],
  [0x75, "zpx"],
  [0x6d, "abs"],
  [0x7d, "abx"],
  [0x79, "aby"],
  [0x61, "izx"],
  [0x71, "izy"],
]);
defineInstruction("SBC", [
  [0xe9, "imm"],
  [0xe5, "zp"],
  [0xf5, "zpx"],
  [0xed, "abs"],
  [0xfd, "abx"],
  [0xf9, "aby"],
  [0xe1, "izx"],
  [0xf1, "izy"],
]);
defineInstruction("INC", [
  [0xe6, "zp"],
  [0xf6, "zpx"],
  [0xee, "abs"],
  [0xfe, "abx"],
]);
defineInstruction("DEC", [
  [0xc6, "zp"],
  [0xd6, "zpx"],
  [0xce, "abs"],
  [0xde, "abx"],
]);
defineInstruction("INX", [[0xe8, "imp"]]);
defineInstruction("DEX", [[0xca, "imp"]]);
defineInstruction("INY", [[0xc8, "imp"]]);
defineInstruction("DEY", [[0x88, "imp"]]);

// Shift
defineInstruction("ASL", [
  [0x0a, "acc"],
  [0x06, "zp"],
  [0x16, "zpx"],
  [0x0e, "abs"],
  [0x1e, "abx"],
]);
defineInstruction("LSR", [
  [0x4a, "acc"],
  [0x46, "zp"],
  [0x56, "zpx"],
  [0x4e, "abs"],
  [0x5e, "abx"],
]);
defineInstruction("ROL", [
  [0x2a, "acc"],
  [0x26, "zp"],
  [0x36, "zpx"],
  [0x2e, "abs"],
  [0x3e, "abx"],
]);
defineInstruction("ROR", [
  [0x6a, "acc"],
  [0x66, "zp"],
  [0x76, "zpx"],
  [0x6e, "abs"],
  [0x7e, "abx"],
]);

// Bitwise
defineInstruction("AND", [
  [0x29, "imm"],
  [0x25, "zp"],
  [0x35, "zpx"],
  [0x2d, "abs"],
  [0x3d, "abx"],
  [0x39, "aby"],
  [0x21, "izx"],
  [0x31, "izy"],
]);
defineInstruction("ORA", [
  [0x09, "imm"],
  [0x05, "zp"],
  [0x15, "zpx"],
  [0x0d, "abs"],
  [0x1d, "abx"],
  [0x19, "aby"],
  [0x01, "izx"],
  [0x11, "izy"],
]);
defineInstruction("EOR", [
  [0x49, "imm"],
  [0x45, "zp"],
  [0x55, "zpx"],
  [0x4d, "abs"],
  [0x5d, "abx"],
  [0x59, "aby"],
  [0x41, "izx"],
  [0x51, "izy"],
]);
defineInstruction("BIT", [
  [0x24, "zp"],
  [0x2c, "abs"],
]);

// Compare
defineInstruction("CMP", [
  [0xc9, "imm"],
  [0xc5, "zp"],
  [0xd5, "zpx"],
  [0xcd, "abs"],
  [0xdd, "abx"],
  [0xd9, "aby"],
  [0xc1, "izx"],
  [0xd1, "izy"],
]);
defineInstruction("CPX", [
  [0xe0, "imm"],
  [0xe4, "zp"],
  [0xec, "abs"],
]);
defineInstruction("CPY", [
  [0xc0, "imm"],
  [0xc4, "zp"],
  [0xcc, "abs"],
]);

// Branch timing is determined by the CPU state machine after evaluating the condition and target.
defineInstruction("BCC", [[0x90, "rel"]]);
defineInstruction("BCS", [[0xb0, "rel"]]);
defineInstruction("BEQ", [[0xf0, "rel"]]);
defineInstruction("BNE", [[0xd0, "rel"]]);
defineInstruction("BPL", [[0x10, "rel"]]);
defineInstruction("BMI", [[0x30, "rel"]]);
defineInstruction("BVC", [[0x50, "rel"]]);
defineInstruction("BVS", [[0x70, "rel"]]);

// Jump
defineInstruction("JMP", [
  [0x4c, "abs"],
  [0x6c, "ind"],
]);
defineInstruction("JSR", [[0x20, "abs"]]);
defineInstruction("RTS", [[0x60, "imp"]]);
defineInstruction("BRK", [[0x00, "imp"]]);
defineInstruction("RTI", [[0x40, "imp"]]);

// Stack
defineInstruction("PHA", [[0x48, "imp"]]);
defineInstruction("PLA", [[0x68, "imp"]]);
defineInstruction("PHP", [[0x08, "imp"]]);
defineInstruction("PLP", [[0x28, "imp"]]);
defineInstruction("TXS", [[0x9a, "imp"]]);
defineInstruction("TSX", [[0xba, "imp"]]);

// Flags
defineInstruction("CLC", [[0x18, "imp"]]);
defineInstruction("SEC", [[0x38, "imp"]]);
defineInstruction("CLI", [[0x58, "imp"]]);
defineInstruction("SEI", [[0x78, "imp"]]);
defineInstruction("CLD", [[0xd8, "imp"]]);
defineInstruction("SED", [[0xf8, "imp"]]);
defineInstruction("CLV", [[0xb8, "imp"]]);

// Other
defineInstruction("NOP", [[0xea, "imp"]]);

export const INSTRUCTIONS: ReadonlyArray<Instruction | undefined> = Object.freeze(opcodeTable);
