import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import YahooIcon from "@/assets/yahoo.svg";
import LogoIcon from "@/assets/logo.png";
import {
  loginWithGoogle,
  loginWithApple,
  loginWithYahoo,
  auth,
  db,
} from "@/lib/firebase";
import { getRedirectResult } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import {
  QrCode,
  Search,
  Box,
  Bot,
  AlertCircle,
  ArrowRight,
  Sparkles,
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

      if (response?.user) {
        await saveUserToFirestore(response.user);
      }
    } catch (error: any) {
      console.error(`Unexpected login error with ${provider}:`, error);
      toast.error(error.message || `Login error with ${provider}`);
    } finally {
      setIsLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const generateUniqueUsername = async (email: string) => {
    try {
      if (!email) return "";
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");

      while (true) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const username = `${baseUsername}${randomNum}`;

        const q = query(
          collection(db, "users"),
          where("username", "==", username)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          return username;
        }
      }
    } catch (error) {
      console.log(error);
      return email.split("@")[0] || "user";
    }
  };

  const saveUserToFirestore = async (user: any) => {
    try {
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        const username = await generateUniqueUsername(user.email);
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email || "",
          username: username,
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          createdAt: serverTimestamp(),
        });
      } else {
        const userData = userSnapshot.data();
        let updateData: any = {
          email: user.email || userData?.email || "",
          displayName: user.displayName || userData?.displayName || "",
          photoURL: user.photoURL || userData?.photoURL || "",
          lastLogin: serverTimestamp(),
        };

        if (!userData?.username) {
          updateData.username = await generateUniqueUsername(user.email);
        }

        await updateDoc(userRef, updateData);
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          saveUserToFirestore(result.user);
        }
      })
      .catch((error) => {
        console.error("Redirect error:", error);
      });
  }, []);

  // Real features extracted directly from https://boxbin.io/
  const realFeatures = [
    {
      icon: QrCode,
      title: "Scan QR Code",
      desc: "Instantly identify and track your items with our smart QR code system.",
    },
    {
      icon: Search,
      title: "Search Items",
      desc: "Find any item in seconds with powerful search functionality.",
    },
    {
      icon: Box,
      title: "Organize Boxes",
      desc: "Keep your storage spaces neat, efficient, and clearly categorized.",
    },
    {
      icon: Bot,
      title: "AI Smart Lists",
      desc: "Turn your videos & images into itemized lists automatically.",
    },
  ];

  const anyLoading = Object.values(isLoading).some(Boolean);

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 font-sans">
      {/* Background Subtle Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl" />
      </div>

      {/* Top Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <a
          href="https://boxbin.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-3 group"
        >
          <img
            src={LogoIcon}
            alt="BoxBin LLC"
            className="w-9 h-9 rounded-xl shadow-xs object-cover border border-slate-200/80 group-hover:scale-105 transition-transform"
          />
          <div className="flex items-center space-x-2">
            <span className="font-bold text-xl tracking-tight text-slate-900">
              BoxBin
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              Web Dashboard
            </span>
          </div>
        </a>

        <div className="flex items-center space-x-3">
          <LanguageSelector className="h-9 px-3 bg-white/90 border border-slate-200/80 shadow-xs hover:bg-white" />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
        <div className="w-full grid lg:grid-cols-12 gap-12 lg:gap-8 items-center max-w-5xl">
          {/* Left Hero / Real BoxBin Info Showcase */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-7 pr-4">
            <div className="space-y-3.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Smart Storage Companion</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Smart Features for{" "}
                <span className="text-blue-600">Smart Storage</span>
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-md">
                Your smart storage tracking solution for organized living. From
                the web dashboard to mobile (iOS & Android).
              </p>
            </div>

            {/* Real Features from boxbin.io */}
            <div className="grid grid-cols-1 gap-3 pt-1">
              {realFeatures.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-start space-x-3 p-3 rounded-xl bg-white/70 border border-slate-200/70 shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {feature.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Real Testimonial from boxbin.io */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-xs">
              <p className="text-xs text-slate-600 italic leading-relaxed">
                “BoxBin made it simple—I could label, scan, and keep everything
                organized without stress. Finding things later was effortless. It
                saved me so much time and peace of mind.”
              </p>
              <p className="text-[11px] font-semibold text-slate-800 mt-2">
                — Sarah M., Military Spouse (Verified User)
              </p>
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="w-full lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)] p-8 sm:p-10 relative overflow-hidden">
                {/* Accent line */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />

                {/* Mobile-only branding */}
                <div className="lg:hidden text-center mb-6">
                  <img
                    src={LogoIcon}
                    alt="BoxBin LLC"
                    className="w-12 h-12 rounded-2xl shadow-xs object-cover border border-slate-200 mx-auto mb-2"
                  />
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Smart Storage Companion
                  </span>
                </div>

                {/* Header */}
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    {t("auth.welcome")}
                  </h2>
                  <p className="text-sm text-slate-500 mt-2">
                    {t("auth.signInSubtitle")}
                  </p>
                </div>

                {/* Token Error Alert */}
                {hasTokenError && (
                  <div className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs flex items-start space-x-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      Your temporary login session link expired or was already
                      used. Please sign in below to continue.
                    </div>
                  </div>
                )}

                {/* OAuth Login Buttons */}
                <div className="space-y-3.5">
                  {/* Google */}
                  <Button
                    variant="outline"
                    className="w-full h-12 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center relative group"
                    onClick={() => handleOAuthLogin("google")}
                    disabled={anyLoading}
                  >
                    {isLoading.google ? (
                      <div className="flex items-center space-x-2 text-slate-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-700" />
                        <span>Connecting...</span>
                      </div>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5 mr-3 shrink-0"
                          viewBox="0 0 24 24"
                        >
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
                        <span>{t("auth.continueWithGoogle")}</span>
                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-slate-600 transition-colors" />
                      </>
                    )}
                  </Button>

                  {/* Apple */}
                  <Button
                    variant="outline"
                    className="w-full h-12 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center relative group"
                    onClick={() => handleOAuthLogin("apple")}
                    disabled={anyLoading}
                  >
                    {isLoading.apple ? (
                      <div className="flex items-center space-x-2 text-slate-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-700" />
                        <span>Connecting...</span>
                      </div>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5 mr-3 shrink-0 text-slate-900"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                        </svg>
                        <span>{t("auth.continueWithApple")}</span>
                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-slate-600 transition-colors" />
                      </>
                    )}
                  </Button>

                  {/* Yahoo */}
                  <Button
                    variant="outline"
                    className="w-full h-12 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center relative group"
                    onClick={() => handleOAuthLogin("yahoo")}
                    disabled={anyLoading}
                  >
                    {isLoading.yahoo ? (
                      <div className="flex items-center space-x-2 text-slate-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-700" />
                        <span>Connecting...</span>
                      </div>
                    ) : (
                      <>
                        <img
                          src={YahooIcon}
                          alt="Yahoo"
                          className="w-5 h-5 mr-3 shrink-0"
                        />
                        <span>{t("auth.continueWithYahoo")}</span>
                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-slate-600 transition-colors" />
                      </>
                    )}
                  </Button>
                </div>

                {/* Subtitle / Note */}
                <div className="mt-8 pt-5 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-500">
                    Access your account via web or the BoxBin mobile app.
                  </p>
                </div>
              </div>

              {/* Real links to boxbin.io */}
              <div className="flex items-center justify-center space-x-4 text-xs text-slate-500 mt-6">
                <a
                  href="https://boxbin.io/terms-of-service/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-800 transition-colors underline underline-offset-2"
                >
                  Terms of Service
                </a>
                <span>•</span>
                <a
                  href="https://boxbin.io/privacy-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-800 transition-colors underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                <span>•</span>
                <a
                  href="https://boxbin.io/support/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-800 transition-colors underline underline-offset-2"
                >
                  Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} BoxBin LLC. All rights reserved.
      </footer>
    </div>
  );
};

export default LoginPage;
