-- Sépare l'axe « où en est le véhicule opérationnellement » de l'axe
-- « où en est sa vente ». Jusqu'ici les deux vivaient dans la même colonne
-- (vehicule.statut_id), écrite tour à tour par deplacer_vehicule() et par
-- le trigger fn_statut_depuis_vente — ce qui empêchait un véhicule vendu
-- de repartir en mécanique pour sa préparation de livraison, et empêchait
-- d'afficher « disponible » et « au service » en même temps pour un
-- correctif mineur.
--
-- Après cette migration :
--   - vehicule.statut_id ne reflète plus que l'étape opérationnelle —
--     jamais où en est une vente.
--   - Le badge de vente se calcule à la lecture depuis `vente`
--     (etat + force_dossier), jamais stocké sur le véhicule.
--   - vehicule.disponible_depuis est un fait indépendant, posé quand le
--     véhicule atteint DISPONIBLE et retiré seulement quand il sort
--     vraiment de l'inventaire de vente au détail (wholesale, démo,
--     courtoisie, véhicule service, Terrebonne, retour, livré) — un aller-
--     retour en mécanique ou en carrosserie n'y touche pas.
--
-- Vérifié avant d'écrire cette migration : 0 véhicule à DÉPÔT RÉSERVÉ,
-- 2 à ATT. APPROBATION, 6 à ATT. LIVRAISON — reclassés ci-dessous.

-- ---------------------------------------------------------------------
-- 1. Disponibilité : un fait indépendant, pas une étape du pipeline
-- ---------------------------------------------------------------------
alter table vehicule add column disponible_depuis timestamptz;

comment on column vehicule.disponible_depuis is
  'Depuis quand ce véhicule est achetable — indépendant du statut opérationnel et d''une vente en cours. Posé par deplacer_vehicule(''disponible''), retiré en sortant vraiment de l''inventaire de vente au détail ou en livrant. NULL = jamais atteint ou sorti.';

-- ---------------------------------------------------------------------
-- 2. Reclasser les véhicules actuellement sur un statut de vente : leur
--    étape opérationnelle réelle n'est plus déductible (elle a été
--    écrasée), DISPONIBLE est la meilleure approximation puisqu'un
--    véhicule se vend généralement une fois prêt.
-- ---------------------------------------------------------------------
update vehicule
set statut_id = (select id from statut_vehicule where nom = 'DISPONIBLE'),
    disponible_depuis = now()
where statut_id in (
  select id from statut_vehicule where nom in ('ATT. APPROBATION', 'ATT. LIVRAISON')
);

-- ---------------------------------------------------------------------
-- 3. Retirer les statuts qui appartenaient à la vente, pas au véhicule
-- ---------------------------------------------------------------------
delete from statut_vehicule where nom in ('DÉPÔT RÉSERVÉ', 'ATT. APPROBATION', 'ATT. LIVRAISON');

-- ---------------------------------------------------------------------
-- 4. Nettoyer les abréviations de ceux qui restent
-- ---------------------------------------------------------------------
update statut_vehicule set nom = 'ATTENTE DE RÉCEPTION' where nom = 'ATT. RÉCEPTION';
update statut_vehicule set nom = 'INSPECTION'           where nom = 'INSPECTION OCC.';
update statut_vehicule set nom = 'MÉCANIQUE INTERNE'    where nom = 'MÉCANIQUE INT.';
update statut_vehicule set nom = 'MÉCANIQUE EXTERNE'    where nom = 'MÉCANIQUE EXT.';
update statut_vehicule set nom = 'CARROSSERIE EXTERNE'  where nom = 'CARROSSERIE EXT.';

-- Renumérote proprement (l'ancienne liste avait des égalités d'ordre).
with numerote as (
  select id, row_number() over (order by ordre) as rang from statut_vehicule
)
update statut_vehicule sv set ordre = n.rang from numerote n where n.id = sv.id;

-- ---------------------------------------------------------------------
-- 5. La vente ne dicte plus le statut opérationnel
-- ---------------------------------------------------------------------
drop trigger if exists trg_statut_depuis_vente on vente;
drop function if exists public.fn_statut_depuis_vente();

