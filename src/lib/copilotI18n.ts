import i18n from 'i18next';
import english from '@/locales/en/translation.json';

export type CopilotLanguage = 'en' | 'es';
export const copilotLanguage = (value: unknown = i18n.resolvedLanguage || i18n.language): CopilotLanguage =>
  typeof value === 'string' && /^es(?:-|$)/i.test(value) ? 'es' : 'en';

// Services use the same i18next instance as LanguageSelector. Never cache translated
// strings at module load: the selected language can change without a page reload.
export function copilotText(key: string, values: Record<string, string | number> = {}, language: CopilotLanguage = copilotLanguage()): string {
  return String(i18n.t(`copilot.${key}`, {
    ...values,
    lng: language,
    defaultValue: (english.copilot as Record<string, string>)[key] || key,
  }));
}

export function copilotError(code: unknown): string {
  const key = typeof code === 'string' && Object.prototype.hasOwnProperty.call(english.copilot, code) ? code : 'connectionError';
  return copilotText(key);
}
