import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import {
  annee as libelleAnnee, argent, date, dateCourte, jalon as libelleJalon, nombre, ouiNon, poids,
  texte, transmission as libelleTransmission, typeDocument,
} from '../lib/format'
import type {
  Document, EquipementCoche, Jalon, Lead, Pneu, PrixHistorique, Statut, VehiculeApp,
} from '../lib/types'

function Ligne({ etiquette, valeur }: { etiquette: string; valeur: string }) {
  return (
    <div className="ligne">
      <dt>{etiquette}</dt>
      <dd>{valeur}</dd>
    </div>
  )
}

export function FicheVehicule() {
  const { id } = useParams<{ id: string }>()
  const { aLeDroit } = useMoi()

  const [vehicule, setVehicule] = useState<VehiculeApp | null>(null)
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [equipements, setEquipements] = useState<EquipementCoche[]>([])
  const [pneus, setPneus] = useState<Pneu[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [prix, setPrix] = useState<PrixHistorique[]>([])
  const [jalons, setJalons] = useState<Jalon[]>([])
  const [leads, setLeads] = useState<Lead[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)

  const [nouveauStatut, setNouveauStatut] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')

  const charger = useCallback(async () => {
    if (!id) return
    setErreur(null)

    const [v, st, eq, pn, doc, px, jl, ld] = await Promise.all([
      supabase.from('v_vehicule_app').select('*').eq('id', id).maybeSingle(),
      supabase.from('statut_vehicule').select('id, nom, ordre').order('ordre'),
      supabase.from('v_feuille_equipements').select('equipement_id, equipement, categorie, coche')
        .eq('vehicule_id', id),
      supabase.from('vehicule_pneu').select('id, position, largeur, ratio, diametre, type_pneu, roues')
        .eq('vehicule_id', id),
      supabase.from('document').select('id, type, chemin_storage, nom_fichier, ajoute_le, taille_octets')
        .eq('vehicule_id', id).order('ajoute_le', { ascending: false }),
      supabase.from('prix_historique').select('id, prix, change_le')
        .eq('vehicule_id', id).order('change_le', { ascending: false }),
      supabase.from('vehicule_jalon').select('id, jalon, atteint_le')
        .eq('vehicule_id', id).order('atteint_le'),
      supabase.from('crm_lead').select('id, type_lead, source, statut_crm, date_recu, nom, a_telephone')
        .eq('vehicule_id', id).order('date_recu', { ascending: false }).limit(20),
    ])

    if (v.error || !v.data) {
      setErreur(v.error ? messageErreur(v.error) : 'Véhicule introuvable.')
      setChargement(false)
      return
    }

    const fiche = v.data as unknown as VehiculeApp
    setVehicule(fiche)
    setNouveauStatut(fiche.statut ?? '')
    setNouveauPrix(fiche.prix_vente !== null ? String(fiche.prix_vente) : '')
    setStatuts((st.data ?? []) as Statut[])
    setEquipements(((eq.data ?? []) as EquipementCoche[]).filter((e) => e.coche))
    setPneus((pn.data ?? []) as Pneu[])
    setDocuments((doc.data ?? []) as Document[])
    setPrix((px.data ?? []) as PrixHistorique[])
    setJalons((jl.data ?? []) as Jalon[])
    setLeads((ld.data ?? []) as Lead[])
    setChargement(false)
  }, [id])

  useEffect(() => {
    charger()
  }, [charger])

  async function executer(
    nom: string,
    appel: () => PromiseLike<{ error: unknown }>,
    message: string
  ) {
    setAction(nom)
    setErreur(null)
    setSucces(null)

    const { error } = await appel()
    if (error) {
      setErreur(messageErreur(error))
      setAction(null)
      return
    }

    await charger()
    setSucces(message)
    setAction(null)
  }

  async function ouvrirDocument(chemin: string) {
    setErreur(null)
    const { data, error } = await supabase.storage.from('vehicules').createSignedUrl(chemin, 120)
    if (error || !data) {
      setErreur(messageErreur(error))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!vehicule) {
    return (
      <div className="page">
        <p className="message-erreur">{erreur ?? 'Véhicule introuvable.'}</p>
        <Link to="/inventaire" className="bouton-secondaire">Retour à l’inventaire</Link>
      </div>
    )
  }

  const v = vehicule
  const peutModifier = aLeDroit('vehicule.modifier')
  const peutSaaq = aLeDroit('saaq.completer')
  const voitCouts = v.cout_base_engage !== null
  const voitLeads = v.leads_total !== null

  return (
    <div className="page">
      <Link to="/inventaire" className="retour">← Inventaire</Link>

      <header className="fiche-entete">
        <div>
          <h1 className="titre-page">{v.no_stock}</h1>
          <p className="fiche-titre">{v.vehicule_titre}</p>
        </div>
        <span className="statut gros">{v.statut}</span>
      </header>

      {v.alertes && (
        <p className={`alerte ${v.nb_critiques > 0 ? 'critique' : ''}`}>{v.alertes}</p>
      )}
      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      {peutModifier && (
        <section className="bloc">
          <h2>Actions</h2>
          <div className="actions-fiche">
            <label className="champ champ-inline">
              <span>Statut</span>
              <select value={nouveauStatut} onChange={(e) => setNouveauStatut(e.target.value)}>
                {statuts.map((s) => (
                  <option key={s.id} value={s.nom}>{s.nom}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="bouton-secondaire"
              disabled={action !== null || nouveauStatut === v.statut}
              onClick={() =>
                executer('statut',
                  () => supabase.rpc('changer_statut', { p_vehicule: v.id, p_statut: nouveauStatut }),
                  `Statut changé pour « ${nouveauStatut} ».`)
              }
            >
              {action === 'statut' ? 'Enregistrement…' : 'Changer le statut'}
            </button>
          </div>

          <div className="actions-fiche">
            <label className="champ champ-inline">
              <span>Prix de vente</span>
              <input
                type="number"
                min={0}
                step="1"
                value={nouveauPrix}
                onChange={(e) => setNouveauPrix(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="bouton-secondaire"
              disabled={action !== null || nouveauPrix === String(v.prix_vente ?? '')}
              onClick={() =>
                executer('prix',
                  () => supabase.rpc('maj_prix_vente', {
                    p_vehicule: v.id,
                    p_prix: nouveauPrix === '' ? null : Number(nouveauPrix),
                  }),
                  'Prix de vente enregistré.')
              }
            >
              {action === 'prix' ? 'Enregistrement…' : 'Enregistrer le prix'}
            </button>
          </div>
        </section>
      )}

      <section className="bloc">
        <h2>Caractéristiques</h2>
        <dl className="fiche-grille">
          <Ligne etiquette="VIN" valeur={texte(v.vin)} />
          <Ligne etiquette="Année" valeur={libelleAnnee(v.annee)} />
          <Ligne etiquette="Marque" valeur={texte(v.marque)} />
          <Ligne etiquette="Modèle" valeur={texte(v.modele)} />
          <Ligne etiquette="Version" valeur={texte(v.trim)} />
          <Ligne etiquette="Kilométrage" valeur={nombre(v.km, ' km')} />
          <Ligne etiquette="Transmission" valeur={libelleTransmission(v.transmission)} />
          <Ligne etiquette="Motricité" valeur={texte(v.motricite)} />
          <Ligne etiquette="Couleur extérieure" valeur={texte(v.couleur_exterieur)} />
          <Ligne etiquette="Couleur intérieure" valeur={texte(v.couleur_interieur)} />
          <Ligne etiquette="Nombre de clés" valeur={nombre(v.nb_clefs)} />
          <Ligne etiquette="Passagers" valeur={nombre(v.nb_passagers)} />
          <Ligne etiquette="PNBV" valeur={nombre(v.pnbv)} />
          <Ligne etiquette="Carrosserie" valeur={texte(v.etat_carrosserie)} />
          <Ligne etiquette="Pare-brise" valeur={texte(v.etat_pare_brise)} />
        </dl>
        {v.notes && <p className="notes-fiche"><strong>Notes :</strong> {v.notes}</p>}
        {v.rappels && <p className="notes-fiche"><strong>Rappels :</strong> {v.rappels}</p>}
      </section>

      <section className="bloc">
        <h2>Provenance et finances</h2>
        <dl className="fiche-grille">
          <Ligne etiquette="Fournisseur" valeur={texte(v.fournisseur_autre || v.fournisseur)} />
          <Ligne etiquette="Date de réception" valeur={date(v.date_recu)} />
          <Ligne etiquette="Jours en inventaire" valeur={nombre(v.jours_inventaire)} />
          <Ligne etiquette="Mise en service" valeur={date(v.date_mise_en_service)} />
          <Ligne etiquette="Prix de vente" valeur={argent(v.prix_vente)} />
          {v.prix_achat !== null && <Ligne etiquette="Prix d’achat" valeur={argent(v.prix_achat)} />}
          {v.cout_carfax !== null && <Ligne etiquette="Coût Carfax" valeur={argent(v.cout_carfax)} />}
          {voitCouts && <Ligne etiquette="Recon engagée" valeur={argent(v.cout_base_engage)} />}
          {voitCouts && <Ligne etiquette="Recon à venir" valeur={argent(v.cout_base_a_venir)} />}
          {voitCouts && <Ligne etiquette="Signature potentiel" valeur={argent(v.cout_signature_potentiel)} />}
          {voitCouts && <Ligne etiquette="Valeur garantie" valeur={argent(v.valeur_garantie)} />}
          {v.profit !== null && <Ligne etiquette="Profit" valeur={argent(v.profit)} />}
          <Ligne etiquette="Autorisation" valeur={texte(v.statut_autorisation)} />
        </dl>

        {v.lien_existant && (
          <p className="note-alerte">
            <strong>Lien existant.</strong> {v.lien_existant_note || 'Un solde reste dû sur ce véhicule.'}
          </p>
        )}
        {v.lien_carfax && (
          <p className="note">
            <a href={v.lien_carfax} target="_blank" rel="noopener noreferrer">Ouvrir le rapport Carfax</a>
          </p>
        )}
      </section>

      <section className="bloc">
        <h2>Inspection SAAQ</h2>
        <dl className="fiche-grille">
          <Ligne etiquette="Requise" valeur={ouiNon(v.requiert_inspection_saaq)} />
          <Ligne etiquette="Rendez-vous" valeur={date(v.saaq_rdv_le)} />
          <Ligne etiquette="Complétée le" valeur={date(v.saaq_complete_le)} />
        </dl>

        {v.requiert_inspection_saaq && !v.saaq_complete_le && (
          peutSaaq ? (
            <button
              type="button"
              className="bouton-secondaire"
              disabled={action !== null}
              onClick={() =>
                executer('saaq',
                  () => supabase.rpc('completer_saaq', { p_vehicule: v.id }),
                  'Inspection SAAQ marquée comme faite. L’alerte va disparaître.')
              }
            >
              {action === 'saaq' ? 'Enregistrement…' : 'Marquer l’inspection SAAQ faite'}
            </button>
          ) : (
            <p className="note">Seuls Catherine et Philippe peuvent clore une inspection SAAQ.</p>
          )
        )}
      </section>

      <section className="bloc">
        <h2>Feuille d’équipements</h2>
        <dl className="fiche-grille">
          <Ligne etiquette="Complétion" valeur={nombre(v.feuille_pourcentage, ' %')} />
          <Ligne etiquette="Complétée le" valeur={date(v.feuille_complete_le)} />
          <Ligne etiquette="Dernière modification" valeur={date(v.feuille_derniere_modif)} />
          <Ligne etiquette="Par" valeur={texte(v.feuille_derniere_modif_par)} />
        </dl>

        {equipements.length > 0 ? (
          <ul className="etiquettes">
            {equipements.map((e) => (
              <li key={e.equipement_id} className="etiquette-equipement">{e.equipement}</li>
            ))}
          </ul>
        ) : (
          <p className="note">Aucun équipement coché pour l’instant.</p>
        )}

        {aLeDroit('feuille.saisir') && (
          <div className="vehicule-actions espace-haut">
            <Link to={`/vehicule/${v.id}/feuille`} className="bouton-secondaire">
              {v.feuille_complete_le ? 'Revoir la feuille' : 'Remplir la feuille d’équipements'}
            </Link>
          </div>
        )}
      </section>

      <section className="bloc">
        <h2>Pneus</h2>
        {pneus.length === 0 ? (
          <p className="note">Aucun pneu enregistré.</p>
        ) : (
          <ul className="liste-simple">
            {pneus.map((p) => (
              <li key={p.id}>
                <strong>{p.position === 'principal' ? 'Principaux' : 'Secondaires'}</strong>
                {' — '}
                {p.largeur && p.ratio && p.diametre
                  ? `${p.largeur}/${p.ratio} R${p.diametre}`
                  : 'dimensions non renseignées'}
                {p.type_pneu ? ` · ${p.type_pneu}` : ''}
                {p.roues ? ` · roues ${p.roues}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bloc">
        <h2>Documents</h2>
        {documents.length === 0 ? (
          <p className="note">Aucun document joint.</p>
        ) : (
          <ul className="liste-simple">
            {documents.map((d) => (
              <li key={d.id} className="document">
                <span>
                  <strong>{typeDocument(d.type)}</strong>
                  {' · '}{texte(d.nom_fichier)}
                  {' · '}{poids(d.taille_octets)}
                  {' · '}{dateCourte(d.ajoute_le)}
                </span>
                <button
                  type="button"
                  className="bouton-discret"
                  onClick={() => ouvrirDocument(d.chemin_storage)}
                >
                  Ouvrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bloc">
        <h2>Affichage web</h2>
        <dl className="fiche-grille">
          <Ligne etiquette="En ligne" valeur={ouiNon(v.affiche_en_ligne)} />
          <Ligne etiquette="Photos en ligne" valeur={nombre(v.photos_en_ligne)} />
          <Ligne etiquette="Dernière vérification" valeur={date(v.verifie_le)} />
        </dl>
        {v.lien_fiche_web && (
          <p className="note">
            <a href={v.lien_fiche_web} target="_blank" rel="noopener noreferrer">
              Voir la fiche sur le site
            </a>
          </p>
        )}
      </section>

      {voitLeads && (
        <section className="bloc">
          <h2>Leads</h2>
          <dl className="fiche-grille">
            <Ligne etiquette="Total" valeur={nombre(v.leads_total)} />
            <Ligne etiquette="30 derniers jours" valeur={nombre(v.leads_30j)} />
            <Ligne etiquette="Dernier lead" valeur={date(v.dernier_lead)} />
          </dl>
          {leads.length > 0 && (
            <ul className="liste-simple">
              {leads.map((l) => (
                <li key={l.id}>
                  {dateCourte(l.date_recu)} · {texte(l.source)} · {texte(l.type_lead)}
                  {l.a_telephone ? ' · avec téléphone' : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="bloc">
        <h2>Parcours</h2>
        {jalons.length === 0 ? (
          <p className="note">Aucun jalon posé.</p>
        ) : (
          <ol className="parcours">
            {jalons.map((j) => (
              <li key={j.id}>
                <span className="parcours-jalon">{libelleJalon(j.jalon)}</span>
                <span className="parcours-date">{date(j.atteint_le)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {prix.length > 0 && (
        <section className="bloc">
          <h2>Historique de prix</h2>
          <ul className="liste-simple">
            {prix.map((p) => (
              <li key={p.id}>
                {dateCourte(p.change_le)} — {argent(p.prix)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
