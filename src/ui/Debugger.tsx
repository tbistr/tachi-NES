import type { Nes } from "../emulator/nes";
export function Debugger({ nes }: { nes?: Nes }) {
  const hex = (value = 0, width = 2) => value.toString(16).toUpperCase().padStart(width, "0");
  return (
    <aside className="debugger">
      <h2>CPU</h2>
      <dl>
        <div>
          <dt>PC</dt>
          <dd>${hex(nes?.cpu.pc, 4)}</dd>
        </div>
        <div>
          <dt>A</dt>
          <dd>${hex(nes?.cpu.a)}</dd>
        </div>
        <div>
          <dt>X</dt>
          <dd>${hex(nes?.cpu.x)}</dd>
        </div>
        <div>
          <dt>Y</dt>
          <dd>${hex(nes?.cpu.y)}</dd>
        </div>
        <div>
          <dt>SP</dt>
          <dd>${hex(nes?.cpu.sp)}</dd>
        </div>
      </dl>
      <p>Keys: Z=B / X=A / Enter=Start / Arrows=D-pad</p>
    </aside>
  );
}
