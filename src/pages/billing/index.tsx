import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import CheckoutForm from "./CheckoutForm.tsx";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getStripePlans } from "../../lib/stripe";
import LogoIcon from "@/assets/logo.png";
import { STRIPE_PUBLISHABLE_KEY } from "../../config/stripe";
import { Check, Sparkles, Crown, Star, Zap } from "lucide-react";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const planIcons = [Zap, Star, Crown, Sparkles];

import { useTranslation } from 'react-i18next';

export default function BillingPage() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [subscription, setSubscription] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hoveredPlan, setHoveredPlan] = useState<string>("");

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
      await auth.signOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  useEffect(() => {
    const checkSubscription = async () => {
      if (currentUser) {
        const docRef = doc(db, "subscriptions", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const subData = docSnap.data();
          setSubscription(subData);
          // Filter plans to only show higher tiers
          const currentPlanIndex = plans.findIndex(
            (plan) => plan.id === subData.planId
          );
          if (currentPlanIndex !== -1) {
            setPlans(plans.slice(currentPlanIndex + 1));
          }
        }
        setLoading(false);
      }
    };

    checkSubscription();
  }, [currentUser, plans]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const stripePlans = await getStripePlans();

      console.log(stripePlans);

      const filteredPlans = stripePlans.filter(plan => {
        const keys = plan.metadata ? Object.keys(plan.metadata) : [];
        return keys.includes("tokens") && keys.length > 1;
      });

      // Invertir el orden de los planes
      setPlans(filteredPlans.reverse());
    } catch (error) {
      console.error("Error fetching plans:", error);
      setError(`Failed to load plans. Please try again later.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

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
          <p className="text-gray-600 font-medium">{t('messages.loadingAccount')}</p>
        </div>
      </div>
    );
  }

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
          <p className="text-gray-600 font-medium">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (subscription && plans.length === 0) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <img src={LogoIcon} alt="boxbin logo" className="h-10" />
              <div className="h-6 w-px bg-gray-300"></div>
              <span className="text-gray-600 font-medium">Subscription</span>
            </div>

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
              <Button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Logout
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-4">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 text-indigo-600">
            <Sparkles className="w-6 h-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              Premium Plans
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Choose Your
            <br />
            <span className="text-indigo-600">Perfect Plan</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Unlock the full potential of your experience with our carefully
            crafted subscription plans designed to grow with you.
          </p>
        </div>

        {/* Plans Section */}
        <div className="mt-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 font-medium">{t('messages.loadingPlans')}</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Oops! Something went wrong
                </h3>
                <p className="text-gray-600 mb-6">{error}</p>
                <Button
                  onClick={fetchPlans}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-3xl">📦</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No plans available
                </h3>
                <p className="text-gray-600">
                  Check back later for amazing subscription options
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {plans
                .sort((a, b) => a.unit_amount - b.unit_amount)
                .map((plan, index) => {
                  const IconComponent = planIcons[index % planIcons.length];
                  const isSelected = selectedPlan === plan.id;
                  const isHovered = hoveredPlan === plan.id;
                  const isPopular = index === Math.floor(plans.length / 2);

                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      onMouseEnter={() => setHoveredPlan(plan.id)}
                      onMouseLeave={() => setHoveredPlan("")}
                      className="cursor-pointer transform transition-all duration-300 hover:scale-105 relative"
                    >
                      {/* Popular Badge */}
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-[140px]">
                          <div className="bg-indigo-600 text-white px-3 py-1 rounded-full font-bold shadow-lg w-full">
                            <div className="flex items-center justify-center space-x-1 w-full">
                              <Crown className="w-[0.9em] h-[0.9em]" />
                              <span className="text-[0.9em] whitespace-nowrap">
                                Most Popular
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <Card
                        className={`relative h-full transition-all duration-300 flex flex-col ${
                          isSelected
                            ? "border-2 border-indigo-500 shadow-xl bg-indigo-50"
                            : isHovered
                            ? "border-2 border-indigo-300 shadow-lg bg-gray-50"
                            : "border border-gray-200 hover:border-gray-300 shadow-md bg-white"
                        }`}
                      >
                        {/* Selected Indicator */}
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg z-10">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}

                        <CardHeader className="">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-3 transition-all duration-300 ${
                              isSelected
                                ? "bg-indigo-600 shadow-lg"
                                : isHovered
                                ? "bg-indigo-500 shadow-lg"
                                : "bg-gray-600"
                            }`}
                          >
                            <IconComponent className="w-6 h-6 text-white" />
                          </div>

                          <CardTitle className="text-lg font-bold text-center text-gray-900 mb-2">
                            {plan.product.name}
                          </CardTitle>
                          {plan.product.description && (
                            <p className="text-xs text-gray-600 text-center leading-relaxed">
                              {plan.product.description}
                            </p>
                          )}
                        </CardHeader>

                        <CardContent className="pt-0 pb-4 flex-1 flex flex-col">
                          <div className="text-center mb-2">
                            <div className="flex items-baseline justify-center gap-1 mb-1">
                              <span className="text-3xl font-bold text-gray-900">
                                ${(plan.unit_amount / 100).toFixed(2)}
                              </span>
                              <span className="text-gray-600 font-medium text-sm">
                                /{plan.recurring.interval}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Billed {plan.recurring.interval}ly
                            </p>
                          </div>

                          {/* Aquí van los features */}
                          <div className="mb-4 space-y-1 text-sm text-gray-700 flex-1">
                            {/* Trial period display */}
                            {plan.metadata?.trial === "true" && (
                              <p className="text-green-600 font-semibold mb-2">
                                🎉 30 Days Free Trial
                              </p>
                            )}
                            {plan.metadata?.bins && (
                              <p>
                                📦 Bins:{" "}
                                <span className="font-semibold">
                                  {plan.metadata.bins}
                                </span>
                              </p>
                            )}
                            {plan.metadata?.items && (
                              <p>
                                📦 Max items (Per Containers):{" "}
                                <span className="font-semibold">
                                  {plan.metadata.items}
                                </span>
                              </p>
                            )}
                            {plan.metadata?.locations && (
                              <p>
                                📍 Locations:{" "}
                                <span className="font-semibold">
                                  {plan.metadata.locations}
                                </span>
                              </p>
                            )}
                          </div>

                          <Button
                            className={`w-full py-3 text-sm font-semibold transition-all duration-300 ${
                              isSelected
                                ? "bg-indigo-600 hover:bg-indigo-700 shadow-lg"
                                : isHovered
                                ? "bg-indigo-600 hover:bg-indigo-700 shadow-lg"
                                : "bg-gray-900 hover:bg-gray-800 shadow-md"
                            } text-white`}
                          >
                            <div className="flex items-center justify-center space-x-2">
                              {isSelected && <Check className="w-4 h-4" />}
                              <span>
                                {isSelected ? "Selected" : "Select Plan"}
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
          {selectedPlan && (
            <div ref={checkoutRef} className="mt-5 max-w-lg mx-auto mb-20">
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Complete Your Purchase
                  </h3>
                  <p className="text-gray-600">
                    You're one step away from unlocking premium features
                  </p>
                </div>

                {plans.find((p) => p.id === selectedPlan)?.unit_amount === 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      This is a free plan - no payment required.
                    </p>
                    <Button
                      onClick={async () => {
                        try {
                          await addDoc(collection(db, "subscriptions"), {
                            userId: currentUser?.uid,
                            planId: selectedPlan,
                            status: "active",
                            createdAt: new Date().toISOString(),
                            userEmail: currentUser?.email,
                          });

                          if ((window as any).ReactNativeWebView) {
                            (window as any).ReactNativeWebView.postMessage(
                              JSON.stringify({
                                type: "SUBSCRIPTION_SUCCESS",
                              })
                            );
                          } else {
                            window.location.reload();
                          }
                        } catch (error) {
                          console.error(
                            "Error creating free subscription:",
                            error
                          );
                        }
                      }}
                      className="w-full"
                    >
                      Activate Free Plan
                    </Button>
                  </div>
                ) : (
                  <Elements stripe={stripePromise}>
                    <CheckoutForm
                      userId={currentUser?.uid}
                      planId={selectedPlan}
                      currency="usd"
                      originalPrice={plans.find((p) => p.id === selectedPlan)?.unit_amount || 0}
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
