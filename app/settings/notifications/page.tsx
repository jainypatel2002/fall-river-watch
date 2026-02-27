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
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationSettingsForm />
    </main>
  );
}
