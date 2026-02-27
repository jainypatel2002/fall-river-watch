import { ReportDetail } from "@/components/features/report-detail";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <section className="mx-auto w-full max-w-4xl">
      <ReportDetail reportId={id} />
    </section>
  );
}
