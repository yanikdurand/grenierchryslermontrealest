import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { messageErreurAuth } from '../lib/erreurs'
import { useMoi } from './MoiContexte'

const LONGUEUR_MINIMALE = 8

/**
 * Affiché tant que `doit_changer_mdp` est vrai dans les métadonnées du compte.
 * Les 11 comptes ont été créés avec un mot de passe temporaire distribué de
 * la main à la main; personne ne doit le conserver.
 */
export function ChangerMotDePasse() {
  const { utilisateur, rafraichir, seDeconnecter } = useMoi()
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)

    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setErreur(`Le mot de passe doit compter au moins ${LONGUEUR_MINIMALE} caractères.`)
      return
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.')
      return
    }

    setEnvoi(true)
    const { error } = await supabase.auth.updateUser({
      password: motDePasse,
      data: { doit_changer_mdp: false },
    })

    if (error) {
      setErreur(messageErreurAuth(error))
      setEnvoi(false)
      return
    }

    await rafraichir()
  }

  return (
    <div className="ecran-centre">
      <form className="carte carte-etroite" onSubmit={soumettre}>
        <h1 className="titre-marque">Bienvenue{utilisateur ? `, ${utilisateur.nom}` : ''}</h1>
        <p className="sous-titre">
          Choisissez votre mot de passe. Celui qui vous a été remis était temporaire.
        </p>

        <label className="champ">
          <span>Nouveau mot de passe</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
          />
        </label>

        <label className="champ">
          <span>Confirmer le mot de passe</span>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {erreur && <p className="message-erreur">{erreur}</p>}

        <button type="submit" className="bouton-principal" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>

        <button type="button" className="bouton-discret" onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </form>
    </div>
  )
}
