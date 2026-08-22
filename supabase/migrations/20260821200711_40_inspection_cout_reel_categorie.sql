-- Rapatriée depuis la production (appliquée le 21 août hors dépôt).
-- Contenu identique à ce qui tourne : ne pas réécrire, ne pas réordonner.

-- Ajout non destructif : aucune vue existante n'est modifiée.
-- La colonne cout reste le coût ESTIMÉ (celui présenté au client).
alter table inspection_ligne
  add column cout_reel numeric(10,2),
  add column categorie text not null default 'mecanique'
    check (categorie in ('mecanique','esthetique','saaq')),
  add column reapprobation_requise boolean not null default false,
  add column reapprouve_par uuid references utilisateur(id),
  add column reapprouve_le timestamptz;

comment on column inspection_ligne.cout is
  'Coût estimé — c''est ce montant qui est présenté au client dans le desking.';
comment on column inspection_ligne.cout_reel is
  'Coût réel après exécution. Un dépassement après approbation exige une réapprobation.';

create index idx_inspection_ligne_reappro
  on inspection_ligne(inspection_id) where reapprobation_requise;

-- Avant approbation, Catherine ajuste librement (aucune trace requise).
-- Après approbation, un dépassement bloque et exige une réapprobation
-- par n'importe quel directeur.
create or replace function fn_ecart_cout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.cout_reel is distinct from old.cout_reel
     and new.cout_reel is not null
     and old.decision <> 'en_attente'
     and new.cout_reel > coalesce(new.cout, 0) then
    new.reapprobation_requise := true;
  end if;

  if tg_op = 'UPDATE'
     and new.reapprouve_par is distinct from old.reapprouve_par
     and new.reapprouve_par is not null then
    new.reapprobation_requise := false;
    new.reapprouve_le := now();
  end if;

  return new;
end;
$$;
revoke execute on function public.fn_ecart_cout() from public, anon, authenticated;

create trigger trg_ecart_cout
  before update on inspection_ligne
  for each row execute function fn_ecart_cout();
