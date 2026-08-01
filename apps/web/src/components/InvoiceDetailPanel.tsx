import { useState } from "react";

import { api } from "../api";
import { formatDate, formatMoney, localIsoDate } from "../format";
import type { InvoiceDetail } from "../types";
import { StatusBadge } from "./StatusBadge";

interface InvoiceDetailPanelProps {
  invoice: InvoiceDetail | null;
  loading: boolean;
  onEdit: (invoice: InvoiceDetail) => void;
  onChanged: (message: string, keepSelected?: boolean) => Promise<void>;
  onDeleted: (message: string) => Promise<void>;
}

export function InvoiceDetailPanel({
  invoice,
  loading,
  onEdit,
  onChanged,
  onDeleted
}: InvoiceDetailPanelProps) {
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, operation: () => Promise<unknown>) {
    if (!invoice || action) return;
    setAction(label);
    setError(null);
    try {
      await operation();
      await onChanged(`Invoice marked ${label.toLowerCase()}.`, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invoice action failed.");
    } finally {
      setAction(null);
    }
  }

  async function remove() {
    if (!invoice || action || !window.confirm(`Delete ${invoice.invoiceNumber}?`)) return;
    setAction("Deleting");
    setError(null);
    try {
      await api.deleteInvoice(invoice.id);
      await onDeleted("Draft invoice deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invoice could not be deleted.");
    } finally {
      setAction(null);
    }
  }

  async function downloadPdf() {
    if (!invoice || action) return;
    setAction("PDF");
    setError(null);
    try {
      const { blob, fileName } = await api.downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF could not be downloaded.");
    } finally {
      setAction(null);
    }
  }

  if (loading) return <aside className="panel invoice-detail-panel loading-block">Loading invoice...</aside>;
  if (!invoice) {
    return (
      <aside className="panel invoice-detail-panel empty-state detail-empty">
        <div className="empty-icon" aria-hidden="true">↗</div>
        <h2>Select an invoice</h2>
        <p>Details and lifecycle actions appear here.</p>
      </aside>
    );
  }

  const canMarkOverdue = invoice.status === "SENT" && invoice.dueDate < localIsoDate();

  return (
    <aside className="panel invoice-detail-panel" aria-labelledby="invoice-detail-title">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Invoice detail</p>
          <h2 id="invoice-detail-title">{invoice.invoiceNumber}</h2>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="detail-client">
        <span>Bill to</span>
        <strong>{invoice.client.businessName}</strong>
        <p>{invoice.client.billingAddress}</p>
        <a href={`mailto:${invoice.client.email}`}>{invoice.client.email}</a>
      </div>

      <dl className="detail-metadata">
        <div><dt>Issued</dt><dd>{formatDate(invoice.issueDate)}</dd></div>
        <div><dt>Due</dt><dd>{formatDate(invoice.dueDate)}</dd></div>
        <div><dt>Currency</dt><dd>{invoice.currency}</dd></div>
      </dl>

      <div className="detail-items">
        {invoice.items.map((item) => (
          <div className="detail-item" key={item.id}>
            <div><strong>{item.description}</strong><small>{item.quantity} × {formatMoney(item.unitPrice, invoice.currency)}</small></div>
            <strong>{formatMoney(item.lineTotal, invoice.currency)}</strong>
          </div>
        ))}
      </div>

      <dl className="detail-totals">
        <div><dt>Subtotal</dt><dd>{formatMoney(invoice.subtotal, invoice.currency)}</dd></div>
        <div><dt>Tax ({invoice.taxRate}%)</dt><dd>{formatMoney(invoice.taxTotal, invoice.currency)}</dd></div>
        <div className="detail-grand-total"><dt>Total</dt><dd>{formatMoney(invoice.grandTotal, invoice.currency)}</dd></div>
      </dl>

      {invoice.notes && <p className="detail-notes"><strong>Notes</strong>{invoice.notes}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="detail-actions">
        {invoice.status === "DRAFT" && (
          <>
            <button className="button button-primary" disabled={!!action} type="button" onClick={() => void run("Sent", () => api.sendInvoice(invoice.id))}>
              {action === "Sent" ? "Sending..." : "Send invoice"}
            </button>
            <button className="button button-secondary" disabled={!!action} type="button" onClick={() => onEdit(invoice)}>Edit draft</button>
            <button className="button button-danger-ghost" disabled={!!action} type="button" onClick={() => void remove()}>Delete</button>
          </>
        )}
        {invoice.status === "SENT" && (
          <>
            <button className="button button-primary" disabled={!!action} type="button" onClick={() => void run("Paid", () => api.markInvoicePaid(invoice.id))}>Mark paid</button>
            <button
              className="button button-secondary"
              disabled={!!action || !canMarkOverdue}
              title={canMarkOverdue ? undefined : "Available after the due date"}
              type="button"
              onClick={() => void run("Overdue", () => api.markInvoiceOverdue(invoice.id))}
            >
              Mark overdue
            </button>
          </>
        )}
        {invoice.status === "OVERDUE" && (
          <button className="button button-primary" disabled={!!action} type="button" onClick={() => void run("Paid", () => api.markInvoicePaid(invoice.id))}>Mark paid</button>
        )}
        {invoice.status !== "DRAFT" && (
          <button className="button button-secondary" disabled={!!action} type="button" onClick={() => void downloadPdf()}>
            {action === "PDF" ? "Preparing PDF..." : "Download PDF"}
          </button>
        )}
      </div>
    </aside>
  );
}
