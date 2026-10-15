import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    const { priceId } = await req.json();

    if (!priceId || typeof priceId !== "string") {
      return new Response(JSON.stringify({ error: "priceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });

    const product = price.product as Stripe.Product;

    return new Response(
      JSON.stringify({
        priceId: price.id,
        unit_amount: price.unit_amount ?? 0,
        currency: price.currency,
        recurring: price.recurring ?? null,
        product: {
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          metadata: product.metadata,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
