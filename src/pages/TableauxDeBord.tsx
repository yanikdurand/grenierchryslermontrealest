import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { argent, argentCompact, nombre, texte } from '../lib/format'

type KpiStock = {
  vehicules_en_stock: number
  vieillissants: number
  age_moyen: number | null
  age_median: number | null
  capital_immobilise: number | null
  non_affiches: number
  sans_vin: number
}

type KpiAffichage = {
  vehicules_a_afficher: number
  en_ligne: number
  hors_ligne: number
  affiches_sans_photo: number
  affiches_moins_10_photos: number
  photos_moyennes: number | null
  pct_en_ligne: number | null
}

type LigneVente = {
  no_stock: string
  marque: string | null
  modele: string | null
  prix_vente: number | null
  profit_net: number | null
  marge_brute: number | null
  jours_avant_vente: number | null
  mois_reception: string | null
}

type LeadSource = {
  source: string | null
  type_lead: string | null
  mois: string
  leads: number
  avec_telephone: number
}

type SansLead = {
  no_stock: string
  vehicule: string | null
  prix_vente: number | null
  jours_inventaire: number | null
  photos: number | null
}

/**
 * `ton` gradue au lieu d'alarmer. Auparavant tout ce qui méritait un regard
 * était rouge — vieillissants, hors ligne, sans photo, sans VIN — et à sept
 * chiffres rouges sur un écran, plus aucun ne se distingue. Le rouge est
 * maintenant réservé à ce qui bloque une vente.
 */
type Ton = 'critique' | 'attente' | 'disponible'

function Chiffre(
  { valeur, libelle, ton, exact }:
  { valeur: string; libelle: string; ton?: Ton; exact?: string }
) {
  return (
    <div className={`compteur ${ton ? `ton-${ton}` : ''}`} title={exact}>
      <span className="chiffre">{valeur}</span>
      <span className="etiquette">{libelle}</span>
    </div>
  )
}

