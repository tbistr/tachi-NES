import { describe, expect, test } from "vitest";
import { CpuFlag, type CpuState } from "../cpu";
import { cpuWithAsm, type TestMemory } from "./cpuTestUtils";

type CpuFixture = ReturnType<typeof cpuWithAsm>;

/** Advances a fixture by an exact number of CPU clocks. */
function clockTimes({ cpu }: CpuFixture, clocks: number) {
  for (let clock = 0; clock < clocks; clock++) cpu.clock();
}

/** Verifies that a JSON-round-tripped mid-sequence state resumes identically. */
function expectRoundTrip({ cpu, memory }: CpuFixture) {
  const saved = JSON.parse(JSON.stringify(cpu.saveState())) as CpuState;
  const memoryBefore = memory.data.slice();

  memory.clearTrace();
  cpu.step();
  const expectedState = cpu.saveState();
  const expectedAccesses = [...memory.accesses];
  const expectedMemory = memory.data.slice();

  cpu.loadState(saved);
  memory.data.set(memoryBefore);
  memory.clearTrace();
  cpu.step();

  expect(memory.accesses).toEqual(expectedAccesses);
  expect(memory.data).toEqual(expectedMemory);
  expect(cpu.saveState()).toEqual(expectedState);
  return saved;
}

/** Sets an interrupt vector in test memory. */
function setVector(memory: TestMemory, vector: number, target = 0x9000) {
  memory.data[vector] = target & 0xff;
  memory.data[vector + 1] = target >> 8;
}

describe("serializable CPU in-flight state", () => {
  test("round-trips an indexed page-cross read", () => {
    const fixture = cpuWithAsm("LDX #$01\nLDA $20ff,X");
    fixture.memory.data[0x2100] = 0x42;
    fixture.cpu.step();
    clockTimes(fixture, 3);

    const saved = expectRoundTrip(fixture);
    expect(saved.execution).toMatchObject({
      kind: "instruction",
      opcode: 0xbd,
      operation: "LDA",
      mode: "abx",
      cycle: 3,
      address: 0x2100,
      provisionalAddress: 0x2000,
      pageCrossed: true,
    });
  });

  test("round-trips an indexed read-modify-write instruction", () => {
    const fixture = cpuWithAsm("LDX #$01\nINC $20ff,X");
    fixture.memory.data[0x2100] = 0x41;
    fixture.cpu.step();
    clockTimes(fixture, 5);

    const saved = expectRoundTrip(fixture);
    expect(saved.execution).toMatchObject({
      kind: "instruction",
      operation: "INC",
      cycle: 5,
      data: 0x41,
    });
  });

  test("round-trips RESET entry", () => {
    const fixture = cpuWithAsm("NOP");
    setVector(fixture.memory, 0xfffc, 0x1234);
    fixture.cpu.powerOn();
    clockTimes(fixture, 4);

    const saved = expectRoundTrip(fixture);
    expect(saved.execution).toMatchObject({ kind: "reset", cycle: 4 });
  });

  test.each([["IRQ", 0xfffe] as const, ["NMI", 0xfffa] as const])(
    "round-trips %s entry",
    (kind, vector) => {
      const fixture = cpuWithAsm("NOP");
      setVector(fixture.memory, vector);
      if (kind === "IRQ") {
        fixture.cpu.status &= ~CpuFlag.interrupt;
        fixture.cpu.requestIrq();
      } else {
        fixture.cpu.requestNmi();
      }
      clockTimes(fixture, 4);

      const saved = expectRoundTrip(fixture);
      expect(saved.execution).toMatchObject({
        kind: kind.toLowerCase(),
        cycle: 4,
        vector,
      });
    },
  );

  test("round-trips BRK entry", () => {
    const fixture = cpuWithAsm("BRK");
    setVector(fixture.memory, 0xfffe, 0x1234);
    clockTimes(fixture, 4);

    const saved = expectRoundTrip(fixture);
    expect(saved.execution).toMatchObject({
      kind: "instruction",
      operation: "BRK",
      cycle: 4,
    });
  });

  test("round-trips RTI", () => {
    const fixture = cpuWithAsm("RTI");
    fixture.cpu.sp = 0xfa;
    fixture.memory.data[0x01fb] = CpuFlag.negative;
    fixture.memory.data[0x01fc] = 0x34;
    fixture.memory.data[0x01fd] = 0x12;
    clockTimes(fixture, 3);

    const saved = expectRoundTrip(fixture);
    expect(saved.execution).toMatchObject({
      kind: "instruction",
      operation: "RTI",
      cycle: 3,
    });
  });
});
