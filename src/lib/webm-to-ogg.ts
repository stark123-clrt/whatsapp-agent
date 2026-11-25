/**
 * Convertit un enregistrement audio WebM/Opus (format de Chrome) en Ogg/Opus (format des
 * messages vocaux WhatsApp), sans réencoder le son : on change seulement « l'emballage ».
 * Gère le cas simple produit par MediaRecorder : une seule piste audio Opus, sans « lacing ».
 */

const ID = {
  SEGMENT: 0x18538067,
  CLUSTER: 0x1f43b675,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  BLOCK_GROUP: 0xa0,
  CODEC_PRIVATE: 0x63a2,
  CHANNELS: 0x9f,
  AUDIO: 0xe1,
  SIMPLE_BLOCK: 0xa3,
  BLOCK: 0xa1,
};
const MASTERS = new Set([ID.SEGMENT, ID.CLUSTER, ID.TRACKS, ID.TRACK_ENTRY, ID.BLOCK_GROUP, ID.AUDIO]);

/** Lit un entier de taille variable EBML. */
function readVint(buf: Buffer, pos: number, keepMarker: boolean) {
  const first = buf[pos];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8) throw new Error("Fichier audio WebM invalide");
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = value === (0xff >> len);
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

function parseWebm(buf: Buffer) {
  const packets: Buffer[] = [];
  let opusHead: Buffer | null = null;
  let channels = 1;

  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos < end - 1) {
      const id = readVint(buf, pos, true);
      const size = readVint(buf, pos + id.len, false);
      const dataStart = pos + id.len + size.len;
      const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);

      if (MASTERS.has(id.value)) {
        walk(dataStart, dataEnd);
      } else if (id.value === ID.CODEC_PRIVATE) {
        opusHead = buf.subarray(dataStart, dataEnd);
      } else if (id.value === ID.CHANNELS) {
        channels = buf[dataEnd - 1];
      } else if (id.value === ID.SIMPLE_BLOCK || id.value === ID.BLOCK) {
        const track = readVint(buf, dataStart, false);
        const flags = buf[dataStart + track.len + 2];
        if (flags & 0x06) throw new Error("Format audio non pris en charge (lacing)");
        packets.push(buf.subarray(dataStart + track.len + 3, dataEnd));
      }
      // Un élément de taille inconnue (cluster en streaming) a été parcouru jusqu'au bout.
      pos = size.unknown ? end : dataEnd;
    }
  };
  walk(0, buf.length);
  return { packets, opusHead: opusHead as Buffer | null, channels };
}

/** Nombre d'échantillons (à 48 kHz) d'un paquet Opus, d'après son premier octet. */
function opusSamples(packet: Buffer) {
  const toc = packet[0];
  const config = toc >> 3;
  const frameMs =
    config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? packet[1] & 0x3f : 2;
  return frames * frameMs * 48;
}

// CRC utilisé par Ogg (polynôme 0x04c11db7, sans réflexion).
const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  return r >>> 0;
});
function crc32(data: Buffer) {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc;
}

function oggPage(packets: Buffer[], granule: bigint, serial: number, seq: number, flags: number) {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write("OggS", 0);
  header[4] = 0;
  header[5] = flags;
  header.writeBigInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(seq, 18);
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);
  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(crc32(page), 22);
  return page;
}

export function webmToOgg(webm: Buffer): Buffer {
  const { packets, opusHead, channels } = parseWebm(webm);
  if (packets.length === 0) throw new Error("Enregistrement vide");

  const head =
    opusHead?.subarray(0, 8).toString() === "OpusHead"
      ? opusHead
      : (() => {
          const h = Buffer.alloc(19);
          h.write("OpusHead", 0);
          h[8] = 1;
          h[9] = channels;
          h.writeUInt16LE(312, 10); // pre-skip habituel de l'encodeur Opus
          h.writeUInt32LE(48000, 12);
          return h;
        })();
  const vendor = "whatsapp-agent";
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0);
  tags.writeUInt32LE(vendor.length, 8);
  tags.write(vendor, 12);

  const serial = Math.floor(Math.random() * 0xffffffff);
  const pages = [oggPage([head], BigInt(0), serial, 0, 0x02), oggPage([tags], BigInt(0), serial, 1, 0)];

  let granule = BigInt(0);
  let seq = 2;
  let batch: Buffer[] = [];
  let segments = 0;
  packets.forEach((p, i) => {
    const needed = Math.floor(p.length / 255) + 1;
    if (segments + needed > 255) {
      pages.push(oggPage(batch, granule, serial, seq++, 0));
      batch = [];
      segments = 0;
    }
    batch.push(p);
    segments += needed;
    granule += BigInt(opusSamples(p));
    if (i === packets.length - 1) pages.push(oggPage(batch, granule, serial, seq++, 0x04));
  });
  return Buffer.concat(pages);
}
