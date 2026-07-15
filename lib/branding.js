// Pulls basic brand identity (color, logo, hero image) out of a website's
// <head> metadata — the same tags every site already ships for link
// previews (theme-color, og:image, apple-touch-icon), so this works without
// scraping page content or needing a headless browser.
// Pure string parsing (regex, not a DOM), so it runs in any JS runtime.

function getAttr(tag, attr) {
  const m = tag.match(new RegExp(attr + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  return m ? m[1] : null;
}

function findMetaContent(html, names) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (getAttr(tag, 'name') || getAttr(tag, 'property') || '').toLowerCase();
    if (names.includes(key)) {
      const content = getAttr(tag, 'content');
      if (content) return content;
    }
  }
  return null;
}

function findLinkHref(html, relSubstrings) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const wanted of relSubstrings) {
    for (const tag of tags) {
      const rel = (getAttr(tag, 'rel') || '').toLowerCase();
      if (rel.includes(wanted)) {
        const href = getAttr(tag, 'href');
        if (href) return href;
      }
    }
  }
  return null;
}

function resolveUrl(href, baseUrl) {
  if (!href) return null;
  try { return new URL(href, baseUrl).toString(); }
  catch { return null; }
}

function isValidCssColor(value) {
  if (!value) return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^rgba?\(/i.test(value) || /^hsla?\(/i.test(value);
}

export function parseBrandingFromHtml(html, baseUrl) {
  if (!html) return { primaryColor: null, logoUrl: null, heroImageUrl: null, siteName: null };

  const rawColor = findMetaContent(html, ['theme-color']);
  const primaryColor = isValidCssColor(rawColor) ? rawColor : null;

  const logoUrl = resolveUrl(
    findLinkHref(html, ['apple-touch-icon', 'icon']),
    baseUrl
  );

  const heroImageUrl = resolveUrl(findMetaContent(html, ['og:image']), baseUrl);
  const siteName = findMetaContent(html, ['og:site_name']);

  return { primaryColor, logoUrl, heroImageUrl, siteName };
}
