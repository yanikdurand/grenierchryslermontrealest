/**
 * Traduction des erreurs remontées par Postgres.
 *
 * Les fonctions métier (`creer_vehicule`, `recevoir_vehicule`, …) lèvent déjà
 * des messages rédigés en français : « Le numéro de stock XS313A existe
 * déjà. », « Vous n'avez pas le droit d'ajouter un véhicule. » On les affiche
 * tels quels — ce sont eux qui font autorité, pas l'interface.
 *
 * Ce module ne sert qu'aux cas où le message brut serait incompréhensible
 * pour Emily : erreurs d'infrastructure, violations de contrainte non
 * interceptées par une fonction, coupure réseau.
 */

type ErreurPostgres = {
  message?: string
  code?: string
  details?: string
}

const MESSAGES_PAR_CODE: Record<string, string> = {
  '42501': "Vous n'avez pas le droit d'effectuer cette action.",
  '23505': 'Cette valeur existe déjà pour un autre véhicule.',
  '23503': "Cette donnée renvoie à un élément qui n'existe pas.",
  '23514': 'Une information obligatoire est manquante ou invalide.',
  '23502': 'Une information obligatoire est manquante.',
  '22P02': "Le format d'une des valeurs saisies est invalide.",
  PGRST301: 'Votre session a expiré. Reconnectez-vous.',
}

/** Un message venant d'une de nos fonctions est déjà rédigé pour l'utilisateur. */
function vientDeNosFonctions(message: string): boolean {
  return /[àâäéèêëîïôöùûüç]/i.test(message) || message.trimEnd().endsWith('.')
}

export function messageErreur(erreur: unknown): string {
  if (!erreur) return "Une erreur inattendue s'est produite."

  if (typeof erreur === 'string') return erreur

  const e = erreur as ErreurPostgres

  if (e.message && vientDeNosFonctions(e.message)) {
    return e.message
  }

  if (e.code && MESSAGES_PAR_CODE[e.code]) {
    return MESSAGES_PAR_CODE[e.code]
  }

  if (e.message?.includes('Failed to fetch')) {
    return 'Connexion au serveur impossible. Vérifiez votre accès réseau.'
  }

  return e.message || "Une erreur inattendue s'est produite."
}

/** Messages d'authentification : Supabase Auth répond en anglais. */
export function messageErreurAuth(erreur: unknown): string {
  const message = (erreur as ErreurPostgres)?.message ?? ''

  if (message.includes('Invalid login credentials')) {
    return 'Courriel ou mot de passe incorrect.'
  }
  if (message.includes('Email not confirmed')) {
    return "Ce compte n'est pas encore confirmé. Contactez Yanik."
  }
  if (message.includes('same as the old password')) {
    return "Le nouveau mot de passe doit être différent de l'ancien."
  }
  if (message.includes('at least')) {
    return 'Le mot de passe doit compter au moins 8 caractères.'
  }
  if (message.includes('Failed to fetch')) {
    return 'Connexion au serveur impossible. Vérifiez votre accès réseau.'
  }
  return messageErreur(erreur)
}
