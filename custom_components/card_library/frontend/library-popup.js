import {clone, validateJson, validatePopupRoutes, validatePopupContent, popupTemplateInfo, popupTemplateRoutes, getAt, resolveTemplate, inputErrors} from './library-core.js?v=0.5.2';
import {createRenderedCard} from './library-ha-ui.js?v=0.5.2';

export function bubblePopupConfig(action, hash, templateConfig) {
  validateJson(action);
  if (typeof action.template !== 'string' || !action.template.trim()) throw Error('Bitte eine Vorlagen-ID angeben.');
  if (action.overrides !== undefined && !Array.isArray(action.overrides)) throw Error('Lokale Anpassungen müssen eine Liste sein.');
  const popup = action.popup === undefined ? {} : action.popup;
  if (!popup || typeof popup !== 'object' || Array.isArray(popup)) throw Error('Popup-Einstellungen müssen ein Objekt sein.');
  for (const key of ['type', 'card_type', 'hash', 'cards']) if (Object.hasOwn(popup, key)) throw Error(`„${key}“ wird von der Bibliothek verwaltet.`);
  const native = templateConfig && validatePopupContent(templateConfig);
  const frame = native ? getAt(templateConfig, native.path) : {};
  // Borrow the original frame settings, but do not clone/materialize its cards:
  // the content remains a live reference, rendered inside the popup only.
  const options = Object.fromEntries(Object.entries(frame).filter(([key]) => !['type','card_type','hash','cards'].includes(key)));
  return {...clone(options), ...clone(popup), type:'custom:bubble-card', card_type:'pop-up', hash,
    // Standalone cards keep Bubble's original grid, sizing and native wrappers.
    // Legacy stacks and plain content retain one live library-card reference.
    cards:native && !native.path.length ? clone(frame.cards) : [{type:'custom:library-card', template:action.template, popup_content:'auto', ...(action.overrides === undefined ? {} : {overrides:clone(action.overrides)})}]};
}

