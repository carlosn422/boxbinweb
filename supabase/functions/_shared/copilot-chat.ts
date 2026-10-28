import { actionTypes, actionData, languageInstruction, responseLanguage, type CopilotLanguage, CopilotError, identifier, prepareInput, inventoryForModel, publicProduct, requestsWebPrices, sourcesFromGrounding, SYSTEM, text, validateAnswer, type Source } from './copilot-contract.ts';
import { authenticate, candidateText, cors, failure, gemini, inventory, json, plan, readBody, rpc, type Context } from './copilot-server.ts';
import { streamReply } from './copilot-stream.ts';
export interface ChatStream {
  context: Context;
  signal: AbortSignal;
  onText: (delta: string) => void;
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
    `${es ? "Registros" : "Records"}: ${count}. ${es ? "Valor registrado calculable" : "Calculable recorded value"}: ${first.inventoryMetrics.totalEstimatedValue} (${es ? "moneda no registrada" : "currency not recorded"}). ${es ? "Registros sin valuación completa" : "Records with incomplete valuation"}: ${first.inventoryMetrics.unvaluedItems}.`,
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
  try {
    const deadline = Date.now() + 110000;
    const remaining = () => {
      stream?.signal.throwIfAborted();
      const ms = deadline - Date.now();
      if (ms < 3000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      return Math.min(40000, ms);
    };
    const ctx = stream?.context ?? await authenticate(req);
    const body = await readBody(req);
    const op = body.operation || 'chat';
    if (stream && op !== 'chat') throw new CopilotError('COPILOT_INVALID');
    if (op === 'context') return json(await inventory(ctx, identifier(body.binId) || null, text(body.search, 200), body.offset ?? 0, 100, responseLanguage(body.language)));
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
        p_limits: limits
      }));
    }
    if (op !== 'chat') throw new CopilotError('COPILOT_INVALID');
    const input = prepareInput(body);
    await plan(ctx);
    await rpc(ctx.db, 'copilot_take_quota', {
      p_actor: ctx.actor,
      p_kind: 'chat',
      p_limit: 100
    });
    const initial = await inventory(ctx, input.binId, '', 0, 50, input.language);
    const allowWeb = requestsWebPrices(input.query, input.history);
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
    let searches = 0, toolCalls = 0, evidenceSize = 0;
    const evidence: any[] = [];
    // Bounded read-only tool loop. No model tool can write to the database.
    for (let round = 0; round < 4 && toolCalls < 6 && evidenceSize < 120000; round++) {
      const candidate = await gemini({
        systemInstruction: {
          parts: [{
            text: SYSTEM + languageInstruction(input.language) + '\nThis phase only gathers evidence using read tools. If you already have sufficient data, respond READY. Do not draft the final response to the user or action proposals yet.'
          }]
        },
        contents,
        tools,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 6000
        }
      }, false, remaining(), stream?.signal);
      const calls = candidate.content.parts.filter((p: any) => p.functionCall);
      if (!calls.length) break;
      contents.push(candidate.content); // preserve provider thought signatures on tool calls
      const responses: any[] = [];
      for (const part of calls.slice(0, 4)) {
        const {
          name,
          args = {}
        } = part.functionCall;
        let result: any;
        if (++toolCalls > 6) result = { error: input.language === 'es' ? 'Límite de consultas por turno. Indica el alcance pendiente.' : 'Turn query limit exceeded. State the pending scope.' };
        else if (name === 'search_inventory') {
          const offset = Number(args.offset || 0);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new CopilotError('COPILOT_INVALID');
          result = inventoryForModel(await inventory(ctx, input.binId, text(args.search, 200), offset, 50, input.language));
        } else if (name === 'search_prices' && allowWeb && searches++ < 2) {
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
                maxOutputTokens: 4000
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
        } else result = {
          error: input.language === 'es' ? 'Herramienta no disponible o límite de consultas alcanzado.' : 'Tool unavailable or query limit reached.'
        };
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
    const finalRequest = {
      systemInstruction: {
        parts: [{
          text: SYSTEM + languageInstruction(input.language)
        }]
      },
      // Structured output is a separate request, with tool results as data (no tool calls).
      contents: [{ role: 'user', parts: [...parts, { text: JSON.stringify({ toolResults: evidence, instruction: input.language === 'es' ? 'Responde con los datos obtenidos. Declara búsquedas incompletas. Genera el JSON del contrato.' : 'Answer using the gathered data. State any incomplete searches. Generate the contract JSON.' }) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema
      }
    };
    const raw = stream
      ? await streamReply(finalRequest, stream.onText, stream.signal, remaining())
      : candidateText(await gemini(finalRequest, false, remaining()));
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
    return json({
      ...answer,
      searchSuggestions
    });
  } catch (error) {
    return failure(error);
  }
}
