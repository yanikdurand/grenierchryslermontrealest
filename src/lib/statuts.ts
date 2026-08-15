/**
 * Couleur des statuts.
 *
 * Un statut n'est pas une étiquette parmi d'autres : c'est une étape du
 * parcours d'un véhicule, et l'ordre est porté par `statut_vehicule.ordre` en
 * base. La couleur doit donc dire *où en est le véhicule*, pas distinguer
 * dix-neuf valeurs les unes des autres. Dix-neuf teintes, personne ne les
 * retient; cinq familles, tout le monde les lit de loin.
 *
 * Les teintes viennent de la rampe sémantique de Lovable en thème sombre
 * (`--fg-accent`, `--fg-positive`, `--fg-special`, `--fg-attention`).
 *
 * Une réserve, vérifiée plutôt que supposée : le vert #73BE59 et l'orange
 * #FF895E ne se séparent qu'à ΔE 3,5 en vision deutéranope. C'est sous le
 * seuil. Ce qui rend la chose lisible malgré tout, c'est que la pastille
 * porte toujours son libellé — la couleur accélère la lecture, elle ne la
 * remplace jamais. C'est aussi pourquoi l'orange ne sert qu'à un seul statut :
 * moins il en porte, moins la confusion a d'occasions de se produire.
 */

export type FamilleStatut =
  /** En route vers nous, pas encore sur le terrain. */
  | 'attente'
  /** Chez nous, en préparation : quelqu'un travaille dessus. */
  | 'preparation'
  /** Prêt à se vendre aujourd'hui. */
  | 'disponible'
  /** Engagé auprès d'un client, donc plus disponible. */
  | 'vente'
  /** Sorti du cycle de vente : livré, prêté, transféré, écoulé en gros. */
  | 'clos'

const FAMILLES: Record<string, FamilleStatut> = {
  'ATT. RÉCEPTION': 'attente',

  'VÉHICULE REÇU': 'preparation',
  'PRÊT À INSPECTER': 'preparation',
  'INSPECTION OCC.': 'preparation',
  'MÉCANIQUE INT.': 'preparation',
  'MÉCANIQUE EXT.': 'preparation',
  'CARROSSERIE EXT.': 'preparation',
  'SAAQ À FAIRE': 'preparation',

  DISPONIBLE: 'disponible',

  'DÉPÔT RÉSERVÉ': 'vente',
  'ATT. APPROBATION': 'vente',
  'ATT. LIVRAISON': 'vente',

  LIVRÉ: 'clos',
  DÉMO: 'clos',
  COURTOISIE: 'clos',
  'VÉHICULE SERVICE': 'clos',
  TERREBONNE: 'clos',
  WHOLESALE: 'clos',
  RETOUR: 'clos',
}

/**
 * Un statut inconnu retombe sur « clos », qui est neutre. Mieux vaut une
 * pastille grise qu'une couleur qui mentirait : si la base gagne un statut,
 * il s'affiche sobrement jusqu'à ce qu'on le classe ici.
 */
export function familleStatut(statut: string | null | undefined): FamilleStatut {
  if (!statut) return 'clos'
  return FAMILLES[statut.trim().toUpperCase()] ?? 'clos'
}

/** Classe CSS complète, prête à poser sur la pastille. */
export function classeStatut(statut: string | null | undefined): string {
  return `statut statut-${familleStatut(statut)}`
}

/** Les états d'un dossier de vente suivent la même logique. */
export function classeEtatVente(etat: string | null | undefined): string {
  const famille: FamilleStatut =
    etat === 'depot' || etat === 'vendu' || etat === 'approuve' ? 'vente'
    : etat === 'livre' ? 'clos'
    : 'attente'
  return `statut statut-${famille}`
}
