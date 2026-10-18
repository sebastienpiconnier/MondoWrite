#!/bin/sh
# À lancer après `npm run tauri ios init` : le dossier src-tauri/gen/ n'est pas versionné et `ios init`
# y met l'icône par défaut de Tauri. On y remet les icônes MondoWrite (src-tauri/icons/ios).
set -e
cd "$(dirname "$0")/.."
dest="src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
if [ ! -d "$dest" ]; then
  echo "Projet iOS introuvable : lancez d'abord « npm run tauri ios init »." >&2
  exit 1
fi
cp src-tauri/icons/ios/*.png "$dest/"
echo "Icônes MondoWrite copiées dans $dest"
