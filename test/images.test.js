import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeImage, detectImageType } from '../server/images.js';

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // CRC not checked here
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('detects types by magic bytes, not extension', () => {
  assert.equal(detectImageType(Buffer.from('GIF89a......')), null);
  assert.equal(detectImageType(Buffer.from('<svg xmlns=...>')), null);
  assert.equal(detectImageType(Buffer.concat([PNG_SIG, Buffer.alloc(8)])), 'png');
});

test('PNG text/EXIF chunks are removed, image chunks kept', () => {
  const png = Buffer.concat([PNG_SIG, pngChunk('IHDR', Buffer.alloc(13)), pngChunk('tEXt', Buffer.from('GPS\0secret')),
    pngChunk('eXIf', Buffer.from('secret-exif')), pngChunk('IDAT', Buffer.from('pixels')), pngChunk('IEND', Buffer.alloc(0))]);
  const { type, data } = sanitizeImage(png);
  assert.equal(type, 'png');
  assert.ok(!data.includes('secret'));
  assert.ok(data.includes('IDAT') && data.includes('IEND'));
});

test('WebP EXIF/XMP chunks are removed and VP8X flags cleared', () => {
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x0c;
  const body = Buffer.concat([chunk('VP8X', vp8x), chunk('VP8 ', Buffer.from('frame')), chunk('EXIF', Buffer.from('secret-gps')), chunk('XMP ', Buffer.from('secret-xmp'))]);
  const hdr = Buffer.alloc(12); hdr.write('RIFF', 0); hdr.writeUInt32LE(body.length + 4, 4); hdr.write('WEBP', 8);
  const { data } = sanitizeImage(Buffer.concat([hdr, body]));
  assert.ok(!data.includes('secret'));
  assert.equal(data.readUInt32LE(4), data.length - 8);
  assert.equal(data[20] & 0x0c, 0);
});

test('truncated / corrupt images are rejected', () => {
  assert.throws(() => sanitizeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0, 0, 0, 0, 0])));
  assert.throws(() => sanitizeImage(Buffer.concat([PNG_SIG, pngChunk('IHDR', Buffer.alloc(13))])));
});
