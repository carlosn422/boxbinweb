import { CopilotError, identifier, ratio, text } from '../_shared/copilot-contract.ts';
import { authenticate, COPILOT_TOKEN_COSTS, cors, DEFAULT_COPILOT_ENTITLEMENTS, failure, gemini, json, plan, readBody, rpc } from '../_shared/copilot-server.ts';
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
    const limits = await plan(ctx);
    const copilot = limits?.copilot || DEFAULT_COPILOT_ENTITLEMENTS;
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
    const claim = await rpc(ctx.db, 'copilot_claim_image_v2', {
      p_actor: ctx.actor,
      p_request_id: requestId,
      p_hash: hash,
      p_monthly_limit: copilot.monthlyImages,
      p_token_cost: COPILOT_TOKEN_COSTS.image
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
    return json({
      ...result,
      ...(claim.billing ? { billing: claim.billing } : {})
    });
  } catch (error) {
    return failure(error);
  } finally {
    if (lock) await lock.db.from('copilot_images').update({
      busy_until: new Date().toISOString()
    }).eq('actor', lock.actor).eq('request_id', lock.requestId).eq('lease', lock.lease);
  }
}
Deno.serve(handler);
