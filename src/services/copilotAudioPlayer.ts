import { copilotText as ct } from '@/lib/copilotI18n';
/** Mono signed 16-bit little-endian PCM, streamed at 24 kHz. */
export class CopilotAudioPlayer {
  private context: AudioContext | null = null;
  private nodes = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private pendingByte: number | null = null;
  private ended = false;
  private status: (playing: boolean) => void;
  constructor(status: (playing: boolean) => void) { this.status = status; }

  // Call directly from a user gesture, before authentication/network awaits.
  async unlock() {
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) throw new Error(ct('unsupportedAudio'));
    this.context ??= new Audio(); // Let the browser resample 24 kHz to the hardware rate.
    await this.context.resume();
    if (!this.context || this.context.state !== 'running') throw new Error(ct('enableAudio'));
  }
  push(buffer: ArrayBuffer) {
    const context = this.context;
    if (!context || this.ended) return;
    if (context.state !== 'running') throw new Error(ct('audioPaused'));
    const incoming = new Uint8Array(buffer);
    const bytes = new Uint8Array(incoming.length + (this.pendingByte === null ? 0 : 1));
    if (this.pendingByte !== null) bytes[0] = this.pendingByte;
    bytes.set(incoming, this.pendingByte === null ? 0 : 1);
    this.pendingByte = bytes.length % 2 ? bytes[bytes.length - 1] : null;
    const samples = Math.floor(bytes.length / 2);
    if (!samples) return;
    if (this.nextTime - context.currentTime + samples / 24000 > 120) throw new Error(ct('audioLimit'));
    const audio = context.createBuffer(1, samples, 24000);
    const channel = audio.getChannelData(0);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    this.nodes.add(source);
    source.onended = () => {
      source.disconnect();
      this.nodes.delete(source);
      if (!this.nodes.size) {
        this.status(false);
        if (this.ended) this.stop();
      }
    };
    const start = Math.max(context.currentTime + 0.025, this.nextTime);
    source.start(start);
    this.nextTime = start + audio.duration;
    this.status(true);
  }
  finish() {
    this.ended = true;
    if (!this.nodes.size) this.stop();
  }
  clear() {
    for (const node of this.nodes) { node.onended = null; node.stop(); node.disconnect(); }
    this.nodes.clear();
    this.pendingByte = null;
    this.nextTime = 0;
    this.status(false);
  }
  stop() {
    this.ended = true;
    this.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    this.status(false);
  }
}
