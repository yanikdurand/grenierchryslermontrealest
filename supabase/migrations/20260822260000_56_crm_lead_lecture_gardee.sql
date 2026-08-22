-- crm_lead avait la même faille que config avant la migration 52 : une seule
-- politique "acces_authentifie" en ALL using(true), donc n'importe quel
-- employé connecté pouvait lire ET modifier les leads CRM par un appel REST
-- direct, peu importe ses droits — l'écran fiche véhicule masquait déjà la
-- section à l'affichage (§ masquage), mais la donnée restait accessible sous
-- le masquage, ce que la table ne doit jamais permettre.
--
-- La table est alimentée par la synchronisation CRM externe (service_role,
-- hors application) : rien côté "authenticated" n'a jamais eu besoin d'écrire
-- ici, seulement de lire, sous lead.voir.
drop policy if exists acces_authentifie on crm_lead;

create policy lecture on crm_lead for select
  using (j_ai_permission('lead.voir'));

-- Sert la recherche d'opportunité par nom/téléphone dans Visites.tsx : un
-- walk-in ou un phone-up peut déjà exister comme lead web/SMS/Facebook, et le
-- rattacher évite de le traiter comme un contact neuf.
create extension if not exists pg_trgm;
create index if not exists crm_lead_nom_trgm on crm_lead using gin (nom gin_trgm_ops);
create index if not exists crm_lead_telephone_idx on crm_lead (telephone);
