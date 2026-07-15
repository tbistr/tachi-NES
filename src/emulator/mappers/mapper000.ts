import type { Mapper } from "./mapper";

export class Mapper000 implements Mapper {
  private readonly prg: Uint8Array;
  private readonly chr: Uint8Array;
  private readonly chrIsRam: boolean;
  constructor(prg: Uint8Array, chr: Uint8Array, chrIsRam: boolean) {
    this.prg = prg;
    this.chr = chr;
    this.chrIsRam = chrIsRam;
  }

  cpuRead(address: number): number | undefined {
    if (address < 0x8000) return undefined;
    return this.prg[(address - 0x8000) % this.prg.length];
  }
  cpuWrite(address: number, _value: number) {
    return address >= 0x8000;
  }
  ppuRead(address: number) {
    return address < 0x2000 ? this.chr[address] : undefined;
  }
  ppuWrite(address: number, value: number) {
    if (address >= 0x2000 || !this.chrIsRam) return false;
    this.chr[address] = value;
    return true;
  }
}
