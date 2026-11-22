import { readTokenBalance } from '@/services/recordService';
import { claimFreeTokens } from '@/lib/stripe';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Elements } from "@stripe/react-stripe-js";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getStripePlans } from "../../lib/stripe";
import { stripePromise } from "@/lib/stripe";
import { COPILOT_TOKEN_COSTS } from '@/lib/copilotPlans';
import {
  Check,
  Sparkles,
  Crown,
  Zap,
  Coins,
  Video,
  Bot,
  Phone,
  MessageSquare,
  Camera,
  Image as ImageIcon,
  ChevronLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import TokenCheckoutForm from "./TokenCheckoutForm.tsx";
import { useNavigate } from "react-router-dom";



function estimateTokenUsage(tokens: number) {
  const safe = Math.max(0, Math.floor(tokens));
  const voiceMinutesRaw = Math.floor(safe / COPILOT_TOKEN_COSTS.voiceBlock30s) * 0.5;
  const voiceMinutes = Number.isInteger(voiceMinutesRaw)
    ? voiceMinutesRaw.toLocaleString()
    : voiceMinutesRaw.toFixed(1);
  return {
    voiceMinutes,
    messages: Math.floor(safe / COPILOT_TOKEN_COSTS.chat),
    photos: Math.floor(safe / COPILOT_TOKEN_COSTS.upload),
    imagesOrVideos: Math.floor(safe / COPILOT_TOKEN_COSTS.image),
  };
}

export default function TokensPurchasePage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
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
      if (currentUser?.uid) {
      try { setUserTokens(await readTokenBalance()); }
      catch { toast.error(t('records.loadFailed')); }
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

      const filteredPackages = stripePackages.filter((pkg: any) => {
        return !pkg.recurring && Number(pkg.metadata?.tokens) > 0;
      });

      // Sort packages by token amount (ascending)
      const sortedPackages = filteredPackages.sort((a: any, b: any) => {
        const tokensA = parseInt(a.metadata?.tokens || "0");
        const tokensB = parseInt(b.metadata?.tokens || "0");
        return tokensA - tokensB;
      });

      setTokenPackages(sortedPackages);
    } catch (error) {
      console.error("Error fetching token packages:", error);
      setError("Failed to load token packages. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokenPackages();
  }, [fetchTokenPackages]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-slate-700 mx-auto" />
          <p className="text-xs font-medium text-slate-500">
            {t("messages.loadingAccount") || "Loading token balance..."}
          </p>
        </div>
      </div>
    );
  }

  const isReactNative = (window as any).ReactNativeWebView;
  const currentPkg = tokenPackages.find((p) => p.id === selectedPackage);
  const balanceEstimate = estimateTokenUsage(userTokens);

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-brand-100 selection:text-brand-900 pb-12 font-sans">
      {/* Mobile WebView Back Bar */}
      {isReactNative && (
        <div className="bg-white border-b border-slate-200 px-4 py-2 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                (window as any).ReactNativeWebView.postMessage(
                  JSON.stringify({ type: "SUBSCRIPTION_SUCCESS" })
                );
              }}
              className="h-8 text-xs font-medium text-slate-700"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t("tokens.back") || "Back"}
            </Button>
            <span className="text-xs font-semibold text-slate-700">
              {t("tokens.storeTitle", { defaultValue: "AI Tokens Store" })}
            </span>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("tokens.heroTitle1", { defaultValue: "AI Recognition" })}{" "}
                {t("tokens.heroTitle2", { defaultValue: "Tokens" })}
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border-brand-200"
              >
                {t("tokens.aiCreditsBadge", { defaultValue: "AI Credits" })}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("tokens.heroSubtitle", {
                defaultValue:
                  "Power automated container scanning, multi-item object detection, and video extraction.",
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs">
              <Coins className="w-4 h-4 text-amber-500" />
              <div className="text-xs">
                <span className="text-slate-500 mr-1.5">
                  {t("tokens.availableTokens", { defaultValue: "Balance" })}:
                </span>
                <span className="font-bold text-slate-900">{userTokens.toLocaleString()}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/subscription")}
              className="h-8 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              {t("tokens.subscriptionAndPlan", { defaultValue: "Subscription & Plan" })}
            </Button>
          </div>
        </div>

        {/* Feature & Balance Ribbon (3 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Balance */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                {t("tokens.balanceTitle", { defaultValue: "Current Token Balance" })}
              </span>
              <div className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                {userTokens.toLocaleString()}
              </div>
              <span className="text-[11px] text-emerald-600 font-medium block">
                {t("tokens.readyForAi", { defaultValue: "Ready for AI analysis" })}
              </span>
              {userTokens > 0 && (
                <span className="text-[11px] text-slate-500 block mt-0.5 tabular-nums">
                  {t("tokens.balanceApproxSummary", {
                    voice: balanceEstimate.voiceMinutes,
                    chats: balanceEstimate.messages.toLocaleString(),
                    photos: balanceEstimate.photos.toLocaleString(),
                    defaultValue: `≈ {{voice}} min voice · {{chats}} chats · {{photos}} photos`,
                  })}
                </span>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5" />
            </div>
          </div>

          {/* Card 2: Copilot Extra Usage */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                {t("tokens.copilotUsageTitle", { defaultValue: "BoxBin Copilot AI" })}
              </span>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {t("tokens.copilotUsageSubtitle", { defaultValue: "Chat, Voice & Image Extra Quota" })}
              </div>
              <span className="text-[11px] text-slate-500">
                {t("tokens.copilotUsageRates", { defaultValue: "50 / msg · 100 / photo · 500 / AI img · 400 / min voice" })}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5" />
            </div>
          </div>

          {/* Card 3: Video & Vision Scanning */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                {t("tokens.videoIngestionTitle", { defaultValue: "Video & Photo Scan" })}
              </span>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {t("tokens.videoScanTitle", { defaultValue: "Multi-Item Container Scan" })}
              </div>
              <span className="text-[11px] text-slate-500">
                {t("tokens.videoScanRates", {
                  defaultValue: "500 tokens / 30s video · 100 tokens / photo scan",
                })}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <Video className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Token Packages Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              {t("tokens.selectPackageTitle", { defaultValue: "Select Token Package" })}
            </h2>
            <span className="text-xs text-slate-500">
              {t("tokens.instantActivation", {
                defaultValue: "Instant activation upon checkout",
              })}
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-white rounded-xl border border-slate-200/80">
              <Loader2 className="w-7 h-7 text-slate-700 animate-spin" />
              <p className="text-xs font-medium text-slate-500">
                {t("tokens.loadingPackages", { defaultValue: "Loading available token packages..." })}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200/80 p-6 space-y-3">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("tokens.errorTitle", { defaultValue: "Failed to load packages" })}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
              <Button
                onClick={fetchTokenPackages}
                size="sm"
                variant="outline"
                className="h-8 text-xs border-slate-200"
              >
                {t("tokens.tryAgain", { defaultValue: "Try Again" })}
              </Button>
            </div>
          ) : tokenPackages.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200/80 p-6 space-y-3">
              <Coins className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("tokens.noPackagesTitle", { defaultValue: "No Packages Available" })}
              </h3>
              <p className="text-xs text-slate-500">
                {t("tokens.noPackagesSubtitle", {
                  defaultValue: "Token recharge packages are temporarily unavailable.",
                })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tokenPackages.map((pkg, index) => {
                const isSelected = selectedPackage === pkg.id;
                const isHovered = hoveredPackage === pkg.id;
                const isPopular = index === Math.floor(tokenPackages.length / 2);
                const tokenAmount = parseInt(pkg.metadata?.tokens || "0");
                const estimate = estimateTokenUsage(tokenAmount);
                const priceFormatted = (pkg.unit_amount / 100).toFixed(2);
                const pricePerToken = pkg.unit_amount / (tokenAmount || 1);

                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg.id)}
                    onMouseEnter={() => setHoveredPackage(pkg.id)}
                    onMouseLeave={() => setHoveredPackage("")}
                    className={`group relative rounded-xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${isSelected
                      ? "border-slate-900 ring-2 ring-slate-900 bg-slate-50/50 shadow-sm"
                      : isHovered
                        ? "border-slate-300 bg-white shadow-2xs"
                        : "border-slate-200 bg-white shadow-2xs"
                      }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2">
                        <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5" />
                          <span>{t("tokens.bestValue", { defaultValue: "Best Value" })}</span>
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-brand-50 text-slate-700 group-hover:text-brand-600 flex items-center justify-center transition-colors">
                          <Coins className="w-4 h-4" />
                        </div>
                        {isSelected && (
                          <Badge className="bg-slate-900 text-white text-[10px] h-5 px-1.5">
                            {t("tokens.selectedBadge", { defaultValue: "Selected" })}
                          </Badge>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {pkg.product?.name || `${tokenAmount.toLocaleString()} Tokens`}
                        </h3>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                          ${priceFormatted}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          ${(pricePerToken / 100).toFixed(4)}{" "}
                          {t("tokens.perToken", { defaultValue: "/ token" })}
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-semibold">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>
                          {tokenAmount.toLocaleString()}{" "}
                          {t("tokens.aiTokensLabel", { defaultValue: "AI Tokens" })}
                        </span>
                      </div>

                      {pkg.metadata?.bonus && (
                        <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          {t("tokens.bonusTokens", {
                            bonus: pkg.metadata.bonus,
                            defaultValue: `+${pkg.metadata.bonus}% Bonus Tokens Included`,
                          })}
                        </div>
                      )}

                      <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {t("tokens.approxUsageTitle", {
                            defaultValue: "Approx. enough for (mix freely)",
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                            <span>
                              {t("tokens.approxVoiceLabel", { defaultValue: "Voice calls" })}
                            </span>
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            ~{estimate.voiceMinutes}{" "}
                            {t("tokens.approxMinUnit", { defaultValue: "min" })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              {t("tokens.approxChatLabel", { defaultValue: "Copilot chats" })}
                            </span>
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            ~{estimate.messages.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span>
                              {t("tokens.approxPhotosLabel", { defaultValue: "Photo scans" })}
                            </span>
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            ~{estimate.photos.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                            <span>
                              {t("tokens.approxMediaLabel", {
                                defaultValue: "AI imgs / 30s videos",
                              })}
                            </span>
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            ~{estimate.imagesOrVideos.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className={`w-full mt-4 h-8 text-xs font-semibold rounded-lg transition-colors ${isSelected
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "bg-white border border-slate-200 text-slate-800 hover:bg-slate-50"
                        }`}
                    >
                      {isSelected ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {t("tokens.selectedPackageBtn", {
                              defaultValue: "Selected Package",
                            })}
                          </span>
                        </span>
                      ) : (
                        t("tokens.selectPackageBtn", {
                          defaultValue: "Select Package",
                        })
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Embedded Checkout Panel */}
        {selectedPackage && (
          <div ref={checkoutRef} className="pt-4">
            <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden max-w-2xl mx-auto">
              <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-600" />
                    {t("tokens.checkoutTitle", { defaultValue: "Secure Token Checkout" })}
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("tokens.checkoutSubtitle", {
                      defaultValue:
                        "Complete your transaction securely with encrypted payment processing.",
                    })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-semibold bg-white border-slate-200">
                  {currentPkg?.product?.name || t("tokens.package", { defaultValue: "Package" })}
                </Badge>
              </CardHeader>

              <CardContent className="p-5">
                {currentPkg?.unit_amount === 0 ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      {t("tokens.freePackageNote", {
                        defaultValue:
                          "Claim your complimentary token allocation for testing and setup.",
                      })}
                    </p>
                    <Button
                      onClick={async () => {
                        try {
                          await claimFreeTokens(selectedPackage);

                          if (isReactNative) {
                            (window as any).ReactNativeWebView.postMessage(
                              JSON.stringify({ type: "TOKENS_PURCHASE_SUCCESS" })
                            );
                          } else {
                            window.location.reload();
                          }
                        } catch (error) {
                          console.error("Error processing free tokens:", error);
                          toast.error(t("records.billingFailed"));
                        }
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9 px-6 rounded-lg"
                    >
                      {t("tokens.getFreeTokens", { defaultValue: "Claim Free Tokens" })}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/70 text-xs">
                      <span className="text-slate-600 font-medium">
                        {t("tokens.allocated", { defaultValue: "Allocated:" })}{" "}
                        <strong>
                          {parseInt(currentPkg?.metadata?.tokens || "0").toLocaleString()}{" "}
                          {t("tokens.aiTokensLabel", { defaultValue: "Tokens" })}
                        </strong>
                      </span>
                      <span className="text-slate-900 font-bold text-sm">
                        ${((currentPkg?.unit_amount || 0) / 100).toFixed(2)}{" "}
                        {t("tokens.usd", { defaultValue: "USD" })}
                      </span>
                    </div>

                    <Elements stripe={stripePromise}>
                      <TokenCheckoutForm
                        packageId={selectedPackage}
                        currency={currentPkg?.currency || "usd"}
                        userId={currentUser?.uid ?? ""}
                        tokens={parseInt(currentPkg?.metadata?.tokens || "0")}
                        price={currentPkg?.unit_amount || 0}
                      />
                    </Elements>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
