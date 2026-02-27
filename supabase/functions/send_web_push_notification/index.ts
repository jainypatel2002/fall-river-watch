import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const payload = await request.json().catch(() => null);

  // TODO: Integrate Web Push provider and VAPID signing.
  // Required env placeholders: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
  console.log("send_web_push_notification stub payload", payload);

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Web push notification stub executed. Provider integration intentionally deferred to Phase 2."
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
