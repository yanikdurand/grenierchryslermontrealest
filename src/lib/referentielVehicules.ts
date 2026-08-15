/**
 * Marques et modèles, tirés de NHTSA plutôt que saisis à la main — sur le
 * modèle des sites de listing (AutoTrader, etc.) qui proposent des menus
 * déroulants plutôt que du texte libre. Ça évite « Honda » un jour et
 * « HONDA » le lendemain, comme c'est déjà arrivé dans les données migrées
 * d'Airtable (BMW / « BMW XI » pour un même modèle).
 *
 * Ce que NHTSA ne fournit pas : la version (trim). Un VIN nord-américain
 * n'encode qu'une seule version, et le service gratuit ne renvoie donc
 * qu'une suggestion, jamais une liste. Une liste complète des versions par
 * modèle/année existe chez des fournisseurs payants (JD Power via contrat
 * concessionnaire, Auto.dev en libre-service à faible coût) — voir la
 * discussion avec Yanik du 15 août 2026. Le champ Version reste donc un
 * texte libre, pré-rempli par la suggestion du décodage.
 */

const RACINE = 'https://vpic.nhtsa.dot.gov/api/vehicles'

/**
 * Les types retenus couvrent ce qu'un commerce de véhicules d'occasion
 * achète réellement : voitures, camions légers, VUS/multisegments. On exclut
 * motos, remorques, autobus — présents dans `GetAllMakes` mais hors sujet ici.
 */
const TYPES_VEHICULE = ['car', 'truck', 'multipurpose passenger vehicle (mpv)']

async function recupererJson<T>(url: string): Promise<T> {
  const reponse = await fetch(url)
  if (!reponse.ok) throw new Error(`NHTSA a répondu ${reponse.status}.`)
  return reponse.json() as Promise<T>
}

function normaliser(nom: string): string {
  return nom.trim().toUpperCase()
}

// Les marques ne changent essentiellement jamais : une seule requête par session suffit.
let marquesEnCache: Promise<string[]> | null = null

export function chargerMarques(): Promise<string[]> {
  if (!marquesEnCache) {
    marquesEnCache = Promise.all(
      TYPES_VEHICULE.map((t) =>
        recupererJson<{ Results: { MakeName: string }[] }>(
          `${RACINE}/GetMakesForVehicleType/${encodeURIComponent(t)}?format=json`
        )
      )
    ).then((reponses) => {
      const noms = new Set<string>()
      for (const r of reponses) for (const m of r.Results) noms.add(normaliser(m.MakeName))
      return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
    })
  }
  return marquesEnCache
}

const modelesEnCache = new Map<string, Promise<string[]>>()

export function chargerModeles(marque: string, annee: number): Promise<string[]> {
  const cle = `${marque}|${annee}`
  if (!modelesEnCache.has(cle)) {
    modelesEnCache.set(
      cle,
      Promise.all(
        TYPES_VEHICULE.map((t) =>
          recupererJson<{ Results: { Model_Name: string }[] }>(
            `${RACINE}/GetModelsForMakeYear/make/${encodeURIComponent(marque)}` +
              `/modelyear/${annee}/vehicletype/${encodeURIComponent(t)}?format=json`
          )
        )
      ).then((reponses) => {
        const noms = new Set<string>()
        for (const r of reponses) for (const m of r.Results) noms.add(normaliser(m.Model_Name))
        return [...noms].sort((a, b) => a.localeCompare(b, 'fr'))
      })
    )
  }
  return modelesEnCache.get(cle)!
}
