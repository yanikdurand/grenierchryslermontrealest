import { NavLink, Outlet } from 'react-router-dom'
import { useMoi } from '../auth/MoiContexte'

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
}

export function MiseEnPage() {
  const { utilisateur, aLeDroit, seDeconnecter } = useMoi()

  return (
    <div className="application">
      <header className="entete">
        <div className="entete-marque">
          <strong>Grenier Chrysler</strong>
          <span>Inventaire</span>
        </div>

        <nav className="navigation">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'actif' : '')}>
            Accueil
          </NavLink>
          {aLeDroit('vehicule.creer') && (
            <NavLink to="/acquisition" className={({ isActive }) => (isActive ? 'actif' : '')}>
              Nouvelle acquisition
            </NavLink>
          )}
          <NavLink to="/inventaire" className={({ isActive }) => (isActive ? 'actif' : '')}>
            Inventaire
          </NavLink>
          {(aLeDroit('inspection.saisir') || aLeDroit('inspection.approuver')
            || aLeDroit('inspection.completer')) && (
            <NavLink to="/service" className={({ isActive }) => (isActive ? 'actif' : '')}>
              Service
            </NavLink>
          )}
          {(aLeDroit('admin.utilisateurs') || aLeDroit('admin.permissions')
            || aLeDroit('admin.notifications')) && (
            <NavLink to="/reglages" className={({ isActive }) => (isActive ? 'actif' : '')}>
              Réglages
            </NavLink>
          )}
        </nav>

        <div className="entete-utilisateur">
          <div className="identite">
            <span className="nom">{utilisateur?.nom}</span>
            <span className="role">
              {utilisateur ? (ETIQUETTES_ROLE[utilisateur.role] ?? utilisateur.role) : ''}
            </span>
          </div>
          <button type="button" className="bouton-discret" onClick={seDeconnecter}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="contenu">
        <Outlet />
      </main>
    </div>
  )
}
