# iPhone et iPad : installation sans câble et TestFlight

L'identifiant de l'app reste `app.cosmos.ecriture` (`identifier` dans `src-tauri/tauri.conf.json`). C'est le même pour
le Mac, le PC, Linux et iOS : le changer ferait perdre aux utilisateurs actuels leurs réglages et la mise à jour
automatique, et obligerait à refaire la signature du Mac. Le nom affiché reste « MondoWrite » (`productName`).

## 1. Installer sans câble (développement)

Une fois l'iPad branché et approuvé :

1. Xcode, menu Window, Devices and Simulators, onglet Devices : choisir l'iPad, cocher **Connect via network**.
2. Débrancher. L'iPad reste dans la liste de destinations d'Xcode (icône de réseau) tant qu'il est sur le même Wi-Fi que le Mac.
3. `npm run tauri ios dev` fonctionne alors sans câble (choisir l'iPad quand Tauri le propose).

Pour une installation fixe (sans serveur de développement sur le Mac), utiliser plutôt TestFlight ci-dessous.

## 2. TestFlight (distribution à toi-même et à des testeurs)

### Une fois, sur developer.apple.com et App Store Connect

1. **Identifiant** : Certificates, Identifiers & Profiles, Identifiers, vérifier que `app.cosmos.ecriture` existe (Xcode l'a créé au premier lancement sur l'iPad).
2. **Certificat « Apple Distribution »** : Certificates, nouveau certificat de type Apple Distribution. L'exporter depuis Trousseau d'accès en `.p12` avec un mot de passe.
   (Ce n'est pas le certificat « Developer ID » du Mac : il en faut un second.)
3. **Profil de provisionnement** : Profiles, type **App Store Connect**, pour `app.cosmos.ecriture` et le certificat ci-dessus. Le télécharger (`.mobileprovision`).
4. **Fiche de l'app** : App Store Connect, Apps, « + » Nouvelle app, plateforme iOS, nom MondoWrite, identifiant `app.cosmos.ecriture`.
5. **Clé API** : celle déjà utilisée pour la notarisation du Mac convient (APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_PRIVATE_KEY). Rôle « App Manager » ou « Admin ».

### iCloud (synchronisation des projets)

L'app utilise le conteneur iCloud `iCloud.app.cosmos.ecriture` (droits dans `src-tauri/ios/cosmos_iOS.entitlements`, copiés par `npm run ios:prepare`).
À faire **avant** de créer le profil de l'étape 3 :

1. Identifiers, `app.cosmos.ecriture`, Capabilities : cocher **iCloud** (option « Include CloudKit support » inutile), puis Configure et ajouter le conteneur `iCloud.app.cosmos.ecriture` (le créer dans Identifiers, iCloud Containers, s'il n'existe pas).
2. Créer (ou régénérer) le profil App Store Connect **après** cette modification : un profil ancien ne contient pas le droit iCloud et la build est refusée.

Sur le Mac, le même conteneur apparaît dans `~/Library/Mobile Documents/iCloud~app~cosmos~ecriture/Documents` (iCloud Drive, MondoWrite) :
le sélecteur de dossier de l'app le propose en premier.

### Secrets GitHub à ajouter (Settings, Secrets and variables, Actions)

| Secret | Contenu |
| --- | --- |
| `APPLE_DEVELOPMENT_TEAM` | l'identifiant d'équipe (10 caractères) |
| `IOS_CERTIFICATE` | `base64 -i distribution.p12 \| pbcopy` |
| `IOS_CERTIFICATE_PASSWORD` | le mot de passe du `.p12` |
| `IOS_MOBILE_PROVISION` | `base64 -i MondoWrite.mobileprovision \| pbcopy` |

`APPLE_API_ISSUER`, `APPLE_API_KEY` et `APPLE_API_PRIVATE_KEY` existent déjà.

### À chaque version

1. Onglet **Actions**, workflow **iOS vers TestFlight**, bouton **Run workflow**.
2. Une dizaine de minutes plus tard, la build apparaît dans App Store Connect, onglet TestFlight (traitement d'Apple : encore quelques minutes).
3. Sur l'iPad ou l'iPhone : installer l'app **TestFlight**, accepter l'invitation (testeur interne : ajouter son Apple ID dans App Store Connect, Utilisateurs et accès).

Le numéro de build est celui de l'exécution GitHub (il monte tout seul) ; la version affichée est celle de `tauri.conf.json`.

## Si ça échoue

- *No profiles for 'app.cosmos.ecriture'* : le profil n'est pas de type App Store Connect, ou ne contient pas le certificat Apple Distribution.
- *Invalid Swift support / icône refusée* : lancer `npm run ios:prepare` (les icônes iOS doivent être opaques, sans transparence).
- *Build number already used* : relancer le workflow (le numéro change).
