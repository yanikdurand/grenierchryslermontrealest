import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { argent, nombre, texte } from '../lib/format'
import type { FileService } from '../lib/types'

/**
 * File de travail du service — l'écran de Catherine, à l'atelier.
 *
 * `v_file_service_app` place les véhicules en attente d'autorisation en tête :
 * c'est ce qui bloque le service, donc ce qu'il faut voir en premier.
 */
export function Service() {
  const [file, setFile] = useState<FileService[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('v_file_service_app').select('*')
    if (error) setErreur(messageErreur(error))
    else setFile((data ?? []) as unknown as FileService[])
    setChargement(false)
  }, [])

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
                <span className="statut">{f.statut_vehicule}</span>
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