// One HA state recipient per application, never one recipient per popup.
// provideHass retains its recipients, so the host intentionally survives closes.
export function createPopupController(env, validateReference = () => {}, currentReference) {
  let host, app, active, generation = 0, sequence = 0, manualRefresh = 0, onHass, connection, pendingTeardown, libraryState;
  const inheritedAction = action => ({...action,popup:{...(libraryState?.templates?.[action.template]?.popup?.options || {}),...(action.popup || {})}});
  const navigationIdentity = () => JSON.stringify([env.window.location.pathname, env.window.location.hash]);
  const applicationRoot = () => env.document.querySelector('home-assistant');
  const currentContext = hass => app === applicationRoot() && hass.connection === app?.hass?.connection;
  let observedLocation = navigationIdentity();
  const namespace = Date.now().toString(36);
  const notifyLocation = (type = 'location-changed') => env.window.dispatchEvent(new env.Event(type));
  function dispose(entry) {
    if (!entry || entry.disposed) return;
    entry.disposed = true;
    env.window.clearTimeout(entry.closeTimer);
    if (active === entry) active = undefined;
    entry.card.remove();
    // Current Bubble defers its own disconnection cleanup by one timer task.
    // Include closes and app remounts, which happen before a later open starts.
    const barrier = new Promise(resolve => env.window.setTimeout(resolve, 0));
    pendingTeardown = barrier;
    barrier.then(() => { if (pendingTeardown === barrier) pendingTeardown = undefined; });
  }
  function abandon(entry) {
    // Cancellation must respect a handoff already handled by locationChanged.
    // Disconnecting this closed shell would reset another popup's scroll lock.
    if (active === entry && (entry.closeTimer || (env.window.location.hash && env.window.location.hash !== entry.hash))) return;
    dispose(entry);
  }
  function restore(entry) {
    if (env.window.location.hash !== entry.hash || env.window.location.pathname !== entry.route) return;
    const url = new URL(env.window.location.href);
    url.hash = new URL(entry.previousUrl).hash;
    env.window.history.replaceState(env.window.history.state, '', url.href);
    notifyLocation();
  }
  function close() {
    const token = ++generation;
    const entry = active;
    if (entry && env.window.location.hash && env.window.location.hash !== entry.hash) {
      env.window.clearTimeout(entry.closeTimer); entry.closeTimer = undefined;
      return token;
    }
    active = undefined;
    try { restore(entry || {}); }
    finally { dispose(entry); }
    return token;
  }
  function suspend(force = false) {
    generation++;
    if (!force && active && env.window.location.hash && env.window.location.hash !== active.hash) {
      env.window.clearTimeout(active.closeTimer); active.closeTimer = undefined;
      return;
    }
    dispose(active);
  }
  function locationChanged() {
    const identity = navigationIdentity(), changed = identity !== observedLocation;
    observedLocation = identity;
    const entry = active;
    // HA may signal query edits or the same navigation more than once. Only
    // changes of dashboard path/hash may cancel a deferred popup initializer.
    if (!entry || !changed) return;
    const location = env.window.location;
    if (location.pathname === entry.route && location.hash === entry.hash) {
      env.window.clearTimeout(entry.closeTimer); entry.closeTimer = undefined;
      return;
    }
    if (location.hash && location.hash !== entry.hash) {
      // Bubble teardown resets the global scroll lock. Keep one closed shell
      // while another popup hash is active, so delayed teardown cannot unlock
      // a separately configured native Bubble popup. Native closing actions and
      // animations finish normally; its dormant standalone content is removed.
      generation++;
      env.window.clearTimeout(entry.closeTimer); entry.closeTimer = undefined;
      return;
    }
    if (entry.closeTimer) return;
    generation++;
    // Let Bubble finish its own closing animation before disconnecting it.
    entry.closeTimer = env.window.setTimeout(() => dispose(entry), 400);
  }
  function ensureHost() {
    const root = applicationRoot();
    if (!root?.hass?.connection || typeof root.provideHass !== 'function') throw Error('Home Assistant ist noch nicht bereit.');
    if (app !== root) {
      suspend(true);
      host?.remove();
      app = root;
      host = env.document.createElement('div');
      // This is an application-level overlay host, never a Lovelace grid cell.
      // Keep it outside normal document flow without hiding Bubble's fixed UI.
      if (host.style) host.style.cssText = 'position:absolute;width:0;height:0;margin:0;padding:0;border:0;overflow:visible';
      host.attachShadow({mode:'open'});
      Object.defineProperty(host, 'hass', {set(hass) {
        if (app !== root || !hass?.connection) return;
        if (connection && connection !== hass.connection) suspend();
        connection = hass.connection;
        try { onHass?.(hass); }
        catch (error) { env.window.console?.error('Card Library: Bibliotheksaktualisierung fehlgeschlagen', error); }
        if (active) {
          const entry = active, token = generation;
          try { entry.card.hass = hass; }
          catch (error) {
            // The native setter may already have requested a newer popup.
            // Remove the failed old renderer without cancelling that request.
            try {
              if (token === generation && active === entry) close();
              else dispose(entry);
            } catch (cleanupError) {
              env.window.console?.error('Card Library: Popup konnte nicht vollständig geschlossen werden', cleanupError);
            }
            env.window.console?.error('Card Library: Bubble-Update fehlgeschlagen', error);
          }
        }
      }});
      (root.shadowRoot || root).append(host);
      root.provideHass(host);
    }
    return root.hass;
  }
  async function open(action, routing = {}) {
    // Validate before closing an existing popup or modifying the URL.
    const hash = routing.hash || '#card-library-popup-' + namespace + '-' + (++sequence);
    let config = bubblePopupConfig(action, hash);
    const hass = ensureHost();
    if (!env.customElements.get('bubble-card')) throw Error('Bubble Card ist nicht geladen. Bitte die Ressource laden (Version 3.2.0 oder neuer).');
    // A routed hash is already in the URL. Preserve it while replacing an
    // instance whose centrally configured options have changed.
    let token = ++generation;
    const origin = navigationIdentity();
    let helpers, contentMode, sourceConfig, sourceOptions;
    try {
      const resolved = await validateReference(hass, config.cards[0]);
      if (token !== generation || origin !== navigationIdentity() || !currentContext(hass)) return;
      sourceConfig = resolved;
      config = bubblePopupConfig(inheritedAction(action), hash, resolved);
      const native = resolved && popupTemplateInfo(resolved);
      contentMode = native ? native.path.length ? 'legacy-stack' : 'standalone' : 'content';
      helpers = await env.window.loadCardHelpers();
    } catch (error) {
      if (token !== generation || origin !== navigationIdentity() || !currentContext(hass)) return;
      throw error;
    }
    if (token !== generation || origin !== navigationIdentity() || !currentContext(hass)) return;
    if (currentReference) {
      const latest = currentReference(hass,{type:'custom:library-card',template:action.template,...(action.overrides === undefined ? {} : {overrides:action.overrides})});
      if (latest !== sourceConfig) {
        sourceConfig = latest; config = bubblePopupConfig(inheritedAction(action),hash,latest);
        const native = latest && popupTemplateInfo(latest);
        contentMode = native ? native.path.length ? 'legacy-stack' : 'standalone' : 'content';
      }
    }
    // Frame metadata may change independently of the resolved card while
    // helpers are loading. Capture its current inherited options as well.
    const effective = inheritedAction(action);
    sourceOptions = JSON.stringify(effective.popup);
    config = bubblePopupConfig(effective,hash,sourceConfig);
    if (!helpers?.createCardElement) throw Error('HA-Kartenhelfer sind nicht verfügbar.');
    // Prepare and validate the detached native element before replacing a
    // working popup. Bubble waits for connection before creating its overlay.
    const {element:card} = createRenderedCard(helpers, config, app.hass, env);
    const popupElement = () => card?.localName === 'hui-card' ? card.firstElementChild : card;
    if (!card || !['bubble-card', 'hui-card'].includes(card.localName) || (popupElement() && popupElement().localName !== 'bubble-card')) {
      card?.remove?.();
      throw Error('HA konnte die originale Bubble-Popup-Karte nicht erstellen. Bitte Popup-Einstellungen und Ressourcen prüfen.');
    }
    if (token !== generation || origin !== navigationIdentity() || !currentContext(hass)) { card.remove(); return; }
    if (JSON.stringify(inheritedAction(action).popup) !== sourceOptions) {card.remove(); return open(action,routing);}
    if (currentReference) {
      try {
        const latest = currentReference(hass,{type:'custom:library-card',template:action.template,...(action.overrides === undefined ? {} : {overrides:action.overrides})});
        if (latest !== sourceConfig) { card.remove(); return open(action,routing); }
      } catch (error) { card.remove(); throw error; }
    }
    const replaced = active;
    const expectedLocation = new URL(env.window.location.href);
    if (!routing.hash && replaced?.hash === expectedLocation.hash && replaced.route === expectedLocation.pathname) {
      expectedLocation.hash = new URL(replaced.previousUrl).hash;
    }
    const expectedIdentity = JSON.stringify([expectedLocation.pathname, expectedLocation.hash]);
    try {
      if (routing.hash) dispose(active);
      else { token = close(); if (token === generation) dispose(active); }
    } catch (error) { card.remove(); throw error; }
    if (token !== generation || expectedIdentity !== navigationIdentity() || !currentContext(hass)) { card.remove(); return; }
    if (pendingTeardown) {
      // Let native cleanup reset the shared body lock before the next shell opens.
      await pendingTeardown;
      if (token !== generation || expectedIdentity !== navigationIdentity() || !currentContext(hass)) { card.remove(); return; }
    }
    const previousUrl = new URL(routing.previousUrl || env.window.location.href);
    if (routing.hash && !routing.previousUrl) previousUrl.hash = '';
    const frameSignature = value => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'cards')));
    const entry = {card, hash, contentMode, sourceConfig, action:clone(action), routed:Boolean(routing.hash && !routing.manual), frameSignature:frameSignature(config), template:action.template, signature:JSON.stringify(config), previousUrl:previousUrl.href,
      previousState:env.window.history.state,
      route:env.window.location.pathname};
    active = entry;
    try {
      host.shadowRoot.append(card);
      card.hass = app.hass;
      // Bubble may defer its first render; its standalone flag is the capability
      // check, rather than assuming a HACS tag is a semantic version.
      for (let attempt = 0; attempt < 20 && !popupElement()?.isStandalonePopUp; attempt++) {
        if (popupElement() && popupElement().localName !== 'bubble-card') throw Error('HA konnte die originale Bubble-Popup-Karte nicht erstellen. Bitte Popup-Einstellungen und Ressourcen prüfen.');
        await new Promise(resolve => env.window.setTimeout(resolve, 25));
        if (token !== generation || !currentContext(hass)) { abandon(entry); return; }
      }
      if (!popupElement()?.isStandalonePopUp) throw Error('Für dynamische Popups wird Bubble Card mit eigenständigem Popup-Format benötigt (ab 3.2.0).');
      if (token !== generation || !currentContext(hass)) { abandon(entry); return; }
      if (JSON.stringify(inheritedAction(action).popup) !== sourceOptions || currentReference && currentReference(hass,{type:'custom:library-card',template:action.template,...(action.overrides === undefined ? {} : {overrides:action.overrides})}) !== sourceConfig) return open(action,routing);
      if (!routing.hash) env.window.history.pushState(entry.previousState, '', hash);
      entry.ready = true;
      // A routed URL has already been processed by HA's navigate handler.
      // Bubble 3.2.0 opens from its first hass/config pass; newer versions also
      // listen to this private synchronization event. Avoid extra HA URL writes.
      notifyLocation(routing.hash ? 'bubble-card-location-changed' : 'location-changed');
    } catch (error) {
      if (token !== generation || !currentContext(hass)) { abandon(entry); return; }
      try { restore(entry); }
      finally { dispose(entry); }
      throw error;
    }
  }
  function updateNativeContent(action, routing, resolved) {
    const entry = active, token = generation, hass = app?.hass;
    if (!entry?.ready || entry.contentMode !== 'standalone' || entry.template !== action.template || entry.hash !== routing.hash ||
        env.window.location.hash !== entry.hash || env.window.location.pathname !== entry.route || !currentContext(hass) || typeof entry.card.setConfig !== 'function') return false;
    if (entry.sourceConfig === resolved) return true;
    const config = bubblePopupConfig(inheritedAction(action), entry.hash, resolved), signature = JSON.stringify(config);
    if (entry.signature === signature) { entry.sourceConfig = resolved; return true; }
    try {
      entry.signature = signature;
      entry.sourceConfig = resolved;
      entry.card.setConfig(config);
      if (active === entry && token === generation && currentContext(hass)) entry.card.hass = app.hass;
      return true;
    } catch {
      // Some native versions cannot update; let the normal validated replacement
      // path create a fresh shell, rather than leaving stale content behind.
      entry.signature = null;
      entry.sourceConfig = undefined;
      return active !== entry || token !== generation;
    }
  }
  async function refreshManualPopup() {
    const entry = active, token = generation, request = ++manualRefresh, hass = app?.hass;
    if (!entry?.ready || entry.routed || !currentContext(hass)) return;
    let resolved;
    try {
      resolved = await validateReference(hass,{type:'custom:library-card',template:entry.template,...(entry.action.overrides === undefined ? {} : {overrides:entry.action.overrides})});
    } catch (error) {
      if (active !== entry || token !== generation || request !== manualRefresh) return;
      close(); throw error;
    }
    if (active !== entry || token !== generation || request !== manualRefresh || !currentContext(hass)) return;
    const native = resolved && popupTemplateInfo(resolved), mode = native ? native.path.length ? 'legacy-stack' : 'standalone' : 'content';
    const config = bubblePopupConfig(inheritedAction(entry.action),entry.hash,resolved);
    const frameSignature = JSON.stringify(Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'cards')));
    if (mode === entry.contentMode && frameSignature === entry.frameSignature) {
      if (mode !== 'standalone' || updateNativeContent(entry.action,{hash:entry.hash},resolved)) return;
    }
    await open(entry.action,{hash:entry.hash,manual:true,previousUrl:entry.previousUrl});
  }
  for (const event of ['location-changed', 'hashchange', 'popstate', 'bubble-card-location-changed']) env.window.addEventListener(event, locationChanged);
  env.window.addEventListener('pagehide', () => suspend(true));
  return {open, close, suspend, updateNativeContent, refreshManualPopup, cancelPending() { generation++; },
    setLibrary(library) {libraryState = library;},
    getApplicationRoot:applicationRoot,
    connect(callback) {
      onHass = callback;
      const previousApp = app;
      callback(ensureHost());
      if (previousApp && previousApp !== app) notifyLocation('bubble-card-location-changed');
    }};
}

