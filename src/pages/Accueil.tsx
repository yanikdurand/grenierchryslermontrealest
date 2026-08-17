import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { nombre } from '../lib/format'
import type { VehiculeApp } from '../lib/types'

const ATTENTE_RECEPTION = 'ATTENTE DE RÉCEPTION'
const RECU = 'VÉHICULE REÇU'

/** Au-delà, un véhicule reçu qui n'avance pas mérite qu'on le signale. */
const JOURS_DORMANT = 3

type Tache = {
  cle: string
  titre: string
  compte: number
  detail: string
  lien: string
  urgent?: boolean
}

export function Accueil() {
  const { utilisateur, aLeDroit } = useMoi()
  const [vehicules, setVehicules] = useState<VehiculeApp[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('v_vehicule_app').select('*')
    if (error) setErreur(messageErreur(error))
    else setVehicules((data ?? []) as unknown as VehiculeApp[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  /**
   * Chacun voit ce qui lui revient. Un vendeur n'a rien à faire ici, un
   * gestionnaire a des feuilles à remplir, un aviseur une file de service.
   */
  const taches = useMemo<Tache[]>(() => {
    const liste: Tache[] = []

    const aRecevoir = vehicules.filter((v) => v.statut === ATTENTE_RECEPTION)
    const sansFeuille = vehicules.filter(
      (v) => v.statut === RECU && !v.feuille_complete_le
    )
    const dormants = sansFeuille.filter(
      (v) => (v.jours_inventaire ?? 0) >= JOURS_DORMANT
    )
    const saaq = vehicules.filter(
      (v) => v.requiert_inspection_saaq && !v.saaq_complete_le
    )
    const critiques = vehicules.filter((v) => v.nb_critiques > 0)

    if (aLeDroit('vehicule.recevoir') && aRecevoir.length > 0) {
      liste.push({
        cle: 'recevoir',
        titre: 'À recevoir',
        compte: aRecevoir.length,
        detail: 'Achetés, pas encore arrivés physiquement.',
        lien: `/inventaire?statut=${encodeURIComponent(ATTENTE_RECEPTION)}`,
      })
    }

    if (aLeDroit('feuille.saisir') && sansFeuille.length > 0) {
      liste.push({
        cle: 'feuilles',
        titre: 'Feuilles à remplir',
        compte: sansFeuille.length,
        detail: dormants.length > 0
          ? `${dormants.length} attendent depuis ${JOURS_DORMANT} jours ou plus.`
          : 'Reçus, en attente de la feuille d’équipements.',
        lien: `/inventaire?statut=${encodeURIComponent(RECU)}`,
        urgent: dormants.length > 0,
      })
    }

    if (aLeDroit('inspection.saisir') || aLeDroit('inspection.completer')) {
      liste.push({
        cle: 'service',
        titre: 'File du service',
        compte: vehicules.filter((v) => v.statut_autorisation === 'En attente').length,
        detail: 'Inspections à saisir ou réparations à compléter.',
        lien: '/service',
      })
    }

    if (aLeDroit('inspection.approuver')) {
      const aDecider = vehicules.filter((v) => v.statut_autorisation === 'En attente')
      liste.push({
        cle: 'approuver',
        titre: 'À autoriser',
        compte: aDecider.length,
        detail: 'Réparations en attente de votre décision — elles bloquent le service.',
        lien: '/service',
        urgent: aDecider.length > 0,
      })
    }

    if (aLeDroit('saaq.completer') && saaq.length > 0) {
      liste.push({
        cle: 'saaq',
        titre: 'SAAQ à faire',
        compte: saaq.length,
        detail: 'Sans l’inspection, impossible de plaquer le véhicule à la vente.',
        lien: '/inventaire?saaq=1',
        urgent: true,
      })
    }

    if (critiques.length > 0) {
      liste.push({
        cle: 'critiques',
        titre: 'Alertes critiques',
        compte: critiques.length,
        detail: 'Liens existants, SAAQ manquantes, VIN absents.',
        lien: '/inventaire?critiques=1',
        urgent: true,
      })
    }

    return liste
  }, [vehicules, aLeDroit])

  const prenom = utilisateur?.nom?.split(' ')[0] ?? ''

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Bonjour{prenom ? `, ${prenom}` : ''}</h1>
      <p className="intro-page">
        {taches.length === 0
          ? 'Rien ne vous attend aujourd’hui.'
          : 'Voici ce qui vous attend.'}
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      {taches.length > 0 && (
        <ul className="taches">
          {taches.map((t) => (
            <li key={t.cle}>
              <Link to={t.lien} className={`tache ${t.urgent ? 'urgente' : ''}`}>
                <span className="tache-compte">{nombre(t.compte)}</span>
                <span className="tache-corps">
                  <span className="tache-titre">{t.titre}</span>
                  <span className="tache-detail">{t.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="bloc">
        <h2>Accès rapide</h2>
        <div className="vehicule-actions">
          {aLeDroit('vehicule.creer') && (
            <Link to="/acquisition" className="bouton-secondaire">Nouvelle acquisition</Link>
          )}
          <Link to="/inventaire" className="bouton-secondaire">Inventaire complet</Link>
          {(aLeDroit('inspection.saisir') || aLeDroit('inspection.approuver')
            || aLeDroit('inspection.completer')) && (
            <Link to="/service" className="bouton-secondaire">File du service</Link>
          )}
        </div>
      </section>
    </div>
  )
}
