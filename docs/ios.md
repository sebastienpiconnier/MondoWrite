# MondoWrite sur iPad et iPhone

Guide de test sur appareil, tel qu'il a été fait le 18 octobre 2026 (Mac Apple Silicon, Xcode 26, iPad en USB).

## Prérequis

- Xcode complet (pas seulement les outils en ligne de commande), lancé une fois pour accepter la licence.
- Node 20 ou plus, Rust, CocoaPods (`brew install cocoapods`), XcodeGen (`brew install xcodegen`).
- Cibles Rust : `rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios`
- Un compte Apple connecté dans Xcode (Réglages > Comptes). Le Team ID (10 caractères) se lit dans
  `src-tauri/gen/apple/cosmos.xcodeproj/project.pbxproj` (`DEVELOPMENT_TEAM`) ou sur developer.apple.com.

## Première installation

```bash
npm install
npm run tauri ios init
npm run ios:prepare          # remet les icônes MondoWrite (ios init pose celle de Tauri)
```

Puis, dans Xcode (`open src-tauri/gen/apple/cosmos.xcodeproj`), cible `cosmos_iOS`, onglet
« Signing & Capabilities » : cocher « Automatically manage signing » et choisir son équipe.

## Lancer sur l'iPad

iPad branché en USB, déverrouillé, « Faire confiance » accepté, mode développeur actif
(Réglages > Confidentialité et sécurité > Mode développeur).

```bash
export APPLE_DEVELOPMENT_TEAM=VOTRE_TEAM_ID
npm run tauri ios dev
```

Choisir l'iPad dans la liste. À la première ouverture, autoriser « Réseau local » (Réglages > Confidentialité
et sécurité > Réseau local > MondoWrite) : sans cela l'app n'atteint pas le serveur de développement du Mac.
Si l'iPad refuse d'ouvrir l'app : Réglages > Général > VPN et gestion de l'appareil > faire confiance au profil.

Le serveur Vite doit rester actif (terminal ouvert) et l'iPad être sur le même Wi-Fi que le Mac.
`vite.config.ts` lit `TAURI_DEV_HOST` (posé par Tauri) pour écouter sur le réseau.

## Pièges rencontrés

- **`mach_task_self` introuvable dans `libc` (crate `num_threads`)** : `libc` a retiré cette fonction pour Apple.
  `num_threads` est une dépendance de `time` (via `tauri-plugin-log`). Contournement : copie corrigée dans
  `src-tauri/vendor/num_threads/` (une ligne : `mach_task_self_` déclaré en `extern`), branchée par
  `[patch.crates-io]` dans `src-tauri/Cargo.toml`. À retirer quand `num_threads` ou ses appelants sont à jour.
- **`No Account for Team`** : un Team ID fictif ou un compte absent de Xcode. Se connecter dans Xcode, puis exporter le vrai Team ID.
- **Écran blanc avec « Failed to request http://192.168.x.x:1420 »** : permission Réseau local, pare-feu macOS
  (autoriser Node), ou adresse du Mac changée (relancer `npm run tauri ios dev`).
- **Icône Tauri au lieu de MondoWrite** : `src-tauri/gen/` n'est pas versionné, relancer `npm run ios:prepare`.

## Installer sans câble

Une fois l'iPad appairé en USB une première fois : Xcode > Window > Devices and Simulators > sélectionner
l'iPad > cocher « Connect via network ». Mac et iPad doivent être sur le même Wi-Fi. L'iPad apparaît ensuite
dans la liste de `npm run tauri ios dev` sans câble. (Pour une app qui reste installée sans le Mac, voir TestFlight.)

## Distribuer par TestFlight (auteurs testeurs)

Prérequis : compte Apple Developer Program (payant), app créée dans App Store Connect avec l'identifiant
`app.cosmos.ecriture` (ou un nouvel identifiant `app.mondowrite…` : à décider avant la première soumission, il ne change plus ensuite).

1. Incrémenter la version et le numéro de build (`tauri.conf.json`, `CFBundleVersion` dans `project.yml`).
2. `npm run tauri ios build -- --export-method app-store-connect` : produit une archive `.ipa` signée pour la distribution.
3. Envoyer l'`.ipa` avec l'app Transporter (App Store) ou `xcrun altool --upload-app`.
4. App Store Connect > TestFlight : le build apparaît après traitement. Ajouter des testeurs internes (jusqu'à 100,
   immédiat) ou externes (liens publics ou e-mails, revue Apple légère au premier build).
5. Les testeurs installent l'app TestFlight, puis MondoWrite, et reçoivent chaque mise à jour automatiquement.

Pour automatiser plus tard : une tâche GitHub Actions sur runner macOS (clé d'API App Store Connect en secret,
profils gérés par `fastlane match` ou signature automatique), sur le modèle de `release.yml`.

> Installation sans câble et TestFlight : voir [ios-testflight.md](ios-testflight.md) (workflow GitHub « iOS vers TestFlight »).
