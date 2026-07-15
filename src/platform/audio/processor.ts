declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;
class NesAudioProcessor extends AudioWorkletProcessor {
  process() {
    return true;
  }
}
registerProcessor("nes-audio-processor", NesAudioProcessor);
