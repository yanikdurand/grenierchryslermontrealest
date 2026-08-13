import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { date, nombre, texte } from '../lib/format'
import {
  ETATS_CARROSSERIE, ETATS_PARE_BRISE, MOTRICITES, POSITIONS_PNEU,
  TRANSMISSIONS, TYPES_PNEU, TYPES_ROUES,
} from '../lib/referentiel'
import { decoderVin } from '../lib/nhtsa'
import type { VinDecode } from '../lib/nhtsa'
import type { EquipementCoche, Pneu, VehiculeApp } from '../lib/types'

type Enregistrement = 'repos' | 'encours' | 'fait' | 'erreur'

/** Champs de `vehicule` que la feuille renseigne, avec leur paramètre RPC. */
const CHAMPS = {
  km: 'p_km',
  transmission: 'p_transmission',
  motricite: 'p_motricite',
  couleur_exterieur: 'p_couleur_exterieur',
  couleur_interieur: 'p_couleur_interieur',
  nb_clefs: 'p_nb_clefs',
  nb_passagers: 'p_nb_passagers',
  pnbv: 'p_pnbv',
  etat_carrosserie: 'p_etat_carrosserie',
  etat_pare_brise: 'p_etat_pare_brise',
  trim: 'p_trim',
  notes: 'p_notes',
} as const

type Champ = keyof typeof CHAMPS

const NUMERIQUES: Champ[] = ['km', 'nb_clefs', 'nb_passagers', 'pnbv']

