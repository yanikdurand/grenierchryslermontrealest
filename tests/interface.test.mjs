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

const ADRESSE = 'http://127.0.0.1:5173/'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

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
  vendeur: {
    utilisateur: {
      id: 'u-ludo', nom: 'Ludovick Borris', email: 'lborris@grenierchryslermtlest.com',
      role: 'vendeur', actif: true, auth_user_id: 'auth-ludo',
    },
    motDePasse: 'MotDePasseLudo1',
    droits: ['vehicule.voir', 'affichage.voir'],
    // Un vendeur ne voit aucun montant sensible : Postgres renvoie des null.
    masque: { prix_achat: null, profit: null, cout_base_engage: null, leads_total: null },
  },
}

const STATUTS = [
  { id: 1, nom: 'ATT. RÉCEPTION', ordre: 1 },
  { id: 2, nom: 'VÉHICULE REÇU', ordre: 2 },
  { id: 5, nom: 'MÉCANIQUE INT.', ordre: 5 },
  { id: 10, nom: 'DISPONIBLE', ordre: 10 },
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
    garantie_complete: null, garantie_motopropulseur: null, garantie_prolongee: null,
    lien_carfax: 'https://carfax.ca/exemple', lien_existant: true,
    lien_existant_note: 'Solde chez Desjardins',
    requiert_inspection_saaq: true, saaq_rdv_le: null, saaq_complete_le: null,
    date_recu: '2026-08-01', date_mise_en_service: null, jours_inventaire: 11,
    affiche_en_ligne: false, photos_en_ligne: 0, lien_fiche_web: null, verifie_le: null,
    prix_vente: 24995,
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

// --- Scénario ---------------------------------------------------------------

async function scenario(navigateur, cle) {
  const profil = PROFILS[cle]
  const appels = []
  let doitChanger = true
  let vehicule = vehiculeDemo(profil)

  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
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

    if (chemin === '/rest/v1/utilisateur') return route.fulfill(json(profil.utilisateur))
    if (chemin === '/rest/v1/v_permissions_effectives') {
      return route.fulfill(json(profil.droits.map((c) => ({ permission_code: c, accorde: true }))))
    }
    if (chemin === '/rest/v1/statut_vehicule') return route.fulfill(json(STATUTS))
    if (chemin === '/rest/v1/fournisseur') {
      return route.fulfill(json([{ id: 1, nom: 'Encan' }, { id: 2, nom: 'Échange client' }]))
    }
    if (chemin === '/rest/v1/v_vehicule_app') {
      // `maybeSingle()` demande un objet, la liste attend un tableau.
      const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      return route.fulfill(json(seul ? vehicule : [vehicule]))
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
      return route.fulfill(json([{
        id: 'd1', type: 'facture_fournisseur', chemin_storage: 'veh-1/facture.pdf',
        nom_fichier: 'facture.pdf', ajoute_le: '2026-08-01T12:00:00Z', taille_octets: 24000,
      }]))
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

    if (chemin.startsWith('/rest/v1/rpc/')) {
      const fonction = chemin.replace('/rest/v1/rpc/', '')
      const p = JSON.parse(req.postData() || '{}')
      appels.push({ fonction, p })
      if (fonction === 'changer_statut') vehicule = { ...vehicule, statut: p.p_statut }
      if (fonction === 'completer_saaq') {
        vehicule = { ...vehicule, saaq_complete_le: new Date().toISOString(), alertes: 'Lien existant', nb_critiques: 1 }
      }
      if (fonction === 'maj_prix_vente') vehicule = { ...vehicule, prix_vente: p.p_prix }
      return route.fulfill(json(fonction === 'creer_vehicule' ? 'veh-1' : null))
    }

    if (chemin.startsWith('/storage/v1/object/sign/')) {
      return route.fulfill(json({ signedURL: '/storage/v1/object/signe/veh-1/facture.pdf' }))
    }
    if (chemin.startsWith('/storage/v1/object/')) return route.fulfill(json({ Key: chemin }))

    return route.fulfill(json({}))
  })

  const prefixe = cle === 'reception' ? 'Réception' : 'Vendeur'

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
  await page.waitForSelector('.entete', { timeout: 15000 })
  note(`${prefixe} — connexion et mot de passe changé`, true)

  // Navigation pilotée par les permissions
  const peutCreer = profil.droits.includes('vehicule.creer')
  const lienAcquisition = await page.locator('nav a:has-text("Nouvelle acquisition")').count()
  note(`${prefixe} — lien d'acquisition ${peutCreer ? 'visible' : 'masqué'}`,
       (lienAcquisition === 1) === peutCreer)

  // Inventaire : compteurs et liste
  await page.waitForSelector('.liste-vehicules', { timeout: 15000 })
  const compteurs = await page.locator('.compteur .chiffre').allTextContents()
  note(`${prefixe} — compteurs de l'inventaire`, compteurs.length === 3, compteurs.join(' / '))

  const detailsListe = await page.locator('.vehicule-details').first().textContent()
  const prixAchatAttendu = profil.masque.prix_achat !== null
  note(`${prefixe} — prix d'achat ${prixAchatAttendu ? 'affiché' : 'absent de la liste'}`,
       detailsListe.includes('Prix d’achat') === prixAchatAttendu)

  // Filtre par alerte critique
  await page.locator('.compteur.alerte').click()
  await page.waitForTimeout(300)
  note(`${prefixe} — filtre « alerte critique »`,
       (await page.locator('.vehicule').count()) === 1)

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
  const boutonSaaq = await page.locator('button:has-text("Marquer l’inspection SAAQ faite")').count()
  note(`${prefixe} — bouton SAAQ masqué (droit absent)`, boutonSaaq === 0)

  if (peutModifier) {
    await page.selectOption('.bloc:has-text("Actions") select', 'MÉCANIQUE INT.')
    await page.locator('button:has-text("Changer le statut")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — changer_statut appelé`,
         appels.some((a) => a.fonction === 'changer_statut' && a.p.p_statut === 'MÉCANIQUE INT.'))
    note(`${prefixe} — statut rafraîchi à l'écran`,
         (await page.locator('.statut.gros').textContent())?.includes('MÉCANIQUE'))

    await page.locator('.bloc:has-text("Actions") input[type=number]').fill('23495')
    await page.locator('button:has-text("Enregistrer le prix")').click()
    await page.waitForTimeout(1200)
    note(`${prefixe} — maj_prix_vente appelé`,
         appels.some((a) => a.fonction === 'maj_prix_vente' && a.p.p_prix === 23495))
  }

  await page.screenshot({ path: `apercu-fiche-${cle}.png`, fullPage: true })
  await contexte.close()
}

// --- Exécution --------------------------------------------------------------

const navigateur = await chromium.launch({ executablePath: CHROME })
try {
  await scenario(navigateur, 'reception')
  await scenario(navigateur, 'vendeur')
} catch (e) {
  note('Exécution du scénario', false, e.message.split('\n')[0])
} finally {
  await navigateur.close()
}

const echecs = etapes.filter((e) => !e.ok)
console.log(`\n=== ${etapes.length - echecs.length}/${etapes.length} vérifications réussies ===`)
if (echecs.length) {
  for (const e of echecs) console.log(' ECHEC:', e.nom, '|', e.detail)
  process.exit(1)
}
