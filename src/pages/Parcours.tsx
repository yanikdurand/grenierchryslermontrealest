import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { nombre, texte } from '../lib/format'

type Goulot = {
  no_stock: string
  vehicule: string | null
  statut: string | null
  etape_bloquante: string | null
  jours_a_cette_etape: number | null
}

type Delai = {
  no_stock: string
  jours_achat_reception: number | null
  jours_reception_feuille: number | null
  jours_feuille_service: number | null
  jours_service_en_ligne: number | null
  jours_total: number | null
}

/**
 * Un véhicule encore en préparation est actionnable : quelqu'un doit s'en
 * occuper. Un véhicule déjà DISPONIBLE dont la feuille manque se vend malgré
 * tout — sa feuille a été faite dans Airtable, pas ici. Mélanger les deux
 * ferait crier au loup sur 75 véhicules qui vont très bien.
 */
const EN_PREPARATION = [
  'ATTENTE DE RÉCEPTION', 'VÉHICULE REÇU', 'PRÊT À INSPECTER', 'INSPECTION',
  'MÉCANIQUE INTERNE', 'MÉCANIQUE EXTERNE', 'CARROSSERIE EXTERNE', 'SAAQ À FAIRE',
]

/** Au-delà, l'étape mérite qu'on regarde. */
const SEUIL_ALERTE = 5

export function Parcours() {
  const [goulots, setGoulots] = useState<Goulot[]>([])
  const [delais, setDelais] = useState<Delai[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [toutVoir, setToutVoir] = useState(false)

  const charger = useCallback(async () => {
    const [g, d] = await Promise.all([
      supabase.from('v_goulots').select('*').order('jours_a_cette_etape', { ascending: false }),
      supabase.from('v_delai_mise_en_marche').select('*'),
    ])
    if (g.error) setErreur(messageErreur(g.error))
    setGoulots((g.data ?? []) as unknown as Goulot[])
    setDelais((d.data ?? []) as unknown as Delai[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const enPreparation = useMemo(
    () => goulots.filter((g) => g.statut && EN_PREPARATION.includes(g.statut)),
    [goulots]
  )

  const affiches = toutVoir ? goulots : enPreparation

  const parEtape = useMemo(() => {
    const groupes = new Map<string, Goulot[]>()
    for (const g of affiches) {
      const cle = g.etape_bloquante ?? 'Indéterminé'
      groupes.set(cle, [...(groupes.get(cle) ?? []), g])
    }
    return [...groupes.entries()]
      .map(([etape, liste]) => ({
        etape,
        liste: liste.sort((a, b) => (b.jours_a_cette_etape ?? 0) - (a.jours_a_cette_etape ?? 0)),
        pire: Math.max(...liste.map((l) => l.jours_a_cette_etape ?? 0)),
      }))
      .sort((a, b) => b.liste.length - a.liste.length)
  }, [affiches])

  /** Moyennes de mise en marché, sur les véhicules qui ont franchi l'étape. */
  const moyennes = useMemo(() => {
    const moy = (champ: keyof Delai) => {
      const n = delais.map((d) => d[champ]).filter((v): v is number => typeof v === 'number')
      return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
    }
    return {
      reception: moy('jours_achat_reception'),
      feuille: moy('jours_reception_feuille'),
      service: moy('jours_feuille_service'),
      enLigne: moy('jours_service_en_ligne'),
      total: moy('jours_total'),
    }
  }, [delais])

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Parcours</h1>
      <p className="intro-page">
        Où chaque véhicule est bloqué, et depuis combien de temps. Un véhicule reçu
        qui n’avance pas ne se voit nulle part ailleurs.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      <section className="bloc">
        <h2>Délais moyens de mise en marché</h2>
        <dl className="fiche-grille">
          <div className="ligne"><dt>Achat → réception</dt>
            <dd>{nombre(moyennes.reception, ' j')}</dd></div>
          <div className="ligne"><dt>Réception → feuille</dt>
            <dd>{nombre(moyennes.feuille, ' j')}</dd></div>
          <div className="ligne"><dt>Feuille → service</dt>
            <dd>{nombre(moyennes.service, ' j')}</dd></div>
          <div className="ligne"><dt>Service → en ligne</dt>
            <dd>{nombre(moyennes.enLigne, ' j')}</dd></div>
          <div className="ligne"><dt>Total</dt>
            <dd><strong>{nombre(moyennes.total, ' j')}</strong></dd></div>
        </dl>
        <p className="note">
          Calculé sur les véhicules ayant franchi chaque étape. Les véhicules migrés
          d’Airtable n’ont pas tous d’historique complet.
        </p>
      </section>

      <div className="barre-outils">
        <label className="case">
          <input
            type="checkbox"
            checked={toutVoir}
            onChange={(e) => setToutVoir(e.target.checked)}
          />
          <span>
            Inclure les véhicules déjà disponibles
            {' '}({goulots.length - enPreparation.length})
          </span>
        </label>
      </div>

      {!toutVoir && goulots.length > enPreparation.length && (
        <p className="note sans-marge">
          {goulots.length - enPreparation.length} véhicules déjà disponibles sont masqués :
          leur feuille a été remplie dans Airtable, pas ici. Ils se vendent normalement.
        </p>
      )}

      {parEtape.length === 0 ? (
        <p className="note">Aucun véhicule bloqué. Tout avance.</p>
      ) : (
        parEtape.map(({ etape, liste, pire }) => (
          <section key={etape} className="bloc">
            <h2>
              {etape}
              <span className="compte-etape">
                {liste.length} véhicule{liste.length > 1 ? 's' : ''}
                {pire >= SEUIL_ALERTE && ` · le plus ancien depuis ${pire} jours`}
              </span>
            </h2>

            <div className="tableau-defilant">
              <table className="tableau">
                <thead>
                  <tr><th>Stock</th><th>Véhicule</th><th>Statut</th><th>Jours à cette étape</th></tr>
                </thead>
                <tbody>
                  {liste.map((g) => (
                    <tr key={g.no_stock}>
                      <td><strong>{g.no_stock}</strong></td>
                      <td className="discret">{texte(g.vehicule)}</td>
                      <td>{texte(g.statut)}</td>
                      <td className={(g.jours_a_cette_etape ?? 0) >= SEUIL_ALERTE ? 'jours-alerte' : ''}>
                        {nombre(g.jours_a_cette_etape)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <p className="note">
        <Link to="/inventaire">Retour à l’inventaire</Link>
      </p>
    </div>
  )
}
