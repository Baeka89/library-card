import {walkCards, dependencies, popupTemplateRoutes} from './library-core.js?v=1.1.0';
// Saved scan snapshots are read-only within the application. Build their action
// index once instead of walking every dashboard again for each template row.
const scannedUsageIndexes = new WeakMap();
export async function scanDashboards(hass) {
  const result = {cards: [], destinations: [], failures: [], resources: [], scanned: [], resourcesAvailable: false, scannedAt: new Date().toISOString()};
  const resources = (async () => {
    try { result.resources = await hass.callWS({type: 'lovelace/resources/list'}); if (!Array.isArray(result.resources) || result.resources.some(r => !r || typeof r.url !== 'string')) throw Error('Ungültige Ressourcenliste'); result.resourcesAvailable = true; }
    catch (error) { result.resources = []; result.failures.push('Ressourcen: ' + (error.message || error)); }
  })();
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
      config.views.forEach((view,index)=>{
        if (!view || Array.isArray(view) || typeof view !== 'object') { result.failures.push(`${dashboard.title || dashboard.url_path || 'Standard'} / Ansicht ${index}: Ungültige Ansicht`); return; }
        const title=`${dashboard.title || dashboard.url_path || 'Standard'} / ${view.title || view.path || index}`,mode=dashboard.mode || hass.panels?.[dashboard.url_path || 'lovelace']?.config?.mode || 'storage';
        if(Array.isArray(view.cards) || view.cards===undefined&&!view.sections&&view.type!=='sections')result.destinations.push({url_path:dashboard.url_path,mode,path:['views',index,'cards'],label:title});
        if (view.sections !== undefined && !Array.isArray(view.sections)) result.failures.push(title + ': Ungültige Abschnitte');
        (Array.isArray(view.sections) ? view.sections : []).forEach((section,number)=>{
          if (!section || Array.isArray(section) || typeof section !== 'object') { result.failures.push(title + ' / Abschnitt ' + (number+1) + ': Ungültiger Abschnitt'); return; }
          if(Array.isArray(section.cards) || section.cards===undefined)result.destinations.push({url_path:dashboard.url_path,mode,path:['views',index,'sections',number,'cards'],label:title+' / Abschnitt '+(number+1)});
        });
      });
      result.scanned.push(dashboard.title || dashboard.url_path || 'Standard');
      for (const card of walkCards(config)) {
        const view = config.views?.[card.path[1]];
        result.cards.push({...card, dashboard: dashboard.title || dashboard.url_path,
          url_path: dashboard.url_path, view_path: view?.path, view_index: card.path[1], view: view?.title || view?.path || String(card.path[1])});
      }
    } catch (error) { result.failures.push(`${dashboard.title}: ${error.message || error}`); }
  }));
  await resources;
  scannedUsageIndexes.set(result, null);
  return result;
}
function usageIndex(inventory) {
  const cards = inventory?.cards || [];
  let base;
  try { base = new URL(window.location.href); } catch { /* No browser navigation context. */ }
  const previous = scannedUsageIndexes.get(inventory);
  if (previous && previous.cards === cards && previous.length === cards.length && previous.origin === base?.origin) return previous;
  const index = {cards, length:cards.length, origin:base?.origin, templates:new Map(), hashes:new Map()};
  const cardPaths = new Set(cards.map(card => JSON.stringify([card.url_path || '', card.path])));
  let order = 0;
  function add(map, key, use) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({order:order++, use});
  }
  for (const card of cards) {
    if (card.config.type === 'custom:library-card') add(index.templates, card.config.template, card);
    function visit(node, path = []) {
      if (!node || typeof node !== 'object') return;
      // Count a nested card's actions at its own scanned location.
      if (path.length && cardPaths.has(JSON.stringify([card.url_path || '', [...card.path, ...path]]))) return;
      const atAction = reference => ({...card, card_path:card.path, path:[...card.path, ...path], reference});
      if (node.action === 'fire-dom-event' && node.card_library?.action === 'popup') add(index.templates, node.card_library.template, atAction(node.card_library));
      else if (node.action === 'navigate' && typeof node.navigation_path === 'string' && node.navigation_path.trim() && base) {
        try {
          const target = new URL(node.navigation_path, base);
          if (target.origin === base.origin && target.hash) add(index.hashes, target.hash, atAction({popup_hash:target.hash}));
        } catch { /* Invalid or external navigation never refers to this library. */ }
      }
      for (const [key, child] of Object.entries(node)) visit(child, [...path, Array.isArray(node) ? Number(key) : key]);
    }
    visit(card.config);
  }
  if (scannedUsageIndexes.has(inventory)) scannedUsageIndexes.set(inventory, index);
  return index;
}
export function usages(inventory, template, library) {
  const index = usageIndex(inventory), records = [...(index.templates.get(template) || [])];
  const hashes = library?.templates && Object.hasOwn(library.templates, template) ? new Set(popupTemplateRoutes(library, library.templates[template]).map(route=>route.hash)) : [];
  for (const hash of hashes) for (const record of index.hashes.get(hash) || []) records.push({order:record.order, use:{...record.use, reference:{template,popup_hash:hash}}});
  return records.sort((a,b)=>a.order-b.order).map(record=>record.use);
}
export function usageLocationUrl(use, openPopup = false) {
  const index = use.view_index ?? use.path?.[1];
  const view = typeof use.view_path === 'string' && use.view_path ? use.view_path : Number.isInteger(index) && index >= 0 ? String(index) : null;
  if (view === null || ['.','..'].includes(view)) return null;
  const dashboard = use.url_path || 'lovelace';
  if (typeof dashboard !== 'string' || ['.','..'].includes(dashboard)) return null;
  const target = '/' + encodeURIComponent(dashboard) + '/' + encodeURIComponent(view);
  const hash = use.reference?.popup_hash;
  if (openPopup && typeof hash === 'string' && hash.startsWith('#')) {
    const url = new URL(target,'https://library.invalid'); url.hash = hash; return url.pathname + url.hash;
  }
  return target;
}
export function usageSummary(inventory, template, library) {
  const locations = usages(inventory,template,library);
  return {locations, cards:locations.filter(use=>!use.reference).length, popups:locations.filter(use=>use.reference).length};
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
