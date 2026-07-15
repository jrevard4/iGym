import { parseBrandingFromHtml } from '../branding';

describe('parseBrandingFromHtml', () => {
  it('returns nulls for empty input', () => {
    expect(parseBrandingFromHtml('', 'https://example.com')).toEqual({
      primaryColor: null, logoUrl: null, heroImageUrl: null, siteName: null,
    });
  });

  it('extracts theme-color, og:image, apple-touch-icon, and og:site_name', () => {
    const html = `
      <html><head>
        <meta name="theme-color" content="#ff6600">
        <meta property="og:image" content="/hero.jpg">
        <meta property="og:site_name" content="Acme Gym">
        <link rel="apple-touch-icon" href="/logo.png">
      </head></html>
    `;
    const result = parseBrandingFromHtml(html, 'https://acmegym.com');
    expect(result.primaryColor).toBe('#ff6600');
    expect(result.heroImageUrl).toBe('https://acmegym.com/hero.jpg');
    expect(result.logoUrl).toBe('https://acmegym.com/logo.png');
    expect(result.siteName).toBe('Acme Gym');
  });

  it('falls back to a plain favicon link when apple-touch-icon is absent', () => {
    const html = `<link rel="icon" href="https://acmegym.com/favicon.ico">`;
    expect(parseBrandingFromHtml(html, 'https://acmegym.com').logoUrl).toBe('https://acmegym.com/favicon.ico');
  });

  it('ignores an invalid theme-color value', () => {
    const html = `<meta name="theme-color" content="not-a-color">`;
    expect(parseBrandingFromHtml(html, 'https://example.com').primaryColor).toBeNull();
  });

  it('handles attributes in any order', () => {
    const html = `<meta content="#123456" name="theme-color">`;
    expect(parseBrandingFromHtml(html, 'https://example.com').primaryColor).toBe('#123456');
  });
});
