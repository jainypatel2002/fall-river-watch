import { redirect } from "next/navigation";
import { MyGigsShell } from "@/components/gigs/my-gigs-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MyGigsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return <MyGigsShell />;
}
