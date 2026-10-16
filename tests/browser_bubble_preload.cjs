const {chromium}=require(process.env.LIBRARY_PLAYWRIGHT || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sources=process.env.LIBRARY_BUBBLE_DIR;
if(!sources)throw Error('LIBRARY_BUBBLE_DIR must point to original Bubble Card files.');
const projectVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LIBRARY_CHROMIUM,args:['--no-sandbox']});
 try{for(const version of ['v3.2.0','v3.4.2']){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{
   const url=new URL(r.request().url());
   if(url.pathname.startsWith('/card_library/'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'custom_components/card_library/frontend',path.basename(url.pathname)),'utf8')});
   return r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
  });
  await page.goto('http://library-test.invalid/dashboard/0',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   window.created=0;window.disconnected=0;window.recipients=[];window.notices=[];
   customElements.define('hui-card',class extends HTMLElement{
    constructor(){super();this.identity=++window.created;this.attachShadow({mode:'open'});}
    load(){if(!this.shadowRoot.firstChild){const div=document.createElement('div');div.textContent=this.config?.content||'Probe';this.shadowRoot.append(div);}}
    setConfig(c){this.config=c;this.load();}getCardSize(){return 1;}getGridOptions(){return this.config.grid_options || {columns:12,rows:1};}
    disconnectedCallback(){window.disconnected++;}
   });
   customElements.define('home-assistant',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
   customElements.define('ha-card',class extends HTMLElement{});
   window.app=document.createElement('home-assistant');document.body.append(app);app.addEventListener('hass-notification',e=>window.notices.push(e.detail.message));
   window.library={revision:0,templates:{menu:{name:'Menu',preload:true,config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#menu',show_header:false,cards:[{type:'markdown',content:'Central',grid_options:{columns:6,rows:2}}]},bindings:[],popup_links:[{hash:'#a',overrides:[{path:['cards',0,'content'],value:'Alias'}]},{hash:'#b',preload:false}]},cold:{name:'Cold',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#cold',show_header:false,cards:[{type:'markdown',content:'Cold'}]},bindings:[]}},groups:{},people:{}};
   window.hass={states:{},user:{is_admin:true},themes:{darkMode:false,themes:{}},locale:{language:'en'},language:'en',config:{version:'2026.10.0'},localize:()=>'',connection:{subscribeMessage:async cb=>{window.receiveLibrary=cb;setTimeout(()=>cb(window.library),0);return()=>{};}},callWS:async()=>({})};
   app.hass=window.hass;app.provideHass=recipient=>{window.recipients.push(recipient);recipient.hass=app.hass;};
   window.loadCardHelpers=async()=>({createCardElement(config){const el=document.createElement(config.type.startsWith('custom:')?config.type.slice(7):'hui-'+config.type+'-card');el.setConfig?.(config);return el;}});
   window.snapshot=()=>{const host=app.shadowRoot.querySelector('[data-library-preloaded-popups]');return {created:window.created,disconnected:window.disconnected,hash:location.hash,entries:[...(host?.shadowRoot.children||[])].map(card=>({hash:card.config.hash,managed:card._managedCards?.map(c=>c.identity)||[],connected:card._managedCards?.every(c=>c.isConnected),open:card.popUp?.classList.contains('is-popup-opened'),content:card.config.cards[0].content}))};};
   window.navigate=hash=>{history.replaceState(null,'',location.pathname+hash);window.dispatchEvent(new Event('location-changed'));window.dispatchEvent(new Event('bubble-card-location-changed'));};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(sources,'bubble-card-'+version+'.js'),'utf8')});
  await page.evaluate(v=>import('/card_library/card-library.js?v='+v),projectVersion);
  await page.waitForFunction(()=>window.snapshot().entries.length===2&&window.snapshot().entries.every(e=>e.managed.length===1),{timeout:10000});
  const initial=await page.evaluate(()=>window.snapshot());assert.equal(initial.created,2);assert.equal(initial.disconnected,0);assert(initial.entries.every(e=>e.connected&&!e.open));
  for(const hash of ['#a','#menu','#a','']){await page.evaluate(hash=>window.navigate(hash),hash);await page.waitForTimeout(700);const s=await page.evaluate(()=>window.snapshot());assert.equal(s.created,2,version+' warm rebuild');assert.equal(s.disconnected,0,version+' warm disconnect');assert.deepEqual(s.entries.map(e=>e.managed),initial.entries.map(e=>e.managed));}
  await page.evaluate(()=>window.navigate('#b'));await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.created),3);
  await page.evaluate(()=>window.navigate(''));await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.disconnected),1);
  await page.evaluate(()=>{const next=structuredClone(window.library);next.revision++;next.templates.unused={name:'Unused',config:{type:'markdown',content:'No warm route'},bindings:[]};window.library=next;window.receiveLibrary(next);});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.created),3);
  await page.evaluate(()=>{const next=structuredClone(window.library);next.revision++;next.templates.menu.config.cards[0].content='Changed';window.library=next;window.receiveLibrary(next);});await page.waitForTimeout(700);
  const changed=await page.evaluate(()=>window.snapshot());assert.equal(changed.entries.length,2);assert.equal(changed.entries.find(e=>e.hash==='#menu').content,'Changed');assert.equal(changed.entries.find(e=>e.hash==='#a').content,'Alias');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal((await page.evaluate(()=>window.snapshot())).entries.length,0);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.notices),[]);
  console.log(JSON.stringify({version,initial,changed,passed:true}));await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
