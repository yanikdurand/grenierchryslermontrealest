/**
 * Décodage d'un VIN par l'API NHTSA (gratuite, sans clé).
 *
 * L'appel part du navigateur, jamais du serveur. Les champs sont lus
 * défensivement : l'API renvoie des chaînes vides plutôt que des null, et sa
 * liste de champs évolue. Rien n'est écrit en base directement — le décodage
 * ne fait que **proposer**, c'est la personne qui confirme.
 */

const RACINE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues'

export type VinDecode = {
  marque: string | null
  modele: string | null
  annee: number | null
  carrosserie: string | null
  motricite: string | null
  transmission: string | null
  pnbv: number | null
  nb_passagers: number | null
}

function propre(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const t = valeur.trim()
  if (!t || t.toLowerCase() === 'not applicable') return null
  return t
}

function entier(valeur: unknown): number | null {
  const t = propre(valeur)
  if (!t) return null
  // « 6,000 lbs (2,721 kg) » ou « 2100 » : on prend la première suite de chiffres.
  const chiffres = t.replace(/[\s,]/g, '').match(/\d+/)
  if (!chiffres) return null
  const n = Number(chiffres[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Le GVWR arrive sous la forme « Class 1: 6,000 lb or less » : le premier
 * nombre est le numéro de classe, pas le poids. On ne retient donc que celui
 * qui porte une unité, et rien si l'on ne peut pas trancher.
 */
function poids(valeur: unknown): number | null {
  const t = propre(valeur)
  if (!t) return null
  const avecUnite = t.match(/([\d.,\s]+)(lb|kg)/i)
  if (!avecUnite) return null
  const n = Number(avecUnite[1].replace(/[\s,]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** L'inventaire note la traction avant « TA », pas « FWD ». */
function versMotricite(brut: string | null): string | null {
  if (!brut) return null
  const t = brut.toUpperCase()
  if (t.includes('4WD') || t.includes('4X4')) return '4X4'
  if (t.includes('AWD') || t.includes('ALL')) return 'AWD'
  if (t.includes('RWD') || t.includes('REAR')) return 'RWD'
  if (t.includes('FWD') || t.includes('FRONT')) return 'TA'
  return null
}

/** La base n'accepte que AUTO ou MAN. */
function versTransmission(brut: string | null): string | null {
  if (!brut) return null
  const t = brut.toUpperCase()
  if (t.includes('MANUAL')) return 'MAN'
  if (t.includes('AUTO') || t.includes('CVT') || t.includes('DUAL')) return 'AUTO'
  return null
}

export async function decoderVin(vin: string): Promise<VinDecode> {
  const reponse = await fetch(`${RACINE}/${encodeURIComponent(vin)}?format=json`)
  if (!reponse.ok) {
    throw new Error(`Le service de décodage a répondu ${reponse.status}.`)
  }

  const corps = (await reponse.json()) as { Results?: Record<string, unknown>[] }
  const r = corps.Results?.[0]
  if (!r) throw new Error('Le service de décodage n’a rien renvoyé pour ce VIN.')

  const erreur = propre(r.ErrorText)
  const marque = propre(r.Make)
  if (!marque && erreur && !erreur.startsWith('0')) {
    throw new Error('Ce VIN n’a pas pu être décodé — vérifiez la saisie.')
  }

  return {
    marque,
    modele: propre(r.Model),
    annee: entier(r.ModelYear),
    carrosserie: propre(r.BodyClass),
    motricite: versMotricite(propre(r.DriveType)),
    transmission: versTransmission(propre(r.TransmissionStyle)),
    pnbv: poids(r.GVWR),
    nb_passagers: entier(r.Seats),
  }
}
