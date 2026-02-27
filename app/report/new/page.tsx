import Link from "next/link";
import { redirect } from "next/navigation";
import { NewReportForm } from "@/components/features/new-report-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewReportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          New Incident
        </h1>
        <Link href="/" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to map
        </Link>
      </div>
      <NewReportForm />
    </section>
  );
}
