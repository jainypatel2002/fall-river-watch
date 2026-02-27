import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const payload = await request.json().catch(() => null);

  // TODO: Integrate Resend or your provider.
  // Required env placeholder: RESEND_API_KEY
  console.log("send_email_notification stub payload", payload);

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Email notification stub executed. Provider integration intentionally deferred to Phase 2."
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
