-- Rapatriée depuis la production (appliquée le 21 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.

-- Un véhicule d'échange peut exister et être affiché avant d'être physiquement reçu.
-- Le numéro de stock n'est attribué qu'à la réception : une vente annulée ne
-- consomme donc jamais un numéro.
alter table vehicule alter column no_stock drop not null;

-- L'unicité tient toujours, mais seulement sur les numéros attribués
alter table vehicule drop constraint vehicule_no_stock_key;
create unique index vehicule_no_stock_unique
  on vehicule (upper(btrim(no_stock))) where no_stock is not null;

insert into statut_vehicule (nom, ordre) values ('À VENIR', 0)
on conflict (nom) do nothing;

-- Attribution du numéro de stock au moment de la réception réelle
create or replace function attribuer_no_stock(p_vehicule uuid, p_no_stock text)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.recevoir') then
    raise exception 'Vous n''avez pas le droit d''attribuer un numéro de stock.'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_no_stock), '') = '' then
    raise exception 'Le numéro de stock est obligatoire.' using errcode = '23514';
  end if;
  if exists (select 1 from vehicule
             where upper(btrim(no_stock)) = upper(btrim(p_no_stock))
               and id <> p_vehicule) then
    raise exception 'Le numéro de stock % existe déjà.', btrim(p_no_stock)
      using errcode = '23505';
  end if;
  update vehicule set no_stock = upper(btrim(p_no_stock)) where id = p_vehicule;
end;
$$;
grant execute on function public.attribuer_no_stock to authenticated;

-- Propose le prochain suffixe : A0983 -> A0983A -> A0983B
create or replace function prochain_no_stock_echange(p_no_stock_vendu text)
returns text
language plpgsql stable security invoker set search_path = public as $$
declare base text; suffixe char; candidat text;
begin
  base := upper(btrim(p_no_stock_vendu));
  for i in 0..25 loop
    suffixe := chr(65 + i);
    candidat := base || suffixe;
    if not exists (select 1 from vehicule where upper(btrim(no_stock)) = candidat) then
      return candidat;
    end if;
  end loop;
  return null;
end;
$$;
grant execute on function public.prochain_no_stock_echange to authenticated;
