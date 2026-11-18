import { billingHandler } from '../_shared/billing-server.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return billingHandler(req);
  try {
    const body = await req.json();
    return billingHandler(new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify({ ...body, operation: 'validate_coupon' }) }));
  } catch { return new Response(JSON.stringify({ error: 'BILLING_INVALID' }), { status: 400 }); }
});
