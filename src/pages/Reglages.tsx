import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { messageErreur } from '../lib/erreurs'
import { useMoi } from '../auth/MoiContexte'
import { texte } from '../lib/format'
import { etiquetteRole } from '../lib/roles'
import type { Utilisateur } from '../lib/types'

type Permission = { code: string; libelle: string | null; categorie: string | null; ordre: number | null }
type RolePermission = { role: string; permission_code: string }
type Exception = {
  utilisateur_id: string; permission_code: string; accorde: boolean; note: string | null
}
type Evenement = { code: string; libelle: string | null; actif: boolean }
type Destinataire = {
  id: string; evenement_code: string; utilisateur_id: string | null
  courriel: string | null; actif: boolean
}

export function Reglages() {
  const { aLeDroit, utilisateur: moi } = useMoi()

  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [grille, setGrille] = useState<RolePermission[]>([])
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [evenements, setEvenements] = useState<Evenement[]>([])
  const [destinataires, setDestinataires] = useState<Destinataire[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)

  const gereUtilisateurs = aLeDroit('admin.utilisateurs')
  const gerePermissions = aLeDroit('admin.permissions')
  const gereNotifications = aLeDroit('admin.notifications')

  const charger = useCallback(async () => {
    const [u, p, rp, ex, ev, de] = await Promise.all([
      supabase.from('utilisateur').select('id, nom, email, role, actif, auth_user_id').order('nom'),
      supabase.from('permission').select('code, libelle, categorie, ordre').order('ordre'),
      supabase.from('role_permission').select('role, permission_code'),
      supabase.from('utilisateur_permission').select('utilisateur_id, permission_code, accorde, note'),
      supabase.from('notification_evenement').select('code, libelle, actif').order('code'),
      supabase.from('notification_destinataire')
        .select('id, evenement_code, utilisateur_id, courriel, actif'),
    ])

    if (u.error) setErreur(messageErreur(u.error))

    setUtilisateurs((u.data ?? []) as Utilisateur[])
    setPermissions((p.data ?? []) as Permission[])
    setGrille((rp.data ?? []) as RolePermission[])
    setExceptions((ex.data ?? []) as Exception[])
    setEvenements((ev.data ?? []) as Evenement[])
    setDestinataires((de.data ?? []) as Destinataire[])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const roles = useMemo(
    () => [...new Set(grille.map((g) => g.role))].sort((a, b) => a.localeCompare(b, 'fr')),
    [grille]
  )

  async function executer(nom: string, appel: () => PromiseLike<{ error: unknown }>, message: string) {
    setAction(nom); setErreur(null); setSucces(null)
    const { error } = await appel()
    if (error) { setErreur(messageErreur(error)); setAction(null); return }
    await charger()
    setSucces(message)
    setAction(null)
  }

  // --- Utilisateurs ---------------------------------------------------------

  async function ajouterUtilisateur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    await executer('ajout-utilisateur',
      () => supabase.from('utilisateur').insert({
        nom: String(d.get('nom') ?? '').trim(),
        email: String(d.get('email') ?? '').trim().toLowerCase() || null,
        role: String(d.get('role') ?? ''),
        actif: true,
      }),
      'Employé ajouté. Son compte de connexion reste à créer.')
    form.reset()
  }

  // --- Grille des permissions ----------------------------------------------

  const aLeDroitRole = (role: string, code: string) =>
    grille.some((g) => g.role === role && g.permission_code === code)

  /**
   * La case bascule tout de suite, sans rechargement global : la grille compte
   * près de deux cents cases, et attendre le serveur à chaque clic la rendrait
   * inutilisable. On revient en arrière si la base refuse.
   */
  async function basculerRole(role: string, code: string, accorder: boolean) {
    const avant = grille
    setGrille((g) => accorder
      ? [...g, { role, permission_code: code }]
      : g.filter((x) => !(x.role === role && x.permission_code === code)))
    setErreur(null); setSucces(null)

    const { error } = accorder
      ? await supabase.from('role_permission').insert({ role, permission_code: code })
      : await supabase.from('role_permission').delete()
          .eq('role', role).eq('permission_code', code)

    if (error) {
      setGrille(avant)
      setErreur(messageErreur(error))
      return
    }
    setSucces(`Droit ${accorder ? 'accordé' : 'retiré'} pour ${etiquetteRole(role)}.`)
  }

  // --- Exceptions nominatives ----------------------------------------------

  async function ajouterException(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    await executer('ajout-exception',
      () => supabase.from('utilisateur_permission').upsert({
        utilisateur_id: String(d.get('utilisateur') ?? ''),
        permission_code: String(d.get('permission') ?? ''),
        accorde: String(d.get('accorde')) === 'oui',
        note: String(d.get('note') ?? '').trim() || null,
      }),
      'Exception enregistrée.')
    form.reset()
  }

  // --- Destinataires --------------------------------------------------------

  async function ajouterDestinataire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    const utilisateurId = String(d.get('utilisateur') ?? '')
    await executer('ajout-destinataire',
      () => supabase.from('notification_destinataire').insert({
        evenement_code: String(d.get('evenement') ?? ''),
        utilisateur_id: utilisateurId || null,
        courriel: String(d.get('courriel') ?? '').trim().toLowerCase() || null,
        actif: true,
      }),
      'Destinataire ajouté.')
    form.reset()
  }

  if (chargement) return <div className="page"><p className="note">Chargement…</p></div>

  if (!gereUtilisateurs && !gerePermissions && !gereNotifications) {
    return (
      <div className="page">
        <p className="message-erreur">Vous n’avez pas accès aux réglages.</p>
      </div>
    )
  }

  const sansCompte = utilisateurs.filter((u) => u.actif && !u.auth_user_id)

  return (
    <div className="page">
      <h1 className="titre-page">Réglages</h1>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {succes && <p className="bandeau-succes">{succes}</p>}

      {/* --- Utilisateurs --- */}
      {gereUtilisateurs && (
        <section className="bloc">
          <h2>Employés</h2>
          <p className="note sans-marge">
            On désactive, on ne supprime jamais : l’historique doit rester lisible.
            La suppression est d’ailleurs refusée par la base.
          </p>

          {sansCompte.length > 0 && (
            <p className="message-avertissement espace-haut">
              {sansCompte.length === 1 ? 'Un employé actif n’a' : `${sansCompte.length} employés actifs n’ont`}{' '}
              pas encore de compte de connexion : {sansCompte.map((u) => u.nom).join(', ')}.
              Ajouter la ligne ici ne crée pas le compte Supabase Auth — il faut le créer
              séparément, puis il se liera au courriel.
            </p>
          )}

          <div className="tableau-defilant espace-haut">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Nom</th><th>Courriel</th><th>Rôle</th><th>Connexion</th><th>Actif</th>
                </tr>
              </thead>
              <tbody>
                {utilisateurs.map((u) => (
                  <tr key={u.id} className={u.actif ? '' : 'inactif'}>
                    <td>{u.nom}</td>
                    <td className="discret">{texte(u.email)}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={action !== null || u.id === moi?.id}
                        title={u.id === moi?.id ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}
                        onChange={(e) =>
                          executer(`role-${u.id}`,
                            () => supabase.from('utilisateur').update({ role: e.target.value }).eq('id', u.id),
                            `Rôle de ${u.nom} modifié.`)
                        }
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>{etiquetteRole(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="discret">{u.auth_user_id ? 'Oui' : '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={u.actif}
                        disabled={action !== null || u.id === moi?.id}
                        title={u.id === moi?.id ? 'Vous ne pouvez pas vous désactiver.' : undefined}
                        onChange={(e) =>
                          executer(`actif-${u.id}`,
                            () => supabase.from('utilisateur').update({ actif: e.target.checked }).eq('id', u.id),
                            `${u.nom} ${e.target.checked ? 'réactivé' : 'désactivé'}.`)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="ajout-ligne" onSubmit={ajouterUtilisateur}>
            <h3>Ajouter un employé</h3>
            <div className="grille">
              <label className="champ">
                <span>Nom</span>
                <input name="nom" required />
              </label>
              <label className="champ">
                <span>Courriel</span>
                <input name="email" type="email" />
              </label>
              <label className="champ">
                <span>Rôle</span>
                <select name="role" required defaultValue="vendeur">
                  {roles.map((r) => <option key={r} value={r}>{etiquetteRole(r)}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" className="bouton-secondaire" disabled={action !== null}>
              Ajouter l’employé
            </button>
          </form>
        </section>
      )}

      {/* --- Grille des permissions --- */}
      {gerePermissions && (
        <section className="bloc">
          <h2>Droits par rôle</h2>
          <p className="note sans-marge">
            Rien n’est codé en dur dans l’application : elle lit cette grille. Retirer une
            case ici fait disparaître le bouton correspondant chez toutes les personnes
            du rôle, et la base refusera l’action même en cas de contournement.
          </p>

          <div className="tableau-defilant espace-haut">
            <table className="tableau grille-droits">
              <thead>
                <tr>
                  <th className="colle">Droit</th>
                  {roles.map((r) => <th key={r} className="pivot">{etiquetteRole(r)}</th>)}
                </tr>
              </thead>
              <tbody>
                {permissions.map((p) => (
                  <tr key={p.code}>
                    <th className="colle" scope="row">
                      <span className="droit-libelle">{p.libelle ?? p.code}</span>
                      <span className="droit-code">{p.code}</span>
                    </th>
                    {roles.map((r) => (
                      <td key={r} className="cellule-droit">
                        <input
                          type="checkbox"
                          checked={aLeDroitRole(r, p.code)}
                          disabled={action !== null}
                          aria-label={`${p.libelle ?? p.code} pour ${etiquetteRole(r)}`}
                          onChange={(e) => basculerRole(r, p.code, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* --- Exceptions nominatives --- */}
      {gerePermissions && (
        <section className="bloc">
          <h2>Exceptions nominatives</h2>
          <p className="note sans-marge">
            Une exception l’emporte sur le rôle, dans les deux sens : elle peut accorder
            un droit que le rôle n’a pas, ou en retirer un qu’il a.
          </p>

          {exceptions.length === 0 ? (
            <p className="note">Aucune exception. Tout le monde suit son rôle.</p>
          ) : (
            <ul className="liste-simple espace-haut">
              {exceptions.map((x) => {
                const u = utilisateurs.find((y) => y.id === x.utilisateur_id)
                const p = permissions.find((y) => y.code === x.permission_code)
                return (
                  <li key={`${x.utilisateur_id}-${x.permission_code}`} className="document">
                    <span>
                      <strong>{u?.nom ?? 'Inconnu'}</strong> — {p?.libelle ?? x.permission_code} :{' '}
                      <strong>{x.accorde ? 'accordé' : 'retiré'}</strong>
                      {x.note ? ` (${x.note})` : ''}
                    </span>
                    <button
                      type="button" className="bouton-discret" disabled={action !== null}
                      onClick={() =>
                        executer(`suppr-exception-${x.utilisateur_id}-${x.permission_code}`,
                          () => supabase.from('utilisateur_permission').delete()
                            .eq('utilisateur_id', x.utilisateur_id)
                            .eq('permission_code', x.permission_code),
                          'Exception retirée.')
                      }
                    >
                      Retirer
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <form className="ajout-ligne" onSubmit={ajouterException}>
            <h3>Ajouter une exception</h3>
            <div className="grille">
              <label className="champ">
                <span>Personne</span>
                <select name="utilisateur" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {utilisateurs.filter((u) => u.actif).map((u) => (
                    <option key={u.id} value={u.id}>{u.nom}</option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span>Droit</span>
                <select name="permission" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {permissions.map((p) => (
                    <option key={p.code} value={p.code}>{p.libelle ?? p.code}</option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span>Effet</span>
                <select name="accorde" defaultValue="oui">
                  <option value="oui">Accorder</option>
                  <option value="non">Retirer</option>
                </select>
              </label>
              <label className="champ">
                <span>Note</span>
                <input name="note" placeholder="Pourquoi cette exception" />
              </label>
            </div>
            <button type="submit" className="bouton-secondaire" disabled={action !== null}>
              Enregistrer l’exception
            </button>
          </form>
        </section>
      )}

      {/* --- Destinataires des notifications --- */}
      {gereNotifications && (
        <section className="bloc">
          <h2>Destinataires des notifications</h2>
          <p className="note sans-marge">
            L’application n’envoie jamais de courriel elle-même : elle écrit dans une file
            que n8n vide aux 5 minutes.
          </p>

          {evenements.map((ev) => {
            const liste = destinataires.filter((d) => d.evenement_code === ev.code)
            return (
              <div key={ev.code} className="categorie espace-haut">
                <h3>{ev.libelle ?? ev.code}</h3>
                {liste.length === 0 ? (
                  <p className="note sans-marge">Personne n’est destinataire de cet événement.</p>
                ) : (
                  <ul className="liste-simple">
                    {liste.map((d) => {
                      const u = utilisateurs.find((y) => y.id === d.utilisateur_id)
                      return (
                        <li key={d.id} className="document">
                          <span>
                            {u?.nom ?? texte(d.courriel)}
                            {!d.actif && <span className="discret"> — inactif</span>}
                          </span>
                          <span className="vehicule-actions">
                            <button
                              type="button" className="bouton-discret" disabled={action !== null}
                              onClick={() =>
                                executer(`destinataire-${d.id}`,
                                  () => supabase.from('notification_destinataire')
                                    .update({ actif: !d.actif }).eq('id', d.id),
                                  d.actif ? 'Destinataire désactivé.' : 'Destinataire réactivé.')
                              }
                            >
                              {d.actif ? 'Désactiver' : 'Réactiver'}
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}

          <form className="ajout-ligne" onSubmit={ajouterDestinataire}>
            <h3>Ajouter un destinataire</h3>
            <div className="grille">
              <label className="champ">
                <span>Événement</span>
                <select name="evenement" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {evenements.map((ev) => (
                    <option key={ev.code} value={ev.code}>{ev.libelle ?? ev.code}</option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span>Employé</span>
                <select name="utilisateur" defaultValue="">
                  <option value="">Aucun — courriel libre</option>
                  {utilisateurs.filter((u) => u.actif).map((u) => (
                    <option key={u.id} value={u.id}>{u.nom}</option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span>Courriel</span>
                <input name="courriel" type="email" placeholder="Si hors de l’équipe" />
              </label>
            </div>
            <button type="submit" className="bouton-secondaire" disabled={action !== null}>
              Ajouter le destinataire
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
