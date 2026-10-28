import { authenticate, failure, inventory, json, plan, rpc, type Context } from '../_shared/copilot-server.ts';
import { CopilotError, detectLanguage, prepareInput, record, text, type CopilotLanguage } from '../_shared/copilot-contract.ts';
import { LiveTurnTools, liveSetup, openResume, sealResume } from '../_shared/copilot-live.ts';

// Only audio/control frames cross this relay. Model config, tools and tool results
// are always constructed by the authenticated server, never supplied by the client.
export async function handler(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    if (req.method !== 'GET' || req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket requerido.' }, 426);
    const protocols = (req.headers.get('sec-websocket-protocol') || '').split(',').map(s => s.trim());
    const queryJwt = new URL(req.url).searchParams.get('jwt');
    const bearer = protocols.find(p => p.startsWith('bearer.'))?.slice(7) || queryJwt || undefined;
    if (!protocols.includes('boxbin-live-v1') || !bearer || bearer.length > 8000 || !/^[a-zA-Z0-9_.-]+$/.test(bearer)) throw new CopilotError('COPILOT_UNAUTHORIZED', 401);
    const ctx = await authenticate(new Request(req.url, { headers: { Authorization: `Bearer ${bearer}` } }));
    await plan(ctx);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new CopilotError('COPILOT_CONFIGURATION', 503);
    // Explicitly negotiate the application subprotocol requested by the
    // browser. A client that supplies protocols but receives none can reject
    // an otherwise valid HTTP 101 response as a failed WebSocket handshake.
    const { socket, response } = Deno.upgradeWebSocket(req, { protocol: 'boxbin-live-v1' });
    // Keep the Edge worker alive for the entire WebSocket lifecycle. Without
    // an unresolved waitUntil promise, Supabase may retire the isolate after
    // returning the upgrade response and the browser sees a generic connect
    // failure before Gemini Live can finish its setup handshake.
    const socketClosed = new Promise<void>(resolve => {
      socket.addEventListener('close', () => resolve(), { once: true });
    });
    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
    edgeRuntime?.waitUntil?.(socketClosed);
    attachSession(socket, ctx, key, Math.max(20000, 130000 - (Date.now() - startedAt)));
    return response;
  } catch (error) { return failure(error); }
}

