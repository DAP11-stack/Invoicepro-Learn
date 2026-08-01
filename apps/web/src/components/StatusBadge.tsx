import { statusLabel } from "../format";
import type { InvoiceStatus } from "../types";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}
