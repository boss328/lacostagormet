import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { GENERATED_IMAGE_DIGITAL_SOURCE_TYPE, tagGeneratedPng } from './generated-image-metadata';

function chunks(png: Buffer) {
  const result: Array<{ type: string; bytes: Buffer; data: Buffer }> = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const end = offset + length + 12;
    result.push({ type: png.toString('ascii', offset + 4, offset + 8), bytes: png.subarray(offset, end), data: png.subarray(offset + 8, end - 4) });
    offset = end;
  }
  return result;
}

async function fixture() {
  return sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 23, g: 123, b: 45, alpha: 0.5 } } }).png().toBuffer();
}

test('generated disclosure is recognized by sharp while every original chunk and pixel stays unchanged', async () => {
  const original = await fixture();
  const tagged = tagGeneratedPng(original);
  const before = chunks(original);
  const after = chunks(tagged);
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after.filter(chunk => chunk.type !== 'iTXt').map(chunk => chunk.bytes), before.map(chunk => chunk.bytes));
  assert.deepEqual(after.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data), before.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
  assert.deepEqual(await sharp(tagged).raw().toBuffer(), await sharp(original).raw().toBuffer());
  const metadata = await sharp(tagged).metadata();
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 2);
  assert.ok(metadata.xmp);
  assert.ok(metadata.xmp!.toString('utf8').includes(`<Iptc4xmpExt:DigitalSourceType>${GENERATED_IMAGE_DIGITAL_SOURCE_TYPE}</Iptc4xmpExt:DigitalSourceType>`));
  assert.deepEqual(tagGeneratedPng(tagged), tagged, 'tagging twice must not add duplicate XMP');
});

test('existing unrelated or conflicting XMP is preserved by failing instead of overwriting', async () => {
  const original = await fixture();
  for (const value of [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="Existing copyright metadata"/></rdf:RDF></x:xmpmeta>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"/></rdf:RDF></x:xmpmeta>',
  ]) {
    const withXmp = await sharp(original).withXmp(value).png().toBuffer();
    const copy = Buffer.from(withXmp);
    assert.throws(() => tagGeneratedPng(withXmp), /XMP.*refusing/);
    assert.deepEqual(withXmp, copy);
  }
});

test('non-PNG, truncated PNG, corrupt chunks, and appended data are rejected', async () => {
  const original = await fixture();
  assert.throws(() => tagGeneratedPng(Buffer.from('not a PNG')), /Expected a PNG/);
  assert.throws(() => tagGeneratedPng(original.subarray(0, 20)), /chunk/);
  const corrupted = Buffer.from(original);
  corrupted[20] ^= 1;
  assert.throws(() => tagGeneratedPng(corrupted), /checksum/);
  assert.throws(() => tagGeneratedPng(Buffer.concat([original, Buffer.from('trailing')])), /after IEND/);
});
