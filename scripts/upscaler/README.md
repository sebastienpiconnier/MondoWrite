# Agrandisseur de la couverture complète (#78, lot 4)

MondoWrite agrandit sur l'appareil une image de couverture trop petite pour l'impression (×2), avec le modèle
compact de Real-ESRGAN (`realesr-general-x4v3`, BSD 3 clauses) exécuté par onnxruntime-web (MIT). Ni le modèle
ni le moteur WebAssembly d'onnxruntime-web ne sont dans l'installeur : l'app les télécharge à la première
utilisation depuis https://mondowrite.app/upscaler/, vérifie leur empreinte SHA-256 et les garde sur l'appareil
(`src/upscaler.ts`).

## Fabriquer les fichiers à publier

```bash
pip install onnx numpy onnxruntime
curl -LO https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
python3 scripts/upscaler/convert.py realesr-general-x4v3.pth realesr-general-x4v3.onnx
node scripts/upscaler/build.mjs realesr-general-x4v3.onnx [upscaler.json déjà publié]
```

`convert.py` lit les poids sans PyTorch et écrit le réseau (SRVGGNetCompact) en ONNX. `build.mjs` remplit
`dist-upscaler/` : le modèle, `ort-<version>.asyncify.wasm` (le moteur de la version d'onnxruntime-web
installée, qui doit être `ORT_VERSION` de `src/upscaler.ts`), les deux licences et `upscaler.json`. Publier tout
le dossier dans `/upscaler/` du site.

## Quand onnxruntime-web change de version

Monter `onnxruntime-web`, changer `ORT_VERSION`, refaire `build.mjs` **en lui passant l'`upscaler.json` déjà
publié** : la liste garde les moteurs des versions précédentes, pour les installations pas encore mises à jour.
Ne jamais retirer un ancien `ort-*.wasm` du site.
