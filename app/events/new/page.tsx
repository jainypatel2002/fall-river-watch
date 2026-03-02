import Link from "next/link";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewEventPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          New Event
        </h1>
        <Link href="/events" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to events
        </Link>
      </div>
      <EventForm mode="create" />
    </section>
  );
}
