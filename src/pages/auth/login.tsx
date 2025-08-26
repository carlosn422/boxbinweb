import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import YahooIcon from "@/assets/yahoo.svg";
import {
  loginWithGoogle,
  loginWithApple,
  loginWithYahoo,
  auth,
  db,
} from "@/lib/firebase";
import { getRedirectResult } from "firebase/auth";
import { useTranslation } from "react-i18next";
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

const LoginPage = () => {
  const [isLoading, setIsLoading] = useState({
    google: false,
    apple: false,
    yahoo: false,
  });
  const { t } = useTranslation();

  const handleOAuthLogin = async (provider: "google" | "apple" | "yahoo") => {
    setIsLoading((prev) => ({ ...prev, [provider]: true }));

    let response;
    if (provider === "google") response = await loginWithGoogle();
    if (provider === "apple") response = await loginWithApple();
    if (provider === "yahoo") response = await loginWithYahoo();

    if (response?.error) {
      console.error(`Login error with ${provider}:`, response.error);
      // Aquí podrías mostrar un toast o mensaje de error
      toast.error(`Login error with ${provider}`);
      return;
    } else {
      console.log(`Logged in with ${provider}`, response?.user);
    }
    await saveUserToFirestore(response?.user);
    setIsLoading((prev) => ({ ...prev, [provider]: false }));
  };

  const generateUniqueUsername = async (email: string) => {
    try {
      if (!email) return "";

      const baseUsername = email.split("@")[0];

      while (true) {
        // Genera un número aleatorio de 4 dígitos
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const username = `${baseUsername}${randomNum}`;

        // Busca si ya existe un usuario con ese username
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
        console.log("jnjn")
      }
    } catch (error) {
      console.log(error);
      return;
    }
  };

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        console.log("✅ Redirect result:", result);
      })
      .catch((error) => {
        console.error("🔥 Redirect error full object:", error);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t("auth.signInTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t("auth.signInSubtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">{t("auth.welcome")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google Login */}
            <Button
              variant="outline"
              className="w-full h-12 relative"
              onClick={() => handleOAuthLogin("google")}
              disabled={Object.values(isLoading).some((loading) => loading)}
            >
              {isLoading.google ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
                  {t("auth.continueWithGoogle")}
                </>
              )}
            </Button>

            {/* Apple Login */}
            <Button
              variant="outline"
              className="w-full h-12 relative"
              onClick={() => handleOAuthLogin("apple")}
              disabled={Object.values(isLoading).some((loading) => loading)}
            >
              {isLoading.apple ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                </div>
              ) : (
                <>
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  {t("auth.continueWithApple")}
                </>
              )}
            </Button>

            {/* Yahoo Login */}
            <Button
              variant="outline"
              className="w-full h-12 relative"
              onClick={() => handleOAuthLogin("yahoo")}
              disabled={Object.values(isLoading).some((loading) => loading)}
            >
              {isLoading.yahoo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                </div>
              ) : (
                <>
                  <img src={YahooIcon} alt="Yahoo" className="w-5 h-5 mr-2" />
                  {t("auth.continueWithYahoo")}
                </>
              )}
            </Button>

            <Separator />

            <div className="text-center"></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
