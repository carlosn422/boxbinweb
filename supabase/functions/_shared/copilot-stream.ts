import { CopilotError } from './copilot-contract.ts';

// Only the first, top-level reply string may reach the speaker. Never speak JSON,
// proposals, tool results, thought parts, or the user's prompt/history.
export function partialReply(json: string): string {
  const start = /^\s*\{\s*"reply"\s*:\s*"/.exec(json);
  if (!start) return '';
  const raw = json.slice(start[0].length);
  let end = 0;
  while (end < raw.length) {
    if (raw[end] === '"') break;
    if (raw[end] === '\\') {
      const length = raw[end + 1] === 'u' ? 6 : 2;
      if (end + length > raw.length) break;
      end += length;
    } else end++;
  }
  let result = JSON.parse(`"${raw.slice(0, end)}"`) as string;
  // Don't emit half a surrogate pair when a Unicode escape crosses chunks.
  if (/[\uD800-\uDBFF]$/.test(result)) result = result.slice(0, -1);
  if (result.length > 16000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  return result;
}

export async function streamReply(body: Record<string, unknown>, onText: (delta: string) => void, signal: AbortSignal, timeoutMs: number) {
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('COPILOT_CHAT_MODEL') || 'gemini-2.5-flash';
  if (!key || !/^[a-zA-Z0-9_.-]+$/.test(model)) throw new CopilotError('COPILOT_CONFIGURATION', 503);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 500).replace(/[\r\n]+/g, ' ');
    console.error('Gemini streaming API rejected request', { model, status: response.status, detail });
    const quota = response.status === 429 || response.status === 402;
    throw new CopilotError(quota ? 'COPILOT_QUOTA' : response.status === 401 || response.status === 403 || response.status === 404 ? 'COPILOT_CONFIGURATION' : 'COPILOT_UNAVAILABLE', quota ? 429 : 503);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', raw = '', emitted = '', stopped = false, bytes = 0;
  const event = (frame: string) => {
    const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const value = JSON.parse(data);
    const candidate = value.candidates?.[0];
    if (value.error || value.promptFeedback?.blockReason) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    if (!candidate) return;
    if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    if (candidate.finishReason === 'STOP') stopped = true;
    raw += (candidate.content?.parts || []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('');
    if (raw.length > 64000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    const reply = partialReply(raw);
    if (!reply.startsWith(emitted)) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    if (reply.length > emitted.length) onText(reply.slice(emitted.length));
    emitted = reply;
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2000000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      buffer += decoder.decode(value, { stream: true });
      // Normalize CRLF after concatenating, including CR/LF split across packets.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        event(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    if (!stopped || !emitted) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    JSON.parse(raw); // Truncated JSON must never become a completed answer.
    return raw;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class SentenceBuffer {
  private buffer = '';
  push(delta: string, final = false): string[] {
    this.buffer += delta;
    const result: string[] = [];
    // Wait for whitespace after punctuation: 1,299.50 must remain one amount.
    // A length ceiling also handles lists and responses without punctuation.
    while (this.buffer) {
      const match = /[.!?;。！？](?:["'”’])?(?=\s)|\n/.exec(this.buffer);
      let end = match ? match.index + match[0].length : -1;
      if (end < 0 && this.buffer.length > 280) {
        end = this.buffer.lastIndexOf(' ', 280);
        if (end < 40) end = 280;
      }
      if (end < 0 && final) end = this.buffer.length;
      if (end < 0) break;
      const sentence = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end).trimStart();
      if (sentence) result.push(sentence);
    }
    return result;
  }
}

export function spokenText(text: string) {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]*>/g, '').replace(/[`*_#|~]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
