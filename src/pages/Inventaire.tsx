import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { argent, nombre, texte } from '../lib/format'
import { classeStatut, classeEtatVente, familleStatut, libelleVente } from '../lib/statuts'
import type { FamilleStatut } from '../lib/statuts'

/** Une file nommée de l'inventaire : un compteur qui est aussi une destination. */
type File = {
  cle: string
  libelle: string
  compte: number
  actif: boolean
  aller: () => void
  /** Teinte du chiffre. « critique » est le seul rouge de l'écran. */
  ton?: FamilleStatut | 'critique'
}
import type { Statut, VehiculeApp } from '../lib/types'

const ATTENTE_RECEPTION = 'ATTENTE DE RÉCEPTION'

type EtatCreation = {
  creation?: { noStock: string; documentsEnEchec: string[] }
}

const LIBELLES_DOCUMENT: Record<string, string> = {
  facture_fournisseur: 'la facture du fournisseur',
  evaluation_echange: "la feuille d'évaluation",
  immatriculation: 'la photo des immatriculations',
}

export function Inventaire() {
  const { aLeDroit } = useMoi()
  const emplacement = useLocation()
  const etat = emplacement.state as EtatCreation | null

  const [vehicules, setVehicules] = useState<VehiculeApp[]>([])
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  // Les filtres vivent dans l'URL : l'accueil peut donc pointer droit sur une
  // file, et un lien se partage ou se met en favori.
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const statutChoisi = params.get('statut') ?? ''
  const critiquesSeulement = params.get('critiques') === '1'
  const saaqSeulement = params.get('saaq') === '1'
  const venduSeulement = params.get('vendu') === '1'

  function filtrer(suivant: { statut?: string; critiques?: boolean; saaq?: boolean; vendu?: boolean }) {
    const p = new URLSearchParams()
    if (suivant.statut) p.set('statut', suivant.statut)
    if (suivant.critiques) p.set('critiques', '1')
    if (suivant.saaq) p.set('saaq', '1')
    if (suivant.vendu) p.set('vendu', '1')
    setParams(p, { replace: true })
  }

  const charger = useCallback(async () => {
    setErreur(null)

    const [reponseVehicules, reponseStatuts] = await Promise.all([
      supabase
        .from('v_vehicule_app')
        .select('*')
        .order('statut_ordre', { ascending: true })
        .order('no_stock', { ascending: true }),
      supabase.from('statut_vehicule').select('id, nom, ordre').order('ordre'),
    ])

    if (reponseVehicules.error) {
      setErreur(messageErreur(reponseVehicules.error))
      setChargement(false)
      return
    }

    setVehicules((reponseVehicules.data ?? []) as unknown as VehiculeApp[])
    setStatuts((reponseStatuts.data ?? []) as Statut[])
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  async function marquerRecu(vehicule: VehiculeApp) {
    setEnCours(vehicule.id)
    setErreur(null)

    const { error } = await supabase.rpc('recevoir_vehicule', { p_vehicule: vehicule.id })
    if (error) {
      setErreur(messageErreur(error))
      setEnCours(null)
      return
    }

    await charger()
    setEnCours(null)
  }

  const affiches = useMemo(() => {
    const terme = recherche.trim().toUpperCase()
    return vehicules.filter((v) => {
      if (statutChoisi && v.statut !== statutChoisi) return false
      if (critiquesSeulement && v.nb_critiques === 0) return false
      if (saaqSeulement && !(v.requiert_inspection_saaq && !v.saaq_complete_le)) return false
      if (venduSeulement && !v.vente_etat) return false
      if (!terme) return true
      return (
        v.no_stock?.toUpperCase().includes(terme) ||
        v.vin?.toUpperCase().includes(terme) ||
        v.vehicule_titre?.toUpperCase().includes(terme)
      )
    })
  }, [vehicules, recherche, statutChoisi, critiquesSeulement, saaqSeulement, venduSeulement])

  /**
   * Files nommées plutôt que filtres à reconstruire, sur le modèle des pages
   * Airtable que l'équipe utilise déjà. Chaque compteur est une destination.
   */
  const files = useMemo(() => {
    const parStatut = (nom: string) => vehicules.filter((v) => v.statut === nom).length
    const base: File[] = [
      { cle: 'tous', libelle: 'Tous', compte: vehicules.length,
        actif: !statutChoisi && !critiquesSeulement && !saaqSeulement && !venduSeulement,
        aller: () => filtrer({}) },
      // Une réparation critique bloque la vente : c'est le seul rouge de l'écran.
      { cle: 'critiques', libelle: 'Alertes critiques',
        compte: vehicules.filter((v) => v.nb_critiques > 0).length,
        ton: 'critique', actif: critiquesSeulement, aller: () => filtrer({ critiques: true }) },
      // La SAAQ est une tâche à faire, pas une panne : orange, pas rouge.
      { cle: 'saaq', libelle: 'SAAQ à faire',
        compte: vehicules.filter((v) => v.requiert_inspection_saaq && !v.saaq_complete_le).length,
        ton: 'attente', actif: saaqSeulement, aller: () => filtrer({ saaq: true }) },
      // Le dossier de vente est un axe à part depuis la refonte des statuts —
      // un véhicule vendu garde son étape opérationnelle réelle (parfois
      // encore « au service » pour sa préparation de livraison), donc cette
      // file se lit sur `vente_etat`, jamais sur `statut`.
      { cle: 'vendu', libelle: 'Vendu', compte: vehicules.filter((v) => v.vente_etat).length,
        ton: 'vente', actif: venduSeulement, aller: () => filtrer({ vendu: true }) },
    ]
    // Les statuts opérationnels que l'équipe suit au quotidien dans Airtable.
    const suivis = [ATTENTE_RECEPTION, 'VÉHICULE REÇU', 'DISPONIBLE', 'WHOLESALE', 'DÉMO', 'COURTOISIE']
    for (const nom of suivis) {
      const compte = parStatut(nom)
      if (compte === 0 && statutChoisi !== nom) continue
      base.push({
        cle: nom, libelle: nom, compte,
        // Le compteur porte la teinte de sa famille : la tuile et la pastille
        // du véhicule disent alors la même chose, ce qui évite de réapprendre
        // un code de couleurs par écran.
        ton: familleStatut(nom),
        actif: statutChoisi === nom, aller: () => filtrer({ statut: nom }),
      })
    }
    return base
  }, [vehicules, statutChoisi, critiquesSeulement, saaqSeulement, venduSeulement])

  /** Moyennes suivies sur le tableau de bord Airtable. */
  const moyennes = useMemo(() => {
    const moy = (vals: (number | null)[]) => {
      const n = vals.filter((v): v is number => v !== null && v !== undefined)
      return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
    }
    return {
      jours: moy(vehicules.map((v) => v.jours_inventaire)),
      prix: moy(vehicules.map((v) => v.prix_vente)),
      km: moy(vehicules.map((v) => v.km)),
      profit: moy(vehicules.map((v) => v.profit)),
    }
  }, [vehicules])

  const peutRecevoir = aLeDroit('vehicule.recevoir')

  return (
    <div className="page">
      <h1 className="titre-page">Inventaire</h1>

      {etat?.creation && (
        <div className="bandeau-succes">
          <strong>{etat.creation.noStock} a été créé.</strong>
          {etat.creation.documentsEnEchec.length > 0 ? (
            <p>
              Attention : le téléversement de{' '}
              {etat.creation.documentsEnEchec.map((t) => LIBELLES_DOCUMENT[t] ?? t).join(' et de ')}{' '}
              a échoué. Le véhicule est bien enregistré — la pièce reste à joindre.
            </p>
          ) : (
            <p>Le véhicule attend maintenant sa réception.</p>
          )}
        </div>
      )}

      <div className="compteurs">
        {files.map((f) => (
          <button
            key={f.cle}
            type="button"
            className={`compteur ${f.ton ? `ton-${f.ton}` : ''} ${f.actif ? 'actif' : ''}`}
            onClick={f.aller}
          >
            <span className="chiffre">{f.compte}</span>
            <span className="etiquette">{f.libelle}</span>
          </button>
        ))}
      </div>

      <div className="moyennes">
        <span><strong>{nombre(moyennes.jours)}</strong> jours en moyenne</span>
        <span><strong>{argent(moyennes.prix)}</strong> prix de vente moyen</span>
        <span><strong>{nombre(moyennes.km)}</strong> km en moyenne</span>
        {moyennes.profit !== null && (
          <span><strong>{argent(moyennes.profit)}</strong> profit moyen</span>
        )}
      </div>

      <div className="barre-outils">
        <input
          className="recherche"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un numéro de stock, un VIN, un modèle…"
        />
        <select
          className="filtre"
          value={statutChoisi}
          onChange={(e) => filtrer({ statut: e.target.value })}
        >
          <option value="">Tous les statuts</option>
          {statuts.map((s) => (
            <option key={s.id} value={s.nom}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      {erreur && <p className="message-erreur">{erreur}</p>}

      {chargement ? (
        <p className="note">Chargement…</p>
      ) : (
        <>
          <p className="note resultat">
            {affiches.length} véhicule{affiches.length > 1 ? 's' : ''} affiché
            {affiches.length > 1 ? 's' : ''}
          </p>

          <ul className="liste-vehicules">
            {affiches.map((v) => (
              <li key={v.id} className="vehicule">
                <div className="vehicule-entete">
                  <Link to={`/vehicule/${v.id}`} className="no-stock lien-stock">
                    {v.no_stock}
                  </Link>
                  <span className="badges-statut">
                    <span className={classeStatut(v.statut)}>{v.statut}</span>
                    {v.disponible_depuis && v.statut !== 'DISPONIBLE' && !v.vente_etat && (
                      <span className="statut statut-disponible">Disponible</span>
                    )}
                    {v.vente_etat && (
                      <span className={classeEtatVente(v.vente_etat)}>{libelleVente(v)}</span>
                    )}
                  </span>
                </div>

                <div className="vehicule-titre">{v.vehicule_titre}</div>

                <dl className="vehicule-details">
                  <div>
                    <dt>VIN</dt>
                    <dd>{texte(v.vin)}</dd>
                  </div>
                  <div>
                    <dt>Kilométrage</dt>
                    <dd>{nombre(v.km, ' km')}</dd>
                  </div>
                  <div>
                    <dt>Prix de vente</dt>
                    <dd>{argent(v.prix_vente)}</dd>
                  </div>
                  {v.prix_achat !== null && (
                    <div>
                      <dt>Prix d’achat</dt>
                      <dd>{argent(v.prix_achat)}</dd>
                    </div>
                  )}
                  {v.jours_inventaire !== null && (
                    <div>
                      <dt>En inventaire</dt>
                      <dd>{nombre(v.jours_inventaire, ' j')}</dd>
                    </div>
                  )}
                  {v.feuille_pourcentage !== null && (
                    <div>
                      <dt>Feuille</dt>
                      <dd>{nombre(v.feuille_pourcentage, ' %')}</dd>
                    </div>
                  )}
                </dl>

                {v.alertes && (
                  <p className={`alerte ${v.nb_critiques > 0 ? 'critique' : ''}`}>{v.alertes}</p>
                )}

                <div className="vehicule-actions">
                  {/* La fiche est le seul endroit où l'on modifie un véhicule :
                      elle doit s'annoncer, pas se deviner. */}
                  <Link to={`/vehicule/${v.id}`} className="bouton-secondaire">
                    Ouvrir la fiche
                  </Link>

                  {v.statut === ATTENTE_RECEPTION && peutRecevoir && (
                    <button
                      type="button"
                      className="bouton-secondaire"
                      onClick={() => marquerRecu(v)}
                      disabled={enCours === v.id}
                    >
                      {enCours === v.id ? 'Enregistrement…' : 'Marquer reçu'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {affiches.length === 0 && <p className="note">Aucun véhicule ne correspond.</p>}
        </>
      )}
    </div>
  )
}
