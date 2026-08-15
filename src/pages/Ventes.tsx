import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import {
  argent, date, dateCourte, etatVente, forceDossier, texte, transaction,
} from '../lib/format'
import type { Utilisateur, VehiculeApp, Vente } from '../lib/types'

/** Les états vivants du pipeline, dans l'ordre où ils se succèdent. */
const ETAPES: { etat: string; titre: string; aide: string }[] = [
  { etat: 'depot', titre: 'Dépôt reçu', aide: 'Client engagé, transaction pas encore conclue.' },
  { etat: 'vendu', titre: 'Vendu', aide: 'En attente d’approbation du financement.' },
  { etat: 'approuve', titre: 'Approuvé', aide: 'Prêt à livrer.' },
]

export function Ventes() {
  const { aLeDroit } = useMoi()

  const [ventes, setVentes] = useState<Vente[]>([])
  const [vehicules, setVehicules] = useState<VehiculeApp[]>([])
  const [vendeurs, setVendeurs] = useState<Utilisateur[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [formulaire, setFormulaire] = useState(false)

  const peutEnregistrer = aLeDroit('vente.enregistrer')
  const peutFinancer = aLeDroit('vente.financement')
  const peutLivrer = aLeDroit('vente.livrer')

  const charger = useCallback(async () => {
    const [ve, v, u] = await Promise.all([
      supabase.from('v_vente_app').select('*').order('cree_le', { ascending: false }),
      supabase.from('v_vehicule_app').select('*'),
      supabase.from('utilisateur').select('id, nom, email, role, actif, auth_user_id')
        .eq('actif', true).order('nom'),
    ])
    if (ve.error) setErreur(messageErreur(ve.error))
    setVentes((ve.data ?? []) as unknown as Vente[])
    setVehicules((v.data ?? []) as unknown as VehiculeApp[])
    setVendeurs((u.data ?? []) as Utilisateur[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function executer(nom: string, appel: () => PromiseLike<{ error: unknown }>, message: string) {
    setAction(nom); setErreur(null); setSucces(null)
    const { error } = await appel()
    if (error) { setErreur(messageErreur(error)); setAction(null); return }
    await charger()
    setSucces(message)
    setAction(null)
  }

  /** Un véhicule déjà engagé dans un dossier vivant ne peut pas être revendu. */
  const disponibles = useMemo(() => {
    const engages = new Set(ventes.filter((v) => v.etat !== 'annule').map((v) => v.vehicule_id))
    return vehicules.filter((v) => !engages.has(v.id))
      .sort((a, b) => a.no_stock.localeCompare(b.no_stock))
  }, [vehicules, ventes])

  const actives = ventes.filter((v) => v.etat !== 'annule' && v.etat !== 'livre')
  const livrees = ventes.filter((v) => v.etat === 'livre')
  const annulees = ventes.filter((v) => v.etat === 'annule')

  async function enregistrer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    const prix = String(d.get('prix') ?? '').trim()
    await executer('enregistrer',
      () => supabase.rpc('enregistrer_vente', {
        p_vehicule: String(d.get('vehicule') ?? ''),
        p_client: String(d.get('client') ?? '').trim(),
        p_type_transaction: String(d.get('type') ?? ''),
        p_vendeur: String(d.get('vendeur') ?? '') || null,
        p_telephone: String(d.get('telephone') ?? '').trim() || null,
        p_courriel: String(d.get('courriel') ?? '').trim() || null,
        p_prix: prix === '' ? null : Number(prix),
        p_lien_crm: String(d.get('lien_crm') ?? '').trim() || null,
        p_notes: String(d.get('notes') ?? '').trim() || null,
        p_depot_seulement: d.get('depot') === 'on',
      }),
      'Vente enregistrée. Le statut du véhicule a suivi.')
    form.reset()
    setFormulaire(false)
  }

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  const carte = (v: Vente) => (
    <li key={v.id} className={`vehicule vente ${v.etat}`}>
      <div className="vehicule-entete">
        <Link to={`/vehicule/${v.vehicule_id}`} className="no-stock lien-stock">{v.no_stock}</Link>
        <span className="statut">{etatVente(v.etat)}</span>
      </div>
      <div className="vehicule-titre">{v.vehicule_titre} · {v.client}</div>

      <dl className="vehicule-details">
        <div><dt>Transaction</dt><dd>{transaction(v.type_transaction)}</dd></div>
        <div><dt>Vendeur</dt><dd>{texte(v.vendeur)}</dd></div>
        {v.prix_vendu !== null && <div><dt>Prix</dt><dd>{argent(v.prix_vendu)}</dd></div>}
        <div><dt>Téléphone</dt><dd>{texte(v.telephone)}</dd></div>
        {v.date_livraison_prevue && (
          <div><dt>Livraison prévue</dt><dd>{dateCourte(v.date_livraison_prevue)}</dd></div>
        )}
        <div><dt>Statut du véhicule</dt><dd>{texte(v.statut_vehicule)}</dd></div>
      </dl>

      {v.type_transaction === 'financement' && v.etat !== 'livre' && (
        <p className={`alerte ${v.force_dossier === 'faible' ? 'critique' : ''}`}>
          {forceDossier(v.force_dossier)}
          {v.force_dossier === 'faible' &&
            ' — le véhicule est à risque, un second client peut être travaillé.'}
          {v.fi && ` · qualifié par ${v.fi}`}
        </p>
      )}

      {v.notes && <p className="note sans-marge">{v.notes}</p>}

      <div className="vehicule-actions">
        {peutFinancer && v.etat !== 'livre' && (
          <details className="action-repliable">
            <summary className="bouton-secondaire">Noter l’approbation</summary>
            <form
              className="formulaire-court"
              onSubmit={(e) => {
                e.preventDefault()
                const d = new FormData(e.currentTarget)
                executer(`fi-${v.id}`,
                  () => supabase.rpc('noter_approbation', {
                    p_vente: v.id,
                    p_force_dossier: String(d.get('force') ?? ''),
                    p_approuve: d.get('approuve') === 'on',
                    p_date_livraison: String(d.get('livraison') ?? '') || null,
                  }),
                  'Dossier qualifié.')
              }}
            >
              <label className="champ">
                <span>Force du dossier</span>
                <select name="force" required defaultValue={v.force_dossier ?? ''}>
                  <option value="" disabled>Choisir…</option>
                  <option value="fort">Fort</option>
                  <option value="moyen">Moyen</option>
                  <option value="faible">Faible</option>
                </select>
              </label>
              <label className="champ">
                <span>Date de livraison prévue</span>
                <input name="livraison" type="date" defaultValue={v.date_livraison_prevue ?? ''} />
              </label>
              <label className="case">
                <input type="checkbox" name="approuve" defaultChecked={v.etat === 'approuve'} />
                <span>Approbation obtenue</span>
              </label>
              <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                Enregistrer
              </button>
            </form>
          </details>
        )}

        {peutLivrer && v.etat !== 'livre' && (
          <button
            type="button" className="bouton-secondaire" disabled={action !== null}
            onClick={() => executer(`livrer-${v.id}`,
              () => supabase.rpc('noter_livraison', { p_vente: v.id }),
              `${v.no_stock} livré.`)}
          >
            {action === `livrer-${v.id}` ? 'Enregistrement…' : 'Confirmer la livraison'}
          </button>
        )}

        {peutEnregistrer && v.etat !== 'livre' && (
          <details className="action-repliable">
            <summary className="bouton-discret">Annuler</summary>
            <form
              className="formulaire-court"
              onSubmit={(e) => {
                e.preventDefault()
                const d = new FormData(e.currentTarget)
                executer(`annuler-${v.id}`,
                  () => supabase.rpc('annuler_vente', {
                    p_vente: v.id, p_motif: String(d.get('motif') ?? ''),
                  }),
                  'Vente annulée. Le véhicule redevient disponible.')
              }}
            >
              <label className="champ">
                <span>Motif — il reste au dossier</span>
                <input name="motif" required placeholder="Financement refusé, client s’est retiré…" />
              </label>
              <button type="submit" className="bouton-secondaire" disabled={action !== null}>
                Confirmer l’annulation
              </button>
            </form>
          </details>
        )}

        {v.lien_crm && (
          <a href={v.lien_crm} target="_blank" rel="noopener noreferrer" className="bouton-discret">
            Ouvrir dans SM360
          </a>
        )}
      </div>
    </li>
  )

  return (
    <div className="page">
      <h1 className="titre-page">Ventes</h1>
      <p className="intro-page">
        Le statut du véhicule suit le dossier — personne ne le saisit à la main.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      <div className="compteurs">
        {ETAPES.map((e) => (
          <div key={e.etat} className="compteur">
            <span className="chiffre">{ventes.filter((v) => v.etat === e.etat).length}</span>
            <span className="etiquette">{e.titre}</span>
          </div>
        ))}
        <div className="compteur">
          <span className="chiffre">{livrees.length}</span>
          <span className="etiquette">Livrés</span>
        </div>
      </div>

      {peutEnregistrer && (
        <section className="bloc">
          <h2>Enregistrer une vente</h2>
          {!formulaire ? (
            <button type="button" className="bouton-principal" onClick={() => setFormulaire(true)}>
              Nouvelle vente
            </button>
          ) : (
            <form onSubmit={enregistrer}>
              <div className="grille">
                <label className="champ">
                  <span>Véhicule <em>obligatoire</em></span>
                  <select name="vehicule" required defaultValue="">
                    <option value="" disabled>Choisir…</option>
                    {disponibles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.no_stock} — {v.vehicule_titre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="champ">
                  <span>Client <em>obligatoire</em></span>
                  <input name="client" required />
                </label>
                <label className="champ">
                  <span>Type de transaction <em>obligatoire</em></span>
                  <select name="type" required defaultValue="financement">
                    <option value="financement">Financement</option>
                    <option value="comptant">Comptant</option>
                    <option value="location">Location</option>
                  </select>
                </label>
                <label className="champ">
                  <span>Vendeur</span>
                  <select name="vendeur" defaultValue="">
                    <option value="">Aucun</option>
                    {vendeurs.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
                  </select>
                </label>
                <label className="champ">
                  <span>Téléphone</span>
                  <input name="telephone" />
                </label>
                <label className="champ">
                  <span>Courriel</span>
                  <input name="courriel" type="email" />
                </label>
                <label className="champ">
                  <span>Prix vendu</span>
                  <input name="prix" type="number" min={0} step="1" inputMode="numeric" />
                </label>
                <label className="champ">
                  <span>Lien SM360</span>
                  <input name="lien_crm" placeholder="https://…" />
                </label>
              </div>

              <label className="case">
                <input type="checkbox" name="depot" />
                <span>Dépôt seulement — la transaction n’est pas conclue</span>
              </label>

              <label className="champ">
                <span>Notes</span>
                <textarea name="notes" rows={2} />
              </label>

              <div className="vehicule-actions">
                <button type="submit" className="bouton-principal" disabled={action !== null}>
                  {action === 'enregistrer' ? 'Enregistrement…' : 'Enregistrer la vente'}
                </button>
                <button type="button" className="bouton-discret" onClick={() => setFormulaire(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bloc">
        <h2>Dossiers en cours</h2>
        {actives.length === 0 ? (
          <p className="note sans-marge">Aucun dossier en cours.</p>
        ) : (
          <ul className="liste-vehicules">{actives.map(carte)}</ul>
        )}
      </section>

      {livrees.length > 0 && (
        <section className="bloc">
          <h2>Livrés</h2>
          <ul className="liste-simple">
            {livrees.map((v) => (
              <li key={v.id}>
                {dateCourte(v.livre_le)} — <strong>{v.no_stock}</strong> · {v.client}
                {v.livre_par_nom ? ` · livré par ${v.livre_par_nom}` : ''}
                {v.prix_vendu !== null ? ` · ${argent(v.prix_vendu)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {annulees.length > 0 && (
        <section className="bloc">
          <h2>Annulés</h2>
          <ul className="liste-simple">
            {annulees.map((v) => (
              <li key={v.id}>
                {date(v.annule_le)} — <strong>{v.no_stock}</strong> · {v.client} :{' '}
                {texte(v.motif_annulation)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
