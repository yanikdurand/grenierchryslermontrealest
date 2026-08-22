import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMoi } from '../auth/MoiContexte'
import { etiquetteRole } from '../lib/roles'
import { Icone } from './Icone'
import type { NomIcone } from './Icone'

type Entree = {
  vers: string
  libelle: string
  icone: NomIcone
  exact?: boolean
  /** L'entrée n'apparaît que si l'un de ces droits est détenu. */
  droits?: string[]
}

type Groupe = { titre: string | null; entrees: Entree[] }

/**
 * La navigation est groupée par métier plutôt qu'en une seule liste : neuf
 * entrées à plat débordaient déjà sur deux rangées, et rien n'indiquait ce
 * qui allait ensemble.
 */
const GROUPES: Groupe[] = [
  {
    titre: null,
    entrees: [{ vers: '/', libelle: 'Accueil', icone: 'accueil', exact: true }],
  },
  {
    titre: 'Inventaire',
    entrees: [
      { vers: '/inventaire', libelle: 'Véhicules', icone: 'voiture' },
      {
        vers: '/acquisition', libelle: 'Nouvelle acquisition', icone: 'plus',
        droits: ['vehicule.creer'],
      },
    ],
  },
  {
    titre: 'Opérations',
    entrees: [
      {
        vers: '/service', libelle: 'Service', icone: 'cle',
        droits: ['inspection.saisir', 'inspection.approuver', 'inspection.completer'],
      },
      {
        vers: '/ventes', libelle: 'Ventes', icone: 'poignee',
        droits: ['vente.enregistrer', 'vente.financement', 'vente.livrer'],
      },
      {
        vers: '/visites', libelle: 'Visites du jour', icone: 'personnes',
        droits: ['lead.saisir', 'lead.voir'],
      },
    ],
  },
  {
    titre: 'Analyse',
    entrees: [
      { vers: '/tableaux', libelle: 'Tableaux de bord', icone: 'graphique', droits: ['rapport.voir'] },
      { vers: '/parcours', libelle: 'Parcours', icone: 'chemin', droits: ['rapport.voir'] },
    ],
  },
  {
    titre: 'Administration',
    entrees: [
      {
        vers: '/reglages', libelle: 'Réglages', icone: 'engrenage',
        droits: ['admin.utilisateurs', 'admin.permissions', 'admin.notifications', 'parametres.signature'],
      },
    ],
  },
]

function initiales(nom: string): string {
  return nom.split(' ').filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase()
}

export function MiseEnPage() {
  const { utilisateur, aLeDroit, seDeconnecter } = useMoi()
  const emplacement = useLocation()
  const [ouvert, setOuvert] = useState(false)

  // Sur téléphone le menu recouvre la page : il doit se refermer dès qu'on
  // a choisi, sinon on reste devant le menu au lieu de l'écran demandé.
  useEffect(() => { setOuvert(false) }, [emplacement.pathname])

  const visible = (e: Entree) => !e.droits || e.droits.some((d) => aLeDroit(d))

  const groupes = GROUPES
    .map((g) => ({ ...g, entrees: g.entrees.filter(visible) }))
    .filter((g) => g.entrees.length > 0)

  return (
    <div className="application">
      <button
        type="button"
        className="bouton-menu"
        aria-expanded={ouvert}
        aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
        onClick={() => setOuvert((o) => !o)}
      >
        <Icone nom={ouvert ? 'croix' : 'menu'} />
      </button>

      <aside className={`lateral ${ouvert ? 'ouvert' : ''}`}>
        <div className="lateral-marque">
          <img
            className="logo-lateral"
            src="/logo-grenier.png"
            alt="Grenier Chrysler"
            width={720}
            height={124}
          />
          <span className="lateral-marque-texte">Montréal-Est · Inventaire</span>
        </div>

        <nav className="lateral-nav">
          {groupes.map((g, i) => (
            <div key={g.titre ?? `groupe-${i}`} className="lateral-groupe">
              {g.titre && <p className="lateral-titre">{g.titre}</p>}
              {g.entrees.map((e) => (
                <NavLink
                  key={e.vers}
                  to={e.vers}
                  end={e.exact}
                  className={({ isActive }) => `lateral-lien ${isActive ? 'actif' : ''}`}
                >
                  <Icone nom={e.icone} />
                  <span>{e.libelle}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="lateral-pied">
          <div className="lateral-utilisateur">
            <span className="avatar">{utilisateur ? initiales(utilisateur.nom) : '?'}</span>
            <span className="lateral-identite">
              <span className="nom">{utilisateur?.nom}</span>
              <span className="role">
                {etiquetteRole(utilisateur?.role)}
              </span>
            </span>
          </div>
          <button type="button" className="lateral-deconnexion" onClick={seDeconnecter}>
            <Icone nom="sortie" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {ouvert && <div className="voile" onClick={() => setOuvert(false)} aria-hidden />}

      <main className="contenu">
        <Outlet />
      </main>
    </div>
  )
}
