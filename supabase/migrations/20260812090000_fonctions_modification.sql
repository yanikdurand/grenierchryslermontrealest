-- Fonctions de modification d'un véhicule
--
-- Constat
-- -------
-- Aucun écran ne pouvait modifier un véhicule. Le `SELECT` sur `vehicule`
-- étant révoqué pour `authenticated`, un `update vehicule ... where id = ...`
-- échoue en 42501 : Postgres exige le `SELECT` dès qu'une colonne est lue, et
-- le `WHERE` en lit une. Vérifié avec le jeton réel de Jonathan, qui détient
-- pourtant `vehicule.modifier` :
--
--   update vehicule set km = 12345 where id = ...     -> 42501
--   update vehicule set statut_id = 3 where id = ...  -> 42501
--
-- Les fonctions existantes passent, elles, parce qu'elles sont en
-- `SECURITY DEFINER`. Mais il n'en existait aucune pour renseigner les
-- caractéristiques, changer le statut, fixer le prix de vente ou clore une
-- inspection SAAQ — soit tout ce dont les étapes 5 et 6 ont besoin.
--
-- On complète donc la série, dans le même moule : SECURITY DEFINER,
-- `search_path` épinglé, garde `a_permission` interne, exécution retirée à
-- `anon`. Aucune structure n'est modifiée, aucune donnée n'est touchée.
--
-- Convention : un paramètre à NULL laisse la valeur en place. C'est ce que
-- demande la sauvegarde automatique champ par champ de la feuille
-- d'équipements (étape 5), où chaque enregistrement ne porte qu'un champ.

begin;

-- ---------------------------------------------------------------------------
-- Caractéristiques : ce que Jonathan saisit sur la feuille d'équipements
-- ---------------------------------------------------------------------------
create or replace function public.maj_caracteristiques(
  p_vehicule            uuid,
  p_km                  integer default null,
  p_transmission        text    default null,
  p_motricite           text    default null,
  p_couleur_exterieur   text    default null,
  p_couleur_interieur   text    default null,
  p_nb_clefs            integer default null,
  p_nb_passagers        integer default null,
  p_pnbv                integer default null,
  p_etat_carrosserie    text    default null,
  p_etat_pare_brise     text    default null,
  p_antivol             text    default null,
  p_cable_recharge      text    default null,
  p_kit_roue_secours    text    default null,
  p_systeme_son         text    default null,
  p_trim                text    default null,
  p_rappels             text    default null,
  p_notes               text    default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.modifier') then
    raise exception 'Vous n''avez pas le droit de modifier un véhicule.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from vehicule where id = p_vehicule) then
    raise exception 'Véhicule introuvable.' using errcode = '23503';
  end if;

  update vehicule set
    km                = coalesce(p_km, km),
    transmission      = coalesce(nullif(btrim(p_transmission), ''), transmission),
    motricite         = coalesce(nullif(btrim(p_motricite), ''), motricite),
    couleur_exterieur = coalesce(nullif(btrim(p_couleur_exterieur), ''), couleur_exterieur),
    couleur_interieur = coalesce(nullif(btrim(p_couleur_interieur), ''), couleur_interieur),
    nb_clefs          = coalesce(p_nb_clefs, nb_clefs),
    nb_passagers      = coalesce(p_nb_passagers, nb_passagers),
    pnbv              = coalesce(p_pnbv, pnbv),
    etat_carrosserie  = coalesce(nullif(btrim(p_etat_carrosserie), ''), etat_carrosserie),
    etat_pare_brise   = coalesce(nullif(btrim(p_etat_pare_brise), ''), etat_pare_brise),
    antivol           = coalesce(nullif(btrim(p_antivol), ''), antivol),
    cable_recharge    = coalesce(nullif(btrim(p_cable_recharge), ''), cable_recharge),
    kit_roue_secours  = coalesce(nullif(btrim(p_kit_roue_secours), ''), kit_roue_secours),
    systeme_son       = coalesce(nullif(btrim(p_systeme_son), ''), systeme_son),
    trim              = coalesce(nullif(btrim(p_trim), ''), trim),
    rappels           = coalesce(p_rappels, rappels),
    notes             = coalesce(p_notes, notes)
  where id = p_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Statut : le statut est nommé, jamais un identifiant numérique côté client
-- ---------------------------------------------------------------------------
create or replace function public.changer_statut(p_vehicule uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_statut int;
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.modifier') then
    raise exception 'Vous n''avez pas le droit de changer le statut d''un véhicule.'
      using errcode = '42501';
  end if;

  select id into v_statut from statut_vehicule where nom = btrim(p_statut);
  if v_statut is null then
    raise exception 'Statut inconnu : %.', p_statut using errcode = '23503';
  end if;

  update vehicule set statut_id = v_statut where id = p_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Prix de vente : le trigger fn_log_prix historise chaque changement
-- ---------------------------------------------------------------------------
create or replace function public.maj_prix_vente(p_vehicule uuid, p_prix numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.modifier') then
    raise exception 'Vous n''avez pas le droit de modifier le prix de vente.'
      using errcode = '42501';
  end if;

  if p_prix is not null and p_prix < 0 then
    raise exception 'Le prix de vente ne peut pas être négatif.' using errcode = '23514';
  end if;

  update vehicule set prix_vente = p_prix where id = p_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------------
-- SAAQ : Catherine et Philippe seuls, via `saaq.completer`
-- ---------------------------------------------------------------------------
create or replace function public.planifier_saaq(p_vehicule uuid, p_rdv date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'saaq.completer') then
    raise exception 'Vous n''avez pas le droit de gérer les inspections SAAQ.'
      using errcode = '42501';
  end if;

  update vehicule set saaq_rdv_le = p_rdv where id = p_vehicule;
end;
$function$;

-- Clôture de l'inspection SAAQ : c'est ce qui fait disparaître l'alerte
-- critique, par trigger. Ne jamais toucher à la table `alerte` (brief §6.4).
create or replace function public.completer_saaq(p_vehicule uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_requise boolean;
begin
  if v_moi is not null and not a_permission(v_moi, 'saaq.completer') then
    raise exception 'Vous n''avez pas le droit de clore une inspection SAAQ.'
      using errcode = '42501';
  end if;

  select requiert_inspection_saaq into v_requise from vehicule where id = p_vehicule;
  if v_requise is null then
    raise exception 'Véhicule introuvable.' using errcode = '23503';
  end if;
  if not v_requise then
    raise exception 'Ce véhicule ne requiert pas d''inspection SAAQ.' using errcode = '23514';
  end if;

  update vehicule
  set saaq_complete_le = now(), saaq_complete_par = v_moi
  where id = p_vehicule;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Exécution : jamais `anon`, sinon la garde `v_moi is not null` ne mord pas
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'maj_caracteristiques(uuid, integer, text, text, text, text, integer, integer, integer, text, text, text, text, text, text, text, text, text)',
    'changer_statut(uuid, text)',
    'maj_prix_vente(uuid, numeric)',
    'planifier_saaq(uuid, date)',
    'completer_saaq(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant  execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

commit;
