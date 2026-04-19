type ProductDescriptionProps = {
  html: string | null;
};

/**
 * Renders the product description from BigCommerce's rich-text field.
 * Strips `style` attributes and `<style>`, `<script>`, `<font>` tags to prevent
 * colour/typography clashes with the site's palette. Other markup (p, ul, li,
 * strong, em, a, br, h2–h4) is preserved.
 */
function sanitize(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?font[^>]*>/gi, '')
    .replace(/\s(style|class|id|width|height|bgcolor|color|face|size|align)="[^"]*"/gi, '')
    .replace(/\s(style|class|id|width|height|bgcolor|color|face|size|align)='[^']*'/gi, '');
}

export function ProductDescription({ html }: ProductDescriptionProps) {
  if (!html || html.trim().length === 0) {
    return (
      <p className="type-body text-ink-muted italic">
        No description yet — reach out and we&apos;ll tell you everything we know.
      </p>
    );
  }
  const clean = sanitize(html);
  return (
    <div
      className="product-description type-body"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
