import { redirect } from "next/navigation";
import { GroupRequestsPanel } from "@/components/groups/group-requests-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GroupRequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl">
      <GroupRequestsPanel slug={slug} />
    </section>
  );
}
