-- Correction de processus (Q5) : Jonathan remplit le formulaire d'acquisition
-- parce qu'il sait ce qu'il achète, mais ce n'est pas lui qui numérote le
-- stock — c'est Emily, quand elle fait le contrat. La migration 44 avait
-- fait du numéro de stock un champ obligatoire dès la création ; ça recolle
-- les deux étapes en une seule et empêche Jonathan de créer un véhicule
-- sans connaître déjà son numéro.
--
-- Le mécanisme d'attribution différée existe déjà (migration 38,
-- attribuer_no_stock) mais n'était jamais câblé dans creer_vehicule ni dans
-- aucune interface. On le raccorde ici : le numéro de stock redevient
-- optionnel à la création, pour l'occasion comme pour le neuf.

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

  -- Le numéro de stock n'est plus exigé ici : Jonathan connaît le véhicule,
  -- pas nécessairement son numéro. Emily l'attribue via attribuer_no_stock()
  -- quand elle fait le contrat. S'il est fourni tout de suite, tant mieux —
  -- rien n'empêche de sauter l'étape.

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

  if p_no_stock is not null and coalesce(btrim(p_no_stock), '') <> ''
     and exists (select 1 from vehicule where upper(btrim(no_stock)) = upper(btrim(p_no_stock))) then
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
    nullif(upper(btrim(p_no_stock)), ''), upper(btrim(p_vin)),
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

-- attribuer_no_stock (migration 38) était security invoker : sous le role
-- authenticated, elle n'a pas accès à la table vehicule, révoquée depuis la
-- migration 43. Sans ce correctif, le premier clic réel d'Emily aurait
-- échoué — trouvé en testant ce raccordement avant de le brancher à l'UI.
create or replace function attribuer_no_stock(p_vehicule uuid, p_no_stock text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'vehicule.recevoir') then
    raise exception 'Vous n''avez pas le droit d''attribuer un numéro de stock.'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_no_stock), '') = '' then
    raise exception 'Le numéro de stock est obligatoire.' using errcode = '23514';
  end if;
  if exists (select 1 from vehicule
             where upper(btrim(no_stock)) = upper(btrim(p_no_stock))
               and id <> p_vehicule) then
    raise exception 'Le numéro de stock % existe déjà.', btrim(p_no_stock)
      using errcode = '23505';
  end if;
  update vehicule set no_stock = upper(btrim(p_no_stock)) where id = p_vehicule;
end;
$$;
