import { parseInes } from "./ines";
import { Mapper000 } from "../mappers/mapper000";
import type { Mapper } from "../mappers/mapper";

export class Cartridge {
  readonly mapper: Mapper;
  readonly mirroring: "horizontal" | "vertical";
  private constructor(mapper: Mapper, mirroring: "horizontal" | "vertical") {
    this.mapper = mapper;
    this.mirroring = mirroring;
  }

  static fromArrayBuffer(data: ArrayBuffer) {
    const image = parseInes(data);
    if (image.mapperId !== 0)
      throw new Error(`未対応の Mapper です: ${image.mapperId}（現在は NROM のみ）`);
    return new Cartridge(new Mapper000(image.prg, image.chr, image.chrIsRam), image.mirroring);
  }
}
