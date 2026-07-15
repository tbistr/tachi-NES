import type { Cartridge } from "../cartridge/cartridge";
import { NES_PALETTE } from "./palette";

export class Ppu {
  readonly frame = new Uint32Array(256 * 240);
  private cycle = 0;
  private scanline = 0;
  private frameComplete = false;
  private readonly cartridge: Cartridge;
  constructor(cartridge: Cartridge) {
    this.cartridge = cartridge;
  }
  clock() {
    if (++this.cycle < 341) return;
    this.cycle = 0;
    if (++this.scanline < 262) return;
    this.scanline = 0;
    this.renderPatternTable();
    this.frameComplete = true;
  }
  takeFrameComplete() {
    const value = this.frameComplete;
    this.frameComplete = false;
    return value;
  }
  cpuRead(_address: number) {
    return 0;
  }
  cpuWrite(_address: number, _value: number) {}
  private renderPatternTable() {
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 256; x++) {
        const tile = (((y >> 3) * 32 + (x >> 3)) & 0x1ff) * 16;
        const bit = 7 - (x & 7);
        const lo = this.cartridge.mapper.ppuRead(tile + (y & 7)) ?? 0;
        const hi = this.cartridge.mapper.ppuRead(tile + (y & 7) + 8) ?? 0;
        this.frame[y * 256 + x] = NES_PALETTE[(((hi >> bit) & 1) * 2 + ((lo >> bit) & 1)) * 16 + 1];
      }
  }
}
