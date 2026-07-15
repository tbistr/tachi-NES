import { useEffect, useRef } from "react";
import type { Nes } from "../emulator/nes";
import type { NesButton } from "../emulator/input/controller";
import { CanvasRenderer } from "../platform/video/canvasRenderer";

const keys: Record<string, NesButton> = {
  KeyX: "a",
  KeyZ: "b",
  ShiftRight: "select",
  Enter: "start",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
export function EmulatorScreen({ nes, running }: { nes?: Nes; running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!nes || !canvasRef.current) return;
    const renderer = new CanvasRenderer(canvasRef.current);
    let request = 0;
    const loop = () => {
      if (running) renderer.draw(nes.runFrame());
      request = requestAnimationFrame(loop);
    };
    request = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(request);
  }, [nes, running]);
  useEffect(() => {
    if (!nes) return;
    const handle = (pressed: boolean) => (event: KeyboardEvent) => {
      const button = keys[event.code];
      if (button) {
        event.preventDefault();
        nes.setButton(button, pressed);
      }
    };
    const down = handle(true);
    const up = handle(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [nes]);
  return (
    <div className="screen-shell">
      <canvas ref={canvasRef} width="256" height="240" aria-label="NES screen" />
      {!nes && <div className="screen-placeholder">ROM を読み込んでください</div>}
    </div>
  );
}
