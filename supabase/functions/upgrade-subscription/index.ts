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

    const { subscriptionId, newPriceId, userId } = await req.json();

    if (!subscriptionId || !newPriceId || !userId) {
      return new Response(JSON.stringify({ error: "subscriptionId, newPriceId and userId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get current subscription from Stripe
    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    // 2. Update with proration in Stripe
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      items: [
        {
          id: currentSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
    });

    // 3. Update in Supabase 'subscriptions' table
    await supabase
      .from("subscriptions")
      .update({
        planId: newPriceId,
        updatedAt: new Date().toISOString(),
      })
      .eq("userId", userId)
      .eq("status", "active");

    return new Response(
      JSON.stringify({ success: true, subscription: updatedSubscription }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error upgradeSubscription:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
