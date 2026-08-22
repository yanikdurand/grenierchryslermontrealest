import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { argent, nombre, texte } from '../lib/format'
import { classeStatut } from '../lib/statuts'
import type { DemandeTravauxApp, FileService } from '../lib/types'

/**
 * File de travail du service — l'écran de Catherine, à l'atelier.
 *
 * `v_file_service_app` place les véhicules en attente d'autorisation en tête :
 * c'est ce qui bloque le service, donc ce qu'il faut voir en premier.
 */
export function Service() {
  const { aLeDroit } = useMoi()
  const [file, setFile] = useState<FileService[]>([])
  const [demandes, setDemandes] = useState<DemandeTravauxApp[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const voitDemandes = aLeDroit('travaux.completer') || aLeDroit('travaux.gerer')

  const charger = useCallback(async () => {
    const [f, d] = await Promise.all([
      supabase.from('v_file_service_app').select('*'),
      voitDemandes
        ? supabase.from('v_demande_travaux_app').select('*').eq('statut', 'envoyee')
            .order('envoyee_le')
        : Promise.resolve({ data: [], error: null }),
    ])
    if (f.error) setErreur(messageErreur(f.error))
    else if (d.error) setErreur(messageErreur(d.error))
    setFile((f.data ?? []) as unknown as FileService[])
    setDemandes((d.data ?? []) as unknown as DemandeTravauxApp[])
    setChargement(false)
  }, [voitDemandes])

  useEffect(() => { charger() }, [charger])

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">File du service</h1>
      <p className="intro-page">
        Les véhicules envoyés au service. Ceux en attente d’autorisation sont en tête —
        ce sont eux qui bloquent le travail.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      {voitDemandes && demandes.length > 0 && (
        <section className="bloc">
          <h2>
            Demandes de travaux du concessionnaire
            <span className="compte-etape">{demandes.length} en attente</span>
          </h2>
          <ul className="liste-vehicules">
            {demandes.map((d) => (
              <li key={d.id} className="carte-travaux">
                <div className="vehicule-entete">
                  <Link to={`/vehicule/${d.vehicule_id}/travaux`} className="no-stock lien-stock">
                    {d.no_stock}
                  </Link>
                  <span className={classeStatut(d.statut_vehicule)}>{texte(d.statut_vehicule)}</span>
                </div>
                <div className="vehicule-titre">{texte(d.vehicule_titre)}</div>
                <dl className="vehicule-details">
                  <div><dt>Tâches</dt><dd>{nombre(d.nb_completees)} / {nombre(d.nb_lignes)} faites</dd></div>
                  <div><dt>Envoyée par</dt><dd>{texte(d.envoyee_par_nom)}</dd></div>
                </dl>
                {d.notes && <p className="note sans-marge">{d.notes}</p>}
                <div className="vehicule-actions">
                  <Link to={`/vehicule/${d.vehicule_id}/travaux`} className="bouton-secondaire">
                    Ouvrir la demande
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {file.length === 0 ? (
        <p className="note">
          Aucun véhicule dans la file. Ils y entrent lorsque la feuille d’équipements
          est complétée et le véhicule envoyé au service.
        </p>
      ) : (
        <ul className="liste-vehicules">
          {file.map((f) => (
            <li key={f.vehicule_id} className="vehicule">
              <div className="vehicule-entete">
                <Link to={`/vehicule/${f.vehicule_id}/inspection`} className="no-stock lien-stock">
                  {f.no_stock}
                </Link>
                <span className={classeStatut(f.statut_vehicule)}>{f.statut_vehicule}</span>
              </div>

              <div className="vehicule-titre">{texte(f.vehicule)}</div>

              <dl className="vehicule-details">
                <div>
                  <dt>Autorisation</dt>
                  <dd>{texte(f.statut_autorisation)}</dd>
                </div>
                <div>
                  <dt>Lignes</dt>
                  <dd>{nombre(f.nb_lignes)}</dd>
                </div>
                <div>
                  <dt>En attente de décision</dt>
                  <dd>{nombre(f.nb_en_attente)}</dd>
                </div>
                <div>
                  <dt>À faire</dt>
                  <dd>{nombre(f.base_a_faire)}</dd>
                </div>
                {f.cout_base_a_venir !== null && (
                  <div>
                    <dt>Coût à venir</dt>
                    <dd>{argent(f.cout_base_a_venir)}</dd>
                  </div>
                )}
                <div>
                  <dt>En inventaire</dt>
                  <dd>{nombre(f.jours_inventaire, ' j')}</dd>
                </div>
              </dl>

              {f.requiert_inspection_saaq && !f.saaq_complete_le && (
                <p className="alerte critique">
                  Inspection SAAQ requise — sans elle, impossible de plaquer le véhicule.
                </p>
              )}

              {f.nb_demandes_garantie_ouvertes > 0 && (
                <p className="note-alerte">
                  {f.nb_demandes_garantie_ouvertes} vérification{f.nb_demandes_garantie_ouvertes > 1 ? 's' : ''}{' '}
                  de garantie demandée{f.nb_demandes_garantie_ouvertes > 1 ? 's' : ''} par la direction, sans réponse.
                </p>
              )}

              <div className="vehicule-actions">
                <Link to={`/vehicule/${f.vehicule_id}/inspection`} className="bouton-secondaire">
                  Ouvrir l’inspection
                </Link>
                <Link to={`/vehicule/${f.vehicule_id}`} className="bouton-secondaire">
                  Fiche du véhicule
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
