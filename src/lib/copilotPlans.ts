export type CopilotTier = 'free' | 'starter' | 'plus' | 'pro';

export interface CopilotPlanLimits {
  tier: CopilotTier;
  maxChats: number;
  maxMessagesPerChat: number;
  monthlyMessages: number;
  monthlyUploads: number;
  monthlyVideos: number;
  monthlyImages: number;
  monthlyVoiceMinutes: number;
  maxCallMinutes: number;
}

export const COPILOT_TOKEN_COSTS = {
  chat: 50,
  upload: 100,
  image: 500,
  voiceBlock30s: 300,
  voicePerMin: 600,
  video30s: 500,
} as const;

const DEFAULTS: Record<CopilotTier, Omit<CopilotPlanLimits, 'tier'>> = {
  free: {
    maxChats: 2,
    maxMessagesPerChat: 20,
    monthlyMessages: 15,
    monthlyUploads: 2,
    monthlyVideos: 0,
    monthlyImages: 1,
    monthlyVoiceMinutes: 0,
    maxCallMinutes: 2,
  },
  starter: {
    maxChats: 5,
    maxMessagesPerChat: 30,
    monthlyMessages: 60,
    monthlyUploads: 8,
    monthlyVideos: 1,
    monthlyImages: 3,
    monthlyVoiceMinutes: 4,
    maxCallMinutes: 2,
  },
  plus: {
    maxChats: 10,
    maxMessagesPerChat: 36,
    monthlyMessages: 150,
    monthlyUploads: 20,
    monthlyVideos: 2,
    monthlyImages: 7,
    monthlyVoiceMinutes: 10,
    maxCallMinutes: 5,
  },
  pro: {
    maxChats: 20,
    maxMessagesPerChat: 44,
    monthlyMessages: 350,
    monthlyUploads: 50,
    monthlyVideos: 5,
    monthlyImages: 15,
    monthlyVoiceMinutes: 20,
    maxCallMinutes: 10,
  },
};

export function inferPlanTier(planName = '', unitAmountCents = 0): CopilotTier {
  const name = planName.toLowerCase();
  if (/\bpro\b|enterprise|business/.test(name)) return 'pro';
  if (/\bplus\b/.test(name)) return 'plus';
  if (/\bstarter\b|\bbasic\b|\bbásico\b/.test(name)) return 'starter';
  if (/\bfree\b|\btrial\b|\bgratis\b/.test(name)) return 'free';
  if (unitAmountCents >= 1200) return 'pro';
  if (unitAmountCents >= 700) return 'plus';
  if (unitAmountCents > 0) return 'starter';
  return 'free';
}

export function resolvePlanCopilotLimits(
  planName = '',
  unitAmountCents = 0,
  metadata: Record<string, any> = {}
): CopilotPlanLimits {
  const tier = inferPlanTier(planName, unitAmountCents);
  const base = DEFAULTS[tier];
  const pick = (key: string, fallback: number, min: number, max: number) => {
    const raw = metadata?.[key];
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    tier,
    maxChats: pick('ai_chats', base.maxChats, 1, 200),
    maxMessagesPerChat: pick('ai_msgs_per_chat', base.maxMessagesPerChat, 2, 50),
    monthlyMessages: pick('ai_msgs_month', base.monthlyMessages, 0, 100000),
    monthlyUploads: pick('ai_uploads_month', base.monthlyUploads, 0, 100000),
    monthlyVideos: pick('ai_videos_month', base.monthlyVideos, 0, 10000),
    monthlyImages: pick('ai_images_month', base.monthlyImages, 0, 10000),
    monthlyVoiceMinutes: pick('ai_voice_mins_month', base.monthlyVoiceMinutes, 0, 10000),
    maxCallMinutes: pick('ai_max_call_mins', base.maxCallMinutes, 1, 60),
  };
}
