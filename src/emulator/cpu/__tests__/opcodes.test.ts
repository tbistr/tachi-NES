import { describe, expect, test } from "vitest";
import { INSTRUCTIONS } from "../instructions";

// Reference: https://www.nesdev.org/wiki/CPU_unofficial_opcodes
// Only the 151 official RP2A03/NMOS 6502 opcodes are populated; '-' is unofficial.
const OPCODES = `
BRK:imp ORA:izx - - - ORA:zp ASL:zp - PHP:imp ORA:imm ASL:acc - - ORA:abs ASL:abs -
BPL:rel ORA:izy - - - ORA:zpx ASL:zpx - CLC:imp ORA:aby - - - ORA:abx ASL:abx -
JSR:abs AND:izx - - BIT:zp AND:zp ROL:zp - PLP:imp AND:imm ROL:acc - BIT:abs AND:abs ROL:abs -
BMI:rel AND:izy - - - AND:zpx ROL:zpx - SEC:imp AND:aby - - - AND:abx ROL:abx -
RTI:imp EOR:izx - - - EOR:zp LSR:zp - PHA:imp EOR:imm LSR:acc - JMP:abs EOR:abs LSR:abs -
BVC:rel EOR:izy - - - EOR:zpx LSR:zpx - CLI:imp EOR:aby - - - EOR:abx LSR:abx -
RTS:imp ADC:izx - - - ADC:zp ROR:zp - PLA:imp ADC:imm ROR:acc - JMP:ind ADC:abs ROR:abs -
BVS:rel ADC:izy - - - ADC:zpx ROR:zpx - SEI:imp ADC:aby - - - ADC:abx ROR:abx -
- STA:izx - - STY:zp STA:zp STX:zp - DEY:imp - TXA:imp - STY:abs STA:abs STX:abs -
BCC:rel STA:izy - - STY:zpx STA:zpx STX:zpy - TYA:imp STA:aby TXS:imp - - STA:abx - -
LDY:imm LDA:izx LDX:imm - LDY:zp LDA:zp LDX:zp - TAY:imp LDA:imm TAX:imp - LDY:abs LDA:abs LDX:abs -
BCS:rel LDA:izy - - LDY:zpx LDA:zpx LDX:zpy - CLV:imp LDA:aby TSX:imp - LDY:abx LDA:abx LDX:aby -
CPY:imm CMP:izx - - CPY:zp CMP:zp DEC:zp - INY:imp CMP:imm DEX:imp - CPY:abs CMP:abs DEC:abs -
BNE:rel CMP:izy - - - CMP:zpx DEC:zpx - CLD:imp CMP:aby - - - CMP:abx DEC:abx -
CPX:imm SBC:izx - - CPX:zp SBC:zp INC:zp - INX:imp SBC:imm NOP:imp - CPX:abs SBC:abs INC:abs -
BEQ:rel SBC:izy - - - SBC:zpx INC:zpx - SED:imp SBC:aby - - - SBC:abx INC:abx -
`
  .trim()
  .split(/\s+/);

describe("official RP2A03 opcode table", () => {
  test("matches all official opcode positions and addressing modes", () => {
    expect(OPCODES).toHaveLength(0x100);
    expect(
      Array.from(INSTRUCTIONS, (instruction) =>
        instruction ? `${instruction.operation}:${instruction.mode}` : "-",
      ),
    ).toEqual(OPCODES);
  });
});
