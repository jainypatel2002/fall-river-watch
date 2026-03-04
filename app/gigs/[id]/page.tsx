import { GigDetail } from "@/components/gigs/gig-detail";

export default async function GigDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <GigDetail gigId={id} />
    </section>
  );
}
