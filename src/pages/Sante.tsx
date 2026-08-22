import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { argent, texte } from '../lib/format'

type Visite = {
  id: string
  source: string | null
  statut: string | null
  vehicule_id: string | null
  no_stock: string | null
}

type Vente = {
  id: string
  vehicule_id: string
  no_stock: string
  client: string
  fi: string | null
  fi_le: string | null
  livre_le: string | null
  prix_vendu: number | null
}

type AlerteOuverte = {
  id: string
  no_stock: string
  vehicule: string | null
  alerte: string | null
  gravite: string | null
  jours_ouverte: number | null
  vehicule_id: string
}

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10)
}

function estAujourdhui(iso: string | null): boolean {
  return !!iso && iso.slice(0, 10) === aujourdhui()
}

/**
 * Page santé de la journée (brief §8.3) — un coup d'œil pour Yanik et Steve,
 * pas un nouvel écran de travail : chaque section renvoie vers l'écran
 * complet pour agir. « Tracks » est lu ici comme les essais routiers du
 * jour (statut Visites) — à corriger si ce n'est pas le bon sens du mot.
 */
export function Sante() {
  const [visites, setVisites] = useState<Visite[]>([])
  const [ventes, setVentes] = useState<Vente[]>([])
  const [alertes, setAlertes] = useState<AlerteOuverte[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const debut = `${aujourdhui()}T00:00:00`
    const fin = `${aujourdhui()}T23:59:59`
    const [vi, ve, al] = await Promise.all([
      supabase.from('v_visite_app').select('id, source, statut, vehicule_id, no_stock')
        .gte('date_visite', debut).lte('date_visite', fin),
      supabase.from('v_vente_app').select('id, vehicule_id, no_stock, client, fi, fi_le, livre_le, prix_vendu')
        .neq('etat', 'annule'),
      supabase.from('v_alertes_ouvertes')
        .select('id, no_stock, vehicule, alerte, gravite, jours_ouverte, vehicule_id')
        .eq('gravite', 'critique').order('jours_ouverte', { ascending: false }),
    ])
    if (vi.error) setErreur(messageErreur(vi.error))
    setVisites((vi.data ?? []) as unknown as Visite[])
    setVentes((ve.data ?? []) as unknown as Vente[])
    setAlertes((al.data ?? []) as unknown as AlerteOuverte[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const walkIn = useMemo(() => visites.filter((v) => v.source === 'Walkin'), [visites])
  const phoneUp = useMemo(() => visites.filter((v) => v.source === 'Téléphone'), [visites])
  const essaisRoutiers = useMemo(() => visites.filter((v) => v.statut === 'Essai routier'), [visites])
  const dossiersFi = useMemo(() => ventes.filter((v) => estAujourdhui(v.fi_le)), [ventes])
  const livraisons = useMemo(() => ventes.filter((v) => estAujourdhui(v.livre_le)), [ventes])

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Santé de la journée</h1>
      <p className="intro-page">
        Un coup d’œil, pas un nouvel écran de travail — chaque section renvoie vers
        l’écran complet.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      <div className="compteurs">
        <div className="compteur"><span className="chiffre">{walkIn.length}</span>
          <span className="etiquette">Walk-in</span></div>
        <div className="compteur"><span className="chiffre">{phoneUp.length}</span>
          <span className="etiquette">Phone-up</span></div>
        <div className="compteur"><span className="chiffre">{essaisRoutiers.length}</span>
          <span className="etiquette">Essais routiers</span></div>
        <div className="compteur ton-vente"><span className="chiffre">{dossiersFi.length}</span>
          <span className="etiquette">Dossiers F&amp;I</span></div>
        <div className="compteur ton-disponible"><span className="chiffre">{livraisons.length}</span>
          <span className="etiquette">Livraisons</span></div>
        <div className="compteur ton-critique"><span className="chiffre">{alertes.length}</span>
          <span className="etiquette">Alertes critiques</span></div>
      </div>

      <section className="bloc">
        <h2>Livraisons du jour</h2>
        {livraisons.length === 0 ? (
          <p className="note sans-marge">Aucune livraison aujourd’hui.</p>
        ) : (
          <ul className="liste-simple">
            {livraisons.map((v) => (
              <li key={v.id}>
                <Link to={`/vehicule/${v.vehicule_id}`} className="lien-stock">{v.no_stock}</Link>
                {' '}— {v.client}{v.prix_vendu !== null ? ` · ${argent(v.prix_vendu)}` : ''}
              </li>
            ))}
          </ul>
        )}
        <p className="note"><Link to="/ventes">Voir tous les dossiers</Link></p>
      </section>

      <section className="bloc">
        <h2>Dossiers F&amp;I qualifiés aujourd’hui</h2>
        {dossiersFi.length === 0 ? (
          <p className="note sans-marge">Aucun dossier qualifié aujourd’hui.</p>
        ) : (
          <ul className="liste-simple">
            {dossiersFi.map((v) => (
              <li key={v.id}>
                <Link to={`/vehicule/${v.vehicule_id}`} className="lien-stock">{v.no_stock}</Link>
                {' '}— {v.client}{v.fi ? ` · qualifié par ${v.fi}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bloc">
        <h2>Alertes critiques ouvertes</h2>
        {alertes.length === 0 ? (
          <p className="note sans-marge">Aucune alerte critique ouverte.</p>
        ) : (
          <ul className="liste-simple">
            {alertes.slice(0, 15).map((a) => (
              <li key={a.id}>
                <Link to={`/vehicule/${a.vehicule_id}`} className="lien-stock">{a.no_stock}</Link>
                {' '}— {texte(a.alerte)}
                {a.jours_ouverte !== null && ` (${a.jours_ouverte} j)`}
              </li>
            ))}
          </ul>
        )}
        {alertes.length > 15 && <p className="note">{alertes.length - 15} autres non affichées.</p>}
        <p className="note"><Link to="/inventaire?critiques=1">Voir toutes les alertes critiques</Link></p>
      </section>

      <section className="bloc">
        <h2>Visites du jour</h2>
        <p className="note sans-marge">
          {visites.length} visite{visites.length > 1 ? 's' : ''} saisie{visites.length > 1 ? 's' : ''} —
          détail par vendeur dans Visites du jour.
        </p>
        <p className="note"><Link to="/visites">Ouvrir Visites du jour</Link></p>
      </section>
    </div>
  )
}
