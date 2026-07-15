export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;
  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D を初期化できません");
    this.context = context;
    this.image = context.createImageData(256, 240);
    context.imageSmoothingEnabled = false;
  }
  draw(frame: Uint32Array) {
    for (let i = 0; i < frame.length; i++) {
      const color = frame[i];
      const offset = i * 4;
      this.image.data[offset] = color >> 16;
      this.image.data[offset + 1] = color >> 8;
      this.image.data[offset + 2] = color;
      this.image.data[offset + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
  }
}
