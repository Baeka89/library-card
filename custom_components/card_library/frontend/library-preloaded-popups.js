import {clone, getAt, resolveTemplate, popupTemplateRoutes, inputErrors} from './library-core.js?v=1.0.0';
import {createRenderedCard} from './library-ha-ui.js?v=1.0.0';
import {retainBubblePopup} from './library-bubble-preload.js?v=1.0.0';

// The lazy controller stays authoritative for ordinary popups. Only explicitly
// selected variants acquire connected native instances in this browser session.
export function withPreloadedPopups(env, lazy, popupConfig, validateReference) {
  let library, application, connection, host, active, revision = 0, scheduled = false, opening = 0, manualSequence = 0;
  const entries = new Map(), pending = new Map(), reported = new Set(), manualHashes = new Map();
  const root = () => env.document.querySelector('home-assistant');
  const notify = () => env.window.dispatchEvent(new env.Event('bubble-card-location-changed'));
  const nextTask = () => new Promise(resolve => env.window.setTimeout(resolve, 0));
  const error = value => {
    const message = value.message || String(value);
    if (reported.has(message)) return;
    reported.add(message);
    root()?.dispatchEvent?.(new CustomEvent('hass-notification', {bubbles:true,composed:true,detail:{message:'Library Card: '+message}}));
    env.window.console?.warn?.('Library Card: '+message);
  };
  function dispose(entry) {
    if (!entry || entry.disposed) return;
    entry.disposed = true; entry.retention?.release(); entry.card.remove();
    if(entries.get(entry.hash)===entry) entries.delete(entry.hash); if (active === entry) active = undefined;
  }
  function clear() {
    revision++;opening++;pending.clear();manualHashes.clear();
    for (const entry of [...entries.values()]) dispose(entry);
    host?.remove(); host = undefined;
  }
  function context() {
    const app = root(), hass = app?.hass;
    if (!hass?.connection) throw Error('Home Assistant ist noch nicht bereit.');
    if (application !== app || connection !== hass.connection) {
      if(application)clear(); application = app; connection = hass.connection;
    }
    if (!host) {
      host = env.document.createElement('div');
      host.setAttribute?.('data-library-preloaded-popups','');
      if (host.style) host.style.cssText = 'position:absolute;width:0;height:0;margin:0;padding:0;border:0;overflow:visible';
      host.attachShadow({mode:'open'}); (app.shadowRoot || app).append(host);
    }
    return hass;
  }
  const effective = action => ({...action,popup:{...(library?.templates?.[action.template]?.popup?.options || {}),...(action.popup || {})}});
  function resolved(action) {
    const value = resolveTemplate(library, action.template, action.overrides || []);
    const errors = inputErrors(library.templates[action.template],value);
    if (errors.length) throw Error(errors.join(' · '));
    return value;
  }
  function signature(action, hash, value) {
    return JSON.stringify({...popupConfig(effective(action),hash,value),background_update:true});
  }
  async function prepare(action, hash) {
    const hass = context(), value = resolved(action), key = signature(action,hash,value), token = revision;
    const previous = entries.get(hash);
    if (previous?.signature === key && !previous.disposed) return previous;
    if (pending.get(hash)?.signature === key) return pending.get(hash).promise;
    const job = {signature:key};
    job.promise = (async () => {
      // Resolve only this requested variant, including its real shared bindings.
      if (validateReference) await validateReference(hass,{type:'custom:library-card',template:action.template,...(action.overrides === undefined ? {} : {overrides:action.overrides})});
      const helpers = await env.window.loadCardHelpers();
      if (token !== revision || hass.connection !== connection || root() !== application) return null;
      if (signature(action,hash,resolved(action)) !== key) return null;
      if (!env.customElements.get('bubble-card')) return null;
      const config = JSON.parse(key);
      const {element:card} = createRenderedCard(helpers,config,application.hass,env);
      const native = () => card.localName === 'hui-card' ? card.firstElementChild : card;
      const entry = {card,hash,signature:key,action:clone(action),source:value,disposed:false};
      try {
        if (previous) { dispose(previous); await nextTask(); }
        if (token !== revision) {card.remove();return null;}
        host.shadowRoot.append(card); card.hass = application.hass;
        for (let i=0;i<20 && !native()?.isStandalonePopUp;i++) {
          await new Promise(resolve=>env.window.setTimeout(resolve,25));
          if (token !== revision) {card.remove();return null;}
        }
        entry.retention = retainBubblePopup(native());
        if (token !== revision || signature(action,hash,resolved(action)) !== key) {
          entry.retention.release();card.remove();return null;
        }
        entries.set(hash,entry);
        return entry;
      } catch (failure) {entry.retention?.release();card.remove();throw failure;}
    })().finally(()=>{if(pending.get(hash)===job)pending.delete(hash);});
    pending.set(hash,job); return job.promise;
  }
  function routes() {
    const result = new Map();
    if (library) for (const [id,item] of Object.entries(library.templates)) for (const route of popupTemplateRoutes(library,item)) {
      if (route.preload) result.set(route.hash,{template:id,popup:route.options,overrides:route.overrides || [],preload:true});
    }
    for(const entry of entries.values())if(entry.manual && (entry.action.preload ?? library?.templates?.[entry.action.template]?.preload))result.set(entry.hash,entry.action);
    return result;
  }
  async function reconcile() {
    scheduled = false;
    if (!library || !env.customElements.get('bubble-card')) return;
    const token = revision, desired = routes();
    for (const entry of [...entries.values()]) if (!desired.has(entry.hash)) dispose(entry);
    for (const [hash,action] of desired) {
      if (token !== revision) return;
      try {
        // Changed or invalid sources must never leave an obsolete warm popup.
        const value = resolved(action), key = signature(action,hash,value);
        if (entries.get(hash)?.signature !== key) await prepare(action,hash);
      } catch (failure) {dispose(entries.get(hash));error(failure);}
      await nextTask();
    }
  }
  function schedule() {
    if (scheduled) return; scheduled = true;
    env.window.setTimeout(()=>reconcile().catch(error),0);
  }
  const controller = {
    ...lazy,
    async open(action,routing={}) {
      const warm = action.preload ?? library?.templates?.[action.template]?.preload ?? false;
      if (typeof warm !== 'boolean') throw Error('Popup-Vorladen muss ein Wahrheitswert sein.');
      if (!warm || !library) {active=undefined;return lazy.open(action,routing);}
      const request=++opening, location=JSON.stringify([env.window.location.pathname,env.window.location.hash]);
      const manualKey=JSON.stringify(action);
      if(!routing.hash && !manualHashes.has(manualKey))manualHashes.set(manualKey,'#card-library-popup-warm-'+(++manualSequence));
      const hash=routing.hash || manualHashes.get(manualKey);
      let entry;
      try {entry=await prepare(action,hash);} catch(failure) {dispose(entries.get(hash));error(failure);await nextTask();return lazy.open({...action,preload:false},routing);}
      if(request!==opening || location!==JSON.stringify([env.window.location.pathname,env.window.location.hash]))return;
      if (!entry) return lazy.open({...action,preload:false},routing);
      const before = new URL(routing.previousUrl || env.window.location.href);
      if (routing.hash && !routing.previousUrl) before.hash='';
      lazy.suspend(true); await nextTask();
      if (request!==opening || entry.disposed || root()!==application || location!==JSON.stringify([env.window.location.pathname,env.window.location.hash])) return;
      entry.manual=!routing.hash;entry.previousUrl=before.href;entry.route=env.window.location.pathname;active=entry;
      if (!routing.hash) env.window.history.pushState(env.window.history.state,'',hash);
      entry.card.hass=application.hass;notify();
    },
    close() {
      opening++;const entry=active;active=undefined;
      if (!entry) return lazy.close();
      if (env.window.location.hash===entry.hash && env.window.location.pathname===entry.route) {
        const url=new URL(env.window.location.href);url.hash=new URL(entry.previousUrl).hash;
        env.window.history.replaceState(env.window.history.state,'',url.href);notify();
      }
    },
    suspend(force=false) {clear();return lazy.suspend(force);},
    setLibrary(value) {
      revision++;pending.clear();library=value;reported.clear();lazy.setLibrary(value);
      if (!value) clear();else schedule();
    },
    refreshPreloads:schedule,
    cancelPending() {opening++;lazy.cancelPending();},
    updateNativeContent(action,routing,value) {
      if (!entries.has(routing.hash)) return lazy.updateNativeContent(action,routing,value);
      return entries.get(routing.hash).signature === signature(action,routing.hash,value);
    },
    connect(callback) {
      return lazy.connect(hass=>{
        if (application && (root()!==application || hass.connection!==connection)) {clear();application=root();connection=hass.connection;}
        callback(hass);
        for (const entry of [...entries.values()]) {
          try {entry.card.hass=hass;} catch(failure) {dispose(entry);error(failure);}
        }
      });
    }
  };
  env.window.addEventListener('pagehide',clear);
  return controller;
}
