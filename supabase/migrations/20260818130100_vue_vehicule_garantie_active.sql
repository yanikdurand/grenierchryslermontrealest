-- La fiche du véhicule doit dire, d'un coup d'œil, si un rendez-vous de
-- garantie est planifié, si le véhicule est déjà parti, ou revenu — sans
-- passer par la page d'inspection.
create or replace view v_vehicule_app as
 SELECT v.id,
    v.no_stock,
    v.vin,
    v.annee,
    v.marque,
    v.modele,
    v."trim",
    concat_ws(' '::text, v.annee::text, v.marque, v.modele, v."trim") AS vehicule_titre,
    v.transmission,
    v.motricite,
    v.km,
    v.couleur_exterieur,
    v.couleur_interieur,
    sv.nom AS statut,
    sv.ordre AS statut_ordre,
    f.nom AS fournisseur,
    v.fournisseur_autre,
    v.nb_clefs,
    v.nb_passagers,
    v.pnbv,
    v.etat_carrosserie,
    v.etat_pare_brise,
    v.rappels,
    v.notes,
    v.garantie_complete,
    v.garantie_motopropulseur,
    v.garantie_prolongee,
    v.lien_carfax,
    v.lien_existant,
    v.lien_existant_note,
    v.requiert_inspection_saaq,
    v.saaq_rdv_le,
    v.saaq_complete_le,
    v.date_recu,
    v.date_mise_en_service,
    CURRENT_DATE - v.date_recu AS jours_inventaire,
    v.affiche_en_ligne,
    v.photos_en_ligne,
    v.lien_fiche_web,
    v.verifie_le,
    v.prix_vente,
        CASE
            WHEN j_ai_permission('vehicule.voir_prix_achat'::text) THEN v.prix_achat
            ELSE NULL::numeric
        END AS prix_achat,
        CASE
            WHEN j_ai_permission('vehicule.voir_prix_achat'::text) THEN v.cout_carfax
            ELSE NULL::numeric
        END AS cout_carfax,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN COALESCE(i.cout_base_engage, 0::numeric)
            ELSE NULL::numeric
        END AS cout_base_engage,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN COALESCE(i.cout_signature_engage, 0::numeric)
            ELSE NULL::numeric
        END AS cout_signature_engage,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN COALESCE(i.cout_base_a_venir, 0::numeric)
            ELSE NULL::numeric
        END AS cout_base_a_venir,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN COALESCE(i.cout_signature_potentiel, 0::numeric)
            ELSE NULL::numeric
        END AS cout_signature_potentiel,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN COALESCE(i.valeur_garantie, 0::numeric)
            ELSE NULL::numeric
        END AS valeur_garantie,
        CASE
            WHEN j_ai_permission('vehicule.voir_profit'::text) THEN v.prix_vente - v.prix_achat - COALESCE(v.cout_carfax, 0::numeric) - COALESCE(i.cout_base_engage, 0::numeric)
            ELSE NULL::numeric
        END AS profit,
    i.statut_autorisation,
    fe.pourcentage AS feuille_pourcentage,
    fe.complete_le AS feuille_complete_le,
    fe.derniere_modif_le AS feuille_derniere_modif,
    um.nom AS feuille_derniere_modif_par,
    COALESCE(al.nb_alertes, 0::bigint) AS nb_alertes,
    COALESCE(al.nb_critiques, 0::bigint) AS nb_critiques,
    al.alertes,
        CASE
            WHEN j_ai_permission('lead.voir'::text) THEN l.leads_total
            ELSE NULL::bigint
        END AS leads_total,
        CASE
            WHEN j_ai_permission('lead.voir'::text) THEN l.leads_30j
            ELSE NULL::bigint
        END AS leads_30j,
        CASE
            WHEN j_ai_permission('lead.voir'::text) THEN l.dernier_lead
            ELSE NULL::timestamp with time zone
        END AS dernier_lead,
    v.disponible_depuis,
    ve.id AS vente_id,
    ve.etat AS vente_etat,
    ve.type_transaction AS vente_type_transaction,
    ve.force_dossier AS vente_force_dossier,
    ve.date_livraison_prevue AS vente_date_livraison_prevue,
    g.garantie_description,
    g.garantie_lieu,
    g.garantie_rdv,
    g.garantie_parti_le,
    g.garantie_retour_le
   FROM vehicule v
     LEFT JOIN statut_vehicule sv ON sv.id = v.statut_id
     LEFT JOIN fournisseur f ON f.id = v.fournisseur_id
     LEFT JOIN feuille_equipement fe ON fe.vehicule_id = v.id
     LEFT JOIN utilisateur um ON um.id = fe.derniere_modif_par
     LEFT JOIN LATERAL ( SELECT v_inspection_statut.statut_autorisation,
            v_inspection_statut.cout_base_engage,
            v_inspection_statut.cout_signature_engage,
            v_inspection_statut.cout_base_a_venir,
            v_inspection_statut.cout_signature_potentiel,
            v_inspection_statut.valeur_garantie
           FROM v_inspection_statut
          WHERE v_inspection_statut.vehicule_id = v.id
          ORDER BY v_inspection_statut.cree_le DESC
         LIMIT 1) i ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS nb_alertes,
            count(*) FILTER (WHERE t.gravite = 'critique'::text) AS nb_critiques,
            string_agg(t.libelle, ' · '::text ORDER BY t.ordre) AS alertes
           FROM alerte a
             JOIN alerte_type t ON t.code = a.type_code
          WHERE a.vehicule_id = v.id AND a.resolue_le IS NULL) al ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS leads_total,
            count(*) FILTER (WHERE crm_lead.date_recu >= (now() - '30 days'::interval)) AS leads_30j,
            max(crm_lead.date_recu) AS dernier_lead
           FROM crm_lead
          WHERE crm_lead.vehicule_id = v.id) l ON true
     LEFT JOIN LATERAL ( SELECT vente.id,
            vente.etat,
            vente.type_transaction,
            vente.force_dossier,
            vente.date_livraison_prevue
           FROM vente
          WHERE vente.vehicule_id = v.id AND vente.etat <> 'annule'::text AND vente.etat <> 'livre'::text
          ORDER BY vente.cree_le DESC
         LIMIT 1) ve ON true
     LEFT JOIN LATERAL ( SELECT l.description AS garantie_description,
            l.garantie_lieu,
            l.garantie_rdv,
            l.garantie_parti_le,
            l.garantie_retour_le
           FROM inspection_ligne l
             JOIN inspection i2 ON i2.id = l.inspection_id
          WHERE i2.vehicule_id = v.id AND l.sous_garantie
          ORDER BY (l.garantie_retour_le IS NULL) DESC, l.garantie_rdv DESC NULLS LAST
         LIMIT 1) g ON true;
