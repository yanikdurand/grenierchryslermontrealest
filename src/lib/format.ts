/** Mises en forme françaises (Québec), regroupées pour rester cohérentes. */

const ABSENT = '—'

export function argent(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return ABSENT
  return valeur.toLocaleString('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  })
}

export function nombre(valeur: number | null | undefined, suffixe = ''): string {
  if (valeur === null || valeur === undefined) return ABSENT
  return valeur.toLocaleString('fr-CA') + suffixe
}

/** Une année ne prend pas de séparateur de milliers : 2021, jamais « 2 021 ». */
export function annee(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return ABSENT
  return String(valeur)
}

export function texte(valeur: string | null | undefined): string {
  const propre = valeur?.trim()
  return propre ? propre : ABSENT
}

export function date(valeur: string | null | undefined): string {
  if (!valeur) return ABSENT
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return ABSENT
  return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function dateCourte(valeur: string | null | undefined): string {
  if (!valeur) return ABSENT
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return ABSENT
  return d.toLocaleDateString('fr-CA')
}

export function ouiNon(valeur: boolean | null | undefined): string {
  if (valeur === null || valeur === undefined) return ABSENT
  return valeur ? 'Oui' : 'Non'
}

const TRANSMISSIONS: Record<string, string> = { AUTO: 'Automatique', MAN: 'Manuelle' }

export function transmission(valeur: string | null | undefined): string {
  if (!valeur) return ABSENT
  return TRANSMISSIONS[valeur] ?? valeur
}

const JALONS: Record<string, string> = {
  achete: 'Acheté',
  recu: 'Reçu',
  feuille_debutee: 'Feuille débutée',
  feuille_completee: 'Feuille complétée',
  envoye_service: 'Envoyé au service',
  en_ligne: 'Mis en ligne',
  vendu: 'Vendu',
  livre: 'Livré',
}

export function jalon(code: string): string {
  return JALONS[code] ?? code
}

const DOCUMENTS: Record<string, string> = {
  carfax_fr: 'Carfax (français)',
  carfax_en: 'Carfax (anglais)',
  photo: 'Photo',
  dommage: 'Dommage',
  immatriculation: 'Immatriculation',
  facture_fournisseur: 'Facture du fournisseur',
  evaluation_echange: 'Feuille d’évaluation',
  inspection_saaq: 'Inspection SAAQ',
  paid_out: 'Quittance (paid out)',
  bilan_85_points: 'Bilan 85 points',
  vin: 'VIN',
  autre: 'Autre',
}

export function typeDocument(code: string): string {
  return DOCUMENTS[code] ?? code
}

export function poids(octets: number | null | undefined): string {
  if (!octets) return ABSENT
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

const DECISIONS: Record<string, string> = {
  en_attente: 'En attente',
  ne_pas_faire: 'Ne pas faire',
  de_base: 'De base',
  signature: 'Signature',
  garantie: 'Garantie',
}

export function decision(code: string | null | undefined): string {
  if (!code) return ABSENT
  return DECISIONS[code] ?? code
}

const ETATS_VENTE: Record<string, string> = {
  depot: 'Dépôt reçu',
  vendu: 'Vendu',
  approuve: 'Approuvé',
  livre: 'Livré',
  annule: 'Annulée',
}

export function etatVente(code: string | null | undefined): string {
  if (!code) return ABSENT
  return ETATS_VENTE[code] ?? code
}

const FORCES: Record<string, string> = {
  fort: 'Dossier fort',
  moyen: 'Dossier moyen',
  faible: 'Dossier faible',
}

export function forceDossier(code: string | null | undefined): string {
  if (!code) return 'Dossier non qualifié'
  return FORCES[code] ?? code
}

const TRANSACTIONS: Record<string, string> = {
  financement: 'Financement',
  comptant: 'Comptant',
  location: 'Location',
}

export function transaction(code: string | null | undefined): string {
  if (!code) return ABSENT
  return TRANSACTIONS[code] ?? code
}
