import {
  INSTRUCTIONS,
  type AddressingMode,
  type Instruction,
  type Operation,
} from "./instructions";

type SourceLine = {
  line: number;
  address: number;
  operation?: Operation;
  mode?: AddressingMode;
  operand: string;
  data?: string[];
};

const branches = new Set<Operation>(["BCC", "BCS", "BEQ", "BMI", "BNE", "BPL", "BVC", "BVS"]);
const opcodes = new Map<string, number>();
for (let opcode = 0; opcode < INSTRUCTIONS.length; opcode++) {
  const instruction = INSTRUCTIONS[opcode];
  if (instruction) opcodes.set(`${instruction.operation}:${instruction.mode}`, opcode);
}

function fail(line: number, message: string): never {
  throw new Error(`assembly line ${line}: ${message}`);
}

function valueOf(expression: string, labels: ReadonlyMap<string, number>) {
  const value = expression.trim();
  if (/^\$[\da-f]+$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  if (/^0x[\da-f]+$/i.test(value)) return Number.parseInt(value.slice(2), 16);
  if (/^%[01]+$/.test(value)) return Number.parseInt(value.slice(1), 2);
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return labels.get(value);
}

function opcodeFor(operation: Operation, mode: AddressingMode) {
  return opcodes.get(`${operation}:${mode}`);
}

function indexedMode(
  operation: Operation,
  value: number | undefined,
  zeroPage: "zpx" | "zpy",
  absolute: "abx" | "aby",
): AddressingMode {
  if (value !== undefined && value <= 0xff && opcodeFor(operation, zeroPage) !== undefined)
    return zeroPage;
  return opcodeFor(operation, absolute) !== undefined ? absolute : zeroPage;
}

function modeOf(
  operation: Operation,
  operand: string,
  labels: ReadonlyMap<string, number>,
): AddressingMode {
  if (branches.has(operation)) return "rel";
  if (!operand) return opcodeFor(operation, "imp") !== undefined ? "imp" : "acc";
  if (operand.toUpperCase() === "A") return "acc";
  if (operand.startsWith("#")) return "imm";
  if (/^\(.+,\s*X\)$/i.test(operand)) return "izx";
  if (/^\(.+\),\s*Y$/i.test(operand)) return "izy";
  if (/^\(.+\)$/i.test(operand)) return "ind";
  const x = operand.match(/^(.+),\s*X$/i);
  if (x) return indexedMode(operation, valueOf(x[1], labels), "zpx", "abx");
  const y = operand.match(/^(.+),\s*Y$/i);
  if (y) return indexedMode(operation, valueOf(y[1], labels), "zpy", "aby");
  const value = valueOf(operand, labels);
  if (value !== undefined && value <= 0xff && opcodeFor(operation, "zp") !== undefined) return "zp";
  return opcodeFor(operation, "abs") !== undefined ? "abs" : "zp";
}

function expressionOf(mode: AddressingMode, operand: string) {
  if (mode === "imm") return operand.slice(1);
  if (mode === "izx") return operand.slice(1).replace(/,\s*X\)$/i, "");
  if (mode === "izy") return operand.slice(1).replace(/\),\s*Y$/i, "");
  if (mode === "ind") return operand.slice(1, -1);
  if (mode === "zpx" || mode === "abx") return operand.replace(/,\s*X$/i, "");
  if (mode === "zpy" || mode === "aby") return operand.replace(/,\s*Y$/i, "");
  return operand;
}

function parse(source: string, origin: number) {
  const labels = new Map<string, number>();
  const lines: SourceLine[] = [];
  let address = origin;
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = index + 1;
    let text = original.replace(/;.*/, "").trim();
    if (!text) continue;
    const label = text.match(/^([A-Za-z_][\w]*):/);
    if (label) {
      if (labels.has(label[1])) fail(line, `duplicate label ${label[1]}`);
      labels.set(label[1], address);
      text = text.slice(label[0].length).trim();
      if (!text) continue;
    }
    if (/^\.byte(?:\s|$)/i.test(text)) {
      const data = text
        .replace(/^\.byte\s*/i, "")
        .split(",")
        .map((part) => part.trim());
      if (data.some((part) => !part)) fail(line, "invalid .byte directive");
      lines.push({ line, address, operand: "", data });
      address += data.length;
    } else {
      const match = text.match(/^([A-Za-z]{3})(?:\s+(.+))?$/);
      if (!match) fail(line, `cannot parse ${JSON.stringify(text)}`);
      const operation = match[1].toUpperCase() as Operation;
      const operand = match[2]?.trim() ?? "";
      if (![...opcodes.keys()].some((key) => key.startsWith(`${operation}:`)))
        fail(line, `unknown operation ${operation}`);
      const mode = modeOf(operation, operand, labels);
      const opcode = opcodeFor(operation, mode);
      if (opcode === undefined) fail(line, `${operation} does not support ${mode} addressing`);
      lines.push({ line, address, operation, mode, operand });
      address += INSTRUCTIONS[opcode]!.bytes;
    }
    if (address > 0x10000) fail(line, "program exceeds the 16-bit address space");
  }
  return { lines, labels };
}

