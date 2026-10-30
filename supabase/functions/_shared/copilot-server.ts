import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { CopilotError, record } from './copilot-contract.ts';
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    ...cors,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }
});
const messages: Record<string, string> = {
  COPILOT_UNAUTHORIZED: 'Inicia sesión para usar el copiloto.',
  COPILOT_INVALID: 'Revisa los datos de la solicitud.',
  COPILOT_NOT_FOUND: 'El registro no existe o no pertenece a tu cuenta.',
  COPILOT_QUOTA: 'Alcanzaste el límite diario de solicitudes. Intenta mañana.',
  COPILOT_PLAN_LIMIT: 'Tu plan no permite agregar más registros en este destino.',
  COPILOT_SUBSCRIPTION: 'Necesitas una suscripción activa para usar el copiloto.',
  COPILOT_STALE_ITEM: 'El ítem cambió de caja. Actualiza la consulta antes de moverlo.',
  COPILOT_STALE_RECORD: 'El registro cambió desde que se preparó la propuesta. Pide una nueva edición para revisar los datos actuales.',
  COPILOT_BUSY: 'Hay una imagen en proceso. Espera y vuelve a abrir la propuesta.',
  COPILOT_REQUEST_CHANGED: 'Esta solicitud ya fue procesada con otros datos. Prepara una nueva propuesta.',
  COPILOT_CONFIGURATION: 'El copiloto necesita configuración del servidor. Contacta al administrador.',
  COPILOT_REPORT_TOO_LARGE: 'Este reporte excede el límite del editor. Selecciona una caja o utiliza la exportación de inventario.'
};
export function failure(error: unknown) {
  const e = error instanceof CopilotError ? error : new CopilotError('COPILOT_UNAVAILABLE', 503);
  console.error('Copilot request failed', {
    code: e.code,
    error: error instanceof Error ? error.message : String(error),
  });
  return json({
    error: messages[e.code] || 'No se pudo completar la solicitud. Intenta nuevamente.',
    code: e.code
  }, e.status);
}
export async function readBody(req: Request) {
  if (req.method !== 'POST') throw new CopilotError('COPILOT_INVALID', 405);
  if (!req.headers.get('content-type')?.includes('application/json')) throw new CopilotError('COPILOT_INVALID', 415);
  const reader = req.body?.getReader();
  if (!reader) throw new CopilotError('COPILOT_INVALID');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {
      done,
      value
    } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 7500000) {
      await reader.cancel();
      throw new CopilotError('COPILOT_INVALID', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new CopilotError('COPILOT_INVALID');
  }
}
export async function authenticate(req: Request) {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new CopilotError('COPILOT_UNAUTHORIZED', 401);
  const url = Deno.env.get('SUPABASE_URL'),
    key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new CopilotError('COPILOT_CONFIGURATION', 503);
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const {
    data,
    error
  } = await db.auth.getUser(token);
  if (error || !data.user) throw new CopilotError('COPILOT_UNAUTHORIZED', 401);
  const actor = data.user.id;
  const owner = await rpc(db, 'copilot_owner', {
    p_actor: actor
  });
  return {
    db,
    actor,
    owner: String(owner)
  };
}
export type Context = Awaited<ReturnType<typeof authenticate>>;
export async function rpc(db: any, name: string, args: Record<string, unknown>): Promise<any> {
  const {
    data,
    error
  } = await db.rpc(name, args);
  if (error) {
    console.error('RPC error in ' + name, error);
    const code = Object.keys(messages).find(c => error.message?.includes(c));
    throw new CopilotError(code || 'COPILOT_UNAVAILABLE', code === 'COPILOT_QUOTA' || code === 'COPILOT_BUSY' ? 429 : code ? 400 : 503);
  }
  return data;
}
async function stripeGet(path: string) {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new CopilotError('COPILOT_CONFIGURATION', 503);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${key}`
    },
    signal: AbortSignal.timeout(12000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  return await res.json();
}
const planCache = new Map<string, {
  expires: number;
  limits: {
    items: number;
    bins: number;
    locations: number;
  };
}>();
export async function plan(ctx: Context) {
  const {
    data,
    error
  } = await ctx.db.from('subscriptions').select('*').eq('userId', ctx.owner).limit(20);
  if (error) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  for (const sub of (data || []).filter((s: any) => !s.status || ['active', 'trialing'].includes(s.status)).slice(0, 3)) {
    const cacheKey = JSON.stringify([ctx.actor, ctx.owner, sub.planId, sub.stripeSubscriptionId, sub.status]);
    const cached = planCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.limits;
    if (!sub.planId || !/^price_[A-Za-z0-9]+$/.test(sub.planId)) continue;
    // Legacy subscriptions imported from the former billing store do not have
    // a Stripe subscription id. Their active status is the migrated
    // entitlement; requiring a Stripe lookup here would reject every one of
    // those users before the Copilot request reaches Gemini.
    if (!sub.stripeSubscriptionId && sub.status === 'active') {
      const limits = { items: 100, bins: 100, locations: 1000000 };
      planCache.set(cacheKey, { expires: Date.now() + 30000, limits });
      return limits;
    }
    const price = await stripeGet(`prices/${sub.planId}?expand[]=product`);
    if (!price) continue;
    if (price.unit_amount === 0 && (price.active === false || price.product?.active === false)) continue;
    if (price.unit_amount !== 0) {
      if (!/^sub_[A-Za-z0-9]+$/.test(sub.stripeSubscriptionId || '')) continue;
      const live = await stripeGet(`subscriptions/${sub.stripeSubscriptionId}?expand[]=customer`);
      if (!live || !['active', 'trialing'].includes(live.status) || live.customer?.metadata?.userId !== ctx.owner || !live.items?.data?.some((i: any) => i.price?.id === sub.planId)) continue;
    } else if (sub.status && sub.status !== 'active' && sub.status !== 'trialing') continue;
    const metadata = record(price.product?.metadata);
    const cap = (key: string, fallback: number) => {
      const value = metadata[key];
      if (value == null || value === '') return fallback;
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000000) throw new CopilotError('COPILOT_CONFIGURATION', 503);
      return n;
    };
    const limits = {
      items: cap('items', 100) || 100,
      bins: cap('bins', 100),
      locations: cap('locations', 50) || 1000000
    };
    if (planCache.size > 200) planCache.clear();
    planCache.set(cacheKey, {
      expires: Date.now() + 30000,
      limits
    });
    return limits;
  }
  throw new CopilotError('COPILOT_SUBSCRIPTION', 403);
}
export async function inventory(ctx: Context, binId: string | null, search = '', offset = 0, limit = 50, lang = 'en') {
  return await rpc(ctx.db, 'copilot_inventory', {
    p_actor: ctx.actor,
    p_bin_id: binId,
    p_search: search,
    p_offset: offset,
    p_limit: limit,
    p_lang: lang
  });
}
export async function gemini(body: Record<string, unknown>, image = false, timeoutMs = image ? 110000 : 45000, signal?: AbortSignal) {
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get(image ? 'COPILOT_IMAGE_MODEL' : 'COPILOT_CHAT_MODEL') || (image ? 'gemini-2.5-flash-image' : 'gemini-2.5-flash');
  if (!key || !/^[a-zA-Z0-9_.-]+$/.test(model)) throw new CopilotError('COPILOT_CONFIGURATION', 503);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500).replace(/[\r\n]+/g, ' ');
    console.error('Gemini API rejected request', { model, status: response.status, detail });
    const quota = response.status === 429 || response.status === 402;
    throw new CopilotError(quota ? 'COPILOT_QUOTA' : response.status === 401 || response.status === 403 || response.status === 404 ? 'COPILOT_CONFIGURATION' : 'COPILOT_UNAVAILABLE', quota ? 429 : 503);
  }
  const value = await response.json();
  const candidate = value.candidates?.[0];
  if (!candidate?.content?.parts || candidate.finishReason && candidate.finishReason !== 'STOP') throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  return candidate;
}
export const candidateText = (candidate: any) => candidate.content.parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('');
