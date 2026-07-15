export type NesButton = "a" | "b" | "select" | "start" | "up" | "down" | "left" | "right";
const buttons: NesButton[] = ["a", "b", "select", "start", "up", "down", "left", "right"];

export class Controller {
  private state = 0;
  private shift = 0;
  private strobe = false;
  setButton(button: NesButton, pressed: boolean) {
    const mask = 1 << buttons.indexOf(button);
    this.state = pressed ? this.state | mask : this.state & ~mask;
  }
  write(value: number) {
    this.strobe = (value & 1) !== 0;
    if (this.strobe) this.shift = this.state;
  }
  read() {
    if (this.strobe) this.shift = this.state;
    const value = this.shift & 1;
    this.shift = (this.shift >> 1) | 0x80;
    return value | 0x40;
  }
}
