import { EventDetail } from "@/components/events/event-detail";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <section className="mx-auto w-full max-w-4xl">
      <EventDetail eventId={id} />
    </section>
  );
}
