-- Rapatriée depuis la production (appliquée le 19 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.

alter table utilisateur drop constraint utilisateur_role_check;
alter table utilisateur add constraint utilisateur_role_check
  check (role in ('vendeur','directeur','directeur_service','aviseur',
                  'receptionniste','gestionnaire_inventaire','comptabilite',
                  'directeur_financier','livreur','proprietaire','admin'));

insert into utilisateur (nom, role, actif) values
  ('Jonathan Bourbonnais', 'directeur_financier', true);

-- Droits de départ du F&I : les chiffres complets, comme la direction,
-- sans les approbations de réparations. À raffiner après son entrevue.
insert into role_permission (role, permission_code) values
  ('directeur_financier','vehicule.voir'),
  ('directeur_financier','vehicule.voir_prix_achat'),
  ('directeur_financier','vehicule.voir_profit'),
  ('directeur_financier','vehicule.voir_couts'),
  ('directeur_financier','lead.voir'),
  ('directeur_financier','rapport.voir');
