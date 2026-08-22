import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { texte } from '../lib/format'
import type { Utilisateur, VehiculeApp } from '../lib/types'

const SOURCES = ['Téléphone', 'Walkin', 'Web', 'SMS', 'Facebook', 'Référence']
const STATUTS = ['Nouveau', 'En traitement', 'Rendez-vous', 'Essai routier', 'Vendu', 'Perdu']

type Visite = {
  id: string
  date_visite: string
  client: string
  telephone: string | null
  statut: string | null
  source: string | null
  neuf_usage: string | null
  chrys_conq: string | null
  echange: string | null
  vehicule_id: string | null
  no_stock: string | null
  vehicule: string | null
  vendeur_id: string | null
  vendeur: string | null
  saisi_par_direction: string | null
  lien_crm: string | null
  notes: string | null
  cree_le: string
}

type Opportunite = {
  id: string
  lead_id_crm: string | null
  nom: string | null
  telephone: string | null
  vehicule_texte: string | null
  source: string | null
  statut_crm: string | null
  date_recu: string | null
}

function chiffresSeuls(v: string): string {
  return v.replace(/\D/g, '')
}

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Saisie quotidienne des visites — phone-up et walk-in.
 *
 * La direction en entre une vingtaine d'affilée : le formulaire reste ouvert,
 * garde la source et le vendeur choisis, et rend le focus au nom du client.
 * Chaque champ inutile ici coûte du temps chaque jour.
 */
