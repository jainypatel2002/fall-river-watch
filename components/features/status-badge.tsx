import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/utils/constants";

export function StatusBadge({ status }: { status: keyof typeof STATUS_COLORS }) {
  return <Badge className={`border ${STATUS_COLORS[status]} capitalize`}>{status}</Badge>;
}
