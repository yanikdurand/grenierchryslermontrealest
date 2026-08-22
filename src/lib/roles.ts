/**
 * Les libellés lisibles des rôles.
 *
 * Les clés doivent correspondre exactement à la contrainte
 * `utilisateur_role_check` en base — sinon le rôle s'affiche en brut
 * (`directeur_financier` au lieu de « Directeur financier »).
 * Vérifier la contrainte avant d'ajouter ou de renommer une entrée.
 */
const ETIQUETTES_ROLE: Record<string, string> = {
  admin: 'Administrateur',
  directeur: 'Directeur',
  directeur_service: 'Directeur service',
  directeur_financier: 'Directeur financier',
  gestionnaire_inventaire: 'Gestionnaire d’inventaire',
  aviseur: 'Aviseur technique',
  receptionniste: 'Réception',
  proprietaire: 'Propriétaire',
  vendeur: 'Vendeur',
  comptabilite: 'Comptabilité',
  livreur: 'Livraison',
}

export function etiquetteRole(role: string | null | undefined): string {
  return role ? ETIQUETTES_ROLE[role] ?? role : ''
}
