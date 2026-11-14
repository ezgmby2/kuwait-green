// Image validation and metadata stripping without native dependencies.
// Photos taken on phones embed EXIF data — including exact GPS coordinates of the user's home.
// We strip that metadata server-side (the client also re-encodes, but never trust the client).

export function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// JPEG: keep APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe); drop APP1 (EXIF/XMP), other APPn and comments.
function stripJpeg(buf) {
  const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('Corrupt JPEG');
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // start of scan: rest is image data
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); return Buffer.concat(out); }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) throw new Error('Corrupt JPEG');
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new Error('Corrupt JPEG');
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!(isApp && !KEEP_APP.has(marker)) && !isComment) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new Error('Corrupt JPEG');
}

// PNG: drop textual and EXIF/time chunks.
function stripPng(buf) {
  const DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out = [buf.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new Error('Corrupt PNG');
    if (!DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) throw new Error('Corrupt PNG');
  return Buffer.concat(out);
}

// WebP: drop EXIF and XMP chunks and clear their flags in the VP8X header.
function stripWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > buf.length) throw new Error('Corrupt WebP');
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c; // clear EXIF (0x08) and XMP (0x04) flags
      chunks.push(chunk);
    }
    i = end;
  }
  if (!chunks.length) throw new Error('Corrupt WebP');
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

/** Validates the bytes are a real image and returns { type, data } with metadata removed. Throws on bad input. */
export function sanitizeImage(buf) {
  const type = detectImageType(buf);
  if (!type) throw new Error('Unsupported image type');
  const data = type === 'jpg' ? stripJpeg(buf) : type === 'png' ? stripPng(buf) : stripWebp(buf);
  return { type, data };
}
