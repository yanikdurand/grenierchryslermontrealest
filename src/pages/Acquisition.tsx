import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { decoderVin } from '../lib/nhtsa'
import { MARQUES, chargerModeles } from '../lib/referentielVehicules'
import { Info } from '../composants/Info'
import type { Fournisseur, TypeDocument } from '../lib/types'

const ECHANGE_CLIENT = 'Échange client'
const FOURNISSEUR_AUTRE = 'Autres'
const LONGUEUR_VIN = 17

/** Valeur sentinelle des menus déroulants qui bascule vers la saisie libre. */
const VALEUR_AUTRE = '__autre__'

type Televersement = { fichier: File; type: TypeDocument }

/** Un VIN ne contient jamais I, O ni Q — même règle que `creer_vehicule`. */
function vinInvalide(vin: string): string | null {
  const propre = vin.trim().toUpperCase()
  if (propre.length === 0) return 'Le VIN est obligatoire.'
  if (propre.length !== LONGUEUR_VIN) {
    return `Le VIN doit compter ${LONGUEUR_VIN} caractères (saisi : ${propre.length}).`
  }
  if (/[IOQ]/.test(propre)) {
    return 'Un VIN ne contient jamais les lettres I, O ou Q — vérifiez la saisie.'
  }
  return null
}

function extension(nom: string): string {
  const point = nom.lastIndexOf('.')
  return point > -1 ? nom.slice(point + 1).toLowerCase() : 'bin'
}

