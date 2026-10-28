import { CopilotError, identifier, ratio, text } from '../_shared/copilot-contract.ts';
import { authenticate, cors, failure, gemini, json, plan, readBody, rpc } from '../_shared/copilot-server.ts';
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  let lock: {
    db: any;
    actor: string;
    requestId: string;
    lease: string;
  } | null = null;
  try {
    const ctx = await authenticate(req),
      body = await readBody(req);
    const requestId = identifier(body.requestId, true);
    await plan(ctx);
    if (body.retrieveOnly === true) {
      const {
        data,
        error
      } = await ctx.db.from('copilot_images').select('result').eq('actor', ctx.actor).eq('request_id', requestId).maybeSingle();
      if (error) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
      return json({
        image: data?.result || null
      });
    }
    const prompt = text(body.prompt, 4000, true),
      aspectRatio = ratio(body.aspectRatio);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
      prompt,
      aspectRatio
    })));
    const hash = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
    const claim = await rpc(ctx.db, 'copilot_claim_image', {
      p_actor: ctx.actor,
      p_request_id: requestId,
      p_hash: hash
    });
    if (claim.result) return json(claim.result);
    lock = {
      db: ctx.db,
      actor: ctx.actor,
      requestId,
      lease: claim.lease
    };
    const candidate = await gemini({
      contents: [{
        role: 'user',
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio
        }
      }
    }, true);
    const inline = candidate.content.parts.find((p: any) => p.inlineData)?.inlineData;
    if (!inline?.data || !['image/png', 'image/jpeg', 'image/webp'].includes(inline.mimeType) || inline.data.length > 7000000) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    const result = {
      base64: inline.data,
      mimeType: inline.mimeType
    };
    const {
      data,
      error
    } = await ctx.db.from('copilot_images').update({
      result,
      busy_until: new Date().toISOString()
    }).eq('actor', ctx.actor).eq('request_id', requestId).eq('lease', claim.lease).select('request_id').single();
    if (error || !data) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    return json(result);
  } catch (error) {
    return failure(error);
  } finally {
    if (lock) await lock.db.from('copilot_images').update({
      busy_until: new Date().toISOString()
    }).eq('actor', lock.actor).eq('request_id', lock.requestId).eq('lease', lock.lease);
  }
}
Deno.serve(handler);
