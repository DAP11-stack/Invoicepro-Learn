import { formatDate, formatMoney } from "../format";
import type { Client, InvoiceListItem, InvoiceStatus } from "../types";
import { StatusBadge } from "./StatusBadge";

interface InvoiceListProps {
  invoices: InvoiceListItem[];
  clients: Client[];
  loading: boolean;
  selectedId: string | null;
  statusFilter: InvoiceStatus | "";
  clientFilter: string;
  onStatusFilter: (value: InvoiceStatus | "") => void;
  onClientFilter: (value: string) => void;
  onSelect: (id: string) => void;
}

export function InvoiceList({
  invoices,
  clients,
  loading,
  selectedId,
  statusFilter,
  clientFilter,
  onStatusFilter,
  onClientFilter,
  onSelect
}: InvoiceListProps) {
  return (
    <section className="panel invoice-list-panel" aria-labelledby="invoice-list-title">
      <div className="section-heading invoice-list-heading">
        <div>
          <p className="eyebrow">Records</p>
          <h2 id="invoice-list-title">Invoices</h2>
        </div>
        <span className="count-pill">{invoices.length}</span>
      </div>

      <div className="filters" aria-label="Invoice filters">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value as InvoiceStatus | "")}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="OVERDUE">Overdue</option>
            <option value="PAID">Paid</option>
          </select>
        </label>
        <label>
          Client
          <select value={clientFilter} onChange={(event) => onClientFilter(event.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.businessName}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="loading-block">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="empty-state compact-empty">
          <div className="empty-icon" aria-hidden="true">I</div>
          <h3>No matching invoices</h3>
          <p>Create a draft or adjust the filters.</p>
        </div>
      ) : (
        <div className="invoice-list">
          {invoices.map((invoice) => (
            <button
              className={`invoice-row${selectedId === invoice.id ? " selected" : ""}`}
              key={invoice.id}
              type="button"
              onClick={() => onSelect(invoice.id)}
            >
              <span className="invoice-row-main">
                <strong>{invoice.invoiceNumber}</strong>
                <small>{invoice.client.businessName}</small>
              </span>
              <span className="invoice-row-date">
                <small>Due</small>
                {formatDate(invoice.dueDate)}
              </span>
              <StatusBadge status={invoice.status} />
              <strong className="invoice-row-total">{formatMoney(invoice.grandTotal, invoice.currency)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
