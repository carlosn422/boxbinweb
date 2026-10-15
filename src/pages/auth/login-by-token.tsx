// src/pages/auth/login-by-token.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import LogoIcon from "@/assets/logo.png";
import { ShieldCheck, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const LoginByToken = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [statusMessage, setStatusMessage] = useState<string>(
    t("messages.loadingAccount") || "Authenticating your secure session..."
  );
  const [errorState, setErrorState] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const doLogin = async () => {
      const token = searchParams.get("token");
      const refreshToken = searchParams.get("refresh_token") || "";
      const url = searchParams.get("url");

      if (!token) {
        navigate("/login?error=invalid_token", { replace: true });
        return;
      }

      try {
        if (isMounted) {
          setStatusMessage("Validating authorization token...");
        }

        // Establecer sesión en Supabase Auth
        const { error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: refreshToken,
        });

        if (error) {
          throw error;
        }

        if (isMounted) {
          setStatusMessage("Redirecting to your workspace...");
        }

        setTimeout(() => {
          navigate(url || "/billing", { replace: true });
        }, 500);
      } catch (e: any) {
        console.error("Login by token failed:", e);
        if (isMounted) {
          setErrorState(
            "The authorization link is invalid or has already expired."
          );
        }
        setTimeout(() => {
          navigate("/login?error=invalid_token", { replace: true });
        }, 3000);
      }
    };

    doLogin();

    return () => {
      isMounted = false;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between items-center selection:bg-blue-100 selection:text-blue-900 font-sans p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-blue-100/50 via-indigo-100/40 to-slate-100/60 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-5xl py-6 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <img
            src={LogoIcon}
            alt="BoxBin"
            className="w-8 h-8 rounded-xl shadow-xs object-cover border border-slate-200"
          />
          <span className="font-bold text-lg tracking-tight text-slate-900">
            BoxBin
          </span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)] p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600" />

          {errorState ? (
            <div className="space-y-6">
              <div className="w-16 h-16 mx-auto bg-amber-50 rounded-2xl border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-xs">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">
                  Authentication Failed
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {errorState}
                </p>
              </div>
              <Button
                onClick={() => navigate("/login?error=invalid_token")}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm text-sm font-medium transition-all"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin" />
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 shadow-xs">
                  <Lock className="w-5 h-5 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Authenticating Session
                </h3>
                <p className="text-sm text-slate-500 transition-all duration-300">
                  {statusMessage}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200/70 text-xs text-slate-500 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>256-bit End-to-End Encrypted</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="w-full max-w-5xl py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} BoxBin LLC. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginByToken;
