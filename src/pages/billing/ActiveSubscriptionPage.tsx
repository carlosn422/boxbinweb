import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  CheckCircle,
  Crown,
  Check,
  Zap,
  Package,
  MapPin,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  Coins,
  ChevronLeft,
} from "lucide-react";
import {
  cancelUserSubscription,
  getStripePlanById,
  getStripePlans,
  upgradeSubscription,
} from "@/lib/stripe";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import CheckoutForm from "./CheckoutForm";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "@/config/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";
import { useTranslation } from "react-i18next";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export default function ActiveSubscriptionPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: ModalType;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    type: "info",
    message: "",
  });

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Upgrade state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<any>(null);
  const [upgradingToPlan, setUpgradingToPlan] = useState<any>(null);
  const [canUpgrade, setCanUpgrade] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const handleCancelSubscription = async () => {
    setUpgradingToPlan(null);
    if (!subscription?.stripeSubscriptionId || !subscription?.userId) {
      if (subscription?.plan === "Trial" && subscription?.status === "active") {
        await supabase
          .from("subscriptions")
          .delete()
          .eq("userId", currentUser?.uid);
        navigate("/billing");
        return;
      }
      return;
    }
    setRedirecting(true);

    try {
      await cancelUserSubscription(
        subscription.stripeSubscriptionId,
        subscription.userId
      );
      setSubscription(null);
      window.location.reload();
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      setModalState({
        isOpen: true,
        type: "error",
        message: "Failed to cancel subscription",
      });
    } finally {
      setRedirecting(false);
    }
  };

  const fetchPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      setPlansError(null);
      const stripePlans = await getStripePlans();

      const currentPlanPrice = subscription?.price || 0;
      const superiorPlans = stripePlans.filter((plan: any) => {
        const planPrice = (plan.unit_amount || 0) / 100;
        return planPrice > currentPlanPrice;
      });

      const filteredPlans = superiorPlans.filter((plan: any) => {
        const keys = plan.metadata ? Object.keys(plan.metadata) : [];
        return keys.includes("tokens") && keys.length > 1;
      });

      const sortedPlans = filteredPlans.sort(
        (a: any, b: any) => a.unit_amount - b.unit_amount
      );

      setPlans(sortedPlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      setPlansError("Failed to load plans. Please try again later.");
    } finally {
      setPlansLoading(false);
    }
  }, [subscription?.price]);

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
    fetchPlans();
  };

  const handleUpgradeToPlan = async (newPriceId: string) => {
    if (
      !subscription?.stripeSubscriptionId &&
      subscription?.plan === "Free Trial" &&
      subscription?.status === "active"
    ) {
      setSelectedPlan(newPriceId);
      setCanUpgrade(true);
      return;
    }

    if (!subscription?.stripeSubscriptionId || !currentUser?.uid) return;

    try {
      setUpgradingToPlan(newPriceId);
      const result = await upgradeSubscription({
        subscriptionId: subscription.stripeSubscriptionId,
        newPriceId,
        userId: currentUser.uid,
      });

      console.log("Upgrade successful:", result);
      toast.success("¡Tu suscripción fue actualizada con éxito!");
      window.location.reload();
    } catch (error: any) {
      console.error("Error updating plan:", error);
      toast.error("Hubo un problema al actualizar tu suscripción.");
    } finally {
      setUpgradingToPlan(null);
    }
  };

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!currentUser?.uid) return;

      try {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("userId", currentUser.uid)
          .maybeSingle();

        if (sub) {
          if (sub.planId) {
            const stripePlan = await getStripePlanById(sub.planId);
            if (stripePlan) {
              const fullSubscription = {
                ...sub,
                plan: stripePlan?.product?.name ?? "Custom Plan",
                price: (stripePlan?.unit_amount ?? 0) / 100,
                interval: stripePlan?.recurring?.interval ?? "month",
                metadata: stripePlan?.metadata ?? {},
              };
              setSubscription(fullSubscription);
            } else {
              setSubscription(sub);
            }
          } else {
            setSubscription(sub);
          }
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/50">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-slate-700 mx-auto" />
          <p className="text-xs font-medium text-slate-500">
            {t("subscription.loading") || "Loading subscription details..."}
          </p>
        </div>
      </div>
    );
  }

  const isReactNative = (window as any).ReactNativeWebView;
  const isActive = subscription?.status === "active";
  const planName = subscription?.plan || t("subscription.planUnknown") || "Basic / Trial";
  const planPrice = subscription?.price ? `$${subscription.price.toFixed(2)}` : "$0.00";
  const interval = subscription?.interval || "month";
  const binsLimit = subscription?.metadata?.bins || "—";
  const itemsLimit = subscription?.metadata?.items || "—";
  const locationsLimit = subscription?.metadata?.locations || "—";

  return (
    <div className="min-h-screen bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 pb-12 font-sans">
      {/* Mobile WebView Back Bar */}
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

      <div className="container mx-auto px-4 sm:px-6 py-5 max-w-5xl space-y-4">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t("subscription.title") || "Subscription & Plans"}
              </h1>
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
              >
                {isActive
                  ? t("subscription.statusActive") || "Active"
                  : t("subscription.statusInactive") || "Inactive"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("subscription.details") ||
                "View and manage your current subscription tier, storage quotas, and upgrades."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/billing/tokens")}
              className="h-8 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              <Coins className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              Tokens Store
            </Button>
            <Button
              size="sm"
              onClick={handleUpgradeClick}
              disabled={redirecting}
              className="h-8 px-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{t("subscription.upgrade") || "Upgrade Plan"}</span>
            </Button>
          </div>
        </div>

        {/* Compact KPI Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Crown className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Current Tier
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {planName}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Rate / Cycle
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {planPrice} <span className="text-xs font-normal text-slate-500">/{interval}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Bins Quota
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {binsLimit} <span className="text-xs font-normal text-slate-500">bins</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Items Quota
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {itemsLimit} <span className="text-xs font-normal text-slate-500">items</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Layout: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Plan Card (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl overflow-hidden">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    {t("subscription.yourSubscription") || "Active Plan Entitlements"}
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("subscription.manage") || "Usage limits and included features for your organization."}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs font-mono font-medium text-slate-600 bg-slate-50 border-slate-200"
                >
                  {subscription?.stripeSubscriptionId ? `ID: ${subscription.stripeSubscriptionId.slice(0, 14)}...` : "Trial Mode"}
                </Badge>
              </CardHeader>

              <CardContent className="p-4 space-y-5">
                {/* Quota breakdown tiles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-slate-200/70 bg-slate-50/50">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-600" />
                        {t("subscription.includedBins") || "Storage Bins"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {binsLimit}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Max QR containers
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200/70 bg-slate-50/50">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-slate-600" />
                        {t("subscription.includedItems") || "Tracked Items"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {itemsLimit}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Inventory item catalog
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200/70 bg-slate-50/50">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-600" />
                        {t("subscription.locations") || "Warehouse Locations"}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {locationsLimit}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Physical sites & warehouses
                    </div>
                  </div>
                </div>

                {/* Plan Highlights */}
                <div className="border border-slate-200/70 rounded-lg p-3.5 bg-white space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Tier Highlights & Capabilities
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Custom QR / Barcode Smart Labels</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Executive PDF Inventory Exports</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Multi-user Collaborative Access</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>AI Multi-Item Container Scanning</span>
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <Button
                    onClick={handleUpgradeClick}
                    className="w-full sm:w-auto h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t("subscription.upgrade") || "Change / Upgrade Tier"}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={redirecting}
                    onClick={() => setShowCancelDialog(true)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-3"
                  >
                    {t("subscription.cancel") || "Cancel Subscription"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar: Billing & AI info (1 col) */}
          <div className="space-y-4">
            {/* AI Tokens Card */}
            <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-600" />
                  AI Recognition Credits
                </span>
                <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200">
                  Add-on
                </Badge>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Scan video footage and camera photos to auto-populate boxes and smart containers with automatic categorization.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/billing/tokens")}
                className="w-full h-8 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5"
              >
                <span>Purchase AI Tokens</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Button>
            </Card>

            {/* Payment & Invoicing Info */}
            <Card className="border-slate-200/80 shadow-2xs bg-white rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-slate-900">
                Payment Security & Invoices
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                All subscriptions and charges are processed via Stripe end-to-end encryption. Invoices are dispatched to your account email.
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>PCI-DSS Level 1 Compliant</span>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="sm:max-w-[420px] bg-white rounded-xl border border-slate-200 p-5 shadow-xl">
          <AlertDialogHeader className="space-y-2">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-slate-900">
              {t("subscription.cancelConfirmTitle") || "Cancel Subscription?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              {t("subscription.cancelConfirmMsg") ||
                "Are you sure you want to cancel your plan? You will lose access to premium container quotas at the end of the billing cycle."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-8 text-xs font-medium border-slate-200 text-slate-700">
              {t("subscription.cancelKeep") || "Keep Subscription"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={redirecting}
              className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
            >
              {redirecting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t("subscription.cancelling") || "Cancelling..."}</span>
                </span>
              ) : (
                t("subscription.cancelYes") || "Yes, Cancel Plan"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade Tier Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-xl border border-slate-200 p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-5 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-blue-600" />
              <DialogTitle className="text-base font-bold text-slate-900">
                {t("subscription.upgradeTitle") || "Upgrade Subscription Tier"}
              </DialogTitle>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("subscription.upgradeSubtitle") ||
                "Select a higher tier to expand storage containers, item records, and automated scanner quotas."}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5">
            {plansLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-7 h-7 text-slate-700 animate-spin" />
                <p className="text-xs font-medium text-slate-500">
                  {t("subscription.loadingPlans") || "Loading available plans..."}
                </p>
              </div>
            ) : plansError ? (
              <div className="text-center py-8 space-y-3">
                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {t("subscription.errorTitle") || "Failed to load plans"}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">{plansError}</p>
                <Button
                  onClick={fetchPlans}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-slate-200"
                >
                  {t("subscription.tryAgain") || "Try Again"}
                </Button>
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {t("subscription.alreadyTopTitle") || "You're on the Highest Tier"}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {t("subscription.alreadyTopMsg") ||
                    "Your organization already has our highest tier active. Need custom enterprise volume? Contact support."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div
                  className={`grid gap-4 grid-cols-1 ${plans.length === 1
                      ? "sm:grid-cols-1 max-w-sm mx-auto"
                      : plans.length === 2
                        ? "sm:grid-cols-2"
                        : "sm:grid-cols-3"
                    }`}
                >
                  {plans.map((plan: any) => {
                    const isSelected = selectedPlan === plan.id;
                    const isUpgradingThis = upgradingToPlan === plan.id;
                    const priceFormatted = ((plan.unit_amount || 0) / 100).toFixed(2);

                    return (
                      <div
                        key={plan.id}
                        onClick={() => {
                          setSelectedPlan(plan.id);
                          handleUpgradeToPlan(plan.id);
                        }}
                        className={`group relative rounded-xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${isSelected
                            ? "border-slate-900 ring-2 ring-slate-900 bg-slate-50/40 shadow-sm"
                            : plan.popular
                              ? "border-blue-300 bg-white shadow-2xs hover:border-slate-400"
                              : "border-slate-200 bg-white hover:border-slate-300 shadow-2xs"
                          }`}
                      >
                        {plan.popular && (
                          <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2">
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                              {t("subscription.planPopular") || "Recommended"}
                            </span>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">
                              {plan.product?.name || t("subscription.planDefaultName") || "Tier"}
                            </h3>
                            {isSelected && (
                              <Badge className="bg-slate-900 text-white text-[10px] h-5 px-1.5">
                                Selected
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-extrabold text-slate-900">
                              ${priceFormatted}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              /{plan.recurring?.interval || "mo"}
                            </span>
                          </div>

                          {plan.product?.description && (
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {plan.product.description}
                            </p>
                          )}

                          <div className="pt-2 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                            {plan.metadata?.bins && (
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-slate-500" />
                                <span><strong>{plan.metadata.bins}</strong> Bins</span>
                              </div>
                            )}
                            {plan.metadata?.items && (
                              <div className="flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5 text-slate-500" />
                                <span><strong>{plan.metadata.items}</strong> Items</span>
                              </div>
                            )}
                            {plan.metadata?.locations && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                <span><strong>{plan.metadata.locations}</strong> Locations</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          disabled={isUpgradingThis}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlan(plan.id);
                            handleUpgradeToPlan(plan.id);
                          }}
                          className={`w-full mt-4 h-8 text-xs font-semibold rounded-lg transition-colors ${isSelected
                              ? "bg-slate-900 text-white hover:bg-slate-800"
                              : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50"
                            }`}
                        >
                          {isUpgradingThis ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Processing...</span>
                            </span>
                          ) : isSelected ? (
                            "Current Selection"
                          ) : (
                            "Select Tier"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {canUpgrade && selectedPlan && (
                  <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <h4 className="text-xs font-semibold text-slate-900 mb-3">
                      Complete Checkout
                    </h4>
                    <Elements stripe={stripePromise}>
                      <CheckoutForm
                        userId={currentUser?.uid}
                        planId={selectedPlan}
                        currency="usd"
                        originalPrice={
                          plans.find((p: any) => p.id === selectedPlan)?.unit_amount || 0
                        }
                      />
                    </Elements>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ModalMessage
        isOpen={modalState.isOpen}
        onClose={closeModal}
        type={modalState.type}
        message={modalState.message}
        title={modalState.title}
      />
    </div>
  );
}
