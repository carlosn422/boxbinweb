/* AudioWorklet: continuous mono PCM16 at 16 kHz, in 100 ms packets. */
class BoxBinPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.muted = false;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.packet = new Int16Array(1600);
    this.index = 0;
    this.port.onmessage = event => {
      this.muted = !!event.data.muted;
      this.phase = this.sum = this.count = this.index = 0;
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || this.muted) return true;
    for (const sample of input) {
      this.sum += sample; this.count++;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.packet[this.index++] = Math.round(value * (value < 0 ? 32768 : 32767));
      this.sum = 0; this.count = 0;
      if (this.index === this.packet.length) {
        // Explicit little endian, independent of the host typed-array byte order.
        const pcm = new ArrayBuffer(this.packet.length * 2);
        const view = new DataView(pcm);
        for (let i = 0; i < this.packet.length; i++) view.setInt16(i * 2, this.packet[i], true);
        this.port.postMessage(pcm, [pcm]);
        this.index = 0;
      }
    }
    return true;
  }
}
registerProcessor('boxbin-pcm', BoxBinPcmProcessor);
