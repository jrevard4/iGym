import { parseProductFromHtml } from '../productImport';

describe('parseProductFromHtml', () => {
  it('returns nulls for empty input', () => {
    expect(parseProductFromHtml('', 'https://example.com')).toEqual({
      name: null, imageUrl: null, price: null, description: null,
    });
  });

  it('extracts og:title, og:image, description, and price meta tags', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Rogue Squat Rack RML-490">
        <meta property="og:image" content="/images/rack.jpg">
        <meta property="og:description" content="A monster of a squat rack.">
        <meta property="product:price:amount" content="1295.00">
      </head></html>
    `;
    const result = parseProductFromHtml(html, 'https://roguefitness.com');
    expect(result.name).toBe('Rogue Squat Rack RML-490');
    expect(result.imageUrl).toBe('https://roguefitness.com/images/rack.jpg');
    expect(result.description).toBe('A monster of a squat rack.');
    expect(result.price).toBe('1295.00');
  });

  it('falls back to JSON-LD Product price when no price meta tag exists', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Product", "name": "Leg Press", "offers": {"price": "2499.99"}}
      </script>
    `;
    expect(parseProductFromHtml(html, 'https://example.com').price).toBe('2499.99');
  });

  it('ignores malformed JSON-LD instead of throwing', () => {
    const html = `<script type="application/ld+json">{not valid json</script>`;
    expect(parseProductFromHtml(html, 'https://example.com').price).toBeNull();
  });
});
