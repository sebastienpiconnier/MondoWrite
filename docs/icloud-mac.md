# iCloud dans l'app Mac

## Pourquoi

Sur iPhone et iPad, MondoWrite range ses projets dans son dossier iCloud (le conteneur `iCloud.app.cosmos.ecriture`). Jusqu'à la 1.3.2, l'app Mac ne déclarait pas ce conteneur à macOS : elle lisait seulement son chemin, `~/Library/Mobile Documents/iCloud~app~cosmos~ecriture/Documents`. Or macOS ne télécharge le contenu du dossier iCloud d'une app que si une app installée sur le Mac le déclare. Résultat (constaté le 27 octobre 2026) : un Mac ne recevait pas les projets créés sur l'iPhone. Il ne voyait que ceux créés ou déplacés sur lui, et une autre session du même Mac ne voyait rien.

La correction : l'app Mac déclare le conteneur (droits iCloud) et le demande au système au démarrage (`icloud_container`, comme sur iPhone). macOS la connaît alors et télécharge le dossier dans chaque session.

Les droits iCloud d'une app Mac distribuée hors du Mac App Store demandent un **profil de distribution « Developer ID »** qui porte iCloud, placé dans l'app. Sans ce profil, macOS refuse de lancer une app qui réclame ces droits : la version de dev (`npm run tauri dev`) et une Release sans profil ne les reçoivent donc pas, et gardent l'ancien comportement.

## Ce que l'auteur fait une fois, sur developer.apple.com

1. **Identifiant d'app** : Certificates, Identifiers & Profiles › Identifiers › `app.cosmos.ecriture` (le même que l'iPhone). Vérifier que la capacité **iCloud** est cochée, puis Configure : le conteneur `iCloud.app.cosmos.ecriture` doit être sélectionné (il l'est déjà pour l'iPhone). Enregistrer.
2. **Profil** : Profiles › « + » › Distribution › **Developer ID**. Choisir l'identifiant `app.cosmos.ecriture`, puis le certificat « Developer ID Application » qui sert déjà à signer l'app Mac (celui du secret `APPLE_CERTIFICATE`). Nommer le profil (par exemple « MondoWrite Mac iCloud ») et le télécharger : un fichier `.provisionprofile`.
3. **Secret GitHub** : sur le Mac, `base64 -i "MondoWrite_Mac_iCloud.provisionprofile" | pbcopy`, puis dans le dépôt, Settings › Secrets and variables › Actions › New repository secret, nom `APPLE_PROVISION_PROFILE`, coller.

Le profil expire comme le certificat : à le refaire en même temps que lui.

## Ce que fait la Release

L'étape « iCloud (macOS) » de `.github/workflows/release.yml`, seulement si `APPLE_PROVISION_PROFILE` est posé et que l'app est signée :

- décode le profil dans `src-tauri/macos/embedded.provisionprofile` (jamais versionné) ;
- vérifie qu'il est fait pour `TEAM.app.cosmos.ecriture` et qu'il porte le conteneur iCloud (sinon la Release s'arrête avec un message clair) ;
- remplace `TEAM_ID` par l'équipe du profil dans `src-tauri/macos/MondoWrite.entitlements` ;
- écrit dans `tauri.conf.json`, sur la machine de fabrication seulement, `bundle.macOS.entitlements` et `bundle.macOS.files` (le profil placé en `Contents/embedded.provisionprofile`).

## Vérifier une Release

Sur le Mac, après installation :

```
codesign -d --entitlements - /Applications/MondoWrite.app
```

doit lister `com.apple.developer.icloud-container-identifiers` avec `iCloud.app.cosmos.ecriture`. L'app doit se lancer normalement (sinon, le profil ne correspond pas aux droits). Puis créer un projet sur l'iPhone : il doit apparaître sur la page des projets du Mac, dans chaque session.