export function FeuilleEquipements() {
  const { id } = useParams<{ id: string }>()
  const { aLeDroit, utilisateur } = useMoi()

  const [vehicule, setVehicule] = useState<VehiculeApp | null>(null)
  const [equipements, setEquipements] = useState<EquipementCoche[]>([])
  const [pneus, setPneus] = useState<Pneu[]>([])
  const [valeurs, setValeurs] = useState<Record<string, string>>({})

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [etat, setEtat] = useState<Enregistrement>('repos')
  const [action, setAction] = useState<string | null>(null)

  const [decodage, setDecodage] = useState(false)
  const [propositions, setPropositions] = useState<VinDecode | null>(null)

  const demarree = useRef(false)

  const peutSaisir = aLeDroit('feuille.saisir')

  const charger = useCallback(async () => {
    if (!id) return

    const [v, eq, pn] = await Promise.all([
      supabase.from('v_vehicule_app').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_feuille_equipements')
        .select('equipement_id, equipement, categorie, coche').eq('vehicule_id', id),
      supabase.from('vehicule_pneu')
        .select('id, position, largeur, ratio, diametre, type_pneu, roues').eq('vehicule_id', id),
    ])

    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Véhicule introuvable.')
      setChargement(false)
      return
    }

    const fiche = v.data as unknown as VehiculeApp
    setVehicule(fiche)
    setEquipements((eq.data ?? []) as EquipementCoche[])
    setPneus((pn.data ?? []) as Pneu[])

    setValeurs(
      Object.fromEntries(
        (Object.keys(CHAMPS) as Champ[]).map((c) => {
          const brut = fiche[c as keyof VehiculeApp]
          return [c, brut === null || brut === undefined ? '' : String(brut)]
        })
      )
    )
    setChargement(false)
  }, [id])

  useEffect(() => {
    charger()
  }, [charger])

  /**
   * La feuille appartient au véhicule, pas à la personne : `demarrer_feuille`
   * est un upsert, donc reprendre le travail de quelqu'un d'autre est sans
   * effet de bord. Aucun verrou — un absent ne doit pas bloquer un véhicule.
   */
  useEffect(() => {
    if (!id || !peutSaisir || demarree.current || chargement) return
    demarree.current = true
    supabase.rpc('demarrer_feuille', { p_vehicule: id }).then(({ error }) => {
      if (error) setErreur(messageErreur(error))
      else charger()
    })
  }, [id, peutSaisir, chargement, charger])

  /** Sauvegarde d'un seul champ : c'est la granularité demandée par le brief. */
  async function enregistrerChamp(champ: Champ, valeur: string) {
    if (!id || !peutSaisir) return

    const brut = valeur.trim()
    const argument = NUMERIQUES.includes(champ)
      ? brut === '' ? null : Number(brut)
      : brut === '' ? null : brut

    // Un null laisse la valeur en place côté fonction : inutile d'appeler.
    if (argument === null) return

    setEtat('encours')
    setErreur(null)

    const { error } = await supabase.rpc('maj_caracteristiques', {
      p_vehicule: id,
      [CHAMPS[champ]]: argument,
    })

    if (error) {
      setEtat('erreur')
      setErreur(messageErreur(error))
      return
    }

    setEtat('fait')
    await charger()
    window.setTimeout(() => setEtat('repos'), 1500)
  }

  function marquerEquipement(equipementId: number, coche: boolean) {
    setEquipements((liste) =>
      liste.map((e) => (e.equipement_id === equipementId ? { ...e, coche } : e))
    )
  }

  async function basculerEquipement(equipementId: number, actif: boolean) {
    if (!id) return

    // La case bouge tout de suite : Jonathan est dehors, au téléphone, et une
    // case qui attend l'aller-retour réseau donne une interface morte. On
    // revient en arrière si la base refuse.
    marquerEquipement(equipementId, actif)
    setEtat('encours')

    const { error } = await supabase.rpc('basculer_equipement', {
      p_vehicule: id, p_equipement: equipementId, p_actif: actif,
    })

    if (error) {
      marquerEquipement(equipementId, !actif)
      setEtat('erreur')
      setErreur(messageErreur(error))
      return
    }

    setEtat('fait')
    window.setTimeout(() => setEtat('repos'), 1000)
  }

  async function enregistrerPneu(position: string, form: HTMLFormElement) {
    if (!id) return
    const donnees = new FormData(form)
    const n = (cle: string) => {
      const v = donnees.get(cle)
      return v && String(v).trim() !== '' ? Number(v) : null
    }
    const t = (cle: string) => {
      const v = donnees.get(cle)
      return v && String(v).trim() !== '' ? String(v) : null
    }

    setAction(`pneu-${position}`)
    setErreur(null)

    const { error } = await supabase.rpc('enregistrer_pneu', {
      p_vehicule: id, p_position: position,
      p_largeur: n('largeur'), p_ratio: n('ratio'), p_diametre: n('diametre'),
      p_type: t('type_pneu'), p_roues: t('roues'),
    })

    if (error) setErreur(messageErreur(error))
    else {
      await charger()
      setSucces('Pneus enregistrés.')
    }
    setAction(null)
  }

  async function televerserPhotos(fichiers: FileList | null, type: 'photo' | 'dommage') {
    if (!id || !fichiers || fichiers.length === 0) return
    setAction(`photo-${type}`)
    setErreur(null)

    let echecs = 0
    for (const fichier of Array.from(fichiers)) {
      const ext = fichier.name.split('.').pop()?.toLowerCase() || 'jpg'
      const chemin = `${id}/${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`

      const { error: erreurStockage } = await supabase.storage
        .from('vehicules').upload(chemin, fichier, { contentType: fichier.type || undefined })
      if (erreurStockage) { echecs += 1; continue }

      const { error: erreurLigne } = await supabase.from('document').insert({
        vehicule_id: id, type, chemin_storage: chemin, nom_fichier: fichier.name,
        taille_octets: fichier.size, mime: fichier.type || null,
        ajoute_par: utilisateur?.id ?? null,
      })
      if (erreurLigne) echecs += 1
    }

    if (echecs > 0) setErreur(`${echecs} photo(s) n’ont pas pu être téléversées.`)
    else setSucces('Photos ajoutées.')
    await charger()
    setAction(null)
  }

  async function decoder() {
    if (!vehicule?.vin) {
      setErreur('Ce véhicule n’a pas de VIN à décoder.')
      return
    }
    setDecodage(true)
    setErreur(null)
    setPropositions(null)
    try {
      setPropositions(await decoderVin(vehicule.vin))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le décodage a échoué.')
    }
    setDecodage(false)
  }

  /** Le décodage ne remplit que les cases vides : rien de saisi n'est écrasé. */
  function appliquerPropositions() {
    if (!propositions) return
    setValeurs((v) => {
      const suivant = { ...v }
      const paires: [Champ, string | number | null][] = [
        ['motricite', propositions.motricite],
        ['transmission', propositions.transmission],
        ['pnbv', propositions.pnbv],
        ['nb_passagers', propositions.nb_passagers],
      ]
      for (const [champ, valeur] of paires) {
        if (valeur !== null && !suivant[champ]) suivant[champ] = String(valeur)
      }
      return suivant
    })
    setSucces('Valeurs proposées reportées. Vérifiez-les, puis quittez chaque champ pour enregistrer.')
    setPropositions(null)
  }

  const parCategorie = useMemo(() => {
    const groupes = new Map<string, EquipementCoche[]>()
    for (const e of equipements) {
      const cle = e.categorie ?? 'autre'
      groupes.set(cle, [...(groupes.get(cle) ?? []), e])
    }
    return [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [equipements])

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!vehicule) {
    return (
      <div className="page">
        <p className="message-erreur">{erreur ?? 'Véhicule introuvable.'}</p>
        <Link to="/inventaire" className="bouton-secondaire">Retour à l’inventaire</Link>
      </div>
    )
  }

  if (!peutSaisir) {
    return (
      <div className="page">
        <p className="message-erreur">
          Vous n’avez pas le droit de remplir la feuille d’équipements.
        </p>
        <Link to={`/vehicule/${vehicule.id}`} className="bouton-secondaire">Voir la fiche</Link>
      </div>
    )
  }

  const v = vehicule
  const pneu = (position: string) => pneus.find((p) => p.position === position)

  const champTexte = (champ: Champ, etiquette: string, options?: string[], type = 'text') => (
    <label className="champ">
      <span>{etiquette}</span>
      {options ? (
        <select
          value={valeurs[champ] ?? ''}
          onChange={(e) => {
            setValeurs((x) => ({ ...x, [champ]: e.target.value }))
            enregistrerChamp(champ, e.target.value)
          }}
        >
          <option value="">Choisir…</option>
          {/* Une valeur héritée hors liste doit rester visible : sans ça le
              menu paraît vide alors que le véhicule est bien renseigné. */}
          {valeurs[champ] && !options.includes(valeurs[champ]) && (
            <option value={valeurs[champ]}>{valeurs[champ]} (valeur existante)</option>
          )}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={valeurs[champ] ?? ''}
          onChange={(e) => setValeurs((x) => ({ ...x, [champ]: e.target.value }))}
          onBlur={(e) => enregistrerChamp(champ, e.target.value)}
        />
      )}
    </label>
  )

  return (
    <div className="page feuille">
      <Link to={`/vehicule/${v.id}`} className="retour">← Fiche du véhicule</Link>

      <header className="fiche-entete">
        <div>
          <h1 className="titre-page">{v.no_stock}</h1>
          <p className="fiche-titre">{v.vehicule_titre}</p>
        </div>
        <span className={`indicateur ${etat}`}>
          {etat === 'encours' ? 'Enregistrement…'
            : etat === 'fait' ? 'Enregistré'
            : etat === 'erreur' ? 'Échec' : ''}
        </span>
      </header>

      <div className="progression">
        <div className="barre"><span style={{ width: `${v.feuille_pourcentage ?? 0}%` }} /></div>
        <p className="note">
          {nombre(v.feuille_pourcentage, ' %')} complété
          {v.feuille_derniere_modif_par && (
            <> · dernière modification par {v.feuille_derniere_modif_par}, {date(v.feuille_derniere_modif)}</>
          )}
        </p>
      </div>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      <section className="bloc">
        <h2>VIN</h2>
        <p className="valeur-vin">{texte(v.vin)}</p>
        <button type="button" className="bouton-secondaire" onClick={decoder} disabled={decodage}>
          {decodage ? 'Décodage…' : 'Décoder le VIN'}
        </button>
        <small>
          Interroge le registre NHTSA. Les valeurs sont <strong>proposées</strong>, jamais
          appliquées d’office — et seules les cases encore vides sont remplies.
        </small>

        {propositions && (
          <div className="propositions">
            <h3>Proposé par le registre</h3>
            <dl className="fiche-grille">
              <div className="ligne"><dt>Marque</dt><dd>{texte(propositions.marque)}</dd></div>
              <div className="ligne"><dt>Modèle</dt><dd>{texte(propositions.modele)}</dd></div>
              <div className="ligne"><dt>Année</dt><dd>{propositions.annee ?? '—'}</dd></div>
              <div className="ligne"><dt>Carrosserie</dt><dd>{texte(propositions.carrosserie)}</dd></div>
              <div className="ligne"><dt>Motricité</dt><dd>{texte(propositions.motricite)}</dd></div>
              <div className="ligne"><dt>Transmission</dt><dd>{texte(propositions.transmission)}</dd></div>
              <div className="ligne"><dt>PNBV</dt><dd>{propositions.pnbv ?? '—'}</dd></div>
              <div className="ligne"><dt>Passagers</dt><dd>{propositions.nb_passagers ?? '—'}</dd></div>
            </dl>
            <div className="vehicule-actions">
              <button type="button" className="bouton-secondaire" onClick={appliquerPropositions}>
                Reporter dans le formulaire
              </button>
              <button type="button" className="bouton-discret" onClick={() => setPropositions(null)}>
                Ignorer
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bloc">
        <h2>Caractéristiques</h2>
        <p className="note sans-marge">
          Chaque champ s’enregistre dès que vous le quittez. Vous pouvez vous arrêter
          et reprendre plus tard — quelqu’un d’autre aussi.
        </p>
        <div className="grille">
          {champTexte('km', 'Kilométrage', undefined, 'number')}
          {champTexte('transmission', 'Transmission', TRANSMISSIONS.map((t) => t.valeur))}
          {champTexte('motricite', 'Motricité', MOTRICITES.map((m) => m.valeur))}
          {champTexte('couleur_exterieur', 'Couleur extérieure')}
          {champTexte('couleur_interieur', 'Couleur intérieure')}
          {champTexte('nb_clefs', 'Nombre de clés', undefined, 'number')}
          {champTexte('nb_passagers', 'Passagers', undefined, 'number')}
          {champTexte('pnbv', 'PNBV', undefined, 'number')}
          {champTexte('trim', 'Version')}
          {champTexte('etat_carrosserie', 'Carrosserie', ETATS_CARROSSERIE)}
          {champTexte('etat_pare_brise', 'Pare-brise', ETATS_PARE_BRISE)}
        </div>
        <label className="champ">
          <span>Notes</span>
          <textarea
            rows={3}
            value={valeurs.notes ?? ''}
            onChange={(e) => setValeurs((x) => ({ ...x, notes: e.target.value }))}
            onBlur={(e) => enregistrerChamp('notes', e.target.value)}
          />
        </label>
      </section>

      <section className="bloc">
        <h2>Équipements</h2>
        {parCategorie.map(([categorie, liste]) => (
          <div key={categorie} className="categorie">
            <h3>{categorie}</h3>
            <div className="cases">
              {liste.map((e) => (
                <label key={e.equipement_id} className="case">
                  <input
                    type="checkbox"
                    checked={e.coche}
                    onChange={(ev) => basculerEquipement(e.equipement_id, ev.target.checked)}
                  />
                  <span>{e.equipement}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="bloc">
        <h2>Pneus</h2>
        {POSITIONS_PNEU.map(({ valeur, libelle }) => {
          const actuel = pneu(valeur)
          return (
            <form
              key={valeur}
              className="pneu"
              onSubmit={(e) => { e.preventDefault(); enregistrerPneu(valeur, e.currentTarget) }}
            >
              <h3>{libelle}</h3>
              <div className="grille">
                <label className="champ">
                  <span>Largeur</span>
                  <input name="largeur" type="number" inputMode="numeric"
                         defaultValue={actuel?.largeur ?? ''} />
                </label>
                <label className="champ">
                  <span>Ratio</span>
                  <input name="ratio" type="number" inputMode="numeric"
                         defaultValue={actuel?.ratio ?? ''} />
                </label>
                <label className="champ">
                  <span>Diamètre</span>
                  <input name="diametre" type="number" inputMode="numeric"
                         defaultValue={actuel?.diametre ?? ''} />
                </label>
                <label className="champ">
                  <span>Type</span>
                  <select name="type_pneu" defaultValue={actuel?.type_pneu ?? ''}>
                    <option value="">Choisir…</option>
                    {TYPES_PNEU.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="champ">
                  <span>Roues</span>
                  <select name="roues" defaultValue={actuel?.roues ?? ''}>
                    <option value="">Choisir…</option>
                    {TYPES_ROUES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="bouton-secondaire"
                      disabled={action === `pneu-${valeur}`}>
                {action === `pneu-${valeur}` ? 'Enregistrement…' : `Enregistrer les ${libelle.toLowerCase()}`}
              </button>
            </form>
          )
        })}
      </section>

      <section className="bloc">
        <h2>Photos</h2>
        <label className="champ champ-fichier">
          <span>Photos du véhicule</span>
          <input type="file" accept="image/*" capture="environment" multiple
                 onChange={(e) => televerserPhotos(e.target.files, 'photo')}
                 disabled={action === 'photo-photo'} />
          <small>
            Servent à l’affichage temporaire sur le site en attendant les photos
            professionnelles. Au moins une est exigée pour compléter la feuille.
          </small>
        </label>

        <label className="champ champ-fichier">
          <span>Photos des dommages</span>
          <input type="file" accept="image/*" capture="environment" multiple
                 onChange={(e) => televerserPhotos(e.target.files, 'dommage')}
                 disabled={action === 'photo-dommage'} />
        </label>
      </section>

      <section className="bloc">
        <h2>Terminer</h2>
        {v.feuille_complete_le ? (
          <p className="note sans-marge">
            Feuille complétée le {date(v.feuille_complete_le)}.
          </p>
        ) : (
          <p className="note sans-marge">
            La base vérifie qu’il ne manque rien — kilométrage, transmission, motricité,
            couleur extérieure, nombre de clés, pneus principaux et au moins une photo.
          </p>
        )}

        <div className="vehicule-actions">
          <button
            type="button"
            className="bouton-principal"
            disabled={action !== null}
            onClick={async () => {
              setAction('completer'); setErreur(null); setSucces(null)
              const { error } = await supabase.rpc('completer_feuille', { p_vehicule: v.id })
              if (error) setErreur(messageErreur(error))
              else { await charger(); setSucces('Feuille complétée.') }
              setAction(null)
            }}
          >
            {action === 'completer' ? 'Vérification…' : 'Compléter la feuille'}
          </button>

          <button
            type="button"
            className="bouton-secondaire"
            disabled={action !== null}
            onClick={async () => {
              setAction('service'); setErreur(null); setSucces(null)
              const { error } = await supabase.rpc('envoyer_au_service', { p_vehicule: v.id })
              if (error) setErreur(messageErreur(error))
              else {
                await charger()
                setSucces('Véhicule envoyé au service. Le courriel partira à la prochaine passe de n8n.')
              }
              setAction(null)
            }}
          >
            {action === 'service' ? 'Envoi…' : 'Envoyer au service'}
          </button>
        </div>
      </section>
    </div>
  )
}
