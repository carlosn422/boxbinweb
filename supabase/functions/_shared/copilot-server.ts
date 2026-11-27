import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { assistantNameText, CopilotError, DEFAULT_ASSISTANT_NAME, record } from './copilot-contract.ts';
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
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
export const COPILOT_TOKEN_COSTS = {
  chat: 50,
  upload: 100,
  image: 500,
  voiceBlock30s: 200,
  voicePerMin: 400,
  video30s: 500
} as const;

export type CopilotTier = 'free' | 'starter' | 'plus' | 'pro';

export interface CopilotEntitlements {
  tier: CopilotTier;
  planName: string;
  maxChats: number;
  maxMessagesPerChat: number;
  monthlyMessages: number;
  monthlyUploads: number;
  monthlyVideos: number;
  monthlyImages: number;
  monthlyVoiceSeconds: number;
  maxCallSeconds: number;
  periodStart?: string;
  periodEnd?: string;
}

export const COPILOT_TIER_DEFAULTS: Record<CopilotTier, Omit<CopilotEntitlements, 'tier' | 'planName' | 'periodStart' | 'periodEnd'>> = {
  free: {
    maxChats: 2,
    maxMessagesPerChat: 20,
    monthlyMessages: 15,
    monthlyUploads: 2,
    monthlyVideos: 0,
    monthlyImages: 1,
    monthlyVoiceSeconds: 60,
    maxCallSeconds: 120
  },
  starter: {
    maxChats: 5,
    maxMessagesPerChat: 30,
    monthlyMessages: 60,
    monthlyUploads: 8,
    monthlyVideos: 1,
    monthlyImages: 3,
    monthlyVoiceSeconds: 240,
    maxCallSeconds: 120
  },
  plus: {
    maxChats: 10,
    maxMessagesPerChat: 36,
    monthlyMessages: 150,
    monthlyUploads: 20,
    monthlyVideos: 2,
    monthlyImages: 7,
    monthlyVoiceSeconds: 600,
    maxCallSeconds: 300
  },
  pro: {
    maxChats: 20,
    maxMessagesPerChat: 44,
    monthlyMessages: 350,
    monthlyUploads: 50,
    monthlyVideos: 5,
    monthlyImages: 15,
    monthlyVoiceSeconds: 1200,
    maxCallSeconds: 600
  }
};

export function inferCopilotTier(planName = '', unitAmount = 0): CopilotTier {
  const name = planName.toLowerCase();
  if (/\bpro\b|enterprise|business/.test(name)) return 'pro';
  if (/\bplus\b/.test(name)) return 'plus';
  if (/\bstarter\b|\bbasic\b|\bbásico\b/.test(name)) return 'starter';
  if (/\bfree\b|\btrial\b|\bgratis\b/.test(name)) return 'free';
  if (unitAmount >= 1200) return 'pro';
  if (unitAmount >= 700) return 'plus';
  if (unitAmount > 0) return 'starter';
  return 'free';
}

export function resolveCopilotEntitlements(
  planName: string,
  unitAmount: number,
  metadata: Record<string, unknown> = {}
): CopilotEntitlements {
  const tier = inferCopilotTier(planName, unitAmount);
  const base = COPILOT_TIER_DEFAULTS[tier];
  const metaInt = (key: string, fallback: number, min: number, max: number) => {
    const raw = metadata[key];
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) return fallback;
    return n;
  };
  const voiceMins = metaInt('ai_voice_mins_month', Math.round(base.monthlyVoiceSeconds / 60), 0, 10000);
  const maxCallMins = metaInt('ai_max_call_mins', Math.round(base.maxCallSeconds / 60), 1, 60);
  return {
    tier,
    planName: planName || (tier === 'free' ? 'Free Trial' : tier[0].toUpperCase() + tier.slice(1)),
    maxChats: metaInt('ai_chats', base.maxChats, 1, 200),
    maxMessagesPerChat: metaInt('ai_msgs_per_chat', base.maxMessagesPerChat, 2, 50),
    monthlyMessages: metaInt('ai_msgs_month', base.monthlyMessages, 0, 100000),
    monthlyUploads: metaInt('ai_uploads_month', base.monthlyUploads, 0, 100000),
    monthlyVideos: metaInt('ai_videos_month', base.monthlyVideos, 0, 10000),
    monthlyImages: metaInt('ai_images_month', base.monthlyImages, 0, 10000),
    monthlyVoiceSeconds: voiceMins * 60,
    maxCallSeconds: maxCallMins * 60
  };
}

