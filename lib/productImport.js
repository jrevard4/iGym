// Parses a single equipment product page's <head> metadata — same
// meta-tag-scraping approach as lib/branding.js (og:title, og:image,
// price meta tags, JSON-LD Product schema), but aimed at populating a new
// inventory item instead of gym branding. Used by the inventory page's
// drag-and-drop import (dragging a product link from a supplier's site).

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

function resolveUrl(href, baseUrl) {
  if (!href) return null;
  try { return new URL(href, baseUrl).toString(); }
  catch { return null; }
}

// Best-effort price from a JSON-LD Product block — most commercial equipment
// pages carry one for their own SEO, which happens to make it easy to reuse.
function findJsonLdPrice(html) {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const jsonText = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
    try {
      const data = JSON.parse(jsonText);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        const offers = item?.offers;
        const price = offers?.price || offers?.[0]?.price;
        if (price) return String(price);
      }
    } catch { /* not valid/parseable JSON-LD — skip */ }
  }
  return null;
}

export function parseProductFromHtml(html, baseUrl) {
  if (!html) return { name: null, imageUrl: null, price: null, description: null };

  const name = findMetaContent(html, ['og:title', 'twitter:title']);
  const imageUrl = resolveUrl(findMetaContent(html, ['og:image', 'twitter:image']), baseUrl);
  const description = findMetaContent(html, ['og:description', 'description']);
  const price = findMetaContent(html, ['product:price:amount', 'og:price:amount']) || findJsonLdPrice(html);

  return { name, imageUrl, price, description };
}
