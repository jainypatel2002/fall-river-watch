import { redirect } from "next/navigation";
import { GroupSettingsPanel } from "@/components/groups/group-settings-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl">
      <GroupSettingsPanel slug={slug} />
    </section>
  );
}
