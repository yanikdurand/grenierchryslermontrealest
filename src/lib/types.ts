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
  /** Depuis quand ce véhicule est achetable — indépendant du statut et d'une vente en cours. */
  disponible_depuis: string | null
  /** Le dossier de vente actif, s'il y en a un — jamais stocké sur le véhicule, toujours dérivé de `vente`. */
  vente_id: string | null
  vente_etat: string | null
  vente_type_transaction: string | null
  vente_force_dossier: string | null
  vente_date_livraison_prevue: string | null
  /** La réparation sous garantie la plus récente — active en priorité, sinon la dernière connue. */
  garantie_description: string | null
  garantie_lieu: string | null
  garantie_rdv: string | null
  garantie_parti_le: string | null
  garantie_retour_le: string | null
  /** Un neuf n'a ni Carfax ni SAAQ ni feuille d'équipements d'occasion. */
  type_vehicule: 'occasion' | 'neuf'
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

export type Decision = 'en_attente' | 'ne_pas_faire' | 'de_base' | 'signature' | 'garantie'

export type FileService = {
  vehicule_id: string
  no_stock: string
  vehicule: string | null
  statut_vehicule: string | null
  statut_autorisation: string | null
  nb_lignes: number
  nb_en_attente: number
  base_a_faire: number
  garantie_a_faire: number
  signature_en_attente_vente: number
  cout_base_a_venir: number | null
  requiert_inspection_saaq: boolean | null
  saaq_rdv_le: string | null
  saaq_complete_le: string | null
  jours_inventaire: number | null
}

export type InspectionStatut = {
  inspection_id: string
  vehicule_id: string
  no_stock: string
  nb_lignes: number
  nb_en_attente: number
  nb_refusees: number
  nb_de_base: number
  nb_signature: number
  nb_garantie: number
  statut_autorisation: string | null
  cout_base_engage: number | null
  cout_signature_engage: number | null
  cout_base_a_venir: number | null
  cout_signature_potentiel: number | null
  valeur_garantie: number | null
  cout_evite: number | null
  cree_le: string
  technicien: string | null
}

export type LigneInspection = {
  id: string
  no_ligne: number | null
  description: string | null
  code_reparation_id: number | null
  cout: number | null
  complete: boolean
  complete_le: string | null
  decision: Decision
  decide_le: string | null
  sous_garantie: boolean
  garantie_lieu: string | null
  garantie_rdv: string | null
  garantie_parti_le: string | null
  garantie_retour_le: string | null
}

export type CodeReparation = {
  id: number
  code: string
  description: string | null
}

export type ChangementDecision = {
  id: string
  inspection_ligne_id: string
  decision_avant: string | null
  decision_apres: string | null
  change_le: string
  motif: string | null
}

export type StatutDemandeTravaux = 'brouillon' | 'envoyee' | 'completee' | 'annulee'
export type CategorieTravaux = 'mecanique' | 'esthetique' | 'preparation_livraison' | 'autre'

export type DemandeTravauxApp = {
  id: string
  vehicule_id: string
  no_stock: string
  vehicule_titre: string
  statut_vehicule: string | null
  statut: StatutDemandeTravaux
  notes: string | null
  cree_par_nom: string | null
  cree_le: string
  envoyee_par_nom: string | null
  envoyee_le: string | null
  completee_le: string | null
  annulee_le: string | null
  motif_annulation: string | null
  nb_lignes: number
  nb_completees: number
}

export type LigneDemandeTravaux = {
  id: string
  demande_id: string
  no_ligne: number
  categorie: CategorieTravaux
  description: string
  complete: boolean
  complete_le: string | null
  complete_par: string | null
}

export type EtatVente = 'depot' | 'vendu' | 'approuve' | 'livre' | 'annule'
export type TypeTransaction = 'financement' | 'comptant' | 'location'
export type ForceDossier = 'fort' | 'moyen' | 'faible'

export type Vente = {
  id: string
  vehicule_id: string
  no_stock: string
  vehicule_titre: string
  statut_vehicule: string | null
  client: string
  telephone: string | null
  courriel: string | null
  vendeur: string | null
  vendeur_id: string | null
  type_transaction: TypeTransaction
  prix_vendu: number | null
  etat: EtatVente
  force_dossier: ForceDossier | null
  fi: string | null
  fi_le: string | null
  date_livraison_prevue: string | null
  livre_le: string | null
  livre_par_nom: string | null
  annule_le: string | null
  motif_annulation: string | null
  lien_crm: string | null
  notes: string | null
  cree_le: string
  cree_par_nom: string | null
}
