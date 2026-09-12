-- Momo reuses invoice numbers across years, so the number alone is not unique.
drop index if exists momo_orders_invoice_number_idx;
create index if not exists momo_orders_invoice_number_idx on momo_orders(invoice_number);
