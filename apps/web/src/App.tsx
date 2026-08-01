import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api";
import { ClientPanel } from "./components/ClientPanel";
import { InvoiceDetailPanel } from "./components/InvoiceDetailPanel";
import { InvoiceForm } from "./components/InvoiceForm";
import { InvoiceList } from "./components/InvoiceList";
import { formatMoney } from "./format";
import type { Client, InvoiceDetail, InvoiceListItem, InvoiceStatus } from "./types";

type View = "invoices" | "clients";

export function App() {
  const [view, setView] = useState<View>("invoices");
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [clientFilter, setClientFilter] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      setClients((await api.listClients()).data);
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Clients could not be loaded.");
    } finally {
      setClientsLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      setInvoices(
        (
          await api.listInvoices({
            status: statusFilter || undefined,
            clientId: clientFilter || undefined
          })
        ).data
      );
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Invoices could not be loaded.");
    } finally {
      setInvoicesLoading(false);
    }
  }, [clientFilter, statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      setSelectedInvoice(await api.getInvoice(id));
    } catch (caught) {
      setSelectedInvoice(null);
      setPageError(caught instanceof Error ? caught.message : "Invoice detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => {
    const open = invoices.filter((invoice) => invoice.status !== "PAID");
    const openAmount = open.reduce((sum, invoice) => sum + Number(invoice.grandTotal), 0);
    return {
      total: invoices.length,
      open: open.length,
      paid: invoices.filter((invoice) => invoice.status === "PAID").length,
      openAmount
    };
  }, [invoices]);

  async function refreshAfterClient(message: string) {
    await Promise.all([loadClients(), loadInvoices()]);
    if (selectedId) await loadDetail(selectedId);
    setToast(message);
  }

  async function refreshAfterInvoice(invoiceId: string, message: string) {
    setEditingInvoice(null);
    await loadInvoices();
    await loadDetail(invoiceId);
    setToast(message);
  }

  async function refreshSelected(message: string, keepSelected = false) {
    await loadInvoices();
    if (keepSelected && selectedId) await loadDetail(selectedId);
    setToast(message);
  }

  async function afterDelete(message: string) {
    setSelectedId(null);
    setSelectedInvoice(null);
    setEditingInvoice(null);
    await loadInvoices();
    setToast(message);
  }

  function startEdit(invoice: InvoiceDetail) {
    setEditingInvoice(invoice);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="InvoicePro home">
          <span className="brand-mark">IP</span>
          <span><strong>InvoicePro</strong><small>Local workspace</small></span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={view === "invoices" ? "active" : ""} type="button" onClick={() => setView("invoices")}>
            <span aria-hidden="true">▦</span> Invoices
          </button>
          <button className={view === "clients" ? "active" : ""} type="button" onClick={() => setView("clients")}>
            <span aria-hidden="true">◎</span> Clients
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="connection-dot" aria-hidden="true" />
          <div><strong>Local-first</strong><small>PostgreSQL source of truth</small></div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div>
            <p className="eyebrow">B2B billing workspace</p>
            <h1>{view === "invoices" ? "Invoice operations" : "Client directory"}</h1>
          </div>
          <button className="button button-primary topbar-action" type="button" onClick={() => setView(view === "invoices" ? "clients" : "invoices")}>
            {view === "invoices" ? "Manage clients" : "Open invoices"}
          </button>
        </header>

        {pageError && (
          <div className="page-error" role="alert">
            <span>{pageError}</span>
            <button type="button" onClick={() => setPageError(null)}>Dismiss</button>
          </div>
        )}
        {toast && <div className="toast" role="status">{toast}</div>}

        {view === "clients" ? (
          <ClientPanel clients={clients} loading={clientsLoading} onChanged={refreshAfterClient} />
        ) : (
          <>
            <section className="metric-grid" aria-label="Invoice overview">
              <article className="metric-card metric-primary">
                <span>Open value</span>
                <strong>{formatMoney(metrics.openAmount)}</strong>
                <small>Across visible filters</small>
              </article>
              <article className="metric-card"><span>Invoices</span><strong>{metrics.total}</strong><small>Visible records</small></article>
              <article className="metric-card"><span>Open</span><strong>{metrics.open}</strong><small>Draft, sent, or overdue</small></article>
              <article className="metric-card"><span>Paid</span><strong>{metrics.paid}</strong><small>Completed invoices</small></article>
            </section>

            <InvoiceForm
              clients={clients}
              editingInvoice={editingInvoice}
              onCancelEdit={() => setEditingInvoice(null)}
              onOpenClients={() => setView("clients")}
              onSaved={refreshAfterInvoice}
            />

            <section className="records-grid">
              <InvoiceList
                invoices={invoices}
                clients={clients}
                loading={invoicesLoading}
                selectedId={selectedId}
                statusFilter={statusFilter}
                clientFilter={clientFilter}
                onStatusFilter={setStatusFilter}
                onClientFilter={setClientFilter}
                onSelect={(id) => void loadDetail(id)}
              />
              <InvoiceDetailPanel
                invoice={selectedInvoice}
                loading={detailLoading}
                onEdit={startEdit}
                onChanged={refreshSelected}
                onDeleted={afterDelete}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
