import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { categorieTravaux, date, dateCourte, statutDemandeTravaux, texte } from '../lib/format'
import { classeStatutDemandeTravaux } from '../lib/statuts'
import type { CategorieTravaux, DemandeTravauxApp, LigneDemandeTravaux, VehiculeApp } from '../lib/types'

const CATEGORIES: { valeur: CategorieTravaux; libelle: string }[] = [
  { valeur: 'mecanique', libelle: 'Mécanique' },
  { valeur: 'esthetique', libelle: 'Esthétique' },
  { valeur: 'preparation_livraison', libelle: 'Préparation livraison' },
  { valeur: 'autre', libelle: 'Autre' },
]

/**
 * L'envers de l'inspection : ici, c'est le concessionnaire qui écrit au
 * service, pas le service qui écrit à la direction. Une seule demande à la
 * fois est « active » (brouillon ou envoyée) — les autres sont l'historique.
 */
export function DemandeTravaux() {
  const { id } = useParams<{ id: string }>()
  const { aLeDroit } = useMoi()

  const [vehicule, setVehicule] = useState<VehiculeApp | null>(null)
  const [demandes, setDemandes] = useState<DemandeTravauxApp[]>([])
  const [lignes, setLignes] = useState<LigneDemandeTravaux[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const peutDemander = aLeDroit('travaux.demander')
  const peutGerer = aLeDroit('travaux.gerer')
  const peutCompleter = aLeDroit('travaux.completer')
  const peutComposer = peutDemander || peutGerer

  const charger = useCallback(async () => {
    if (!id) return
    setErreur(null)

    const [v, d] = await Promise.all([
      supabase.from('v_vehicule_app').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_demande_travaux_app').select('*').eq('vehicule_id', id)
        .order('cree_le', { ascending: false }),
    ])

    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Véhicule introuvable.')
      setChargement(false)
      return
    }

    setVehicule(v.data as unknown as VehiculeApp)
    const listeDemandes = (d.data ?? []) as unknown as DemandeTravauxApp[]
    setDemandes(listeDemandes)

    const active = listeDemandes.find((x) => x.statut === 'brouillon' || x.statut === 'envoyee')
    if (active) {
      const { data: l } = await supabase
        .from('demande_travaux_ligne')
        .select('id, demande_id, no_ligne, categorie, description, complete, complete_le, complete_par')
        .eq('demande_id', active.id)
        .order('no_ligne')
      setLignes((l ?? []) as LigneDemandeTravaux[])
    } else {
      setLignes([])
    }

    setChargement(false)
  }, [id])

  useEffect(() => { charger() }, [charger])

  const active = useMemo(
    () => demandes.find((x) => x.statut === 'brouillon' || x.statut === 'envoyee') ?? null,
    [demandes]
  )
  const historique = useMemo(
    () => demandes.filter((x) => x.statut === 'completee' || x.statut === 'annulee'),
    [demandes]
  )

  async function creerDemande(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return
    const form = e.currentTarget
    const notes = String(new FormData(form).get('notes') ?? '').trim()

    setAction('creer'); setErreur(null); setSucces(null)
    const { error } = await supabase.rpc('creer_demande_travaux', {
      p_vehicule: id, p_notes: notes || null,
    })
    if (error) setErreur(messageErreur(error))
    else { form.reset(); setFormulaireOuvert(false); await charger() }
    setAction(null)
  }

  async function ajouterLigne(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!active) return
    const form = e.currentTarget
    const donnees = new FormData(form)
    const description = String(donnees.get('description') ?? '').trim()
    if (!description) return

    setAction('ajouter'); setErreur(null)
    const { error } = await supabase.from('demande_travaux_ligne').insert({
      demande_id: active.id,
      no_ligne: lignes.reduce((max, l) => Math.max(max, l.no_ligne ?? 0), 0) + 1,
      categorie: String(donnees.get('categorie') ?? 'autre'),
      description,
    })
    if (error) setErreur(messageErreur(error))
    else { form.reset(); await charger() }
    setAction(null)
  }

  async function retirerLigne(ligne: LigneDemandeTravaux) {
    setAction(`retirer-${ligne.id}`); setErreur(null)
    const { error } = await supabase.from('demande_travaux_ligne').delete().eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  async function basculerComplete(ligne: LigneDemandeTravaux) {
    setAction(`complete-${ligne.id}`); setErreur(null); setSucces(null)
    const { error } = await supabase
      .from('demande_travaux_ligne').update({ complete: !ligne.complete }).eq('id', ligne.id)
    if (error) setErreur(messageErreur(error))
    else await charger()
    setAction(null)
  }

  async function envoyer() {
    if (!active) return
    setAction('envoyer'); setErreur(null); setSucces(null)
    const { error } = await supabase.rpc('envoyer_demande_travaux', { p_demande: active.id })
    if (error) setErreur(messageErreur(error))
    else { await charger(); setSucces('Demande envoyée au service. Le véhicule a été déplacé.') }
    setAction(null)
  }

  async function annuler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!active) return
    const motif = String(new FormData(e.currentTarget).get('motif') ?? '').trim()
    setAction('annuler'); setErreur(null); setSucces(null)
    const { error } = await supabase.rpc('annuler_demande_travaux', {
      p_demande: active.id, p_motif: motif,
    })
    if (error) setErreur(messageErreur(error))
    else { await charger(); setSucces('Demande annulée.') }
    setAction(null)
  }

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!vehicule) {
    return (
      <div className="page">
        <p className="message-erreur">{erreur ?? 'Véhicule introuvable.'}</p>
        <Link to="/" className="bouton-secondaire">Retour</Link>
      </div>
    )
  }

  const v = vehicule

  return (
    <div className="page">
      <Link to={`/vehicule/${v.id}`} className="retour">← Fiche du véhicule</Link>

      <header className="fiche-entete">
        <div>
          <h1 className="titre-page">{v.no_stock}</h1>
          <p className="fiche-titre">{v.vehicule_titre}</p>
        </div>
        <span className="statut gros">{texte(v.statut)}</span>
      </header>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      {!active ? (
        <section className="bloc">
          <h2>Demande de travaux</h2>
          <p className="note sans-marge">Aucune demande en cours pour ce véhicule.</p>
          {peutComposer ? (
            !formulaireOuvert ? (
              <div className="vehicule-actions espace-haut">
                <button type="button" className="bouton-principal" onClick={() => setFormulaireOuvert(true)}>
                  Nouvelle demande
                </button>
              </div>
            ) : (
              <form onSubmit={creerDemande} className="espace-haut">
                <label className="champ">
                  <span>Contexte — ce qui motive la demande</span>
                  <textarea name="notes" rows={2} placeholder="Véhicule vendu, préparation pour la livraison…" />
                </label>
                <div className="vehicule-actions">
                  <button type="submit" className="bouton-principal" disabled={action !== null}>
                    {action === 'creer' ? 'Création…' : 'Créer la demande'}
                  </button>
                  <button type="button" className="bouton-discret" onClick={() => setFormulaireOuvert(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )
          ) : (
            <p className="note">Vous n’avez pas le droit de créer une demande de travaux.</p>
          )}
        </section>
      ) : (
        <section className="bloc">
          <h2>
            Demande de travaux
            <span className={classeStatutDemandeTravaux(active.statut)}>
              {statutDemandeTravaux(active.statut)}
            </span>
          </h2>

          <dl className="fiche-grille">
            <div className="ligne"><dt>Créée par</dt><dd>{texte(active.cree_par_nom)} · {dateCourte(active.cree_le)}</dd></div>
            {active.envoyee_le && (
              <div className="ligne"><dt>Envoyée par</dt>
                <dd>{texte(active.envoyee_par_nom)} · {dateCourte(active.envoyee_le)}</dd></div>
            )}
            {active.notes && <div className="ligne"><dt>Contexte</dt><dd>{active.notes}</dd></div>}
          </dl>

          {lignes.length === 0 ? (
            <p className="note sans-marge">Aucune ligne pour l’instant.</p>
          ) : (
            <ul className="lignes-inspection">
              {lignes.map((l) => (
                <li key={l.id} className="ligne-inspection">
                  <div className="ligne-tete">
                    <span className="ligne-description">{l.description}</span>
                  </div>
                  <div className="ligne-meta">
                    <span className="decision-actuelle">{categorieTravaux(l.categorie)}</span>
                    {l.complete && (
                      <span className="fait">Fait{l.complete_le ? ` le ${dateCourte(l.complete_le)}` : ''}</span>
                    )}
                  </div>

                  {active.statut === 'envoyee' && peutCompleter && (
                    <label className="case">
                      <input
                        type="checkbox"
                        checked={l.complete}
                        disabled={action !== null}
                        onChange={() => basculerComplete(l)}
                      />
                      <span>Travail fait</span>
                    </label>
                  )}

                  {active.statut === 'brouillon' && peutComposer && (
                    <div className="vehicule-actions">
                      <button
                        type="button" className="bouton-discret" disabled={action !== null}
                        onClick={() => retirerLigne(l)}
                      >
                        {action === `retirer-${l.id}` ? 'Retrait…' : 'Retirer'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {active.statut === 'brouillon' && peutComposer && (
            <form className="ajout-ligne" onSubmit={ajouterLigne}>
              <h3>Ajouter une tâche</h3>
              <div className="grille">
                <label className="champ">
                  <span>Description</span>
                  <input name="description" required placeholder="Remplir un quart de réservoir…" />
                </label>
                <label className="champ">
                  <span>Catégorie</span>
                  <select name="categorie" defaultValue="mecanique">
                    {CATEGORIES.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                {action === 'ajouter' ? 'Ajout…' : 'Ajouter la tâche'}
              </button>
            </form>
          )}

          {(active.statut === 'brouillon' || active.statut === 'envoyee') && peutGerer && (
            <div className="vehicule-actions espace-haut">
              {active.statut === 'brouillon' && (
                <button
                  type="button" className="bouton-principal" disabled={action !== null || lignes.length === 0}
                  onClick={envoyer}
                >
                  {action === 'envoyer' ? 'Envoi…' : 'Envoyer au service'}
                </button>
              )}
              <details className="action-repliable">
                <summary className="bouton-discret">Annuler la demande</summary>
                <form className="formulaire-court" onSubmit={annuler}>
                  <label className="champ">
                    <span>Motif — il reste au dossier</span>
                    <input name="motif" required placeholder="Erreur de saisie, demande retirée…" />
                  </label>
                  <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                    Confirmer l’annulation
                  </button>
                </form>
              </details>
            </div>
          )}
        </section>
      )}

      {historique.length > 0 && (
        <section className="bloc">
          <h2>Historique</h2>
          <ul className="liste-simple">
            {historique.map((d) => (
              <li key={d.id}>
                {date(d.completee_le ?? d.annulee_le)} —{' '}
                <span className={classeStatutDemandeTravaux(d.statut)}>{statutDemandeTravaux(d.statut)}</span>
                {' '}· {d.nb_completees}/{d.nb_lignes} tâches
                {d.motif_annulation ? ` · ${d.motif_annulation}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
