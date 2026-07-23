import { describe, expect, test } from "vitest";
import { assemble, disassemble } from "../asm";

describe("6502 assembler", () => {
  test("assembles the addressing modes used by CPU scenarios", () => {
    expect(
      assemble(`
        LDA #$42
        STA $10
        LDX #1
        LDA $f0,X
        LDA $20ff,Y
        LDA ($20,X)
        LDA ($20),Y
        JMP ($30ff)
        ASL A
        RTS
      `),
    ).toEqual([
      0xa9, 0x42, 0x85, 0x10, 0xa2, 0x01, 0xb5, 0xf0, 0xb9, 0xff, 0x20, 0xa1, 0x20, 0xb1, 0x20,
      0x6c, 0xff, 0x30, 0x0a, 0x60,
    ]);
  });

  test("resolves forward and backward branch labels", () => {
    expect(
      assemble(`
        loop: INX
        BNE loop
        BEQ done
        .byte $ea
        done: RTS
      `),
    ).toEqual([0xe8, 0xd0, 0xfd, 0xf0, 0x01, 0xea, 0x60]);
  });

  test("keeps forward-label instruction sizes stable", () => {
    expect(
      assemble(
        `
          LDA value
          value: .byte $42
        `,
        0,
      ),
    ).toEqual([0xad, 0x03, 0x00, 0x42]);
  });

  test("reports invalid programs with their source line", () => {
    expect(() => assemble("LDA #$100")).toThrow("assembly line 1: imm operand out of range");
    expect(() => assemble("BNE $9000")).toThrow("assembly line 1: branch target is out of range");
    expect(() => assemble("wat")).toThrow("assembly line 1: unknown operation WAT");
  });
});

describe("6502 disassembler", () => {
  test("formats every official addressing mode", () => {
    const bytes = [
      0xa9, 0x42, 0x85, 0x10, 0xb5, 0xf0, 0xb6, 0xf0, 0xad, 0xff, 0x20, 0xbd, 0xff, 0x20, 0xb9,
      0xff, 0x20, 0xa1, 0x20, 0xb1, 0x20, 0x6c, 0xff, 0x30, 0x0a, 0xd0, 0x05, 0x60,
    ];

    expect(disassemble(bytes).map((line) => line.text)).toEqual([
      "LDA #$42",
      "STA $10",
      "LDA $f0,X",
      "LDX $f0,Y",
      "LDA $20ff",
      "LDA $20ff,X",
      "LDA $20ff,Y",
      "LDA ($20,X)",
      "LDA ($20),Y",
      "JMP ($30ff)",
      "ASL A",
      "BNE $8020",
      "RTS",
    ]);
  });

  test("preserves addresses and emits unknown or incomplete opcodes as data", () => {
    const lines = disassemble([0xea, 0x02, 0x4c, 0x34], 0xfffc);

    expect(lines.map(({ address, bytes, text }) => ({ address, bytes, text }))).toEqual([
      { address: 0xfffc, bytes: [0xea], text: "NOP" },
      { address: 0xfffd, bytes: [0x02], text: ".byte $02" },
      { address: 0xfffe, bytes: [0x4c], text: ".byte $4c" },
      { address: 0xffff, bytes: [0x34], text: ".byte $34" },
    ]);
    expect(lines[0].instruction).toMatchObject({
      operation: "NOP",
      mode: "imp",
    });
  });

  test("wraps branch targets at the end of the address space", () => {
    expect(disassemble([0xd0, 0x00], 0xfffe)[0].text).toBe("BNE $0000");
  });
});
