import {walkCards, dependencies, popupTemplateRoutes} from './library-core.js?v=0.5.0';
export async function scanDashboards(hass) {
  const result = {cards: [], failures: [], resources: [], scanned: [], resourcesAvailable: false, scannedAt: new Date().toISOString()};
  let dashboards = [];
  try { dashboards = await hass.callWS({type: 'lovelace/dashboards/list'}); if (!Array.isArray(dashboards)) throw Error('Ungültige Dashboard-Liste'); }
  catch (error) { dashboards = []; result.failures.push('Dashboard-Liste: ' + (error.message || error)); }
  const targets = [...new Map([{url_path: null, title: 'Standard-Dashboard'}, ...dashboards.filter(d=>d && typeof d.url_path==='string')].map(d=>[d.url_path || '',d])).values()];
  await Promise.all(targets.map(async dashboard => {
    try {
      const command = {type: 'lovelace/config'};
      if (dashboard.url_path) command.url_path = dashboard.url_path;
      const config = await hass.callWS(command);
      if (!config || !Array.isArray(config.views)) throw Error('Keine gespeicherte Dashboard-Konfiguration verfügbar');
      result.scanned.push(dashboard.title || dashboard.url_path || 'Standard');
      for (const card of walkCards(config)) {
        const view = config.views?.[card.path[1]];
        result.cards.push({...card, dashboard: dashboard.title || dashboard.url_path,
          url_path: dashboard.url_path, view: view?.title || view?.path || String(card.path[1])});
      }
    } catch (error) { result.failures.push(`${dashboard.title}: ${error.message || error}`); }
  }));
  try { result.resources = await hass.callWS({type: 'lovelace/resources/list'}); if (!Array.isArray(result.resources) || result.resources.some(r => !r || typeof r.url !== 'string')) throw Error('Ungültige Ressourcenliste'); result.resourcesAvailable = true; }
  catch (error) { result.resources = []; result.failures.push('Ressourcen: ' + (error.message || error)); }
  return result;
}
export function usages(inventory, template, library) {
  const cards = inventory?.cards || [], result = [];
  const cardPaths = new Set(cards.map(card => JSON.stringify([card.url_path || '', card.path])));
  const popupHashes = new Set(library?.templates && Object.hasOwn(library.templates, template) ? popupTemplateRoutes(library, library.templates[template]).map(route=>route.hash) : []);
  function navigationHash(value) {
    if (typeof value !== 'string' || !value.trim()) return;
    try {
      const base = new URL(window.location.href), target = new URL(value, base);
      if (target.origin === base.origin) return target.hash;
    } catch { /* Invalid or external navigation never refers to this library. */ }
  }
  for (const card of cards) {
    if (card.config.type === 'custom:library-card' && card.config.template === template) result.push(card);
    function visit(node, path = []) {
      if (!node || typeof node !== 'object') return;
      // Nested dashboard cards are scanned separately. Count their actions at
      // their own location instead of once for every ancestor stack/wrapper.
      if (path.length && cardPaths.has(JSON.stringify([card.url_path || '', [...card.path, ...path]]))) return;
      let reference;
      if (node.action === 'fire-dom-event' && node.card_library?.action === 'popup' && node.card_library.template === template) reference = node.card_library;
      else if (node.action === 'navigate') {
        const hash = navigationHash(node.navigation_path);
        if (popupHashes.has(hash)) reference = {template,popup_hash:hash};
      }
      if (reference) result.push({...card, path:[...card.path, ...path], reference});
      for (const [key, child] of Object.entries(node)) visit(child, [...path, Array.isArray(node) ? Number(key) : key]);
    }
    visit(card.config);
  }
  return result;
}
const RESOURCE_VERSION_PARAMS = new Set(['v', 'version', 'ver', 'hacstag', 'build', 'automatically-added']);
function normalizeResourceUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    for (const key of [...parsed.searchParams.keys()]) {
      if (RESOURCE_VERSION_PARAMS.has(key) || /^\d+(\.\d+)+$/.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.origin + parsed.pathname + parsed.search;
  } catch { return url; }
}
export function dependencyReport(hass, config, explicit, resources = []) {
  const needed = dependencies(config, explicit);
  const installed = new Set(resources.map(resource => normalizeResourceUrl(resource.url)));
  return {
    missingCards: needed.types.filter(type => !customElements.get(type)),
    missingEntities: needed.entities.filter(entity => !hass.states[entity]),
    missingResources: needed.resources.filter(url => !installed.has(normalizeResourceUrl(url))),
    ...needed,
  };
}

// JSON-quoted scalars preserve CSS, Jinja, ambiguous strings and newline values.
// The surrounding structure is ordinary YAML and can be edited with block styles.
export function configurationYaml(value, depth = 0) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(value) && value.length) return value.map(item => {
    const nested = item && typeof item === 'object' && Object.keys(item).length;
    return pad + '-' + (nested ? '\n' + configurationYaml(item, depth + 1) : ' ' + JSON.stringify(item));
  }).join('\n');
  if (value && typeof value === 'object' && Object.keys(value).length) return Object.entries(value).map(([key, item]) => {
    const nested = item && typeof item === 'object' && Object.keys(item).length;
    return pad + JSON.stringify(key) + ':' + (nested ? '\n' + configurationYaml(item, depth + 1) : ' ' + JSON.stringify(item));
  }).join('\n');
  return pad + JSON.stringify(value);
}