export function TableauxDeBord() {
  const [stock, setStock] = useState<KpiStock | null>(null)
  const [affichage, setAffichage] = useState<KpiAffichage | null>(null)
  const [ventes, setVentes] = useState<LigneVente[]>([])
  const [sources, setSources] = useState<LeadSource[]>([])
  const [sansLead, setSansLead] = useState<SansLead[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const [ks, ka, ve, ls, sl] = await Promise.all([
      supabase.from('v_kpi_stock_app').select('*').maybeSingle(),
      supabase.from('v_kpi_affichage').select('*').maybeSingle(),
      supabase.from('v_ventes_app').select('*'),
      supabase.from('v_leads_par_source').select('*'),
      supabase.from('v_stock_sans_lead').select('*'),
    ])
    if (ks.error) setErreur(messageErreur(ks.error))
    setStock((ks.data ?? null) as unknown as KpiStock | null)
    setAffichage((ka.data ?? null) as unknown as KpiAffichage | null)
    setVentes((ve.data ?? []) as unknown as LigneVente[])
    setSources((ls.data ?? []) as unknown as LeadSource[])
    setSansLead((sl.data ?? []) as unknown as SansLead[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const resumeVentes = useMemo(() => {
    const moy = (vals: (number | null)[]) => {
      const n = vals.filter((v): v is number => v !== null && v !== undefined)
      return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
    }
    const somme = (vals: (number | null)[]) => {
      const n = vals.filter((v): v is number => v !== null && v !== undefined)
      return n.length ? n.reduce((a, b) => a + b, 0) : null
    }
    return {
      nb: ventes.length,
      prixMoyen: moy(ventes.map((v) => v.prix_vente)),
      profitMoyen: moy(ventes.map((v) => v.profit_net)),
      profitTotal: somme(ventes.map((v) => v.profit_net)),
      joursMoyen: moy(ventes.map((v) => v.jours_avant_vente)),
    }
  }, [ventes])

  /** Le profit n'est visible que pour qui a le droit; sinon Postgres renvoie null. */
  const voitProfit = ventes.some((v) => v.profit_net !== null)

  const parMois = useMemo(() => {
    const m = new Map<string, { nb: number; profit: number | null }>()
    for (const v of ventes) {
      if (!v.mois_reception) continue
      const cle = v.mois_reception.slice(0, 7)
      const actuel = m.get(cle) ?? { nb: 0, profit: voitProfit ? 0 : null }
      m.set(cle, {
        nb: actuel.nb + 1,
        profit: actuel.profit === null ? null : actuel.profit + (v.profit_net ?? 0),
      })
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  }, [ventes, voitProfit])

  const parSource = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sources) {
      const cle = s.source ?? 'Inconnue'
      m.set(cle, (m.get(cle) ?? 0) + Number(s.leads ?? 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [sources])

  const maxSource = Math.max(1, ...parSource.map(([, n]) => n))

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  return (
    <div className="page">
      <h1 className="titre-page">Tableaux de bord</h1>
      <p className="intro-page">
        L’état du stock, de l’affichage web, des ventes et des leads. Les montants
        suivent vos droits — ce que vous ne voyez pas est masqué par la base.
      </p>

      {erreur && <p className="message-erreur">{erreur}</p>}

      {stock && (
        <section className="bloc">
          <h2>Stock</h2>
          <div className="compteurs">
            <Chiffre valeur={nombre(stock.vehicules_en_stock)} libelle="En stock" />
            <Chiffre valeur={nombre(stock.vieillissants)} libelle="Vieillissants" ton="attente" />
            <Chiffre valeur={nombre(stock.age_moyen)} libelle="Âge moyen (j)" />
            <Chiffre valeur={nombre(stock.age_median)} libelle="Âge médian (j)" />
            {stock.capital_immobilise !== null && (
              <Chiffre
                valeur={argentCompact(stock.capital_immobilise)}
                libelle="Capital immobilisé"
                exact={argent(stock.capital_immobilise)}
              />
            )}
            <Chiffre valeur={nombre(stock.non_affiches)} libelle="Non affichés" ton="attente" />
            <Chiffre valeur={nombre(stock.sans_vin)} libelle="Sans VIN" ton="critique" />
          </div>
        </section>
      )}

      {affichage && (
        <section className="bloc">
          <h2>Affichage web</h2>
          <div className="compteurs">
            <Chiffre valeur={nombre(affichage.en_ligne)} libelle="En ligne" ton="disponible" />
            <Chiffre valeur={nombre(affichage.hors_ligne)} libelle="Hors ligne" ton="attente" />
            <Chiffre valeur={nombre(affichage.affiches_sans_photo)} libelle="Sans photo" ton="attente" />
            <Chiffre valeur={nombre(affichage.affiches_moins_10_photos)} libelle="Moins de 10 photos" />
            <Chiffre valeur={nombre(affichage.photos_moyennes)} libelle="Photos en moyenne" />
            <Chiffre
              valeur={affichage.pct_en_ligne !== null ? `${Math.round(affichage.pct_en_ligne)} %` : '—'}
              libelle="Taux en ligne"
            />
          </div>
          <p className="note">
            Alimenté par le relevé n8n aux 5 minutes — l’application ne fait que lire.
          </p>
        </section>
      )}

      <section className="bloc">
        <h2>Ventes</h2>
        <div className="compteurs">
          <Chiffre valeur={nombre(resumeVentes.nb)} libelle="Véhicules vendus" ton="disponible" />
          <Chiffre valeur={argent(resumeVentes.prixMoyen)} libelle="Prix de vente moyen" />
          {voitProfit && (
            <>
              <Chiffre valeur={argent(resumeVentes.profitMoyen)} libelle="Profit moyen" />
              <Chiffre
                valeur={argentCompact(resumeVentes.profitTotal)}
                libelle="Profit total"
                exact={argent(resumeVentes.profitTotal)}
              />
            </>
          )}
          <Chiffre valeur={nombre(resumeVentes.joursMoyen)} libelle="Jours avant vente" />
        </div>

        {parMois.length > 0 && (
          <div className="tableau-defilant espace-haut">
            <table className="tableau">
              <thead>
                <tr><th>Mois de réception</th><th>Vendus</th>{voitProfit && <th>Profit</th>}</tr>
              </thead>
              <tbody>
                {parMois.map(([mois, d]) => (
                  <tr key={mois}>
                    <td>{mois}</td>
                    <td>{nombre(d.nb)}</td>
                    {voitProfit && <td>{argent(d.profit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!voitProfit && (
          <p className="note">Les montants de profit ne vous sont pas accessibles.</p>
        )}
      </section>

      {parSource.length > 0 && (
        <section className="bloc">
          <h2>Leads par source</h2>
          <ul className="barres">
            {parSource.map(([source, n]) => (
              <li key={source}>
                <span className="barre-libelle">{source}</span>
                <span className="barre-piste">
                  <span className="barre-remplie" style={{ width: `${(n / maxSource) * 100}%` }} />
                </span>
                <span className="barre-valeur">{nombre(n)}</span>
              </li>
            ))}
          </ul>
          <p className="note">
            Leads SM360 synchronisés par n8n aux 2 minutes, plus les visites saisies
            à l’interne. <Link to="/visites">Voir les visites du jour</Link>.
          </p>
        </section>
      )}

      {sansLead.length > 0 && (
        <section className="bloc">
          <h2>Disponibles sans lead depuis 30 jours</h2>
          <p className="note sans-marge">
            En ligne, en inventaire depuis plus de 30 jours, aucun lead le mois dernier.
            Un prix ou des photos à revoir.
          </p>
          <div className="tableau-defilant espace-haut">
            <table className="tableau">
              <thead>
                <tr><th>Stock</th><th>Véhicule</th><th>Prix</th><th>Jours</th><th>Photos</th></tr>
              </thead>
              <tbody>
                {sansLead.slice(0, 25).map((s) => (
                  <tr key={s.no_stock}>
                    <td><strong>{s.no_stock}</strong></td>
                    <td className="discret">{texte(s.vehicule)}</td>
                    <td>{argent(s.prix_vente)}</td>
                    <td className={(s.jours_inventaire ?? 0) > 90 ? 'jours-alerte' : ''}>
                      {nombre(s.jours_inventaire)}
                    </td>
                    <td className={(s.photos ?? 0) < 10 ? 'jours-alerte' : ''}>
                      {nombre(s.photos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sansLead.length > 25 && (
            <p className="note">{sansLead.length - 25} autres non affichés.</p>
          )}
        </section>
      )}
    </div>
  )
}
