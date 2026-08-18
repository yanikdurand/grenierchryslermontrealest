-- Déterminer qu'une réparation est sous garantie n'est pas la même autorité
-- que bâtir une inspection : `inspection.saisir` est aussi tenu par le
-- directeur (en renfort), ce qui lui aurait laissé la porte ouverte pour
-- désigner une garantie en entrant lui-même une ligne. On sépare donc cette
-- décision dans sa propre permission, tenue par les mêmes rôles que
-- `inspection.completer` — l'équipe du service, pas la direction.

insert into permission (code, libelle, categorie, ordre) values
  ('inspection.garantie', 'Désigner une réparation sous garantie', 'Service', 5);

insert into role_permission (role, permission_code) values
  ('admin', 'inspection.garantie'),
  ('aviseur', 'inspection.garantie'),
  ('directeur_service', 'inspection.garantie');

create or replace function fn_garde_inspection_ligne()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid;
begin
  v_moi := utilisateur_courant();

  if v_moi is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.sous_garantie and not a_permission(v_moi, 'inspection.garantie') then
      raise exception 'Seule l''équipe du service peut désigner une réparation sous garantie.'
        using errcode = '42501';
    end if;
    if new.sous_garantie then
      new.decision := 'garantie';
    end if;
    return new;
  end if;

  if new.sous_garantie is distinct from old.sous_garantie
     and not a_permission(v_moi, 'inspection.garantie') then
    raise exception 'Seule l''équipe du service peut désigner une réparation sous garantie.'
      using errcode = '42501';
  end if;

  if (new.garantie_lieu is distinct from old.garantie_lieu
      or new.garantie_rdv is distinct from old.garantie_rdv
      or new.garantie_retour_le is distinct from old.garantie_retour_le)
     and not a_permission(v_moi, 'inspection.garantie') then
    raise exception 'Vous n''avez pas le droit de planifier une réparation sous garantie.'
      using errcode = '42501';
  end if;

  if new.sous_garantie is distinct from old.sous_garantie then
    if new.sous_garantie then
      new.decision := 'garantie';
    else
      if old.decision = 'garantie' then new.decision := 'en_attente'; end if;
      new.garantie_lieu := null;
      new.garantie_rdv := null;
      new.garantie_retour_le := null;
    end if;
  elsif new.decision is distinct from old.decision then
    if new.decision = 'garantie' then
      raise exception 'Seule la case « Sous garantie » peut mettre une réparation en garantie.'
        using errcode = '23514';
    end if;
    if not a_permission(v_moi, 'inspection.approuver') then
      raise exception 'Vous n''avez pas le droit d''approuver les réparations.'
        using errcode = '42501';
    end if;
  end if;

  if new.complete is distinct from old.complete
     and not a_permission(v_moi, 'inspection.completer') then
    raise exception 'Vous n''avez pas le droit de marquer une réparation comme faite.'
      using errcode = '42501';
  end if;

  if new.decision is distinct from old.decision then
    new.decide_par := v_moi;
  end if;
  if new.complete is distinct from old.complete and new.complete then
    new.complete_par := v_moi;
  end if;

  return new;
end;
$$;
