export type InesImage = {
  mapperId: number;
  mirroring: "horizontal" | "vertical";
  prg: Uint8Array;
  chr: Uint8Array;
  chrIsRam: boolean;
};

export function parseInes(data: ArrayBuffer): InesImage {
  const bytes = new Uint8Array(data);
  if (
    bytes.length < 16 ||
    bytes[0] !== 0x4e ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x53 ||
    bytes[3] !== 0x1a
  ) {
    throw new Error("iNES 形式の ROM ではありません");
  }
  const prgSize = bytes[4] * 0x4000;
  const chrSize = bytes[5] * 0x2000;
  const flags6 = bytes[6];
  const mapperId = (flags6 >> 4) | (bytes[7] & 0xf0);
  const offset = 16 + ((flags6 & 0x04) !== 0 ? 512 : 0);
  if (prgSize === 0 || bytes.length < offset + prgSize + chrSize)
    throw new Error("ROM データが途中で切れています");
  return {
    mapperId,
    mirroring: (flags6 & 1) !== 0 ? "vertical" : "horizontal",
    prg: bytes.slice(offset, offset + prgSize),
    chr:
      chrSize === 0
        ? new Uint8Array(0x2000)
        : bytes.slice(offset + prgSize, offset + prgSize + chrSize),
    chrIsRam: chrSize === 0,
  };
}
