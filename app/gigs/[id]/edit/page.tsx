import Link from "next/link";
import { redirect } from "next/navigation";
import { GigEditPage } from "@/components/gigs/gig-edit-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditGigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          Edit Gig
        </h1>
        <Link href={`/gigs/${id}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to gig
        </Link>
      </div>
      <GigEditPage gigId={id} />
    </section>
  );
}
