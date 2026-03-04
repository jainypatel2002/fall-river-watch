import { NextResponse } from "next/server";
import { gigMediaUrlRequestSchema } from "@/lib/schemas/gigs";
import { requireAuth } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const parsed = gigMediaUrlRequestSchema.safeParse({
      path: url.searchParams.get("path")
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
    }

    const { data: authorizedPath, error: authorizationError } = await auth.supabase.rpc("create_signed_gig_media_url", {
      p_storage_path: parsed.data.path
    });

    if (authorizationError || !authorizedPath) {
      return NextResponse.json({ error: authorizationError?.message ?? "Forbidden" }, { status: 403 });
    }

    const { data, error } = await auth.supabase.storage.from("gig-media").createSignedUrl(authorizedPath, 60 * 10);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message ?? "Unable to create signed URL" }, { status: 400 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate media URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
