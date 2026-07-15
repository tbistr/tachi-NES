import { useState } from "react";
import { Nes } from "../emulator/nes";
import { Debugger } from "./Debugger";
import { EmulatorScreen } from "./EmulatorScreen";
import { RomSelector } from "./RomSelector";
import "./app.css";

export default function App() {
  const [nes, setNes] = useState<Nes>();
  const [romName, setRomName] = useState("NO CARTRIDGE");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(true);
  const load = (name: string, data: ArrayBuffer) => {
    try {
      setNes(Nes.fromRom(data));
      setRomName(name);
      setError("");
      setRunning(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ROM を読み込めませんでした");
    }
  };
  return (
    <main>
      <header>
        <div>
          <h1>
            TACHI <em>NES</em>
          </h1>
        </div>
        <div className="cartridge-status">
          <span>CARTRIDGE</span>
          <strong>{romName}</strong>
        </div>
      </header>
      <section className="workspace">
        <div className="console">
          <EmulatorScreen nes={nes} running={running} />
          <div className="controls">
            <RomSelector onLoad={load} error={error} />
            <button disabled={!nes} onClick={() => setRunning((value) => !value)}>
              {running ? "PAUSE" : "PLAY"}
            </button>
          </div>
        </div>
        <Debugger nes={nes} />
      </section>
      <footer>Client-side NES emulator skeleton · ROM data never leaves your browser</footer>
    </main>
  );
}
