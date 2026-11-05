-- Ejecutar una sola vez en Supabase SQL Editor.
-- Añade campos sin borrar prendas existentes.
alter table public.garments add column if not exists colors text[] not null default '{}';
alter table public.garments add column if not exists pattern text;
alter table public.garments add column if not exists style text;
alter table public.garments add column if not exists description text;
-- RLS existente se mantiene sin cambios.
