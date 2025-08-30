import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  CheckCircle,
  Crown,
  Check,
  Zap,
  Star,
  Package,
  MapPin,
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
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import CheckoutForm from "./CheckoutForm";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "@/config/stripe";
import { ModalMessage, type ModalType } from "@/components/layout/ModalMessage";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export default function ActiveSubscriptionPage() {
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

  // Estados para el modal de upgrade
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [plans, setPlans] = useState<any>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<any>(null);
  const [upgradingToPlan, setUpgradingToPlan] = useState<any>(null);
  const [canUpgrade, setCanUpgrade] = useState(false);

  const handleCancelSubscription = async () => {
    setUpgradingToPlan(null);
    if (!subscription?.stripeSubscriptionId || !subscription?.userId) {
      if (subscription.plan === "Trial" && subscription.status === "active") {
        const q = query(
          collection(db, "subscriptions"),
          where("userId", "==", currentUser?.uid)
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Obtener el ID del documento
          const docId = querySnapshot.docs[0].id;
          await deleteDoc(doc(db, "subscriptions", docId));
          navigate("/billing");
        }
        return;
      }
      return;
    }
    setRedirecting(true);

    console.log(subscription.stripeSubscriptionId, subscription.userId);
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

      console.log("All plans:", stripePlans);

      // Filtrar solo los planes superiores al actual
      const currentPlanPrice = subscription?.price || 0;
      const superiorPlans = stripePlans.filter((plan) => {
        const planPrice = (plan.unit_amount || 0) / 100;
        return planPrice > currentPlanPrice;
      });

      console.log(superiorPlans);

      const filteredPlans = superiorPlans.filter(plan => {
        const keys = plan.metadata ? Object.keys(plan.metadata) : [];
        return keys.includes("tokens") && keys.length > 1;
      });

      // Ordenar de menor a mayor precio
      const sortedPlans = filteredPlans.sort(
        (a, b) => a.unit_amount - b.unit_amount
      );

      setPlans(sortedPlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      setPlansError(`Failed to load plans. Please try again later.`);
    } finally {
      setPlansLoading(false);
    }
  }, [subscription?.price]);

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
    fetchPlans();
  };

  const handleUpgradeToPlan = async (newPriceId: string) => {
    console.log(subscription, " j j ");
    if (
      !subscription?.stripeSubscriptionId &&
      subscription.plan === "Free Trial" &&
      subscription.status === "active"
    ) {
      setSelectedPlan(newPriceId);
      setCanUpgrade(true);
      return;
    }

    if (!subscription?.stripeSubscriptionId || !currentUser?.uid) return;

    try {
      setPlansLoading(true);
      const result = await upgradeSubscription({
        subscriptionId: subscription?.stripeSubscriptionId,
        newPriceId,
        userId: currentUser?.uid,
      });

      console.log("Upgrade exitoso:", result);
      toast.success("¡Tu suscripción fue actualizada!");
      setPlansLoading(true);
      window.location.reload();
    } catch (error: any) {
      console.error("Error al actualizar plan:", error);
      toast.error("Hubo un problema al actualizar tu suscripción.");
    } finally {
      //setIsLoading(false);
    }
  };

  const [selectedPlan, setSelectedPlan] = useState<string>("");

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!currentUser?.uid) return;

      try {
        const q = query(
          collection(db, "subscriptions"),
          where("userId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const sub = querySnapshot.docs[0].data();

          console.log(sub, " sun");
          if (sub.planId) {
            const stripePlan = await getStripePlanById(sub.planId);
            if (!stripePlan) {
              return;
            }

            console.log(stripePlan);
            const fullSubscription = {
              ...sub,
              plan: stripePlan?.product?.name ?? "Unknown Plan",
              price: (stripePlan?.unit_amount ?? 0) / 100,
              interval: stripePlan?.recurring?.interval ?? "month",
              metadata: stripePlan?.metadata ?? {},
            };

            setSubscription(fullSubscription);
          } else {
            //setSubscription(sub);
          }
        } else {
          console.log("❌ No se encontró suscripción para el usuario.");
        }
      } catch (error) {
        console.error("🔥 Error al obtener suscripción:", error);
      }

      setLoading(false);
    };

    fetchSubscription();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6"></div>
            <div
              className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-purple-400 rounded-full animate-spin mx-auto"
              style={{
                animationDirection: "reverse",
                animationDuration: "1.5s",
              }}
            ></div>
          </div>
          <p className="text-gray-600 font-medium">
            Loading your subscription...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                My Subscription
              </h1>
            </div>
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
                  Back
                </Button>
              ) : (
                <></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="max-w-3xl mx-auto py-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center space-x-2 text-indigo-600">
            <Sparkles className="w-6 h-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              Current Plan
            </span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Your <span className="text-indigo-600">Subscription</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
            Here are the details of your current subscription.
          </p>
          <p className="text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
            You can manage or cancel anytime.
          </p>
        </div>

        <Card className="border border-gray-200 shadow-lg">
          <CardHeader className="text-center relative">
            <div className="absolute top-4 right-4">
              <Button
                disabled={redirecting}
                onClick={() => setShowCancelDialog(true)}
                className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1 h-8"
                size="sm"
              >
                Cancel Subscription
              </Button>

              <AlertDialog
                open={showCancelDialog}
                onOpenChange={setShowCancelDialog}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel your subscription? This
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      No, keep my subscription
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancelSubscription}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      disabled={redirecting}
                    >
                      {redirecting ? (
                        <span className="flex items-center justify-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Cancelling...</span>
                        </span>
                      ) : (
                        "Yes, cancel subscription"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="w-12 h-12 mx-auto mb-4 bg-indigo-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl text-gray-900 font-bold">
              {subscription?.plan || "Unknown Plan"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 px-4 pb-4">
            <div className="flex justify-between text-sm text-gray-700">
              <span>Status</span>
              <span
                className={`font-semibold ${
                  subscription?.status !== "active"
                    ? "text-yellow-600"
                    : "text-green-600"
                }`}
              >
                {subscription?.status !== "active" ? "Inactive" : "Active"}
              </span>
            </div>

            <div className="flex justify-between text-sm text-gray-700">
              <span>Price</span>
              <span>
                ${subscription?.price?.toFixed(2)} / {subscription?.interval}
              </span>
            </div>

            <div className="flex justify-between text-sm text-gray-700">
              <span>Included Bins</span>
              <span>{subscription?.metadata?.bins || "?"}</span>
            </div>

            <div className="flex justify-between text-sm text-gray-700">
              <span>Included Items</span>
              <span>{subscription?.metadata?.items || "?"}</span>
            </div>

            <div className="flex justify-between text-sm text-gray-700">
              <span>Locations</span>
              <span>{subscription?.metadata?.locations || "?"}</span>
            </div>

            <Button
              disabled={redirecting}
              onClick={handleUpgradeClick}
              className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
            >
              {redirecting ? (
                <span className="flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Redirecting...</span>
                </span>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Upgrade subscription</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header compacto y fijo */}
          <DialogHeader className="text-center space-y-2 pb-2 flex-shrink-0 border-b border-gray-100">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Upgrade Your Plan
            </DialogTitle>
            <p className="text-gray-600 text-sm">
              Choose a higher plan to unlock more features
            </p>
          </DialogHeader>

          {/* Contenido scrolleable */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-3">
              {plansLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="relative mb-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse"></div>
                    <Loader2 className="w-6 h-6 text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">
                    Loading......
                  </h3>
                  <p className="text-gray-600 text-sm">Please wait...</p>
                </div>
              ) : plansError ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Crown className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Something went wrong
                  </h3>
                  <p className="text-red-600 mb-4 text-sm">{plansError}</p>
                  <Button
                    onClick={fetchPlans}
                    variant="outline"
                    size="sm"
                    className="hover:bg-red-50 border-red-200"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto">
                      <Crown className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    You're Already at the Top! 👑
                  </h3>
                  <p className="text-gray-600 max-w-md mx-auto text-sm leading-relaxed">
                    You're already enjoying our highest tier with all premium
                    features.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Grid de planes más compacto */}
                  <div
                    className={`grid gap-4 grid-cols-1 ${
                      plans.length === 1
                        ? "md:grid-cols-1"
                        : plans.length === 2
                        ? "md:grid-cols-2"
                        : "md:grid-cols-3"
                    }`}
                  >
                    {plans.map((plan: any) => {
                      const isSelected = selectedPlan === plan.id;

                      return (
                        <div key={plan.id} className="relative">
                          {/* Badge de popular más pequeño */}
                          {plan.popular && (
                            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                              <div className="bg-gradient-to-r from-orange-400 to-pink-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center shadow-lg">
                                <Star className="w-3 h-3 mr-1" />
                                Popular
                              </div>
                            </div>
                          )}

                          <Card
                            className={`
                            relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 h-full cursor-pointer
                            ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-50 shadow-lg scale-105"
                                : plan.popular
                                ? "border-gradient-to-r from-orange-400 to-pink-500 shadow-md"
                                : "border-gray-200 hover:border-indigo-300"
                            }
                          `}
                            onClick={() => {
                              setSelectedPlan(plan.id);
                              handleUpgradeToPlan(plan.id);
                            }}
                          >
                            {/* Efecto de gradiente sutil para plan popular */}
                            {plan.popular && !isSelected && (
                              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-pink-50 opacity-30"></div>
                            )}

                            {/* Efecto de gradiente para plan seleccionado */}
                            {isSelected && (
                              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-50"></div>
                            )}

                            <CardHeader className="text-center pb-3 relative z-10">
                              {/* Icono más pequeño */}
                              <div
                                className={`
                                w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center
                                ${
                                  isSelected
                                    ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                                    : plan.popular
                                    ? "bg-gradient-to-br from-orange-400 to-pink-500"
                                    : "bg-gradient-to-br from-indigo-500 to-purple-600"
                                }
                              `}
                              >
                                <Crown className="w-5 h-5 text-white" />
                              </div>

                              <CardTitle className="text-lg font-bold text-gray-900 mb-1">
                                {plan.product?.name || "Premium Plan"}
                                {isSelected && (
                                  <span className="ml-2 text-indigo-600">
                                    ✓
                                  </span>
                                )}
                              </CardTitle>

                              {/* Precio más compacto */}
                              <div className="mb-2">
                                <div
                                  className={`
                                  text-2xl font-bold mb-0
                                  ${
                                    isSelected
                                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"
                                      : plan.popular
                                      ? "bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent"
                                      : "text-indigo-600"
                                  }
                                `}
                                >
                                  ${((plan.unit_amount || 0) / 100).toFixed(2)}
                                </div>
                                <div className="text-gray-600 text-sm">
                                  per {plan.recurring?.interval || "month"}
                                </div>
                              </div>

                              {plan.product?.description && (
                                <p className="text-gray-600 text-xs leading-tight line-clamp-2">
                                  {plan.product.description}
                                </p>
                              )}
                            </CardHeader>

                            <CardContent className="space-y-3 relative z-10 flex-1 flex flex-col h-full px-4 pb-4">
                              {/* Features más compactas */}
                              <div className="space-y-2 flex-grow">
                                {plan.metadata?.bins && (
                                  <div className="flex items-center text-sm">
                                    <div
                                      className={`
                                      w-4 h-4 rounded-full flex items-center justify-center mr-2
                                      ${
                                        isSelected
                                          ? "bg-indigo-100"
                                          : plan.popular
                                          ? "bg-orange-100"
                                          : "bg-green-100"
                                      }
                                    `}
                                    >
                                      <Package
                                        className={`w-3 h-3 ${
                                          isSelected
                                            ? "text-indigo-500"
                                            : plan.popular
                                            ? "text-orange-500"
                                            : "text-green-500"
                                        }`}
                                      />
                                    </div>
                                    <span className="font-medium text-gray-800 truncate">
                                      {plan.metadata.bins} bins
                                    </span>
                                  </div>
                                )}

                                {plan.metadata?.items && (
                                  <div className="flex items-center text-sm">
                                    <div
                                      className={`
                                      w-4 h-4 rounded-full flex items-center justify-center mr-2
                                      ${
                                        isSelected
                                          ? "bg-indigo-100"
                                          : plan.popular
                                          ? "bg-orange-100"
                                          : "bg-green-100"
                                      }
                                    `}
                                    >
                                      <Zap
                                        className={`w-3 h-3 ${
                                          isSelected
                                            ? "text-indigo-500"
                                            : plan.popular
                                            ? "text-orange-500"
                                            : "text-green-500"
                                        }`}
                                      />
                                    </div>
                                    <span className="font-medium text-gray-800 truncate">
                                      {plan.metadata.items} items
                                    </span>
                                  </div>
                                )}

                                {plan.metadata?.locations && (
                                  <div className="flex items-center text-sm">
                                    <div
                                      className={`
                                      w-4 h-4 rounded-full flex items-center justify-center mr-2
                                      ${
                                        isSelected
                                          ? "bg-indigo-100"
                                          : plan.popular
                                          ? "bg-orange-100"
                                          : "bg-green-100"
                                      }
                                    `}
                                    >
                                      <MapPin
                                        className={`w-3 h-3 ${
                                          isSelected
                                            ? "text-indigo-500"
                                            : plan.popular
                                            ? "text-orange-500"
                                            : "text-green-500"
                                        }`}
                                      />
                                    </div>
                                    <span className="font-medium text-gray-800 truncate">
                                      {plan.metadata.locations} locations
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Botón más compacto */}
                              <Button
                                onClick={() => handleUpgradeToPlan(plan.id)}
                                disabled={upgradingToPlan === plan.id}
                                size="sm"
                                className={`
                                  w-full font-semibold transition-all duration-200 relative overflow-hidden
                                  ${
                                    isSelected
                                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl"
                                      : plan.popular
                                      ? "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg"
                                      : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white hover:shadow-md"
                                  }
                                  ${
                                    upgradingToPlan === plan.id
                                      ? "animate-pulse"
                                      : ""
                                  }
                                `}
                              >
                                {upgradingToPlan === plan.id ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm">
                                      Processing...
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center space-x-2">
                                    <Crown className="w-4 h-4" />
                                    <span className="text-sm">
                                      {isSelected
                                        ? "Selected Plan"
                                        : "Upgrade Now"}
                                    </span>
                                  </div>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>

                  {canUpgrade && (
                    <Elements stripe={stripePromise}>
                      <CheckoutForm
                        userId={currentUser?.uid}
                        planId={selectedPlan}
                        currency="usd"
                        originalPrice={
                          plans.find((p: any) => p.id === selectedPlan)
                            ?.unit_amount || 0
                        }
                      />
                    </Elements>
                  )}
                </div>
              )}
            </div>
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
