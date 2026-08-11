import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FournisseurMoi, useMoi } from './auth/MoiContexte'
import { Connexion } from './auth/Connexion'
import { ChangerMotDePasse } from './auth/ChangerMotDePasse'
import { MiseEnPage } from './composants/MiseEnPage'
import { Acquisition } from './pages/Acquisition'
import { Vehicules } from './pages/Vehicules'

/** Écran affiché quand un compte Auth n'a pas de ligne `utilisateur` liée. */
function CompteNonLie() {
  const { seDeconnecter, session } = useMoi()
  return (
    <div className="ecran-centre">
      <div className="carte carte-etroite">
        <h1 className="titre-marque">Compte non reconnu</h1>
        <p className="sous-titre">
          Le compte <strong>{session?.user?.email}</strong> existe, mais il n’est rattaché à
          aucun employé. Contactez Yanik pour qu’il fasse le lien.
        </p>
        <button type="button" className="bouton-discret" onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

/** Un employé désactivé conserve son historique mais perd l’accès. */
function CompteDesactive() {
  const { seDeconnecter, utilisateur } = useMoi()
  return (
    <div className="ecran-centre">
      <div className="carte carte-etroite">
        <h1 className="titre-marque">Accès désactivé</h1>
        <p className="sous-titre">
          Le compte de {utilisateur?.nom} n’est plus actif.
        </p>
        <button type="button" className="bouton-discret" onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

function Routage() {
  const { chargement, session, utilisateur, compteNonLie, doitChangerMotDePasse, aLeDroit } = useMoi()

  if (chargement) {
    return (
      <div className="ecran-centre">
        <p className="note">Chargement…</p>
      </div>
    )
  }

  if (!session) return <Connexion />
  if (doitChangerMotDePasse) return <ChangerMotDePasse />
  if (compteNonLie) return <CompteNonLie />
  if (utilisateur && !utilisateur.actif) return <CompteDesactive />

  return (
    <Routes>
      <Route element={<MiseEnPage />}>
        <Route path="/vehicules" element={<Vehicules />} />
        <Route
          path="/acquisition"
          element={aLeDroit('vehicule.creer') ? <Acquisition /> : <Navigate to="/vehicules" replace />}
        />
        <Route path="*" element={<Navigate to="/vehicules" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <FournisseurMoi>
        <Routage />
      </FournisseurMoi>
    </BrowserRouter>
  )
}
