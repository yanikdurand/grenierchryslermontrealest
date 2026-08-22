-- Rapatriée depuis la production (appliquée le 21 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.
--
-- Cette migration corrige une vraie faille introduite par les fonctions de
-- demande de travaux. Elle reste en place — ne pas la révoquer.

-- FAILLE : ces fonctions SECURITY DEFINER étaient exécutables par le rôle anon,
-- c'est-à-dire par quiconque possède la clé publique du frontend, sans être
-- authentifié. Un inconnu pouvait créer, envoyer ou annuler des demandes de travaux.

revoke execute on function public.creer_demande_travaux(uuid, text)   from anon, public;
revoke execute on function public.envoyer_demande_travaux(uuid)        from anon, public;
revoke execute on function public.annuler_demande_travaux(uuid, text)  from anon, public;

grant execute on function public.creer_demande_travaux(uuid, text)   to authenticated;
grant execute on function public.envoyer_demande_travaux(uuid)        to authenticated;
grant execute on function public.annuler_demande_travaux(uuid, text)  to authenticated;

-- Les fonctions de trigger ne doivent JAMAIS être appelables par l'API,
-- ni par anon ni par un utilisateur authentifié.
revoke execute on function public.fn_completer_demande_travaux()   from anon, authenticated, public;
revoke execute on function public.fn_garde_demande_travaux_ligne() from anon, authenticated, public;
revoke execute on function public.fn_log_vente()                   from anon, authenticated, public;
