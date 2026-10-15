import { PDFDocument } from "pdf-lib";

/** Letter printing embeds the already-purchased 4x6 PDF; never creates postage. */
export async function formatLabelPdf(
  bytes: Uint8Array,
  format: "4x6" | "letter",
) {
  if (format === "4x6") return bytes;
  const source = await PDFDocument.load(bytes);
  const result = await PDFDocument.create();
  const pages = await result.embedPdf(source, source.getPageIndices());
  for (const embedded of pages) {
    const page = result.addPage([612, 792]);
    const scale = Math.min(1, 540 / embedded.width, 720 / embedded.height);
    const width = embedded.width * scale,
      height = embedded.height * scale;
    page.drawPage(embedded, {
      x: (612 - width) / 2,
      y: 792 - 36 - height,
      width,
      height,
    });
  }
  return result.save();
}
export function validateLabelUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    !["api.shipstation.com", "api.shipengine.com"].includes(url.hostname) ||
    !/^\/v[12]\/downloads\//.test(url.pathname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "ShipStation returned an unsupported label download address.",
    );
  return url;
}
export async function downloadLabelPdf(
  url: string,
  transport: typeof fetch = fetch,
) {
  const response = await transport(validateLabelUrl(url), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > 10_000_000
  )
    throw new Error("The saved label could not be downloaded.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The saved label is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 10_000_000) {
      await reader.cancel();
      throw new Error("Label file is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("The label is not a PDF.");
  return bytes;
}
