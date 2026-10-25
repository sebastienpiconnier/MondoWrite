// WOFF (1.0) → police TrueType/OpenType ordinaire. Les fichiers de Fontsource sont en WOFF ; fontkit les lit,
// mais sa version pour navigateur abîme parfois les glyphes en les décompressant (constaté sur IBM Plex). On
// décompresse donc nous-mêmes les tables (zlib, DecompressionStream du navigateur) et fontkit reçoit une
// police ordinaire, qu'il sait aussi réduire en sous-ensemble. Format : https://www.w3.org/TR/WOFF/

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Octets d'un WOFF → octets de la police d'origine. Un fichier qui n'est pas un WOFF est rendu tel quel. */
export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < 44 || view.getUint32(0) !== 0x774f4646) return woff; // « wOFF »
  const flavor = view.getUint32(4);
  const count = view.getUint16(12);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    const tag = view.getUint32(at);
    const offset = view.getUint32(at + 4);
    const compLength = view.getUint32(at + 8);
    const origLength = view.getUint32(at + 12);
    const checksum = view.getUint32(at + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? await inflate(raw) : raw;
    if (data.byteLength !== origLength) throw new Error("woff");
    tables.push({ tag, checksum, data });
  }
  const pad = (n: number) => (n + 3) & ~3;
  let size = 12 + 16 * count;
  for (const t of tables) size += pad(t.data.byteLength);
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  let entry = 1;
  let log = 0;
  while (entry * 2 <= count) {
    entry *= 2;
    log++;
  }
  o.setUint32(0, flavor);
  o.setUint16(4, count);
  o.setUint16(6, entry * 16);
  o.setUint16(8, log);
  o.setUint16(10, count * 16 - entry * 16);
  let offset = 12 + 16 * count;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    o.setUint32(at, t.tag);
    o.setUint32(at + 4, t.checksum);
    o.setUint32(at + 8, offset);
    o.setUint32(at + 12, t.data.byteLength);
    out.set(t.data, offset);
    offset += pad(t.data.byteLength);
  });
  return out;
}
