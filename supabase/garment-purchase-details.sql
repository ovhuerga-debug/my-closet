alter table public.garments
  add column if not exists entry_year smallint check (entry_year between 1900 and 9999),
  add column if not exists purchase_price_eur numeric(10,2) check (purchase_price_eur >= 0);

notify pgrst, 'reload schema';
