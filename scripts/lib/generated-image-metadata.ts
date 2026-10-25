/** Metadata-only tagging: no image decoder, pixel transform or raster re-encoding. */
export const GENERATED_IMAGE_DIGITAL_SOURCE_TYPE =
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const XMP_KEYWORD = 'XML:com.adobe.xmp';
const XMP_PACKET = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
  + '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
  + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
  + '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">\n'
  + `<Iptc4xmpExt:DigitalSourceType>${GENERATED_IMAGE_DIGITAL_SOURCE_TYPE}</Iptc4xmpExt:DigitalSourceType>\n`
  + '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';

type Chunk = { start: number; end: number; type: string; data: Buffer };

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readChunks(png: Buffer): Chunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Expected a PNG image.');
  const chunks: Chunk[] = [];
  let offset = 8;
  let ended = false;
  for (; offset < png.length;) {
    if (png.length - offset < 12) throw new Error('PNG contains a truncated chunk.');
    const length = png.readUInt32BE(offset);
    const end = offset + length + 12;
    if (length > 0x7fffffff || end > png.length) throw new Error('PNG chunk length is invalid.');
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('PNG chunk type is invalid.');
    if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) {
      throw new Error(`PNG ${type} chunk checksum is invalid.`);
    }
    const data = png.subarray(offset + 8, end - 4);
    if (chunks.length === 0 && (type !== 'IHDR' || length !== 13)) throw new Error('PNG must begin with a valid IHDR chunk.');
    if (chunks.length > 0 && type === 'IHDR') throw new Error('PNG contains duplicate IHDR chunks.');
    chunks.push({ start: offset, end, type, data });
    offset = end;
    if (type === 'IEND') {
      if (length !== 0 || offset !== png.length) throw new Error('PNG has invalid data after IEND.');
      ended = true;
      break;
    }
  }
  if (!ended || !chunks.some(chunk => chunk.type === 'IDAT')) throw new Error('PNG is missing image data or IEND.');
  return chunks;
}

function xmpText(chunk: Chunk): string | null {
  if (!['iTXt', 'tEXt', 'zTXt'].includes(chunk.type)) return null;
  const keywordEnd = chunk.data.indexOf(0);
  if (keywordEnd < 0 || chunk.data.toString('latin1', 0, keywordEnd) !== XMP_KEYWORD) return null;
  if (chunk.type !== 'iTXt' || chunk.data[keywordEnd + 1] !== 0 || chunk.data[keywordEnd + 2] !== 0) {
    throw new Error('PNG has existing compressed or unsupported XMP; refusing to replace it.');
  }
  const languageEnd = chunk.data.indexOf(0, keywordEnd + 3);
  const translatedKeywordEnd = languageEnd < 0 ? -1 : chunk.data.indexOf(0, languageEnd + 1);
  if (languageEnd < 0 || translatedKeywordEnd < 0) throw new Error('PNG contains malformed XMP metadata.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(chunk.data.subarray(translatedKeywordEnd + 1));
  } catch { throw new Error('PNG XMP metadata is not valid UTF-8.'); }
}

/**
 * Add IPTC's generated-media disclosure as an uncompressed PNG iTXt XMP packet.
 * Every existing chunk remains byte-for-byte identical. Rerunning on this exact
 * packet is a no-op. Other XMP requires a deliberate merge and is rejected,
 * including metadata with a conflicting DigitalSourceType.
 */
export function tagGeneratedPng(input: Uint8Array): Buffer {
  const png = Buffer.from(input);
  const chunks = readChunks(png);
  const existing = chunks.map(xmpText).filter((value): value is string => value !== null);
  if (existing.length) {
    if (existing.length !== 1 || existing[0] !== XMP_PACKET) {
      throw new Error('PNG already contains XMP; refusing to discard or overwrite existing metadata.');
    }
    return png;
  }

  // iTXt fields: keyword, compression flag/method, language, translated keyword,
  // followed by UTF-8 XMP. Empty language/translated fields use their NUL bytes.
  const data = Buffer.concat([Buffer.from(`${XMP_KEYWORD}\0`, 'latin1'), Buffer.from([0, 0, 0, 0]), Buffer.from(XMP_PACKET, 'utf8')]);
  const typeAndData = Buffer.concat([Buffer.from('iTXt', 'ascii'), data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), chunk.length - 4);
  const insertionPoint = chunks.find(value => value.type === 'IDAT')!.start;
  return Buffer.concat([png.subarray(0, insertionPoint), chunk, png.subarray(insertionPoint)]);
}
