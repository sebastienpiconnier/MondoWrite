// Paquet `hyphen` (motifs de césure de TeX), sans types : seul ce que l'export du livre broché en utilise.
declare module "hyphen/fr" {
  const hyphenator: { hyphenateSync: (text: string, options?: { hyphenChar?: string; minWordLength?: number }) => string };
  export default hyphenator;
}
declare module "hyphen/en-us" {
  const hyphenator: { hyphenateSync: (text: string, options?: { hyphenChar?: string; minWordLength?: number }) => string };
  export default hyphenator;
}
declare module "hyphen/en-gb" {
  const hyphenator: { hyphenateSync: (text: string, options?: { hyphenChar?: string; minWordLength?: number }) => string };
  export default hyphenator;
}
