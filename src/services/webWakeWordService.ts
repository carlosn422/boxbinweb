import { matchWakeWord } from '@/lib/wakeWord';

export interface WebWakeWordMatchEvent {
  transcript: string;
  trailingText: string;
}

export interface WebWakeWordOptions {
  assistantName: string;
  language: 'en' | 'es';
  onWake: (match: WebWakeWordMatchEvent) => void;
  onUnavailable?: (reason: 'unsupported' | 'permission' | 'error') => void;
}

function getSpeechRecognitionCtor(): (new () => any) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Browser-side wake-word standby listener using the Web Speech API.
 * Runs locally without opening a WebSocket or consuming Gemini/BoxBin tokens
 * until the user says "Hey Boxbin" (or their custom assistant name).
 */
class WebWakeWordService {
  private recognition: any = null;
  private active = false;
  private muted = false;
  private triggered = false;
  private generation = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private options: WebWakeWordOptions | null = null;

  isSupported(): boolean {
    return !!getSpeechRecognitionCtor();
  }

  isActive(): boolean {
    return this.active;
  }

  start(options: WebWakeWordOptions): boolean {
    this.stop();
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      options.onUnavailable?.('unsupported');
      return false;
    }

    const gen = ++this.generation;
    this.options = options;
    this.active = true;
    this.muted = false;
    this.triggered = false;

    this.launch(Ctor, gen);
    return true;
  }

  private launch(Ctor: new () => any, gen: number) {
    if (gen !== this.generation || !this.active || this.muted || this.triggered) return;
    const opts = this.options;
    if (!opts) return;

    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.lang = opts.language === 'es' ? 'es-MX' : 'en-US';

      rec.onresult = (event: any) => {
        if (gen !== this.generation || !this.active || this.muted || this.triggered) return;
        const results = event?.results;
        if (!results) return;
        for (let i = event.resultIndex || 0; i < results.length; i++) {
          const res = results[i];
          if (!res) continue;
          for (let j = 0; j < res.length; j++) {
            const transcript = String(res[j]?.transcript || '');
            if (!transcript) continue;
            const match = matchWakeWord(transcript, opts.assistantName);
            if (match.matched) {
              this.handleMatch(gen, opts, {
                transcript,
                trailingText: match.trailingText,
              });
              return;
            }
          }
        }
      };

      rec.onerror = (event: any) => {
        if (gen !== this.generation || !this.active || this.triggered) return;
        const err = String(event?.error || '');
        if (err === 'aborted') return;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.stop();
          opts.onUnavailable?.('permission');
          return;
        }
        if (!this.muted) {
          this.scheduleRestart(Ctor, gen, 450);
        }
      };

      rec.onend = () => {
        if (gen !== this.generation || !this.active || this.triggered || this.muted) return;
        this.scheduleRestart(Ctor, gen, 250);
      };

      this.recognition = rec;
      rec.start();
    } catch {
      this.scheduleRestart(Ctor, gen, 600);
    }
  }

  private scheduleRestart(Ctor: new () => any, gen: number, delayMs: number) {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.launch(Ctor, gen);
    }, delayMs);
  }

  private handleMatch(
    gen: number,
    opts: WebWakeWordOptions,
    match: WebWakeWordMatchEvent
  ) {
    if (this.triggered || gen !== this.generation) return;
    this.triggered = true;
    this.active = false;
    this.options = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { try { rec.stop(); } catch { /* ignore */ } }
    }
    setTimeout(() => {
      if (gen !== this.generation) return;
      opts.onWake(match);
    }, 150);
  }

  setMuted(muted: boolean) {
    if (!this.active || this.triggered) return;
    this.muted = muted;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (muted) {
      const rec = this.recognition;
      this.recognition = null;
      if (rec) {
        rec.onend = null;
        try { rec.abort(); } catch { /* ignore */ }
      }
    } else {
      const Ctor = getSpeechRecognitionCtor();
      if (Ctor) this.scheduleRestart(Ctor, this.generation, 150);
    }
  }

  stop() {
    this.generation++;
    this.active = false;
    this.muted = false;
    this.triggered = false;
    this.options = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { try { rec.stop(); } catch { /* ignore */ } }
    }
  }
}

export const webWakeWordService = new WebWakeWordService();