-- Le jalon « vendu » se pose désormais à l'ouverture du dossier, pas via
-- un statut opérationnel qui n'existe plus pour la vente.
create or replace function public.enregistrer_vente(
  p_vehicule uuid, p_client text, p_type_transaction text,
  p_vendeur uuid default null, p_telephone text default null,
  p_courriel text default null, p_prix numeric default null,
  p_lien_crm text default null, p_notes text default null,
  p_depot_seulement boolean default false
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_id uuid;
begin
  if v_moi is not null and not a_permission(v_moi, 'vente.enregistrer') then
    raise exception 'Vous n''avez pas le droit d''enregistrer une vente.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_client), '') = '' then
    raise exception 'Le nom du client est obligatoire.' using errcode = '23514';
  end if;
  if exists (select 1 from vente where vehicule_id = p_vehicule and etat <> 'annule') then
    raise exception 'Ce véhicule a déjà un dossier de vente actif.' using errcode = '23505';
  end if;

  insert into vente (vehicule_id, client, telephone, courriel, vendeur_id,
                     type_transaction, prix_vendu, lien_crm, notes, etat, cree_par)
  values (p_vehicule, btrim(p_client), nullif(btrim(p_telephone), ''),
          nullif(btrim(p_courriel), ''), p_vendeur, p_type_transaction, p_prix,
          nullif(btrim(p_lien_crm), ''), nullif(btrim(p_notes), ''),
          case when p_depot_seulement then 'depot' else 'vendu' end, v_moi)
  returning id into v_id;

  perform fn_poser_jalon(p_vehicule, 'vendu');

  return v_id;
end;
$function$;

-- La livraison est la seule action de vente qui touche encore au statut
-- opérationnel : elle le ferme, et retire la disponibilité.
create or replace function public.noter_livraison(p_vente uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_etat text; v_vehicule uuid; v_statut int;
begin
  if v_moi is not null and not a_permission(v_moi, 'vente.livrer') then
    raise exception 'Vous n''avez pas le droit de confirmer une livraison.' using errcode = '42501';
  end if;
  select etat, vehicule_id into v_etat, v_vehicule from vente where id = p_vente;
  if v_etat is null then
    raise exception 'Dossier de vente introuvable.' using errcode = '23503';
  end if;
  if v_etat = 'annule' then
    raise exception 'Ce dossier est annulé — impossible de le livrer.' using errcode = '23514';
  end if;

  update vente set etat = 'livre', livre_le = now(), livre_par = v_moi where id = p_vente;

  select id into v_statut from statut_vehicule where nom = 'LIVRÉ';
  update vehicule set statut_id = v_statut, disponible_depuis = null where id = v_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. deplacer_vehicule : les deux axes sont désormais indépendants — plus
--    de refus sur une vente active — et pose/retire la disponibilité.
-- ---------------------------------------------------------------------
create or replace function public.deplacer_vehicule(p_vehicule uuid, p_mouvement text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_nom text; v_statut int;
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.modifier') then
    raise exception 'Vous n''avez pas le droit de déplacer un véhicule.' using errcode = '42501';
  end if;

  v_nom := case p_mouvement
    when 'garage_interne'     then 'MÉCANIQUE INTERNE'
    when 'mecanique_externe'  then 'MÉCANIQUE EXTERNE'
    when 'carrosserie'        then 'CARROSSERIE EXTERNE'
    when 'inspection'         then 'INSPECTION'
    when 'saaq'               then 'SAAQ À FAIRE'
    when 'disponible'         then 'DISPONIBLE'
    when 'terrebonne'         then 'TERREBONNE'
    when 'wholesale'          then 'WHOLESALE'
    when 'demo'               then 'DÉMO'
    when 'courtoisie'         then 'COURTOISIE'
    when 'vehicule_service'   then 'VÉHICULE SERVICE'
    when 'retour'             then 'RETOUR'
  end;

  if v_nom is null then
    raise exception 'Mouvement inconnu : %.', p_mouvement using errcode = '23514';
  end if;

  select id into v_statut from statut_vehicule where nom = v_nom;

  update vehicule
  set statut_id = v_statut,
      disponible_depuis = case
        when p_mouvement = 'disponible' then now()
        when p_mouvement in ('wholesale','demo','courtoisie','vehicule_service','terrebonne','retour')
          then null
        else disponible_depuis
      end
  where id = p_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Mise à jour des textes qui citaient les anciens noms
-- ---------------------------------------------------------------------
create or replace function public.fn_jalons_vehicule()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare st text; st_old text;
begin
  select nom into st from statut_vehicule where id = new.statut_id;

  if tg_op = 'INSERT' then
    perform fn_poser_jalon(new.id, 'achete');
  end if;

  if tg_op = 'UPDATE' then
    select nom into st_old from statut_vehicule where id = old.statut_id;
  end if;

  if st = 'VÉHICULE REÇU'     then perform fn_poser_jalon(new.id, 'recu'); end if;
  if st = 'PRÊT À INSPECTER'  then perform fn_poser_jalon(new.id, 'envoye_service'); end if;
  if st = 'LIVRÉ'             then perform fn_poser_jalon(new.id, 'livre'); end if;
  -- Le jalon « vendu » se pose maintenant dans enregistrer_vente, à
  -- l'ouverture du dossier — plus via un statut opérationnel.

  if coalesce(new.affiche_en_ligne, false)
     and (tg_op = 'INSERT' or not coalesce(old.affiche_en_ligne, false)) then
    perform fn_poser_jalon(new.id, 'en_ligne');
  end if;

  return new;
end;
$function$;

create or replace function public.fn_maj_alertes(p_vehicule uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v record; st text; feuille record;
begin
  select * into v from vehicule where id = p_vehicule;
  if not found then return; end if;
  select nom into st from statut_vehicule where id = v.statut_id;
  select * into feuille from feuille_equipement where vehicule_id = p_vehicule;

  perform fn_alerte(p_vehicule, 'lien_existant', v.lien_existant, v.lien_existant_note);
  perform fn_alerte(p_vehicule, 'saaq_requise',
    coalesce(v.requiert_inspection_saaq, false) and v.saaq_complete_le is null,
    case when v.saaq_rdv_le is not null then 'Rendez-vous le ' || v.saaq_rdv_le::text end);
  perform fn_alerte(p_vehicule, 'feuille_incomplete',
    feuille.vehicule_id is not null and feuille.complete_le is null,
    coalesce(feuille.pourcentage, 0)::text || ' % rempli');
  perform fn_alerte(p_vehicule, 'absent_du_site',
    st not in ('LIVRÉ','VÉHICULE SERVICE','WHOLESALE','RETOUR','ATTENTE DE RÉCEPTION','VÉHICULE REÇU')
    and not coalesce(v.affiche_en_ligne, false), null);
  perform fn_alerte(p_vehicule, 'sans_photo',
    coalesce(v.affiche_en_ligne, false) and coalesce(v.photos_en_ligne, 0) = 0, null);
  perform fn_alerte(p_vehicule, 'sans_vin', v.vin is null, null);
  perform fn_alerte(p_vehicule, 'carfax_manquant',
    v.lien_carfax is null and st <> 'ATTENTE DE RÉCEPTION', null);
  perform fn_alerte(p_vehicule, 'vieillissement',
    st = 'DISPONIBLE' and v.date_recu is not null
    and (current_date - v.date_recu) > 90, null);
end;
$function$;

create or replace function public.creer_vehicule(
  p_no_stock text, p_vin text, p_marque text, p_modele text, p_annee integer,
  p_prix_achat numeric, p_lien_carfax text, p_fournisseur text default null,
  p_fournisseur_autre text default null, p_lien_existant boolean default false,
  p_lien_existant_note text default null, p_requiert_saaq boolean default null,
  p_km integer default null, p_trim text default null,
  p_garantie_complete text default null, p_garantie_motopropulseur text default null,
  p_garantie_prolongee text default null, p_rappels text default null,
  p_date_mise_en_service date default null, p_notes text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_statut int;
  v_fournisseur int;
  v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.creer') then
    raise exception 'Vous n''avez pas le droit d''ajouter un véhicule.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_no_stock), '') = '' then
    raise exception 'Le numéro de stock est obligatoire.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_vin), '') = '' then
    raise exception 'Le VIN est obligatoire.' using errcode = '23514';
  end if;
  if length(btrim(p_vin)) <> 17 then
    raise exception 'Le VIN doit compter 17 caractères (reçu : %).', length(btrim(p_vin))
      using errcode = '23514';
  end if;
  if btrim(p_vin) ~* '[IOQ]' then
    raise exception 'Un VIN ne contient jamais les lettres I, O ou Q — vérifiez la saisie.'
      using errcode = '23514';
  end if;
  if coalesce(btrim(p_marque), '') = '' or coalesce(btrim(p_modele), '') = '' then
    raise exception 'La marque et le modèle sont obligatoires.' using errcode = '23514';
  end if;
  if p_annee is null then
    raise exception 'L''année est obligatoire.' using errcode = '23514';
  end if;
  if p_prix_achat is null then
    raise exception 'Le prix d''achat est obligatoire.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_lien_carfax), '') = '' then
    raise exception 'Le lien Carfax est obligatoire.' using errcode = '23514';
  end if;
  if p_fournisseur is null and coalesce(btrim(p_fournisseur_autre), '') = '' then
    raise exception 'Le fournisseur est obligatoire (ou « Échange client »).'
      using errcode = '23514';
  end if;

  if exists (select 1 from vehicule where upper(btrim(no_stock)) = upper(btrim(p_no_stock))) then
    raise exception 'Le numéro de stock % existe déjà.', btrim(p_no_stock)
      using errcode = '23505';
  end if;
  if exists (select 1 from vehicule where vin = upper(btrim(p_vin))) then
    raise exception 'Ce VIN est déjà associé à un autre véhicule en inventaire.'
      using errcode = '23505';
  end if;

  select id into v_statut from statut_vehicule where nom = 'ATTENTE DE RÉCEPTION';
  select id into v_fournisseur from fournisseur where nom = p_fournisseur;

  insert into vehicule (
    no_stock, vin, marque, modele, annee, trim, km, prix_achat,
    lien_carfax, statut_id, fournisseur_id, fournisseur_autre,
    lien_existant, lien_existant_note, requiert_inspection_saaq,
    garantie_complete, garantie_motopropulseur, garantie_prolongee,
    rappels, date_mise_en_service, notes, cree_par
  ) values (
    upper(btrim(p_no_stock)), upper(btrim(p_vin)),
    upper(btrim(p_marque)), upper(btrim(p_modele)), p_annee, btrim(p_trim), p_km, p_prix_achat,
    btrim(p_lien_carfax), v_statut, v_fournisseur, nullif(btrim(p_fournisseur_autre), ''),
    coalesce(p_lien_existant, false), nullif(btrim(p_lien_existant_note), ''),
    coalesce(p_requiert_saaq, false),
    p_garantie_complete, p_garantie_motopropulseur, p_garantie_prolongee,
    p_rappels, p_date_mise_en_service, p_notes, v_moi
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace view public.v_file_inventaire as
 select v.id,
    v.no_stock,
    v.vin,
    concat_ws(' '::text, v.annee::text, v.marque, v.modele, v."trim") as vehicule,
    sv.nom as statut,
    j.recu,
    current_date - j.recu::date as jours_depuis_reception,
    coalesce(fe.pourcentage, 0) as pourcentage,
    fe.complete_le is not null as feuille_completee,
    fe.derniere_modif_le,
    u.nom as derniere_modif_par,
    case
      when fe.vehicule_id is null then 'À commencer'::text
      when fe.complete_le is null then 'En cours'::text
      else 'Prête à envoyer au service'::text
    end as etat_feuille
   from vehicule v
     join statut_vehicule sv on sv.id = v.statut_id
     left join feuille_equipement fe on fe.vehicule_id = v.id
     left join utilisateur u on u.id = fe.derniere_modif_par
     left join lateral ( select max(vehicule_jalon.atteint_le) as recu
           from vehicule_jalon
          where vehicule_jalon.vehicule_id = v.id and vehicule_jalon.jalon = 'recu'::text) j on true
  where (sv.nom = any (array['VÉHICULE REÇU'::text, 'ATTENTE DE RÉCEPTION'::text]))
     or fe.vehicule_id is not null and fe.complete_le is null;
