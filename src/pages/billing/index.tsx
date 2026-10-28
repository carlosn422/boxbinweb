import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, logoutUser } from "@/lib/supabase";
import CheckoutForm from "./CheckoutForm.tsx";
import { Navigate, useNavigate } from "react-router-dom";
import { getStripePlans } from "../../lib/stripe";
import LogoIcon from "@/assets/logo.png";
import { STRIPE_PUBLISHABLE_KEY } from "../../config/stripe";
import {
  Check,
  Sparkles,
  Crown,
  Zap,
  Package,
  MapPin,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  LogOut,
  Lock,
  CheckCircle,
  Coins,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const planVisuals = [
  { icon: Package, bg: "bg-blue-50 text-blue-700", ring: "ring-blue-100" },
  { icon: Zap, bg: "bg-purple-50 text-purple-700", ring: "ring-purple-100" },
  { icon: Crown, bg: "bg-amber-50 text-amber-700", ring: "ring-amber-100" },
  { icon: Sparkles, bg: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-100" },
];

export default function BillingPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState<Record<string, any> | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activatingFree, setActivatingFree] = useState(false);

  const checkoutRef = useRef<HTMLDivElement>(null);

  // Scroll to checkout form when a plan is selected
  useEffect(() => {
    if (selectedPlan && checkoutRef.current) {
      checkoutRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedPlan]);

  const handleLogout = async () => {
    try {
      await logoutUser();
      window.location.href = "/login";
    } catch (err) {
      console.error("Error signing out:", err);
      toast.error("Failed to sign out");
    }
  };

  // Check active subscription for currentUser
  useEffect(() => {
    const checkSubscription = async () => {
      if (currentUser?.uid) {
        try {
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("userId", currentUser.uid)
            .eq("status", "active")
            .maybeSingle();

          if (subData) {
            setSubscription(subData);
          }
        } catch (err) {
          console.error("Error checking subscription:", err);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    checkSubscription();
  }, [currentUser]);

  // Fetch stripe plans
  const fetchPlans = useCallback(async () => {
    try {
      setIsLoadingPlans(true);
      setError(null);
      const stripePlans = await getStripePlans();

      const filteredPlans = stripePlans.filter((plan: any) => {
        const keys = plan.metadata ? Object.keys(plan.metadata) : [];
        return keys.includes("tokens") && keys.length > 1;
      });

      setPlans(filteredPlans);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setError("Failed to load subscription plans. Please try again later.");
    } finally {
      setIsLoadingPlans(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Filter plans to higher tiers if already subscribed
  const availablePlans = useMemo(() => {
    const sorted = [...plans].sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0));
    if (subscription?.planId) {
      const currentPlanIndex = sorted.findIndex((plan) => plan.id === subscription.planId);
      if (currentPlanIndex !== -1) {
        return sorted.slice(currentPlanIndex + 1);
      }
    }
    return sorted;
  }, [plans, subscription]);

  // Free plan activation handler
  const handleActivateFreePlan = async () => {
    if (!selectedPlan || !currentUser?.uid) return;
    try {
      setActivatingFree(true);
      const { error: insertError } = await supabase.from("subscriptions").insert({
        userId: currentUser.uid,
        planId: selectedPlan,
        status: "active",
        createdAt: new Date().toISOString(),
        userEmail: currentUser.email,
      });

      if (insertError) throw insertError;

      toast.success(t("subscription.activatedSuccess") || "Free plan activated successfully!");

      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "SUBSCRIPTION_SUCCESS",
          })
        );
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error("Error creating free subscription:", err);
      toast.error(t("subscription.errorActivation") || "Error activating free plan. Please try again.");
    } finally {
      setActivatingFree(false);
    }
  };

  // If already subscribed and no higher tier exists, redirect to home
  if (subscription && !isLoadingPlans && availablePlans.length === 0) {
    return <Navigate to="/home" replace />;
  }

  // Account initial loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-slate-700 mx-auto" />
          <p className="text-xs font-medium text-slate-500">
            {t("messages.loadingAccount") || "Loading your account..."}
          </p>
        </div>
      </div>
    );
  }

  const isReactNative = (window as any).ReactNativeWebView;
  const selectedPlanObj = availablePlans.find((p) => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-16 font-sans">
      {/* Mobile WebView Sticky Bar */}
      {isReactNative && (
        <div className="bg-white border-b border-slate-200 px-4 py-2 sticky top-0 z-20">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
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
              {t("subscription.back") || "Back"}
            </Button>
            <span className="text-xs font-semibold text-slate-700">BoxBin Billing</span>
          </div>
        </div>
      )}

      {/* Main Top Header Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LogoIcon} alt="BoxBin" className="h-8 w-auto object-contain" />
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              {t("subscription.title") || "Plans & Billing"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/tokensai")}
              className="h-8 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              <Coins className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              Tokens Store
            </Button>

            {isReactNative ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  (window as any).ReactNativeWebView.postMessage(
                    JSON.stringify({ type: "SUBSCRIPTION_SUCCESS" })
                  );
                }}
                className="h-8 text-xs font-medium border-slate-200 text-slate-700"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                {t("subscription.back") || "Back"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-5xl space-y-5">
        {/* Hero Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {subscription
                  ? t("subscription.upgradeTitle") || "Upgrade Your Subscription Tier"
                  : t("subscription.choosePlan") || "Choose Your Perfect Plan"}
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200"
              >
                BoxBin Cloud
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("subscription.heroSubtitle") ||
                "Unlock high-capacity QR bins, multi-location inventory, and smart automated container scanning."}
            </p>
          </div>

          {subscription && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold px-2.5 py-1"
              >
                {t("subscription.statusActive") || "Current Subscription Active"}
              </Badge>
            </div>
          )}
        </div>

        {/* Compact KPI Stats / Highlights Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Smart QR Bins
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                Printable Smart Labels
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Item Catalog
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                Item Photo & Tagging
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Multi-Site
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                Garages & Warehouses
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Security
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                PCI-DSS & SSL Encrypted
              </div>
            </div>
          </div>
        </div>

        {/* Plans Grid Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              {t("subscription.availableTiers") || "Available Subscription Tiers"}
            </h2>
            <span className="text-xs text-slate-500">
              {t("subscription.cancelAnytime") || "Cancel or change tier at any time"}
            </span>
          </div>

          {isLoadingPlans ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-white rounded-xl border border-slate-200/80">
              <Loader2 className="w-7 h-7 text-slate-700 animate-spin" />
              <p className="text-xs font-medium text-slate-500">
                {t("messages.loadingPlans") || "Loading available plans..."}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200/80 p-6 space-y-3">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("subscription.errorTitle") || "Failed to load plans"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
              <Button
                onClick={fetchPlans}
                size="sm"
                variant="outline"
                className="h-8 text-xs border-slate-200 text-slate-700"
              >
                {t("subscription.tryAgain") || "Try Again"}
              </Button>
            </div>
          ) : availablePlans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200/80 p-6 space-y-3">
              <Package className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("subscription.noPlansTitle") || "No Plans Available"}
              </h3>
              <p className="text-xs text-slate-500">
                {t("subscription.noPlansSubtitle") || "Check back later for available subscription tiers."}
              </p>
            </div>
          ) : (
            <div
              className={`grid gap-4 grid-cols-1 ${
                availablePlans.length === 1
                  ? "sm:grid-cols-1 max-w-sm mx-auto"
                  : availablePlans.length === 2
                  ? "sm:grid-cols-2 max-w-3xl mx-auto"
                  : availablePlans.length === 3
                  ? "sm:grid-cols-3"
                  : "sm:grid-cols-2 lg:grid-cols-4"
              }`}
            >
              {availablePlans.map((plan, index) => {
                const visual = planVisuals[index % planVisuals.length];
                const IconComponent = visual.icon;
                const isSelected = selectedPlan === plan.id;
                const isPopular =
                  plan.popular ||
                  plan.metadata?.popular === "true" ||
                  (availablePlans.length > 2 && index === Math.floor(availablePlans.length / 2));
                const priceFormatted = ((plan.unit_amount || 0) / 100).toFixed(2);
                const hasTrial = plan.metadata?.trial === "true";

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`group relative rounded-xl border p-4 sm:p-5 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-slate-900 ring-2 ring-slate-900 bg-slate-50/40 shadow-sm"
                        : isPopular
                        ? "border-blue-300 bg-white hover:border-slate-400 shadow-2xs"
                        : "border-slate-200 bg-white hover:border-slate-300 shadow-2xs"
                    }`}
                  >
                    {/* Popular Badge */}
                    {isPopular && (
                      <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 z-10">
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1 whitespace-nowrap">
                          <Crown className="w-2.5 h-2.5" />
                          <span>{t("subscription.planPopular") || "Most Popular"}</span>
                        </span>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Card Header Row */}
                      <div className="flex items-center justify-between">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${visual.bg}`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        {isSelected && (
                          <Badge className="bg-slate-900 text-white text-[10px] h-5 px-1.5 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Selected</span>
                          </Badge>
                        )}
                      </div>

                      {/* Tier Name & Description */}
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {plan.product?.name || "BoxBin Plan"}
                        </h3>
                        {plan.product?.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {plan.product.description}
                          </p>
                        )}
                      </div>

                      {/* Pricing */}
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            ${priceFormatted}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            /{plan.recurring?.interval || "mo"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Billed {plan.recurring?.interval || "month"}ly
                        </p>
                      </div>

                      {/* Trial Tag */}
                      {hasTrial && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-semibold">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>30 Days Free Trial Included</span>
                        </div>
                      )}

                      {/* Quotas & Limits */}
                      <div className="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                        {plan.metadata?.bins && (
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                              <span>Storage Bins</span>
                            </span>
                            <span className="font-semibold text-slate-900">
                              {plan.metadata.bins} Bins
                            </span>
                          </div>
                        )}

                        {plan.metadata?.items && (
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Zap className="w-3.5 h-3.5 text-slate-400" />
                              <span>Items per Bin</span>
                            </span>
                            <span className="font-semibold text-slate-900">
                              {plan.metadata.items} Items
                            </span>
                          </div>
                        )}

                        {plan.metadata?.locations && (
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>Locations</span>
                            </span>
                            <span className="font-semibold text-slate-900">
                              {plan.metadata.locations} Sites
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Standard Feature Highlights */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Custom QR Smart Labels</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>PDF & CSV Inventory Export</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Auto Cloud Data Backup</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlan(plan.id);
                      }}
                      className={`w-full mt-5 h-8 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? "bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
                          : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-blue-400" />
                          <span>Selected Tier</span>
                        </>
                      ) : (
                        <span>Select Plan</span>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Embedded Checkout Panel */}
        {selectedPlan && selectedPlanObj && (
          <div ref={checkoutRef} className="pt-4 max-w-2xl mx-auto">
            <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Complete Subscription Checkout</span>
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Encrypted payment processing handled securely via Stripe.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs font-semibold bg-white border-slate-200 text-slate-700"
                >
                  {selectedPlanObj.product?.name || "Selected Plan"}
                </Badge>
              </CardHeader>

              <CardContent className="p-5">
                {/* Selected Plan Summary Banner */}
                <div className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50 mb-5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      Selected Plan
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {selectedPlanObj.product?.name}
                    </div>
                    {selectedPlanObj.metadata?.bins && (
                      <div className="text-xs text-slate-500">
                        {selectedPlanObj.metadata.bins} Bins ·{" "}
                        {selectedPlanObj.metadata.items || "—"} Items per bin
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-slate-900">
                      ${((selectedPlanObj.unit_amount || 0) / 100).toFixed(2)}
                      <span className="text-xs font-normal text-slate-500">
                        /{selectedPlanObj.recurring?.interval || "mo"}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                      {selectedPlanObj.metadata?.trial === "true"
                        ? "🎉 30 Days Free Trial"
                        : "Billed Recurring"}
                    </div>
                  </div>
                </div>

                {/* Free Plan vs Stripe Elements */}
                {selectedPlanObj.unit_amount === 0 ? (
                  <div className="space-y-4 py-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Zero Payment Required
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        This plan is free of charge. Click below to activate your BoxBin tier immediately.
                      </p>
                    </div>

                    <Button
                      onClick={handleActivateFreePlan}
                      disabled={activatingFree}
                      className="w-full h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs"
                    >
                      {activatingFree ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Activating Free Plan...</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span>Activate Free Plan</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Elements stripe={stripePromise}>
                    <CheckoutForm
                      userId={currentUser?.uid}
                      planId={selectedPlan}
                      currency="usd"
                      originalPrice={selectedPlanObj.unit_amount || 0}
                    />
                  </Elements>
                )}

                {/* Trust & Compliance Badges */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PCI-DSS Level 1 Encrypted</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>256-bit SSL Security</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span>Processed via Stripe</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
