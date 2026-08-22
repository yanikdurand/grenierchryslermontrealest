-- §3.2, encore : v_alertes_ouvertes n'exposait pas l'id du véhicule, trouvé
-- en construisant la page « santé de la journée » (brief §8.3) — même trou
-- que v_goulots et v_stock_sans_lead (migration 51), même correctif.
create or replace view v_alertes_ouvertes as
 SELECT a.id,
    v.no_stock,
    concat_ws(' '::text, v.annee::text, v.marque, v.modele, v."trim") AS vehicule,
    sv.nom AS statut,
    t.libelle AS alerte,
    t.gravite,
    t.ordre,
    a.detail,
    a.cree_le,
    CURRENT_DATE - a.cree_le::date AS jours_ouverte,
    v.id AS vehicule_id
   FROM alerte a
     JOIN alerte_type t ON t.code = a.type_code
     JOIN vehicule v ON v.id = a.vehicule_id
     JOIN statut_vehicule sv ON sv.id = v.statut_id
  WHERE a.resolue_le IS NULL;
alter view v_alertes_ouvertes set (security_invoker = false);
