export function pageCrossed(a: number, b: number) {
  return (a & 0xff00) !== (b & 0xff00);
}
export function signedOffset(value: number) {
  return value < 0x80 ? value : value - 0x100;
}
