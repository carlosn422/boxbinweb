// src/pages/login-by-token.tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";

const LoginByToken = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const doLogin = async () => {
      const idToken = searchParams.get("token");
      const url = searchParams.get("url");
      if (!idToken) {
        return navigate("/login");
      }

      try {
        const functions = getFunctions();
        const mint = httpsCallable(functions, "mintCustomToken");
        const result: any = await mint({ idToken });
        const customToken: string = result?.data?.customToken;

        const auth = getAuth();
        await signInWithCustomToken(auth, customToken);
        console.log(url, " jnj")
        navigate(url || "/billing", { replace: true });
      } catch (e: any) {
        console.error("Login by token falló:", e);
        navigate("/login?error=invalid_token");
      } finally {
      }
    };

    doLogin();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
            <div
              className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-purple-400 rounded-full animate-spin mx-auto"
              style={{
                animationDirection: "reverse",
                animationDuration: "1.5s",
              }}
            ></div>
          </div>
          <p className="text-gray-600 font-medium">
            {t("messages.loadingAccount")}
          </p>
        </div>
      </div>
  );
};

export default LoginByToken;
