import { directFacts, latestBinSnapshotReply, inventoryListReply, inventoryValueReply, latestItemReply, latestSnapshotReply } from './copilot-facts.ts';
import { actionTypes, actionData, assistantNameInstruction, DEFAULT_ASSISTANT_NAME, languageInstruction, requestsAssistantRename, responseLanguage, type CopilotLanguage, CopilotError, identifier, prepareInput, inventoryForModel, publicProduct, requestsWebPrices, sourcesFromGrounding, SYSTEM, text, validateAnswer, type Source } from './copilot-contract.ts';
import { authenticate, candidateText, COPILOT_TOKEN_COSTS, cors, DEFAULT_COPILOT_ENTITLEMENTS, failure, fastThinkingConfig, gemini, getAssistantName, inventory, json, plan, readBody, rpc, setAssistantName, type Context } from './copilot-server.ts';
import { streamReply } from './copilot-stream.ts';
export interface ChatStream {
  context: Context;
  signal: AbortSignal;
  onText: (delta: string) => void;
  authMs?: number;
}
export const tools = [{
  functionDeclarations: [{
    name: 'search_inventory',
    description: 'Search inventory items, bins, and locations by short text, synonyms, or pagination. Metrics always cover the entire scope, not just the page. In bin mode, queries are restricted to that bin.',
    parameters: {
      type: 'OBJECT',
      properties: {
        search: {
          type: 'STRING'
        },
        offset: {
          type: 'INTEGER'
        }
      },
      required: ['search']
    }
  }, {
    name: 'search_prices',
    description: 'Search current market prices on the web. Public product/brand/model only; never include private data. Use only when the user requests external market prices.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product: {
          type: 'STRING'
        },
        currency: {
          type: 'STRING',
          enum: ['MXN', 'USD']
        }
      },
      required: ['product']
    }
  }, {
    name: 'set_assistant_name',
    description: 'Save a custom name that this user wants to call you (the AI assistant). Call this immediately whenever the user tells you what name they want to give you or asks to rename you. Saves permanently for this user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: {
          type: 'STRING',
          description: 'The new name the user wants to call you (1 to 40 characters).'
        }
      },
      required: ['name']
    }
  }]
}];
const stringFields = ['name', 'description', 'binId', 'binName', 'locationId', 'locationName', 'itemId', 'itemName', 'sourceBinId', 'destinationBinId', 'destinationBinName', 'cuantity', 'value', 'address', 'title', 'prompt', 'aspectRatio'];
export const responseSchema = {
  propertyOrdering: ['reply', 'suggestedQuestions', 'suggestedActions', 'actionProposal'],
  type: 'OBJECT',
  properties: {
    reply: {
      type: 'STRING'
    },
    suggestedQuestions: {
      type: 'ARRAY',
      items: {
        type: 'STRING'
      }
    },
    suggestedActions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: {
            type: 'STRING'
          },
          path: {
            type: 'STRING'
          }
        },
        required: ['label', 'path']
      }
    },
    actionProposal: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        type: {
          type: 'STRING',
          enum: [...actionTypes]
        },
        data: {
          type: 'OBJECT',
          properties: {
            ...Object.fromEntries(stringFields.map(k => [k, {
              type: 'STRING'
            }])),
            tags: {
              type: 'ARRAY',
              items: {
                type: 'STRING'
              }
            }
          }
        }
      },
      required: ['type', 'data']
    }
  },
  required: ['reply', 'suggestedQuestions', 'suggestedActions', 'actionProposal']
};
export const readOnlyResponseSchema = {
  propertyOrdering: ['reply', 'suggestedQuestions', 'suggestedActions'],
  type: 'OBJECT',
  properties: {
    reply: {
      type: 'STRING'
    },
    suggestedQuestions: {
      type: 'ARRAY',
      items: {
        type: 'STRING'
      }
    },
    suggestedActions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: {
            type: 'STRING'
          },
          path: {
            type: 'STRING'
          }
        },
        required: ['label', 'path']
      }
    }
  },
  required: ['reply', 'suggestedQuestions', 'suggestedActions']
};
export function mayNeedActionProposal(query: string, history: { sender: string; text: string }[] = [], hasImage = false): boolean {
  if (hasImage) return true;
  const recent = [query, ...history.slice(-2).map(m => m.text)].join(' ');
  return /\b(crea\w*|agrega\w*|a[nñ]ad\w*|guarda\w*|registra\w*|edita\w*|actualiza\w*|cambia\w*|modifica\w*|mueve|mover|moviendo|transfi\w*|renombra\w*|elimina\w*|borra\w*|quita\w*|genera\w*|exporta\w*|descarga\w*|dibuja\w*|dise[nñ]\w*|pdf|reporte|informe|documento|imagen|foto|create|add|save|register|edit|update|change|modify|move|transfer|rename|delete|remove|generate|export|download|report|document|image|picture|photo|draw|sell|vender|venta|sale)\b/i.test(recent);
}
export async function canonicalProposal(ctx: Context, proposal: any, scope: string | null) {
  if (!proposal) return null;
  const d = proposal.data;
  if (['update_item', 'update_bin', 'update_location'].includes(proposal.type)) {
    const id = d.itemId || d.binId || d.locationId;
    const snapshot = await rpc(ctx.db, 'copilot_prepare_edit', { p_actor: ctx.actor, p_type: proposal.type, p_id: id });
    if (scope) {
      if (proposal.type === 'update_item' && snapshot.binId !== scope || proposal.type === 'update_bin' && id !== scope) throw new CopilotError('COPILOT_INVALID');
      if (proposal.type === 'update_location') {
        const current = await inventory(ctx, scope);
        if (String(current.activeBin?.location?.id || '') !== id) throw new CopilotError('COPILOT_INVALID');
      }
    }
    return { ...proposal, data: { ...d, expectedVersion: snapshot.version, targetName: snapshot.name, before: snapshot.fields } };
  }
  async function owned(table: string, id: string) {
    const {
      data,
      error
    } = await ctx.db.from(table).select('*').eq('id', id).eq('userId', ctx.owner).maybeSingle();
    if (error || !data) throw new CopilotError('COPILOT_NOT_FOUND');
    return data;
  }
  if (d.binId) {
    if (scope && d.binId !== scope) throw new CopilotError('COPILOT_INVALID');
    d.binName = (await owned('bins', d.binId)).name;
  }
  if (d.destinationBinId) d.destinationBinName = (await owned('bins', d.destinationBinId)).name;
  if (d.itemId) {
    const item = await owned('items', d.itemId);
    if (scope && String(item.binId) !== scope) throw new CopilotError('COPILOT_INVALID');
    d.itemName = item.name;
    d.sourceBinId = String(item.binId);
  }
  if (d.locationId) d.locationName = (await owned('locations', d.locationId)).name;
  if (proposal.type === 'generate_inventory_pdf') d.binId = scope || d.binId || '';
  return proposal;
}
const cell = (v: unknown) => String(v ?? '').replace(/[|\r\n]/g, ' ').replace(/[*_#<>]/g, '').slice(0, 300);
async function document(ctx: Context, binId: string | null, title: string, language: CopilotLanguage, timeZone?: string) {
  // One SQL statement supplies rows and totals from the same database snapshot.
  const first = await inventory(ctx, binId, '', 0, 1500, language);
  const count = first.inventoryMetrics.totalItems;
  if (count > 1500) throw new CopilotError('COPILOT_REPORT_TOO_LARGE');
  const items = [...first.itemsSample];
  const es = language === 'es';
  const unassigned = es ? 'Sin ubicación' : 'No location';
  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : undefined;
  let formattedDateTime: string;
  try {
    formattedDateTime = new Intl.DateTimeFormat(es ? 'es-MX' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(tz ? { timeZone: tz } : {})
    }).format(new Date());
  } catch {
    formattedDateTime = new Intl.DateTimeFormat(es ? 'es-MX' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date());
  }
  const content = [
    es ? `## Inventario registrado` : `## Recorded inventory`,
    `${es ? "Consulta realizada" : "Retrieved at"}: ${formattedDateTime}. ${es ? "Los datos pueden cambiar después de esta consulta. No acredita verificación física." : "Data may change after this query. This is not evidence of physical verification."}`,
    `${es ? "Registros" : "Records"}: ${count}. ${es ? "Valor registrado calculable" : "Calculable recorded value"}: $${first.inventoryMetrics.totalEstimatedValue} USD. ${es ? "Registros sin valuación completa" : "Records with incomplete valuation"}: ${first.inventoryMetrics.unvaluedItems}.`,
    es ? '| Ítem | Caja | Ubicación | Cantidad | Valor unitario registrado |' : '| Item | Bin | Location | Quantity | Recorded unit value |',
    '| --- | --- | --- | --- | --- |',
    ...items.map(i => {
      const loc = (!i.locationName || i.locationName === 'Sin ubicación' || i.locationName === 'No location')
        ? unassigned
        : i.locationName;
      return `| ${cell(i.name)} | ${cell(i.binName)} | ${cell(loc)} | ${cell(i.cuantity)} | ${cell(i.value)} |`;
    })
  ].join('\n\n').replace(/\|\n\n\|/g, '|\n|');
  if (content.length > 30000) throw new CopilotError('COPILOT_REPORT_TOO_LARGE');
  return {
    title: title || (es ? 'Inventario BoxBin' : 'BoxBin Inventory'),
    language,
    binName: first.activeBin?.name,
    locationName: first.activeBin?.location?.name,
    content,
    fecha: new Intl.DateTimeFormat('en-CA', {
      ...(tz ? { timeZone: tz } : {})
    }).format(new Date())
  };
}
export async function handler(req: Request, stream?: ChatStream): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  if (!stream && req.method === 'POST' && req.headers.get('accept')?.includes('text/event-stream')) {
    try {
      const authStart = Date.now();
      const context = await authenticate(req);
      const authMs = Date.now() - authStart;
      const encoder = new TextEncoder();
      const controller = new AbortController();
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          // Immediately flush an SSE comment so reverse proxies / CDNs open the
          // streaming pipe instead of buffering until the full response completes.
          try { streamController.enqueue(encoder.encode(': open\n\n')); } catch { controller.abort(); }
          const emit = (event: string, payload: unknown) => {
            try {
              streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
            } catch {
              controller.abort();
            }
          };
          void handler(req, {
            context,
            signal: controller.signal,
            onText: (delta) => emit('delta', { delta }),
            authMs
          }).then(async (res) => {
            const rawText = await res.text();
            let parsed: unknown = null;
            try { parsed = JSON.parse(rawText); } catch { parsed = { error: rawText }; }
            if (res.ok) emit('done', parsed);
            else emit('error', { status: res.status, ...(parsed && typeof parsed === 'object' ? parsed : {}) });
          }).catch(async (err) => {
            const res = failure(err);
            const detail = await res.json().catch(() => ({ code: 'COPILOT_UNAVAILABLE' }));
            emit('error', { status: res.status, ...detail });
          }).finally(() => {
            try { streamController.close(); } catch { /* already closed */ }
          });
        },
        cancel() {
          controller.abort();
        }
      });
      return new Response(body, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive'
        }
      });
    } catch (error) {
      return failure(error);
    }
  }
  try {
    const deadline = Date.now() + 110000;
    const remaining = () => {
      stream?.signal.throwIfAborted();
      const ms = deadline - Date.now();
      if (ms < 3000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      return Math.min(40000, ms);
    };
    const reqStart = Date.now();
    const authStart = Date.now();
    const ctx = stream?.context ?? await authenticate(req);
    const authMs = stream?.authMs ?? (Date.now() - authStart);
    const bodyStart = Date.now();
    const body = await readBody(req);
    const bodyMs = Date.now() - bodyStart;
    const op = body.operation || 'chat';
    if (stream && op !== 'chat') throw new CopilotError('COPILOT_INVALID');
    if (op === 'context') {
      const inv = await inventory(ctx, identifier(body.binId) || null, text(body.search, 200), body.offset ?? 0, 100, responseLanguage(body.language));
      const assistantPref = typeof getAssistantName === 'function'
        ? await getAssistantName(ctx)
        : { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
      if (!body.search && !body.offset) {
        try {
          const limits = await plan(ctx);
          const copilot = limits?.copilot || DEFAULT_COPILOT_ENTITLEMENTS;
          const summary = await rpc(ctx.db, 'copilot_usage_summary', { p_actor: ctx.actor });
          if (summary && typeof summary === 'object') {
            return json({
              ...inv,
              assistantName: assistantPref.name,
              copilotQuota: {
                subscriptionActive: true,
                tier: copilot.tier,
                planName: copilot.planName,
                periodStart: copilot.periodStart || null,
                periodEnd: copilot.periodEnd || null,
                limits: {
                  maxChats: copilot.maxChats,
                  maxMessagesPerChat: copilot.maxMessagesPerChat,
                  monthlyMessages: copilot.monthlyMessages,
                  monthlyUploads: copilot.monthlyUploads,
                  monthlyVideos: copilot.monthlyVideos,
                  monthlyImages: copilot.monthlyImages,
                  monthlyVoiceSeconds: copilot.monthlyVoiceSeconds,
                  maxCallSeconds: copilot.maxCallSeconds
                },
                usage: {
                  month: summary.month,
                  chat: Number(summary.chat || 0),
                  upload: Number(summary.upload || 0),
                  image: Number(summary.image || 0),
                  voiceSeconds: Number(summary.voiceSeconds || 0)
                },
                tokenBalance: Number(summary.tokenBalance || 0),
                tokenCosts: COPILOT_TOKEN_COSTS
              }
            });
          }
        } catch (error) {
          if (error instanceof CopilotError && error.code === 'COPILOT_SUBSCRIPTION') {
            return json({
              ...inv,
              assistantName: assistantPref.name,
              copilotQuota: {
                subscriptionActive: false,
                tier: 'free',
                planName: 'None',
                limits: DEFAULT_COPILOT_ENTITLEMENTS,
                usage: { month: '', chat: 0, upload: 0, image: 0, voiceSeconds: 0 },
                tokenBalance: 0,
                tokenCosts: COPILOT_TOKEN_COSTS
              }
            });
          }
        }
      }
      return json({ ...inv, assistantName: assistantPref.name });
    }
    if (op === 'document') {
      await plan(ctx);
      return json(await document(ctx, identifier(body.binId) || null, text(body.title), responseLanguage(body.language), typeof body.timeZone === 'string' ? body.timeZone : undefined));
    }
    if (op === 'execute') {
      const limits = await plan(ctx);
      const type = text(body.type, 50, true);
      const data = actionData(type, body.data);
      return json(await rpc(ctx.db, 'copilot_execute', {
        p_actor: ctx.actor,
        p_request_id: identifier(body.requestId, true),
        p_type: type,
        p_data: data,
        p_limits: {
          items: limits.items,
          bins: limits.bins,
          locations: limits.locations
        }
      }));
    }
    if (op !== 'chat') throw new CopilotError('COPILOT_INVALID');
    const input = prepareInput(body);
    const factRequests = input.image ? [] : directFacts(input.query);
    const fact = factRequests[0] ?? null;
    const fallbackEntitlements = DEFAULT_COPILOT_ENTITLEMENTS || {
      tier: 'starter',
      planName: 'Starter',
      maxChats: 5,
      maxMessagesPerChat: 20,
      monthlyMessages: 60,
      monthlyUploads: 8,
      monthlyVideos: 1,
      monthlyImages: 3,
      monthlyVoiceSeconds: 240,
      maxCallSeconds: 120
    };
    const tokenCosts = COPILOT_TOKEN_COSTS || { chat: 50, upload: 100, image: 500, voiceBlock30s: 200, voicePerMin: 400, video30s: 500 };
    const kind = input.image ? 'upload' : 'chat';
    const tokenCost = input.image ? tokenCosts.upload : tokenCosts.chat;
    const receiptId = identifier(body.requestId) || crypto.randomUUID();

    // Keep read-only preparation parallel; charge only after all validation succeeds.
    let planMs = 0, billingMs = 0, invMs = 0, prefMs = 0;
    const [limits, initial, assistantPref] = await Promise.all([
      (async () => { const t = Date.now(); const r = await plan(ctx); planMs = Date.now() - t; return r; })(),
      (async () => { const t = Date.now(); const r = await inventory(ctx, input.binId, '', 0, factRequests.includes('list') ? 1500 : fact ? 1 : 200, input.language); invMs = Date.now() - t; return r; })(),
      (async () => {
        const t = Date.now();
        const r = typeof getAssistantName === 'function'
          ? await getAssistantName(ctx)
          : { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
        prefMs = Date.now() - t;
        return r;
      })()
    ]);
    const directReplies = await Promise.all(factRequests.map(async request => {
      if (request === 'latest') return Array.isArray(initial.latestItems)
        ? latestSnapshotReply(initial, input.language)
        : await latestItemReply(ctx, input.binId, input.language);
      if (request === 'latest_bin') return latestBinSnapshotReply(initial, input.language);
      if (request === 'value') return inventoryValueReply(initial.inventoryMetrics, input.language);
      return inventoryListReply(initial, input.language);
    }));
    const directReply = directReplies.length && directReplies.every(reply => reply !== null) ? directReplies.join('\n\n') : null;
    stream?.signal.throwIfAborted();
    const copilot = limits?.copilot || fallbackEntitlements;
    const billingStart = Date.now();
    const billing = await rpc(ctx.db, 'copilot_consume_allowance', {
      p_actor: ctx.actor, p_kind: kind, p_amount: 1,
      p_monthly_limit: input.image ? copilot.monthlyUploads : copilot.monthlyMessages,
      p_token_cost: tokenCost, p_receipt: `copilot:${kind}:${receiptId}`
    });
    billingMs = Date.now() - billingStart;
    if (directReply !== null) {
      stream?.onText(directReply);
      return json({ reply: directReply, suggestedActions: [], suggestedQuestions: [], actionProposal: null,
        assistantName: assistantPref.name, billing,
        debugTiming: { directFact: factRequests.join('+'), authMs, planMs, invMs, prefMs, billingMs, phase1Rounds: 0, phase1Ms: 0, phase2Ms: 0, totalMs: Date.now() - reqStart + (stream?.authMs ?? 0) }
      });
    }
    // If a large list needs the model, retain the usual context bound instead
    // of forwarding the entire direct-list page into every provider request.
    if (factRequests.includes('list') && initial.limit > 200) {
      for (const key of ['itemsSample', 'binsSummary', 'locationsSummary']) {
        if (initial[key]?.length > 200) { initial[key] = initial[key].slice(0, 200); initial.hasMore = true; }
      }
      initial.limit = 200;
    }
    let assistantName = assistantPref.name;
    let assistantIsCustom = assistantPref.isCustom;
    const allowWeb = requestsWebPrices(input.query, input.history);
    const simpleGreetingOrMetrics =
      !input.image &&
      /^(?:hola|hi|hello|hey|buenos d[ií]as|buenas tardes|buenas noches|gracias|thanks|ok|okay|qu[eé] tal|c[oó]mo est[aá]s|qui[eé]n eres|c[oó]mo te llamas|who are you|what is your name|cu[aá]ntos [ií]tems|cu[aá]ntas cajas|cu[aá]l es el valor|how many items|how many bins|total value)[\s?!.,]*$/i.test(input.query.trim().replace(/^[¿¡]+/, '')) || (!input.image && /^(?:cu[aá]ntos (?:[ií]tems|art[ií]culos|productos) tengo(?: en total)?|cu[aá]ntas (?:cajas|ubicaciones) tengo(?: en total)?|how many (?:items|bins|locations) do i have(?: in total)?)[?!.\s]*$/i.test(input.query.trim().replace(/^[¿¡]+/, '')));
    const needsToolPhase =
      allowWeb ||
      requestsAssistantRename(input.query, input.history) ||
      (initial.hasMore !== false && !simpleGreetingOrMetrics);
    const privateValues = [ctx.actor, ctx.owner, ...initial.binsSummary.map((b: any) => b.id), ...initial.locationsSummary.flatMap((l: any) => [l.id, l.address || ''])];
    const parts: any[] = [{
      text: JSON.stringify({
        date: new Date().toISOString(),
        query: input.query,
        history: input.history,
        scope: input.binId || 'global',
        inventory: inventoryForModel(initial)
      })
    }];
    if (input.image) parts.push({
      inlineData: {
        data: input.image,
        mimeType: input.mime
      }
    });
    const contents: any[] = [{
      role: 'user',
      parts
    }];
    const sources: Source[] = [];
    const searchSuggestions: string[] = [];
    let searches = 0, toolCalls = 0, evidenceSize = 0, phase1Rounds = 0;
    const evidence: any[] = [];
    const phase1Start = Date.now();
    const thinkingConfig = { thinkingBudget: 0 };
    // Bounded read-only tool loop (plus user assistant-name preference). Skipped completely
    // when initial inventory is already complete and neither web prices nor rename is requested.
    if (needsToolPhase) for (let round = 0; round < 4 && toolCalls < 6 && evidenceSize < 120000; round++) {
      phase1Rounds++;
      const candidate = await gemini({
        systemInstruction: {
          parts: [{
            text: SYSTEM + assistantNameInstruction(assistantName, assistantIsCustom) + languageInstruction(input.language) + '\nThis phase gathers evidence using read tools and saves a custom assistant name via set_assistant_name if the user chooses or changes your name. If you already have sufficient data and no name change is requested, respond READY. Do not draft the final response to the user or action proposals yet.'
          }]
        },
        contents,
        tools,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          thinkingConfig
        }
      }, false, remaining(), stream?.signal);
      const calls = candidate.content.parts.filter((p: any) => p.functionCall);
      if (!calls.length) break;
      contents.push(candidate.content); // preserve provider thought signatures on tool calls
      const batch: { name: string; args: Record<string, any>; callIndex: number; webSearchSlot: number }[] = calls.slice(0, 4).map((part: any) => {
        const callIndex = ++toolCalls;
        const { name, args = {} } = part.functionCall;
        const webSearchSlot = name === 'search_prices' && allowWeb ? ++searches : 0;
        return { name, args, callIndex, webSearchSlot };
      });
      const batchResults = await Promise.all(batch.map(async ({ name, args, callIndex, webSearchSlot }) => {
        let result: any;
        if (callIndex > 6) {
          result = { error: input.language === 'es' ? 'Límite de consultas por turno. Indica el alcance pendiente.' : 'Turn query limit exceeded. State the pending scope.' };
        } else if (name === 'search_inventory') {
          const offset = Number(args.offset || 0);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new CopilotError('COPILOT_INVALID');
          result = inventoryForModel(await inventory(ctx, input.binId, text(args.search, 200), offset, 50, input.language));
        } else if (name === 'search_prices' && allowWeb && webSearchSlot > 0 && webSearchSlot <= 2) {
          const product = publicProduct(args.product, privateValues);
          try {
            const web = await gemini({
              contents: [{
                role: 'user',
                parts: [{
                  text: input.language === 'es'
                    ? `Busca precios actuales del producto: ${product}. Moneda preferida: ${args.currency === 'USD' ? 'USD' : 'MXN'}. Distingue nuevo/usado, tienda, fecha y moneda. No inventes precios si no hay resultados.`
                    : `Search current market prices for product: ${product}. Preferred currency: ${args.currency === 'USD' ? 'USD' : 'MXN'}. Distinguish new/used, store, date and currency. Do not invent prices if there are no results.`
                }]
              }],
              tools: [{
                googleSearch: {}
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1200,
                thinkingConfig
              }
            }, false, remaining(), stream?.signal);
            const found = sourcesFromGrounding(web.groundingMetadata);
            sources.push(...found.filter(s => !sources.some(x => x.url === s.url)));
            const html = web.groundingMetadata?.searchEntryPoint?.renderedContent;
            if (found.length && typeof html === 'string' && html.length <= 50000) searchSuggestions.push(html);
            result = {
              verified: found.length > 0,
              sources: found,
              information: found.length
                ? candidateText(web)
                : (input.language === 'es' ? 'No hay fuentes verificables. No afirmar precio consultado.' : 'No verifiable sources found. Do not state an unverified price.')
            };
          } catch {
            result = {
              verified: false,
              information: input.language === 'es' ? 'No se pudo verificar precios web en esta consulta.' : 'Could not verify web prices for this query.'
            };
          }
        } else if (name === 'set_assistant_name') {
          try {
            const saved = typeof setAssistantName === 'function'
              ? await setAssistantName(ctx, args.name)
              : text(args.name, 40, true);
            assistantName = saved;
            assistantIsCustom = saved.toLowerCase() !== DEFAULT_ASSISTANT_NAME.toLowerCase();
            result = { saved: true, assistantName: saved };
          } catch {
            result = {
              saved: false,
              error: input.language === 'es'
                ? 'Nombre inválido. Pide un nombre corto de 1 a 40 caracteres.'
                : 'Invalid name. Ask for a short name between 1 and 40 characters.'
            };
          }
        } else {
          result = {
            error: input.language === 'es' ? 'Herramienta no disponible o límite de consultas alcanzado.' : 'Tool unavailable or query limit reached.'
          };
        }
        return { name, result };
      }));
      const responses: any[] = [];
      for (const { name, result: rawResult } of batchResults) {
        let result = rawResult;
        const size = JSON.stringify(result).length;
        if (evidenceSize + size > 120000) result = { error: input.language === 'es' ? 'Límite de contexto alcanzado. Explica que la búsqueda está incompleta.' : 'Context limit reached. State that the search is incomplete.' };
        else evidenceSize += size;
        evidence.push({ tool: name, result });
        responses.push({
          functionResponse: {
            name,
            response: {
              result
            }
          }
        });
      }
      // Avoid unanswered provider tool calls if a response requests too many tools.
      for (const part of calls.slice(4)) responses.push({
        functionResponse: {
          name: part.functionCall.name,
          response: {
            error: input.language === 'es' ? 'Límite de herramientas por turno.' : 'Tool limit per turn reached.'
          }
        }
      });
      contents.push({
        role: 'user',
        parts: responses
      });
    }
    const isSimpleReadOnly = !needsToolPhase && !allowWeb && !input.image && !mayNeedActionProposal(input.query, input.history, false);
    const fastModel = isSimpleReadOnly ? (Deno.env.get('COPILOT_FAST_MODEL') || 'gemini-2.5-flash-lite') : undefined;
    const activeSchema = isSimpleReadOnly ? readOnlyResponseSchema : responseSchema;
    const finalRequest = {
      systemInstruction: {
        parts: [{
          text: SYSTEM + assistantNameInstruction(assistantName, assistantIsCustom) + languageInstruction(input.language)
        }]
      },
      // Structured output is a separate request, with tool results as data (no tool calls).
      contents: [{ role: 'user', parts: [...parts, { text: JSON.stringify({ toolResults: evidence, instruction: input.language === 'es' ? 'Responde con los datos obtenidos. Declara búsquedas incompletas. Genera el JSON del contrato.' : 'Answer using the gathered data. State any incomplete searches. Generate the contract JSON.' }) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: isSimpleReadOnly ? 1536 : 4096,
        thinkingConfig,
        responseMimeType: 'application/json',
        responseSchema: activeSchema
      }
    };
    const phase1Ms = needsToolPhase ? Date.now() - phase1Start : 0;
    const phase2Start = Date.now();
    let ttftMs: number | null = null;
    let deltaChunks = 0;
    const runPhase2 = async (modelOverride?: string) => stream
      ? await streamReply(finalRequest, (delta) => {
          if (ttftMs === null) ttftMs = Date.now() - phase2Start;
          deltaChunks++;
          stream.onText(delta);
        }, stream.signal, remaining(), modelOverride)
      : candidateText(await gemini(finalRequest, false, remaining(), undefined, modelOverride));
    let usedFastModel = !!fastModel;
    let raw: string;
    try {
      raw = await runPhase2(fastModel);
    } catch (e) {
      // Automatic fallback to standard chat model if fast model is unavailable/unconfigured
      if (fastModel && deltaChunks === 0 && e instanceof CopilotError && e.code === 'COPILOT_CONFIGURATION') {
        usedFastModel = false;
        raw = await runPhase2(undefined);
      } else {
        throw e;
      }
    }
    const phase2Ms = Date.now() - phase2Start;
    const answer = validateAnswer(JSON.parse(raw), sources);
    try {
      answer.actionProposal = await canonicalProposal(ctx, answer.actionProposal, input.binId);
    } catch {
      answer.actionProposal = null;
      const clarification = input.language === 'es'
        ? '\n\nNo pude validar los registros de la propuesta. Indica la caja o ubicación correcta antes de continuar.'
        : '\n\nI could not validate the records in the proposal. Specify the correct bin or location before continuing.';
      answer.reply += clarification;
      stream?.onText(clarification);
    }
    const debugTiming = {
      streaming: !!stream,
      fastPath: usedFastModel,
      schema: isSimpleReadOnly ? 'readonly' : 'full',
      authMs,
      bodyMs,
      planMs,
      invMs,
      prefMs,
      billingMs,
      needsToolPhase,
      hasMore: initial.hasMore,
      phase1Rounds,
      phase1Ms,
      ttftMs,
      deltaChunks,
      phase2Ms,
      firstTextMs: ttftMs === null ? null : phase2Start - reqStart + ttftMs + (stream?.authMs ?? 0),
      totalMs: Date.now() - reqStart + (stream?.authMs ?? 0)
    };
    console.info('Copilot chat timing', debugTiming);
    return json({
      ...answer,
      assistantName,
      searchSuggestions,
      debugTiming,
      ...(billing ? { billing } : {})
    });
  } catch (error) {
    return failure(error);
  }
}
