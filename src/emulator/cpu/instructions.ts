export type Instruction = { name: string; bytes: number; cycles: number };
export const INSTRUCTIONS: Readonly<Record<number, Instruction>> = {
  0x00: { name: "BRK", bytes: 1, cycles: 7 },
  0x4c: { name: "JMP abs", bytes: 3, cycles: 3 },
  0xa9: { name: "LDA #", bytes: 2, cycles: 2 },
  0xea: { name: "NOP", bytes: 1, cycles: 2 },
};
