import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/features/admin-dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          Admin Dashboard
        </h1>
      </div>
      <AdminDashboard />
    </section>
  );
}
