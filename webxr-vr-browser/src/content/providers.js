// ---------------------------------------------------------------------------
// ContentProvider layer
//
// Every panel asks this module for content by *entry*, never by raw iframe.
// Each provider fetches data through an API that actually sends
// Access-Control-Allow-Origin headers, then returns a normalized
// ContentResult that the renderer (panel-content.js) knows how to draw.
//
// Adding true "browse any URL" support later means adding one more provider
// here (e.g. ProxyProvider, calling a self-hosted CORS/render proxy) and
// registering it in PROVIDERS — nothing in the VR front end has to change.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ContentResult
 * @property {'ok'|'blocked'|'error'} status
 * @property {'text'|'list'|'model'|'video'} [kind]
 * @property {string} title
 * @property {string} [body]
 * @property {string} [imageUrl]
 * @property {{label:string, meta?:string}[]} [items]
 * @property {string} [modelUrl]
 * @property {number} [scale]
 * @property {string} [videoUrl]
 * @property {string} [sourceUrl]   human-facing URL, shown in the address bar
 * @property {string} [message]     shown when status !== 'ok'
 */

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const HN_API = 'https://hacker-news.firebaseio.com/v0';

async function fetchWiki(entry) {
  const term = encodeURIComponent(entry.query.replace(/ /g, '_'));
  const res = await fetch(WIKI_API + term, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    return {
      status: 'error',
      title: entry.query,
      message: `Wikipedia summary API returned ${res.status}.`
    };
  }
  const data = await res.json();
  return {
    status: 'ok',
    kind: 'text',
    title: data.title || entry.query,
    body: data.extract || '(no summary available)',
    imageUrl: data.thumbnail && data.thumbnail.source,
    sourceUrl: data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page
  };
}

async function fetchHeadlines() {
  const idsRes = await fetch(`${HN_API}/topstories.json`);
  if (!idsRes.ok) {
    return { status: 'error', title: 'Hacker News', message: `Story list returned ${idsRes.status}.` };
  }
  const ids = (await idsRes.json()).slice(0, 8);
  const stories = await Promise.all(
    ids.map((id) => fetch(`${HN_API}/item/${id}.json`).then((r) => (r.ok ? r.json() : null)))
  );
  return {
    status: 'ok',
    kind: 'list',
    title: 'Hacker News — top stories',
    items: stories
      .filter(Boolean)
      .map((s) => ({ label: s.title, meta: `${s.score ?? 0} pts · ${s.by ?? 'unknown'}`, url: s.url })),
    sourceUrl: 'https://news.ycombinator.com'
  };
}

async function loadModel(entry) {
  return {
    status: 'ok',
    kind: 'model',
    title: entry.label,
    modelUrl: entry.url,
    scale: entry.scale || 1,
    sourceUrl: entry.url
  };
}

async function loadVideo(entry) {
  return {
    status: 'ok',
    kind: 'video',
    title: entry.label,
    videoUrl: entry.url,
    sourceUrl: entry.url
  };
}

async function loadDocs() {
  return {
    status: 'ok',
    kind: 'text',
    title: 'Help & controls',
    body:
      'Grip + move: drag a panel through space.\n\n' +
      'Trigger: click a link, list row, or nav button under the laser.\n\n' +
      'Home panel lists every curated destination in sites.json — arbitrary ' +
      'URLs cannot be embedded from a static site (see README), so this room ' +
      'ships with sources that expose real, CORS-friendly APIs: Wikipedia ' +
      'summaries, Hacker News headlines, glTF models and a sample video.\n\n' +
      'Type an address like "wiki:Nebula" in the bar (flat mode) or open the ' +
      'Home panel in VR and pick a tile.'
  };
}

/** Anything that isn't one of the built-in types lands here. */
async function blocked(rawInput) {
  return {
    status: 'blocked',
    title: rawInput,
    message:
      'This is a static site, so arbitrary pages can\u2019t be embedded here ' +
      '(most sites block framing, and cross-origin canvas textures are not ' +
      'readable either). Open it outside VR instead, or add a provider ' +
      'backed by a self-hosted proxy \u2014 see README.'
  };
}

const PROVIDERS = {
  wiki: fetchWiki,
  headlines: fetchHeadlines,
  model: loadModel,
  video: loadVideo,
  docs: loadDocs
};

/** Fetch normalized content for a sites.json-style entry object. */
export async function fetchContent(entry) {
  const fn = PROVIDERS[entry.type];
  if (!fn) return blocked(entry.label || entry.type);
  try {
    return await fn(entry);
  } catch (err) {
    return { status: 'error', title: entry.label || entry.type, message: String(err.message || err) };
  }
}

/**
 * Parse free-form address-bar text into an entry the providers understand.
 * Supports "wiki:Term", "headlines", "docs", "home", or a bare term (treated
 * as a wiki lookup, the one provider that can resolve arbitrary input).
 */
export function resolveInput(raw, siteEntries) {
  const text = raw.trim();
  if (!text) return null;

  const byLabel = siteEntries.find((e) => e.label.toLowerCase() === text.toLowerCase());
  if (byLabel) return byLabel;

  const [prefix, ...rest] = text.split(':');
  const arg = rest.join(':').trim();
  if (prefix.toLowerCase() === 'wiki' && arg) {
    return { id: `wiki-${arg}`, type: 'wiki', label: arg, query: arg };
  }
  if (prefix.toLowerCase() === 'headlines') {
    return { id: 'headlines-hn', type: 'headlines', label: 'Hacker News — top stories', source: 'hn' };
  }
  if (prefix.toLowerCase() === 'docs') {
    return { id: 'docs-help', type: 'docs', label: 'Help & controls' };
  }
  if (/^https?:\/\//i.test(text)) {
    return { id: `raw-${text}`, type: '__unsupported__', label: text };
  }
  // bare text: try it as a wiki lookup
  return { id: `wiki-${text}`, type: 'wiki', label: text, query: text };
}
