/**
 * Marques et modèles en menu déroulant plutôt qu'en texte libre — sur le
 * modèle des sites de listing (AutoTrader, etc.). Ça évite « Honda » un jour
 * et « HONDA » le lendemain, comme c'est déjà arrivé dans les données
 * migrées d'Airtable (BMW / « BMW XI » pour un même modèle).
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

/**
 * `GetMakesForVehicleType` (le point d'entrée « marque » de NHTSA) renvoie
 * tout ce qui a déjà porté un NIA aux États-Unis : 406 noms rien que pour
 * voiture/camion/VUS, dont « ALLIANZ SWEEPER COMPANY », « AMERICAN
 * LAFRANCE » (camions de pompiers) ou une douzaine de carrossiers
 * artisanaux. NHTSA existe pour tracer un véhicule, pas pour vendre —
 * rien n'y distingue une marque grand public d'un fabricant de balayeuses.
 * AutoTrader ne tire pas non plus son menu de NHTSA pour cette raison :
 * ces sites maintiennent leur propre liste éditoriale.
 *
 * Celle-ci fait pareil, à la main. Chaque nom est repris tel quel de la
 * liste NHTSA réelle (orthographe et présence vérifiées le 15 août 2026,
 * pas inventées) pour que le menu ne propose jamais une valeur qui ferait
 * échouer la cascade de modèles ensuite. Elle couvre les marques encore
 * vendues neuves en Amérique du Nord, plus celles disparues assez
 * récemment pour rester courantes en occasion (Pontiac, Saturn, Plymouth…).
 * Un import rare ou une marque commerciale passe par « Autre ».
 *
 * Trouvaille au passage : Scion n'existe dans aucune table NHTSA, ni comme
 * marque ni sous Toyota — un tC ou un xB devra donc passer par « Autre »
 * pour la marque tant qu'aucune meilleure source n'est branchée.
 */
export const MARQUES = [
  'ACURA', 'ALFA ROMEO', 'ASTON MARTIN', 'AUDI', 'BENTLEY', 'BMW', 'BUGATTI', 'BUICK',
  'CADILLAC', 'CHEVROLET', 'CHRYSLER', 'DODGE', 'EAGLE', 'FERRARI', 'FIAT', 'FORD',
  'GENESIS', 'GEO', 'GMC', 'HONDA', 'HUMMER', 'HYUNDAI', 'INFINITI', 'ISUZU', 'JAGUAR',
  'JEEP', 'KIA', 'LAMBORGHINI', 'LAND ROVER', 'LEXUS', 'LINCOLN', 'LOTUS', 'LUCID',
  'MASERATI', 'MAZDA', 'MCLAREN', 'MERCEDES-BENZ', 'MERCURY', 'MINI', 'MITSUBISHI',
  'NISSAN', 'OLDSMOBILE', 'PLYMOUTH', 'POLESTAR', 'PONTIAC', 'PORSCHE', 'RAM', 'RIVIAN',
  'ROLLS-ROYCE', 'SAAB', 'SATURN', 'SMART', 'SUBARU', 'SUZUKI', 'TESLA', 'TOYOTA',
  'VINFAST', 'VOLKSWAGEN', 'VOLVO',
]

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
