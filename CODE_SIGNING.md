# Politique de signature du code (Code signing policy)

*English below.*

## Français

Signature du code gratuite fournie par [SignPath.io](https://about.signpath.io), certificat de la [SignPath Foundation](https://signpath.org).

Les installeurs Windows de MondoWrite (`.exe` et `.msi`) sont signés par la SignPath Foundation. Les apps macOS sont signées et notarisées par l'auteur avec son compte développeur Apple.

### Ce qui est signé

- Seuls les fichiers fabriqués par GitHub Actions à partir du code source public de ce dépôt ([`release.yml`](.github/workflows/release.yml)) sont envoyés à la signature. Aucun fichier fabriqué sur un ordinateur personnel n'est signé.
- Chaque demande de signature est approuvée à la main par un approbateur avant d'être signée.
- Les fichiers signés portent le nom de produit « MondoWrite » et le numéro de la version publiée.

### Rôles

| Rôle | Personnes |
|---|---|
| Auteurs et relecteurs (committers, reviewers) | [Sébastien Piconnier](https://github.com/sebastienpiconnier) et les [membres du dépôt](https://github.com/sebastienpiconnier/MondoWrite/graphs/contributors) dont les modifications sont acceptées après relecture |
| Approbateurs (approvers) | [Sébastien Piconnier](https://github.com/sebastienpiconnier) |

Toute contribution extérieure passe par une demande de fusion (pull request) relue par un auteur avant d'entrer dans `main`. Les membres de l'équipe utilisent l'authentification à deux facteurs sur GitHub et sur SignPath.

### Confidentialité

MondoWrite ne transmet aucune information à d'autres systèmes en réseau, sauf à la demande de l'utilisateur ou de la personne qui l'installe :

- **Projets** : ils restent des dossiers de fichiers sur l'appareil (ou dans le dossier de synchronisation choisi par l'utilisateur). MondoWrite n'a pas de serveur et ne collecte aucune donnée d'usage.
- **IA (facultative)** : rien n'est envoyé tant que l'utilisateur n'a pas choisi un service et saisi sa clé dans les Réglages. Ensuite, le texte nécessaire part vers ce service (Anthropic Claude, OpenAI, OpenRouter, ou un serveur local Ollama ou LM Studio) seulement quand l'utilisateur lance une action d'IA.
- **Photos libres** : une recherche de photos interroge le service choisi par l'utilisateur (Openverse, Pixabay ou Unsplash) avec les mots tapés.
- **Liens** : coller ou déposer une adresse sur le canevas lit cette page pour en tirer le titre, l'auteur et l'image.
- **Mises à jour** : l'app de bureau demande à GitHub, au plus une fois par jour, si une nouvelle version existe. Cette vérification se désactive dans les Réglages (« Mises à jour »).
- **Aide** : le guide s'ouvre dans le navigateur, sur GitHub Pages.

---

## English

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

MondoWrite's Windows installers (`.exe` and `.msi`) are signed by SignPath Foundation. The macOS apps are signed and notarized by the author with his Apple developer account.

### What gets signed

- Only files built by GitHub Actions from the public source code of this repository ([`release.yml`](.github/workflows/release.yml)) are submitted for signing. No file built on a personal computer is ever signed.
- Every signing request is manually approved by an approver before it is signed.
- Signed files carry the product name “MondoWrite” and the version number of the release.

### Roles

| Role | People |
|---|---|
| Committers and reviewers | [Sébastien Piconnier](https://github.com/sebastienpiconnier) and the [repository members](https://github.com/sebastienpiconnier/MondoWrite/graphs/contributors) whose changes are accepted after review |
| Approvers | [Sébastien Piconnier](https://github.com/sebastienpiconnier) |

Every outside contribution goes through a pull request reviewed by a committer before it reaches `main`. Team members use multi-factor authentication on GitHub and SignPath.

### Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it:

- **Projects** stay as folders of files on the device (or in the sync folder the user chose). MondoWrite has no server and collects no usage data.
- **AI (optional)**: nothing is sent until the user picks a service and enters a key in Settings. After that, the text needed goes to that service (Anthropic Claude, OpenAI, OpenRouter, or a local Ollama or LM Studio server) only when the user starts an AI action.
- **Free photos**: a photo search queries the service the user chose (Openverse, Pixabay or Unsplash) with the words typed.
- **Links**: pasting or dropping an address on the canvas reads that page to get its title, author and image.
- **Updates**: the desktop app asks GitHub, at most once a day, whether a new version exists. This check can be turned off in Settings (“Updates”).
- **Help**: the guide opens in the browser, on GitHub Pages.
