import { copilotText as ct } from '@/lib/copilotI18n';
export class CopilotMicrophone {
  private context: AudioContext | null = null;
  private ownsContext = false;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private stopped = false;
  private muted = false;

  private async acquireStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (error) {
      if (error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) {
        throw error;
      }
      // Fallback for iOS Safari / Bluetooth / AirPods routes that reject advanced audio constraints.
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }

  ensureRunning() {
    const ctx = this.context;
    if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
      void ctx.resume().catch(() => {});
    }
  }

  async start(onPacket: (pcm: ArrayBuffer) => void, onLost: () => void, sharedContext?: AudioContext | null) {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error(ct('micBrowser'));
    this.stopped = false;
    this.muted = false;
    // Reuse the player's AudioContext when provided so iOS Safari never suspends mic capture
    // due to two competing AudioContexts.
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error(ct('micBrowser'));
    const context = sharedContext && sharedContext.state !== 'closed' ? sharedContext : new AudioCtx();
    this.context = context;
    this.ownsContext = context !== sharedContext;
    context.onstatechange = () => {
      if (!this.stopped && (context.state === 'suspended' || (context.state as string) === 'interrupted')) {
        void context.resume().catch(() => {});
      }
    };
    const resume = context.state === 'running' ? Promise.resolve() : context.resume();
    try {
      const streamPromise = this.acquireStream().then(stream => {
        if (this.stopped) { stream.getTracks().forEach(t => t.stop()); throw new Error(ct('callCancelled')); }
        this.stream = stream;
        return stream;
      });
      const [stream] = await Promise.all([streamPromise, context.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/boxbin-pcm.js`), resume]);
      if (this.stopped || context.state !== 'running') throw new Error(ct('micStartError'));
      const worklet = this.worklet = new AudioWorkletNode(context, 'boxbin-pcm');
      this.source = context.createMediaStreamSource(stream);
      this.gain = context.createGain(); this.gain.gain.value = 0;
      this.source.connect(worklet); worklet.connect(this.gain); this.gain.connect(context.destination);
      worklet.port.onmessage = event => { if (!this.stopped && !this.muted && event.data instanceof ArrayBuffer) onPacket(event.data); };
      stream.getAudioTracks().forEach(track => { track.onended = () => { if (!this.stopped) { this.stop(); onLost(); } }; });
    } catch (error) {
      this.stop();
      if (error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) throw new Error(ct('micPermission'));
      throw error;
    }
  }
  mute(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    this.worklet?.port.postMessage({ muted: value });
  }
  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.port.close(); this.worklet.disconnect(); }
    this.source?.disconnect(); this.gain?.disconnect();
    this.worklet = null; this.source = null; this.gain = null;
    const context = this.context; this.context = null;
    if (context) {
      context.onstatechange = null;
      if (this.ownsContext && context.state !== 'closed') void context.close().catch(() => {});
    }
    this.ownsContext = false;
  }
}
