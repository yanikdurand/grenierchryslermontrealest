-- Plancher/plafond du programme Signature (migration 52) restaient vides —
-- fn_calcul_signature refusait donc tout calcul, intentionnellement. Yanik a
-- demandé de partir du prix fixe actuel (2295 $) comme repère plutôt que
-- d'attendre les vrais chiffres : 1500 $ / 4500 $ encadrent ce prix des deux
-- côtés sans être extrêmes, et sont exactement les valeurs déjà vérifiées
-- contre les deux exemples chiffrés du brief (§5.5) pendant les tests de la
-- migration 52.
--
-- PROVISOIRE — Yanik doit les confirmer avant tout usage avec un vrai
-- client. Ajustables sans redéploiement dans Réglages → Programme Signature.
update config set valeur = '1500',
  notes = 'Provisoire, dérivé du prix fixe actuel (2295 $) — à confirmer par Yanik avant utilisation avec un vrai client. Prix minimum du programme Signature, en dollars.'
where cle = 'signature_plancher';

update config set valeur = '4500',
  notes = 'Provisoire, dérivé du prix fixe actuel (2295 $) — à confirmer par Yanik avant utilisation avec un vrai client. Prix maximum du programme Signature, en dollars.'
where cle = 'signature_plafond';
