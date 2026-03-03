import { NextResponse } from "next/server";

const ALLOWED_EVENTS = new Set(["shown", "dismissed", "clicked_install", "installed"]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as { event?: string } | null;
    const event = payload?.event;

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: "Invalid telemetry event" }, { status: 400 });
    }

    console.info("[install_prompt_telemetry]", {
      event,
      at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
