export type Utilisateur = {
  id: string
  nom: string
  email: string | null
  role: string
  actif: boolean
  auth_user_id: string | null
}

export type Fournisseur = {
  id: number
  nom: string
}

export type Statut = {
  id: number
  nom: string
  ordre: number
}

/**
 * `v_vehicule_app` — la vue principale de l'application.
 *
 * Les champs financiers et les leads arrivent à `null` quand l'utilisateur
 * n'a pas le droit correspondant. Le masquage est fait par Postgres, jamais
 * par l'interface : un `null` ici veut dire « pas le droit de voir », pas
 * « pas de valeur ». D'où le `?? '—'` systématique à l'affichage.
 */
export type VehiculeApp = {
  id: string
  no_stock: string
  vin: string | null
  vehicule_titre: string
  annee: number | null
  marque: string | null
  modele: string | null
  trim: string | null
  transmission: string | null
  motricite: string | null
  km: number | null
  couleur_exterieur: string | null
  couleur_interieur: string | null
  statut: string | null
  statut_ordre: number | null
  fournisseur: string | null
  fournisseur_autre: string | null
  nb_clefs: number | null
  nb_passagers: number | null
  pnbv: number | null
  etat_carrosserie: string | null
  etat_pare_brise: string | null
  rappels: string | null
  notes: string | null
  garantie_complete: string | null
  garantie_motopropulseur: string | null
  garantie_prolongee: string | null
  lien_carfax: string | null
  lien_existant: boolean | null
  lien_existant_note: string | null
  requiert_inspection_saaq: boolean | null
  saaq_rdv_le: string | null
  saaq_complete_le: string | null
  date_recu: string | null
  date_mise_en_service: string | null
  jours_inventaire: number | null
  affiche_en_ligne: boolean | null
  photos_en_ligne: number | null
  lien_fiche_web: string | null
  verifie_le: string | null
  prix_vente: number | null
  prix_achat: number | null
  cout_carfax: number | null
  cout_base_engage: number | null
  cout_signature_engage: number | null
  cout_base_a_venir: number | null
  cout_signature_potentiel: number | null
  valeur_garantie: number | null
  profit: number | null
  statut_autorisation: string | null
  feuille_pourcentage: number | null
  feuille_complete_le: string | null
  feuille_derniere_modif: string | null
  feuille_derniere_modif_par: string | null
  nb_alertes: number
  nb_critiques: number
  alertes: string | null
  leads_total: number | null
  leads_30j: number | null
  dernier_lead: string | null
}

export type Pneu = {
  id: string
  position: string
  largeur: number | null
  ratio: number | null
  diametre: number | null
  type_pneu: string | null
  roues: string | null
}

export type EquipementCoche = {
  equipement_id: number
  equipement: string
  categorie: string | null
  coche: boolean
}

export type Document = {
  id: string
  type: string
  chemin_storage: string
  nom_fichier: string | null
  ajoute_le: string
  taille_octets: number | null
}

export type PrixHistorique = {
  id: string
  prix: number | null
  change_le: string
}

export type Jalon = {
  id: string
  jalon: string
  atteint_le: string
}

export type Lead = {
  id: string
  type_lead: string | null
  source: string | null
  statut_crm: string | null
  date_recu: string | null
  nom: string | null
  a_telephone: boolean | null
}

/** Types de documents acceptés par la table `document_type`. */
export type TypeDocument =
  | 'carfax_fr'
  | 'carfax_en'
  | 'photo'
  | 'dommage'
  | 'immatriculation'
  | 'facture_fournisseur'
  | 'evaluation_echange'
  | 'inspection_saaq'
  | 'paid_out'
  | 'bilan_85_points'
  | 'vin'
  | 'autre'
