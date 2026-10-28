// Voice-to-Text Recognition Service using Web Speech API

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

export class VoiceDictationService {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening = false;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onStateChangeCallback: ((listening: boolean) => void) | null = null;

  constructor() {
    // @ts-ignore
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        if (this.recognition) {
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = "en-US";

          this.recognition.onstart = () => {
            this.isListening = true;
            this.onStateChangeCallback?.(true);
          };

          this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = 0; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }

            const text = finalTranscript + interimTranscript;
            if (text) {
              this.onTranscriptCallback?.(text, Boolean(finalTranscript));
            }
          };

          this.recognition.onerror = (event: any) => {
            console.warn("Speech recognition notice:", event.error);
            this.isListening = false;
            this.onStateChangeCallback?.(false);
          };

          this.recognition.onend = () => {
            this.isListening = false;
            this.onStateChangeCallback?.(false);
          };
        }
      } catch (e) {
        console.warn("SpeechRecognition init error:", e);
      }
    }
  }

  public isSupported(): boolean {
    return Boolean(this.recognition);
  }

  public startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onStateChange?: (listening: boolean) => void,
    language: 'en' | 'es' = 'en'
  ) {
    if (!this.recognition) return;
    this.recognition.lang = language === 'es' ? 'es-MX' : 'en-US';
    this.onTranscriptCallback = onTranscript;
    this.onStateChangeCallback = onStateChange || null;

    try {
      this.recognition.start();
    } catch (e) {
      console.warn("SpeechRecognition already started:", e);
    }
  }

  public stopListening() {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
      this.isListening = false;
      this.onStateChangeCallback?.(false);
    } catch {
      // ignore
    }
  }

  public toggleListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onStateChange?: (listening: boolean) => void,
    language: 'en' | 'es' = 'en'
  ): boolean {
    if (this.isListening) {
      this.stopListening();
      return false;
    } else {
      this.startListening(onTranscript, onStateChange, language);
      return true;
    }
  }
}

export const voiceService = new VoiceDictationService();
