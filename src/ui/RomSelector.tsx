type Props = { onLoad: (name: string, data: ArrayBuffer) => void; error?: string };
export function RomSelector({ onLoad, error }: Props) {
  return (
    <div className="rom-selector">
      <label className="rom-button">
        ROM を選択
        <input
          type="file"
          accept=".nes,application/octet-stream"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onLoad(file.name, await file.arrayBuffer());
          }}
        />
      </label>
      <span>.nes / iNES（Mapper 0）</span>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
