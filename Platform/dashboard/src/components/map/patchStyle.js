export async function loadPatchedStyle(styleUrl, apiKey) {
  const res = await fetch(styleUrl, { mode: "cors" });
  if (!res.ok) throw new Error(`Failed to fetch style: ${res.status} ${res.statusText}`);
  const style = await res.json();

  const makeAbsolutePreserveTokens = (url, baseStyleUrl) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url; // already absolute

    const base = new URL(baseStyleUrl, window.location.href);
    const styleDir = base.origin + base.pathname.replace(/[^/]+$/, ""); // keep trailing "/"

    if (url.startsWith("/")) return base.origin + url; // root-relative
    return styleDir + url; // relative to style.json directory
  };

  const addKeyOnce = (url, key) => {
    if (!url || !key) return url;
    if (/[?&]key=/.test(url)) return url;
    return url + (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key);
  };

  if (style.sprite) {
    const abs = makeAbsolutePreserveTokens(style.sprite, styleUrl);
    style.sprite = addKeyOnce(abs, apiKey);
  }
  if (style.glyphs) {
    const abs = makeAbsolutePreserveTokens(style.glyphs, styleUrl);
    style.glyphs = addKeyOnce(abs, apiKey);
  }

  return style;
}
