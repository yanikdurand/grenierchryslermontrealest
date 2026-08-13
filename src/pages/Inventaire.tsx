import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { argent, nombre, texte } from '../lib/format'
import type { Statut, VehiculeApp } from '../lib/types'

const ATTENTE_RECEPTION = 'ATT. RÉCEPTION'

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

  const [recherche, setRecherche] = useState('')
  const [statutChoisi, setStatutChoisi] = useState('')
  const [critiquesSeulement, setCritiquesSeulement] = useState(false)

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
      if (!terme) return true
      return (
        v.no_stock?.toUpperCase().includes(terme) ||
        v.vin?.toUpperCase().includes(terme) ||
        v.vehicule_titre?.toUpperCase().includes(terme)
      )
    })
  }, [vehicules, recherche, statutChoisi, critiquesSeulement])

  const totaux = useMemo(
    () => ({
      total: vehicules.length,
      critiques: vehicules.filter((v) => v.nb_critiques > 0).length,
      aRecevoir: vehicules.filter((v) => v.statut === ATTENTE_RECEPTION).length,
    }),
    [vehicules]
  )

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
        <button
          type="button"
          className={`compteur ${!statutChoisi && !critiquesSeulement ? 'actif' : ''}`}
          onClick={() => {
            setStatutChoisi('')
            setCritiquesSeulement(false)
          }}
        >
          <span className="chiffre">{totaux.total}</span>
          <span className="etiquette">véhicules</span>
        </button>
        <button
          type="button"
          className={`compteur alerte ${critiquesSeulement ? 'actif' : ''}`}
          onClick={() => {
            setCritiquesSeulement(true)
            setStatutChoisi('')
          }}
        >
          <span className="chiffre">{totaux.critiques}</span>
          <span className="etiquette">avec alerte critique</span>
        </button>
        <button
          type="button"
          className={`compteur ${statutChoisi === ATTENTE_RECEPTION ? 'actif' : ''}`}
          onClick={() => {
            setStatutChoisi(ATTENTE_RECEPTION)
            setCritiquesSeulement(false)
          }}
        >
          <span className="chiffre">{totaux.aRecevoir}</span>
          <span className="etiquette">à recevoir</span>
        </button>
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
          onChange={(e) => setStatutChoisi(e.target.value)}
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
                  <span className="statut">{v.statut}</span>
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
