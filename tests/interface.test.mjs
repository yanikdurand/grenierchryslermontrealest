/**
 * Test de bout en bout de l'interface, avec les appels Supabase interceptés.
 *
 * Pourquoi simuler : le proxy sortant de l'environnement de développement
 * refuse `*.supabase.co` (403 de politique), donc le navigateur n'y joint pas
 * la base. Ce test valide la logique d'écran — routage, permissions, appels
 * émis, masquage affiché. Le comportement de la base est vérifié séparément
 * en SQL, rôle par rôle, avec de vrais jetons.
 *
 * Lancer : `npm run dev` dans un terminal, puis `node tests/interface.test.mjs`.
 */
import { chromium } from 'playwright'
import { URL as AdresseURL } from 'node:url'

const ADRESSE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/'
const cheminChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

const etapes = []
function note(nom, ok, detail = '') {
  etapes.push({ nom, ok, detail })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} | ${nom}${detail ? ' — ' + detail : ''}`)
}

// --- Personnes simulées -----------------------------------------------------

const PROFILS = {
  reception: {
    utilisateur: {
      id: 'u-emily', nom: 'Emily Dupont', email: 'reception@grenierchryslermtlest.com',
      role: 'receptionniste', actif: true, auth_user_id: 'auth-emily',
    },
    motDePasse: 'MotDePasseEmily1',
    droits: ['vehicule.creer', 'vehicule.modifier', 'vehicule.recevoir', 'vehicule.voir',
             'vehicule.voir_prix_achat'],
    // Emily voit le prix d'achat mais ni le profit, ni les coûts, ni les leads.
    masque: { prix_achat: 15500, profit: null, cout_base_engage: null, leads_total: null },
  },
  gestionnaire: {
    utilisateur: {
      id: 'u-jo', nom: 'Jonathan Dauphinais', email: 'jdauphinais@grenierchryslermtlest.com',
      role: 'gestionnaire_inventaire', actif: true, auth_user_id: 'auth-jo',
    },
    motDePasse: 'MotDePasseJo1',
    droits: ['vehicule.creer', 'vehicule.modifier', 'vehicule.recevoir', 'vehicule.voir',
             'vehicule.voir_prix_achat', 'vehicule.voir_couts', 'feuille.saisir', 'lead.voir'],
    masque: { prix_achat: 15500, profit: null, cout_base_engage: 1200, leads_total: 3 },
  },
  admin: {
    utilisateur: {
      id: 'u-yanik', nom: 'Yanik Durand', email: 'ydurand@grenierchryslermtlest.com',
      role: 'admin', actif: true, auth_user_id: 'auth-yanik',
    },
    motDePasse: 'MotDePasseYanik1',
    droits: ['admin.notifications', 'admin.permissions', 'admin.utilisateurs', 'affichage.voir',
             'alerte.resoudre', 'feuille.saisir', 'inspection.approuver', 'inspection.completer',
             'inspection.saisir', 'lead.voir', 'rapport.voir', 'saaq.completer',
             'vehicule.creer', 'vehicule.modifier', 'vehicule.recevoir', 'vehicule.voir',
             'vehicule.voir_couts', 'vehicule.voir_prix_achat', 'vehicule.voir_profit',
             'vente.enregistrer', 'vente.financement', 'vente.livrer', 'lead.saisir',
             'travaux.demander', 'travaux.gerer', 'travaux.completer', 'inspection.garantie',
             'parametres.signature'],
    masque: { prix_achat: 15500, profit: 6800, cout_base_engage: 1200, leads_total: 3 },
  },
  directeur: {
    utilisateur: {
      id: 'u-steve', nom: 'Steve Costa', email: 'scosta@grenierchryslermtlest.com',
      role: 'directeur', actif: true, auth_user_id: 'auth-steve',
    },
    motDePasse: 'MotDePasseSteve1',
    droits: ['vehicule.creer', 'vehicule.modifier', 'vehicule.recevoir', 'vehicule.voir',
             'vehicule.voir_prix_achat', 'vehicule.voir_couts', 'vehicule.voir_profit',
             'feuille.saisir', 'lead.voir', 'rapport.voir', 'saaq.completer',
             'inspection.saisir', 'inspection.approuver', 'alerte.resoudre', 'affichage.voir',
             'vente.enregistrer', 'vente.financement', 'lead.saisir',
             'travaux.demander', 'travaux.gerer', 'parametres.signature'],
    masque: { prix_achat: 15500, profit: 6800, cout_base_engage: 1200, leads_total: 3 },
  },
  aviseur: {
    utilisateur: {
      id: 'u-cat', nom: 'Catherine Généreux', email: 'cgenereux@grenierchryslermtlest.com',
      role: 'aviseur', actif: true, auth_user_id: 'auth-cat',
    },
    motDePasse: 'MotDePasseCat1',
    droits: ['vehicule.voir', 'vehicule.voir_couts', 'inspection.saisir',
             'inspection.completer', 'saaq.completer', 'alerte.resoudre', 'travaux.completer',
             'inspection.garantie'],
    masque: { prix_achat: null, profit: null, cout_base_engage: 1200, leads_total: null },
  },
  vendeur: {
    utilisateur: {
      id: 'u-ludo', nom: 'Ludovick Borris', email: 'lborris@grenierchryslermtlest.com',
      role: 'vendeur', actif: true, auth_user_id: 'auth-ludo',
    },
    motDePasse: 'MotDePasseLudo1',
    droits: ['vehicule.voir', 'affichage.voir', 'travaux.demander'],
    // Un vendeur ne voit aucun montant sensible : Postgres renvoie des null.
    masque: { prix_achat: null, profit: null, cout_base_engage: null, leads_total: null },
  },
}

const STATUTS = [
  { id: 1, nom: 'ATTENTE DE RÉCEPTION', ordre: 1 },
  { id: 2, nom: 'VÉHICULE REÇU', ordre: 2 },
  { id: 5, nom: 'MÉCANIQUE INTERNE', ordre: 5 },
  { id: 10, nom: 'DISPONIBLE', ordre: 10 },
  { id: 17, nom: 'DEMANDE DE TRAVAUX', ordre: 17 },
]

function vehiculeDemo(profil) {
  return {
    id: 'veh-1', no_stock: 'A1234', vin: '1HGCM82633A004352',
    vehicule_titre: '2021 HONDA ACCORD SPORT', annee: 2021, marque: 'HONDA', modele: 'ACCORD',
    trim: 'SPORT', transmission: 'AUTO', motricite: 'FWD', km: 48000,
    couleur_exterieur: 'Noir', couleur_interieur: 'Gris',
    statut: 'VÉHICULE REÇU', statut_ordre: 2, fournisseur: 'Encan', fournisseur_autre: null,
    nb_clefs: 2, nb_passagers: 5, pnbv: 2100, etat_carrosserie: 'Bon', etat_pare_brise: 'Éclat',
    rappels: null, notes: 'Deuxième jeu de pneus inclus.',
    garantie_complete: '3 ans / 60 000 km, jusqu’au 2027-05-01', garantie_motopropulseur: null,
    garantie_prolongee: null,
    lien_carfax: 'https://carfax.ca/exemple', lien_existant: true,
    lien_existant_note: 'Solde chez Desjardins',
    requiert_inspection_saaq: true, saaq_rdv_le: null, saaq_complete_le: null,
    date_recu: '2026-08-01', date_mise_en_service: null, jours_inventaire: 11,
    affiche_en_ligne: false, photos_en_ligne: 0, lien_fiche_web: null, verifie_le: null,
    prix_vente: 24995, disponible_depuis: null,
    cout_carfax: null, cout_signature_engage: null, cout_base_a_venir: null,
    cout_signature_potentiel: null, valeur_garantie: null,
    statut_autorisation: 'En attente', feuille_pourcentage: 45,
    feuille_complete_le: null, feuille_derniere_modif: '2026-08-10T14:00:00Z',
    feuille_derniere_modif_par: 'Jonathan Dauphinais',
    nb_alertes: 2, nb_critiques: 2,
    alertes: 'Lien existant · Inspection SAAQ requise',
    leads_30j: null, dernier_lead: null,
    ...profil.masque,
  }
}

const CODES = [
  { id: 1, code: 'Rouge', description: 'Urgent — sécurité ou obligatoire avant vente' },
  { id: 2, code: 'Jaune', description: 'À surveiller — recommandé' },
  { id: 3, code: 'Vert', description: 'Optionnel / esthétique' },
]

// --- Scénario ---------------------------------------------------------------

async function scenario(navigateur, cle) {
  const profil = PROFILS[cle]
  const appels = []
  let doitChanger = true
  let vehicule = vehiculeDemo(profil)

  const voitCouts = profil.droits.includes('vehicule.voir_couts')
  const voitProfit = profil.droits.includes('vehicule.voir_profit')
  const voitPrixAchat = profil.droits.includes('vehicule.voir_prix_achat')
  let ventes = []
  let visites = []
  let lignes = [
    { id: 'l1', no_ligne: 1, description: 'Pneus à changer', code_reparation_id: 1,
      cout: 800, complete: false, complete_le: null, decision: 'en_attente', decide_le: null,
      sous_garantie: false, garantie_lieu: null, garantie_rdv: null, garantie_parti_le: null,
      garantie_retour_le: null, garantie_statut_avant: null },
    { id: 'l2', no_ligne: 2, description: 'Pare-brise à remplacer', code_reparation_id: 2,
      cout: 450, complete: false, complete_le: null, decision: 'en_attente', decide_le: null,
      sous_garantie: false, garantie_lieu: null, garantie_rdv: null, garantie_parti_le: null,
      garantie_retour_le: null, garantie_statut_avant: null },
    { id: 'l3', no_ligne: 3, description: 'Freins à refaire', code_reparation_id: 2,
      cout: 600, complete: false, complete_le: null, decision: 'signature', decide_le: null,
      sous_garantie: false, garantie_lieu: null, garantie_rdv: null, garantie_parti_le: null,
      garantie_retour_le: null, garantie_statut_avant: null },
  ]
  let technicien = null
  // L'aviseur teste la complétion d'une demande déjà envoyée par quelqu'un
  // d'autre — chaque profil tourne dans son propre contexte isolé, donc la
  // demande ne peut pas venir d'une étape « vendeur » précédente du même run.
  let demandesTravaux = cle === 'aviseur' ? [{
    id: 'dt-1', vehicule_id: 'veh-1', no_stock: 'A1234', vehicule_titre: '2021 HONDA ACCORD SPORT',
    statut_vehicule: 'MÉCANIQUE INTERNE', statut: 'envoyee', notes: 'Vendu — préparation livraison',
    cree_par_nom: 'Ludovick Borris', cree_le: '2026-08-15T10:00:00Z',
    envoyee_par_nom: 'Steve Costa', envoyee_le: '2026-08-15T11:00:00Z',
    completee_le: null, annulee_le: null, motif_annulation: null,
  }] : []
  let lignesTravaux = cle === 'aviseur' ? [
    { id: 'dtl-1', demande_id: 'dt-1', no_ligne: 1, categorie: 'preparation_livraison',
      description: 'Remplir un quart de réservoir', complete: false, complete_le: null, complete_par: null },
    { id: 'dtl-2', demande_id: 'dt-1', no_ligne: 2, categorie: 'esthetique',
      description: 'Réparer le miroir', complete: false, complete_le: null, complete_par: null },
  ] : []
  let messagesLigne = []
  let configLignes = [
    { cle: 'signature_marge', valeur: '0.35', notes: null },
    { cle: 'signature_plancher', valeur: '1500', notes: null },
    { cle: 'signature_plafond', valeur: '4500', notes: null },
  ]

  // LARGEUR permet de rejouer le scénario sur un grand écran, là où le
  // centrage de la colonne se vérifie.
  const largeur = Number(process.env.LARGEUR ?? 1280)
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 900 } })
  const page = await contexte.newPage()
  page.on('pageerror', (e) => console.log('ERREUR JS:', e.message))

  const json = (corps, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(corps),
    headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' },
  })

  const compteAuth = () => ({
    id: profil.utilisateur.auth_user_id, aud: 'authenticated', role: 'authenticated',
    email: profil.utilisateur.email,
    user_metadata: { nom: profil.utilisateur.nom, doit_changer_mdp: doitChanger },
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: new Date().toISOString(),
  })

  await contexte.route('**/*.supabase.co/**', async (route) => {
    const req = route.request()
    const chemin = new AdresseURL(req.url()).pathname
    const methode = req.method()

    if (methode === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': '*',
        },
      })
    }

    if (chemin === '/auth/v1/token') {
      const corps = JSON.parse(req.postData() || '{}')
      if (corps.password !== 'temporaire' && corps.password !== profil.motDePasse) {
        return route.fulfill(json({ error_description: 'Invalid login credentials' }, 400))
      }
      return route.fulfill(json({
        access_token: 'jeton', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh', user: compteAuth(),
      }))
    }
    if (chemin === '/auth/v1/user' && methode === 'PUT') {
      const corps = JSON.parse(req.postData() || '{}')
      if (corps.data?.doit_changer_mdp === false) doitChanger = false
      return route.fulfill(json(compteAuth()))
    }
    if (chemin.startsWith('/auth/v1/user')) return route.fulfill(json(compteAuth()))
    if (chemin === '/auth/v1/logout') return route.fulfill({ status: 204 })

    if (chemin === '/rest/v1/utilisateur') {
      if (methode === 'PATCH' || methode === 'POST') {
        appels.push({ fonction: 'utilisateur', methode, p: JSON.parse(req.postData() || '{}') })
        return route.fulfill(json([]))
      }
      // `maybeSingle()` échoue si plusieurs lignes reviennent : on respecte donc
      // le filtre `auth_user_id` du contexte, et on ne sert la liste complète
      // qu'à l'écran de réglages.
      const params = new AdresseURL(req.url()).searchParams
      if (params.has('auth_user_id')) return route.fulfill(json([profil.utilisateur]))
      return route.fulfill(json([
        profil.utilisateur,
        { id: 'u-sam', nom: 'SAM', email: 'slamontagne@grenierchryslermtlest.com',
          role: 'vendeur', actif: false, auth_user_id: null },
        { id: 'u-neuf', nom: 'Nouvelle recrue', email: 'recrue@grenierchryslermtlest.com',
          role: 'vendeur', actif: true, auth_user_id: null },
      ]))
    }
    if (chemin === '/rest/v1/permission') {
      return route.fulfill(json([
        { code: 'vehicule.creer', libelle: 'Créer un véhicule', categorie: 'inventaire', ordre: 1 },
        { code: 'vehicule.voir_profit', libelle: 'Voir le profit', categorie: 'finances', ordre: 2 },
        { code: 'inspection.approuver', libelle: 'Approuver les réparations', categorie: 'service', ordre: 3 },
      ]))
    }
    if (chemin === '/rest/v1/role_permission') {
      if (methode === 'POST' || methode === 'DELETE') {
        appels.push({ fonction: 'role_permission', methode,
                      p: methode === 'POST' ? JSON.parse(req.postData() || '{}') : req.url() })
        return route.fulfill(json([]))
      }
      return route.fulfill(json([
        { role: 'admin', permission_code: 'vehicule.creer' },
        { role: 'admin', permission_code: 'vehicule.voir_profit' },
        { role: 'admin', permission_code: 'inspection.approuver' },
        { role: 'vendeur', permission_code: 'vehicule.creer' },
        { role: 'aviseur', permission_code: 'inspection.approuver' },
      ]))
    }
    if (chemin === '/rest/v1/utilisateur_permission') {
      if (methode !== 'GET') {
        appels.push({ fonction: 'utilisateur_permission', methode })
        return route.fulfill(json([]))
      }
      return route.fulfill(json([]))
    }
    if (chemin === '/rest/v1/notification_evenement') {
      return route.fulfill(json([{ code: 'pret_inspecter', libelle: 'Véhicule prêt à inspecter', actif: true }]))
    }
    if (chemin === '/rest/v1/config') {
      if (methode !== 'GET') {
        const corps = JSON.parse(req.postData() || '[]')
        appels.push({ fonction: 'config', methode, p: corps })
        for (const ligne of corps) {
          configLignes = [...configLignes.filter((c) => c.cle !== ligne.cle), ligne]
        }
        return route.fulfill(json(corps, 201))
      }
      return route.fulfill(json(configLignes))
    }
    if (chemin === '/rest/v1/notification_destinataire') {
      if (methode !== 'GET') {
        appels.push({ fonction: 'notification_destinataire', methode })
        return route.fulfill(json([]))
      }
      return route.fulfill(json([
        { id: 'd1', evenement_code: 'pret_inspecter', utilisateur_id: 'u-yanik',
          courriel: null, actif: true },
      ]))
    }
    if (chemin === '/rest/v1/v_permissions_effectives') {
      return route.fulfill(json(profil.droits.map((c) => ({ permission_code: c, accorde: true }))))
    }
    if (chemin === '/rest/v1/statut_vehicule') return route.fulfill(json(STATUTS))
    if (chemin === '/rest/v1/fournisseur') {
      return route.fulfill(json([{ id: 1, nom: 'Encan' }, { id: 2, nom: 'Échange client' }]))
    }
    if (chemin === '/rest/v1/v_vehicule_app') {
      // Réplique le LATERAL join de la vraie vue : le dossier de vente vivant
      // s'affiche à côté du statut opérationnel, sans jamais l'écraser.
      const venteActive = ventes.find((x) => x.etat !== 'annule' && x.etat !== 'livre')
      // Une garantie active passe avant une déjà résolue, comme dans la vraie vue.
      const ligneGarantie = lignes.find((l) => l.sous_garantie && !l.garantie_retour_le)
        ?? [...lignes].reverse().find((l) => l.sous_garantie)
      const avecVente = {
        ...vehicule,
        vente_id: venteActive?.id ?? null,
        vente_etat: venteActive?.etat ?? null,
        vente_type_transaction: venteActive?.type_transaction ?? null,
        vente_force_dossier: venteActive?.force_dossier ?? null,
        vente_date_livraison_prevue: venteActive?.date_livraison_prevue ?? null,
        garantie_description: ligneGarantie?.description ?? null,
        garantie_lieu: ligneGarantie?.garantie_lieu ?? null,
        garantie_rdv: ligneGarantie?.garantie_rdv ?? null,
        garantie_parti_le: ligneGarantie?.garantie_parti_le ?? null,
        garantie_retour_le: ligneGarantie?.garantie_retour_le ?? null,
      }
      // `maybeSingle()` demande un objet, la liste attend un tableau.
      const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      return route.fulfill(json(seul ? avecVente : [avecVente]))
    }
    if (chemin === '/rest/v1/v_feuille_equipements') {
      return route.fulfill(json([
        { equipement_id: 1, equipement: 'Caméra de recul', categorie: 'Confort', coche: true },
        { equipement_id: 2, equipement: 'Toit ouvrant', categorie: 'Confort', coche: false },
      ]))
    }
    if (chemin === '/rest/v1/vehicule_pneu') {
      return route.fulfill(json([{
        id: 'p1', position: 'principal', largeur: 225, ratio: 50, diametre: 17,
        type_pneu: 'Été', roues: 'alliage',
      }]))
    }
    if (chemin === '/rest/v1/document') {
      if (methode === 'POST') return route.fulfill(json({}, 201))
      const documents = [
        { id: 'd1', type: 'facture_fournisseur', chemin_storage: 'veh-1/facture.pdf',
          nom_fichier: 'facture.pdf', ajoute_le: '2026-08-01T12:00:00Z', taille_octets: 24000 },
        { id: 'd2', type: 'dommage', chemin_storage: 'veh-1/dommage-pare-choc.jpg',
          nom_fichier: 'dommage-pare-choc.jpg', ajoute_le: '2026-08-02T12:00:00Z', taille_octets: 51000 },
      ]
      const typeDemande = new AdresseURL(req.url()).searchParams.get('type')
      const filtres = typeDemande ? documents.filter((d) => `eq.${d.type}` === typeDemande) : documents
      return route.fulfill(json(filtres))
    }
    if (chemin === '/rest/v1/prix_historique') {
      return route.fulfill(json([{ id: 'h1', prix: 24995, change_le: '2026-08-05T10:00:00Z' }]))
    }
    if (chemin === '/rest/v1/vehicule_jalon') {
      return route.fulfill(json([
        { id: 'j1', jalon: 'achete', atteint_le: '2026-07-28T10:00:00Z' },
        { id: 'j2', jalon: 'recu', atteint_le: '2026-08-01T09:00:00Z' },
      ]))
    }
    if (chemin === '/rest/v1/crm_lead') return route.fulfill(json([]))
    if (chemin === '/rest/v1/v_vente_app') return route.fulfill(json(ventes))
    if (chemin === '/rest/v1/v_visite_app') return route.fulfill(json(visites))
    if (chemin === '/rest/v1/v_kpi_stock_app') {
      return route.fulfill(json({ vehicules_en_stock: 110, vieillissants: 18,
        age_moyen: 64, age_median: 52, non_affiches: 9, sans_vin: 3,
        capital_immobilise: voitPrixAchat ? 2450000 : null }))
    }
    if (chemin === '/rest/v1/v_kpi_affichage') {
      return route.fulfill(json({ vehicules_a_afficher: 110, en_ligne: 101, hors_ligne: 9,
        affiches_sans_photo: 4, affiches_moins_10_photos: 12, photos_moyennes: 21,
        pct_en_ligne: 91.8 }))
    }
    if (chemin === '/rest/v1/v_ventes_app') {
      return route.fulfill(json([
        { no_stock: 'A1', marque: 'HONDA', modele: 'ACCORD', prix_vente: 24995,
          profit_net: voitProfit ? 2400 : null, marge_brute: voitProfit ? 5200 : null,
          jours_avant_vente: 34, mois_reception: '2026-07-01' },
        { no_stock: 'A2', marque: 'RAM', modele: '1500', prix_vente: 41995,
          profit_net: voitProfit ? 3100 : null, marge_brute: voitProfit ? 6100 : null,
          jours_avant_vente: 21, mois_reception: '2026-07-01' },
      ]))
    }
    if (chemin === '/rest/v1/v_leads_par_source') {
      return route.fulfill(json([
        { source: 'Web', type_lead: 'Prix', mois: '2026-08-01', leads: 40, avec_telephone: 30 },
        { source: 'Téléphone', type_lead: 'Info', mois: '2026-08-01', leads: 12, avec_telephone: 12 },
      ]))
    }
    if (chemin === '/rest/v1/v_stock_sans_lead') {
      return route.fulfill(json([{ no_stock: 'C9', vehicule: '2019 JEEP CHEROKEE',
        prix_vente: 22995, jours_inventaire: 120, photos: 4, vehicule_id: 'veh-1' }]))
    }
    if (chemin === '/rest/v1/v_goulots') {
      return route.fulfill(json([
        { no_stock: 'A1234', vehicule: '2021 HONDA ACCORD', statut: 'VÉHICULE REÇU',
          etape_bloquante: "En attente de feuille d'équipements", jours_a_cette_etape: 12,
          vehicule_id: 'veh-1' },
        { no_stock: 'B5678', vehicule: '2020 RAM 1500', statut: 'DISPONIBLE',
          etape_bloquante: "En attente de feuille d'équipements", jours_a_cette_etape: 300,
          vehicule_id: 'veh-1' },
      ]))
    }
    if (chemin === '/rest/v1/v_delai_mise_en_marche') {
      return route.fulfill(json([{ no_stock: 'A1234', jours_achat_reception: 2,
        jours_reception_feuille: 5, jours_feuille_service: 1,
        jours_service_en_ligne: 3, jours_total: 11 }]))
    }
    if (chemin === '/rest/v1/lead_showroom') {
      if (methode === 'POST') {
        const corps = JSON.parse(req.postData() || '{}')
        appels.push({ fonction: 'lead_showroom', p: corps })
        visites = [{
          id: 'vis-1', date_visite: corps.date_visite, client: corps.client,
          telephone: corps.telephone, statut: corps.statut, source: corps.source,
          neuf_usage: corps.neuf_usage, chrys_conq: corps.chrys_conq, echange: corps.echange,
          vehicule_id: corps.vehicule_id, no_stock: corps.vehicule_id ? 'A1234' : null,
          vehicule: null, vendeur_id: corps.vendeur_id, vendeur: null,
          saisi_par_direction: 'Direction', notes: corps.notes,
          cree_le: new Date().toISOString(),
        }, ...visites]
        return route.fulfill(json([], 201))
      }
      return route.fulfill(json(visites))
    }
    if (chemin === '/rest/v1/code_reparation') return route.fulfill(json(CODES))
    if (chemin === '/rest/v1/decision_historique') return route.fulfill(json([]))
    if (chemin === '/rest/v1/v_inspection_ligne_message') return route.fulfill(json(messagesLigne))
    if (chemin === '/rest/v1/inspection_ligne_message') {
      if (methode === 'POST') {
        const corps = JSON.parse(req.postData() || '{}')
        appels.push({ fonction: 'inspection_ligne_message', p: corps })
        const type = corps.type ?? 'note'
        // La réponse de l'aviseur résout la demande ouverte — reproduit ici
        // ce que fait le trigger fn_resoudre_demande_garantie côté serveur.
        if (type === 'note') {
          messagesLigne = messagesLigne.map((m) => (
            m.inspection_ligne_id === corps.inspection_ligne_id
            && m.type === 'demande_verification_garantie' && !m.resolu_le
              ? { ...m, resolu_le: new Date().toISOString(), resolu_par_nom: profil.utilisateur.nom }
              : m
          ))
        }
        messagesLigne = [...messagesLigne, {
          id: `msg-${messagesLigne.length + 1}`,
          inspection_ligne_id: corps.inspection_ligne_id,
          type,
          contenu: corps.contenu,
          cree_le: new Date().toISOString(),
          auteur_nom: profil.utilisateur.nom,
          resolu_le: null,
          resolu_par_nom: null,
        }]
        return route.fulfill(json({}, 201))
      }
    }
    if (chemin === '/rest/v1/inspection_ligne') {
      if (methode === 'PATCH') {
        const corps = JSON.parse(req.postData() || '{}')
        const cible = new AdresseURL(req.url()).searchParams.get('id') || ''
        const idLigne = cible.replace('eq.', '')
        appels.push({ fonction: 'inspection_ligne', methode, p: corps })
        // Réplique fn_garde_inspection_ligne : sous_garantie pilote decision.
        if ('sous_garantie' in corps) {
          if (corps.sous_garantie) corps.decision = 'garantie'
          else {
            const avant = lignes.find((l) => l.id === idLigne)
            if (avant?.decision === 'garantie') corps.decision = 'en_attente'
            corps.garantie_lieu = null
            corps.garantie_rdv = null
            corps.garantie_parti_le = null
            corps.garantie_retour_le = null
            corps.garantie_statut_avant = null
          }
        }
        // Réplique le retour : complète la ligne, remet le véhicule où il était.
        if (corps.garantie_retour_le) {
          corps.complete = true
          const avant = lignes.find((l) => l.id === idLigne)
          if (vehicule.statut === 'MÉCANIQUE EXTERNE' && avant?.garantie_statut_avant) {
            vehicule = { ...vehicule, statut: avant.garantie_statut_avant }
          }
        }
        lignes = lignes.map((l) => (l.id === idLigne ? { ...l, ...corps } : l))
        return route.fulfill(json([]))
      }
      if (methode === 'POST') {
        const corps = JSON.parse(req.postData() || '{}')
        appels.push({ fonction: 'inspection_ligne', methode, p: corps })
        return route.fulfill(json([], 201))
      }
      // Réplique la tâche planifiée : l'heure du rendez-vous venue, le
      // véhicule part réellement — jamais au moment de la planification.
      lignes = lignes.map((l) => {
        if (l.sous_garantie && l.garantie_rdv && !l.garantie_parti_le && !l.garantie_retour_le
            && new Date(l.garantie_rdv).getTime() <= Date.now()) {
          const statutAvant = vehicule.statut
          vehicule = { ...vehicule, statut: 'MÉCANIQUE EXTERNE' }
          return { ...l, garantie_parti_le: new Date().toISOString(), garantie_statut_avant: statutAvant }
        }
        return l
      })
      // Desking filtre par decision/complete — répliqué ici pour rester
      // fidèle à la vraie requête plutôt que de renvoyer tout sans distinction.
      const paramsLignes = new AdresseURL(req.url()).searchParams
      let resultat = lignes
      if (paramsLignes.get('decision') === 'eq.signature') {
        resultat = resultat.filter((l) => l.decision === 'signature')
      }
      if (paramsLignes.get('complete') === 'eq.false') {
        resultat = resultat.filter((l) => !l.complete)
      }
      return route.fulfill(json(resultat))
    }
    if (chemin === '/rest/v1/inspection') {
      if (methode === 'PATCH') {
        const corps = JSON.parse(req.postData() || '{}')
        appels.push({ fonction: 'inspection', methode, p: corps })
        technicien = corps.technicien ?? technicien
        return route.fulfill(json([]))
      }
      return route.fulfill(json([], 201))
    }
    if (chemin === '/rest/v1/v_file_service_app') {
      return route.fulfill(json([{
        vehicule_id: 'veh-1', no_stock: 'A1234', vehicule: '2021 HONDA ACCORD SPORT',
        statut_vehicule: 'PRÊT À INSPECTER', statut_autorisation: 'En attente',
        nb_lignes: 2, nb_en_attente: 2, base_a_faire: 0, garantie_a_faire: 0,
        signature_en_attente_vente: 0, cout_base_a_venir: voitCouts ? 800 : null,
        requiert_inspection_saaq: true, saaq_rdv_le: null, saaq_complete_le: null,
        jours_inventaire: 11,
      }]))
    }
    if (chemin === '/rest/v1/v_inspection_statut_app') {
      return route.fulfill(json({
        inspection_id: 'insp-1', vehicule_id: 'veh-1', no_stock: 'A1234',
        nb_lignes: lignes.length,
        nb_en_attente: lignes.filter((l) => l.decision === 'en_attente').length,
        nb_refusees: 0, nb_de_base: 0, nb_signature: 0, nb_garantie: 0,
        statut_autorisation: 'En attente',
        cout_base_engage: voitCouts ? 0 : null,
        cout_signature_engage: voitCouts ? 0 : null,
        cout_base_a_venir: voitCouts ? 800 : null,
        cout_signature_potentiel: voitCouts ? 450 : null,
        valeur_garantie: voitCouts ? 0 : null,
        cout_evite: voitCouts ? 0 : null,
        cree_le: '2026-08-12T10:00:00Z',
        technicien,
      }))
    }

    if (chemin === '/rest/v1/v_demande_travaux_app') {
      const params = new AdresseURL(req.url()).searchParams
      const filtres = [...params.entries()].filter(([c]) => c !== 'select' && c !== 'order')
      const avecCompte = demandesTravaux.map((d) => ({
        ...d,
        nb_lignes: lignesTravaux.filter((l) => l.demande_id === d.id).length,
        nb_completees: lignesTravaux.filter((l) => l.demande_id === d.id && l.complete).length,
      }))
      const liste = avecCompte.filter((d) =>
        filtres.every(([champ, valeur]) => String(d[champ]) === valeur.replace('eq.', '')))
      return route.fulfill(json(liste))
    }
    if (chemin === '/rest/v1/demande_travaux_ligne') {
      const params = new AdresseURL(req.url()).searchParams
      if (methode === 'POST') {
        const corps = JSON.parse(req.postData() || '{}')
        appels.push({ fonction: 'demande_travaux_ligne', methode, p: corps })
        lignesTravaux = [...lignesTravaux, {
          id: `dtl-${lignesTravaux.length + 1}`, complete: false, complete_le: null, complete_par: null,
          ...corps,
        }]
        return route.fulfill(json([], 201))
      }
      if (methode === 'PATCH') {
        const corps = JSON.parse(req.postData() || '{}')
        const idLigne = (params.get('id') || '').replace('eq.', '')
        appels.push({ fonction: 'demande_travaux_ligne', methode, p: corps })
        lignesTravaux = lignesTravaux.map((l) => (l.id === idLigne ? { ...l, ...corps } : l))

        // Réplique le trigger fn_completer_demande_travaux.
        const ligne = lignesTravaux.find((l) => l.id === idLigne)
        if (ligne && 'complete' in corps) {
          const soeurs = lignesTravaux.filter((l) => l.demande_id === ligne.demande_id)
          const toutesFaites = soeurs.every((l) => l.complete)
          demandesTravaux = demandesTravaux.map((d) => {
            if (d.id !== ligne.demande_id) return d
            if (toutesFaites && d.statut === 'envoyee') {
              return { ...d, statut: 'completee', completee_le: new Date().toISOString() }
            }
            if (!toutesFaites && d.statut === 'completee') {
              return { ...d, statut: 'envoyee', completee_le: null }
            }
            return d
          })
        }
        return route.fulfill(json([]))
      }
      if (methode === 'DELETE') {
        const idLigne = (params.get('id') || '').replace('eq.', '')
        appels.push({ fonction: 'demande_travaux_ligne', methode, p: idLigne })
        lignesTravaux = lignesTravaux.filter((l) => l.id !== idLigne)
        return route.fulfill(json([]))
      }
      const idDemande = (params.get('demande_id') || '').replace('eq.', '')
      return route.fulfill(json(lignesTravaux.filter((l) => l.demande_id === idDemande)))
    }

    if (chemin.startsWith('/rest/v1/rpc/')) {
      const fonction = chemin.replace('/rest/v1/rpc/', '')
      const p = JSON.parse(req.postData() || '{}')
      appels.push({ fonction, p })
      if (fonction === 'fn_calcul_signature') {
        // Réplique la formule du brief §5.5 : base × (1 + marge), ramené
        // entre plancher et plafond — mêmes valeurs que celles seedées en base.
        const exclues = new Set(p.p_lignes_exclues ?? [])
        const base = lignes.filter((l) => l.decision === 'signature' && !l.complete && !exclues.has(l.id))
          .reduce((t, l) => t + (l.cout ?? 0), 0)
        const marge = 0.35
        const plancher = 1500
        const plafond = 4500
        const brut = Math.round(base * (1 + marge))
        const prix = Math.min(Math.max(brut, plancher), plafond)
        return route.fulfill(json([{ base, marge, brut, plancher, plafond, prix }]))
      }
      if (fonction === 'changer_statut') vehicule = { ...vehicule, statut: p.p_statut }
      if (fonction === 'completer_saaq') {
        vehicule = { ...vehicule, saaq_complete_le: new Date().toISOString(), alertes: 'Lien existant', nb_critiques: 1 }
      }
      if (fonction === 'maj_prix_vente') vehicule = { ...vehicule, prix_vente: p.p_prix }
      if (fonction === 'deplacer_vehicule') {
        const carte = { garage_interne: 'MÉCANIQUE INTERNE', disponible: 'DISPONIBLE',
                        terrebonne: 'TERREBONNE', wholesale: 'WHOLESALE' }
        vehicule = { ...vehicule, statut: carte[p.p_mouvement] ?? vehicule.statut }
      }
      if (fonction === 'enregistrer_vente') {
        // Le statut du véhicule ne bouge plus au dépôt d'une vente : seul
        // l'état du dossier change, dérivé et affiché indépendamment.
        ventes = [{
          id: 'vte-1', vehicule_id: p.p_vehicule, no_stock: 'A1234',
          vehicule_titre: '2021 HONDA ACCORD', statut_vehicule: vehicule.statut,
          client: p.p_client, telephone: p.p_telephone, courriel: null,
          vendeur: null, vendeur_id: null, type_transaction: p.p_type_transaction,
          prix_vendu: p.p_prix, etat: 'vendu', force_dossier: null, fi: null, fi_le: null,
          date_livraison_prevue: null, livre_le: null, livre_par_nom: null,
          annule_le: null, motif_annulation: null, lien_crm: null, notes: null,
          cree_le: new Date().toISOString(), cree_par_nom: 'Test',
        }]
        return route.fulfill(json('vte-1'))
      }
      if (fonction === 'noter_approbation') {
        ventes = ventes.map((x) => ({ ...x, force_dossier: p.p_force_dossier,
          etat: p.p_approuve ? 'approuve' : x.etat }))
      }
      if (fonction === 'noter_livraison') {
        vehicule = { ...vehicule, statut: 'LIVRÉ' }
        ventes = ventes.map((x) => ({ ...x, etat: 'livre', livre_le: new Date().toISOString(),
          statut_vehicule: 'LIVRÉ' }))
      }
      if (fonction === 'creer_demande_travaux') {
        const id = `dt-${demandesTravaux.length + 1}`
        demandesTravaux = [...demandesTravaux, {
          id, vehicule_id: p.p_vehicule, no_stock: vehicule.no_stock,
          vehicule_titre: vehicule.vehicule_titre, statut_vehicule: vehicule.statut,
          statut: 'brouillon', notes: p.p_notes,
          cree_par_nom: profil.utilisateur.nom, cree_le: new Date().toISOString(),
          envoyee_par_nom: null, envoyee_le: null, completee_le: null,
          annulee_le: null, motif_annulation: null,
        }]
        return route.fulfill(json(id))
      }
      if (fonction === 'envoyer_demande_travaux') {
        vehicule = { ...vehicule, statut: 'DEMANDE DE TRAVAUX' }
        demandesTravaux = demandesTravaux.map((d) => (d.id === p.p_demande
          ? { ...d, statut: 'envoyee', envoyee_par_nom: profil.utilisateur.nom,
              envoyee_le: new Date().toISOString() }
          : d))
      }
      if (fonction === 'annuler_demande_travaux') {
        demandesTravaux = demandesTravaux.map((d) => (d.id === p.p_demande
          ? { ...d, statut: 'annulee', motif_annulation: p.p_motif, annulee_le: new Date().toISOString() }
          : d))
      }
      return route.fulfill(json(fonction === 'creer_vehicule' ? 'veh-1' : null))
    }

    if (chemin.startsWith('/storage/v1/object/sign/')) {
      return route.fulfill(json({ signedURL: '/storage/v1/object/signe/veh-1/facture.pdf' }))
    }
    if (chemin.startsWith('/storage/v1/object/')) return route.fulfill(json({ Key: chemin }))

    return route.fulfill(json({}))
  })

  // Le registre NHTSA est simulé : le proxy le refuse aussi depuis ici.
  await contexte.route('**/vpic.nhtsa.dot.gov/**', (route) =>
    route.fulfill(json({
      Results: [{
        Make: 'HONDA', Model: 'Accord', ModelYear: '2021', BodyClass: 'Sedan',
        DriveType: 'FWD/Front-Wheel Drive', TransmissionStyle: 'Continuously Variable (CVT)',
        GVWR: 'Class 1: 6,000 lb or less', Seats: '5', ErrorText: '0 - VIN decoded clean.',
      }],
    })))

  const prefixe = cle === 'reception' ? 'Réception'
    : cle === 'gestionnaire' ? 'Gestionnaire'
    : cle === 'aviseur' ? 'Aviseur'
    : cle === 'directeur' ? 'Directeur'
    : cle === 'admin' ? 'Admin' : 'Vendeur'

  // Connexion + changement de mot de passe forcé
  await page.goto(ADRESSE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1.titre-marque', { timeout: 15000 })
  await page.fill('input[type=email]', profil.utilisateur.email)
  await page.fill('input[type=password]', 'temporaire')
  await page.click('button[type=submit]')
  await page.waitForSelector('h1:has-text("Bienvenue")', { timeout: 15000 })
  await page.locator('input[type=password]').nth(0).fill(profil.motDePasse)
  await page.locator('input[type=password]').nth(1).fill(profil.motDePasse)
  await page.click('button[type=submit]')
  await page.waitForSelector('.lateral', { timeout: 15000 })
  note(`${prefixe} — connexion et mot de passe changé`, true)

  // Navigation pilotée par les permissions
  const peutCreer = profil.droits.includes('vehicule.creer')
  const lienAcquisition = await page.locator('nav a:has-text("Nouvelle acquisition")').count()
  note(`${prefixe} — lien d'acquisition ${peutCreer ? 'visible' : 'masqué'}`,
       (lienAcquisition === 1) === peutCreer)

  // Accueil : chacun voit ce qui le concerne
  await page.waitForSelector('.page', { timeout: 15000 })
  note(`${prefixe} — accueil personnalisé affiché`,
       (await page.locator('h1.titre-page').textContent())?.includes('Bonjour'))

  const attenduTaches = ['vehicule.recevoir', 'feuille.saisir', 'inspection.saisir',
                         'inspection.approuver', 'inspection.completer', 'saaq.completer']
    .some((d) => profil.droits.includes(d))
  const nbTaches = await page.locator('.tache').count()
  note(`${prefixe} — tâches ${attenduTaches ? 'proposées' : 'aucune (rôle sans action)'}`,
       attenduTaches ? nbTaches > 0 : true)

  // Inventaire : compteurs et liste
  await page.click('nav a:has-text("Véhicules")')
  await page.waitForSelector('.liste-vehicules', { timeout: 15000 })
  const compteurs = await page.locator('.compteur .etiquette').allTextContents()
  note(`${prefixe} — files nommées présentes`, compteurs.length >= 3, compteurs.join(' · '))
  note(`${prefixe} — bandeau des moyennes affiché`,
       (await page.locator('.moyennes').count()) === 1)

  const detailsListe = await page.locator('.vehicule-details').first().textContent()
  const prixAchatAttendu = profil.masque.prix_achat !== null
  note(`${prefixe} — prix d'achat ${prixAchatAttendu ? 'affiché' : 'absent de la liste'}`,
       detailsListe.includes('Prix d’achat') === prixAchatAttendu)

  // Filtre par alerte critique
  // « Alertes critiques » est desormais le seul compteur au ton critique;
  // « SAAQ a faire » porte le ton attente, qui n'est pas un blocage.
  await page.locator('.compteur.ton-critique').first().click()
  await page.waitForTimeout(400)
  note(`${prefixe} — filtre « alerte critique » appliqué`,
       (await page.locator('.vehicule').count()) === 1)
  note(`${prefixe} — le filtre est dans l'URL, donc partageable`,
       page.url().includes('critiques=1'), page.url().split('?')[1] ?? '')

  // La fiche doit s'annoncer : le numéro de stock est un lien visible, et
  // chaque carte porte une action explicite. Sans elle, l'écran paraît en
  // lecture seule alors que tout se modifie dans la fiche.
  note(`${prefixe} — action « Ouvrir la fiche » présente sur la carte`,
       (await page.locator('.vehicule-actions a:has-text("Ouvrir la fiche")').count()) === 1)

  // Fiche véhicule
  await page.locator('.vehicule-actions a:has-text("Ouvrir la fiche")').first().click()
  await page.waitForSelector('.fiche-entete', { timeout: 15000 })
  note(`${prefixe} — fiche véhicule ouverte`,
       (await page.locator('.fiche-titre').textContent())?.includes('HONDA'))

  const texteFiche = await page.locator('.page').textContent()
  note(`${prefixe} — équipement coché affiché, non coché absent`,
       texteFiche.includes('Caméra de recul') && !texteFiche.includes('Toit ouvrant'))
  note(`${prefixe} — pneus affichés`, texteFiche.includes('225/50 R17'))
  note(`${prefixe} — parcours affiché`, texteFiche.includes('Acheté') && texteFiche.includes('Reçu'))
  note(`${prefixe} — alerte de lien existant visible`, texteFiche.includes('Desjardins'))

  note(`${prefixe} — profit ${profil.masque.profit === null ? 'masqué' : 'affiché'}`,
       texteFiche.includes('Profit') === (profil.masque.profit !== null))
  note(`${prefixe} — leads ${profil.masque.leads_total === null ? 'masqués' : 'affichés'}`,
       texteFiche.includes('30 derniers jours') === (profil.masque.leads_total !== null))

  // Actions réservées à `vehicule.modifier`
  const peutModifier = profil.droits.includes('vehicule.modifier')
  const blocActions = await page.locator('.bloc:has-text("Actions")').count()
  note(`${prefixe} — bloc d'actions ${peutModifier ? 'présent' : 'masqué'}`,
       (blocActions > 0) === peutModifier)

  // SAAQ : le bouton n'apparaît qu'avec `saaq.completer`
  const attenduSaaq = profil.droits.includes('saaq.completer')
  const boutonSaaq = await page.locator('button:has-text("Marquer l’inspection SAAQ faite")').count()
  note(`${prefixe} — bouton SAAQ ${attenduSaaq ? 'présent' : 'masqué'} sur la fiche`,
       (boutonSaaq > 0) === attenduSaaq)

  if (peutModifier) {
    // Le menu de statuts n'existe plus : on note un fait, le statut suit.
    note(`${prefixe} — aucun menu de statut libre sur la fiche`,
         (await page.locator('.bloc:has-text("Actions") select').count()) === 0)

    await page.locator('button:has-text("Entré au garage")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — deplacer_vehicule appelé`,
         appels.some((a) => a.fonction === 'deplacer_vehicule'
                         && a.p.p_mouvement === 'garage_interne'))
    note(`${prefixe} — statut rafraîchi à l'écran`,
         (await page.locator('.statut.gros').textContent())?.includes('MÉCANIQUE'))

    await page.locator('.bloc:has-text("Actions") input[type=number]').fill('23495')
    await page.locator('button:has-text("Enregistrer le prix")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — maj_prix_vente appelé`,
         appels.some((a) => a.fonction === 'maj_prix_vente' && a.p.p_prix === 23495))
  }

  // --- Feuille d'équipements (étape 5) ---
  if (profil.droits.includes('feuille.saisir')) {
    const lienFeuille = page.locator('a:has-text("Remplir la feuille")')
    note(`${prefixe} — accès à la feuille annoncé sur la fiche`,
         (await lienFeuille.count()) === 1)

    await lienFeuille.first().click()
    await page.waitForSelector('.feuille', { timeout: 15000 })
    note(`${prefixe} — feuille ouverte`,
         (await page.locator('.valeur-vin').textContent())?.includes('1HGCM82633A004352'))
    note(`${prefixe} — demarrer_feuille appelé à l'ouverture`,
         appels.some((a) => a.fonction === 'demarrer_feuille'))

    // Décodage du VIN : propose, n'écrase pas
    await page.locator('button:has-text("Décoder le VIN")').click()
    await page.waitForSelector('.propositions', { timeout: 10000 })
    const proposition = await page.locator('.propositions').textContent()
    note(`${prefixe} — FWD traduit en « TA »`, proposition.includes('TA'))
    note(`${prefixe} — CVT traduit en « AUTO »`, proposition.includes('AUTO'))
    note(`${prefixe} — GVWR « Class 1: 6,000 lb » lu comme un nombre`, proposition.includes('6000'))

    const kmAvant = await page.locator('.feuille .champ:has-text("Kilométrage") input').inputValue()
    await page.locator('button:has-text("Reporter dans le formulaire")').click()
    await page.waitForTimeout(300)
    const kmApres = await page.locator('.feuille .champ:has-text("Kilométrage") input').inputValue()
    note(`${prefixe} — le décodage n'écrase pas un champ déjà saisi`, kmAvant === kmApres)

    // Sauvegarde automatique champ par champ
    const champCles = page.locator('.feuille .champ:has-text("Nombre de clés") input')
    await champCles.fill('3')
    await champCles.blur()
    await page.waitForTimeout(900)
    note(`${prefixe} — maj_caracteristiques appelé en quittant le champ`,
         appels.some((a) => a.fonction === 'maj_caracteristiques' && a.p.p_nb_clefs === 3))

    // Équipement
    await page.locator('.cases .case:has-text("Toit ouvrant") input').check()
    await page.waitForTimeout(700)
    note(`${prefixe} — basculer_equipement appelé`,
         appels.some((a) => a.fonction === 'basculer_equipement' && a.p.p_actif === true))

    // Pneus
    const bloc = page.locator('form.pneu').first()
    await bloc.locator('input[name=largeur]').fill('235')
    await bloc.locator('button[type=submit]').click()
    await page.waitForTimeout(900)
    note(`${prefixe} — enregistrer_pneu appelé`,
         appels.some((a) => a.fonction === 'enregistrer_pneu' && a.p.p_largeur === 235))

    // Complétion et envoi au service
    await page.locator('button:has-text("Compléter la feuille")').click()
    await page.waitForTimeout(900)
    note(`${prefixe} — completer_feuille appelé`,
         appels.some((a) => a.fonction === 'completer_feuille'))

    await page.locator('button:has-text("Envoyer au service")').click()
    await page.waitForTimeout(900)
    note(`${prefixe} — envoyer_au_service appelé`,
         appels.some((a) => a.fonction === 'envoyer_au_service'))

    await page.screenshot({ path: `apercu-feuille-${cle}.png`, fullPage: true })
  }

  // --- Service et inspection (étapes 2 et 3) ---
  const droitsService = ['inspection.saisir', 'inspection.approuver', 'inspection.completer']
  const voitService = droitsService.some((d) => profil.droits.includes(d))
  note(`${prefixe} — onglet Service ${voitService ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Service")').count()) === 1) === voitService)

  if (voitService) {
    await page.click('nav a:has-text("Service")')
    await page.waitForSelector('.liste-vehicules', { timeout: 15000 })
    note(`${prefixe} — file du service chargée`,
         (await page.locator('.vehicule').count()) === 1)
    note(`${prefixe} — alerte SAAQ visible dans la file`,
         (await page.locator('.alerte.critique').count()) >= 1)

    if (cle === 'aviseur') {
      note(`${prefixe} — demande de travaux du concessionnaire visible dans la file`,
           (await page.locator('.carte-travaux').count()) === 1)
    }

    await page.locator('a:has-text("Ouvrir l’inspection")').first().click()
    await page.waitForSelector('.lignes-inspection', { timeout: 15000 })
    note(`${prefixe} — inspection ouverte, lignes affichées`,
         (await page.locator('.ligne-inspection').count()) === 3)
    note(`${prefixe} — code de réparation affiché`,
         (await page.locator('.pastille.rouge').count()) === 1)

    const texteInspection = await page.locator('.page').textContent()
    note(`${prefixe} — totaux ${voitCouts ? 'affichés' : 'masqués'}`,
         texteInspection.includes('Coût de base') === voitCouts)
    note(`${prefixe} — infos de garantie du véhicule affichées`,
         texteInspection.includes('3 ans / 60 000 km'))
    note(`${prefixe} — « Garantie » n'est plus un bouton de décision`,
         (await page.locator('.boutons-decision button:has-text("Garantie")').count()) === 0)

    // Sous garantie : réservé à `inspection.garantie`, jamais au directeur
    const peutGarantie = profil.droits.includes('inspection.garantie')
    const premiereCaseGarantie = page.locator('.ligne-inspection').first().locator('label.case:has-text("Sous garantie") input')
    note(`${prefixe} — case « Sous garantie » ${peutGarantie ? 'présente' : 'masquée'}`,
         (await premiereCaseGarantie.count() > 0) === peutGarantie)

    if (peutGarantie) {
      // `.click()` plutôt que `.check()` : la case se désactive le temps de
      // l'appel, ce qui surprend l'assertion intégrée de Playwright.
      await premiereCaseGarantie.click()
      await page.waitForTimeout(900)
      note(`${prefixe} — cocher sous garantie pose decision=garantie`,
           (await page.locator('.ligne-inspection').first().locator('.decision-actuelle').textContent())
             ?.includes('Garantie'))
      note(`${prefixe} — plus de boutons de décision sur une ligne sous garantie`,
           (await page.locator('.ligne-inspection').first().locator('.bouton-decision').count()) === 0)

      const premiereLigne = page.locator('.ligne-inspection').first()
      const formPlanif = premiereLigne.locator('form.formulaire-court')

      // Un rendez-vous futur planifie, mais ne déplace rien tout de suite.
      await formPlanif.locator('input[name=lieu]').fill('Audi Brossard')
      await formPlanif.locator('input[name=rdv]').fill('2099-01-01T09:00')
      await formPlanif.locator('button:has-text("Planifier")').click()
      await page.waitForTimeout(900)
      note(`${prefixe} — rendez-vous de garantie planifié`,
           appels.some((a) => a.fonction === 'inspection_ligne' && a.p.garantie_lieu === 'Audi Brossard'))
      note(`${prefixe} — le véhicule reste ici en attendant l'heure du rendez-vous`,
           (await page.locator('.bandeau-succes').textContent())?.includes('à l’heure prévue'))
      note(`${prefixe} — pas encore parti`,
           (await premiereLigne.locator('.ligne-meta').last().textContent())?.includes('encore ici'))
      note(`${prefixe} — pas de bouton de retour avant le départ`,
           (await page.locator('button:has-text("Marquer le retour du véhicule")').count()) === 0)

      // Un rendez-vous déjà passé : la prochaine consultation constate le départ.
      await formPlanif.locator('input[name=rdv]').fill('2020-01-01T09:00')
      await formPlanif.locator('button:has-text("Planifier")').click()
      await page.waitForTimeout(900)
      note(`${prefixe} — le véhicule est parti une fois l'heure du rendez-vous passée`,
           (await premiereLigne.locator('.ligne-meta').last().textContent())?.includes('Parti le'))

      const boutonRetour = page.locator('button:has-text("Marquer le retour du véhicule")')
      note(`${prefixe} — bouton de retour disponible une fois le véhicule parti`,
           (await boutonRetour.count()) === 1)
      await boutonRetour.click()
      await page.waitForTimeout(900)
      note(`${prefixe} — retour du véhicule enregistré`,
           appels.some((a) => a.fonction === 'inspection_ligne' && a.p.garantie_retour_le))
      note(`${prefixe} — le retour complète la réparation`,
           (await premiereLigne.locator('.fait').first().textContent())?.includes('Fait'))

      await premiereCaseGarantie.click()
      await page.waitForTimeout(900)
      note(`${prefixe} — décocher sous garantie rend la ligne au directeur`,
           (await page.locator('.ligne-inspection').first().locator('.decision-actuelle').textContent())
             ?.includes('En attente'))
    }

    // Décisions : réservées à `inspection.approuver`
    const peutApprouver = profil.droits.includes('inspection.approuver')
    note(`${prefixe} — boutons de décision ${peutApprouver ? 'présents' : 'masqués'}`,
         ((await page.locator('.bouton-decision').count()) > 0) === peutApprouver)

    if (peutApprouver) {
      await page.locator('.ligne-inspection').first().locator('button:has-text("De base")').click()
      await page.waitForTimeout(900)
      note(`${prefixe} — décision « de_base » envoyée`,
           appels.some((a) => a.fonction === 'inspection_ligne' && a.p.decision === 'de_base'))
      note(`${prefixe} — aucun champ d'auteur envoyé (§6.2)`,
           !appels.some((a) => a.fonction === 'inspection_ligne'
             && Object.keys(a.p).some((k) => k.endsWith('_par'))))
      note(`${prefixe} — total « De base » suit la décision`,
           (await page.locator('.page').textContent()).includes('800'))
    }

    // Discussion garantie (Q1) : le directeur demande, l'aviseur répond — la
    // réponse résout la demande, jamais une case à cocher séparée.
    if (peutApprouver) {
      const premiereLigne = page.locator('.ligne-inspection').first()
      const formMessage = premiereLigne.locator('form.formulaire-court')
      await formMessage.locator('input[name=contenu]').fill('Peux-tu revérifier la couverture ?')
      await formMessage.locator('label.case input').check()
      await formMessage.locator('button:has-text("Envoyer")').click()
      await page.waitForTimeout(900)
      note(`${prefixe} — demande de vérification garantie envoyée`,
           appels.some((a) => a.fonction === 'inspection_ligne_message'
             && a.p.type === 'demande_verification_garantie'))
      note(`${prefixe} — la demande apparaît dans le fil de la ligne`,
           (await premiereLigne.locator('.discussion-ligne').textContent())?.includes('Vérification demandée'))

      if (peutGarantie) {
        await formMessage.locator('input[name=contenu]').fill('Vérifié — hors garantie.')
        await formMessage.locator('button:has-text("Envoyer")').click()
        await page.waitForTimeout(900)
        note(`${prefixe} — la réponse de l'aviseur résout la demande`,
             (await premiereLigne.locator('.discussion-ligne').textContent())?.includes('Vérification répondue'))
      }
    }

    // Saisie de lignes : réservée à `inspection.saisir`
    const peutSaisir = profil.droits.includes('inspection.saisir')
    note(`${prefixe} — formulaire d'ajout ${peutSaisir ? 'présent' : 'masqué'}`,
         ((await page.locator('form.ajout-ligne').count()) > 0) === peutSaisir)
    note(`${prefixe} — case « Sous garantie » à l'ajout ${peutGarantie ? 'présente' : 'masquée'}`,
         ((await page.locator('form.ajout-ligne input[name=sous_garantie]').count()) > 0) === peutGarantie)

    // Technicien : champ éditable par inspection.saisir, texte simple sinon
    if (peutSaisir) {
      const champTechnicien = page.locator('input[name=technicien]')
      await champTechnicien.fill('Marc Tremblay')
      await champTechnicien.blur()
      await page.waitForTimeout(900)
      note(`${prefixe} — technicien enregistré`,
           appels.some((a) => a.fonction === 'inspection' && a.p.technicien === 'Marc Tremblay'))
    } else {
      note(`${prefixe} — technicien affiché en lecture seule`,
           (await page.locator('input[name=technicien]').count()) === 0)
    }

    // Bouton SAAQ : réservé à `saaq.completer`
    const peutSaaq = profil.droits.includes('saaq.completer')
    note(`${prefixe} — bouton SAAQ ${peutSaaq ? 'présent' : 'masqué'} sur l'inspection`,
         ((await page.locator('button:has-text("Marquer l’inspection SAAQ faite")').count()) > 0) === peutSaaq)

    await page.screenshot({ path: `apercu-inspection-${cle}.png`, fullPage: true })
  }

  // --- Ventes : le statut comme conséquence ---
  const droitsVente = ['vente.enregistrer', 'vente.financement', 'vente.livrer']
  const voitVentes = droitsVente.some((d) => profil.droits.includes(d))
  note(`${prefixe} — onglet Ventes ${voitVentes ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Ventes")').count()) === 1) === voitVentes)

  if (voitVentes && profil.droits.includes('vente.enregistrer')) {
    await page.click('nav a:has-text("Ventes")')
    await page.waitForSelector('.compteurs', { timeout: 15000 })

    await page.locator('button:has-text("Nouvelle vente")').click()
    await page.waitForSelector('form select[name=vehicule]', { timeout: 5000 })
    await page.selectOption('select[name=vehicule]', { index: 1 })
    await page.fill('input[name=client]', 'Client Essai')
    await page.selectOption('select[name=type]', 'financement')
    await page.fill('input[name=telephone]', '514-555-0000')
    await page.locator('button:has-text("Enregistrer la vente")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — enregistrer_vente appelé`,
         appels.some((a) => a.fonction === 'enregistrer_vente'
                         && a.p.p_type_transaction === 'financement'))
    note(`${prefixe} — le dossier apparaît avec l'état dérivé`,
         (await page.locator('.vente').first().textContent())?.includes('Vendu'))

    if (profil.droits.includes('vente.financement')) {
      await page.locator('summary:has-text("Noter l’approbation")').first().click()
      await page.selectOption('select[name=force]', 'faible')
      await page.locator('.formulaire-court button:has-text("Enregistrer")').first().click()
      await page.waitForTimeout(1200)
      note(`${prefixe} — dossier qualifié faible`,
           appels.some((a) => a.fonction === 'noter_approbation'
                           && a.p.p_force_dossier === 'faible'))
      note(`${prefixe} — l'alerte « second client » s'affiche`,
           (await page.locator('.vente .alerte.critique').count()) === 1)
    }

    await page.screenshot({ path: `apercu-ventes-${cle}.png`, fullPage: true })
  }

  // --- Demande de travaux : l'envers de l'inspection ---
  const voitTravaux = ['travaux.demander', 'travaux.gerer', 'travaux.completer']
    .some((d) => profil.droits.includes(d))

  await page.click('nav a:has-text("Véhicules")')
  await page.waitForSelector('.liste-vehicules', { timeout: 15000 })
  await page.locator('.vehicule-actions a:has-text("Ouvrir la fiche")').first().click()
  await page.waitForSelector('.fiche-entete', { timeout: 15000 })

  const blocTravaux = await page.locator('.bloc:has-text("Demande de travaux")').count()
  note(`${prefixe} — bloc « Demande de travaux » ${voitTravaux ? 'présent' : 'masqué'} sur la fiche`,
       (blocTravaux > 0) === voitTravaux)

  if (voitTravaux) {
    await page.click('a:has-text("Ouvrir la demande de travaux")')
    await page.waitForSelector('.fiche-entete', { timeout: 15000 })

    const peutComposer = profil.droits.includes('travaux.demander') || profil.droits.includes('travaux.gerer')
    const peutGerer = profil.droits.includes('travaux.gerer')

    if (cle === 'aviseur') {
      // Une demande déjà envoyée par le concessionnaire attend le service.
      note(`${prefixe} — demande envoyée affichée avec ses deux tâches`,
           (await page.locator('.ligne-inspection').count()) === 2)

      const premiereCase = page.locator('.ligne-inspection').first().locator('input[type=checkbox]')
      note(`${prefixe} — case à cocher présente (travaux.completer)`,
           (await premiereCase.count()) === 1)

      // `.click()` plutôt que `.check()` : la case se désactive le temps de
      // l'appel (comme dans Inspection.tsx), donc l'assertion intégrée de
      // Playwright sur l'état coché la surprend en plein aller-retour réseau.
      await premiereCase.click()
      await page.waitForTimeout(900)
      note(`${prefixe} — travail marqué fait`,
           appels.some((a) => a.fonction === 'demande_travaux_ligne' && a.methode === 'PATCH'
                           && a.p.complete === true))
      note(`${prefixe} — case cochée après le retour serveur`, await premiereCase.isChecked())
    } else if (peutComposer) {
      note(`${prefixe} — formulaire de création proposé`,
           (await page.locator('button:has-text("Nouvelle demande")').count()) === 1)

      await page.click('button:has-text("Nouvelle demande")')
      await page.fill('textarea[name=notes]', 'Vendu — remplir essence, réparer miroir')
      await page.click('button:has-text("Créer la demande")')
      await page.waitForTimeout(900)
      note(`${prefixe} — creer_demande_travaux appelé`,
           appels.some((a) => a.fonction === 'creer_demande_travaux'))

      await page.fill('input[name=description]', 'Réparer le miroir')
      await page.click('button:has-text("Ajouter la tâche")')
      await page.waitForTimeout(900)
      note(`${prefixe} — ligne ajoutée à la demande`,
           appels.some((a) => a.fonction === 'demande_travaux_ligne' && a.methode === 'POST'))

      const boutonEnvoyer = page.locator('button:has-text("Envoyer au service")')
      note(`${prefixe} — bouton « Envoyer au service » ${peutGerer ? 'présent' : 'masqué'}`,
           ((await boutonEnvoyer.count()) > 0) === peutGerer)

      if (peutGerer) {
        await boutonEnvoyer.click()
        await page.waitForTimeout(900)
        note(`${prefixe} — envoyer_demande_travaux appelé`,
             appels.some((a) => a.fonction === 'envoyer_demande_travaux'))
        note(`${prefixe} — le véhicule est déplacé, affiché sur sa propre fiche`,
             (await page.locator('.statut.gros').first().textContent())?.includes('DEMANDE DE TRAVAUX'))
      }
    }

    await page.screenshot({ path: `apercu-travaux-${cle}.png`, fullPage: true })
  }

  // --- Desking : Signature dynamique (PHASE 2) ---
  const voitDesking = profil.droits.includes('vente.enregistrer') || profil.droits.includes('vehicule.voir_couts')
  await page.click('nav a:has-text("Véhicules")')
  await page.waitForSelector('.liste-vehicules', { timeout: 15000 })
  await page.locator('.vehicule-actions a:has-text("Ouvrir la fiche")').first().click()
  await page.waitForSelector('.fiche-entete', { timeout: 15000 })

  const blocDesking = await page.locator('.bloc:has-text("Desking")').count()
  note(`${prefixe} — bloc « Desking » ${voitDesking ? 'présent' : 'masqué'} sur la fiche`,
       (blocDesking > 0) === voitDesking)

  if (voitDesking) {
    await page.click('a:has-text("Ouvrir le desking")')
    await page.waitForSelector('.desking-colonnes', { timeout: 15000 })

    const chiffres = async (loc) => ((await loc.textContent()) ?? '').replace(/\D/g, '')
    // Le prix « tel quel » suit vehicule.prix_vente, modifié plus tôt dans le
    // scénario pour qui a vehicule.modifier — lu en direct plutôt que figé.
    const prixCourant = vehicule.prix_vente

    note(`${prefixe} — prix tel quel affiché`,
         (await chiffres(page.locator('.desking-colonne').first().locator('.desking-prix'))) === String(prixCourant))

    note(`${prefixe} — travail Signature listé`,
         (await page.locator('.desking-signature .ligne-inspection').count()) === 1)

    await page.waitForTimeout(500)
    // 600 $ × 1,35 = 810 $, ramené au plancher 1500 $ -> prix tel quel + 1500 $
    note(`${prefixe} — prix Signature calculé et ramené au plancher configuré`,
         (await chiffres(page.locator('.desking-signature .desking-prix'))) === String(prixCourant + 1500))

    // Décocher le seul travail : le fil recalcule via fn_calcul_signature.
    await page.locator('.desking-signature input[type=checkbox]').uncheck()
    await page.waitForTimeout(500)
    note(`${prefixe} — décocher un travail relance le calcul (à la carte)`,
         appels.some((a) => a.fonction === 'fn_calcul_signature'
           && (a.p.p_lignes_exclues ?? []).includes('l3')))
    await page.locator('.desking-signature input[type=checkbox]').check()
    await page.waitForTimeout(500)

    await page.click('button:has-text("Confirmer et générer le bon de préparation")')
    await page.waitForTimeout(900)
    note(`${prefixe} — bon de préparation créé, rempli et envoyé au service`,
         appels.some((a) => a.fonction === 'creer_demande_travaux' && a.p.p_origine === 'manuelle')
         && appels.some((a) => a.fonction === 'demande_travaux_ligne' && a.methode === 'POST'
                            && a.p.description === 'Freins à refaire')
         && appels.some((a) => a.fonction === 'envoyer_demande_travaux'))

    await page.screenshot({ path: `apercu-desking-${cle}.png`, fullPage: true })
  }

  // --- Tableaux de bord ---
  const voitRapports = profil.droits.includes('rapport.voir')
  note(`${prefixe} — onglet Tableaux de bord ${voitRapports ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Tableaux de bord")').count()) === 1) === voitRapports)

  if (voitRapports) {
    await page.click('nav a:has-text("Tableaux de bord")')
    await page.waitForSelector('.compteurs', { timeout: 15000 })
    const texteBord = await page.locator('.page').textContent()

    note(`${prefixe} — indicateurs de stock affichés`, texteBord.includes('Vieillissants'))
    note(`${prefixe} — affichage web affiché`, texteBord.includes('Taux en ligne'))
    note(`${prefixe} — profit ${voitProfit ? 'affiché' : 'masqué'}`,
         texteBord.includes('Profit moyen') === voitProfit)
    note(`${prefixe} — capital immobilisé ${voitPrixAchat ? 'affiché' : 'masqué'}`,
         texteBord.includes('Capital immobilisé') === voitPrixAchat)
    note(`${prefixe} — leads par source en barres`,
         (await page.locator('.barres > li').count()) === 2)
    note(`${prefixe} — stock sans lead signalé`, texteBord.includes('sans lead depuis 30 jours'))
    note(`${prefixe} — le stock sans lead ouvre sa fiche (§3.2)`,
         (await page.locator('a.lien-stock[href="/vehicule/veh-1"]').count()) > 0)

    await page.screenshot({ path: `apercu-tableaux-${cle}.png`, fullPage: true })
  }

  // --- Parcours : où les véhicules bloquent ---
  const voitParcours = profil.droits.includes('rapport.voir')
  note(`${prefixe} — onglet Parcours ${voitParcours ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Parcours")').count()) === 1) === voitParcours)

  if (voitParcours) {
    await page.click('nav a:has-text("Parcours")')
    await page.waitForSelector('.fiche-grille', { timeout: 15000 })
    note(`${prefixe} — délais moyens affichés`,
         (await page.locator('.page').textContent())?.includes('Achat → réception'))

    // Par défaut, seuls les véhicules encore en préparation
    note(`${prefixe} — les disponibles sont masqués par défaut`,
         (await page.locator('.tableau tbody tr').count()) === 1)
    note(`${prefixe} — le masquage est expliqué, pas silencieux`,
         (await page.locator('.page').textContent())?.includes('remplie dans Airtable'))

    await page.locator('.case:has-text("déjà disponibles") input').check()
    await page.waitForTimeout(400)
    note(`${prefixe} — les disponibles réapparaissent sur demande`,
         (await page.locator('.tableau tbody tr').count()) === 2)
    note(`${prefixe} — le blocage ancien est signalé en rouge`,
         (await page.locator('.jours-alerte').count()) === 2)
    note(`${prefixe} — un véhicule bloqué ouvre sa fiche (§3.2)`,
         (await page.locator('a.lien-stock[href="/vehicule/veh-1"]').count()) > 0)

    await page.screenshot({ path: `apercu-parcours-${cle}.png`, fullPage: true })
  }

  // --- Visites du jour (phone-up / walk-in) ---
  const voitVisites = profil.droits.includes('lead.saisir') || profil.droits.includes('lead.voir')
  note(`${prefixe} — onglet Visites ${voitVisites ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Visites")').count()) === 1) === voitVisites)

  if (profil.droits.includes('lead.saisir')) {
    await page.click('nav a:has-text("Visites")')
    await page.waitForSelector('.compteurs', { timeout: 15000 })

    await page.fill('input[name=client]', 'Client Walkin')
    await page.fill('input[name=telephone]', '514-555-1111')
    await page.locator('button:has-text("Ajouter la visite")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — visite enregistrée`,
         appels.some((a) => a.fonction === 'lead_showroom' && a.p.client === 'Client Walkin'))
    note(`${prefixe} — la direction est tracée comme saisisseur`,
         appels.some((a) => a.fonction === 'lead_showroom' && a.p.direction_id))
    note(`${prefixe} — le compteur Walk-in a suivi`,
         (await page.locator('.compteur:has-text("Walk-in") .chiffre').textContent()) === '1')
    note(`${prefixe} — le curseur revient au nom du client`,
         await page.locator('input[name=client]').evaluate((el) => el === document.activeElement))

    await page.screenshot({ path: `apercu-visites-${cle}.png`, fullPage: true })
  }

  // --- Réglages (étape 7) ---
  const droitsAdmin = ['admin.utilisateurs', 'admin.permissions', 'admin.notifications', 'parametres.signature']
  const voitReglages = droitsAdmin.some((d) => profil.droits.includes(d))
  note(`${prefixe} — onglet Réglages ${voitReglages ? 'visible' : 'masqué'}`,
       ((await page.locator('nav a:has-text("Réglages")').count()) === 1) === voitReglages)

  if (voitReglages) {
    await page.click('nav a:has-text("Réglages")')
    await page.waitForSelector('.bloc', { timeout: 15000 })

    const gereUtilisateursTest = profil.droits.includes('admin.utilisateurs')
    if (gereUtilisateursTest) {
      note(`${prefixe} — employés listés, inactif compris`,
           (await page.locator('.tableau tbody tr').first().count()) === 1
           && (await page.locator('.tableau tr.inactif').count()) === 1)

      note(`${prefixe} — employé sans compte de connexion signalé`,
           (await page.locator('.message-avertissement').textContent())?.includes('Nouvelle recrue'))

      // On ne doit pas pouvoir se retirer ses propres droits
      const monRole = page.locator('.tableau tbody tr').filter({ hasText: 'Yanik Durand' })
      note(`${prefixe} — son propre rôle est verrouillé`,
           await monRole.locator('select').isDisabled())
      note(`${prefixe} — sa propre désactivation est verrouillée`,
           await monRole.locator('input[type=checkbox]').isDisabled())

      // Changement de rôle d'un autre
      const autre = page.locator('.tableau tbody tr').filter({ hasText: 'Nouvelle recrue' })
      await autre.locator('select').selectOption('aviseur')
      await page.waitForTimeout(900)
      note(`${prefixe} — changement de rôle envoyé`,
           appels.some((a) => a.fonction === 'utilisateur' && a.p.role === 'aviseur'))
    }

    const gerePermissionsTest = profil.droits.includes('admin.permissions')
    if (gerePermissionsTest) {
      // Grille des droits
      note(`${prefixe} — grille des droits affichée`,
           (await page.locator('.grille-droits').count()) === 1)
      const caseVendeurProfit = page.locator('.grille-droits tbody tr')
        .filter({ hasText: 'Voir le profit' }).locator('input[type=checkbox]').nth(1)
      note(`${prefixe} — vendeur n'a pas « Voir le profit »`,
           !(await caseVendeurProfit.isChecked()))
      await caseVendeurProfit.check()
      await page.waitForTimeout(900)
      note(`${prefixe} — droit accordé au rôle`,
           appels.some((a) => a.fonction === 'role_permission' && a.methode === 'POST'))
    }

    // Programme Signature : marge/plancher/plafond, jamais codés en dur
    const voitSignature = profil.droits.includes('parametres.signature')
    note(`${prefixe} — réglages Signature ${voitSignature ? 'affichés' : 'masqués'}`,
         ((await page.locator('h2:has-text("Programme Signature")').count()) === 1) === voitSignature)

    if (voitSignature) {
      note(`${prefixe} — marge Signature préremplie à 35`,
           (await page.locator('input[name=marge]').inputValue()) === '35')
      await page.locator('input[name=plafond]').fill('5000')
      await page.locator('form:has(input[name=marge]) button[type=submit]').click()
      await page.waitForTimeout(900)
      note(`${prefixe} — paramètres Signature enregistrés`,
           appels.some((a) => a.fonction === 'config'
             && a.p.some((x) => x.cle === 'signature_plafond' && x.valeur === '5000')))
    }

    await page.screenshot({ path: `apercu-reglages-${cle}.png`, fullPage: true })
  }

  await page.screenshot({ path: `apercu-fiche-${cle}.png`, fullPage: true })
  await contexte.close()
}

