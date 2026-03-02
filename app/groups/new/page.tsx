import Link from "next/link";
import { redirect } from "next/navigation";
import { GroupForm } from "@/components/groups/group-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewGroupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          Create Group
        </h1>
        <Link href="/groups" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to groups
        </Link>
      </div>
      <GroupForm />
    </section>
  );
}
