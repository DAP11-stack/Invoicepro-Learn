import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ApiError, api } from "../api";
import { formatMoney, localIsoDate } from "../format";
import type { Client, InvoiceDetail, InvoiceInput, InvoiceItemInput } from "../types";

const emptyItem = (): InvoiceItemInput => ({ description: "", quantity: "1", unitPrice: "" });

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function blankInvoice(clientId = ""): InvoiceInput {
  return {
    clientId,
    issueDate: localIsoDate(),
    dueDate: dateAfter(14),
    currency: "IDR",
    taxRate: "11",
    notes: "",
    items: [emptyItem()]
  };
}

interface InvoiceFormProps {
  clients: Client[];
  editingInvoice: InvoiceDetail | null;
  onCancelEdit: () => void;
  onSaved: (invoiceId: string, message: string) => Promise<void>;
  onOpenClients: () => void;
}

export function InvoiceForm({
  clients,
  editingInvoice,
  onCancelEdit,
  onSaved,
  onOpenClients
}: InvoiceFormProps) {
  const [form, setForm] = useState<InvoiceInput>(() => blankInvoice(clients[0]?.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Array<{ path: string; message: string }>>([]);

  useEffect(() => {
    if (editingInvoice) {
      setForm({
        clientId: editingInvoice.clientId,
        issueDate: editingInvoice.issueDate,
        dueDate: editingInvoice.dueDate,
        currency: editingInvoice.currency,
        taxRate: editingInvoice.taxRate,
        notes: editingInvoice.notes ?? "",
        items: editingInvoice.items.map(({ description, quantity, unitPrice }) => ({
          description,
          quantity,
          unitPrice
        }))
      });
    } else {
      setForm((current) => blankInvoice(current.clientId || clients[0]?.id));
    }
    setError(null);
    setDetails([]);
  }, [editingInvoice, clients]);

  const preview = useMemo(() => {
    const subtotal = form.items.reduce((total, item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      return total + (Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : 0);
    }, 0);
    const tax = subtotal * (Number(form.taxRate || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [form.items, form.taxRate]);

  function updateField<K extends keyof InvoiceInput>(field: K, value: InvoiceInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index: number, field: keyof InvoiceItemInput, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }));
  }

  function removeItem(index: number) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setDetails([]);

    const payload: InvoiceInput = {
      ...form,
      currency: form.currency.trim().toUpperCase(),
      notes: form.notes?.trim() || null
    };

    try {
      const saved = editingInvoice
        ? await api.updateInvoice(editingInvoice.id, payload)
        : await api.createInvoice(payload);
      await onSaved(saved.id, editingInvoice ? "Draft invoice updated." : "Draft invoice created.");
      if (!editingInvoice) setForm(blankInvoice(form.clientId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invoice could not be saved.");
      if (caught instanceof ApiError) setDetails(caught.details);
    } finally {
      setSubmitting(false);
    }
  }

  if (clients.length === 0) {
    return (
      <section className="panel invoice-form-panel empty-state prominent-empty">
        <div className="empty-icon" aria-hidden="true">+</div>
        <h2>Create a client first</h2>
        <p>Invoices need a billing client before line items can be saved.</p>
        <button className="button button-primary" type="button" onClick={onOpenClients}>
          Add a client
        </button>
      </section>
    );
  }

  return (
    <section className="panel invoice-form-panel" aria-labelledby="invoice-form-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Invoice editor</p>
          <h2 id="invoice-form-title">{editingInvoice ? "Edit draft" : "New invoice"}</h2>
        </div>
        {editingInvoice && (
          <button className="button button-ghost" type="button" onClick={onCancelEdit}>
            Cancel edit
          </button>
        )}
      </div>

      <form className="stack-form" onSubmit={submit}>
        <div className="invoice-fields">
          <label className="wide-field">
            Client
            <select
              required
              value={form.clientId}
              onChange={(event) => updateField("clientId", event.target.value)}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.businessName}</option>
              ))}
            </select>
          </label>
          <label>
            Issue date
            <input
              required
              type="date"
              value={form.issueDate}
              onChange={(event) => updateField("issueDate", event.target.value)}
            />
          </label>
          <label>
            Due date
            <input
              required
              type="date"
              value={form.dueDate}
              min={form.issueDate}
              onChange={(event) => updateField("dueDate", event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
              value={form.currency}
              onChange={(event) => updateField("currency", event.target.value)}
            />
          </label>
          <label>
            Tax rate (%)
            <input
              required
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.taxRate}
              onChange={(event) => updateField("taxRate", event.target.value)}
            />
          </label>
        </div>

        <div className="line-items-heading">
          <div>
            <h3>Line items</h3>
            <p>Totals shown here are previews; the server recalculates them.</p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => updateField("items", [...form.items, emptyItem()])}
          >
            Add line
          </button>
        </div>

        <div className="line-items">
          {form.items.map((item, index) => (
            <div className="line-item" key={index}>
              <span className="line-number" aria-hidden="true">{index + 1}</span>
              <label className="description-field">
                Description
                <input
                  required
                  maxLength={1000}
                  value={item.description}
                  onChange={(event) => updateItem(index, "description", event.target.value)}
                  placeholder="Service or product"
                />
              </label>
              <label>
                Quantity
                <input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, "quantity", event.target.value)}
                />
              </label>
              <label>
                Unit price
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(event) => updateItem(index, "unitPrice", event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <button
                aria-label={`Remove line ${index + 1}`}
                className="icon-button"
                disabled={form.items.length === 1}
                type="button"
                onClick={() => removeItem(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="invoice-form-footer">
          <label className="notes-field">
            Notes
            <textarea
              rows={4}
              maxLength={2000}
              value={form.notes ?? ""}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Payment terms or delivery notes"
            />
          </label>
          <aside className="preview-card" aria-label="Invoice total preview">
            <div><span>Subtotal</span><strong>{formatMoney(preview.subtotal, form.currency)}</strong></div>
            <div><span>Tax</span><strong>{formatMoney(preview.tax, form.currency)}</strong></div>
            <div className="preview-total"><span>Total</span><strong>{formatMoney(preview.total, form.currency)}</strong></div>
          </aside>
        </div>

        {error && (
          <div className="form-error" role="alert">
            <strong>{error}</strong>
            {details.length > 0 && (
              <ul>{details.map((detail) => <li key={`${detail.path}-${detail.message}`}>{detail.path}: {detail.message}</li>)}</ul>
            )}
          </div>
        )}
        <button className="button button-primary submit-invoice" disabled={submitting} type="submit">
          {submitting ? "Saving invoice..." : editingInvoice ? "Save draft changes" : "Create draft invoice"}
        </button>
      </form>
    </section>
  );
}
