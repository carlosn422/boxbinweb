import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, ScanLine, Trophy, Mic, X, ExternalLink } from "lucide-react";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/appLinks";
import { cn } from "@/lib/utils";

interface AppDownloadBannerProps {
  /** "hero" is a full card (login); "compact" is a slim strip (home/settings). */
  variant?: "hero" | "compact";
  /** When set, the user can dismiss the banner and the choice is remembered. */
  dismissKey?: string;
  className?: string;
}

function StoreButton({ href, label, store }: { href: string; label: string; store: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xs transition hover:bg-slate-800 active:scale-[0.99]"
    >
      <Smartphone className="w-4 h-4 text-brand-400" aria-hidden="true" />
      <span className="flex flex-col items-start leading-tight text-left">
        <span className="text-[9px] font-medium text-slate-300 uppercase tracking-wide">{label}</span>
        <span>{store}</span>
      </span>
      <ExternalLink className="w-3 h-3 text-slate-400" aria-hidden="true" />
    </a>
  );
}

export function AppDownloadBanner({ variant = "hero", dismissKey, className }: AppDownloadBannerProps) {
  const { t } = useTranslation();
  const storageKey = dismissKey ? `boxbin-app-banner-dismissed:${dismissKey}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!storageKey) return false;
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  // The mobile app embeds some web pages in a WebView: never ask those users to download the app.
  const insideApp = typeof window !== "undefined" && Boolean((window as any).ReactNativeWebView);
  if (dismissed || insideApp) return null;

  const dismiss = () => {
    if (storageKey) { try { localStorage.setItem(storageKey, "1"); } catch { /* storage unavailable */ } }
    setDismissed(true);
  };

  const perks = [
    { icon: ScanLine, text: t("appDownload.perkScan", { defaultValue: "Scan QR labels with your camera" }) },
    { icon: Trophy, text: t("appDownload.perkMissions", { defaultValue: "Missions, acorns and badges" }) },
    { icon: Mic, text: t("appDownload.perkVoice", { defaultValue: "Voice calls with your AI Copilot" }) },
  ];

  if (variant === "compact") {
    return (
      <section
        aria-label={t("appDownload.title", { defaultValue: "Try the BoxBin app" })}
        className={cn(
          "relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3.5 pr-10",
          className
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-100 border border-brand-200 text-brand-700 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              {t("appDownload.compactTitle", { defaultValue: "Get a better experience on the BoxBin app" })}
            </p>
            <p className="text-xs text-slate-600">
              {t("appDownload.compactDesc", { defaultValue: "Scan QR labels, complete missions and talk to your Copilot by voice." })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <StoreButton href={IOS_APP_URL} label={t("appDownload.downloadOn", { defaultValue: "Download on the" })} store="App Store" />
          <StoreButton href={ANDROID_APP_URL} label={t("appDownload.getItOn", { defaultValue: "Get it on" })} store="Google Play" />
        </div>
        {storageKey && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("appDownload.dismiss", { defaultValue: "Dismiss" })}
            className="absolute top-2.5 right-2.5 p-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-brand-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={t("appDownload.title", { defaultValue: "Try the BoxBin app" })}
      className={cn("relative rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-2xs", className)}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-100 border border-brand-200 text-brand-700 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100 border border-brand-200 rounded-full px-2 py-0.5">
            {t("appDownload.badge", { defaultValue: "Better on mobile" })}
          </span>
          <h3 className="text-base font-bold text-slate-900 mt-1.5">
            {t("appDownload.title", { defaultValue: "Try the BoxBin app" })}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed mt-1">
            {t("appDownload.desc", { defaultValue: "The app is the fastest way to catalog your things: point your camera at a QR label and your whole container opens instantly." })}
          </p>
        </div>
      </div>

      <ul className="mt-3.5 space-y-1.5">
        {perks.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2 text-xs text-slate-700">
            <Icon className="w-3.5 h-3.5 text-brand-600 shrink-0" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StoreButton href={IOS_APP_URL} label={t("appDownload.downloadOn", { defaultValue: "Download on the" })} store="App Store" />
        <StoreButton href={ANDROID_APP_URL} label={t("appDownload.getItOn", { defaultValue: "Get it on" })} store="Google Play" />
      </div>
    </section>
  );
}
