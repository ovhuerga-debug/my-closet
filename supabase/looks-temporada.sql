-- Metadatos de captura y encuadre, sin modificar las fotos existentes.
begin;
alter table public.outfits
  add column if not exists captured_on date,
  add column if not exists frame jsonb;
notify pgrst, 'reload schema';
commit;
