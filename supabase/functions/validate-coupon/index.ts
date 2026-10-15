import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("APIKEY") || "";
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { couponCode, planId, userId } = await req.json();

    if (!couponCode || typeof couponCode !== "string") {
      return new Response(JSON.stringify({ error: "Coupon code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const coupon = await stripe.coupons.retrieve(couponCode.toUpperCase());

    if (!coupon.valid) {
      return new Response(JSON.stringify({ valid: false, error: "The coupon is not valid or has expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) {
      return new Response(JSON.stringify({ valid: false, error: "The coupon has expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
      return new Response(JSON.stringify({ valid: false, error: "The coupon has reached its redemption limit" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (coupon.metadata && coupon.metadata.restricted_plans && planId) {
      const allowedPlans = coupon.metadata.restricted_plans.split(",");
      if (!allowedPlans.includes(planId)) {
        return new Response(JSON.stringify({ valid: false, error: "This coupon is not valid for the selected plan" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (userId && coupon.metadata && coupon.metadata.one_per_customer === "true") {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("userId", userId)
        .eq("couponUsed->>id", coupon.id);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ valid: false, error: "You have already used this coupon before" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        valid: true,
        coupon: {
          id: coupon.id,
          percent_off: coupon.percent_off,
          amount_off: coupon.amount_off,
          currency: coupon.currency,
          name: coupon.name,
          duration: coupon.duration,
          duration_in_months: coupon.duration_in_months,
          metadata: coupon.metadata,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    if (error.type === "StripeInvalidRequestError" || error.code === "resource_missing") {
      return new Response(JSON.stringify({ valid: false, error: "Invalid coupon code" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
