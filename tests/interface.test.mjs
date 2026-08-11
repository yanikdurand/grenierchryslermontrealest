/**
 * Test de l'interface avec les appels Supabase simulés.
 *
 * Le proxy sortant de cet environnement refuse *.supabase.co (403 de
 * politique), donc le navigateur ne peut pas joindre la vraie base. On
 * intercepte les appels pour valider la logique de l'écran; le comportement
 * de la base, lui, a été vérifié séparément en SQL en simulant chaque rôle.
 */
import { chromium } from 'playwright'
import { URL as AdresseURL } from 'node:url'

const URL = 'http://127.0.0.1:5173/'
const etapes = []
const appelsRpc = []

function note(nom, ok, detail = '') {
  etapes.push({ nom, ok, detail })
  console.log(`${ok ? 'OK   ' : 'ECHEC'} | ${nom}${detail ? ' — ' + detail : ''}`)
}

const MOI = {
  id: '16fe7408-f5ce-48e9-9254-7f9cc2632b27',
  nom: 'Emily Dupont',
  email: 'reception@grenierchryslermtlest.com',
  role: 'receptionniste',
  actif: true,
  auth_user_id: 'auth-emily',
}

const DROITS_RECEPTION = [
  'vehicule.creer', 'vehicule.modifier', 'vehicule.recevoir',
  'vehicule.voir', 'vehicule.voir_prix_achat',
]

let doitChanger = true
let vehicules = []

function utilisateurAuth() {
  return {
    id: 'auth-emily',
    aud: 'authenticated',
    role: 'authenticated',
    email: MOI.email,
    user_metadata: { nom: MOI.nom, doit_changer_mdp: doitChanger },
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: new Date().toISOString(),
  }
}

function session() {
  return {
    access_token: 'jeton-simule',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-simule',
    user: utilisateurAuth(),
  }
}

const navigateur = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
const page = await contexte.newPage()
page.on('pageerror', (e) => console.log('ERREUR JS:', e.message))

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
  headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' },
})

