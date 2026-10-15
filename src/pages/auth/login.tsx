import { useState } from "react";
import { Button } from "@/components/ui/button";
import { loginWithGoogle, loginWithApple, loginWithYahoo } from "@/lib/supabase";
import YahooIcon from "@/assets/yahoo.svg";
import LogoIcon from "@/assets/logo.png";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import {
  QrCode,
  Search,
  Box,
  Bot,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Layers,
  MapPin,
  ExternalLink,
} from "lucide-react";

const LoginPage = () => {
  const [isLoading, setIsLoading] = useState<{
    google: boolean;
    apple: boolean;
    yahoo: boolean;
  }>({
    google: false,
    apple: false,
    yahoo: false,
  });
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const hasTokenError = searchParams.get("error") === "invalid_token";

  const handleOAuthLogin = async (provider: "google" | "apple" | "yahoo") => {
    setIsLoading((prev) => ({ ...prev, [provider]: true }));

    try {
      let response;
      if (provider === "google") response = await loginWithGoogle();
      if (provider === "apple") response = await loginWithApple();
      if (provider === "yahoo") response = await loginWithYahoo();

      if (response?.error) {
        console.error(`Login error with ${provider}:`, response.error);
        toast.error(`Login error with ${provider}`);
        return;
      }
    } catch (error: any) {
      console.error(`Unexpected login error with ${provider}:`, error);
      toast.error(error.message || `Login error with ${provider}`);
    } finally {
      setIsLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const realFeatures = [
    {
      icon: QrCode,
      title: "Smart QR Codes",
      desc: "Instant physical-to-digital inventory mapping with scan tags.",
      badge: "Fast Scan",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Bot,
      title: "AI Vision & Itemization",
      desc: "Extract, categorize, and price items automatically from photos & video.",
      badge: "Gemini AI",
      color: "from-purple-500 to-indigo-500",
    },
    {
      icon: Box,
      title: "Container Tracking",
      desc: "Organize bins, boxes, shelves, and spaces with zero friction.",
      badge: "Spatial Cloud",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: Search,
      title: "Universal Instant Search",
      desc: "Locate any tool, document, or item across all locations in seconds.",
      badge: "Real-time",
      color: "from-amber-500 to-orange-500",
    },
  ];

  const anyLoading = Object.values(isLoading).some(Boolean);

  return (
    <div className="min-h-screen w-full bg-slate-50 relative flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 font-sans overflow-x-hidden">
      {/* Background Animated Gradient Mesh & Ambient Canvas */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
        
        {/* Glowing Orbs */}
        <motion.div
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -30, 20, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -left-32 w-[34rem] h-[34rem] bg-gradient-to-tr from-blue-400/25 via-indigo-300/20 to-purple-400/15 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -50, 30, 0],
            y: [0, 40, -30, 0],
            scale: [1, 1.15, 0.9, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 -right-40 w-[38rem] h-[38rem] bg-gradient-to-br from-indigo-300/25 via-cyan-300/20 to-blue-400/15 rounded-full blur-3xl"
        />
        <div className="absolute -bottom-32 left-1/3 w-[30rem] h-[30rem] bg-emerald-200/20 rounded-full blur-3xl" />
      </div>

      {/* Modern Floating Top Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between relative z-20">
        <motion.a
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          href="https://boxbin.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-3.5 group"
        >
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />
            <img
              src={LogoIcon}
              alt="BoxBin"
              className="relative w-10 h-10 rounded-xl shadow-sm object-cover border border-white/60 group-hover:scale-105 transition-transform"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                BoxBin
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-700 border border-blue-200/60 uppercase tracking-wider">
                Cloud
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              Smart Storage & Inventory
            </span>
          </div>
        </motion.a>

        {/* Header Right Actions */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center space-x-3"
        >
          <div className="hidden md:flex items-center space-x-2 text-xs font-medium text-slate-600 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-200/80 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Supabase Cloud Active</span>
          </div>
          <LanguageSelector className="h-9 px-3 bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs hover:bg-white rounded-xl text-xs font-semibold text-slate-700" />
        </motion.div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 flex items-center justify-center relative z-10">
        <div className="w-full grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-6xl">
          
          {/* Left Hero / Brand Showcase */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="hidden lg:flex lg:col-span-7 flex-col justify-center space-y-7 pr-2"
          >
            {/* Pill Tag */}
            <div className="space-y-3.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/80 text-blue-700 text-xs font-semibold shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />
                <span>AI-Powered Spatial Storage System</span>
              </div>

              <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 leading-[1.15]">
                Smart features for{" "}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  effortless storage
                </span>
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-lg">
                Instantly catalog, track, and locate physical belongings across garages,
                warehouses, and closets using intelligent computer vision and QR labels.
              </p>
            </div>

            {/* Interactive Live Preview Mockup Glass Widget */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="relative p-[1px] rounded-2xl bg-gradient-to-r from-blue-500/30 via-indigo-500/20 to-purple-500/30 shadow-lg"
            >
              <div className="bg-white/85 backdrop-blur-xl p-5 rounded-[15px] border border-white/60 space-y-3.5">
                {/* Mockup Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                      <Box className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        Workshop Container #12
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" /> Zone A • Shelf 3
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 bg-blue-50 border border-blue-200/70 text-blue-700 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>BIN-9428</span>
                  </div>
                </div>

                {/* Mockup Items Preview Pills */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/90 border border-slate-200/70">
                    <span className="font-medium text-slate-800 truncate">Dewalt 20V Drill</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">100% AI</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/90 border border-slate-200/70">
                    <span className="font-medium text-slate-800 truncate">Ratchet Socket Set</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">100% AI</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/90 border border-slate-200/70">
                    <span className="font-medium text-slate-800 truncate">Laser Distance Meter</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">98% AI</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/70 border border-blue-200/70 text-blue-700">
                    <span className="font-medium">+ 14 more items</span>
                    <span className="text-[10px] font-bold font-mono">$1,280</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {realFeatures.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={idx}
                    whileHover={{ scale: 1.015, y: -2 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col p-3.5 rounded-xl bg-white/75 backdrop-blur-md border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-full">
                        {feature.badge}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {feature.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      {feature.desc}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Verified Testimonial Quote */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-white/90 to-slate-50/90 backdrop-blur-md border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 ring-2 ring-blue-200">
                SM
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 italic line-clamp-2">
                  “BoxBin made it effortless—I could label, scan, and keep our entire home inventory organized without stress.”
                </p>
                <div className="flex items-center space-x-1.5 mt-1">
                  <span className="text-[11px] font-bold text-slate-900">Sarah M.</span>
                  <span className="text-[10px] text-slate-400">• Verified User</span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 inline" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Premium Auth Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="w-full lg:col-span-5 flex justify-center"
          >
            <div className="w-full max-w-md">
              {/* Card Container with Gradient Border & Glow */}
              <div className="relative rounded-3xl p-[1px] bg-gradient-to-b from-blue-500/30 via-indigo-500/15 to-slate-200 shadow-2xl backdrop-blur-xl">
                <div className="bg-white/95 rounded-[23px] p-8 sm:p-9 backdrop-blur-2xl relative overflow-hidden">
                  
                  {/* Subtle top ambient glow inside card */}
                  <div className="absolute top-0 right-0 w-44 h-44 bg-gradient-to-bl from-blue-100/60 to-transparent rounded-full blur-2xl pointer-events-none -z-0" />

                  {/* Mobile-only branding banner */}
                  <div className="lg:hidden text-center mb-6">
                    <img
                      src={LogoIcon}
                      alt="BoxBin"
                      className="w-12 h-12 rounded-2xl shadow-sm object-cover border border-slate-200 mx-auto mb-2.5"
                    />
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                      <Sparkles className="w-3 h-3 text-blue-600" />
                      <span>Smart Storage Companion</span>
                    </div>
                  </div>

                  {/* Header Title */}
                  <div className="text-center mb-8 relative z-10">
                    <div className="hidden lg:flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 mx-auto mb-4 items-center justify-center shadow-md shadow-blue-500/20 text-white">
                      <Layers className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {t("auth.welcome") || "Welcome to BoxBin"}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-2 font-medium">
                      {t("auth.signInSubtitle") || "Sign in to access your containers and smart inventory"}
                    </p>
                  </div>

                  {/* Token Expired / Invalid Alert */}
                  {hasTokenError && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start space-x-2.5 shadow-xs"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        Your temporary login session link expired or was already used. Please sign in below to continue.
                      </div>
                    </motion.div>
                  )}

                  {/* OAuth Provider Action Buttons */}
                  <div className="space-y-3.5 relative z-10">
                    {/* Google */}
                    <Button
                      variant="outline"
                      className="w-full h-12 bg-white hover:bg-slate-50/90 border-slate-200 hover:border-slate-300 text-slate-800 font-semibold text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-between px-4 group relative overflow-hidden"
                      onClick={() => handleOAuthLogin("google")}
                      disabled={anyLoading}
                    >
                      <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                        <span>{t("auth.continueWithGoogle") || "Continue with Google"}</span>
                      </div>

                      {isLoading.google ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-blue-600" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                      )}
                    </Button>

                    {/* Apple */}
                    <Button
                      variant="outline"
                      className="w-full h-12 bg-slate-900 hover:bg-black border-slate-900 text-white font-semibold text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-between px-4 group"
                      onClick={() => handleOAuthLogin("apple")}
                      disabled={anyLoading}
                    >
                      <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5 shrink-0 fill-current text-white" viewBox="0 0 24 24">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                        </svg>
                        <span>{t("auth.continueWithApple") || "Continue with Apple"}</span>
                      </div>

                      {isLoading.apple ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-600 border-t-white" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      )}
                    </Button>

                    {/* Yahoo */}
                    <Button
                      variant="outline"
                      className="w-full h-12 bg-white hover:bg-purple-50/50 border-slate-200 hover:border-purple-200 text-slate-800 font-semibold text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-between px-4 group"
                      onClick={() => handleOAuthLogin("yahoo")}
                      disabled={anyLoading}
                    >
                      <div className="flex items-center space-x-3">
                        <img src={YahooIcon} alt="Yahoo" className="w-5 h-5 shrink-0" />
                        <span>{t("auth.continueWithYahoo") || "Continue with Yahoo"}</span>
                      </div>

                      {isLoading.yahoo ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-purple-600" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
                      )}
                    </Button>
                  </div>

                  {/* Security Assurance Badge */}
                  <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center space-x-2 text-[11px] font-medium text-slate-500">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Supabase Auth Protected • 256-bit Encryption</span>
                  </div>
                </div>
              </div>

              {/* Official Links */}
              <div className="flex items-center justify-center space-x-4 text-xs text-slate-500 mt-6 font-medium">
                <a
                  href="https://boxbin.io/terms-of-service/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  Terms of Service
                </a>
                <span>•</span>
                <a
                  href="https://boxbin.io/privacy-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors"
                >
                  Privacy Policy
                </a>
                <span>•</span>
                <a
                  href="https://boxbin.io/support/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                >
                  Support
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-5 text-center text-xs text-slate-400 font-medium">
        © {new Date().getFullYear()} BoxBin LLC. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage;
