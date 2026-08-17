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

/**
 * Depuis la séparation des deux axes (17 août 2026), ces noms ne décrivent
 * plus que l'étape opérationnelle — jamais où en est une vente. Un véhicule
 * vendu garde son étape opérationnelle réelle (souvent DISPONIBLE, parfois
 * MÉCANIQUE INTERNE le temps d'une préparation de livraison) : c'est le
 * badge de vente, calculé séparément par `libelleVente`, qui porte
 * « Vendu — attente d'approbation ». Les deux s'affichent côte à côte,
 * jamais l'un à la place de l'autre.
 */
const FAMILLES: Record<string, FamilleStatut> = {
  'ATTENTE DE RÉCEPTION': 'attente',

  'VÉHICULE REÇU': 'preparation',
  'PRÊT À INSPECTER': 'preparation',
  INSPECTION: 'preparation',
  'MÉCANIQUE INTERNE': 'preparation',
  'MÉCANIQUE EXTERNE': 'preparation',
  'CARROSSERIE EXTERNE': 'preparation',
  'SAAQ À FAIRE': 'preparation',

  DISPONIBLE: 'disponible',

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

/**
 * Le badge de vente, calculé plutôt que stocké — `vente.etat` fait autorité,
 * jamais une copie sur le véhicule. `null` veut dire « aucun dossier actif »,
 * pas « pas encore vendu » : les deux se distinguent déjà par l'absence du
 * badge à l'écran.
 *
 * La force du dossier n'apparaît que pour un financement, et seulement tant
 * que la livraison n'est pas encore passée à l'écran — une fois `livre`, la
 * vue `v_vehicule_app` ne renvoie plus de dossier actif du tout.
 */
export function libelleVente(v: {
  vente_etat: string | null
  vente_type_transaction: string | null
  vente_force_dossier: string | null
}): string | null {
  if (!v.vente_etat) return null
  if (v.vente_etat === 'depot') return 'Vendu — dépôt reçu'

  const financement = v.vente_type_transaction === 'financement'
  const suffixeForce = financement && v.vente_force_dossier
    ? `, dossier ${forceDossierMot(v.vente_force_dossier)}` : ''

  if (v.vente_etat === 'vendu' && financement) {
    return `Vendu — attente d'approbation${suffixeForce}`
  }
  return `Vendu — attente de livraison${suffixeForce}`
}

function forceDossierMot(code: string): string {
  return code === 'fort' ? 'fort' : code === 'moyen' ? 'moyen' : code === 'faible' ? 'faible' : code
}
