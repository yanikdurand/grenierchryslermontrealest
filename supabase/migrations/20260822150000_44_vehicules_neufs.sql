-- Les véhicules neufs entrent dans la plateforme.
--
-- Leur parcours ressemble à celui de l'occasion, mais leur début diffère :
--
--   Commande DealerConnect
--     → facture reçue : Emily crée le véhicule avec son numéro (XL393)  [À VENIR]
--     → 2-3 mois d'attente
--     → réception                                          [VÉHICULE REÇU]
--     → demande de préparation : PDI, lavage, photos pro   [DEMANDE DE TRAVAUX]
--     → disponible                                         [DISPONIBLE]
--
-- Un neuf n'a ni Carfax, ni fournisseur d'encan, ni inspection SAAQ, ni
-- feuille d'équipements d'occasion. `creer_vehicule` exigeait pourtant un
-- Carfax et un fournisseur : il était donc impossible d'en saisir un.

-- 1. Le type. Défaut 'occasion' : les ~210 véhicules existants sont inchangés.
alter table vehicule
  add column type_vehicule text not null default 'occasion'
    check (type_vehicule in ('occasion', 'neuf'));

comment on column vehicule.type_vehicule is
  'Un neuf n''a ni Carfax ni SAAQ ni feuille d''équipements — les alertes '
  'correspondantes sont neutralisées dans fn_maj_alertes.';

create index idx_vehicule_type on vehicule(type_vehicule);

-- 2. Le PDI est une troisième origine de demande de travaux, à côté de la
--    demande manuelle du concessionnaire et du bon de préparation de livraison.
--    C'est la même feuille physique aujourd'hui : même table demain.
alter table demande_travaux
  add column origine text not null default 'manuelle'
    check (origine in ('manuelle', 'livraison', 'pdi'));

comment on column demande_travaux.origine is
  'manuelle : demande du concessionnaire au service. '
  'livraison : bon de préparation, généré à la clôture d''une vente. '
  'pdi : préparation d''un véhicule neuf à sa réception.';

-- 3. Création : les exigences propres à l'occasion ne s'appliquent plus au neuf,
--    et le statut de départ suit le type.
--
-- L'ancienne signature à 20 paramètres doit disparaître : ajouter un paramètre
-- crée une SURCHARGE, pas un remplacement. Deux `creer_vehicule` coexistantes
-- rendraient l'appel ambigu côté PostgREST.
drop function if exists public.creer_vehicule(
  text, text, text, text, integer, numeric, text, text, text, boolean, text,
  boolean, integer, text, text, text, text, text, date, text
);

