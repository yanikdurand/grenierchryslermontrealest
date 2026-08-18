const ETIQUETTES_ROLE: Record<string, string> = {
  admin: 'Administrateur',
  directeur: 'Directeur',
  directeur_service: 'Directeur service',
  gestionnaire_inventaire: 'Gestionnaire d’inventaire',
  aviseur: 'Aviseur technique',
  receptionniste: 'Réception',
  proprietaire: 'Propriétaire',
  vendeur: 'Vendeur',
  comptabilite: 'Comptabilité',
  financement: 'Financement',
  livraison: 'Livraison',
}

export function etiquetteRole(role: string | null | undefined): string {
  return role ? ETIQUETTES_ROLE[role] ?? role : ''
}
