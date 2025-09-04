import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  doc,
  getDoc,
  addDoc,
  collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { getStripePlans } from "../../lib/stripe";
import { STRIPE_PUBLISHABLE_KEY } from "../../config/stripe";
import {
  Check,
  Sparkles,
  Crown,
  Star,
  Zap,
  Coins,
  Video,
  Bot,
} from "lucide-react";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const planIcons = [Coins, Zap, Star, Crown];

import { useTranslation } from "react-i18next";
import TokenCheckoutForm from "./TokenCheckoutForm.tsx";

export default function TokensPurchasePage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [userTokens, setUserTokens] = useState<number>(0);
  const [tokenPackages, setTokenPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hoveredPackage, setHoveredPackage] = useState<string>("");

  const checkoutRef = useRef<HTMLDivElement>(null);

  // Scroll to checkout form when a package is selected
  useEffect(() => {
    if (selectedPackage && checkoutRef.current) {
      checkoutRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedPackage]);

  useEffect(() => {
    const checkUserTokens = async () => {
      if (currentUser) {
        console.log(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        console.log();
        if (docSnap.exists()) {
          const tokenData = docSnap.data();
          console.log(tokenData, " kjnj");
          setUserTokens(tokenData.tokens || 0);
        }
        setLoading(false);
      }
    };

    checkUserTokens();
  }, [currentUser]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenPackages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const stripePackages = await getStripePlans();

      console.log(stripePackages);

      const filteredPackages = stripePackages.filter((pkg) => {
        const keys = pkg.metadata ? Object.keys(pkg.metadata) : [];
        return keys.includes("tokens") && keys.length == 1;
      });

      // Sort packages by token amount (ascending)
      const sortedPackages = filteredPackages.sort((a, b) => {
        const tokensA = parseInt(a.metadata?.tokens || "0");
        const tokensB = parseInt(b.metadata?.tokens || "0");
        return tokensA - tokensB;
      });

      setTokenPackages(sortedPackages);
    } catch (error) {
      console.error("Error fetching token packages:", error);
      setError(`Failed to load token packages. Please try again later.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokenPackages();
  }, [fetchTokenPackages]);

  if (loading) {
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
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2">
      {(window as any).ReactNativeWebView && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <div className="flex justify-between items-center">
              {(window as any).ReactNativeWebView ? (
                <Button
                  onClick={() => {
                    (window as any).ReactNativeWebView.postMessage(
                      JSON.stringify({
                        type: "SUBSCRIPTION_SUCCESS",
                      })
                    );
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {t("tokens.back")}
                </Button>
              ) : (
                <></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-2">
        {/* Hero Section */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center space-x-2 text-blue-600">
            <Bot className="w-6 h-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {t("tokens.heroTag")}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            {t("tokens.heroTitle1")}
            <br />
            <span className="text-blue-600">{t("tokens.heroTitle2")}</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            {t("tokens.heroSubtitle")}
          </p>
        </div>

        {/* Current Usage Info */}
        <div className="max-w-2xl mx-auto mb-4">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">
                  {t("tokens.balanceTitle")}
                </h3>
                <p className="text-blue-100">{t("tokens.balanceSubtitle")}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">{userTokens}</div>
                <div className="text-blue-200">
                  {t("tokens.availableTokens")}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-4 text-sm text-blue-100">
              <div className="flex items-center space-x-1">
                <Video className="w-4 h-4" />
              </div>
              <div className="flex items-center space-x-1">
                <Bot className="w-4 h-4" />
                <span>{t("tokens.aiRecognition")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Token Packages Section */}
        <div className="mt-8">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 font-medium">
                  {t("tokens.loadingPackages")}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t("tokens.errorTitle")}
                </h3>
                <p className="text-gray-600 mb-6">{error}</p>
                <Button
                  onClick={fetchTokenPackages}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {t("tokens.tryAgain")}
                </Button>
              </div>
            </div>
          ) : tokenPackages.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Coins className="text-white text-3xl" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t("tokens.noPackagesTitle")}
                </h3>
                <p className="text-gray-600">
                  {t("tokens.noPackagesSubtitle")}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {/* <div
                key={"0ai"}
                onClick={async () => {
                  try {
                    if (!currentUser?.uid) {
                      return;
                    }
                    setIsLoading(true);

                    await updateDoc(doc(db, "users", currentUser.uid), {
                      tokens: increment(1000),
                    });

                    setIsLoading(false);
                    window.location.reload();
                  } catch (error) {
                    setIsLoading(false);
                    console.log(error);
                  }
                }}
                onMouseLeave={() => setHoveredPackage("")}
                className="cursor-pointer transform transition-all duration-300 hover:scale-105 relative"
              >
                <Card
                  className={`relative h-full transition-all duration-300 flex flex-col ${
                    selectedPackage === "0ai"
                      ? "border-2 border-blue-500 shadow-xl bg-blue-50"
                      : hoveredPackage === "0ai"
                      ? "border-2 border-blue-300 shadow-lg bg-gray-50"
                      : "border border-gray-200 hover:border-gray-300 shadow-md bg-white"
                  }`}
                >
              
                  {selectedPackage === "0ai" && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg z-10">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <CardHeader className="">
                    <CardTitle className="text-lg font-bold text-center text-gray-900 mb-2">
                      FREE
                    </CardTitle>
                    <p className="text-xs text-gray-600 text-center leading-relaxed">
                      FREE
                    </p>
                  </CardHeader>

                  <CardContent className="pt-0 pb-4 flex-1 flex flex-col">
                    <div className="text-center mb-4">
                      <div className="flex items-baseline justify-center gap-1 mb-2">
                        <span className="text-3xl font-bold text-gray-900">
                          $0.00
                        </span>
                      </div>
                      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
                        1000 Tokens
                      </div>
                    </div>

            
                    <div className="mb-4 space-y-2 text-sm text-gray-700 flex-1">
                      <div className="flex items-center space-x-2">
                        <Video className="w-4 h-4 text-blue-500" />
                        <span>Process video</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Bot className="w-4 h-4 text-purple-500" />
                        <span>AI-powered item detection</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-yellow-500" />
                        <span>Auto-add to containers</span>
                      </div>
                    </div>

                    <Button
                      className={`w-full py-3 text-sm font-semibold transition-all duration-300 ${
                        selectedPackage === "0ai"
                          ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                          : hoveredPackage === "0ai"
                          ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                          : "bg-gray-900 hover:bg-gray-800 shadow-md"
                      } text-white`}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {selectedPackage === "0ai" && (
                          <Check className="w-4 h-4" />
                        )}
                        <span>
                          {selectedPackage === "0ai"
                            ? "Selected"
                            : "Buy Tokens"}
                        </span>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              </div> */}
              {tokenPackages.map((pkg, index) => {
                const IconComponent = planIcons[index % planIcons.length];
                const isSelected = selectedPackage === pkg.id;
                const isHovered = hoveredPackage === pkg.id;
                const isPopular =
                  index === Math.floor(tokenPackages.length / 2);
                const tokenAmount = parseInt(pkg.metadata?.tokens || "0");
                const pricePerToken = pkg.unit_amount / tokenAmount;

                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg.id)}
                    onMouseEnter={() => setHoveredPackage(pkg.id)}
                    onMouseLeave={() => setHoveredPackage("")}
                    className="cursor-pointer transform transition-all duration-300 hover:scale-105 relative"
                  >
                    {/* Popular Badge */}
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-[140px]">
                        <div className="bg-blue-600 text-white px-3 py-1 rounded-full font-bold shadow-lg w-full">
                          <div className="flex items-center justify-center space-x-1 w-full">
                            <Crown className="w-[0.9em] h-[0.9em]" />
                            <span className="text-[0.9em] whitespace-nowrap">
                              Best Value
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <Card
                      className={`relative h-full transition-all duration-300 flex flex-col ${
                        isSelected
                          ? "border-2 border-blue-500 shadow-xl bg-blue-50"
                          : isHovered
                          ? "border-2 border-blue-300 shadow-lg bg-gray-50"
                          : "border border-gray-200 hover:border-gray-300 shadow-md bg-white"
                      }`}
                    >
                      {/* Selected Indicator */}
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg z-10">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}

                      <CardHeader className="">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-all duration-300 ${
                            isSelected
                              ? "bg-blue-600 shadow-lg"
                              : isHovered
                              ? "bg-blue-500 shadow-lg"
                              : "bg-gray-600"
                          }`}
                        >
                          <IconComponent className="w-6 h-6 text-white" />
                        </div>

                        <CardTitle className="text-lg font-bold text-center text-gray-900 mb-2">
                          {pkg.product.name}
                        </CardTitle>
                        {pkg.product.description && (
                          <p className="text-xs text-gray-600 text-center leading-relaxed">
                            {pkg.product.description}
                          </p>
                        )}
                      </CardHeader>

                      <CardContent className="pt-0 pb-4 flex-1 flex flex-col">
                        <div className="text-center mb-4">
                          <div className="flex items-baseline justify-center gap-1 mb-2">
                            <span className="text-3xl font-bold text-gray-900">
                              ${(pkg.unit_amount / 100).toFixed(2)}
                            </span>
                          </div>
                          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
                            {tokenAmount} Tokens
                          </div>
                          <p className="text-xs text-gray-500">
                            ${(pricePerToken / 100).toFixed(4)} per token
                          </p>
                        </div>

                        {/* Features */}
                        <div className="mb-4 space-y-2 text-sm text-gray-700 flex-1">
                          <div className="flex items-center space-x-2">
                            <Video className="w-4 h-4 text-blue-500" />
                            <span>Process video</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Bot className="w-4 h-4 text-purple-500" />
                            <span>AI-powered item detection</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Sparkles className="w-4 h-4 text-yellow-500" />
                            <span>Auto-add to containers</span>
                          </div>
                          {pkg.metadata?.bonus && (
                            <div className="flex items-center space-x-2">
                              <Crown className="w-4 h-4 text-orange-500" />
                              <span className="text-orange-600 font-semibold">
                                +{pkg.metadata.bonus}% Bonus Tokens
                              </span>
                            </div>
                          )}
                        </div>

                        <Button
                          className={`w-full py-3 text-sm font-semibold transition-all duration-300 ${
                            isSelected
                              ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                              : isHovered
                              ? "bg-blue-600 hover:bg-blue-700 shadow-lg"
                              : "bg-gray-900 hover:bg-gray-800 shadow-md"
                          } text-white`}
                        >
                          <div className="flex items-center justify-center space-x-2">
                            {isSelected && <Check className="w-4 h-4" />}
                            <span>
                              {isSelected
                                ? t("tokens.selected")
                                : t("tokens.buyTokens")}
                            </span>
                          </div>
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {/* Checkout Form */}
          {selectedPackage && (
            <div ref={checkoutRef} className="mt-5 max-w-lg mx-auto mb-20">
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Coins className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {t("tokens.checkoutTitle")}
                  </h3>
                  <p className="text-gray-600">
                    {t("tokens.checkoutSubtitle")}
                  </p>
                </div>

                {tokenPackages.find((p) => p.id === selectedPackage)
                  ?.unit_amount === 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      {t("tokens.freePackageNote")}
                    </p>
                    <Button
                      onClick={async () => {
                        try {
                          const selectedPkg = tokenPackages.find(
                            (p) => p.id === selectedPackage
                          );
                          const tokenAmount = parseInt(
                            selectedPkg?.metadata?.tokens || "0"
                          );

                          await addDoc(collection(db, "token_purchases"), {
                            userId: currentUser?.uid,
                            packageId: selectedPackage,
                            tokenAmount: tokenAmount,
                            status: "completed",
                            createdAt: new Date().toISOString(),
                            userEmail: currentUser?.email,
                          });

                          if ((window as any).ReactNativeWebView) {
                            (window as any).ReactNativeWebView.postMessage(
                              JSON.stringify({
                                type: "TOKENS_PURCHASE_SUCCESS",
                              })
                            );
                          } else {
                            window.location.reload();
                          }
                        } catch (error) {
                          console.error("Error processing free tokens:", error);
                        }
                      }}
                      className="w-full"
                    >
                      {t("tokens.getFreeTokens")}
                    </Button>
                  </div>
                ) : (
                  <Elements stripe={stripePromise}>
                    <TokenCheckoutForm
                      userId={currentUser?.uid ?? ""}
                      tokens={parseInt(
                        tokenPackages.find((p) => p.id === selectedPackage)
                          ?.metadata?.tokens || "0"
                      )}
                      price={
                        tokenPackages.find((p) => p.id === selectedPackage)
                          ?.unit_amount || 0
                      }
                    />
                  </Elements>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
