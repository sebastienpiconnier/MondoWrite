// Le Puits : une petite histoire interactive pour découvrir le roman interactif de MondoWrite.
// À importer depuis la page des projets (Importer…), avec l'option « Roman interactif » cochée dans les Réglages.
//
// Ce qu'il faut savoir pour lire ce fichier :
//   === nom ===              une scène (MondoWrite en fait une carte Scène, titrée d'après le nom)
//   * [texte] -> nom         un choix : le texte proposé au lecteur, puis la scène où il mène
//   -> END                   la fin de l'histoire
//   VAR fait = false // Nom  un fait que le lecteur peut obtenir (le commentaire devient son nom dans l'app)
//   ~ fait = true            sous un choix : le choix donne ce fait
//   * { fait } [texte]       un choix proposé seulement si le lecteur a ce fait
//   du texte sous un choix   ce qu'on lit juste après l'avoir choisi (MondoWrite en fait une petite scène de passage)

VAR lanterne = false // La lanterne
VAR courage = 0 // Le courage

-> la_cour

=== la_cour ===
La nuit tombe sur la ferme. Au fond de la cour, le vieux puits respire comme une bête endormie.
Sur l’établi, une lanterne attend.
* [Prendre la lanterne]
    Tu soulèves la lanterne. La flamme tremble, mais elle tient.
    ~ lanterne = true
    -> le_puits
* [Aller au puits sans lumière]
    ~ courage += 1
    -> le_puits
* [Rentrer à la maison] -> la_maison

=== le_puits ===
La margelle est froide. Une échelle de fer descend dans le noir, et l’on entend l’eau tout en bas.
* { lanterne } [Descendre l’échelle] -> le_fond
* [Appeler dans le noir] -> la_voix
* [Retourner dans la cour] -> la_cour

=== la_voix ===
Ta voix descend, rebondit, puis une autre voix remonte. Ce n’est pas la tienne.
* { courage > 0 } [Répondre à la voix] -> le_fond
* [Rentrer en courant] -> la_maison

=== le_fond ===
Au fond du puits, une porte est creusée dans la pierre. Elle est entrouverte.
Tu la pousses.
-> END

=== la_maison ===
Tu tires le verrou et tu te couches. Cette nuit, tu rêves d’une échelle qui ne finit pas.
-> END
