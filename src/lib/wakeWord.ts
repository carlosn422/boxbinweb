export interface WakeWordMatch {
  matched: boolean;
  trailingText: string;
}

const DEFAULT_BOXBIN_ALIASES = [
  'boxbin',
  'box bin',
  'boxbean',
  'box bean',
  'boxvin',
  'box vin',
  'boxping',
  'box ping',
  'boxpin',
  'box pin',
  'voxbin',
  'vox bin',
  'boksbin',
  'boxes bin',
  'box bing',
  'bosbin',
];

const GREETING_PREFIXES = new Set([
  'hey',
  'hei',
  'ey',
  'oye',
  'oiga',
  'hola',
  'hello',
  'hi',
  'ok',
  'okay',
  'okey',
  'buenas',
  'disculpa',
  'por',
  'favor',
]);

export function normalizeSpeechText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTrailing(originalTranscript: string, matchedPhraseNorm: string): string {
  const norm = normalizeSpeechText(originalTranscript);
  const idx = norm.indexOf(matchedPhraseNorm);
  if (idx < 0) return '';
  const afterNorm = norm.slice(idx + matchedPhraseNorm.length).trim();
  if (!afterNorm || afterNorm.length < 3) return '';
  if (GREETING_PREFIXES.has(afterNorm)) return '';
  return afterNorm;
}

export function matchWakeWord(
  transcript: string,
  assistantName = 'Boxbin'
): WakeWordMatch {
  const normTranscript = normalizeSpeechText(transcript);
  if (!normTranscript) return { matched: false, trailingText: '' };

  const normName = normalizeSpeechText(assistantName) || 'boxbin';
  const candidates =
    normName === 'boxbin'
      ? DEFAULT_BOXBIN_ALIASES
      : [normName, normName.replace(/\s+/g, '')];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const pattern = new RegExp(`(?:^|\\s)${escapeRegex(candidate)}(?:$|\\s)`);
    if (pattern.test(normTranscript)) {
      return {
        matched: true,
        trailingText: extractTrailing(transcript, candidate),
      };
    }
  }

  const nameTokens = normName.split(' ').filter(Boolean);
  if (nameTokens.length === 1 && normName.length >= 4) {
    const words = normTranscript.split(' ').filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (Math.abs(w.length - normName.length) <= 1 && levenshtein(w, normName) <= 1) {
        return {
          matched: true,
          trailingText: words.slice(i + 1).join(' ').trim(),
        };
      }
      if (i + 1 < words.length) {
        const joined = w + words[i + 1];
        if (Math.abs(joined.length - normName.length) <= 1 && levenshtein(joined, normName) <= 1) {
          return {
            matched: true,
            trailingText: words.slice(i + 2).join(' ').trim(),
          };
        }
      }
    }
  }

  return { matched: false, trailingText: '' };
}
