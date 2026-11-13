alter table public.garments add column if not exists extra_image_paths text[] not null default '{}';
create or replace function public.append_garment_photos(garment_id uuid, photo_paths text[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(cardinality(photo_paths),0) = 0 or exists (
    select 1 from unnest(photo_paths) as path
    where path is null or path not like auth.uid()::text || '/garments/%'
  ) then raise exception 'Fotos no válidas'; end if;
  update public.garments
  set extra_image_paths = extra_image_paths || photo_paths
  where id = garment_id and user_id = auth.uid()
    and cardinality(extra_image_paths) + cardinality(photo_paths) <= 12;
  if not found then raise exception 'Prenda no disponible o límite de fotos alcanzado'; end if;
end;
$$;
revoke all on function public.append_garment_photos(uuid,text[]) from public, anon;
grant execute on function public.append_garment_photos(uuid,text[]) to authenticated;
notify pgrst, 'reload schema';
