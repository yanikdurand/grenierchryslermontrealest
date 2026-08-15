/**
 * Icônes en SVG inline plutôt qu'une bibliothèque : une dizaine de traits
 * pèsent moins qu'un paquet de plusieurs centaines de kilooctets dont on
 * utiliserait dix icônes.
 *
 * Toutes partagent la même grille 24, le même trait de 1.75 et des extrémités
 * arrondies — c'est ce qui les fait lire comme une famille.
 */

export type NomIcone =
  | 'accueil' | 'voiture' | 'plus' | 'cle' | 'poignee' | 'personnes'
  | 'graphique' | 'chemin' | 'engrenage' | 'sortie' | 'menu' | 'croix'

const TRACES: Record<NomIcone, string> = {
  accueil: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  voiture: 'M5 16.5h14M6.5 16.5v2M17.5 16.5v2M4 12.5l1.6-4.3A2 2 0 0 1 7.5 7h9a2 2 0 0 1 1.9 1.2l1.6 4.3M4 12.5h16v4H4zM7 14.5h.01M17 14.5h.01',
  plus: 'M12 5v14M5 12h14',
  cle: 'M14.5 4a5.5 5.5 0 1 0 4.9 8H21l1-1-1-1h-1.6A5.5 5.5 0 0 0 14.5 4zM14.5 8.5h.01',
  poignee: 'M4 7h16v10H4zM4 11h16M9 7V5h6v2M9.5 14h5',
  personnes: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19a5.5 5.5 0 0 1 11 0M16 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15 14.2a5 5 0 0 1 6.5 4.8',
  graphique: 'M4 20V4M4 20h16M8 20v-6M12.5 20V9M17 20v-9',
  chemin: 'M6 4.5v9M6 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10.5v3a4 4 0 0 1-4 4h-4',
  engrenage: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  sortie: 'M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  croix: 'M6 6l12 12M18 6 6 18',
}

export function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg
      className="icone"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRACES[nom]} />
    </svg>
  )
}
