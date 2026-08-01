import { useEffect, useState, type FormEvent } from "react";

import { ApiError, api } from "../api";
import type { Client, ClientInput } from "../types";

const emptyClient: ClientInput = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  billingAddress: "",
  taxId: ""
};

interface ClientPanelProps {
  clients: Client[];
  loading: boolean;
  onChanged: (message: string) => Promise<void>;
}

export function ClientPanel({ clients, loading, onChanged }: ClientPanelProps) {
  const [form, setForm] = useState<ClientInput>(emptyClient);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Array<{ path: string; message: string }>>([]);

  useEffect(() => {
    if (editingId != null && !clients.some((client) => client.id === editingId)) {
      setEditingId(null);
      setForm(emptyClient);
    }
  }, [clients, editingId]);

  function updateField(field: keyof ClientInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function edit(client: Client) {
    setEditingId(client.id);
    setForm({
      businessName: client.businessName,
      contactName: client.contactName ?? "",
      email: client.email,
      phone: client.phone ?? "",
      billingAddress: client.billingAddress,
      taxId: client.taxId ?? ""
    });
    setError(null);
    setDetails([]);
  }

  function reset() {
    setEditingId(null);
    setForm(emptyClient);
    setError(null);
    setDetails([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setDetails([]);

    try {
      const payload: ClientInput = {
        ...form,
        contactName: form.contactName?.trim() || null,
        phone: form.phone?.trim() || null,
        taxId: form.taxId?.trim() || null
      };
      if (editingId) {
        await api.updateClient(editingId, payload);
        await onChanged("Client updated.");
      } else {
        await api.createClient(payload);
        await onChanged("Client created.");
      }
      reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Client could not be saved.");
      if (caught instanceof ApiError) setDetails(caught.details);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(client: Client) {
    if (!window.confirm(`Delete ${client.businessName}?`)) return;
    setError(null);
    try {
      await api.deleteClient(client.id);
      await onChanged("Client deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Client could not be deleted.");
    }
  }

  return (
    <section className="workspace-grid clients-workspace" aria-labelledby="clients-title">
      <div className="panel form-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Client record</p>
            <h2 id="clients-title">{editingId ? "Edit client" : "Add a client"}</h2>
          </div>
          {editingId && (
            <button className="button button-ghost" type="button" onClick={reset}>
              Cancel
            </button>
          )}
        </div>

        <form className="stack-form" onSubmit={submit}>
          <label>
            Business name
            <input
              required
              maxLength={200}
              value={form.businessName}
              onChange={(event) => updateField("businessName", event.target.value)}
              placeholder="PT Contoh Jaya"
            />
          </label>
          <div className="field-pair">
            <label>
              Contact name
              <input
                maxLength={200}
                value={form.contactName ?? ""}
                onChange={(event) => updateField("contactName", event.target.value)}
                placeholder="Rani"
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="finance@example.com"
              />
            </label>
          </div>
          <div className="field-pair">
            <label>
              Phone
              <input
                value={form.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="+62 812 3456 7890"
              />
            </label>
            <label>
              Tax ID
              <input
                value={form.taxId ?? ""}
                onChange={(event) => updateField("taxId", event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <label>
            Billing address
            <textarea
              required
              rows={3}
              value={form.billingAddress}
              onChange={(event) => updateField("billingAddress", event.target.value)}
              placeholder="Street, city, postal code"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              <strong>{error}</strong>
              {details.length > 0 && (
                <ul>{details.map((detail) => <li key={`${detail.path}-${detail.message}`}>{detail.path}: {detail.message}</li>)}</ul>
              )}
            </div>
          )}
          <button className="button button-primary" disabled={submitting} type="submit">
            {submitting ? "Saving..." : editingId ? "Save client" : "Create client"}
          </button>
        </form>
      </div>

      <div className="panel list-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Address book</p>
            <h2>Clients</h2>
          </div>
          <span className="count-pill">{clients.length}</span>
        </div>

        {loading ? (
          <div className="loading-block">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">C</div>
            <h3>No clients yet</h3>
            <p>Add the first client to unlock invoice creation.</p>
          </div>
        ) : (
          <div className="client-list">
            {clients.map((client) => (
              <article className="client-card" key={client.id}>
                <div className="client-avatar" aria-hidden="true">
                  {client.businessName.charAt(0).toUpperCase()}
                </div>
                <div className="client-copy">
                  <h3>{client.businessName}</h3>
                  <p>{client.contactName || "No contact name"}</p>
                  <a href={`mailto:${client.email}`}>{client.email}</a>
                </div>
                <div className="inline-actions">
                  <button className="button button-ghost" type="button" onClick={() => edit(client)}>
                    Edit
                  </button>
                  <button className="button button-danger-ghost" type="button" onClick={() => void remove(client)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
