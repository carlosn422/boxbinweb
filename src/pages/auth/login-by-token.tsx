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

        navigate(url || "/billing", { replace: true });
      } catch (e: any) {
        console.error("Login by token falló:", e);
        navigate("/login?error=invalid_token");
      } finally {
      }
    };

    doLogin();
  }, [searchParams, navigate]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p>{t("auth.signInSubtitle")}</p>
    </div>
  );
};

export default LoginByToken;
