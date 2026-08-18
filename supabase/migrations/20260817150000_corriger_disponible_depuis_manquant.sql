-- Correctif : la migration des statuts indépendants n'a backfillé
-- `disponible_depuis` que pour les véhicules qui venaient des statuts
-- dérivés de la vente désormais retirés (DÉPÔT RÉSERVÉ, ATT. APPROBATION,
-- ATT. LIVRAISON). Tout véhicule qui était déjà DISPONIBLE avant la
-- refonte — ou déjà affiché en ligne pendant un détour comme MÉCANIQUE
-- INTERNE — n'a jamais reçu de date, donc plus aucun badge ni ligne
-- « Disponible depuis » ne s'affiche pour lui (cas signalé sur J054, en
-- DEMANDE DE TRAVAUX après avoir été DISPONIBLE).
--
-- Faute d'historique des changements de statut, on ne peut pas retrouver la
-- vraie date d'entrée en disponibilité : on pose `now()`, ce qui reste
-- honnête (ces véhicules sont bel et bien disponibles aujourd'hui) sans
-- prétendre à une précision qu'on n'a pas.
update vehicule v
set disponible_depuis = now()
from statut_vehicule s
where s.id = v.statut_id
  and v.disponible_depuis is null
  and (s.nom = 'DISPONIBLE' or v.affiche_en_ligne = true)
  and s.nom not in (
    'LIVRÉ', 'DÉMO', 'COURTOISIE', 'VÉHICULE SERVICE', 'TERREBONNE',
    'WHOLESALE', 'RETOUR', 'ATTENTE DE RÉCEPTION'
  );
