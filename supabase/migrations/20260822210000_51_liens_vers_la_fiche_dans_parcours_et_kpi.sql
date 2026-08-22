-- §3.2 : chaque liste doit être actionnable. v_goulots (Parcours) et
-- v_stock_sans_lead (Tableaux de bord) affichaient un numéro de stock sans
-- aucun moyen d'ouvrir la fiche — la seule façon d'agir était de retourner
-- chercher le véhicule dans l'inventaire à la main. Les deux vues manquaient
-- simplement l'id du véhicule.

create or replace view v_goulots as
 SELECT v.no_stock,
    concat_ws(' '::text, v.annee::text, v.marque, v.modele) AS vehicule,
    sv.nom AS statut,
    j.achete,
    j.recu,
    j.feuille_completee,
    j.envoye_service,
    j.en_ligne,
        CASE
            WHEN j.recu IS NULL THEN 'En attente de réception'::text
            WHEN j.feuille_completee IS NULL THEN 'En attente de feuille d''équipements'::text
            WHEN j.envoye_service IS NULL THEN 'En attente d''envoi au service'::text
            WHEN j.en_ligne IS NULL THEN 'En attente de mise en ligne'::text
            ELSE 'En ligne'::text
        END AS etape_bloquante,
    CURRENT_DATE - COALESCE(j.envoye_service, j.feuille_completee, j.recu, j.achete)::date AS jours_a_cette_etape,
    v.id AS vehicule_id
   FROM vehicule v
     JOIN statut_vehicule sv ON sv.id = v.statut_id
     LEFT JOIN LATERAL ( SELECT max(vehicule_jalon.atteint_le) FILTER (WHERE vehicule_jalon.jalon = 'achete'::text) AS achete,
            max(vehicule_jalon.atteint_le) FILTER (WHERE vehicule_jalon.jalon = 'recu'::text) AS recu,
            max(vehicule_jalon.atteint_le) FILTER (WHERE vehicule_jalon.jalon = 'feuille_completee'::text) AS feuille_completee,
            max(vehicule_jalon.atteint_le) FILTER (WHERE vehicule_jalon.jalon = 'envoye_service'::text) AS envoye_service,
            max(vehicule_jalon.atteint_le) FILTER (WHERE vehicule_jalon.jalon = 'en_ligne'::text) AS en_ligne
           FROM vehicule_jalon
          WHERE vehicule_jalon.vehicule_id = v.id) j ON true
  WHERE sv.nom <> ALL (ARRAY['LIVRÉ'::text, 'WHOLESALE'::text, 'RETOUR'::text, 'VÉHICULE SERVICE'::text]);
alter view v_goulots set (security_invoker = false);

create or replace view v_stock_sans_lead as
 SELECT v.no_stock,
    concat_ws(' '::text, v.annee::text, v.marque, v.modele, v."trim") AS vehicule,
    v.prix_vente,
    CURRENT_DATE - v.date_recu AS jours_inventaire,
    COALESCE(v.photos_en_ligne, 0) AS photos,
    count(l.id) AS leads_total,
    max(l.date_recu) AS dernier_lead,
    v.id AS vehicule_id
   FROM vehicule v
     JOIN statut_vehicule sv ON sv.id = v.statut_id
     LEFT JOIN crm_lead l ON l.vehicule_id = v.id
  WHERE sv.nom = 'DISPONIBLE'::text AND COALESCE(v.affiche_en_ligne, false) AND (CURRENT_DATE - v.date_recu) > 30
  GROUP BY v.id, v.no_stock, v.annee, v.marque, v.modele, v."trim", v.prix_vente, v.date_recu, v.photos_en_ligne
 HAVING count(l.id) FILTER (WHERE l.date_recu >= (now() - '30 days'::interval)) = 0;
alter view v_stock_sans_lead set (security_invoker = false);
