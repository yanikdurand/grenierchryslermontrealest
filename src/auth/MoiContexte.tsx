import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Utilisateur } from '../lib/types'

type Moi = {
  chargement: boolean
  session: Session | null
  utilisateur: Utilisateur | null
  /** Codes de permission réellement accordés, d'après `v_permissions_effectives`. */
  permissions: Set<string>
  /** Vrai tant que le mot de passe temporaire n'a pas été remplacé. */
  doitChangerMotDePasse: boolean
  /**
   * Le compte Auth existe mais aucune ligne `utilisateur` ne lui est liée.
   * Cas anormal : la personne ne doit rien pouvoir faire.
   */
  compteNonLie: boolean
  aLeDroit: (code: string) => boolean
  rafraichir: () => Promise<void>
  seDeconnecter: () => Promise<void>
}

const Contexte = createContext<Moi | null>(null)

export function FournisseurMoi({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())

  const chargerProfil = useCallback(async (sessionCourante: Session | null) => {
    if (!sessionCourante) {
      setUtilisateur(null)
      setPermissions(new Set())
      return
    }

    const { data: ligne, error } = await supabase
      .from('utilisateur')
      .select('id, nom, email, role, actif, auth_user_id')
      .eq('auth_user_id', sessionCourante.user.id)
      .maybeSingle()

    if (error || !ligne) {
      setUtilisateur(null)
      setPermissions(new Set())
      return
    }

    setUtilisateur(ligne as Utilisateur)

    const { data: droits } = await supabase
      .from('v_permissions_effectives')
      .select('permission_code, accorde')
      .eq('utilisateur_id', ligne.id)

    const accordes = (droits ?? [])
      .filter((d: { accorde: boolean }) => d.accorde)
      .map((d: { permission_code: string }) => d.permission_code)

    setPermissions(new Set(accordes))
  }, [])

  useEffect(() => {
    let actif = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return
      setSession(data.session)
      await chargerProfil(data.session)
      if (actif) setChargement(false)
    })

    const { data: abonnement } = supabase.auth.onAuthStateChange(async (_evenement, nouvelle) => {
      if (!actif) return
      setSession(nouvelle)
      await chargerProfil(nouvelle)
      if (actif) setChargement(false)
    })

    return () => {
      actif = false
      abonnement.subscription.unsubscribe()
    }
  }, [chargerProfil])

  const valeur = useMemo<Moi>(() => {
    const doitChanger = session?.user?.user_metadata?.doit_changer_mdp === true

    return {
      chargement,
      session,
      utilisateur,
      permissions,
      doitChangerMotDePasse: doitChanger,
      compteNonLie: Boolean(session) && !utilisateur,
      aLeDroit: (code: string) => permissions.has(code),
      rafraichir: async () => {
        const { data } = await supabase.auth.getSession()
        setSession(data.session)
        await chargerProfil(data.session)
      },
      seDeconnecter: async () => {
        await supabase.auth.signOut()
      },
    }
  }, [chargement, session, utilisateur, permissions, chargerProfil])

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useMoi(): Moi {
  const valeur = useContext(Contexte)
  if (!valeur) {
    throw new Error('useMoi doit être utilisé à l’intérieur de <FournisseurMoi>.')
  }
  return valeur
}
