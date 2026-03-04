import { GigChatPage } from "@/components/gigs/gig-chat-page";

export default async function GigChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <GigChatPage threadId={threadId} />
    </section>
  );
}
