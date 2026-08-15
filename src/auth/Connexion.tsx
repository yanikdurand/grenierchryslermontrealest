import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { messageErreurAuth } from '../lib/erreurs'

export function Connexion() {
  const [courriel, setCourriel] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: courriel.trim().toLowerCase(),
      password: motDePasse,
    })

    if (error) {
      setErreur(messageErreurAuth(error))
      setEnvoi(false)
    }
    // En cas de succès, onAuthStateChange prend le relais et l'écran change.
  }

  return (
    <div className="ecran-centre">
      <form className="carte carte-etroite" onSubmit={soumettre}>
        <img
          className="logo-connexion"
          src="/logo-grenier.png"
          alt="Grenier Chrysler"
          width={720}
          height={124}
        />
        <h1 className="titre-marque">Gestion d’inventaire</h1>
        <p className="sous-titre">Montréal-Est</p>

        <label className="champ">
          <span>Courriel</span>
          <input
            type="email"
            value={courriel}
            onChange={(e) => setCourriel(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>

        <label className="champ">
          <span>Mot de passe</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {erreur && <p className="message-erreur">{erreur}</p>}

        <button type="submit" className="bouton-principal" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="note">
          Mot de passe oublié ? Contactez Yanik — les comptes sont gérés à l’interne.
        </p>
      </form>

      {/*
        Le verrou complet porte les marques Chrysler, Dodge, Jeep, RAM et FIAT.
        Elles ne se lisent qu'en largeur : c'est le seul écran qui en a.
      */}
      <img
        className="verrou-marques"
        src="/logo-grenier-complet.png"
        alt="Chrysler · Dodge · Jeep · RAM · FIAT"
        width={1600}
        height={83}
      />
    </div>
  )
}