export function Visites() {
  const { aLeDroit, utilisateur } = useMoi()

  const [visites, setVisites] = useState<Visite[]>([])
  const [vendeurs, setVendeurs] = useState<Utilisateur[]>([])
  const [vehicules, setVehicules] = useState<VehiculeApp[]>([])
  const [jour, setJour] = useState(aujourdhui())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  // Ce qui se répète d'une visite à l'autre reste en place.
  const [source, setSource] = useState('Walkin')
  const [vendeur, setVendeur] = useState('')
  const champClient = useRef<HTMLInputElement>(null)

  // Recherche d'opportunité : ce client a peut-être déjà un lead web/SMS/
  // Facebook que SM360 a reçu avant qu'il se présente en personne.
  const [nomSaisi, setNomSaisi] = useState('')
  const [telephoneSaisi, setTelephoneSaisi] = useState('')
  const [correspondances, setCorrespondances] = useState<Opportunite[]>([])
  const [opportuniteLiee, setOpportuniteLiee] = useState<Opportunite | null>(null)
  const peutVoirLeads = aLeDroit('lead.voir')

  useEffect(() => {
    if (!peutVoirLeads) return
    const nom = nomSaisi.trim()
    const tel = chiffresSeuls(telephoneSaisi)
    if (nom.length < 3 && tel.length < 7) { setCorrespondances([]); return }

    const minuterie = setTimeout(async () => {
      const filtres: string[] = []
      if (nom.length >= 3) filtres.push(`nom.ilike.%${nom}%`)
      if (tel.length >= 7) filtres.push(`telephone.ilike.%${tel}%`)
      const { data } = await supabase.from('crm_lead')
        .select('id, lead_id_crm, nom, telephone, vehicule_texte, source, statut_crm, date_recu')
        .or(filtres.join(','))
        .order('date_recu', { ascending: false })
        .limit(5)
      setCorrespondances((data ?? []) as unknown as Opportunite[])
    }, 350)

    return () => clearTimeout(minuterie)
  }, [nomSaisi, telephoneSaisi, peutVoirLeads])

  const peutSaisir = aLeDroit('lead.saisir')

  const charger = useCallback(async () => {
    const debut = `${jour}T00:00:00`
    const fin = `${jour}T23:59:59`
    const [vi, u, ve] = await Promise.all([
      supabase.from('v_visite_app').select('*')
        .gte('date_visite', debut).lte('date_visite', fin)
        .order('date_visite', { ascending: false }),
      supabase.from('utilisateur').select('id, nom, email, role, actif, auth_user_id')
        .eq('actif', true).order('nom'),
      supabase.from('v_vehicule_app').select('*'),
    ])
    if (vi.error) setErreur(messageErreur(vi.error))
    setVisites((vi.data ?? []) as unknown as Visite[])
    setVendeurs((u.data ?? []) as Utilisateur[])
    setVehicules((ve.data ?? []) as unknown as VehiculeApp[])
    setChargement(false)
  }, [jour])

  useEffect(() => { charger() }, [charger])

  async function ajouter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    const client = String(d.get('client') ?? '').trim()
    if (!client) return

    setEnvoi(true); setErreur(null)

    const { error } = await supabase.from('lead_showroom').insert({
      client,
      telephone: String(d.get('telephone') ?? '').trim() || null,
      date_visite: new Date(`${jour}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
      heure_arrivee: new Date().toTimeString().slice(0, 5),
      source,
      vendeur_id: vendeur || null,
      direction_id: utilisateur?.id ?? null,
      vehicule_id: String(d.get('vehicule') ?? '') || null,
      neuf_usage: String(d.get('neuf_usage') ?? '') || null,
      chrys_conq: String(d.get('chrys_conq') ?? '') || null,
      echange: String(d.get('echange') ?? '').trim() || null,
      statut: String(d.get('statut') ?? '') || 'Nouveau',
      notes: String(d.get('notes') ?? '').trim() || null,
      lien_crm: opportuniteLiee ? (opportuniteLiee.lead_id_crm ?? opportuniteLiee.id) : null,
      cree_par: utilisateur?.id ?? null,
    })

    if (error) { setErreur(messageErreur(error)); setEnvoi(false); return }

    form.reset()
    setNomSaisi('')
    setTelephoneSaisi('')
    setCorrespondances([])
    setOpportuniteLiee(null)
    await charger()
    setSucces(`${client} enregistré.`)
    setEnvoi(false)
    champClient.current?.focus()
  }

  /** Le rapport quotidien que la direction suit déjà dans Airtable. */
  const rapport = useMemo(() => {
    const parVendeur = new Map<string, number>()
    for (const v of visites) {
      const nom = v.vendeur ?? 'Non assigné'
      parVendeur.set(nom, (parVendeur.get(nom) ?? 0) + 1)
    }
    return {
      total: visites.length,
      phoneUp: visites.filter((v) => v.source === 'Téléphone').length,
      walkIn: visites.filter((v) => v.source === 'Walkin').length,
      vendus: visites.filter((v) => v.statut === 'Vendu').length,
      parVendeur: [...parVendeur.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [visites])

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Visites du jour</h1>
      <p className="intro-page">
        Phone-up et walk-in. Ce que SM360 ne voit pas — c’est ici qu’on sait qui
        est réellement intéressé.
      </p>

      <div className="barre-outils">
        <label className="champ champ-inline">
          <span>Journée</span>
          <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
        </label>
      </div>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      <div className="compteurs">
        <div className="compteur"><span className="chiffre">{rapport.total}</span>
          <span className="etiquette">Visites</span></div>
        <div className="compteur"><span className="chiffre">{rapport.phoneUp}</span>
          <span className="etiquette">Phone-up</span></div>
        <div className="compteur"><span className="chiffre">{rapport.walkIn}</span>
          <span className="etiquette">Walk-in</span></div>
        {/* Le seul chiffre de la journée qui soit un résultat, pas un volume. */}
        <div className="compteur ton-disponible"><span className="chiffre">{rapport.vendus}</span>
          <span className="etiquette">Vendus</span></div>
      </div>

      {peutSaisir ? (
        <section className="bloc">
          <h2>Ajouter une visite</h2>
          <p className="note sans-marge">
            La source et le vendeur restent d’une saisie à l’autre. Le curseur revient
            au nom du client.
          </p>

          <div className="grille espace-haut">
            <label className="champ">
              <span>Source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="champ">
              <span>Vendeur</span>
              <select value={vendeur} onChange={(e) => setVendeur(e.target.value)}>
                <option value="">Non assigné</option>
                {vendeurs.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
              </select>
            </label>
          </div>

          <form onSubmit={ajouter}>
            <div className="grille">
              <label className="champ">
                <span>Client <em>obligatoire</em></span>
                <input
                  name="client" ref={champClient} required autoFocus
                  value={nomSaisi}
                  onChange={(e) => { setNomSaisi(e.target.value); setOpportuniteLiee(null) }}
                />
              </label>
              <label className="champ">
                <span>Téléphone</span>
                <input
                  name="telephone" inputMode="tel"
                  value={telephoneSaisi}
                  onChange={(e) => { setTelephoneSaisi(e.target.value); setOpportuniteLiee(null) }}
                />
              </label>
            </div>

            {peutVoirLeads && !opportuniteLiee && correspondances.length > 0 && (
              <div className="bloc-discret espace-haut">
                <p className="note sans-marge">
                  Correspondance{correspondances.length > 1 ? 's' : ''} possible
                  {correspondances.length > 1 ? 's' : ''} dans le CRM — SM360 l’a peut-être
                  déjà reçu avant qu’il se présente :
                </p>
                <ul className="liste-simple">
                  {correspondances.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button" className="bouton-discret"
                        onClick={() => {
                          setOpportuniteLiee(o)
                          if (o.nom) setNomSaisi(o.nom)
                          if (o.telephone && !telephoneSaisi) setTelephoneSaisi(o.telephone)
                        }}
                      >
                        Lier
                      </button>
                      {' '}
                      <strong>{o.nom ?? 'Sans nom'}</strong>
                      {o.telephone && ` · ${o.telephone}`}
                      {o.vehicule_texte && ` · ${o.vehicule_texte}`}
                      {o.source && ` · ${o.source}`}
                      {o.statut_crm && ` · ${o.statut_crm}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {opportuniteLiee && (
              <p className="bandeau-succes espace-haut">
                Rattaché au lead CRM de {opportuniteLiee.nom ?? 'ce client'}
                {' '}
                <button
                  type="button" className="bouton-discret"
                  onClick={() => setOpportuniteLiee(null)}
                >
                  Retirer
                </button>
              </p>
            )}

            <div className="grille espace-haut">
              <label className="champ">
                <span>Véhicule d’intérêt</span>
                <select name="vehicule" defaultValue="">
                  <option value="">Aucun en particulier</option>
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.id}>{v.no_stock} — {v.vehicule_titre}</option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span>Neuf ou occasion</span>
                <select name="neuf_usage" defaultValue="Occasion">
                  <option value="Occasion">Occasion</option>
                  <option value="Neuf">Neuf</option>
                </select>
              </label>
              <label className="champ">
                <span>Origine</span>
                <select name="chrys_conq" defaultValue="">
                  <option value="">—</option>
                  <option value="Chrysler">Chrysler</option>
                  <option value="Conquête">Conquête</option>
                </select>
              </label>
              <label className="champ">
                <span>Échange</span>
                <input name="echange" placeholder="Modèle repris" />
              </label>
              <label className="champ">
                <span>Statut</span>
                <select name="statut" defaultValue="Nouveau">
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <label className="champ">
              <span>Notes</span>
              <input name="notes" placeholder="Ce qu’il faut retenir pour le suivi" />
            </label>

            <button type="submit" className="bouton-principal" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Ajouter la visite'}
            </button>
          </form>
        </section>
      ) : (
        <p className="note">
          Vous pouvez consulter les visites, mais pas les saisir.
        </p>
      )}

      <section className="bloc">
        <h2>Journée du {jour}</h2>
        {visites.length === 0 ? (
          <p className="note sans-marge">Aucune visite enregistrée pour cette journée.</p>
        ) : (
          <div className="tableau-defilant">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Client</th><th>Téléphone</th><th>Source</th><th>Vendeur</th>
                  <th>Véhicule</th><th>Statut</th><th>CRM</th>
                </tr>
              </thead>
              <tbody>
                {visites.map((v) => (
                  <tr key={v.id}>
                    <td>{v.client}</td>
                    <td className="discret">{texte(v.telephone)}</td>
                    <td>{texte(v.source)}</td>
                    <td className="discret">{texte(v.vendeur)}</td>
                    <td>
                      {v.vehicule_id ? (
                        <Link to={`/vehicule/${v.vehicule_id}`} className="lien-stock">
                          {v.no_stock}
                        </Link>
                      ) : texte(v.vehicule)}
                    </td>
                    <td>{texte(v.statut)}</td>
                    <td className="discret">{v.lien_crm ? 'Lié' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rapport.parVendeur.length > 0 && (
        <section className="bloc">
          <h2>Par vendeur</h2>
          <ul className="liste-simple">
            {rapport.parVendeur.map(([nom, compte]) => (
              <li key={nom}><strong>{compte}</strong> — {nom}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
