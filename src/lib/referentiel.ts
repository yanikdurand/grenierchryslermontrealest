/**
 * Valeurs de référence, relevées dans les données existantes plutôt
 * qu'inventées : la feuille doit produire les mêmes chaînes que la synchro
 * Airtable, sinon les filtres et les rapports se mettent à diverger.
 *
 * `transmission` est la seule contrainte dure en base
 * (`vehicule_transmission_check` : AUTO ou MAN).
 */

export const TRANSMISSIONS = [
  { valeur: 'AUTO', libelle: 'Automatique' },
  { valeur: 'MAN', libelle: 'Manuelle' },
]

/** « TA » est utilisé en inventaire pour la traction avant. */
export const MOTRICITES = [
  { valeur: 'TA', libelle: 'Traction avant (TA)' },
  { valeur: 'RWD', libelle: 'Propulsion (RWD)' },
  { valeur: 'AWD', libelle: 'Intégrale (AWD)' },
  { valeur: '4X4', libelle: '4X4' },
]

export const ETATS_CARROSSERIE = ['En parfaite condition', 'Dommages de carosserie']

export const ETATS_PARE_BRISE = ['Parfait', 'À réparer', 'À changer']

export const TYPES_PNEU = ['4 Saisons', 'Été', 'Hivers']

/**
 * L'inventaire contient à la fois « Jantes acier » et « Jantes d'acier ».
 * On n'expose que la seconde pour arrêter la divergence; l'ancienne valeur
 * reste lisible sur les véhicules déjà saisis.
 */
export const TYPES_ROUES = ["Jantes d'acier", 'Mags OEM', 'Mags jobber', 'Aucun']

export const POSITIONS_PNEU = [
  { valeur: 'principal', libelle: 'Pneus principaux' },
  { valeur: 'secondaire', libelle: 'Pneus secondaires' },
]
