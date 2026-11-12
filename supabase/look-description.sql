-- El propietario del look puede leer y editar el texto con las reglas ya existentes.
alter table public.outfits add column if not exists look_description text;
notify pgrst, 'reload schema';
