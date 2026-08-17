-- `fn_garde_demande_travaux_ligne` bloquait le décochage d'une ligne une fois
-- la demande auto-complétée, empêchant la réouverture que
-- `fn_completer_demande_travaux` est censée déclencher.
create or replace function fn_garde_demande_travaux_ligne()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid; v_statut text;
begin
  v_moi := utilisateur_courant();

  if v_moi is null then return coalesce(new, old); end if;

  select statut into v_statut from demande_travaux
  where id = coalesce(new.demande_id, old.demande_id);

  if tg_op = 'INSERT' then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut ajouter une ligne qu''à une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit d''ajouter une ligne à une demande de travaux.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut retirer une ligne que d''une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit de retirer une ligne d''une demande de travaux.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- `completee` reste permis ici : décocher une ligne doit pouvoir rouvrir la
  -- demande (trigger fn_completer_demande_travaux), sinon la demande resterait
  -- coincée « complétée » dès la première coche retirée par erreur.
  if new.complete is distinct from old.complete then
    if v_statut not in ('envoyee', 'completee') then
      raise exception 'On ne peut cocher une ligne que sur une demande déjà envoyée.'
        using errcode = '23514';
    end if;
    if not a_permission(v_moi, 'travaux.completer') then
      raise exception 'Vous n''avez pas le droit de marquer un travail comme fait.'
        using errcode = '42501';
    end if;
    new.complete_par := v_moi;
    new.complete_le := case when new.complete then now() else null end;
  end if;

  if new.description is distinct from old.description or new.categorie is distinct from old.categorie then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut modifier une ligne que d''une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit de modifier une ligne de demande de travaux.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
