# Contribuer à MondoWrite / Contributing to MondoWrite

*English below.*

Merci de vouloir contribuer ! Les retours d'auteurs (bugs, idées, remarques sur l'écriture au quotidien) sont les bienvenus dans les [Issues](https://github.com/sebastienpiconnier/MondoWrite/issues), sans condition.

## Contributions de code, de textes ou d'images

MondoWrite est un logiciel libre sous licence [GNU GPL v3.0 ou ultérieure](LICENSE). Il est aussi distribué dans des boutiques d'applications (App Store d'Apple, et plus tard d'autres), dont les conditions ne sont pas compatibles avec la GPL. Pour que ces deux diffusions restent possibles, l'auteur du projet doit pouvoir publier chaque partie de MondoWrite sous d'autres conditions que la GPL.

En proposant une contribution (pull request, correctif, traduction, image, texte), vous acceptez donc que :

1. **Vous êtes l'auteur de la contribution**, ou vous avez le droit de la proposer, et elle ne reprend pas de code ou de contenu soumis à une licence incompatible avec la GPL v3 (une reprise sous licence permissive, MIT, BSD, Apache-2.0, est possible si elle est signalée dans la pull request et ajoutée à [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).
2. **Votre contribution est publiée sous la GPL v3.0 ou ultérieure**, comme le reste du projet.
3. **Vous accordez en plus à Sébastien Piconnier**, auteur de MondoWrite, une licence perpétuelle, mondiale, gratuite et non exclusive pour utiliser, modifier et distribuer votre contribution sous d'autres conditions, notamment dans les boutiques d'applications. Vous gardez vos droits d'auteur : vous restez libre de réutiliser votre contribution ailleurs, comme vous le voulez.

Pour le confirmer, ajoutez à chacun de vos commits la ligne suivante (`git commit -s` le fait pour vous) :

```
Signed-off-by: Prénom Nom <adresse@exemple.fr>
```

Une pull request sans cette ligne ne pourra pas être fusionnée.

## Règles du projet

Les règles de développement (multiplateforme, multilingue, mode sombre, accessibilité, format de fichier) sont décrites dans [CLAUDE.md](CLAUDE.md). Avant chaque pull request : `npm run build` et `npm test` doivent passer.

---

## English

Thank you for wanting to contribute! Feedback from writers (bugs, ideas, everyday writing notes) is welcome in the [Issues](https://github.com/sebastienpiconnier/MondoWrite/issues), with no conditions.

### Code, text or image contributions

MondoWrite is free software under the [GNU GPL v3.0 or later](LICENSE). It is also distributed through app stores (Apple's App Store, and later others), whose terms are not compatible with the GPL. To keep both channels possible, the project's author must be able to publish every part of MondoWrite under terms other than the GPL.

By submitting a contribution (pull request, patch, translation, image, text), you agree that:

1. **You wrote the contribution**, or have the right to submit it, and it does not include code or content under a license incompatible with the GPL v3 (reusing permissively licensed work, MIT, BSD, Apache-2.0, is fine if it is stated in the pull request and added to [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).
2. **Your contribution is released under the GPL v3.0 or later**, like the rest of the project.
3. **You also grant Sébastien Piconnier**, author of MondoWrite, a perpetual, worldwide, royalty-free, non-exclusive license to use, modify and distribute your contribution under other terms, including in app stores. You keep your copyright: you remain free to reuse your contribution elsewhere, as you wish.

To confirm, add this line to each of your commits (`git commit -s` does it for you):

```
Signed-off-by: First Last <address@example.com>
```

A pull request without this line cannot be merged.

### Project rules

Development rules (cross-platform, multilingual, dark mode, accessibility, file format) are described in [CLAUDE.md](CLAUDE.md). Before each pull request, `npm run build` and `npm test` must pass.
