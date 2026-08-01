CREATE SEQUENCE invoice_number_sequence
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

GRANT USAGE, SELECT ON SEQUENCE invoice_number_sequence TO invoicepro_app;
