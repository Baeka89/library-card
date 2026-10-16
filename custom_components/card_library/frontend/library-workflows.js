import {clone,getAt,overlap,resolveTemplate,newId,validateInputDefinitions,inputErrors,dependencies,importLibrary,popupTemplateRoutes,changedTemplates} from './library-core.js?v=1.0.0';
import {usages,configurationYaml} from './library-tools.js?v=1.0.0';
import {createRenderedCard} from './library-ha-ui.js?v=1.0.0';
import {confirmAction} from './library-ui.js?v=1.0.0';

export function canonical(value) {
  if (value === undefined) return 'undefined';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export function differences(before,after,path=[],result=[]) {
  if (canonical(before)===canonical(after) || result.length>=500) return result;
  if (before && after && typeof before==='object' && typeof after==='object' && Array.isArray(before)===Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before),...Object.keys(after)])) differences(before[key],after[key],[...path,Array.isArray(before)?Number(key):key],result);
  } else result.push({path,before,after});
  return result;
}
export function usageReference(use,library) {
  if (!use.reference) return clone(use.config);
  if (use.reference.popup_hash) {
    const id=use.reference.template, route=popupTemplateRoutes(library,library.templates[id]).find(route=>route.hash===use.reference.popup_hash);
    if (!route) throw Error('Popup-Verknüpfung wurde geändert. Übersicht aktualisieren.');
    return {type:'custom:library-card',template:id,overrides:clone(route.overrides || [])};
  }
  return {type:'custom:library-card',template:use.reference.template,overrides:clone(use.reference.overrides || [])};
}
export function usageAnalysis(use,library,hass) {
  const reference=usageReference(use,library), template=library.templates[reference.template],config=resolveTemplate(library,reference.template,reference.overrides);
  let popupOptions,localPopupOptions;
  if(use.reference?.popup_hash){
    popupOptions=clone(popupTemplateRoutes(library,template).find(route=>route.hash===use.reference.popup_hash)?.options || {});
    localPopupOptions=template.popup_links?.find(link=>link.hash===use.reference.popup_hash)?.options || {};
  }else if(use.reference){localPopupOptions=use.reference.popup || {};popupOptions={...clone(template.popup?.options || {}),...clone(localPopupOptions)};}
  const ids=new Set(dependencies(config).entities);
  for (const input of library.templates[reference.template].inputs || []) { const value=getAt(config,input.path); if(input.type==='entity'&&typeof value==='string'&&/^[a-z_]+\.[a-z0-9_]+$/.test(value))ids.add(value); }
  return {reference,config,popupOptions,exceptions:(reference.overrides?.length || 0)+Object.keys(localPopupOptions || {}).length+['card_mod','theme','grid_options','layout_options','view_layout','visibility'].filter(key=>Object.hasOwn(reference,key)).length,missing:[...ids].filter(id=>!hass.states?.[id]),errors:inputErrors(library.templates[reference.template],config)};
}
export function installWorkflows(Manager,{el,field,button,select,whenOpen}) {
  const validateDraft=draft=>importLibrary({format:'ha-card-library',version:2,library:{templates:draft.templates,groups:draft.groups,people:draft.people || {}}});
  Object.assign(Manager.prototype,{
    applyLibraryAcknowledgement(state,saved,previousRevision,beforeNotify=()=>{}) {
      validateDraft(saved);
      if (!Number.isInteger(saved.revision) || saved.revision <= previousRevision) throw Error('Die Bibliothek hat keinen gültigen Speicherstand bestätigt.');
      beforeNotify();
      if (!state.library || state.library.revision <= saved.revision) {
        state.library=saved;
        state.listeners?.forEach(listener=>listener());
      }
    },
    templateFilters(card) {
      const search=field(card,'Vorlagen suchen');search.value=this.templateSearch || '';
      search.onchange=()=>{this.templateSearch=search.value;this.selected=null;this.render();};
      const categories=[...new Set(Object.values(this.draft.templates).map(item=>item.category || ''))].sort();
      select(card,[['all','Alle Kategorien'],...categories.map(category=>[JSON.stringify(category),category || 'Ohne Kategorie'])],this.templateCategory==null?'all':JSON.stringify(this.templateCategory),value=>{this.templateCategory=value==='all'?null:JSON.parse(value);this.selected=null;this.render();},'Kategorie filtern');
    },
    filteredTemplates() { return Object.entries(this.draft.templates).filter(([,item])=>(!this.templateSearch || `${item.name} ${item.category || ''} ${item.config.type}`.toLowerCase().includes(this.templateSearch.toLowerCase()))&&(this.templateCategory==null||(item.category || '')===this.templateCategory)); },
    protectionPanel(card,item) {
      const saved=this.state.library.templates[this.selected];
      if (!item.protected && !saved?.protected) return false;
      el('p',item.protected ? 'Vorlage geschützt. Lokale Ausnahmen bleiben möglich.' : 'Schutzaufhebung zuerst zentral speichern. Danach kann die Vorlage bearbeitet werden.',card);
      if(item.protected)button(card,'Schutz aufheben',()=>{if(saved?.protected&&this.dirty){this.notice='Andere zentrale Änderungen zuerst speichern oder verwerfen.';this.render();return;}item.protected=false;this.edit();this.render();});
      const preview=el('details',undefined,card);el('summary','Geschützte Vorlage ansehen',preview);const host=el('div',undefined,preview);const id=this.selected;whenOpen(preview,()=>this.previewCard(host,this.draft,id));
      this.templateUses(card,this.selected);
      return true;
    },
    metadataPanel(card,item) {
      const section=el('details',undefined,card);el('summary','Kategorie und Eingabefelder',section);
      const category=field(section,'Kategorie');category.value=item.category || '';category.onchange=()=>{item.category=category.value.trim();this.edit();};
      button(section,'Vorlage schützen',()=>{item.protected=true;this.edit();this.render();});
      for(const input of item.inputs || []){
        const row=el('div',undefined,section);row.className='row';el('span',`${input.label} · ${input.path.join(' → ')} · ${input.type}${input.required?' · Pflichtfeld':''}`,row);
        button(row,'Eingabefeld bearbeiten',()=>{this.inputForm=null;this.inputEditingTemplate=this.selected;this.inputDraft=clone(input);this.inputEditingPath=clone(input.path);this.render();});
        button(row,'Eingabefeld entfernen',()=>{item.inputs=item.inputs.filter(entry=>entry!==input);this.edit();this.render();});
      }
      const editing=this.inputEditingTemplate===this.selected,editingPath=editing?this.inputEditingPath:null;
      const draft=(editing&&this.inputDraft) || {},form=this.inputForm?.template===this.selected?this.inputForm:{};
      const path=field(section,'Feldpfad');path.value=form.path ?? (draft.path?JSON.stringify(draft.path):this.path?JSON.stringify(this.path):'');path.placeholder='entity oder variables.entity_cover';
      const label=field(section,'Beschriftung');label.value=form.label ?? draft.label ?? '';
      const kind=select(section,[['entity','Entität'],['text','Text'],['number','Zahl'],['boolean','Schalter'],['select','Auswahlliste']],form.type ?? draft.type ?? 'entity',()=>{},'Eingabetyp');
      const required=field(section,'Pflichtfeld','input',true,'checkbox');required.checked=Boolean(form.required ?? draft.required);
      const options=field(section,'Auswahlwerte (ein Wert je Zeile)','textarea');options.value=form.options ?? (draft.options || []).join('\n');
      const domains=field(section,'Entitätsdomänen (optional, mit Komma)');domains.value=form.domains ?? (draft.domains || []).join(',');
      const visibility=()=>{options.libraryParent.hidden=kind.value!=='select';domains.libraryParent.hidden=kind.value!=='entity';};kind.onchange=visibility;visibility();
      button(section,'Eingabefeld speichern',()=>{
        try{
          const parts=path.value.trim().startsWith('[')?JSON.parse(path.value):path.value.trim().split('.').map(key=>key.trim()).map(key=>/^\d+$/.test(key)?Number(key):key);
          const input={path:parts,label:label.value.trim(),type:kind.value,required:required.checked};
          if(kind.value==='select')input.options=options.value.split('\n').map(value=>value.trim()).filter(Boolean);
          if(kind.value==='entity'&&domains.value.trim())input.domains=domains.value.split(',').map(value=>value.trim());
          const next=[...(item.inputs || []).filter(entry=>!editingPath || canonical(entry.path)!==canonical(editingPath)),input];
          validateInputDefinitions({...item,inputs:next});item.inputs=next;this.inputForm=null;this.inputDraft=null;this.inputEditingPath=null;this.inputEditingTemplate=null;this.edit();this.render();
        }catch(error){this.inputForm={template:this.selected,path:path.value,label:label.value,type:kind.value,required:required.checked,options:options.value,domains:domains.value};this.notice=error.message;this.render();}
      });
      el('p','Felder bestimmen die Eingaben beim Einsetzen. Ihre zentralen Kartenwerte bleiben die Vorgaben. Für Schlüssel mit Punkten den Feldpfad als JSON-Liste eingeben.',section);
    },
    templateUses(card,id) {
      const section=el('details',undefined,card);el('summary','Lokale Verwendungen',section);
      button(section,'Verwendungen aktualisieren',()=>this.scan()).disabled=this.scanning;
      for(const use of usages(this.inventory,id,this.state.library))this.usageLink(section,use);
      if(!this.inventory)el('p','Dashboards einlesen, um lokale Verwendungen zu sehen.',section);
    },
    usageActions(row,use) {
      try{
        const analysis=usageAnalysis(use,this.state.library,this._hass);
        el('p',analysis.exceptions?`${analysis.exceptions} lokale Ausnahmen`:'Vollständig mit Vorlage verknüpft',row);
        for(const id of analysis.missing)el('p','Entität fehlt: '+id,row).className='error';
        for(const error of analysis.errors)el('p',error,row).className='error';
      }catch(error){el('p',error.message,row).className='error';}
      button(row,'Verwendung ansehen / bearbeiten',()=>this.run(()=>this.openUsage(use)));
      button(row,'Verwendung duplizieren',()=>this.run(async()=>{await this.openUsage(use);this.usageDuplicate=true;this.render();}));
      button(row,'Verwendung vergleichen',()=>{
        if(!this.compareUse){this.compareUse=clone(use);this.notice='Erste Verwendung gewählt. Nun die zweite Verwendung auswählen.';this.render();}
        else{this.comparePair=[this.compareUse,clone(use)];this.compareUse=null;this.mode='compare-use';this.notice='';this.render();}
      });
    },
    async openUsage(use) {
      const state=this.state,library=state.library,reference=usageReference(use,library);
      const snapshot=await this._hass.callWS({type:'card_library/dashboard_get',dashboard:use.url_path || ''});this.assertLibraryConnection(state);
      const original=getAt(snapshot.config,use.path),expected=use.reference?getAt(use.config,use.path.slice((use.card_path || use.path.slice(0,-1)).length)):use.config;
      if(!original || canonical(original)!==canonical(expected))throw Error('Fundstelle wurde geändert oder verschoben. Übersicht aktualisieren.');
      if(state.library!==library || snapshot.library_revision!==undefined&&snapshot.library_revision!==library.revision)throw Error('Bibliothek geändert. Verwendung erneut öffnen.');
      this.localUse={use:clone(use),snapshot,original:clone(original),reference,revision:library.revision};this.usageDuplicate=false;this.mode='local-use';this.render();
    },
    localUsePanel(card) {
      const context=this.localUse;if(!context)return;
      const use=context.use;
      el('h3',this.usageDuplicate?'Verwendung duplizieren':'Lokale Verwendung bearbeiten',card);
      el('p',`${use.dashboard} / ${use.view} / ${use.path.join(' → ')}`,card);
      const alias=use.reference?.popup_hash&&this.state.library.templates[context.reference.template].popup_links?.some(link=>link.hash===use.reference.popup_hash);
      if(use.reference?.popup_hash)el('p',alias?'Speichern ändert die lokalen Ausnahmen für alle Buttons mit diesem Hash.':'Zentraler Hash ohne lokale Ausnahmen. Für eine eigene Variante eine Hash-Verknüpfung unter Vorlagen einsetzen anlegen oder diese Verwendung duplizieren.',card);
      let exportField,previewSection,previewHost;
      const editor=document.createElement('library-card-editor');editor.usageEditing=true;editor.setConfig(context.reference);editor.hass=this._hass;
      editor.addEventListener('config-changed',event=>{event.stopPropagation();if(this.localUse===context){context.reference=clone(event.detail.config);if(exportField)exportField.value=configurationYaml(this.usageExport(context));if(previewSection?.open){clearTimeout(this.usagePreviewTimer);this.usagePreviewTimer=setTimeout(()=>{if(previewHost?.isConnected&&this.localUse===context)this.previewUsage(previewHost,context.use,context.reference);},180);}}});card.append(editor);
      const preview=previewSection=el('details',undefined,card);el('summary',use.reference?'Popup-Inhalt mit lokalen Änderungen':'Tatsächliche Karte mit lokalen Änderungen',preview);const host=previewHost=el('div',undefined,preview);whenOpen(preview,()=>this.previewUsage(host,context.use,context.reference),true);
      const yaml=exportField=field(card,'Konfiguration dieser Verwendung','textarea');yaml.readOnly=true;yaml.rows=8;yaml.value=configurationYaml(this.usageExport(context));
      if(context.snapshot.mode!=='storage')el('p','YAML-/generiertes Dashboard: Konfiguration kopieren und dort übernehmen. Direktes Speichern ist gesperrt.',card);
      if(!this.usageDuplicate){
        const save=button(card,'Lokale Änderungen speichern',()=>this.run(()=>this.saveUsage()));save.disabled=Boolean(use.reference?.popup_hash&&!alias||context.snapshot.mode!=='storage'&&!use.reference?.popup_hash);
      }else{
        if(use.reference?.popup_hash){const hash=field(card,'Eigener Hash für die Kopie (optional)');hash.value=context.pendingDuplicateHash || this.duplicateHash || '';hash.placeholder='#Menu-Kopie';hash.onchange=()=>{this.duplicateHash=hash.value;};}
        const targets=(this.inventory?.destinations || []).filter(target=>target.mode==='storage');
        const choice=select(card,[['','Ziel wählen'],...targets.map((target,index)=>[String(index),target.label])],this.duplicateTarget || '',value=>{this.duplicateTarget=value;},'Zielansicht / Abschnitt');
        button(card,'Verknüpfung am Ziel einfügen',()=>this.run(()=>{if(choice.value==='')throw Error('Zielansicht oder Abschnitt wählen.');return this.duplicateUsage(targets[Number(choice.value)]);})).disabled=!targets.length;
        el('p','Dupliziert die Verknüpfung mit ihren lokalen Einstellungen. Zentrale Gestaltung bleibt verbunden.',card);
      }
    },
    async previewUsage(host,use,reference=usageReference(use,this.state.library)) {
      if(!host.isConnected)return;
      host.setAttribute('data-library-preview','');
      host.previewRequest={use,reference};
      const token=host.previewToken=(host.previewToken || 0)+1;
      try{
        const config=use.reference?{...clone(reference),popup_content:'auto'}:clone(reference),signature=JSON.stringify(config);
        if(host.previewChild&&host.previewSignature===signature){host.previewChild.hass=this._hass;return;}
        const helpers=await window.loadCardHelpers();if(!host.isConnected||token!==host.previewToken)return;
        const {element}=createRenderedCard(helpers,config,this._hass);
        element.addEventListener('ll-rebuild',event=>{
          event.stopPropagation();if(!host.isConnected||host.previewChild!==element)return;
          host.previewSignature=null;host.previewChild=null;
          const latest=host.previewRequest;this.previewUsage(host,latest.use,latest.reference);
        });
        element.addEventListener('ll-upgrade',event=>{
          if(event.target!==element||host.previewChild!==element||!host.isConnected)return;
          event.stopPropagation();if(Object.hasOwn(element,'hass'))delete element.hass;element.hass=this._hass;
        });
        host.previewChild=element;element.hass=this._hass;
        if(!host.isConnected||token!==host.previewToken)return;
        host.previewSignature=signature;host.replaceChildren(element);
      }catch(error){if(token===host.previewToken&&host.isConnected){host.previewChild=null;host.previewSignature=null;host.replaceChildren();el('p',error.message,host).className='error';}}
    },
    usageExport(context) {
      if(!context.use.reference)return clone(context.reference);
      if(context.use.reference.popup_hash)return {hash:context.use.reference.popup_hash,template:context.reference.template,overrides:clone(context.reference.overrides || [])};
      const action=clone(context.original);action.card_library.overrides=clone(context.reference.overrides || []);return action;
    },
    usageValue(context) {
      if(context.reference.template!==usageReference(context.use,this.state.library).template)throw Error('Die Vorlage der Verwendung darf hier nicht gewechselt werden.');
      const config=resolveTemplate(this.state.library,context.reference.template,context.reference.overrides),errors=inputErrors(this.state.library.templates[context.reference.template],config);
      if(errors.length)throw Error(errors.join(' · '));
      if(!context.use.reference)return clone(context.reference);
      const value=clone(context.original);
      if(context.use.reference.popup_hash)return value;
      value.card_library={...value.card_library,overrides:clone(context.reference.overrides || [])};return value;
    },
    async saveUsage() {
      const context=this.localUse,state=this.state;
      if(!context || context.revision!==state.library.revision)throw Error('Bibliothek geändert. Verwendung erneut öffnen.');
      const value=this.usageValue(context);
      if(context.use.reference?.popup_hash){
        if(this.dirty)throw Error('Zentralen Entwurf zuerst speichern oder verwerfen.');
        const candidate=clone(state.library),template=candidate.templates[context.reference.template],hash=context.use.reference.popup_hash;
        const link=template.popup_links?.find(link=>link.hash===hash);
        if(!link)throw Error('Der zentrale Popup-Hash kann keine örtlichen Ausnahmen speichern. Zuerst eine eigene Hash-Verknüpfung unter Vorlagen einsetzen anlegen.');
        link.overrides=clone(context.reference.overrides || []);
        const saved=await this._hass.callWS({type:'card_library/save',revision:context.revision,library:{templates:candidate.templates,groups:candidate.groups,people:candidate.people}});this.assertLibraryConnection(state);
        this.applyLibraryAcknowledgement(state,saved,context.revision,()=>{context.revision=saved.revision;});this.notice='Lokale Hash-Ausnahmen gespeichert. Alle Buttons mit diesem Hash verwenden sie.';
      }else{
        const result=await this._hass.callWS({type:'card_library/dashboard_write',dashboard:context.use.url_path || '',fingerprint:context.snapshot.fingerprint,path:context.use.path,value,operation:'replace',library_revision:context.revision,source:{}});this.assertLibraryConnection(state);
        context.snapshot=result;context.original=clone(value);context.use.config=context.use.reference?context.use.config:clone(value);this.inventory=null;this.notice='Lokale Dashboard-Verwendung gespeichert.';
      }
    },
    async duplicateUsage(target) {
      const context=this.localUse,state=this.state;if(!target)throw Error('Zielansicht oder Abschnitt wählen.');
      if(context.revision!==state.library.revision)throw Error('Bibliothek geändert. Verwendung erneut öffnen.');
      let value=this.usageValue(context),revision=context.revision;
      const destination=await this._hass.callWS({type:'card_library/dashboard_get',dashboard:target.url_path || ''});this.assertLibraryConnection(state);
      if(destination.mode!=='storage')throw Error('Ziel muss ein gespeichertes UI-Dashboard sein.');
      if(context.use.reference?.popup_hash){
        if(this.dirty)throw Error('Zentralen Entwurf zuerst speichern oder verwerfen.');
        const source=await this._hass.callWS({type:'card_library/dashboard_get',dashboard:context.use.url_path || ''});this.assertLibraryConnection(state);
        if(source.fingerprint!==context.snapshot.fingerprint)throw Error('Die Ausgangsverwendung wurde geändert. Neu öffnen.');
        const candidate=clone(state.library),template=candidate.templates[context.reference.template];
        const hash=(this.duplicateHash || context.pendingDuplicateHash || '#popup-'+newId()).trim();
        const options=clone(template.popup_links?.find(link=>link.hash===context.use.reference.popup_hash)?.options || {});
        const existing=template.popup_links?.find(link=>link.hash===hash);
        const link={hash,overrides:clone(context.reference.overrides || []),options};
        if(existing){if(hash!==context.pendingDuplicateHash)throw Error('Hash bereits vergeben. Einen eigenen Hash wählen.');Object.assign(existing,link);}
        else template.popup_links=[...(template.popup_links || []),link];
        validateDraft(candidate);
        const saved=await this._hass.callWS({type:'card_library/save',revision:context.revision,library:{templates:candidate.templates,groups:candidate.groups,people:candidate.people}});this.assertLibraryConnection(state);
        this.applyLibraryAcknowledgement(state,saved,context.revision,()=>{revision=context.revision=saved.revision;context.pendingDuplicateHash=hash;});
        value={type:'button',name:template.name,tap_action:{action:'navigate',navigation_path:hash}};
      }else if(context.use.reference)value={type:'button',name:state.library.templates[context.reference.template].name,tap_action:value};
      try{
        await this._hass.callWS({type:'card_library/dashboard_write',dashboard:target.url_path || '',fingerprint:destination.fingerprint,path:target.path,value,operation:'append',library_revision:revision,source:{dashboard:context.use.url_path || '',fingerprint:context.snapshot.fingerprint}});
      }catch(error){if(context.pendingDuplicateHash)throw Error('Hash-Kopie '+context.pendingDuplicateHash+' wurde gespeichert, aber das Einfügen ist fehlgeschlagen: '+error.message+'. Die Verknüpfung bleibt erhalten; nach neuer Prüfung erneut einsetzen.');throw error;}
      this.assertLibraryConnection(state);context.pendingDuplicateHash=null;this.duplicateHash='';this.inventory=null;this.notice='Verknüpfung mit lokalen Einstellungen am Ziel eingefügt.';this.mode='usage';
    },
    compareUsePanel(card) {
      const pair=this.comparePair;if(!pair)return;
      el('h3','Zwei Verwendungen vergleichen',card);
      let configurations;
      try{configurations=pair.map(use=>{const analysis=usageAnalysis(use,this.state.library,this._hass);return {card:analysis.config,...(use.reference?{popup:analysis.popupOptions}:{}),placement:Object.fromEntries(Object.entries(analysis.reference).filter(([key])=>!['type','template','overrides'].includes(key)))};});}catch(error){el('p',error.message,card).className='error';return;}
      pair.forEach((use,index)=>{const section=el('details',undefined,card);el('summary',`${index+1}: ${use.dashboard} / ${use.view}`,section);const host=el('div',undefined,section);whenOpen(section,()=>{const reference=usageReference(use,this.state.library);this.previewUsage(host,use,reference);});const yaml=field(section,'Aufgelöste Konfiguration','textarea');yaml.readOnly=true;yaml.value=configurationYaml(configurations[index]);});
      const changes=differences(...configurations);el('p',changes.length?`${changes.length} unterschiedliche Felder (maximal 500).`:'Beide Karten haben dieselbe aufgelöste Konfiguration.',card);
      for(const change of changes)el('p',`${change.path.join(' → ')}: ${canonical(change.before)} → ${canonical(change.after)}`,card);
    },
    reviewPanel(card) {
      el('h3','Änderungsvorschau',card);el('p','Zeigt Auswirkungen des zentralen Entwurfs auf bekannte Verwendungen. Lokale Ausnahmen bleiben erhalten.',card);
      button(card,'Verwendungen neu einlesen',()=>this.scan()).disabled=this.scanning;
      if(!this.inventory)el('p','Noch keine Dashboard-Bestandsaufnahme. Auswirkungen sind unvollständig.',card);
      for(const failure of this.inventory?.failures || [])el('p','Unvollständig: '+failure,card).className='error';
      const before=this.state.library,after=this.draft;
      const changed=new Set(changedTemplates(before,after));
      for(const id of new Set([...Object.keys(before.templates),...Object.keys(after.templates)]))if(canonical(before.templates[id])!==canonical(after.templates[id]))changed.add(id);
      for(const id of changed){
        const section=el('details',undefined,card);el('summary',after.templates[id]?.name || before.templates[id]?.name,section);
        if(!before.templates[id]||!after.templates[id]){el('p',before.templates[id]?'Vorlage wird entfernt.':'Neue Vorlage.',section);continue;}
        const changes=differences(resolveTemplate(before,id),resolveTemplate(after,id));
        el('p',`${changes.length} geänderte Kartenfelder; Kategorien/Eingabefelder/Schutz können zusätzlich geändert sein.`,section);
        for(const change of changes)el('p',`${change.path.join(' → ')}: ${canonical(change.before)} → ${canonical(change.after)}`,section);
        for(const use of usages(this.inventory,id,before)){
          try{const reference=usageReference(use,before),nextReference=usageReference(use,after),old=usageAnalysis(use,before,this._hass),next=usageAnalysis(use,after,this._hass),unchanged=canonical({card:old.config,popup:old.popupOptions})===canonical({card:next.config,popup:next.popupOptions});el('p',`${use.dashboard} / ${use.view}: ${unchanged?'Kartenkonfiguration durch lokale Ausnahmen unverändert':'Kartenkonfiguration wird aktualisiert'} · ${next.exceptions} lokale Ausnahmen`,section);
            for(const error of next.errors)el('p',`${use.dashboard} / ${use.view}: ${error}`,section).className='error';
            const preview=el('details',undefined,section);el('summary','Vorher / Nachher ansehen',preview);const first=el('div',undefined,preview),second=el('div',undefined,preview);whenOpen(preview,()=>Promise.all([this.previewCard(first,before,id,reference.overrides),this.previewCard(second,after,id,nextReference.overrides)]));
          }catch(error){el('p',`${use.dashboard} / ${use.view}: ${error.message}`,section).className='error';}
        }
      }
      if(!changed.size)el('p','Keine Änderungen an Vorlagen oder ihren gemeinsamen Werten.',card);
    },
    async restoreTemplate(snapshot,id) {
      if(this.draft.templates[id]?.protected || this.state.library.templates[id]?.protected)throw Error('Vorlagenschutz zuerst separat aufheben.');
      if(!snapshot.library.templates[id])throw Error('Die Vorlage ist in diesem Stand nicht enthalten.');
      const candidate=clone(this.draft);candidate.templates[id]=clone(snapshot.library.templates[id]);validateDraft(candidate);
      if(!await confirmAction(this,'Nur diese Vorlage als Entwurf zurücknehmen? Andere Vorlagen, Gruppen und Personen bleiben erhalten.'))return;
      this.draft=candidate;this.selected=id;this.mode='templates';this.edit();
    }
  });
}
