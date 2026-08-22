-- Rapatriée depuis la production (appliquée le 21 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.
--
-- NOTE DE SUIVI (22 août) : les colonnes `reserve*` font double emploi avec
-- `vente.etat = 'depot'`, qui est la source de vérité retenue (un dépôt EST
-- une réservation). Elles ne sont utilisées nulle part (0 ligne à true) sauf
-- par `vehicules_alternatifs`, qui sera recâblé sur la vente active.
-- Voir la migration de consolidation qui suit.

-- Un véhicule réservé reste affiché sur le site : un nouveau lead permet
-- de proposer une alternative plutôt que de perdre le client.
alter table vehicule
  add column reserve boolean not null default false,
  add column reserve_le timestamptz,
  add column reserve_par uuid references utilisateur(id),
  add column reserve_note text;

create index idx_vehicule_reserve on vehicule(reserve) where reserve;

-- Suggestion d'alternatives : même marque d'abord, puis gabarit et prix comparables
create or replace function vehicules_alternatifs(p_vehicule uuid, p_limite int default 5)
returns table (
  id uuid, no_stock text, vehicule text, prix_vente numeric,
  km int, jours_inventaire int, pertinence int
)
language sql stable security invoker set search_path = public as $$
  with ref as (
    select v.marque, v.modele, v.annee, v.prix_vente, v.pnbv
    from vehicule v where v.id = p_vehicule
  )
  select
    a.id,
    a.no_stock,
    concat_ws(' ', a.annee::text, a.marque, a.modele, a.trim),
    a.prix_vente,
    a.km,
    (current_date - a.date_recu),
    (case when a.marque = r.marque then 3 else 0 end
     + case when a.modele = r.modele then 3 else 0 end
     + case when abs(a.annee - r.annee) <= 2 then 2 else 0 end
     + case when r.prix_vente is not null and a.prix_vente is not null
                 and abs(a.prix_vente - r.prix_vente) <= r.prix_vente * 0.15
            then 2 else 0 end) as pertinence
  from vehicule a
  join statut_vehicule sv on sv.id = a.statut_id
  cross join ref r
  where a.id <> p_vehicule
    and not a.reserve
    and sv.nom = 'DISPONIBLE'
    and a.prix_vente is not null
  order by pertinence desc, abs(coalesce(a.prix_vente, 0) - coalesce(r.prix_vente, 0))
  limit p_limite;
$$;
grant execute on function public.vehicules_alternatifs to authenticated;

-- Alerte pour le représentant : ce lead porte sur un véhicule déjà réservé
insert into alerte_type (code, libelle, gravite, ordre) values
  ('vehicule_reserve', 'Véhicule réservé — non livré', 'info', 9)
on conflict (code) do nothing;
