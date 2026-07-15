export interface Mapper {
  cpuRead(address: number): number | undefined;
  cpuWrite(address: number, value: number): boolean;
  ppuRead(address: number): number | undefined;
  ppuWrite(address: number, value: number): boolean;
}