export function attachSession(socket: WebSocket, ctx: Context, key: string, duration = 130000) {
  let language: CopilotLanguage = 'en';
  const localized = (en: string, es: string) => language === 'es' ? es : en;
  let provider: WebSocket | undefined;
  let started = false, ready = false, closed = false, rotating = false;
  let scope: string | null = null, initial: any, checkpoint: string | null = null;
  let lastInput = Date.now(), lastPcm = Date.now(), audioCredit = 64000;
  let queue = Promise.resolve(), queuedBytes = 0, turns = 0;
  let setupTimer: ReturnType<typeof setTimeout> | undefined;
  let turn: ReturnType<typeof newTurn> | undefined;
  const cancelled = new Set<string>();
  const pending = new Set<string>();
  const jobs = new Map<string, AbortController>();
  function newTurn() {
    return { id: crypto.randomUUID(), input: '', output: '', audio: 0, quota: null as Promise<unknown> | null, tools: new LiveTurnTools(ctx, scope, initial), abort: new AbortController() };
  }
  const send = (data: unknown) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1000000) { close(); return; }
    socket.send(JSON.stringify(data));
  };
  const upstream = (data: unknown) => {
    if (!closed && provider?.readyState === WebSocket.OPEN) {
      if (provider.bufferedAmount > 256000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      provider.send(JSON.stringify(data));
    }
  };
  function close() {
    if (closed) return;
    closed = true; ready = false;
    clearTimeout(idle); clearTimeout(rotation); clearTimeout(deadline); clearTimeout(setupTimer); clearInterval(silence);
    turn?.abort.abort(); for (const job of jobs.values()) job.abort();
    provider?.close(); socket.close(1000);
  }
  async function fail(error: unknown) {
    if (closed) return;
    const detail = await failure(error).json();
    send({ type: 'error', code: detail.code, message: detail.error });
    close();
  }
  function complete(interrupted = false) {
    if (!turn) return;
    const previous = turn;
    previous.abort.abort();
    for (const job of jobs.values()) job.abort(); jobs.clear(); pending.clear(); cancelled.clear();
    if (previous.input || previous.output || previous.audio) {
      turns++;
      send({ type: 'turn_complete', id: previous.id, input: previous.input, interrupted, answer: {
        reply: previous.output || (interrupted ? localized('Response interrupted.', 'Respuesta interrumpida.') : localized('Voice response transcript unavailable.', 'Respuesta de voz sin transcripción disponible.')),
        suggestedActions: [], suggestedQuestions: [], actionProposal: interrupted ? null : previous.tools.proposal,
        sources: previous.tools.sources, searchSuggestions: previous.tools.searchSuggestions, isValuation: !!previous.tools.sources.length
      } });
    }
    turn = newTurn();
    if (turns >= 10) { send({ type: 'ended', message: localized('This 10-turn call ended. Start another call or open a new chat.', 'Terminó esta llamada de 10 turnos. Puedes iniciar otra llamada o abrir un chat nuevo.') }); close(); }
  }
  function rotate(force = false) {
    rotating = true;
    if (!ready || closed) return;
    if (!force && (turn?.input || turn?.output || turn?.audio || pending.size)) return;
    if (force) { send({ type: 'interrupted' }); complete(true); checkpoint = null; }
    send({ type: 'reconnect', resumeToken: checkpoint });
    close();
  }
  const idle = setTimeout(() => { send({ type: 'error', message: localized('The call did not start.', 'No se inició la llamada.') }); close(); }, 10000);
  const rotation = setTimeout(() => rotate(), duration - 20000);
  const deadline = setTimeout(() => { if (ready) rotate(true); else void fail(new CopilotError('COPILOT_UNAVAILABLE', 503)); }, duration);
  const silence = setInterval(() => { if (ready && Date.now() - lastInput > 90000) { send({ type: 'ended', message: localized('Call ended due to inactivity.', 'Llamada finalizada por inactividad.') }); close(); } }, 10000);
  socket.binaryType = 'arraybuffer';
  socket.onclose = socket.onerror = close;
  socket.onmessage = async event => {
    try {
      if (closed) return;
      if (event.data instanceof ArrayBuffer) {
        if (!ready || !provider || !turn) return;
        const bytes = new Uint8Array(event.data);
        if (!bytes.length || bytes.length > 6400 || bytes.length % 2) throw new CopilotError('COPILOT_INVALID');
        const now = Date.now(); audioCredit = Math.min(64000, audioCredit + (now - lastPcm) * 35); lastPcm = now;
        audioCredit -= bytes.length;
        if (audioCredit < 0) throw new CopilotError('COPILOT_QUOTA', 429);
        upstream({ realtimeInput: { audio: { data: btoa(String.fromCharCode(...bytes)), mimeType: 'audio/pcm;rate=16000' } } });
        return;
      }
      if (typeof event.data !== 'string' || event.data.length > 180000) throw new CopilotError('COPILOT_INVALID');
      const data = record(JSON.parse(event.data));
      if (data.type === 'stop') { close(); return; }
      if (data.type === 'mute' && ready) { upstream({ realtimeInput: { audioStreamEnd: true } }); return; }
      if (data.type === 'text') {
        if (!ready || !turn) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
        const message = text(data.text, 6000, true);
        language = detectLanguage(message, language);
        turn.input += (turn.input ? ' ' : '') + message;
        lastInput = Date.now();
        send({ type: 'transcript', id: turn.id, input: turn.input, output: turn.output });
        upstream({ clientContent: { turns: [{ role: 'user', parts: [{ text: message }] }], turnComplete: true } });
        return;
      }
      if (started || data.type !== 'start') throw new CopilotError('COPILOT_INVALID');
      started = true; clearTimeout(idle);
      const input = prepareInput({ query: 'Voice conversation', language: data.language, binId: data.binId, chatHistory: data.chatHistory });
      scope = input.binId; language = input.language;
      initial = await inventory(ctx, scope); // Verify scope before any provider connection.
      const handle = data.resumeToken ? await openResume(data.resumeToken, ctx, scope, language) : undefined;
      await rpc(ctx.db, 'copilot_take_quota', { p_actor: ctx.actor, p_kind: 'live_connections', p_limit: 30 });
      if (closed) return;
      const setup = liveSetup(initial, input.history, handle, language);
      turn = newTurn();
      provider = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(key));
      provider.binaryType = 'arraybuffer';
      setupTimer = setTimeout(() => void fail(new CopilotError('COPILOT_UNAVAILABLE', 503)), 15000);
      provider.onopen = () => { if (closed) provider?.close(); else upstream({ setup }); };
      provider.onerror = () => void fail(new CopilotError('COPILOT_UNAVAILABLE', 503));
      provider.onclose = () => { if (!closed) void fail(new CopilotError('COPILOT_UNAVAILABLE', 503)); };
      provider.onmessage = event => {
        if (closed) return;
        try {
          const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          if (raw.length > 2000000 || queuedBytes + raw.length > 4000000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
          const value = JSON.parse(raw);
          // Cancel read-only work immediately, without waiting behind database IO.
          for (const id of value.toolCallCancellation?.ids || []) { cancelled.add(id); jobs.get(id)?.abort(); }
          if (value.serverContent?.interrupted) { turn?.abort.abort(); for (const job of jobs.values()) job.abort(); }
          queuedBytes += raw.length;
          queue = queue.then(() => receive(value)).catch(fail).finally(() => { queuedBytes -= raw.length; });
        } catch (error) { void fail(error); }
      };
    } catch (error) { void fail(error); }
  };
  async function receive(value: any) {
    if (closed || !turn) return;
    if (value.error) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    if (value.setupComplete) { ready = true; clearTimeout(setupTimer); send({ type: 'ready' }); }
    if (value.goAway) rotate();
    const content = value.serverContent;
    if (content?.interrupted) { send({ type: 'interrupted' }); complete(true); }
    if (closed || !turn) return;
    if (content?.inputTranscription?.text || content?.outputTranscription?.text || content?.modelTurn || value.toolCall) {
      checkpoint = null; // A checkpoint is reusable only while idle.
      turn.quota ??= rpc(ctx.db, 'copilot_take_quota', { p_actor: ctx.actor, p_kind: 'chat', p_limit: 100 });
      await turn.quota;
      if (closed) return;
    }
    if (content?.inputTranscription?.text) {
      turn.input += content.inputTranscription.text;
      language = detectLanguage(turn.input, language);
      lastInput = Date.now();
      const cancelRequest = /\b(?:cancel(?:a|ar)?|termina(?:r)?|finaliza(?:r)?|corta(?:r)?|det[eé]n|ad[ií]os|hasta luego)\b.{0,32}\b(?:la llamada|llamada|conversaci[oó]n|call|conversation)|\b(?:cancel|end|stop|hang up|goodbye)\b.{0,32}\b(?:the call|call|conversation)\b/i.test(turn.input);
      if (cancelRequest) {
        send({ type: 'ended', message: localized('Call cancelled.', 'Llamada cancelada.') });
        close();
        return;
      }
    }
    if (content?.outputTranscription?.text && !content.interrupted) turn.output += content.outputTranscription.text;
    if (turn.input.length > 6000 || turn.output.length > 16000) throw new CopilotError('COPILOT_INVALID');
    if (content?.inputTranscription?.text || content?.outputTranscription?.text) send({ type: 'transcript', id: turn.id, input: turn.input, output: turn.output });
    if (!content?.interrupted) for (const part of content?.modelTurn?.parts || []) {
      if (!part.inlineData?.mimeType?.startsWith('audio/pcm') || !part.inlineData?.data) continue;
      const raw = atob(part.inlineData.data);
      turn.audio += raw.length;
      if (raw.length > 1000000 || turn.audio > 3000000 || socket.bufferedAmount > 1000000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      if (socket.readyState === WebSocket.OPEN && !closed) socket.send(Uint8Array.from(raw, c => c.charCodeAt(0)));
    }
    if (value.toolCall) {
      const calls = value.toolCall.functionCalls;
      if (!Array.isArray(calls) || calls.length > 6 || pending.size + calls.length > 6) throw new CopilotError('COPILOT_INVALID');
      const current = turn;
      for (const call of calls) {
        if (typeof call.id !== 'string' || call.id.length > 200 || pending.has(call.id)) throw new CopilotError('COPILOT_INVALID');
        if (cancelled.has(call.id)) continue;
        pending.add(call.id);
        const job = new AbortController(); jobs.set(call.id, job);
        const signal = AbortSignal.any([current.abort.signal, job.signal, AbortSignal.timeout(30000)]);
        void current.tools.run(call.name, record(call.args), current.input, signal).then(result => {
          if (closed || turn !== current || signal.aborted || cancelled.has(call.id)) return;
          if (call.name === 'end_call' && result?.status === 'call_end_requested') {
            send({ type: 'ended', message: localized('Call cancelled.', 'Llamada cancelada.') });
            close();
            return;
          }
          upstream({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } });
        }).catch(() => {
          if (closed || turn !== current || current.abort.signal.aborted || job.signal.aborted || cancelled.has(call.id)) return;
          upstream({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { error: 'No se pudo validar o consultar. Pide aclaración; no inventes el resultado.' } }] } });
        }).finally(() => { if (turn === current) { pending.delete(call.id); jobs.delete(call.id); } });
      }
    }
    if (content?.turnComplete && !content.interrupted) complete();
    if (value.sessionResumptionUpdate?.resumable && value.sessionResumptionUpdate.newHandle && !turn?.input && !turn?.output && !turn?.audio && !pending.size) {
      checkpoint = await sealResume(value.sessionResumptionUpdate.newHandle, ctx, scope, language);
    }
    if (rotating) rotate();
  }
}
Deno.serve(handler);
