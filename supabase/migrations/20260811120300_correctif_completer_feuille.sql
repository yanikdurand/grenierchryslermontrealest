-- Phase 0 (3/3b) — Correctif de bogue : completer_feuille
--
-- Bogue préexistant, révélé une fois l'erreur de permission levée.
--
-- `manquants` est un `text[]`, et le code faisait :
--     manquants := manquants || 'kilométrage';
-- Le littéral n'étant pas typé, Postgres résout `||` vers l'opérateur
-- `anyarray || anyarray` plutôt que `anyarray || anyelement`, et tente de lire
-- 'kilométrage' comme un tableau :
--     22P02 malformed array literal: "kilométrage"
--
-- Effet concret : dès qu'un champ manquait, la fonction plantait avec une
-- erreur incompréhensible au lieu d'afficher « Impossible de compléter : il
-- manque le kilométrage, les pneus principaux. » Le chemin nominal (feuille
-- complète) fonctionnait, puisqu'aucune concaténation n'était exécutée — d'où
-- un bogue passé inaperçu.
--
-- Correctif : typer explicitement chaque littéral en `text`. Le corps de la
-- fonction est identique par ailleurs.

create or replace function public.completer_feuille(p_vehicule uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v record; v_moi uuid := utilisateur_courant(); manquants text[] := '{}';
begin
  if v_moi is not null and not a_permission(v_moi, 'feuille.saisir') then
    raise exception 'Vous n''avez pas le droit de compléter la feuille.' using errcode = '42501';
  end if;
  select * into v from vehicule where id = p_vehicule;

  if v.km is null                then manquants := manquants || 'kilométrage'::text; end if;
  if v.transmission is null      then manquants := manquants || 'transmission'::text; end if;
  if v.motricite is null         then manquants := manquants || 'motricité'::text; end if;
  if v.couleur_exterieur is null then manquants := manquants || 'couleur extérieure'::text; end if;
  if v.nb_clefs is null          then manquants := manquants || 'nombre de clés'::text; end if;
  if not exists (select 1 from vehicule_pneu where vehicule_id = p_vehicule and position = 'principal')
    then manquants := manquants || 'pneus principaux'::text; end if;
  if not exists (select 1 from document where vehicule_id = p_vehicule and type = 'photo')
    then manquants := manquants || 'au moins une photo'::text; end if;

  if array_length(manquants, 1) > 0 then
    raise exception 'Impossible de compléter : il manque %.', array_to_string(manquants, ', ')
      using errcode = '23514';
  end if;

  update feuille_equipement
  set complete_le = now(), complete_par = v_moi
  where vehicule_id = p_vehicule;
end;
$function$;
