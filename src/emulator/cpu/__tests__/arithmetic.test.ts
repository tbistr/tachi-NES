import { describe, test } from "vitest";
import { CpuFlag } from "../cpu";
import { cpuWithAsm } from "./cpuTestUtils";

const relevantFlags = CpuFlag.carry | CpuFlag.zero | CpuFlag.overflow | CpuFlag.negative;

function expectedFlags(result: number, carry: boolean, overflow: boolean) {
  return (
    (carry ? CpuFlag.carry : 0) |
    (result === 0 ? CpuFlag.zero : 0) |
    (overflow ? CpuFlag.overflow : 0) |
    ((result & 0x80) !== 0 ? CpuFlag.negative : 0)
  );
}

function fail(
  operation: string,
  a: number,
  operand: number,
  carry: number,
  actualResult: number,
  expectedResult: number,
  actualFlags: number,
  expectedStatus: number,
): never {
  const hex = (value: number) => `$${value.toString(16).padStart(2, "0")}`;
  throw new Error(
    `${operation} A=${hex(a)} M=${hex(operand)} C=${carry}: ` +
      `result ${hex(actualResult)} != ${hex(expectedResult)} or ` +
      `flags ${hex(actualFlags)} != ${hex(expectedStatus)}`,
  );
}

describe("ADC and SBC", () => {
  test("ADC produces correct result and flags for every input", () => {
    const { cpu, memory } = cpuWithAsm("ADC #$00");
    for (let a = 0; a < 0x100; a++) {
      for (let operand = 0; operand < 0x100; operand++) {
        for (const carry of [0, 1]) {
          cpu.pc = 0x8000;
          cpu.a = a;
          cpu.status = CpuFlag.unused | carry;
          memory.data[0x8001] = operand;
          cpu.step();

          const sum = a + operand + carry;
          const result = sum & 0xff;
          const flags = expectedFlags(
            result,
            sum > 0xff,
            (~(a ^ operand) & (a ^ result) & 0x80) !== 0,
          );
          const actualFlags = cpu.status & relevantFlags;
          if (cpu.a !== result || actualFlags !== flags)
            fail("ADC", a, operand, carry, cpu.a, result, actualFlags, flags);
        }
      }
    }
  });

  test("SBC produces correct result and flags for every input", () => {
    const { cpu, memory } = cpuWithAsm("SBC #$00");
    for (let a = 0; a < 0x100; a++) {
      for (let operand = 0; operand < 0x100; operand++) {
        for (const carry of [0, 1]) {
          cpu.pc = 0x8000;
          cpu.a = a;
          cpu.status = CpuFlag.unused | carry;
          memory.data[0x8001] = operand;
          cpu.step();

          const diff = a - operand - (1 - carry);
          const result = diff & 0xff;
          const flags = expectedFlags(
            result,
            diff >= 0,
            ((a ^ result) & (a ^ operand) & 0x80) !== 0,
          );
          const actualFlags = cpu.status & relevantFlags;
          if (cpu.a !== result || actualFlags !== flags)
            fail("SBC", a, operand, carry, cpu.a, result, actualFlags, flags);
        }
      }
    }
  });
});
