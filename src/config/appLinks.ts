// Public store links for the BoxBin mobile app. Override per environment with
// VITE_IOS_APP_URL / VITE_ANDROID_APP_URL once the final listings are live.
export const IOS_APP_URL: string =
  (import.meta.env.VITE_IOS_APP_URL as string | undefined) ||
  'https://apps.apple.com/app/boxbin-inventory';

export const ANDROID_APP_URL: string =
  (import.meta.env.VITE_ANDROID_APP_URL as string | undefined) ||
  'https://play.google.com/store/apps/details?id=com.navarroapps.boxbin';

export const LEGAL_LINKS = {
  terms: 'https://boxbin.io/terms-of-service/',
  privacy: 'https://boxbin.io/privacy-policy/',
  support: 'https://boxbin.io/support/',
} as const;
