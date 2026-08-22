import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { argent, nombre, texte } from '../lib/format'

type Ligne = {
  vehicule_id: string
  no_stock: string
  vehicule: string | null
  prix_vente: number | null
  jours_inventaire: number | null
  leads_total: number
  affiche_en_ligne: boolean
  diagnostic: 'prix_ou_visibilite' | 'traitement'
}

/**
 * Amélioration validée #1 du brief : deux problèmes qui se ressemblent en
 * surface (véhicule vieillissant) n'appellent pas la même action. Séparer
 * les deux plutôt que de tout mettre dans une seule liste « ça fait 90
 * jours » — sinon on baisse le prix d'un véhicule dont le vrai problème est
 * le traitement des leads, ou l'inverse.
 */
export function Diagnostic() {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('v_diagnostic_prix_leads').select('*')
    if (error) setErreur(messageErreur(error))
    setLignes((data ?? []) as unknown as Ligne[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const prixOuVisibilite = useMemo(
    () => lignes.filter((l) => l.diagnostic === 'prix_ou_visibilite')
      .sort((a, b) => (b.jours_inventaire ?? 0) - (a.jours_inventaire ?? 0)),
    [lignes]
  )
  const traitement = useMemo(
    () => lignes.filter((l) => l.diagnostic === 'traitement')
      .sort((a, b) => b.leads_total - a.leads_total),
    [lignes]
  )

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Diagnostic prix et leads</h1>
      <p className="intro-page">
        Véhicules disponibles depuis 90 jours ou plus, en deux groupes qui n’appellent
        pas la même action.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      <section className="bloc">
        <h2>
          Problème de prix ou de visibilité
          <span className="compte-etape">{prixOuVisibilite.length} véhicule{prixOuVisibilite.length > 1 ? 's' : ''}</span>
        </h2>
        <p className="note sans-marge">
          Aucun lead depuis 90 jours — le prix ou la visibilité en ligne est probablement
          en cause, pas le traitement des demandes.
        </p>
        {prixOuVisibilite.length === 0 ? (
          <p className="note">Aucun véhicule dans ce cas.</p>
        ) : (
          <div className="tableau-defilant espace-haut">
            <table className="tableau">
              <thead>
                <tr><th>Stock</th><th>Véhicule</th><th>Prix</th><th>En inventaire</th><th>En ligne</th></tr>
              </thead>
              <tbody>
                {prixOuVisibilite.map((l) => (
                  <tr key={l.vehicule_id}>
                    <td>
                      <Link to={`/vehicule/${l.vehicule_id}`} className="lien-stock">
                        <strong>{l.no_stock}</strong>
                      </Link>
                    </td>
                    <td className="discret">{texte(l.vehicule)}</td>
                    <td>{argent(l.prix_vente)}</td>
                    <td className="jours-alerte">{nombre(l.jours_inventaire, ' j')}</td>
                    <td>{l.affiche_en_ligne ? 'Oui' : 'Non'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bloc">
        <h2>
          Problème de traitement ou de présentation
          <span className="compte-etape">{traitement.length} véhicule{traitement.length > 1 ? 's' : ''}</span>
        </h2>
        <p className="note sans-marge">
          15 leads ou plus sans vente — le prix et la visibilité fonctionnent, la
          conversion non. À revoir : rappels, présentation, disponibilité pour essai.
        </p>
        {traitement.length === 0 ? (
          <p className="note">Aucun véhicule dans ce cas.</p>
        ) : (
          <div className="tableau-defilant espace-haut">
            <table className="tableau">
              <thead>
                <tr><th>Stock</th><th>Véhicule</th><th>Prix</th><th>En inventaire</th><th>Leads</th></tr>
              </thead>
              <tbody>
                {traitement.map((l) => (
                  <tr key={l.vehicule_id}>
                    <td>
                      <Link to={`/vehicule/${l.vehicule_id}`} className="lien-stock">
                        <strong>{l.no_stock}</strong>
                      </Link>
                    </td>
                    <td className="discret">{texte(l.vehicule)}</td>
                    <td>{argent(l.prix_vente)}</td>
                    <td>{nombre(l.jours_inventaire, ' j')}</td>
                    <td className="jours-alerte">{nombre(l.leads_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