function requiredValue(expression: string, labels: ReadonlyMap<string, number>, line: number) {
  const value = valueOf(expression, labels);
  if (value === undefined) fail(line, `unknown label or value ${JSON.stringify(expression)}`);
  if (value < 0 || value > 0xffff) fail(line, `value out of range: ${expression}`);
  return value;
}

/** Assembles source code containing official NMOS 6502 instructions. */
export function assemble(source: string, origin = 0x8000): number[] {
  if (!Number.isInteger(origin) || origin < 0 || origin > 0xffff)
    throw new Error(`invalid assembly origin ${origin}`);
  const { lines, labels } = parse(source, origin);
  const result: number[] = [];
  for (const sourceLine of lines) {
    if (sourceLine.data) {
      for (const expression of sourceLine.data) {
        const value = requiredValue(expression, labels, sourceLine.line);
        if (value > 0xff) fail(sourceLine.line, `.byte value out of range: ${expression}`);
        result.push(value);
      }
      continue;
    }
    const operation = sourceLine.operation!;
    const mode = sourceLine.mode!;
    const opcode = opcodeFor(operation, mode);
    if (opcode === undefined)
      fail(sourceLine.line, `${operation} does not support ${mode} addressing`);
    result.push(opcode);
    if (mode === "imp" || mode === "acc") continue;
    const expression = expressionOf(mode, sourceLine.operand);
    const value = requiredValue(expression, labels, sourceLine.line);
    if (mode === "rel") {
      let offset = (value - ((sourceLine.address + 2) & 0xffff)) & 0xffff;
      if (offset >= 0x8000) offset -= 0x10000;
      if (offset < -128 || offset > 127)
        fail(sourceLine.line, `branch target is out of range: ${sourceLine.operand}`);
      result.push(offset & 0xff);
    } else if (["imm", "zp", "zpx", "zpy", "izx", "izy"].includes(mode)) {
      if (value > 0xff)
        fail(sourceLine.line, `${mode} operand out of range: ${sourceLine.operand}`);
      result.push(value);
    } else {
      result.push(value & 0xff, value >> 8);
    }
  }
  return result;
}

export type DisassembledLine = {
  address: number;
  bytes: number[];
  text: string;
  instruction?: Instruction;
};

function hex(value: number, width: number) {
  return `$${value.toString(16).padStart(width, "0")}`;
}

function disassembledOperand(mode: AddressingMode, lo: number, hi: number, address: number) {
  const byte = hex(lo, 2);
  const word = hex(lo | (hi << 8), 4);
  switch (mode) {
    case "imp":
      return "";
    case "acc":
      return "A";
    case "imm":
      return `#${byte}`;
    case "zp":
      return byte;
    case "zpx":
      return `${byte},X`;
    case "zpy":
      return `${byte},Y`;
    case "abs":
      return word;
    case "abx":
      return `${word},X`;
    case "aby":
      return `${word},Y`;
    case "ind":
      return `(${word})`;
    case "izx":
      return `(${byte},X)`;
    case "izy":
      return `(${byte}),Y`;
    case "rel": {
      const offset = lo < 0x80 ? lo : lo - 0x100;
      return hex((address + 2 + offset) & 0xffff, 4);
    }
  }
}

/** Disassembles a contiguous block of official NMOS 6502 machine code. */
export function disassemble(data: ArrayLike<number>, origin = 0x8000): DisassembledLine[] {
  if (!Number.isInteger(origin) || origin < 0 || origin > 0xffff)
    throw new Error(`invalid disassembly origin ${origin}`);
  if (data.length > 0x10000 - origin)
    throw new Error("machine code exceeds the 16-bit address space");

  const lines: DisassembledLine[] = [];
  for (let offset = 0; offset < data.length;) {
    const address = origin + offset;
    const opcode = data[offset] & 0xff;
    const instruction = INSTRUCTIONS[opcode];
    if (!instruction || offset + instruction.bytes > data.length) {
      lines.push({ address, bytes: [opcode], text: `.byte ${hex(opcode, 2)}` });
      offset++;
      continue;
    }

    const bytes = Array.from(
      { length: instruction.bytes },
      (_, index) => data[offset + index] & 0xff,
    );
    const operand = disassembledOperand(instruction.mode, bytes[1] ?? 0, bytes[2] ?? 0, address);
    lines.push({
      address,
      bytes,
      text: operand ? `${instruction.operation} ${operand}` : instruction.operation,
      instruction,
    });
    offset += instruction.bytes;
  }
  return lines;
}
