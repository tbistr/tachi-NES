import { Apu } from "./apu/apu";
import { Bus } from "./bus/bus";
import { Cartridge } from "./cartridge/cartridge";
import { Cpu } from "./cpu/cpu";
import { Controller, type NesButton } from "./input/controller";
import { Ppu } from "./ppu/ppu";

export class Nes {
  readonly cpu: Cpu;
  readonly ppu: Ppu;
  readonly controller = new Controller();
  private readonly apu = new Apu();
  private readonly bus: Bus;
  constructor(cartridge: Cartridge) {
    this.ppu = new Ppu(cartridge);
    this.bus = new Bus(cartridge, this.ppu, this.apu, this.controller);
    this.cpu = new Cpu(this.bus);
    this.cpu.reset();
  }
  static fromRom(data: ArrayBuffer) {
    return new Nes(Cartridge.fromArrayBuffer(data));
  }
  setButton(button: NesButton, pressed: boolean) {
    this.controller.setButton(button, pressed);
  }
  runFrame() {
    do {
      this.ppu.clock();
      this.apu.clock();
      this.ppu.clock();
      this.ppu.clock();
      this.cpu.clock();
    } while (!this.ppu.takeFrameComplete());
    return this.ppu.frame;
  }
}
