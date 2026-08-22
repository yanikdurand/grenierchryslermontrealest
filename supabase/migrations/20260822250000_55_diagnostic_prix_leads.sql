-- Vue diagnostic prix/leads pour Jonathan D. (brief §8, amélioration validée
-- #1) : distinguer deux problèmes qui se ressemblent en surface mais
-- n'appellent pas la même action —
--   « 90 jours sans lead » = problème de prix ou de visibilité
--   « 90 jours avec 15 leads sans vente » = problème de traitement ou de
--   présentation (le prix et la visibilité fonctionnent, la conversion non)
--
-- Gérée par lead.voir, déjà tenu par Jonathan D. (gestionnaire_inventaire) —
-- pas rapport.voir, qu'il n'a pas : le brief cible cette vue sur lui
-- spécifiquement, pas sur les tableaux de bord de direction.
create view v_diagnostic_prix_leads as
select
  v.id as vehicule_id,
  v.no_stock,
  concat_ws(' ', v.annee::text, v.marque, v.modele, v.trim) as vehicule,
  v.prix_vente,
  current_date - v.date_recu as jours_inventaire,
  coalesce(l.leads_total, 0) as leads_total,
  coalesce(v.affiche_en_ligne, false) as affiche_en_ligne,
  case
    when coalesce(l.leads_total, 0) = 0 then 'prix_ou_visibilite'
    when coalesce(l.leads_total, 0) >= 15 then 'traitement'
  end as diagnostic
from vehicule v
join statut_vehicule sv on sv.id = v.statut_id
left join lateral (
  select count(*) as leads_total from crm_lead where crm_lead.vehicule_id = v.id
) l on true
where sv.nom = 'DISPONIBLE'
  and v.date_recu is not null
  and (current_date - v.date_recu) >= 90
  and (coalesce(l.leads_total, 0) = 0 or coalesce(l.leads_total, 0) >= 15);
alter view v_diagnostic_prix_leads set (security_invoker = false);

grant select on v_diagnostic_prix_leads to authenticated;
