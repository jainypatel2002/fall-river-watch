import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const payload = await request.json().catch(() => null);

  // MVP note:
  // Server-side limits are currently enforced in Next route handlers
  // (5 reports/day/user, 60 votes/day/user). This function is scaffold-only.
  console.log("rate_limit_guard scaffold payload", payload);

  return new Response(
    JSON.stringify({
      ok: true,
      enforced: false,
      message: "Rate limit edge guard scaffold only. Primary enforcement is in app route handlers for MVP."
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
