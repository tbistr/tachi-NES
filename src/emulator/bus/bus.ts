import type { Apu } from "../apu/apu";
import type { Cartridge } from "../cartridge/cartridge";
import type { Controller } from "../input/controller";
import type { Ppu } from "../ppu/ppu";

export class Bus {
  private readonly ram = new Uint8Array(0x800);
  private readonly cartridge: Cartridge;
  private readonly ppu: Ppu;
  private readonly apu: Apu;
  private readonly controller: Controller;
  constructor(cartridge: Cartridge, ppu: Ppu, apu: Apu, controller: Controller) {
    this.cartridge = cartridge;
    this.ppu = ppu;
    this.apu = apu;
    this.controller = controller;
  }
  read(address: number) {
    const mapped = this.cartridge.mapper.cpuRead(address);
    if (mapped !== undefined) return mapped;
    if (address < 0x2000) return this.ram[address & 0x7ff];
    if (address < 0x4000) return this.ppu.cpuRead(address & 7);
    if (address === 0x4015) return this.apu.cpuRead(address);
    if (address === 0x4016) return this.controller.read();
    return 0;
  }
  write(address: number, value: number) {
    if (this.cartridge.mapper.cpuWrite(address, value)) return;
    if (address < 0x2000) this.ram[address & 0x7ff] = value;
    else if (address < 0x4000) this.ppu.cpuWrite(address & 7, value);
    else if (address === 0x4016) this.controller.write(value);
    else if (address <= 0x4017) this.apu.cpuWrite(address, value);
  }
}
