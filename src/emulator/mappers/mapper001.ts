import type { Mapper } from "./mapper";

// MMC1 の差し替え地点。バンクレジスタとシリアル書き込みをここに実装する。
export class Mapper001 implements Mapper {
  cpuRead(_address: number) {
    return undefined;
  }
  cpuWrite(_address: number, _value: number) {
    return false;
  }
  ppuRead(_address: number) {
    return undefined;
  }
  ppuWrite(_address: number, _value: number) {
    return false;
  }
}
