import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { argent, date, dateCourte, decision as libelleDecision, nombre, texte } from '../lib/format'
import type {
  ChangementDecision, CodeReparation, Decision, InspectionStatut,
  LigneInspection, VehiculeApp,
} from '../lib/types'

/**
 * La garantie n'est plus une décision du directeur : c'est l'aviseur qui la
 * détermine en bâtissant l'inspection (case « Sous garantie », plus bas),
 * après avoir vérifié la couverture et appelé le concessionnaire de la
 * marque. Il ne reste donc que trois décisions ici.
 */
const DECISIONS: { valeur: Decision; libelle: string; aide: string }[] = [
  { valeur: 'ne_pas_faire', libelle: 'Ne pas faire', aide: 'On ne la fait pas.' },
  { valeur: 'de_base', libelle: 'De base', aide: 'Faite maintenant — gruge la marge du véhicule.' },
  { valeur: 'signature', libelle: 'Signature', aide: 'Seulement si le client achète le programme Signature.' },
]

export function Inspection() {
  const { id } = useParams<{ id: string }>()
  const { aLeDroit } = useMoi()

  const [vehicule, setVehicule] = useState<VehiculeApp | null>(null)
  const [statut, setStatut] = useState<InspectionStatut | null>(null)
  const [lignes, setLignes] = useState<LigneInspection[]>([])
  const [codes, setCodes] = useState<CodeReparation[]>([])
  const [historique, setHistorique] = useState<ChangementDecision[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)

  const peutSaisir = aLeDroit('inspection.saisir')
  const peutApprouver = aLeDroit('inspection.approuver')
  const peutCompleter = aLeDroit('inspection.completer')
  const peutSaaq = aLeDroit('saaq.completer')
  const peutGarantie = aLeDroit('inspection.garantie')

  const charger = useCallback(async () => {
    if (!id) return
    setErreur(null)

    const [v, s, c] = await Promise.all([
      supabase.from('v_vehicule_app').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_inspection_statut_app').select('*').eq('vehicule_id', id)
        .order('cree_le', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('code_reparation').select('id, code, description').order('id'),
    ])

    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Véhicule introuvable.')
      setChargement(false)
      return
    }

    setVehicule(v.data as unknown as VehiculeApp)
    setCodes((c.data ?? []) as CodeReparation[])

    const inspection = (s.data ?? null) as unknown as InspectionStatut | null
    setStatut(inspection)

    if (inspection) {
      const { data: l } = await supabase
        .from('inspection_ligne')
        .select(`id, no_ligne, description, code_reparation_id, cout, complete, complete_le,
                 decision, decide_le, sous_garantie, garantie_lieu, garantie_rdv,
                 garantie_parti_le, garantie_retour_le`)
        .eq('inspection_id', inspection.inspection_id)
        .order('no_ligne')
      const listeLignes = (l ?? []) as LigneInspection[]
      setLignes(listeLignes)

      if (listeLignes.length > 0) {
        const { data: h } = await supabase
          .from('decision_historique')
          .select('id, inspection_ligne_id, decision_avant, decision_apres, change_le, motif')
          .in('inspection_ligne_id', listeLignes.map((x) => x.id))
          .order('change_le', { ascending: false })
        setHistorique((h ?? []) as ChangementDecision[])
      } else {
        setHistorique([])
      }
    } else {
      setLignes([])
      setHistorique([])
    }

    setChargement(false)
  }, [id])

  useEffect(() => { charger() }, [charger])

  async function creerInspection() {
    if (!id) return
    setAction('creer'); setErreur(null)
    const { error } = await supabase.from('inspection').insert({ vehicule_id: id })
    if (error) setErreur(messageErreur(error))
    else { await charger(); setSucces('Inspection créée.') }
    setAction(null)
  }

  async function ajouterLigne(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!statut) return

    const form = e.currentTarget
    const donnees = new FormData(form)
    const description = String(donnees.get('description') ?? '').trim()
    if (!description) return

    setAction('ajouter'); setErreur(null)

    const coutBrut = String(donnees.get('cout') ?? '').trim()
    const codeBrut = String(donnees.get('code') ?? '').trim()

    const { error } = await supabase.from('inspection_ligne').insert({
      inspection_id: statut.inspection_id,
      no_ligne: lignes.reduce((max, l) => Math.max(max, l.no_ligne ?? 0), 0) + 1,
      description,
      cout: coutBrut === '' ? null : Number(coutBrut),
      code_reparation_id: codeBrut === '' ? null : Number(codeBrut),
      ...(peutGarantie ? { sous_garantie: donnees.get('sous_garantie') === 'on' } : {}),
    })

    if (error) setErreur(messageErreur(error))
    else { form.reset(); await charger() }
    setAction(null)
  }

  /**
   * `decide_par` et `complete_par` sont estampillés par trigger à partir de la
   * session (brief §6.2) : on ne les envoie pas.
   */
  async function decider(ligne: LigneInspection, valeur: Decision) {
    setAction(`decision-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase
      .from('inspection_ligne').update({ decision: valeur }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  async function basculerComplete(ligne: LigneInspection) {
    setAction(`complete-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase
      .from('inspection_ligne').update({ complete: !ligne.complete }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  /** Cocher pose la garantie ; décocher rend la ligne au directeur (§ trigger). */
  async function basculerGarantie(ligne: LigneInspection) {
    setAction(`garantie-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase
      .from('inspection_ligne').update({ sous_garantie: !ligne.sous_garantie }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  /**
   * Planifier ne déplace rien tout de suite : à l'heure du rendez-vous, une
   * tâche planifiée constate que l'heure est arrivée et fait vraiment partir
   * le véhicule (`garantie_parti_le`, posé côté serveur — jamais ici).
   */
  async function planifierGarantie(ligne: LigneInspection, e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const rdv = String(d.get('rdv') ?? '')
    setAction(`planifier-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase.from('inspection_ligne').update({
      garantie_lieu: String(d.get('lieu') ?? '').trim() || null,
      garantie_rdv: rdv ? new Date(rdv).toISOString() : null,
    }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else { await charger(); setSucces('Rendez-vous planifié. Le véhicule passera en mécanique externe à l’heure prévue.') }
    setAction(null)
  }

  /** Le retour complète la ligne et remet le véhicule où il était (trigger). */
  async function marquerRetour(ligne: LigneInspection) {
    setAction(`retour-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase
      .from('inspection_ligne').update({ garantie_retour_le: new Date().toISOString() }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else { await charger(); setSucces('Retour du véhicule enregistré. La réparation est marquée faite.') }
    setAction(null)
  }

  async function sauverTechnicien(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!statut) return
    const technicien = String(new FormData(e.currentTarget).get('technicien') ?? '').trim()
    setAction('technicien'); setErreur(null)
    const { error } = await supabase
      .from('inspection').update({ technicien: technicien || null }).eq('id', statut.inspection_id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  /** Totaux calculés sur place : ils doivent suivre chaque clic. */
  const totaux = useMemo(() => {
    const somme = (d: Decision) =>
      lignes.filter((l) => l.decision === d).reduce((t, l) => t + (l.cout ?? 0), 0)
    return {
      de_base: somme('de_base'),
      signature: somme('signature'),
      garantie: somme('garantie'),
      en_attente: lignes.filter((l) => l.decision === 'en_attente').length,
    }
  }, [lignes])

  const montantsVisibles = statut?.cout_base_engage !== null && statut !== null

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!vehicule) {
    return (
      <div className="page">
        <p className="message-erreur">{erreur ?? 'Véhicule introuvable.'}</p>
        <Link to="/service" className="bouton-secondaire">Retour à la file</Link>
      </div>
    )
  }

  const v = vehicule

  return (
    <div className="page">
      <Link to="/service" className="retour">← File du service</Link>

      <header className="fiche-entete">
        <div>
          <h1 className="titre-page">{v.no_stock}</h1>
          <p className="fiche-titre">{v.vehicule_titre}</p>
        </div>
        <span className="statut gros">{texte(statut?.statut_autorisation) }</span>
      </header>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      {(v.garantie_complete || v.garantie_motopropulseur || v.garantie_prolongee) ? (
        <section className="bloc">
          <h2>Garanties du véhicule</h2>
          <dl className="fiche-grille">
            {v.garantie_complete && <div className="ligne"><dt>Complète</dt><dd>{v.garantie_complete}</dd></div>}
            {v.garantie_motopropulseur && (
              <div className="ligne"><dt>Motopropulseur</dt><dd>{v.garantie_motopropulseur}</dd></div>
            )}
            {v.garantie_prolongee && (
              <div className="ligne"><dt>Prolongée</dt><dd>{v.garantie_prolongee}</dd></div>
            )}
          </dl>
          <p className="note">
            À vérifier auprès du concessionnaire de la marque avant de désigner une réparation
            sous garantie.
          </p>
        </section>
      ) : (
        <p className="note sans-marge">Aucune information de garantie enregistrée sur ce véhicule.</p>
      )}

      {v.requiert_inspection_saaq && !v.saaq_complete_le && (
        <section className="bloc">
          <h2>Inspection SAAQ</h2>
          <p className="note-alerte">
            Requise et non faite. Le véhicule peut être affiché, mais il ne pourra pas
            être plaqué à la vente tant qu’elle n’est pas complétée.
          </p>
          {peutSaaq ? (
            <button
              type="button" className="bouton-secondaire" disabled={action !== null}
              onClick={async () => {
                setAction('saaq'); setErreur(null); setSucces(null)
                const { error } = await supabase.rpc('completer_saaq', { p_vehicule: v.id })
                if (error) setErreur(messageErreur(error))
                else { await charger(); setSucces('Inspection SAAQ marquée comme faite.') }
                setAction(null)
              }}
            >
              {action === 'saaq' ? 'Enregistrement…' : 'Marquer l’inspection SAAQ faite'}
            </button>
          ) : (
            <p className="note">Seuls Catherine et Philippe peuvent la clore.</p>
          )}
        </section>
      )}

      {!statut ? (
        <section className="bloc">
          <h2>Inspection</h2>
          <p className="note sans-marge">Aucune inspection n’a encore été créée pour ce véhicule.</p>
          {peutSaisir ? (
            <div className="vehicule-actions espace-haut">
              <button type="button" className="bouton-principal"
                      onClick={creerInspection} disabled={action !== null}>
                {action === 'creer' ? 'Création…' : 'Créer l’inspection'}
              </button>
            </div>
          ) : (
            <p className="note">Vous n’avez pas le droit de créer une inspection.</p>
          )}
        </section>
      ) : (
        <>
          <section className="bloc">
            <h2>Sommaire</h2>
            <dl className="fiche-grille">
              <div className="ligne"><dt>Lignes</dt><dd>{nombre(statut.nb_lignes)}</dd></div>
              <div className="ligne"><dt>En attente</dt><dd>{nombre(totaux.en_attente)}</dd></div>
              {montantsVisibles && (
                <>
                  <div className="ligne">
                    <dt>Coût de base</dt><dd>{argent(totaux.de_base)}</dd>
                  </div>
                  <div className="ligne">
                    <dt>Signature potentiel</dt><dd>{argent(totaux.signature)}</dd>
                  </div>
                  <div className="ligne">
                    <dt>Valeur garantie</dt><dd>{argent(totaux.garantie)}</dd>
                  </div>
                </>
              )}
            </dl>
            {montantsVisibles && (
              <p className="note">
                Seul le « de base » complété entre dans le profit du véhicule. Signature
                et garantie n’y entrent jamais.
              </p>
            )}

            {peutSaisir ? (
              <form className="champ espace-haut" onSubmit={sauverTechnicien}>
                <span>Technicien</span>
                <input name="technicien" defaultValue={statut.technicien ?? ''}
                       placeholder="Qui a fait l’inspection" onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
              </form>
            ) : (
              <p className="note sans-marge">Technicien : {texte(statut.technicien)}</p>
            )}
          </section>

          <section className="bloc">
            <h2>Réparations</h2>

            {lignes.length === 0 ? (
              <p className="note sans-marge">Aucune ligne pour l’instant.</p>
            ) : (
              <ul className="lignes-inspection">
                {lignes.map((l) => {
                  const code = codes.find((c) => c.id === l.code_reparation_id)
                  return (
                    <li key={l.id} className={`ligne-inspection ${l.decision}`}>
                      <div className="ligne-tete">
                        <span className="ligne-description">{texte(l.description)}</span>
                        <span className="ligne-cout">{argent(l.cout)}</span>
                      </div>

                      <div className="ligne-meta">
                        {code && <span className={`pastille ${code.code.toLowerCase()}`}>{code.code}</span>}
                        <span className="decision-actuelle">{libelleDecision(l.decision)}</span>
                        {l.complete && <span className="fait">Fait{l.complete_le ? ` le ${dateCourte(l.complete_le)}` : ''}</span>}
                      </div>

                      {peutGarantie && (
                        <label className="case">
                          <input
                            type="checkbox"
                            checked={l.sous_garantie}
                            disabled={action !== null}
                            onChange={() => basculerGarantie(l)}
                          />
                          <span>Sous garantie</span>
                        </label>
                      )}

                      {l.sous_garantie && (
                        <div className="ligne-meta">
                          {l.garantie_lieu && <span>Chez {l.garantie_lieu}</span>}
                          {l.garantie_rdv && (
                            <span>
                              Rendez-vous le {dateCourte(l.garantie_rdv)}
                              {!l.garantie_parti_le && ' — véhicule encore ici'}
                            </span>
                          )}
                          {l.garantie_parti_le && !l.garantie_retour_le && (
                            <span>Parti le {dateCourte(l.garantie_parti_le)}</span>
                          )}
                          {l.garantie_retour_le && (
                            <span className="fait">Revenu le {dateCourte(l.garantie_retour_le)}</span>
                          )}
                        </div>
                      )}

                      {peutGarantie && l.sous_garantie && (
                        <>
                          <form
                            className="formulaire-court"
                            onSubmit={(e) => planifierGarantie(l, e)}
                          >
                            <label className="champ">
                              <span>Lieu</span>
                              <input name="lieu" defaultValue={l.garantie_lieu ?? ''} placeholder="Audi Brossard…" />
                            </label>
                            <label className="champ">
                              <span>Rendez-vous</span>
                              <input
                                name="rdv" type="datetime-local"
                                defaultValue={l.garantie_rdv ? l.garantie_rdv.slice(0, 16) : ''}
                              />
                            </label>
                            <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                              {action === `planifier-${l.id}` ? 'Enregistrement…' : 'Planifier'}
                            </button>
                          </form>
                          {l.garantie_parti_le && !l.garantie_retour_le && (
                            <button
                              type="button" className="bouton-discret" disabled={action !== null}
                              onClick={() => marquerRetour(l)}
                            >
                              {action === `retour-${l.id}` ? 'Enregistrement…' : 'Marquer le retour du véhicule'}
                            </button>
                          )}
                        </>
                      )}

                      {peutApprouver && !l.sous_garantie && (
                        <div className="boutons-decision">
                          {DECISIONS.map((d) => (
                            <button
                              key={d.valeur}
                              type="button"
                              title={d.aide}
                              className={`bouton-decision ${l.decision === d.valeur ? 'choisi' : ''}`}
                              disabled={action !== null}
                              onClick={() => decider(l, d.valeur)}
                            >
                              {d.libelle}
                            </button>
                          ))}
                        </div>
                      )}

                      {peutCompleter && l.decision !== 'en_attente' && l.decision !== 'ne_pas_faire' && (
                        <label className="case">
                          <input
                            type="checkbox"
                            checked={l.complete}
                            disabled={action !== null}
                            onChange={() => basculerComplete(l)}
                          />
                          <span>Réparation faite</span>
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {peutSaisir && (
              <form className="ajout-ligne" onSubmit={ajouterLigne}>
                <h3>Ajouter une réparation</h3>
                <div className="grille">
                  <label className="champ">
                    <span>Description</span>
                    <input name="description" required placeholder="Pneus à changer…" />
                  </label>
                  <label className="champ">
                    <span>Code</span>
                    <select name="code" defaultValue="">
                      <option value="">Aucun</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.description}</option>
                      ))}
                    </select>
                  </label>
                  <label className="champ">
                    <span>Coût estimé</span>
                    <input name="cout" type="number" min={0} step="1" inputMode="numeric" />
                  </label>
                </div>
                {peutGarantie && (
                  <label className="case">
                    <input type="checkbox" name="sous_garantie" />
                    <span>Sous garantie</span>
                  </label>
                )}
                <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                  {action === 'ajouter' ? 'Ajout…' : 'Ajouter la ligne'}
                </button>
              </form>
            )}
          </section>

          {historique.length > 0 && (
            <section className="bloc">
              <h2>Changements de décision</h2>
              <ul className="liste-simple">
                {historique.map((h) => {
                  const ligne = lignes.find((l) => l.id === h.inspection_ligne_id)
                  return (
                    <li key={h.id}>
                      {date(h.change_le)} — {texte(ligne?.description)} :{' '}
                      {libelleDecision(h.decision_avant)} → <strong>{libelleDecision(h.decision_apres)}</strong>
                      {h.motif ? ` (${h.motif})` : ''}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
