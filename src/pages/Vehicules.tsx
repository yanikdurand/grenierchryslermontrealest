import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import type { VehiculeApp } from '../lib/types'

const STATUT_ATTENTE_RECEPTION = 'ATT. RÉCEPTION'

type EtatCreation = {
  creation?: { noStock: string; documentsEnEchec: string[] }
}

const LIBELLES_DOCUMENT: Record<string, string> = {
  facture_fournisseur: 'la facture du fournisseur',
  evaluation_echange: "la feuille d'évaluation",
  immatriculation: 'la photo des immatriculations',
}

export function Vehicules() {
  const { aLeDroit } = useMoi()
  const emplacement = useLocation()
  const etat = emplacement.state as EtatCreation | null

  const [vehicules, setVehicules] = useState<VehiculeApp[]>([])
  const [justificatifsManquants, setJustificatifsManquants] = useState<Set<string>>(new Set())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [filtreAttente, setFiltreAttente] = useState(true)
  const [enCours, setEnCours] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setErreur(null)

    const { data, error } = await supabase
      .from('v_vehicule_app')
      .select(
        'id, no_stock, vin, vehicule_titre, annee, marque, modele, statut, statut_ordre, fournisseur, fournisseur_autre, km, prix_vente, prix_achat, lien_carfax, lien_existant, lien_existant_note, requiert_inspection_saaq, saaq_complete_le, date_recu, jours_inventaire, nb_alertes, nb_critiques, alertes'
      )
      .order('statut_ordre', { ascending: true })
      .order('no_stock', { ascending: true })
      .limit(500)

    if (error) {
      setErreur(messageErreur(error))
      setChargement(false)
      return
    }

    const liste = (data as VehiculeApp[]) ?? []
    setVehicules(liste)

    // Un téléversement peut avoir échoué après la création du véhicule : on le
    // signale plutôt que d'avoir annulé une acquisition déjà saisie.
    const enAttente = liste.filter((v) => v.statut === STATUT_ATTENTE_RECEPTION).map((v) => v.id)
    if (enAttente.length > 0) {
      const { data: documents } = await supabase
        .from('document')
        .select('vehicule_id, type')
        .in('vehicule_id', enAttente)
        .in('type', ['facture_fournisseur', 'evaluation_echange'])

      const avecJustificatif = new Set((documents ?? []).map((d: { vehicule_id: string }) => d.vehicule_id))
      setJustificatifsManquants(new Set(enAttente.filter((id) => !avecJustificatif.has(id))))
    } else {
      setJustificatifsManquants(new Set())
    }

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
      if (filtreAttente && v.statut !== STATUT_ATTENTE_RECEPTION) return false
      if (!terme) return true
      return (
        v.no_stock?.toUpperCase().includes(terme) ||
        v.vin?.toUpperCase().includes(terme) ||
        v.vehicule_titre?.toUpperCase().includes(terme)
      )
    })
  }, [vehicules, recherche, filtreAttente])

  const peutRecevoir = aLeDroit('vehicule.recevoir')

  return (
    <div className="page">
      <h1 className="titre-page">Véhicules</h1>

      {etat?.creation && (
        <div className="bandeau-succes">
          <strong>{etat.creation.noStock} a été créé.</strong>
          {etat.creation.documentsEnEchec.length > 0 ? (
            <p>
              Attention : le téléversement de{' '}
              {etat.creation.documentsEnEchec
                .map((t) => LIBELLES_DOCUMENT[t] ?? t)
                .join(' et de ')}{' '}
              a échoué. Le véhicule est bien enregistré — la pièce reste à joindre.
            </p>
          ) : (
            <p>Le véhicule attend maintenant sa réception.</p>
          )}
        </div>
      )}

      <div className="barre-outils">
        <input
          className="recherche"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un numéro de stock, un VIN…"
        />
        <label className="case">
          <input
            type="checkbox"
            checked={filtreAttente}
            onChange={(e) => setFiltreAttente(e.target.checked)}
          />
          <span>En attente de réception seulement</span>
        </label>
      </div>

      {erreur && <p className="message-erreur">{erreur}</p>}

      {chargement ? (
        <p className="note">Chargement…</p>
      ) : affiches.length === 0 ? (
        <p className="note">Aucun véhicule ne correspond.</p>
      ) : (
        <ul className="liste-vehicules">
          {affiches.map((v) => (
            <li key={v.id} className="vehicule">
              <div className="vehicule-entete">
                <span className="no-stock">{v.no_stock}</span>
                <span className="statut">{v.statut}</span>
              </div>

              <div className="vehicule-titre">{v.vehicule_titre}</div>

              <dl className="vehicule-details">
                <div>
                  <dt>VIN</dt>
                  <dd>{v.vin ?? '—'}</dd>
                </div>
                <div>
                  <dt>Fournisseur</dt>
                  <dd>{v.fournisseur_autre || v.fournisseur || '—'}</dd>
                </div>
                {v.prix_achat !== null && (
                  <div>
                    <dt>Prix d’achat</dt>
                    <dd>
                      {v.prix_achat.toLocaleString('fr-CA', {
                        style: 'currency',
                        currency: 'CAD',
                      })}
                    </dd>
                  </div>
                )}
              </dl>

              {(v.alertes || justificatifsManquants.has(v.id)) && (
                <ul className="alertes">
                  {justificatifsManquants.has(v.id) && (
                    <li className="alerte critique">Justificatif d’achat manquant</li>
                  )}
                  {v.alertes && (
                    <li className={v.nb_critiques > 0 ? 'alerte critique' : 'alerte'}>
                      {v.alertes}
                    </li>
                  )}
                </ul>
              )}

              {v.statut === STATUT_ATTENTE_RECEPTION && peutRecevoir && (
                <button
                  type="button"
                  className="bouton-secondaire"
                  onClick={() => marquerRecu(v)}
                  disabled={enCours === v.id}
                >
                  {enCours === v.id ? 'Enregistrement…' : 'Marquer reçu'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
