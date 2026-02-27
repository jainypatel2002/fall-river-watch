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
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
          New Incident
        </h1>
        <Link href="/" className="text-sm text-zinc-700 underline underline-offset-4">
          Back to map
        </Link>
      </div>
      <NewReportForm />
    </main>
  );
}
