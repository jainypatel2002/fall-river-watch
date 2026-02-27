import { redirect } from "next/navigation";
import { AuthForm } from "@/components/features/auth-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AuthPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <section className="mx-auto w-full max-w-6xl py-6">
      <AuthForm />
    </section>
  );
}