// --- Exécution --------------------------------------------------------------

const navigateur = await chromium.launch(cheminChrome ? { executablePath: cheminChrome } : {})
try {
  await scenario(navigateur, 'reception')
  await scenario(navigateur, 'gestionnaire')
  await scenario(navigateur, 'aviseur')
  await scenario(navigateur, 'directeur')
  await scenario(navigateur, 'admin')
  await scenario(navigateur, 'vendeur')
} catch (e) {
  note('Exécution du scénario', false, e.message.split('\n')[0])
} finally {
  await navigateur.close()
}

// Garde-fou : un droit qu'aucun profil ne detient laisse son ecran non teste,
// et ses assertions passent a vide. C'est arrive trois fois — approbation,
// reglages, ventes. On le detecte desormais.
const TOUS_LES_DROITS = [
  'admin.notifications', 'admin.permissions', 'admin.utilisateurs', 'affichage.voir',
  'alerte.resoudre', 'feuille.saisir', 'inspection.approuver', 'inspection.completer',
  'inspection.saisir', 'inspection.garantie', 'lead.voir', 'rapport.voir', 'saaq.completer', 'vehicule.creer',
  'vehicule.modifier', 'vehicule.recevoir', 'vehicule.voir', 'vehicule.voir_couts',
  'vehicule.voir_prix_achat', 'vehicule.voir_profit',
  'vente.enregistrer', 'vente.financement', 'vente.livrer', 'lead.saisir',
  'travaux.demander', 'travaux.gerer', 'travaux.completer',
]
const couverts = new Set(Object.values(PROFILS).flatMap((p) => p.droits))
const orphelins = TOUS_LES_DROITS.filter((d) => !couverts.has(d))
note('Chaque droit est exerce par au moins un profil', orphelins.length === 0,
     orphelins.join(', '))

const echecs = etapes.filter((e) => !e.ok)
console.log(`\n=== ${etapes.length - echecs.length}/${etapes.length} vérifications réussies ===`)
if (echecs.length) {
  for (const e of echecs) console.log(' ECHEC:', e.nom, '|', e.detail)
  process.exit(1)
}