create or replace function creer_vehicule(
  p_no_stock text, p_vin text, p_marque text, p_modele text, p_annee integer,
  p_prix_achat numeric, p_lien_carfax text,
  p_fournisseur text default null, p_fournisseur_autre text default null,
  p_lien_existant boolean default false, p_lien_existant_note text default null,
  p_requiert_saaq boolean default null, p_km integer default null,
  p_trim text default null, p_garantie_complete text default null,
  p_garantie_motopropulseur text default null, p_garantie_prolongee text default null,
  p_rappels text default null, p_date_mise_en_service date default null,
  p_notes text default null,
  p_type_vehicule text default 'occasion'
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
  v_neuf boolean := coalesce(btrim(p_type_vehicule), 'occasion') = 'neuf';
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.creer') then
    raise exception 'Vous n''avez pas le droit d''ajouter un véhicule.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_type_vehicule), '') not in ('occasion', 'neuf') then
    raise exception 'Le type de véhicule doit être « occasion » ou « neuf ».'
      using errcode = '23514';
  end if;

  -- Emily attribue toujours un numéro de stock au contrat, neuf comme occasion.
  if coalesce(btrim(p_no_stock), '') = '' then
    raise exception 'Le numéro de stock est obligatoire.' using errcode = '23514';
  end if;

  -- Le VIN reste exigé partout : la facture du constructeur le porte.
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

  -- Propre à l'occasion : prix d'achat négocié, Carfax, provenance.
  -- Un neuf est commandé au constructeur : son coût vient de la facture et
  -- peut être complété après la saisie initiale.
  if not v_neuf then
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
  end if;

  if exists (select 1 from vehicule where upper(btrim(no_stock)) = upper(btrim(p_no_stock))) then
    raise exception 'Le numéro de stock % existe déjà.', btrim(p_no_stock)
      using errcode = '23505';
  end if;
  if exists (select 1 from vehicule where vin = upper(btrim(p_vin))) then
    raise exception 'Ce VIN est déjà associé à un autre véhicule en inventaire.'
      using errcode = '23505';
  end if;

  -- Le statut de départ est une conséquence du type, jamais une saisie :
  -- un neuf est commandé et arrive dans 2-3 mois, une occasion est achetée
  -- et s'en vient.
  select id into v_statut from statut_vehicule
  where nom = case when v_neuf then 'À VENIR' else 'ATTENTE DE RÉCEPTION' end;

  select id into v_fournisseur from fournisseur where nom = p_fournisseur;

  insert into vehicule (
    no_stock, vin, marque, modele, annee, trim, km, prix_achat,
    lien_carfax, statut_id, fournisseur_id, fournisseur_autre,
    lien_existant, lien_existant_note, requiert_inspection_saaq,
    garantie_complete, garantie_motopropulseur, garantie_prolongee,
    rappels, date_mise_en_service, notes, cree_par, type_vehicule
  ) values (
    upper(btrim(p_no_stock)), upper(btrim(p_vin)),
    upper(btrim(p_marque)), upper(btrim(p_modele)), p_annee, btrim(p_trim), p_km, p_prix_achat,
    nullif(btrim(p_lien_carfax), ''), v_statut, v_fournisseur,
    nullif(btrim(p_fournisseur_autre), ''),
    coalesce(p_lien_existant, false), nullif(btrim(p_lien_existant_note), ''),
    -- Un véhicule neuf ne passe jamais à la SAAQ.
    case when v_neuf then false else coalesce(p_requiert_saaq, false) end,
    p_garantie_complete, p_garantie_motopropulseur, p_garantie_prolongee,
    p_rappels, p_date_mise_en_service, p_notes, v_moi,
    case when v_neuf then 'neuf' else 'occasion' end
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.creer_vehicule(
  text, text, text, text, integer, numeric, text, text, text, boolean, text,
  boolean, integer, text, text, text, text, text, date, text, text
) from anon, public;
grant execute on function public.creer_vehicule(
  text, text, text, text, integer, numeric, text, text, text, boolean, text,
  boolean, integer, text, text, text, text, text, date, text, text
) to authenticated;

-- 4. Les alertes cessent de crier sur ce qui n'existe pas.
--
-- Sans ça, charger 30 neufs produit une centaine de fausses alertes
-- (Carfax manquant, feuille incomplète, absent du site, sans photo) et
-- l'équipe cesse de les lire — exactement ce que §3.2 dit d'éviter.
--
-- Deux corrections d'un coup :
--   • le type 'neuf' neutralise Carfax et feuille d'équipements
--   • le statut 'À VENIR' (créé par la migration 38, jamais pris en compte
--     ici) neutralise l'absence du site, l'absence de photo et le VIN
--     manquant : le véhicule n'est pas encore arrivé.
create or replace function fn_maj_alertes(p_vehicule uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record; st text; feuille record; v_neuf boolean; v_pas_arrive boolean;
begin
  select * into v from vehicule where id = p_vehicule;
  if not found then return; end if;
  select nom into st from statut_vehicule where id = v.statut_id;
  select * into feuille from feuille_equipement where vehicule_id = p_vehicule;

  v_neuf := coalesce(v.type_vehicule, 'occasion') = 'neuf';
  v_pas_arrive := st in ('À VENIR', 'ATTENTE DE RÉCEPTION');

  perform fn_alerte(p_vehicule, 'lien_existant', v.lien_existant, v.lien_existant_note);

  perform fn_alerte(p_vehicule, 'saaq_requise',
    coalesce(v.requiert_inspection_saaq, false) and v.saaq_complete_le is null,
    case when v.saaq_rdv_le is not null then 'Rendez-vous le ' || v.saaq_rdv_le::text end);

  -- La feuille d'équipements est un outil d'occasion.
  perform fn_alerte(p_vehicule, 'feuille_incomplete',
    not v_neuf and feuille.vehicule_id is not null and feuille.complete_le is null,
    coalesce(feuille.pourcentage, 0)::text || ' % rempli');

  perform fn_alerte(p_vehicule, 'absent_du_site',
    st not in ('LIVRÉ','VÉHICULE SERVICE','WHOLESALE','RETOUR',
               'ATTENTE DE RÉCEPTION','VÉHICULE REÇU','À VENIR')
    and not coalesce(v.affiche_en_ligne, false), null);

  perform fn_alerte(p_vehicule, 'sans_photo',
    coalesce(v.affiche_en_ligne, false) and coalesce(v.photos_en_ligne, 0) = 0, null);

  perform fn_alerte(p_vehicule, 'sans_vin', v.vin is null and not v_pas_arrive, null);

  -- Un neuf n'a pas de Carfax, jamais.
  perform fn_alerte(p_vehicule, 'carfax_manquant',
    not v_neuf and v.lien_carfax is null and not v_pas_arrive, null);

  perform fn_alerte(p_vehicule, 'vieillissement',
    st = 'DISPONIBLE' and v.date_recu is not null
    and (current_date - v.date_recu) > 90, null);
end;
$function$;

revoke execute on function public.fn_maj_alertes(uuid) from anon, authenticated, public;

-- 5. L'événement de notification doit exister avant la fonction qui l'écrit.
insert into notification_evenement (code, libelle) values
  ('vehicule_supprime', 'Véhicule supprimé avant réception')
on conflict (code) do nothing;

-- 6. Une vente annulée avant l'arrivée libère son numéro de stock.
--
-- Emily attribue un numéro à chaque contrat. Si le contrat tombe, le véhicule
-- n'a jamais existé physiquement : on le supprime et le numéro se réutilise.
-- Mais on ne supprime JAMAIS un véhicule qui a une histoire réelle — les clés
-- étrangères en NO ACTION (vente, inspection, demande de travaux, leads) le
-- bloquent déjà; cette fonction ajoute un message clair plutôt qu'une erreur
-- de contrainte, et refuse tout véhicule déjà arrivé.
create or replace function supprimer_vehicule(p_vehicule uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_moi uuid := utilisateur_courant(); v_no_stock text; st text; v_recu boolean; v_existe boolean;
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.creer') then
    raise exception 'Vous n''avez pas le droit de supprimer un véhicule.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif de suppression est obligatoire.' using errcode = '23514';
  end if;

  -- `v_existe` plutôt que le no_stock : un véhicule « à venir » peut n'avoir
  -- aucun numéro, on ne peut donc pas s'en servir pour tester l'existence.
  select true, v.no_stock, s.nom, (v.date_recu is not null)
    into v_existe, v_no_stock, st, v_recu
  from vehicule v left join statut_vehicule s on s.id = v.statut_id
  where v.id = p_vehicule;

  if not coalesce(v_existe, false) then
    raise exception 'Véhicule introuvable.' using errcode = '23514';
  end if;

  if v_recu or coalesce(st, '') not in ('À VENIR', 'ATTENTE DE RÉCEPTION') then
    raise exception
      'Ce véhicule est déjà arrivé (statut %) — on ne supprime pas un historique réel. Utilisez le statut RETOUR à la place.', coalesce(st, 'inconnu')
      using errcode = '23514';
  end if;

  if exists (select 1 from vehicule_jalon where vehicule_id = p_vehicule and jalon = 'recu') then
    raise exception 'Ce véhicule a déjà été reçu au moins une fois — suppression refusée.'
      using errcode = '23514';
  end if;

  if exists (select 1 from inspection where vehicule_id = p_vehicule) then
    raise exception 'Ce véhicule a une inspection — suppression refusée.' using errcode = '23514';
  end if;
  if exists (select 1 from vente where vehicule_id = p_vehicule) then
    raise exception 'Ce véhicule a un dossier de vente — annulez la vente plutôt que de le supprimer.'
      using errcode = '23514';
  end if;
  if exists (select 1 from demande_travaux where vehicule_id = p_vehicule) then
    raise exception 'Ce véhicule a une demande de travaux — suppression refusée.'
      using errcode = '23514';
  end if;

  -- Trace avant disparition : le numéro se réutilise, mais on saura pourquoi.
  -- `vehicule_id` reste null volontairement — la clé étrangère est en CASCADE,
  -- la trace disparaîtrait avec le véhicule qu'elle documente.
  insert into notification_file (evenement_code, vehicule_id, sujet, corps)
  values ('vehicule_supprime', null,
          'Véhicule supprimé — ' || coalesce(v_no_stock, '(sans numéro)'),
          'Supprimé par ' || coalesce((select nom from utilisateur where id = v_moi), 'système')
          || '. Motif : ' || btrim(p_motif));

  delete from vehicule where id = p_vehicule;
end;
$function$;

revoke execute on function public.supprimer_vehicule(uuid, text) from anon, public;
grant execute on function public.supprimer_vehicule(uuid, text) to authenticated;
