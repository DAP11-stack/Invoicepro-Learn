CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE invoice_status AS ENUM ('DRAFT', 'SENT', 'OVERDUE', 'PAID');

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text,
  email text NOT NULL,
  phone text,
  billing_address text NOT NULL,
  tax_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_business_name_not_blank CHECK (btrim(business_name) <> ''),
  CONSTRAINT clients_email_not_blank CHECK (btrim(email) <> ''),
  CONSTRAINT clients_billing_address_not_blank CHECK (btrim(billing_address) <> '')
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL UNIQUE,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  currency char(3) NOT NULL DEFAULT 'IDR',
  tax_rate numeric(5, 2) NOT NULL DEFAULT 0,
  subtotal numeric(15, 2) NOT NULL DEFAULT 0,
  tax_total numeric(15, 2) NOT NULL DEFAULT 0,
  grand_total numeric(15, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_not_blank CHECK (btrim(invoice_number) <> ''),
  CONSTRAINT invoices_due_date_valid CHECK (due_date >= issue_date),
  CONSTRAINT invoices_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT invoices_totals_non_negative CHECK (
    subtotal >= 0 AND tax_total >= 0 AND grand_total >= 0
  )
);

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit_price numeric(15, 2) NOT NULL,
  line_total numeric(15, 2) NOT NULL,
  position integer NOT NULL,
  CONSTRAINT invoice_items_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT invoice_items_line_total_non_negative CHECK (line_total >= 0),
  CONSTRAINT invoice_items_position_positive CHECK (position > 0),
  CONSTRAINT invoice_items_invoice_position_unique UNIQUE (invoice_id, position)
);

CREATE INDEX invoices_client_id_idx ON invoices(client_id);
CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoice_items_invoice_id_idx ON invoice_items(invoice_id);

GRANT USAGE ON SCHEMA public TO invoicepro_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE clients, invoices, invoice_items
  TO invoicepro_app;
