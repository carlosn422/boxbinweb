import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, formatSupabaseUser, syncUserProfile } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import LogoIcon from "@/assets/logo.png";
import { ShieldCheck, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const LoginByToken = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refreshUser, setCurrentUser } = useAuth();
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

        let activeUser = null;

        // 1. Try to initialize session with Supabase
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: refreshToken,
          });
          if (data?.session?.user) {
            activeUser = formatSupabaseUser(data.session.user);
          } else if (error) {
            console.warn("setSession warning:", error.message);
          }
        } catch (setErr) {
          console.warn("setSession exception:", setErr);
        }

        // 2. Fallback: If setSession didn't resolve user, verify token directly
        if (!activeUser) {
          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          if (userError || !userData?.user) {
            throw userError || new Error("Failed to initialize session");
          }
          activeUser = formatSupabaseUser(userData.user);
        }

        // 3. Immediately seed and sync AuthContext so route guards don't bounce to /login
        if (activeUser) {
          setCurrentUser(activeUser);
          syncUserProfile(activeUser);
        }

        await refreshUser();

        if (isMounted) {
          setStatusMessage("Redirecting to your workspace...");
        }

        const destination = url || "/home";
        setTimeout(() => {
          navigate(destination, { replace: true });
        }, 300);
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
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between items-center font-sans p-6 selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <div className="w-full max-w-5xl py-4 flex items-center justify-center">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center p-1">
            <img
              src={LogoIcon}
              alt="BoxBin"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg text-slate-900 tracking-tight">
              BoxBin
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">
              App
            </span>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md my-auto">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 sm:p-10 text-center">
          {errorState ? (
            <div className="space-y-6">
              <div className="w-14 h-14 mx-auto bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Authentication Failed
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {errorState}
                </p>
              </div>
              <Button
                onClick={() => navigate("/login?error=invalid_token")}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Lock className="w-5 h-5" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Authenticating Session
                </h3>
                <p className="text-sm text-slate-500">
                  {statusMessage}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>256-bit encrypted authentication</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} BoxBin LLC. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginByToken;
