import { GroupDetail } from "@/components/groups/group-detail";

export default async function GroupChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <section className="mx-auto w-full max-w-5xl">
      <GroupDetail slug={slug} initialTab="chat" />
    </section>
  );
}
