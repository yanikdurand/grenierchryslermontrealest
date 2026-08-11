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

/**
 * Sous-ensemble de `v_vehicule_app` utilisé par les écrans actuels.
 * Les champs financiers arrivent à `null` quand l'utilisateur n'a pas le
 * droit correspondant : le masquage est fait par Postgres, pas ici.
 */
export type VehiculeApp = {
  id: string
  no_stock: string
  vin: string | null
  vehicule_titre: string
  annee: number | null
  marque: string | null
  modele: string | null
  statut: string | null
  statut_ordre: number | null
  fournisseur: string | null
  fournisseur_autre: string | null
  km: number | null
  prix_vente: number | null
  prix_achat: number | null
  lien_carfax: string | null
  lien_existant: boolean | null
  lien_existant_note: string | null
  requiert_inspection_saaq: boolean | null
  saaq_complete_le: string | null
  date_recu: string | null
  jours_inventaire: number | null
  nb_alertes: number
  nb_critiques: number
  alertes: string | null
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
