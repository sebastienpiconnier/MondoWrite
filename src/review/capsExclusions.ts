// Mots en capitales qui ne sont pas des personnages, dans l'action d'un scénario (#47) : indications de plan,
// de montage, de son, sigles courants. À compléter librement, une liste par langue (mots repliés : capitales,
// sans accents). Toutes les listes servent à la fois : un scénario français emploie aussi V.O., INSERT ou POV.
// Liste pure, sans import.

/** Termes techniques : retirés au bord d'un groupe (« GROS PLAN » devant un nom), écartés s'ils sont seuls. */
export const CAPS_TECH: Record<string, readonly string[]> = {
  common: [
    "INT", "EXT", "EST", "POV", "VO", "VF", "OS", "OC", "SFX", "VFX", "FX", "TV", "OK", "SMS", "GPS", "DVD", "CD",
    "PC", "ID", "DJ", "USA", "UK", "UE", "FBI", "CIA", "BD", "PDF", "URL", "WIFI", "LED", "SUV", "QG", "HQ",
    "INSERT", "FLASHBACK", "FLASH", "MONTAGE", "ZOOM", "OFF", "CONT", "MORE",
  ],
  fr: [
    "COUPE", "FONDU", "NOIR", "OUVERTURE", "ENCHAINE", "ENCHAINES", "GROS", "PLAN", "PLANS", "LARGE", "SERRE", "TRES",
    "SUR", "RETOUR", "FIN", "SUITE", "PLUS", "TARD", "CONTINU", "MEME", "MOMENT", "SERIE", "SURTITRE", "CARTON",
    "TITRE", "GENERIQUE", "DEBUT", "VOIX", "HORS", "CHAMP", "CONTRECHAMP", "PANORAMIQUE", "TRAVELLING", "RALENTI",
    "ARRET", "IMAGE", "ECRAN", "PARTAGE", "NUIT", "JOUR", "SOIR", "MATIN", "AUBE", "CREPUSCULE", "SILENCE", "TEXTO",
    "SOUS", "TITRES", "ANGLE", "VUE", "AERIENNE", "SUBJECTIVE", "INSERTS", "ELLIPSE", "PLONGEE", "CONTRE",
  ],
  en: [
    "CUT", "TO", "FADE", "IN", "OUT", "DISSOLVE", "SMASH", "MATCH", "JUMP", "CLOSE", "ON", "UP", "ANGLE", "WIDE",
    "SHOT", "SHOTS", "BACK", "END", "SERIES", "SUPER", "TITLE", "CARD", "LATER", "CONTINUOUS", "MOMENTS", "SAME",
    "TIME", "INTERCUT", "WITH", "BEGIN", "CREDITS", "BLACK", "FREEZE", "FRAME", "SLOW", "MOTION", "OVER", "VOICE",
    "CONTINUED", "ESTABLISHING", "AERIAL", "VIEW", "TRACKING", "PAN", "PUSH", "PULL", "REVERSE", "SPLIT", "SCREEN",
    "NIGHT", "DAY", "MORNING", "EVENING", "SILENCE", "TEXT", "MESSAGE", "SUBTITLE", "SUBTITLES", "INSERTS",
  ],
  es: [
    "CORTE", "FUNDIDO", "NEGRO", "ENCADENADO", "PRIMER", "PRIMERISIMO", "PLANO", "GENERAL", "DETALLE", "INSERTO",
    "FIN", "MAS", "TARDE", "CONTINUO", "MISMO", "MOMENTO", "MONTAJE", "SERIE", "TITULO", "SOBREIMPRESION", "VOZ",
    "CAMARA", "LENTA", "PANTALLA", "DIVIDIDA", "NOCHE", "DIA", "MANANA", "ATARDECER", "SILENCIO", "MENSAJE",
    "SUBTITULO", "SUBTITULOS", "CONTRAPLANO", "PICADO", "CONTRAPICADO",
  ],
};

/** Petits mots : un groupe qui n'est fait que d'eux est écarté (« DE LA »), mais « LA MÈRE » reste un nom. */
export const CAPS_FILLER: Record<string, readonly string[]> = {
  fr: ["A", "AU", "AUX", "DE", "DU", "DES", "LA", "LE", "LES", "L", "D", "UN", "UNE", "EN", "PAR", "POUR"],
  en: ["A", "AN", "THE", "OF", "AT", "BY", "FOR", "FROM", "INTO"],
  es: ["A", "AL", "DE", "DEL", "LA", "EL", "LOS", "LAS", "UN", "UNA", "EN", "POR", "PARA"],
};

/** Mots qui séparent deux noms dans un même groupe en capitales (« MARIE ET PAUL »). */
export const CAPS_JOINERS: Record<string, readonly string[]> = {
  fr: ["ET", "OU"],
  en: ["AND", "OR"],
  es: ["Y", "E", "O", "U"],
};

const all = (lists: Record<string, readonly string[]>) => new Set(Object.values(lists).flat());
export const TECH_WORDS: ReadonlySet<string> = all(CAPS_TECH);
export const FILLER_WORDS: ReadonlySet<string> = all(CAPS_FILLER);
export const JOINER_WORDS: ReadonlySet<string> = all(CAPS_JOINERS);
