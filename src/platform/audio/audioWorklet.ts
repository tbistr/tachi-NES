export async function createAudioWorklet(context: AudioContext) {
  await context.audioWorklet.addModule(new URL("./processor.ts", import.meta.url));
  return new AudioWorkletNode(context, "nes-audio-processor");
}
