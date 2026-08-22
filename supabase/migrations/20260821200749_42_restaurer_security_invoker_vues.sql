-- Rapatriée depuis la production (appliquée le 21 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.
--
-- ⚠️ ATTENTION — cette migration a cassé la lecture de 25 vues sur 30.
-- Elle est conservée telle quelle pour que l'historique reste fidèle, mais
-- la migration 43 qui suit la corrige sélectivement. Ne pas la rejouer seule.
-- Lire l'en-tête de la 43 avant de toucher au security_invoker d'une vue.

-- Restauration du mode security_invoker sur toutes les vues.
-- En mode DEFINER, une vue s'exécute avec les droits de son créateur et
-- contourne les politiques RLS de l'utilisateur qui l'interroge.
do $$
declare v text;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and n.nspname = 'public'
      and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))
  loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end $$;
