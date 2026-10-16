const {chromium}=require(process.env.LIBRARY_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const bubbleDir=process.env.LIBRARY_BUBBLE_DIR;
if(!bubbleDir)throw Error('LIBRARY_BUBBLE_DIR muss auf die originalen Bubble-Testdateien zeigen.');
const projectVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LIBRARY_CHROMIUM,args:['--no-sandbox']});
 for(const version of ['v3.2.0','v3.4.2']){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.startsWith('/card_library/')){const name=u.pathname.split('/').at(-1);return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(root,'custom_components/card_library/frontend',name),'utf8')});}return r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'});});
  await page.goto('http://library-test.invalid/dashboard/0');
  await page.evaluate(()=>{
   customElements.define('home-assistant',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});}});
   customElements.define('hui-dialog-edit-card',class extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'});}
    async showDialog(params){this._open=true;this._params=params;this._cardConfig=params.cardConfig;window.steps.push({step:'showDialog',type:params.cardConfig.type});}
    closeDialog(){this._open=false;return true;}
   });
   customElements.define('hui-section',class extends HTMLElement{
    async _initializeConfig(){
     this._layoutElement=document.createElement('div');this.append(this._layoutElement);
     this._layoutElement.addEventListener('ll-edit-card',e=>{
      e.stopPropagation();const idx=e.detail.path.at(-1);
      window.app.dispatchEvent(new CustomEvent('show-dialog',{bubbles:true,composed:true,detail:{dialogTag:'hui-dialog-edit-card',dialogParams:{
       cardConfig:this.config.cards[idx],lovelaceConfig:this.lovelace.config,
       saveCardConfig:async config=>{this.config.cards[idx]=config;await this.lovelace.saveConfig(this.lovelace.config);}
      }}}));
     });
    }
   });
   window.steps=[];window.saved=[];
   window.app=document.createElement('home-assistant');document.body.append(app);
   window.dialog=document.createElement('hui-dialog-edit-card');app.shadowRoot.append(dialog);
   dialog._params={cardConfig:{type:'custom:library-manager'},lovelaceConfig:{views:[{cards:[{type:'custom:library-manager'}]}]},saveCardConfig:async config=>{window.saved.push(config);window.steps.push({step:'dashboard-save',type:config.type});}};
   dialog._cardConfig=dialog._params.cardConfig;
  });
  await page.addScriptTag({content:fs.readFileSync(`${bubbleDir}/bubble-card-${version}.js`,'utf8')});
  await page.evaluate(async projectVersion=>{
   window.library={revision:0,templates:{popup:{name:'Popup',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#LibraryPopup',show_header:false,cards:[{type:'markdown',content:'Before'}]},bindings:[]}},groups:{},people:{}};
   window.hass={states:{},config:{version:'2026.10.0'},user:{is_admin:true},themes:{themes:{},darkMode:false},localize:()=>'',locale:{language:'en'},language:'en',connection:{subscribeMessage:async cb=>{setTimeout(()=>cb(window.library),0);return()=>{};}},callWS:async()=>({})};
   app.hass=window.hass;app.provideHass=recipient=>{recipient.hass=window.hass;};
   window.loadCardHelpers=async()=>({createCardElement:config=>{const card=document.createElement(config.type.startsWith('custom:')?config.type.slice(7):'hui-'+config.type+'-card');card.setConfig?.(config);return card;}});
   await import('/card_library/card-library.js?v='+projectVersion);
   const manager=document.createElement('library-manager-editor');manager.setConfig({type:'custom:library-manager'});dialog.shadowRoot.append(manager);manager.hass=window.hass;window.manager=manager;
   await new Promise(r=>setTimeout(r,30));manager.selected='popup';manager.render();
   for(let i=0;i<50&&!manager.editor;i++)await new Promise(r=>setTimeout(r,20));
  },projectVersion);
  const result=await page.evaluate(async()=>{
   const editor=window.manager.editor;if(editor?.localName!=='bubble-card-editor')throw Error('Actual Bubble editor was not mounted');
   window.steps.push({step:'library-original-editor-mounted',tag:editor.localName,connected:editor.isConnected});
   const active=editor._getActiveEditCardDialog();
   const capture=editor._captureStandaloneParentDialogParams();
   const captured={type:capture?.cardConfig?.type,callbackIsDashboard:capture?.saveCardConfig===dialog._params.saveCardConfig,path:capture?._standalonePopupPathInDialog};
   const opened=await editor._openStandaloneCardDialog({type:'edit',index:0});
   const childType=active._params.cardConfig.type;
   await active._params.saveCardConfig({...active._params.cardConfig,content:'After'});
   active.closeDialog();
   await new Promise(r=>setTimeout(r,50));
   const afterCloseType=active._params.cardConfig.type;
   await active._params.saveCardConfig(active._params.cardConfig);
   await dialog._params.saveCardConfig(dialog._params.cardConfig);
   return {captured,opened,childType,afterCloseType,steps,saved,libraryConfigType:manager.draft.templates.popup.config.type,content:manager.draft.templates.popup.config.cards[0].content,outerType:dialog._params.cardConfig.type};
  });
  if(result.captured.callbackIsDashboard||result.outerType!=='custom:library-manager'||result.saved.some(c=>c.type!=='custom:library-manager')||result.content!=='After'||errors.length)throw Error(JSON.stringify({version,result,errors}));console.log(JSON.stringify({version,result,errors}));await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
