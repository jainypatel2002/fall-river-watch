import { redirect } from "next/navigation";
import { NotificationSettingsForm } from "@/components/features/notification-settings-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NotificationSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl">
      <NotificationSettingsForm />
    </section>
  );
}
