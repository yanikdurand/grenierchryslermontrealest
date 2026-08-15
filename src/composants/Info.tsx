/**
 * Point d'interrogation posé à côté d'un libellé de champ, pour l'explication
 * qui ne mérite pas de rester affichée en permanence sous le champ. Un
 * formulaire avec une phrase d'aide sous chaque case devient illisible dès
 * qu'on en a plus de trois — ici l'explication n'occupe de la place qu'à la
 * demande.
 *
 * `:focus-visible` + sélecteur adjacent plutôt qu'un `useState` : l'info-bulle
 * s'ouvre au survol comme au clavier, sans JavaScript pour la faire
 * apparaître ou disparaître.
 */
export function Info({ texte }: { texte: string }) {
  return (
    <span className="info">
      <button type="button" className="info-declencheur" aria-label="Plus d’information">?</button>
      <span className="info-bulle" role="tooltip">{texte}</span>
    </span>
  )
}
