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

    const { subscriptionId, userId } = await req.json();

    if (!subscriptionId || !userId) {
      return new Response(JSON.stringify({ error: "subscriptionId and userId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Cancel in Stripe
    const deletedSubscription = await stripe.subscriptions.cancel(subscriptionId);

    // 2. Delete or update in Supabase 'subscriptions' table
    const { error: dbError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("userId", userId);

    if (dbError) {
      console.warn("DB update error:", dbError.message);
    }

    return new Response(
      JSON.stringify({ success: true, subscription: deletedSubscription }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error cancelSubscription:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
