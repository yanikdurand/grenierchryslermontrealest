-- Emily reçoit les véhicules neufs et remplit la demande de préparation.
-- Elle n'avait aucun droit sur les travaux.
insert into role_permission (role, permission_code) values
  ('receptionniste', 'travaux.demander')
on conflict do nothing;

-- Un PDI n'est pas une dépense discrétionnaire : c'est du travail obligatoire
-- sur tout véhicule neuf. Le faire approuver par un directeur avant qu'il
-- parte au service n'ajoute qu'une attente.
--
-- Donc : une demande née d'une réception de neuf s'envoie avec le droit de
-- celui qui l'a créée. Le verrou directeur reste entier sur les demandes
-- manuelles du plancher, qui elles engagent un coût discrétionnaire.
create or replace function envoyer_demande_travaux(p_demande uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi uuid := utilisateur_courant();
  v_vehicule uuid;
  v_statut text;
  v_origine text;
  v_no_stock text;
  v_titre text;
  v_corps text;
  v_autorise boolean;
begin
  select vehicule_id, statut, origine into v_vehicule, v_statut, v_origine
  from demande_travaux where id = p_demande;

  if v_statut is null then
    raise exception 'Demande de travaux introuvable.' using errcode = '23514';
  end if;

  if v_moi is not null then
    v_autorise := a_permission(v_moi, 'travaux.gerer')
      or (v_origine = 'reception_neuf' and a_permission(v_moi, 'travaux.demander'));
    if not v_autorise then
      raise exception 'Vous n''avez pas le droit d''envoyer une demande de travaux.'
        using errcode = '42501';
    end if;
  end if;

  if v_statut <> 'brouillon' then
    raise exception 'Cette demande a déjà été envoyée ou annulée.' using errcode = '23514';
  end if;
  if not exists (select 1 from demande_travaux_ligne where demande_id = p_demande) then
    raise exception 'Ajoutez au moins une ligne avant d''envoyer la demande.' using errcode = '23514';
  end if;

  update demande_travaux
  set statut = 'envoyee', envoyee_par = v_moi, envoyee_le = now()
  where id = p_demande;

  update vehicule
  set statut_id = (select id from statut_vehicule where nom = 'DEMANDE DE TRAVAUX')
  where id = v_vehicule;

  select v.no_stock, concat_ws(' ', v.annee::text, v.marque, v.modele, v.trim)
    into v_no_stock, v_titre
  from vehicule v where v.id = v_vehicule;

  select string_agg('• ' || d.categorie || ' — ' || d.description, E'\n' order by d.no_ligne)
    into v_corps
  from demande_travaux_ligne d where d.demande_id = p_demande;

  insert into notification_file (evenement_code, vehicule_id, sujet, corps)
  values (
    'demande_travaux_envoyee',
    v_vehicule,
    case when v_origine = 'reception_neuf'
         then 'Préparation véhicule neuf — ' || coalesce(v_no_stock, '')
         else 'Demande de travaux — ' || coalesce(v_no_stock, '') end,
    case when v_origine = 'reception_neuf'
         then 'Le véhicule neuf ' || v_titre || ' (' || coalesce(v_no_stock, '') || ') est arrivé et attend sa préparation.'
         else 'Le concessionnaire a envoyé une demande de travaux pour ' || v_titre || ' (' || coalesce(v_no_stock, '') || ').' end
    || E'\n\n' || coalesce(v_corps, '')
  );
end;
$$;

revoke execute on function public.envoyer_demande_travaux(uuid) from anon, public;
grant execute on function public.envoyer_demande_travaux(uuid) to authenticated;