export const DEFAULT_COPILOT_ENTITLEMENTS: CopilotEntitlements = resolveCopilotEntitlements('Starter', 499, {});

const messages: Record<string, string> = {
  COPILOT_UNAUTHORIZED: 'Inicia sesión para usar el copiloto.',
  COPILOT_INVALID: 'Revisa los datos de la solicitud.',
  COPILOT_NOT_FOUND: 'El registro no existe o no pertenece a tu cuenta.',
  COPILOT_QUOTA: 'Se alcanzó un límite de uso del asistente. Intenta más tarde.',
  COPILOT_DAILY_QUOTA: 'Alcanzaste el límite diario de BoxBin para chat y voz. Se renueva a las 00:00 UTC.',
  COPILOT_VOICE_QUOTA: 'Alcanzaste el límite de conexiones de voz. Intenta más tarde o compra tokens para continuar.',
  COPILOT_IMAGE_QUOTA: 'Alcanzaste el límite de imágenes incluidas en tu plan.',
  COPILOT_INSUFFICIENT_TOKENS: 'Agotaste la cuota mensual de tu plan y no tienes suficientes tokens IA para esta acción.',
  COPILOT_CHAT_LIMIT: 'Alcanzaste el límite de chats guardados de tu plan para este ciclo. Podrás borrar chats anteriores cuando se renueve tu suscripción.',
  COPILOT_DELETE_LOCKED: 'Los chats creados en este ciclo solo se pueden borrar cuando se renueve tu suscripción.',
  COPILOT_MESSAGE_LIMIT: 'Alcanzaste el límite de mensajes por conversación de tu plan. Abre un chat nuevo o compra tokens IA.',
  COPILOT_CALL_TIME_LIMIT: 'Esta llamada alcanzó el tiempo máximo permitido por sesión. Puedes iniciar una nueva llamada.',
  COPILOT_PROVIDER_QUOTA: 'El proveedor de IA alcanzó su cuota o límite de solicitudes. Intenta más tarde; si continúa, el administrador debe revisar la cuota del servicio.',
  COPILOT_AUDIO_RATE: 'Se interrumpió la llamada porque el audio llegó demasiado rápido. Inicia una nueva llamada.',
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
    code: e.code,
    ...(e.details || {})
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
const ownerCache = new Map<string, { owner: string; expires: number }>();

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
  const cachedOwner = ownerCache.get(actor);
  let owner: string;
  if (cachedOwner && cachedOwner.expires > Date.now()) {
    owner = cachedOwner.owner;
  } else {
    owner = String(await rpc(db, 'copilot_owner', { p_actor: actor }));
    if (ownerCache.size > 500) ownerCache.clear();
    ownerCache.set(actor, { owner, expires: Date.now() + 300000 });
  }
  return {
    db,
    actor,
    owner
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
    if (code === 'COPILOT_QUOTA') {
      const kind = args.p_kind;
      const quotaCode = name === 'copilot_claim_image' || name === 'copilot_claim_image_v2' || kind === 'image' ? 'COPILOT_IMAGE_QUOTA'
        : kind === 'live_connections' || kind === 'voice_seconds' ? 'COPILOT_VOICE_QUOTA'
        : kind === 'chat' ? 'COPILOT_DAILY_QUOTA' : 'COPILOT_QUOTA';
      throw new CopilotError(quotaCode, 429);
    }
    if (code === 'COPILOT_INSUFFICIENT_TOKENS') {
      throw new CopilotError('COPILOT_INSUFFICIENT_TOKENS', 402, {
        ...(typeof args.p_token_cost === 'number' ? { requiredTokens: args.p_token_cost } : {}),
        ...(typeof args.p_kind === 'string' ? { kind: args.p_kind } : {})
      });
    }
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
export interface PlanLimits {
  items: number;
  bins: number;
  locations: number;
  copilot: CopilotEntitlements;
}
const planCache = new Map<string, {
  expires: number;
  limits: PlanLimits;
}>();
function utcMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}
const PLAN_MEMORY_TTL_MS = 300000; // 5 minutes in warm isolate
const PLAN_DB_TTL_MS = 900000; // 15 minutes persisted across cold starts (invalidated immediately if subscriptions row changes)

function isValidCachedLimits(v: unknown): v is PlanLimits {
  const r = record(v);
  const c = record(r.copilot);
  return (
    typeof r.items === 'number' &&
    typeof r.bins === 'number' &&
    typeof r.locations === 'number' &&
    typeof c.tier === 'string' &&
    typeof c.monthlyMessages === 'number' &&
    typeof c.monthlyVoiceSeconds === 'number'
  );
}

async function syncEntitlements(
  ctx: Context,
  copilot: CopilotEntitlements,
  cache?: { subKey: string; limits: PlanLimits }
) {
  if (!ctx.db?.rpc) return;
  try {
    const synced = await ctx.db.rpc('copilot_sync_entitlements', {
      p_actor: ctx.actor,
      p_tier: copilot.tier,
      p_plan_name: copilot.planName,
      p_max_chats: copilot.maxChats,
      p_max_messages_per_chat: copilot.maxMessagesPerChat,
      p_period_start: copilot.periodStart || null,
      p_period_end: copilot.periodEnd || null
    });
    if (synced?.error) throw synced.error;
    if (cache && ctx.db?.from) {
      const saved = await ctx.db
        .from('copilot_entitlements')
        .update({
          cached_sub_key: cache.subKey,
          cached_limits: cache.limits,
          cached_expires_at: new Date(Date.now() + PLAN_DB_TTL_MS).toISOString()
        })
        .eq('actor', ctx.actor);
      if (saved?.error) throw saved.error;
    }
  } catch (e) {
    console.error('Failed to sync copilot entitlements', e);
  }
}

function persistEntitlements(ctx: Context, copilot: CopilotEntitlements, cache: { subKey: string; limits: PlanLimits }) {
  const pending = syncEntitlements(ctx, copilot, cache);
  // Register background persistence so the worker can finish it after responding.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (task: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(pending);
}

export async function plan(ctx: Context): Promise<PlanLimits> {
  const [subRes, entRes] = await Promise.all([
    ctx.db.from('subscriptions').select('*').eq('userId', ctx.owner).limit(20),
    ctx.db?.from
      ? ctx.db
          .from('copilot_entitlements')
          .select('cached_sub_key, cached_limits, cached_expires_at')
          .eq('actor', ctx.actor)
          .maybeSingle()
          .then((r: any) => r?.data || null, () => null)
      : Promise.resolve(null)
  ]);
  const { data, error } = subRes;
  if (error) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  const now = Date.now();
  const dbCachedKey = typeof entRes?.cached_sub_key === 'string' ? entRes.cached_sub_key : null;
  const dbCachedExp = entRes?.cached_expires_at ? Date.parse(entRes.cached_expires_at) : 0;
  const dbCachedLimits = isValidCachedLimits(entRes?.cached_limits) ? entRes.cached_limits : null;

  for (const sub of (data || []).filter((s: any) => !s.status || ['active', 'trialing'].includes(s.status)).slice(0, 3)) {
    const cacheKey = JSON.stringify([ctx.actor, ctx.owner, sub.planId, sub.stripeSubscriptionId, sub.status]);
    const cached = planCache.get(cacheKey);
    if (cached && cached.expires > now) return cached.limits;
    if (dbCachedLimits && dbCachedKey === cacheKey && dbCachedExp > now) {
      if (planCache.size > 200) planCache.clear();
      planCache.set(cacheKey, { expires: Math.min(now + PLAN_MEMORY_TTL_MS, dbCachedExp), limits: dbCachedLimits });
      return dbCachedLimits;
    }
    if (!sub.planId || !/^price_[A-Za-z0-9]+$/.test(sub.planId)) continue;
    // Free plans activated via activate_free and legacy migrated rows do not
    // have a Stripe subscription id. Read the Stripe price when available so
    // Free Trial / legacy plans receive accurate tier quotas without failing
    // if a legacy price id was removed in Stripe.
    if (!sub.stripeSubscriptionId && sub.status === 'active') {
      let price: any = null;
      try {
        price = await stripeGet(`prices/${sub.planId}?expand[]=product`);
      } catch {
        price = null;
      }
      const metadata = record(price?.product?.metadata);
      const cap = (key: string, fallback: number) => {
        const value = metadata[key];
        if (value == null || value === '') return fallback;
        const n = Number(value);
        return Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : fallback;
      };
      const cycle = utcMonthWindow();
      const baseCopilot = price
        ? resolveCopilotEntitlements(String(price.product?.name || 'Free Trial'), Number(price.unit_amount || 0), metadata)
        : resolveCopilotEntitlements('Free Trial', 0, {});
      const copilot: CopilotEntitlements = { ...baseCopilot, ...cycle };
      const limits: PlanLimits = {
        items: cap('items', 100) || 100,
        bins: cap('bins', 100),
        locations: cap('locations', 1000000) || 1000000,
        copilot
      };
      if (planCache.size > 200) planCache.clear();
      planCache.set(cacheKey, { expires: Date.now() + PLAN_MEMORY_TTL_MS, limits });
      persistEntitlements(ctx, copilot, { subKey: cacheKey, limits });
      return limits;
    }
    const hasStripeSub = /^sub_[A-Za-z0-9]+$/.test(sub.stripeSubscriptionId || '');
    const [price, live] = await Promise.all([
      stripeGet(`prices/${sub.planId}?expand[]=product`),
      hasStripeSub ? stripeGet(`subscriptions/${sub.stripeSubscriptionId}?expand[]=customer`) : Promise.resolve(null)
    ]);
    if (!price) continue;
    if (price.unit_amount === 0 && (price.active === false || price.product?.active === false)) continue;
    let cycle = utcMonthWindow();
    if (price.unit_amount !== 0) {
      if (!hasStripeSub) continue;
      if (!live || !['active', 'trialing'].includes(live.status) || live.customer?.metadata?.userId !== ctx.owner || !live.items?.data?.some((i: any) => i.price?.id === sub.planId)) continue;
      if (typeof live.current_period_start === 'number' && typeof live.current_period_end === 'number') {
        cycle = {
          periodStart: new Date(live.current_period_start * 1000).toISOString(),
          periodEnd: new Date(live.current_period_end * 1000).toISOString()
        };
      }
    } else if (sub.status && sub.status !== 'active' && sub.status !== 'trialing') continue;
    const metadata = record(price.product?.metadata);
    const cap = (key: string, fallback: number) => {
      const value = metadata[key];
      if (value == null || value === '') return fallback;
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000000) throw new CopilotError('COPILOT_CONFIGURATION', 503);
      return n;
    };
    const copilot: CopilotEntitlements = {
      ...resolveCopilotEntitlements(String(price.product?.name || ''), Number(price.unit_amount || 0), metadata),
      ...cycle
    };
    const limits: PlanLimits = {
      items: cap('items', 100) || 100,
      bins: cap('bins', 100),
      locations: cap('locations', 50) || 1000000,
      copilot
    };
    if (planCache.size > 200) planCache.clear();
    planCache.set(cacheKey, {
      expires: Date.now() + PLAN_MEMORY_TTL_MS,
      limits
    });
    persistEntitlements(ctx, copilot, { subKey: cacheKey, limits });
    return limits;
  }
  throw new CopilotError('COPILOT_SUBSCRIPTION', 403);
}
export async function getAssistantName(ctx: Context): Promise<{ name: string; isCustom: boolean }> {
  if (!ctx.db?.from) return { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
  try {
    const { data, error } = await ctx.db
      .from('copilot_preferences')
      .select('assistant_name')
      .eq('actor', ctx.actor)
      .maybeSingle();
    if (error || !data?.assistant_name) {
      return { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
    }
    const clean = String(data.assistant_name).trim();
    if (!clean) return { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
    return {
      name: clean,
      isCustom: clean.toLowerCase() !== DEFAULT_ASSISTANT_NAME.toLowerCase(),
    };
  } catch {
    return { name: DEFAULT_ASSISTANT_NAME, isCustom: false };
  }
}
export async function setAssistantName(ctx: Context, rawName: unknown): Promise<string> {
  const clean = assistantNameText(rawName);
  const saved = await rpc(ctx.db, 'copilot_set_assistant_name', {
    p_actor: ctx.actor,
    p_name: clean,
  });
  return typeof saved === 'string' && saved.trim() ? saved.trim() : clean;
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
export function fastThinkingConfig(): Record<string, unknown> {
  return { thinkingBudget: 0 };
}
export async function gemini(body: Record<string, unknown>, image = false, timeoutMs = image ? 110000 : 45000, signal?: AbortSignal) {
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get(image ? 'COPILOT_IMAGE_MODEL' : 'COPILOT_CHAT_MODEL') || (image ? 'gemini-2.5-flash-image' : 'gemini-3.8-flash');
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
    throw new CopilotError(quota ? 'COPILOT_PROVIDER_QUOTA' : response.status === 401 || response.status === 403 || response.status === 404 ? 'COPILOT_CONFIGURATION' : 'COPILOT_UNAVAILABLE', quota ? 429 : 503);
  }
  const value = await response.json();
  const candidate = value.candidates?.[0];
  if (!candidate?.content?.parts || candidate.finishReason && candidate.finishReason !== 'STOP') throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  return candidate;
}
export const candidateText = (candidate: any) => candidate.content.parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('');
