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

/** Les quatre décisions que prennent Yanik et Steve, ligne par ligne. */
const DECISIONS: { valeur: Decision; libelle: string; aide: string }[] = [
  { valeur: 'ne_pas_faire', libelle: 'Ne pas faire', aide: 'On ne la fait pas.' },
  { valeur: 'de_base', libelle: 'De base', aide: 'Faite maintenant — gruge la marge du véhicule.' },
  { valeur: 'signature', libelle: 'Signature', aide: 'Seulement si le client achète le programme Signature.' },
  { valeur: 'garantie', libelle: 'Garantie', aide: 'Couverte par le manufacturier — aucun coût pour nous.' },
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
        .select('id, no_ligne, description, code_reparation_id, cout, complete, complete_le, decision, decide_le')
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

                      {peutApprouver && (
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