export function Acquisition() {
  const navigate = useNavigate()
  const { utilisateur } = useMoi()

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])

  // Obligatoires
  const [noStock, setNoStock] = useState('')
  const [vin, setVin] = useState('')
  const [marque, setMarque] = useState('')
  const [marqueAutre, setMarqueAutre] = useState('')
  const [modele, setModele] = useState('')
  const [modeleAutre, setModeleAutre] = useState('')
  const [annee, setAnnee] = useState('')
  const [prixAchat, setPrixAchat] = useState('')
  const [lienCarfax, setLienCarfax] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [fournisseurAutre, setFournisseurAutre] = useState('')
  const [justificatif, setJustificatif] = useState<File | null>(null)

  // Conditionnels
  const [immatriculation, setImmatriculation] = useState<File | null>(null)
  const [requiertSaaq, setRequiertSaaq] = useState<'' | 'oui' | 'non'>('')

  // Lien existant
  const [lienExistant, setLienExistant] = useState(false)
  const [lienExistantNote, setLienExistantNote] = useState('')

  // Optionnels
  const [km, setKm] = useState('')
  const [trim, setTrim] = useState('')
  const [garantieComplete, setGarantieComplete] = useState('')
  const [garantieMotopropulseur, setGarantieMotopropulseur] = useState('')
  const [garantieProlongee, setGarantieProlongee] = useState('')
  const [rappels, setRappels] = useState('')
  const [dateMiseEnService, setDateMiseEnService] = useState('')
  const [notes, setNotes] = useState('')

  const [erreur, setErreur] = useState<string | null>(null)
  const [avertissement, setAvertissement] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  // Modèle en menu déroulant, cascadé sur la marque et l'année — la marque
  // elle-même vient de la liste éditoriale `MARQUES`, pas de NHTSA (voir
  // referentielVehicules.ts : NHTSA mélange marques grand public et
  // fabricants de balayeuses).
  const [modeles, setModeles] = useState<string[]>([])
  const [chargementModeles, setChargementModeles] = useState(false)

  // Décodage VIN — se déclenche seul dès que le VIN est valide.
  const [decodage, setDecodage] = useState<'inactif' | 'encours' | 'succes' | 'echec'>('inactif')
  const [decodageMessage, setDecodageMessage] = useState<string | null>(null)
  const [dernierVinDecode, setDernierVinDecode] = useState('')

  // Doublon de VIN ou de numéro de stock — un avertissement, pas un blocage :
  // `creer_vehicule` refuse déjà le doublon à l'envoi (contrainte UNIQUE en
  // base). Ceci n'existe que pour éviter de remplir tout le formulaire, pièce
  // jointe comprise, avant de le découvrir.
  type VehiculeExistant = { id: string; titre: string } | null
  const [vinExistant, setVinExistant] = useState<VehiculeExistant>(null)
  const [noStockExistant, setNoStockExistant] = useState<VehiculeExistant>(null)

  const marqueEffective = marque === VALEUR_AUTRE ? marqueAutre.trim() : marque
  const modeleEffectif = modele === VALEUR_AUTRE ? modeleAutre.trim() : modele

  // Le modèle dépend de la marque et de l'année : impossible de filtrer sans les deux.
  useEffect(() => {
    const anneeNombre = Number(annee)
    if (!marqueEffective || marque === VALEUR_AUTRE || !anneeNombre || anneeNombre < 1900) {
      setModeles([])
      return
    }
    let annule = false
    setChargementModeles(true)
    chargerModeles(marqueEffective, anneeNombre)
      .then((liste) => { if (!annule) setModeles(liste) })
      .catch(() => { if (!annule) setModeles([]) })
      .finally(() => { if (!annule) setChargementModeles(false) })
    return () => { annule = true }
  }, [marqueEffective, marque, annee])

  /**
   * Décodage automatique dès que le VIN est valide — la réception saisit un
   * VIN à la fois et veut voir la marque apparaître sans clic supplémentaire.
   * Un débounce de 400 ms évite de décoder à chaque frappe pendant qu'on
   * termine de le taper ou de le coller.
   */
  useEffect(() => {
    const propre = vin.trim().toUpperCase()
    if (propre.length !== LONGUEUR_VIN || vinInvalide(propre) || propre === dernierVinDecode) return

    const delai = setTimeout(async () => {
      setDecodage('encours')
      setDecodageMessage(null)
      try {
        const d = await decoderVin(propre)
        setDernierVinDecode(propre)

        // Fonctionnel plutôt que via la variable fermée : le décodage prend
        // près d'une seconde, largement le temps de commencer à taper
        // ailleurs dans le formulaire pendant qu'il tourne.
        const marqueDecodee = d.marque?.toUpperCase() ?? null
        if (marqueDecodee) setMarque((m) => m || marqueDecodee)
        if (d.annee) setAnnee((a) => a || String(d.annee))
        if (d.trim) setTrim((t) => t || d.trim!)

        // Le modèle rejoint le menu NHTSA s'il s'y trouve, sinon la saisie
        // libre — on connaît déjà marque et année, pas la peine d'attendre
        // que l'effet de cascade les rattrape.
        if (d.modele && marqueDecodee && d.annee) {
          const modeleDecode = d.modele.toUpperCase()
          const liste = await chargerModeles(marqueDecodee, d.annee).catch((): string[] => [])
          setModele((m) => {
            if (m) return m
            if (liste.includes(modeleDecode)) return modeleDecode
            setModeleAutre(modeleDecode)
            return VALEUR_AUTRE
          })
        }

        setDecodage('succes')
        setDecodageMessage(
          [d.annee, d.marque, d.modele].filter(Boolean).join(' ') || 'VIN décodé.'
        )
      } catch (e) {
        setDecodage('echec')
        setDecodageMessage(e instanceof Error ? e.message : 'Le décodage a échoué.')
      }
    }, 400)

    return () => clearTimeout(delai)
  }, [vin, dernierVinDecode])

  /**
   * Le VIN est unique en base (contrainte `vehicule_vin_key`) : un doublon
   * est déjà structurellement impossible. Ce qui manquait, c'est de le dire
   * avant que la personne ait rempli quinze champs et joint une facture.
   */
  useEffect(() => {
    const propre = vin.trim().toUpperCase()
    if (propre.length !== LONGUEUR_VIN || vinInvalide(propre)) { setVinExistant(null); return }

    let annule = false
    const delai = setTimeout(async () => {
      const { data } = await supabase
        .from('v_vehicule_app')
        .select('id, no_stock, vehicule_titre')
        .eq('vin', propre)
        .maybeSingle()
      if (!annule) {
        setVinExistant(data ? { id: data.id, titre: `${data.no_stock} — ${data.vehicule_titre}` } : null)
      }
    }, 400)

    return () => { annule = true; clearTimeout(delai) }
  }, [vin])

  /** Même principe pour le numéro de stock (contrainte `vehicule_no_stock_key`). */
  useEffect(() => {
    const propre = noStock.trim().toUpperCase()
    if (!propre) { setNoStockExistant(null); return }

    let annule = false
    const delai = setTimeout(async () => {
      const { data } = await supabase
        .from('v_vehicule_app')
        .select('id, no_stock, vehicule_titre')
        .eq('no_stock', propre)
        .maybeSingle()
      if (!annule) {
        setNoStockExistant(data ? { id: data.id, titre: data.vehicule_titre } : null)
      }
    }, 400)

    return () => { annule = true; clearTimeout(delai) }
  }, [noStock])

  useEffect(() => {
    supabase
      .from('fournisseur')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setFournisseurs((data as Fournisseur[]) ?? []))
  }, [])

  const estEchange = fournisseur === ECHANGE_CLIENT
  const typeJustificatif: TypeDocument = estEchange ? 'evaluation_echange' : 'facture_fournisseur'
  const libelleJustificatif = estEchange
    ? "Feuille d'évaluation"
    : 'Facture du fournisseur'

  /**
   * Le champ SAAQ n'apparaît qu'une fois l'immatriculation jointe, et devient
   * alors obligatoire (brief §3, étape 1).
   */
  const saaqRequisPourFormulaire = immatriculation !== null

  const pretAEnvoyer = useMemo(() => {
    if (!noStock.trim() || !marqueEffective || !modeleEffectif) return false
    if (vinInvalide(vin)) return false
    if (!annee || !prixAchat || !lienCarfax.trim()) return false
    if (!fournisseur) return false
    if (fournisseur === FOURNISSEUR_AUTRE && !fournisseurAutre.trim()) return false
    if (!justificatif) return false
    if (saaqRequisPourFormulaire && requiertSaaq === '') return false
    return true
  }, [
    noStock, marqueEffective, modeleEffectif, vin, annee, prixAchat, lienCarfax,
    fournisseur, fournisseurAutre, justificatif, saaqRequisPourFormulaire, requiertSaaq,
  ])

  // Si le décodage propose une marque hors de la liste éditoriale (un import
  // rare, par exemple), elle reste visible dans le menu plutôt que de
  // disparaître silencieusement.
  const optionsMarque = useMemo(() => {
    const s = new Set(MARQUES)
    if (marque && marque !== VALEUR_AUTRE) s.add(marque)
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [marque])

  const optionsModele = useMemo(() => {
    const s = new Set(modeles)
    if (modele && modele !== VALEUR_AUTRE) s.add(modele)
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [modeles, modele])

  async function televerser(vehiculeId: string, envois: Televersement[]): Promise<string[]> {
    const echecs: string[] = []

    for (const { fichier, type } of envois) {
      const chemin = `${vehiculeId}/${type}-${Date.now()}.${extension(fichier.name)}`

      const { error: erreurStockage } = await supabase.storage
        .from('vehicules')
        .upload(chemin, fichier, { contentType: fichier.type || undefined })

      if (erreurStockage) {
        echecs.push(type)
        continue
      }

      const { error: erreurLigne } = await supabase.from('document').insert({
        vehicule_id: vehiculeId,
        type,
        chemin_storage: chemin,
        nom_fichier: fichier.name,
        taille_octets: fichier.size,
        mime: fichier.type || null,
        ajoute_par: utilisateur?.id ?? null,
      })

      if (erreurLigne) echecs.push(type)
    }

    return echecs
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setAvertissement(null)

    const probleme = vinInvalide(vin)
    if (probleme) {
      setErreur(probleme)
      return
    }
    if (!justificatif) {
      setErreur(`${libelleJustificatif} est obligatoire.`)
      return
    }

    setEnvoi(true)

    // 1. Création du véhicule — c'est `creer_vehicule` qui applique les règles.
    const { data: vehiculeId, error } = await supabase.rpc('creer_vehicule', {
      p_no_stock: noStock.trim(),
      p_vin: vin.trim().toUpperCase(),
      p_marque: marqueEffective,
      p_modele: modeleEffectif,
      p_annee: Number(annee),
      p_prix_achat: Number(prixAchat),
      p_lien_carfax: lienCarfax.trim(),
      p_fournisseur: fournisseur || null,
      p_fournisseur_autre: fournisseur === FOURNISSEUR_AUTRE ? fournisseurAutre.trim() : null,
      p_lien_existant: lienExistant,
      p_lien_existant_note: lienExistant ? lienExistantNote.trim() || null : null,
      p_requiert_saaq: saaqRequisPourFormulaire ? requiertSaaq === 'oui' : false,
      p_km: km ? Number(km) : null,
      p_trim: trim.trim() || null,
      p_garantie_complete: garantieComplete.trim() || null,
      p_garantie_motopropulseur: garantieMotopropulseur.trim() || null,
      p_garantie_prolongee: garantieProlongee.trim() || null,
      p_rappels: rappels.trim() || null,
      p_date_mise_en_service: dateMiseEnService || null,
      p_notes: notes.trim() || null,
    })

    if (error || !vehiculeId) {
      setErreur(messageErreur(error))
      setEnvoi(false)
      return
    }

    // 2. Pièces jointes. Le véhicule existe déjà : un échec de téléversement
    //    ne doit pas le faire disparaître, il est signalé à l'écran suivant.
    const envois: Televersement[] = [{ fichier: justificatif, type: typeJustificatif }]
    if (immatriculation) envois.push({ fichier: immatriculation, type: 'immatriculation' })

    const echecs = await televerser(vehiculeId as string, envois)

    navigate('/inventaire', {
      state: {
        creation: {
          noStock: noStock.trim().toUpperCase(),
          documentsEnEchec: echecs,
        },
      },
    })
  }

  return (
    <div className="page">
      <h1 className="titre-page">Nouvelle acquisition</h1>
      <p className="intro-page">
        Le véhicule sera créé au statut <strong>ATT. RÉCEPTION</strong>, puis apparaîtra
        dans la liste pour être marqué reçu à son arrivée.
      </p>

      <form onSubmit={soumettre} className="formulaire">
        <section className="bloc">
          <h2>Identification</h2>
          <div className="grille">
            <label className="champ">
              <span>Numéro de stock <em>obligatoire</em></span>
              <input
                className={noStockExistant ? 'avertissement' : undefined}
                value={noStock}
                onChange={(e) => setNoStock(e.target.value.toUpperCase())}
                required
                autoFocus
              />
              {noStockExistant && (
                <small className="indice-avertissement">
                  Déjà utilisé — <Link to={`/vehicule/${noStockExistant.id}`}>
                    {noStockExistant.titre}
                  </Link>
                </small>
              )}
            </label>

            <label className="champ">
              <span>
                VIN <em>obligatoire — 17 caractères</em>
                <Info texte="Le décodage se lance seul dès que le VIN est complet et valide : marque, modèle, année et version sont proposés à partir de là — à vérifier avant d'envoyer." />
              </span>
              <input
                className={vinExistant ? 'avertissement' : undefined}
                value={vin}
                onChange={(e) => { setVin(e.target.value.toUpperCase()); setDecodage('inactif') }}
                maxLength={LONGUEUR_VIN}
                required
                spellCheck={false}
              />
              {vin.length > 0 && vinInvalide(vin) && (
                <small className="indice-erreur">{vinInvalide(vin)}</small>
              )}
              {vinExistant && (
                <small className="indice-avertissement">
                  Déjà en inventaire — <Link to={`/vehicule/${vinExistant.id}`}>
                    {vinExistant.titre}
                  </Link>
                </small>
              )}
              {decodage === 'encours' && <small>Décodage du VIN…</small>}
              {decodage === 'echec' && (
                <small className="indice-erreur">
                  {decodageMessage} <button
                    type="button" className="bouton-discret"
                    onClick={() => setDernierVinDecode('')}
                  >Réessayer</button>
                </small>
              )}
            </label>

            <label className="champ">
              <span>
                Année <em>obligatoire</em>
                <Info texte="Choisie avant la marque : le menu Modèle en dépend, comme sur AutoTrader." />
              </span>
              <input
                type="number"
                value={annee}
                onChange={(e) => setAnnee(e.target.value)}
                min={1900}
                max={new Date().getFullYear() + 2}
                required
              />
            </label>

            <label className="champ">
              <span>Marque <em>obligatoire</em></span>
              <select
                value={marque}
                onChange={(e) => { setMarque(e.target.value); setModele('') }}
                required
              >
                <option value="">Choisir…</option>
                {optionsMarque.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value={VALEUR_AUTRE}>Autre — préciser…</option>
              </select>
              {marque === VALEUR_AUTRE && (
                <input
                  className="espace-haut"
                  value={marqueAutre}
                  onChange={(e) => setMarqueAutre(e.target.value.toUpperCase())}
                  placeholder="Marque"
                  required
                  autoFocus
                />
              )}
            </label>

            <label className="champ">
              <span>
                Modèle <em>obligatoire</em>
                <Info texte="Vient de NHTSA pour la marque et l'année choisies. Marque absente de la liste ou modèle non reconnu : choisissez « Autre »." />
              </span>
              <select
                value={modele}
                onChange={(e) => setModele(e.target.value)}
                disabled={!marqueEffective || marque === VALEUR_AUTRE}
                required
              >
                <option value="">
                  {!marqueEffective || marque === VALEUR_AUTRE
                    ? 'Choisir la marque…'
                    : !annee ? 'Choisir l’année…'
                    : chargementModeles ? 'Chargement…' : 'Choisir…'}
                </option>
                {optionsModele.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value={VALEUR_AUTRE}>Autre — préciser…</option>
              </select>
              {modele === VALEUR_AUTRE && (
                <input
                  className="espace-haut"
                  value={modeleAutre}
                  onChange={(e) => setModeleAutre(e.target.value.toUpperCase())}
                  placeholder="Modèle"
                  required
                  autoFocus
                />
              )}
            </label>

            <label className="champ">
              <span>
                Version <em>optionnel</em>
                <Info texte="Suggérée par le décodage du VIN quand disponible — un VIN n'encode qu'une seule version, à corriger au besoin." />
              </span>
              <input value={trim} onChange={(e) => setTrim(e.target.value)} />
            </label>

            <label className="champ">
              <span>Kilométrage <em>optionnel</em></span>
              <input type="number" value={km} onChange={(e) => setKm(e.target.value)} min={0} />
            </label>
          </div>
        </section>

        <section className="bloc">
          <h2>Provenance</h2>
          <div className="grille">
            <label className="champ">
              <span>Prix d’achat <em>obligatoire</em></span>
              <input
                type="number"
                value={prixAchat}
                onChange={(e) => setPrixAchat(e.target.value)}
                min={0}
                step="0.01"
                required
              />
            </label>

            <label className="champ">
              <span>Lien Carfax <em>obligatoire</em></span>
              <input
                type="url"
                value={lienCarfax}
                onChange={(e) => setLienCarfax(e.target.value)}
                placeholder="https://…"
                required
              />
            </label>

            <label className="champ">
              <span>Fournisseur <em>obligatoire</em></span>
              <select value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required>
                <option value="">Choisir…</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.nom}>{f.nom}</option>
                ))}
              </select>
            </label>

            {fournisseur === FOURNISSEUR_AUTRE && (
              <label className="champ">
                <span>Préciser le fournisseur <em>obligatoire</em></span>
                <input
                  value={fournisseurAutre}
                  onChange={(e) => setFournisseurAutre(e.target.value)}
                  required
                />
              </label>
            )}
          </div>

          <label className="champ champ-fichier">
            <span>
              {libelleJustificatif} <em>obligatoire</em>
              <Info texte={estEchange
                ? "Le véhicule vient d'une reprise : joindre la feuille d'évaluation."
                : 'Joindre la facture reçue du fournisseur.'} />
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
              onChange={(e) => setJustificatif(e.target.files?.[0] ?? null)}
              required
            />
          </label>
        </section>

        <section className="bloc">
          <h2>Immatriculation et SAAQ</h2>

          <label className="champ champ-fichier">
            <span>
              Photo des immatriculations <em>optionnel</em>
              <Info texte="Pas toujours disponible au moment de l'achat — le champ peut rester vide." />
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
              onChange={(e) => {
                setImmatriculation(e.target.files?.[0] ?? null)
                if (!e.target.files?.[0]) setRequiertSaaq('')
              }}
            />
          </label>

          {saaqRequisPourFormulaire && (
            <fieldset className="choix-obligatoire">
              <legend>Inspection SAAQ requise ? <em>obligatoire</em></legend>
              <label className="radio">
                <input
                  type="radio"
                  name="saaq"
                  checked={requiertSaaq === 'oui'}
                  onChange={() => setRequiertSaaq('oui')}
                />
                <span>Oui</span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="saaq"
                  checked={requiertSaaq === 'non'}
                  onChange={() => setRequiertSaaq('non')}
                />
                <span>Non</span>
              </label>
              {requiertSaaq === 'oui' && (
                <p className="note-alerte">
                  Une alerte critique restera visible tant que l’inspection ne sera pas faite.
                  Catherine ou Philippe s’en chargent.
                </p>
              )}
            </fieldset>
          )}
        </section>

        <section className="bloc">
          <h2>Lien existant</h2>
          <label className="case">
            <input
              type="checkbox"
              checked={lienExistant}
              onChange={(e) => setLienExistant(e.target.checked)}
            />
            <span>Un solde reste dû sur ce véhicule</span>
          </label>

          {lienExistant && (
            <>
              <p className="note-alerte">
                Une alerte critique sera visible partout tant que le solde ne sera pas réglé.
              </p>
              <label className="champ">
                <span>Précision <em>optionnel</em></span>
                <input
                  value={lienExistantNote}
                  onChange={(e) => setLienExistantNote(e.target.value)}
                  placeholder="Institution, montant approximatif…"
                />
              </label>
            </>
          )}
        </section>

        <section className="bloc">
          <h2>Garanties et notes <span className="facultatif">facultatif</span></h2>
          <div className="grille">
            <label className="champ">
              <span>Garantie complète</span>
              <input value={garantieComplete} onChange={(e) => setGarantieComplete(e.target.value)} />
            </label>
            <label className="champ">
              <span>Garantie motopropulseur</span>
              <input
                value={garantieMotopropulseur}
                onChange={(e) => setGarantieMotopropulseur(e.target.value)}
              />
            </label>
            <label className="champ">
              <span>Garantie prolongée</span>
              <input value={garantieProlongee} onChange={(e) => setGarantieProlongee(e.target.value)} />
            </label>
            <label className="champ">
              <span>Date de mise en service</span>
              <input
                type="date"
                value={dateMiseEnService}
                onChange={(e) => setDateMiseEnService(e.target.value)}
              />
            </label>
          </div>

          <label className="champ">
            <span>Rappels</span>
            <textarea value={rappels} onChange={(e) => setRappels(e.target.value)} rows={2} />
          </label>

          <label className="champ">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
        </section>

        {erreur && <p className="message-erreur">{erreur}</p>}
        {avertissement && <p className="message-avertissement">{avertissement}</p>}

        <div className="actions">
          <button type="submit" className="bouton-principal" disabled={!pretAEnvoyer || envoi}>
            {envoi ? 'Enregistrement…' : 'Créer le véhicule'}
          </button>
          {!pretAEnvoyer && !envoi && (
            <span className="note">
              Tous les champs obligatoires doivent être remplis, pièce jointe comprise.
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
