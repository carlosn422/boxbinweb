import { copilotText as ct, copilotLanguage, copilotError } from '@/lib/copilotI18n';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { CopilotAudioPlayer } from './copilotAudioPlayer';
import { CopilotMicrophone } from './copilotMicrophone';
import type { CopilotResponse } from './boxbinCopilotService';

export type LiveState = 'connecting' | 'listening' | 'responding' | 'reconnecting' | 'ended';
export interface LiveTranscript { id: string; input: string; output: string }
export interface LiveTurn { id: string; input: string; interrupted: boolean; answer: CopilotResponse }

export interface VoiceCallbacks {
  onState: (state: LiveState) => void;
  onTranscript: (turn: LiveTranscript) => void;
  onTurn: (turn: LiveTurn) => void;
  onWarning: (message: string) => void;
  history: () => { sender: string; text: string }[];
}

export class CopilotVoiceStream {
  private language = copilotLanguage();
  private socket: WebSocket | null = null;
  private stopped = false;
  private ready = false;
  private muted = false;
  private silenced = false;
  private inputTurnId = '';
  private generation = 0;
  private reconnects = 0;
  private binId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private microphone = new CopilotMicrophone();
  private player: CopilotAudioPlayer;
  private callbacks: VoiceCallbacks;

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
    this.player = new CopilotAudioPlayer(playing => { if (!this.stopped && this.ready) callbacks.onState(playing ? 'responding' : 'listening'); });
  }
  // Must be invoked directly in the click, before awaiting chat persistence.
  async prepare() {
    this.callbacks.onState('connecting');
    try {
      await Promise.all([
        this.player.unlock(),
        this.microphone.start(pcm => {
          if (!this.ready || this.stopped || this.muted || this.socket?.readyState !== WebSocket.OPEN) return;
          // Never queue microphone recordings for replay after a reconnect.
          if (this.socket.bufferedAmount > 32000) { this.fail(ct('slowConnection')); return; }
          this.socket.send(pcm);
        }, () => this.fail(ct('micDisconnected')))
      ]);
    } catch (error) { this.stop(); throw error; }
  }

  async connect(binId: string | null, resumeToken?: string | null) {
    if (this.stopped) return;
    this.binId = binId;
    const generation = ++this.generation;
    const { data, error } = await supabase.auth.getSession();
    if (this.stopped || generation !== this.generation) return;
    if (error || !data.session?.access_token) { this.fail(ct('voiceSignIn')); return; }
    const url = new URL('/functions/v1/boxbin-copilot-voice', supabaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Supabase Edge Functions support JWT authentication through the query
    // string for browser WebSockets, where custom headers are unavailable.
    url.searchParams.set('jwt', data.session.access_token);
    // Browsers cannot attach Authorization headers to WebSockets. The token is
    // carried once in the query string; keeping the application protocol
    // separate avoids sending a second, very large subprotocol value that some
    // hosted gateways reject before the Edge Function receives the request.
    const socket = this.socket = new WebSocket(url, ['boxbin-live-v1']);
    socket.binaryType = 'arraybuffer';
    const active = () => !this.stopped && this.socket === socket && generation === this.generation;
    this.timer = setTimeout(() => { if (active()) this.fail(ct('voiceStartError')); }, 45000);
    socket.onopen = () => {
      if (!active()) { socket.close(); return; }
      socket.send(JSON.stringify({ type: 'start', language: this.language, binId, chatHistory: this.callbacks.history().slice(-8), ...(resumeToken ? { resumeToken } : {}) }));
    };
    socket.onmessage = event => {
      if (!active()) return;
      try {
        if (event.data instanceof ArrayBuffer) {
          if (!this.silenced) this.player.push(event.data);
          return;
        }
        const data = JSON.parse(event.data);
        if (data.type === 'ready') {
          clearTimeout(this.timer); this.ready = true;
          this.microphone.mute(this.muted);
          if (this.muted) socket.send(JSON.stringify({ type: 'mute' }));
          this.callbacks.onState('listening');
        } else if (data.type === 'transcript') {
          if (typeof data.id !== 'string' || typeof data.input !== 'string' || typeof data.output !== 'string') throw new Error();
          if (data.input && data.id !== this.inputTurnId) {
            this.inputTurnId = data.id;
            this.player.clear(); this.silenced = false;
          }
          this.callbacks.onTranscript(data);
        } else if (data.type === 'interrupted') {
          this.player.clear(); this.silenced = false;
          this.callbacks.onState('listening');
        } else if (data.type === 'turn_complete') {
          if (typeof data.id !== 'string' || typeof data.input !== 'string' || typeof data.answer?.reply !== 'string' || !Array.isArray(data.answer.suggestedActions) || !Array.isArray(data.answer.suggestedQuestions)) throw new Error();
          this.callbacks.onTurn(data);
          this.silenced = false;
        } else if (data.type === 'reconnect') {
          this.ready = false; this.player.clear(); this.microphone.mute(true);
          this.callbacks.onState('reconnecting');
          this.socket = null; socket.close();
          if (++this.reconnects > 8) { this.fail(ct('callLimit')); return; }
          void this.connect(this.binId, data.resumeToken).catch(() => this.fail(ct('renewCallError')));
        } else if (data.type === 'error' || data.type === 'ended') {
          this.fail(data.code ? copilotError(data.code) : typeof data.message === 'string' ? data.message : ct('callFinished'));
        }
      } catch { this.fail(ct('callInterrupted')); }
    };
    socket.onerror = () => { if (active()) this.fail(ct('voiceConnectionError')); };
    socket.onclose = () => { if (active()) this.fail(ct('connectionInterrupted')); };
  }

  mute(value: boolean) {
    this.muted = value; this.microphone.mute(value || !this.ready);
    if (value && this.ready && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'mute' }));
  }

  stopAudio() {
    this.silenced = true;
    this.player.clear();
  }
  sendText(value: string) {
    const text = value.trim();
    if (!text || !this.ready || this.stopped || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'text', text }));
    return true;
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.callbacks.onWarning(message);
    this.stop();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true; this.ready = false; this.generation++;
    clearTimeout(this.timer);
    this.microphone.stop(); this.player.stop();
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'stop' }));
    this.socket?.close(); this.socket = null;
    this.callbacks.onState('ended');
  }
}
