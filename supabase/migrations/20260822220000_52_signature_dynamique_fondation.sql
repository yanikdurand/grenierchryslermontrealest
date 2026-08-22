-- PHASE 2 — Signature dynamique. §5.5 du brief :
--   Signature = Σ (lignes d'inspection non exécutées) × marge configurable (~35 %)
--               avec PLANCHER et PLAFOND configurables
-- cout_signature_potentiel (v_inspection_statut) EST déjà cette somme — c'est
-- pour ça que la migration 44/original l'a construite ainsi. Il ne manquait
-- que la marge et les bornes, configurables et jamais codées en dur (§3.1).
--
-- `config` existait déjà, vide, ouverte en écriture à tout authenticated —
-- inoffensif tant qu'elle ne portait rien de réel. Elle porte maintenant le
-- prix du programme phare : on referme l'écriture derrière un droit dédié.

insert into permission (code, libelle, categorie, ordre) values
  ('parametres.signature', 'Configurer le programme Signature (marge, plancher, plafond)', 'Ventes', 24)
on conflict (code) do nothing;

insert into role_permission (role, permission_code) values
  ('admin', 'parametres.signature'),
  ('directeur', 'parametres.signature'),
  ('directeur_financier', 'parametres.signature')
on conflict do nothing;

drop policy if exists acces_authentifie on config;
create policy lecture on config for select using (true);
create policy ecriture on config for insert with check (j_ai_permission('parametres.signature'));
create policy modification on config for update using (j_ai_permission('parametres.signature'));
create policy suppression on config for delete using (j_ai_permission('parametres.signature'));

-- Marge amorcée à 35 % (valeur illustrative du brief). Plancher et plafond
-- volontairement absents : sans eux, un véhicule à gros travaux donnerait un
-- Signature invendable (§5.5) — mieux vaut refuser de calculer que d'afficher
-- un prix qu'on n'a pas validé.
insert into config (cle, valeur, notes) values
  ('signature_marge', '0.35',
   'Marge appliquée sur les travaux non exécutés (Signature = base × (1 + marge)). Départ à 35 %, brief §5.5.'),
  ('signature_plancher', null,
   'Prix minimum du programme Signature, en dollars. À CONFIRMER — aucun calcul tant que vide.'),
  ('signature_plafond', null,
   'Prix maximum du programme Signature, en dollars. À CONFIRMER — aucun calcul tant que vide.')
on conflict (cle) do nothing;

-- Calcule le prix Signature d'un véhicule, à partir des lignes d'inspection
-- « signature » non complétées — l'« à la carte » du desking en exclut ce
-- qu'il veut avant l'appel (p_lignes_exclues). Refuse plutôt que de deviner
-- si la marge ou les bornes ne sont pas configurées.
--
-- Un vendeur qui deske un client doit voir le prix final, jamais le détail
-- des coûts internes (base/marge/brut) — même masquage que
-- vehicule.voir_couts ailleurs dans l'app, sinon le desking devient une
-- fuite de coûts de reconditionnement déguisée en calculatrice de prix.
create or replace function fn_calcul_signature(p_vehicule uuid, p_lignes_exclues uuid[] default '{}')
returns table (base numeric, marge numeric, brut numeric, plancher numeric, plafond numeric, prix numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_moi uuid := utilisateur_courant();
  v_base numeric;
  v_marge numeric;
  v_plancher numeric;
  v_plafond numeric;
  v_brut numeric;
  v_voit_couts boolean;
begin
  if v_moi is not null and not (a_permission(v_moi, 'vente.enregistrer') or a_permission(v_moi, 'vehicule.voir_couts')) then
    raise exception 'Vous n''avez pas le droit de calculer le prix Signature.' using errcode = '42501';
  end if;
  v_voit_couts := v_moi is null or a_permission(v_moi, 'vehicule.voir_couts');

  select coalesce(sum(l.cout), 0) into v_base
  from inspection_ligne l
  join inspection i on i.id = l.inspection_id
  where i.vehicule_id = p_vehicule
    and l.decision = 'signature'
    and not l.complete
    and not (l.id = any(p_lignes_exclues));

  select valeur::numeric into v_marge from config where cle = 'signature_marge';
  select valeur::numeric into v_plancher from config where cle = 'signature_plancher';
  select valeur::numeric into v_plafond from config where cle = 'signature_plafond';

  if v_marge is null then
    raise exception 'La marge du programme Signature n''est pas configurée.' using errcode = '23514';
  end if;
  if v_plancher is null or v_plafond is null then
    raise exception 'Le plancher et le plafond du programme Signature doivent être configurés avant de calculer un prix.'
      using errcode = '23514';
  end if;

  v_brut := round(v_base * (1 + v_marge));

  return query select
    case when v_voit_couts then v_base else null end,
    case when v_voit_couts then v_marge else null end,
    case when v_voit_couts then v_brut else null end,
    v_plancher, v_plafond,
    least(greatest(v_brut, v_plancher), v_plafond);
end;
$$;

revoke execute on function public.fn_calcul_signature(uuid, uuid[]) from anon, public;
grant execute on function public.fn_calcul_signature(uuid, uuid[]) to authenticated;
