import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { argent, texte } from '../lib/format'
import type { CodeReparation, VehiculeApp } from '../lib/types'

type LigneSignature = {
  id: string
  description: string | null
  cout: number | null
  code_reparation_id: number | null
}

type Calcul = {
  base: number | null
  marge: number | null
  brut: number | null
  plancher: number
  plafond: number
  prix: number
}

type Dommage = { id: string; chemin_storage: string; nom_fichier: string | null }

/**
 * Écran tournable vers le client (brief §5.5) : « tel quel » à gauche, « avec
 * Signature » à droite. Le prix Signature n'est jamais deviné — s'il n'est
 * pas calculable (plancher/plafond absents, ou droit manquant), l'écran le
 * dit plutôt que d'improviser un chiffre devant un client.
 */
export function Desking() {
  const { id } = useParams<{ id: string }>()
  const { aLeDroit } = useMoi()

  const [vehicule, setVehicule] = useState<VehiculeApp | null>(null)
  const [lignes, setLignes] = useState<LigneSignature[]>([])
  const [codes, setCodes] = useState<CodeReparation[]>([])
  const [dommages, setDommages] = useState<Dommage[]>([])
  const [exclues, setExclues] = useState<Set<string>>(new Set())
  const [calcul, setCalcul] = useState<Calcul | null>(null)
  const [erreurCalcul, setErreurCalcul] = useState<string | null>(null)

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)

  const peutDesker = aLeDroit('vente.enregistrer') || aLeDroit('vehicule.voir_couts')

  const charger = useCallback(async () => {
    if (!id) return
    setErreur(null)

    const [v, s, c] = await Promise.all([
      supabase.from('v_vehicule_app').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_inspection_statut_app').select('inspection_id')
        .eq('vehicule_id', id).order('cree_le', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('code_reparation').select('id, code, description').order('id'),
    ])

    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Véhicule introuvable.')
      setChargement(false)
      return
    }
    setVehicule(v.data as unknown as VehiculeApp)
    setCodes((c.data ?? []) as CodeReparation[])

    const idInspection = (s.data as { inspection_id: string } | null)?.inspection_id ?? null

    const [l, d] = await Promise.all([
      idInspection
        ? supabase.from('inspection_ligne')
            .select('id, description, cout, code_reparation_id')
            .eq('inspection_id', idInspection).eq('decision', 'signature').eq('complete', false)
            .order('no_ligne')
        : Promise.resolve({ data: [] as LigneSignature[] }),
      supabase.from('document').select('id, chemin_storage, nom_fichier')
        .eq('vehicule_id', id).eq('type', 'dommage'),
    ])
    setLignes((l.data ?? []) as LigneSignature[])
    setDommages((d.data ?? []) as Dommage[])
    setChargement(false)
  }, [id])

  useEffect(() => { charger() }, [charger])

  const recalculer = useCallback(async (exclusions: Set<string>) => {
    if (!id || lignes.length === 0) { setCalcul(null); setErreurCalcul(null); return }
    setErreurCalcul(null)
    const { data, error } = await supabase.rpc('fn_calcul_signature', {
      p_vehicule: id, p_lignes_exclues: [...exclusions],
    })
    if (error) { setCalcul(null); setErreurCalcul(messageErreur(error)); return }
    setCalcul((Array.isArray(data) ? data[0] : data) as Calcul)
  }, [id, lignes.length])

  useEffect(() => { if (peutDesker) recalculer(exclues) }, [recalculer, exclues, peutDesker])

  function basculerLigne(ligneId: string) {
    setExclues((s) => {
      const suite = new Set(s)
      if (suite.has(ligneId)) suite.delete(ligneId); else suite.add(ligneId)
      return suite
    })
  }

  const lignesIncluses = useMemo(() => lignes.filter((l) => !exclues.has(l.id)), [lignes, exclues])

  async function ouvrirDommage(chemin: string) {
    const { data, error } = await supabase.storage.from('vehicules').createSignedUrl(chemin, 120)
    if (error || !data) { setErreur(messageErreur(error)); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  /**
   * Le bon de préparation à la clôture (brief §5.5) : les travaux Signature
   * retenus par le client deviennent la demande envoyée au service — la même
   * mécanique que la réception d'un neuf, réutilisée telle quelle.
   */
  async function genererBonPreparation() {
    if (!id || lignesIncluses.length === 0) return
    setAction('bon'); setErreur(null); setSucces(null)

    const { data: demandeId, error: e1 } = await supabase.rpc('creer_demande_travaux', {
      p_vehicule: id, p_notes: 'Bon de préparation — programme Signature', p_origine: 'manuelle',
    })
    if (e1 || !demandeId) { setErreur(messageErreur(e1)); setAction(null); return }

    for (let i = 0; i < lignesIncluses.length; i++) {
      const { error: e2 } = await supabase.from('demande_travaux_ligne').insert({
        demande_id: demandeId, no_ligne: i + 1, categorie: 'mecanique',
        description: lignesIncluses[i].description ?? 'Travail Signature',
      })
      if (e2) { setErreur(messageErreur(e2)); setAction(null); return }
    }

    const { error: e3 } = await supabase.rpc('envoyer_demande_travaux', { p_demande: demandeId })
    if (e3) { setErreur(messageErreur(e3)); setAction(null); return }

    setSucces('Bon de préparation envoyé au service.')
    setAction(null)
  }

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!vehicule) {
    return (
      <div className="page">
        <p className="message-erreur">{erreur ?? 'Véhicule introuvable.'}</p>
        <Link to="/inventaire" className="bouton-secondaire">Retour</Link>
      </div>
    )
  }

  if (!peutDesker) {
    return (
      <div className="page">
        <p className="message-erreur">Vous n’avez pas le droit d’ouvrir le desking.</p>
        <Link to={`/vehicule/${vehicule.id}`} className="bouton-secondaire">← Fiche du véhicule</Link>
      </div>
    )
  }

  const v = vehicule
  const prixAvecSignature = calcul && v.prix_vente !== null ? v.prix_vente + calcul.prix : null

  return (
    <div className="page desking">
      <Link to={`/vehicule/${v.id}`} className="retour no-print">← Fiche du véhicule</Link>

      <header className="fiche-entete">
        <div>
          <h1 className="titre-page">{v.no_stock ?? 'Sans numéro'}</h1>
          <p className="fiche-titre">{v.vehicule_titre}</p>
        </div>
      </header>

      {erreur && <p className="message-erreur no-print">{erreur}</p>}
      {succes && <p className="bandeau-succes no-print">{succes}</p>}

      {erreurCalcul && (
        <p className="message-avertissement no-print">
          Prix Signature indisponible : {erreurCalcul}
          {erreurCalcul.includes('configur') && (
            <> — <Link to="/reglages">à régler dans Réglages</Link>.</>
          )}
        </p>
      )}

      <div className="desking-colonnes">
        <section className="bloc desking-colonne">
          <h2>Tel quel</h2>
          <p className="desking-prix">{argent(v.prix_vente)}</p>
          <dl className="fiche-grille">
            {v.lien_carfax && (
              <div className="ligne"><dt>Carfax</dt>
                <dd><a href={v.lien_carfax} target="_blank" rel="noopener noreferrer">Ouvrir le rapport</a></dd></div>
            )}
            <div className="ligne"><dt>Inspection</dt><dd>Complète, disponible sur demande</dd></div>
            <div className="ligne"><dt>SAAQ</dt>
              <dd>{v.requiert_inspection_saaq ? (v.saaq_complete_le ? 'Faite' : 'À faire') : 'Non requise'}</dd></div>
          </dl>

          {dommages.length > 0 && (
            <>
              <h3>Photos de dommages</h3>
              <ul className="liste-simple">
                {dommages.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="bouton-discret no-print"
                            onClick={() => ouvrirDommage(d.chemin_storage)}>
                      {texte(d.nom_fichier)}
                    </button>
                    <span className="print-only">{texte(d.nom_fichier)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="bloc desking-colonne desking-signature">
          <h2>Avec Signature</h2>
          <p className="desking-prix">
            {prixAvecSignature !== null ? argent(prixAvecSignature) : '—'}
          </p>
          {calcul && (
            <p className="note sans-marge">
              Prix + {argent(calcul.prix)} de Signature — programme incluant les travaux ci-dessous.
            </p>
          )}
          <p className="note">−1 % de taux d’intérêt avec le programme Signature.</p>

          <h3>Travaux inclus — décochables</h3>
          {lignes.length === 0 ? (
            <p className="note sans-marge">Aucun travail Signature identifié pour ce véhicule.</p>
          ) : (
            <ul className="lignes-inspection">
              {lignes.map((l) => {
                const code = codes.find((c) => c.id === l.code_reparation_id)
                return (
                  <li key={l.id} className="ligne-inspection">
                    <label className="case">
                      <input
                        type="checkbox"
                        checked={!exclues.has(l.id)}
                        onChange={() => basculerLigne(l.id)}
                        className="no-print"
                      />
                      <span className={exclues.has(l.id) ? 'discret' : ''}>
                        {texte(l.description)} {code ? `(${code.code})` : ''}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="vehicule-actions no-print">
        <button type="button" className="bouton-secondaire" onClick={() => window.print()}>
          Imprimer le résumé
        </button>
        <button
          type="button" className="bouton-principal"
          disabled={action !== null || lignesIncluses.length === 0}
          onClick={genererBonPreparation}
        >
          {action === 'bon' ? 'Envoi…' : 'Confirmer et générer le bon de préparation'}
        </button>
      </div>
    </div>
  )
}