export function createPopupHashRouter(env, controller, reportError = () => {}) {
  let routes = new Map(), nativeFrames = new Map(), libraryState, requestKey = null, requestContentKey, requestApp, ownedHash = null;
  function sync() {
    const hash = env.window.location.hash;
    const route = routes.get(hash);
    if (!route) {
      if (requestKey) controller.cancelPending();
      requestKey = null;
      return;
    }
    let action = route.action, nativeFrame;
    if (route.native || action.overrides !== undefined) {
      // Only inspect the selected native popup. Content changes update its
      // library-card reference; only frame changes recreate the Bubble shell.
      try {
        const cacheKey = JSON.stringify([action.template,action.overrides || []]);
        nativeFrame = nativeFrames.get(cacheKey);
        if (!nativeFrame) {
          const config = resolveTemplate(libraryState, action.template,action.overrides || []);
          const errors = inputErrors(libraryState.templates[action.template],config);
          if (errors.length) throw Error(errors.join(' · '));
          const info = validatePopupContent(config), frame = info ? getAt(config, info.path) : {};
          const options = Object.fromEntries(Object.entries(frame).filter(([key]) => !['type','card_type','hash','cards'].includes(key)));
          nativeFrame = {config,options,mode:info ? info.path.length ? 'legacy-stack' : 'standalone' : 'content',contentKey:info && !info.path.length ? JSON.stringify(frame.cards) : undefined};
          if (nativeFrames.size >= 256) nativeFrames.delete(nativeFrames.keys().next().value);
          nativeFrames.set(cacheKey,nativeFrame);
        }
        action = {...action, popup:{...nativeFrame.options,...action.popup}};
      } catch (error) {
        requestKey = null;
        // A central change can invalidate an already visible native popup.
        // Remove its stale content and cancel pending imports, retaining the
        // selected hash so a corrected template reopens without another click.
        controller.suspend();
        reportError(error); return;
      }
    }
    const key = JSON.stringify([env.window.location.pathname, hash, action, nativeFrame?.mode || 'content']);
    const app = controller.getApplicationRoot?.();
    if (key === requestKey && app === requestApp) {
      if (nativeFrame?.mode !== 'standalone') return;
      if (controller.updateNativeContent?.(action,{hash},nativeFrame.config)) return;
      if (nativeFrame.contentKey === requestContentKey) return;
    }
    requestKey = key; requestContentKey = nativeFrame?.contentKey; requestApp = app; ownedHash = hash;
    controller.open(action, {hash}).then(() => {
      // A cancelled import may have observed an app remount before any new
      // state recipient was installed. Rebind the still selected route there.
      if (requestKey === key && requestApp === app && app !== controller.getApplicationRoot?.()) sync();
    }).catch(error => {
      if (requestKey === key && requestApp === app) requestKey = null;
      reportError(error);
    });
  }
  for (const event of ['location-changed', 'hashchange', 'popstate', 'bubble-card-location-changed']) env.window.addEventListener(event, sync);
  env.window.addEventListener('pagehide', () => { requestKey = null; });
  env.window.addEventListener('pageshow', sync);
  return {setLibrary(library) {
    libraryState = library;
    nativeFrames.clear();
    if (!library) {
      routes = new Map(); requestKey = null;
      controller.setLibrary?.(library);
      controller.suspend();
      return;
    }
    const next = new Map();
    if (library) {
      validatePopupRoutes(library,false);
      for (const [id, template] of Object.entries(library.templates)) {
        for (const route of popupTemplateRoutes(library,template)) {
          // Index metadata only. Resolve local exceptions for the selected
          // route; unopened aliases and their configurations are never copied.
          next.set(route.hash, {native:route.native, action:{action:'popup', template:id, popup:route.options,...(route.overrides === undefined ? {} : {overrides:route.overrides})}});
        }
      }
    }
    routes = next;
    controller.setLibrary?.(library);
    if (ownedHash && env.window.location.hash === ownedHash && !routes.has(ownedHash)) controller.close();
    sync();
  }, retry() { requestKey = null; sync(); }};
}