await contexte.route('**/*.supabase.co/**', async (route) => {
  const req = route.request()
  const url = new AdresseURL(req.url())
  const chemin = url.pathname
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

  // --- Authentification ---
  if (chemin === '/auth/v1/token') {
    const corps = JSON.parse(req.postData() || '{}')
    if (corps.password !== 'Grenier-B01E5-2026' && corps.password !== 'NouveauMotDePasse1') {
      return route.fulfill(json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400))
    }
    return route.fulfill(json(session()))
  }
  if (chemin === '/auth/v1/user' && methode === 'PUT') {
    const corps = JSON.parse(req.postData() || '{}')
    if (corps.data && corps.data.doit_changer_mdp === false) doitChanger = false
    return route.fulfill(json(utilisateurAuth()))
  }
  if (chemin === '/auth/v1/user') return route.fulfill(json(utilisateurAuth()))
  if (chemin === '/auth/v1/logout') return route.fulfill({ status: 204 })

  // --- Données ---
  if (chemin === '/rest/v1/utilisateur') return route.fulfill(json(MOI))
  if (chemin === '/rest/v1/v_permissions_effectives') {
    return route.fulfill(json(DROITS_RECEPTION.map((c) => ({ permission_code: c, accorde: true }))))
  }
  if (chemin === '/rest/v1/fournisseur') {
    return route.fulfill(json([
      { id: 1, nom: 'Encan' },
      { id: 2, nom: 'Échange client' },
      { id: 3, nom: 'Autres' },
    ]))
  }
  if (chemin === '/rest/v1/v_vehicule_app') return route.fulfill(json(vehicules))
  if (chemin === '/rest/v1/document') {
    if (methode === 'POST') return route.fulfill(json({}, 201))
    return route.fulfill(json([{ vehicule_id: 'veh-1', type: 'facture_fournisseur' }]))
  }

  // --- Fonctions métier ---
  if (chemin === '/rest/v1/rpc/creer_vehicule') {
    const p = JSON.parse(req.postData() || '{}')
    appelsRpc.push({ fonction: 'creer_vehicule', p })
    vehicules = [{
      id: 'veh-1', no_stock: p.p_no_stock, vin: p.p_vin,
      vehicule_titre: `${p.p_annee} ${p.p_marque} ${p.p_modele}`,
      annee: p.p_annee, marque: p.p_marque, modele: p.p_modele,
      statut: 'ATT. RÉCEPTION', statut_ordre: 1,
      fournisseur: p.p_fournisseur, fournisseur_autre: p.p_fournisseur_autre,
      km: p.p_km, prix_vente: null, prix_achat: p.p_prix_achat,
      lien_carfax: p.p_lien_carfax, lien_existant: p.p_lien_existant,
      lien_existant_note: p.p_lien_existant_note,
      requiert_inspection_saaq: p.p_requiert_saaq, saaq_complete_le: null,
      date_recu: null, jours_inventaire: null,
      nb_alertes: p.p_requiert_saaq ? 1 : 0,
      nb_critiques: p.p_requiert_saaq ? 1 : 0,
      alertes: p.p_requiert_saaq ? 'Inspection SAAQ requise' : null,
    }]
    return route.fulfill(json('veh-1'))
  }
  if (chemin === '/rest/v1/rpc/recevoir_vehicule') {
    appelsRpc.push({ fonction: 'recevoir_vehicule', p: JSON.parse(req.postData() || '{}') })
    vehicules = vehicules.map((v) => ({ ...v, statut: 'VÉHICULE REÇU', statut_ordre: 2 }))
    return route.fulfill(json(null))
  }

  // --- Storage ---
  if (chemin.startsWith('/storage/v1/object/')) {
    return route.fulfill(json({ Key: chemin }, 200))
  }

  return route.fulfill(json({}, 200))
})

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1.titre-marque', { timeout: 15000 })
  note('Ecran de connexion affiche', true)

  // Mauvais mot de passe -> message en francais
  await page.fill('input[type=email]', MOI.email)
  await page.fill('input[type=password]', 'mauvais')
  await page.click('button[type=submit]')
  await page.waitForSelector('.message-erreur', { timeout: 10000 })
  let msg = await page.locator('.message-erreur').textContent()
  note('Identifiants invalides traduits en francais', msg?.includes('incorrect'), msg ?? '')

  // Connexion -> changement force
  await page.fill('input[type=password]', 'Grenier-B01E5-2026')
  await page.click('button[type=submit]')
  await page.waitForSelector('h1:has-text("Bienvenue")', { timeout: 15000 })
  const bienvenue = await page.locator('h1.titre-marque').textContent()
  note('Mot de passe temporaire force le changement', bienvenue?.includes('Emily Dupont'), bienvenue ?? '')

  // Confirmation differente -> refus cote client
  await page.locator('input[type=password]').nth(0).fill('NouveauMotDePasse1')
  await page.locator('input[type=password]').nth(1).fill('pas-pareil')
  await page.click('button[type=submit]')
  await page.waitForSelector('.message-erreur', { timeout: 5000 })
  msg = await page.locator('.message-erreur').textContent()
  note('Confirmation differente refusee', msg?.includes('identiques'), msg ?? '')

  // Trop court -> refus
  await page.locator('input[type=password]').nth(0).fill('court')
  await page.locator('input[type=password]').nth(1).fill('court')
  await page.click('button[type=submit]')
  msg = await page.locator('.message-erreur').textContent()
  note('Mot de passe trop court refuse', msg?.includes('8 caractères'), msg ?? '')

  // Changement valide
  await page.locator('input[type=password]').nth(0).fill('NouveauMotDePasse1')
  await page.locator('input[type=password]').nth(1).fill('NouveauMotDePasse1')
  await page.click('button[type=submit]')
  await page.waitForSelector('.entete', { timeout: 15000 })
  const role = await page.locator('.identite .role').textContent()
  note('Entree dans l application avec le bon role', role?.includes('Réception'), role ?? '')

  // Navigation pilotee par les permissions
  const nbLiens = await page.locator('nav a:has-text("Nouvelle acquisition")').count()
  note('Lien d acquisition visible (vehicule.creer accorde)', nbLiens === 1)

  // Formulaire
  await page.click('nav a:has-text("Nouvelle acquisition")')
  await page.waitForSelector('form.formulaire', { timeout: 10000 })
  note('Bouton desactive au depart', await page.locator('button[type=submit]').isDisabled())
  note('Champ SAAQ absent sans immatriculation',
       (await page.locator('legend:has-text("Inspection SAAQ")').count()) === 0)

  // VIN invalide
  await page.locator('.champ:has-text("VIN") input').fill('ABC')
  await page.waitForSelector('.indice-erreur', { timeout: 5000 })
  let indice = await page.locator('.indice-erreur').first().textContent()
  note('VIN trop court signale', indice?.includes('17 caractères'), indice ?? '')

  await page.locator('.champ:has-text("VIN") input').fill('1HGCM82633A0O4352')
  indice = await page.locator('.indice-erreur').first().textContent()
  note('VIN contenant un O refuse', indice?.includes('I, O ou Q'), indice ?? '')

  // Remplissage
  await page.locator('.champ:has-text("Numéro de stock") input').fill('ZZE2E01')
  await page.locator('.champ:has-text("VIN") input').fill('1HGCM82633A004352')
  await page.locator('.champ:has-text("Marque") input').fill('HONDA')
  await page.locator('.champ:has-text("Modèle") input').fill('ACCORD')
  await page.locator('.champ:has-text("Année") input').fill('2021')
  await page.locator('.champ:has-text("Prix d’achat") input').fill('15500')
  await page.locator('.champ:has-text("Lien Carfax") input').fill('https://carfax.ca/test')
  await page.selectOption('.champ:has-text("Fournisseur") select', 'Encan')

  note('Toujours bloque sans justificatif d achat',
       await page.locator('button[type=submit]').isDisabled())

  // Justificatif
  await page.locator('.champ:has-text("Facture du fournisseur") input[type=file]').setInputFiles({
    name: 'facture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n', 'utf8'),
  })
  await page.waitForTimeout(200)
  note('Bouton actif une fois le justificatif joint',
       await page.locator('button[type=submit]').isEnabled())

  // Le libelle change pour une reprise
  await page.selectOption('.champ:has-text("Fournisseur") select', 'Échange client')
  await page.waitForTimeout(200)
  note("Libelle « feuille d'évaluation » pour une reprise",
       (await page.locator('.champ:has-text("Feuille d’évaluation"), .champ:has-text("Feuille d\'évaluation")').count()) > 0)
  await page.selectOption('.champ:has-text("Fournisseur") select', 'Encan')

  // Immatriculation -> SAAQ obligatoire
  await page.locator('.champ:has-text("Photo des immatriculations") input[type=file]').setInputFiles({
    name: 'immat.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  })
  await page.waitForSelector('legend:has-text("Inspection SAAQ")', { timeout: 5000 })
  note('Champ SAAQ apparait avec l immatriculation', true)
  note('Bouton rebloque tant que SAAQ est sans reponse',
       await page.locator('button[type=submit]').isDisabled())

  await page.locator('.radio:has-text("Oui") input').check()
  await page.waitForTimeout(200)
  note('Avertissement d alerte critique SAAQ affiche',
       (await page.locator('.note-alerte:has-text("alerte critique")').count()) > 0)

  // Lien existant
  await page.locator('.case:has-text("solde reste dû") input').check()
  await page.waitForTimeout(200)
  note('Avertissement affiche pour un lien existant',
       (await page.locator('.note-alerte').count()) >= 2)

  note('Bouton actif, formulaire complet', await page.locator('button[type=submit]').isEnabled())

  // Soumission
  await page.click('button[type=submit]')
  await page.waitForSelector('.bandeau-succes', { timeout: 20000 })
  const succes = await page.locator('.bandeau-succes').textContent()
  note('Bandeau de succes affiche', succes?.includes('ZZE2E01'), succes?.replace(/\s+/g, ' ').slice(0, 90) ?? '')

  // Verification de la charge utile envoyee a creer_vehicule
  const appel = appelsRpc.find((a) => a.fonction === 'creer_vehicule')
  note('creer_vehicule appele (pas d insertion directe)', Boolean(appel))
  note('VIN normalise en majuscules', appel?.p.p_vin === '1HGCM82633A004352', appel?.p.p_vin)
  note('requiert_saaq transmis a vrai', appel?.p.p_requiert_saaq === true)
  note('lien_existant transmis a vrai', appel?.p.p_lien_existant === true)
  note('Aucun champ d auteur envoye (§6.2)',
       !Object.keys(appel?.p ?? {}).some((k) => /cree_par|_par$/.test(k)),
       Object.keys(appel?.p ?? {}).filter((k) => /_par/.test(k)).join(',') || 'aucun')

  // Liste
  await page.waitForSelector('.vehicule:has-text("ZZE2E01")', { timeout: 10000 })
  const carte = page.locator('.vehicule:has-text("ZZE2E01")')
  note('Statut ATT. RÉCEPTION', (await carte.locator('.statut').textContent())?.includes('ATT'))
  note('Alerte SAAQ visible',
       (await carte.locator('.alerte.critique').allTextContents()).join(' ').includes('SAAQ'))
  const details = await carte.locator('.vehicule-details').textContent()
  note('Prix d achat affiche a la reception', details?.includes('15'), details?.replace(/\s+/g, ' ').trim())

  // Marquer reçu
  await carte.locator('button:has-text("Marquer reçu")').click()
  await page.waitForTimeout(1200)
  note('recevoir_vehicule appele',
       appelsRpc.some((a) => a.fonction === 'recevoir_vehicule'))
  await page.locator('.case:has-text("En attente de réception") input').uncheck()
  await page.waitForTimeout(400)
  const statutApres = await page.locator('.vehicule:has-text("ZZE2E01") .statut').first().textContent()
  note('Statut passe a VÉHICULE REÇU', statutApres?.includes('REÇU'), statutApres ?? '')

  await page.screenshot({ path: 'apercu-liste.png' })
  await page.click('nav a:has-text("Nouvelle acquisition")')
  await page.waitForSelector('form.formulaire')
  await page.screenshot({ path: 'apercu-formulaire.png', fullPage: true })
} catch (e) {
  note('Execution du scenario', false, e.message.split('\n')[0])
  await page.screenshot({ path: 'echec.png', fullPage: true })
} finally {
  await navigateur.close()
}

const echecs = etapes.filter((e) => !e.ok)
console.log(`\n=== ${etapes.length - echecs.length}/${etapes.length} verifications reussies ===`)
if (echecs.length) {
  for (const e of echecs) console.log(' ECHEC:', e.nom, '|', e.detail)
  process.exit(1)
}
