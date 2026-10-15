// components/NotFoundPage.tsx
import { useNavigate } from "react-router-dom";
import {
  Home,
  ArrowLeft,
  Package,
  QrCode,
  MapPin,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LogoIcon from "@/assets/logo.png";

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full bg-slate-50 relative flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 font-sans">
      {/* Background Subtle Ambient Glow & Dot Grid */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div
          onClick={() => navigate("/home")}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <img
            src={LogoIcon}
            alt="BoxBin"
            className="w-8 h-8 rounded-xl shadow-xs object-cover border border-slate-200 group-hover:scale-105 transition-transform"
          />
          <span className="font-bold text-lg tracking-tight text-slate-900">
            BoxBin
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/home")}
          className="text-xs text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white border border-slate-200/60 rounded-lg shadow-xs"
        >
          <Home className="w-3.5 h-3.5 mr-1.5" />
          <span>Dashboard</span>
        </Button>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full text-center space-y-8">
          {/* Visual Element: Modern Container with QR graphic */}
          <div className="relative inline-block mx-auto">
            {/* Soft backdrop glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-3xl blur-xl opacity-70 -z-10" />

            {/* Card Graphic */}
            <div className="w-32 h-32 mx-auto rounded-3xl bg-white border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col items-center justify-center relative p-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md mb-1.5">
                <Package className="w-8 h-8 text-blue-400" />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                <QrCode className="w-3 h-3 text-slate-400" />
                <span>404:NOT_FOUND</span>
              </div>

              {/* Little floating warning badge */}
              <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md animate-bounce">
                <span className="text-xs font-bold">!</span>
              </div>
            </div>
          </div>

          {/* Heading and details */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Error 404 • Container or route missing</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {t("notFound.title")}
            </h1>

            <p className="text-sm sm:text-base text-slate-500 max-w-md mx-auto leading-relaxed">
              {t("notFound.description")}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-md mx-auto">
            <Button
              onClick={() => navigate("/home")}
              className="w-full sm:w-auto flex-1 h-11 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl shadow-xs transition-all hover:shadow flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>{t("notFound.goHome")}</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto flex-1 h-11 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("notFound.goBack")}</span>
            </Button>
          </div>

          {/* Quick Shortcuts */}
          <div className="pt-6 border-t border-slate-200/80 max-w-md mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Helpful Shortcuts
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => navigate("/locations")}
                className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-white border border-slate-200/80 text-left hover:border-slate-300 hover:shadow-xs transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                    Locations
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Browse warehouses
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate("/smart-labels")}
                className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-white border border-slate-200/80 text-left hover:border-slate-300 hover:shadow-xs transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <QrCode className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 truncate">
                    Smart Labels
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Print & scan QR
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer & Live Status Badge */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-600 font-medium">
            {t("notFound.systemStatus")}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="https://boxbin.io/support/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-600 transition-colors"
          >
            Support
          </a>
          <span>•</span>
          <p>© {new Date().getFullYear()} BoxBin LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default NotFoundPage;