export function installPopupActions(validateReference, watchLibrary, currentReference) {
  if (typeof window.addEventListener !== 'function' || typeof document.querySelector !== 'function') return null;
  const key = '__cardLibraryPopupController';
  if (window[key]) return window[key];
  const controller = createPopupController({window, document, customElements, Event}, validateReference, currentReference);
  window[key] = controller;
  const report = error => {
    const root = document.querySelector('home-assistant');
    root?.dispatchEvent(new CustomEvent('hass-notification', {bubbles:true, composed:true,
      detail:{message:error.message || String(error)}}));
  };
  if (watchLibrary) {
    const router = createPopupHashRouter({window}, controller, report);
    const connect = () => {
      try { controller.connect(hass => watchLibrary(hass, library => {
        try {
          router.setLibrary(library);
          if (library) controller.refreshManualPopup().catch(report);
        } catch (error) { report(error); }
      })); }
      catch { window.setTimeout(connect, 500); }
    };
    window.setTimeout(connect, 0);
    // Resources can load in any order. Retry the current direct-link hash when
    // Bubble finishes registering, without pre-creating any popup cards.
    customElements.whenDefined?.('bubble-card').then(() => router.retry());
  }
  window.addEventListener('ll-custom', event => {
    const action = event.detail?.card_library;
    if (!action || action.action !== 'popup') return;
    event.stopPropagation();
    controller.open(action).catch(report);
  });
  return controller;
}
