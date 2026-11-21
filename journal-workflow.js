/* Gongola Journal Elite — focused workflow enhancements.
 * Existing myTrades, dailyNotes, journalSettings and Supabase logic are preserved.
 * Screenshot evidence is stored in IndexedDB on this browser/device only.
 */
(function(){
  'use strict';
  const REVIEW_KEY = 'gongolaDailyReviewsV2';
  const APPEARANCE_KEY = 'gongolaJournalAppearance';
  const DB_NAME = 'gongola-journal-evidence-v1';
  const DB_STORE = 'images';
  const MAX_IMAGES_PER_OWNER = 5;
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => {
    try {const value=JSON.parse(localStorage.getItem(key));return value === null ? fallback : value;}
    catch {return fallback;}
  };
  const tradeKey = id => 'trade:' + String(id);
  const dayKey = date => 'day:' + String(date);
  let dbPromise, activeImageUrls=[], toastTimer, viewingOwner=null;
  let saveTradeBusy=false, saveReviewBusy=false;

  function toast(message, isError=false){
    let node=$('gj-toast');
    if(!node){node=document.createElement('div');node.id='gj-toast';node.className='gj-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);}
    clearTimeout(toastTimer);node.textContent=message;node.style.borderColor=isError?'var(--negative)':'var(--border)';node.hidden=false;
    toastTimer=setTimeout(()=>{node.hidden=true;},4500);
  }
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window))return reject(new Error('Image storage is unavailable in this browser.'));
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(DB_STORE)){
          const store=db.createObjectStore(DB_STORE,{keyPath:'id'});
          store.createIndex('owner','owner',{unique:false});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Cannot open screenshot storage.'));
      request.onblocked=()=>reject(new Error('Screenshot storage is blocked by another tab.'));
    }).catch(error=>{dbPromise=null;throw error;});
    return dbPromise;
  }
  async function listEvidence(owner){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readonly');
      const req=owner?tx.objectStore(DB_STORE).index('owner').getAll(owner):tx.objectStore(DB_STORE).getAll();
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>a.created-b.created));
      req.onerror=()=>reject(req.error);
    });
  }
  async function writeEvidence(records, replace=false){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      const store=tx.objectStore(DB_STORE);
      if(replace)store.clear();
      for(const record of records)store.put(record);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Could not save screenshots.'));
      tx.onabort=()=>reject(tx.error||new Error('Screenshot save aborted.'));
    });
  }
  async function deleteEvidenceOwner(owner){
    const records=await listEvidence(owner);
    if(!records.length)return;
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      records.forEach(record=>tx.objectStore(DB_STORE).delete(record.id));
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  async function removeEvidence(id){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const src=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(src);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('Unable to read this screenshot.'));};
      image.src=src;
    });
  }
  async function prepareImage(file){
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP screenshot.');
    if(file.size>MAX_IMAGE_BYTES)throw new Error('Screenshot exceeds 12 MB. Please resize it first.');
    const image=await loadImage(file);
    const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale));
    const height=Math.max(1,Math.round(image.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('This browser cannot process the screenshot.');
    ctx.drawImage(image,0,0,width,height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image compression failed.')),'image/webp',0.88));
    canvas.width=0;canvas.height=0;
    return {blob, width, height, name:String(file.name||'Chart screenshot').slice(0,120)};
  }
  async function addScreenshots(owner, fileList){
    const files=Array.from(fileList||[]);
    if(!files.length)return 0;
    const existing=await listEvidence(owner);
    if(existing.length+files.length>MAX_IMAGES_PER_OWNER)throw new Error('Maximum '+MAX_IMAGES_PER_OWNER+' screenshots per trade or review.');
    const records=[];
    for(const file of files){
      const image=await prepareImage(file);
      records.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2),owner,created:Date.now(),...image});
    }
    await writeEvidence(records);
    return records.length;
  }
  function releaseImages(){activeImageUrls.forEach(url=>URL.revokeObjectURL(url));activeImageUrls=[];}
  function getViewer(){
    let viewer=$('gj-image-viewer');if(viewer)return viewer;
    viewer=document.createElement('div');viewer.id='gj-image-viewer';viewer.className='gj-evidence-modal';viewer.hidden=true;
    viewer.innerHTML=`<div class="gj-evidence-dialog" role="dialog" aria-modal="true" aria-label="Chart screenshots"><div class="gj-row"><div><p class="gj-eyebrow">Evidence library</p><h2 class="gj-section-title" style="font-size:18px">Chart screenshots</h2></div><button class="gj-btn gj-btn--ghost" type="button" id="gj-image-close">Close ✕</button></div><p class="gj-subtext" style="margin-top:7px">Saved privately on this browser, not uploaded to the cloud.</p><div class="gj-evidence-picker" style="margin-top:14px"><div><p class="gj-section-title">Add screenshot</p><p class="gj-evidence-meta">You can attach evidence after logging a trade, too.</p></div><input type="file" id="gj-image-add" accept="image/jpeg,image/png,image/webp" multiple aria-label="Add chart screenshot"></div><div id="gj-image-grid" class="gj-image-grid"></div></div>`;
    document.body.append(viewer);
    $('gj-image-close').addEventListener('click',closeViewer);
    $('gj-image-add').addEventListener('change',async e=>{
      const owner=viewingOwner,files=Array.from(e.target.files||[]);if(!owner||!files.length)return;
      e.target.disabled=true;
      try{await addScreenshots(owner,files);toast('Screenshots attached.');await openViewer(owner);refreshEvidenceCounts();}
      catch(error){toast('Screenshot not saved: '+error.message,true);}
      finally{e.target.value='';e.target.disabled=false;}
    });
    viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && !viewer.hidden)closeViewer();});
    return viewer;
  }
  function closeViewer(){const viewer=getViewer();viewer.hidden=true;releaseImages();viewingOwner=null;}
  async function openViewer(owner){
    viewingOwner=owner;
    const viewer=getViewer();viewer.hidden=false;const grid=$('gj-image-grid');
    releaseImages();grid.textContent='Loading screenshots…';
    try{
      const records=await listEvidence(owner);
      if(viewingOwner!==owner)return;
      grid.textContent='';
      if(!records.length){grid.textContent='No screenshots saved yet.';return;}
      for(const record of records){
        const item=document.createElement('div');item.className='gj-image-tile';
        const img=document.createElement('img');img.alt='Saved chart screenshot: '+record.name;img.loading='lazy';
        const url=URL.createObjectURL(record.blob);activeImageUrls.push(url);img.src=url;
        const row=document.createElement('div');row.className='gj-row';
        const download=document.createElement('a');download.href=url;download.download=record.name||'chart.webp';download.textContent='Download';download.className='gj-btn gj-btn--subtle';
        const remove=document.createElement('button');remove.type='button';remove.className='gj-btn gj-btn--danger';remove.textContent='Remove';
        remove.addEventListener('click',async()=>{
          if(!confirm('Permanently delete this screenshot from this browser?'))return;
          try{await removeEvidence(record.id);await openViewer(owner);refreshEvidenceCounts();}catch(e){toast(e.message,true);}
        });
        row.append(download,remove);item.append(img,row);grid.append(item);
      }
    }catch(e){grid.textContent=e.message;}
    $('gj-image-close').focus();
  }
  function field(label,id,options){
    const container=document.createElement('label');
    const caption=document.createElement('span');caption.className='gj-label';caption.textContent=label;
    const select=document.createElement('select');select.id=id;select.className='gj-field';
    options.forEach(([value,text])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=text;select.append(opt);});
    container.append(caption,select);return container;
  }
  function textField(label,id,placeholder){
    const container=document.createElement('label');
    const caption=document.createElement('span');caption.className='gj-label';caption.textContent=label;
    const textarea=document.createElement('textarea');textarea.id=id;textarea.className='gj-field gj-field--notes';textarea.rows=2;textarea.placeholder=placeholder;
    container.append(caption,textarea);return container;
  }
  function buildTodayBar(){
    const dashboard=$('view-dashboard');if(!dashboard || $('gj-today-bar'))return;
    const section=document.createElement('section');section.id='gj-today-bar';section.className='gj-today-bar';
    const left=document.createElement('div');left.innerHTML='<p class="gj-eyebrow">Trading discipline</p><h2>Review the session. Improve the process.</h2><p class="gj-subtext">Keep the record concise, consistent and evidence-based.</p>';
    const right=document.createElement('button');right.type='button';right.className='gj-btn gj-btn--primary';right.textContent='Review today';right.addEventListener('click',reviewToday);
    section.append(left,right);
    dashboard.querySelector('.grid')?.before(section);
  }
  function reviewToday(){
    if(typeof calendarDate==='undefined'||typeof selectedDateStr==='undefined'){toast('Calendar is unavailable.',true);return;}
    const today=new Date();calendarDate=new Date(today.getFullYear(),today.getMonth(),1);selectedDateStr=today.toDateString();
    window.switchView('calendar');window.renderCalendar();
    requestAnimationFrame(()=>$('daily-detail')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function buildReviewForm(){
    const section=$('daily-detail');if(!section||$('gj-review-form'))return;
    const form=document.createElement('section');form.id='gj-review-form';form.className='gj-review-form';
    const heading=document.createElement('div');heading.className='gj-row';heading.innerHTML='<div><p class="gj-eyebrow">Session debrief</p><h3 class="gj-section-title">Daily execution review</h3></div><span class="gj-pill">PROCESS FIRST</span>';
    const grid=document.createElement('div');grid.className='gj-review-grid';
    grid.append(
      field('Session','gj-review-session',[['','Select session'],['london','London'],['newyork','New York'],['both','London + New York'],['asia','Asia'],['none','No trade / study']]),
      field('Plan adherence','gj-review-plan',[['','Choose'],['yes','Followed plan'],['partial','Partially'],['no','Did not follow'],['na','No execution']]),
      field('Execution grade','gj-review-grade',[['','Choose'],['A','A · Excellent'],['B','B · Good'],['C','C · Needs work'],['D','D · Poor']])
    );
    const notes=document.createElement('div');notes.className='gj-split';
    notes.append(textField('What worked','gj-review-good','One thing you executed well…'),textField('What to improve','gj-review-improve','One mistake or missed opportunity…'));
    form.append(heading,grid,notes,textField('Next-session priority','gj-review-next','One actionable improvement for tomorrow…'));
    const evidence=document.createElement('div');evidence.className='gj-evidence-picker';
    const wrap=document.createElement('div');wrap.style.flex='1';
    wrap.innerHTML='<p class="gj-section-title" style="margin-bottom:3px">Attach chart screenshots</p><p class="gj-evidence-meta">Optional · up to 5 images per day · saved on this device</p>';
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.id='gj-day-images';input.setAttribute('aria-label','Attach screenshots to this day');
    evidence.append(wrap,input);
    const actions=document.createElement('div');actions.className='gj-review-actions';
    const view=document.createElement('button');view.type='button';view.id='gj-day-evidence-view';view.className='gj-btn gj-btn--ghost';view.textContent='Screenshots (0)';view.addEventListener('click',()=>{if(typeof selectedDateStr!=='undefined'&&selectedDateStr)openViewer(dayKey(selectedDateStr));});
    const save=document.createElement('button');save.type='button';save.id='gj-save-review';save.className='gj-btn gj-btn--primary';save.textContent='Save daily review';save.addEventListener('click',saveReview);
    actions.append(view,save);
    const help=document.createElement('p');help.className='gj-save-status';help.id='gj-review-feedback';help.setAttribute('aria-live','polite');
    form.append(evidence,actions,help);section.append(form);
    const oldButton=section.querySelector('button[onclick="saveDailyNote()"]');if(oldButton)oldButton.hidden=true;
  }
  function hydrateReview(date){
    if(!$('gj-review-form'))return;
    const record=read(REVIEW_KEY,{})[date]||{};
    for(const [field,key] of [['gj-review-session','session'],['gj-review-plan','plan'],['gj-review-grade','grade'],['gj-review-good','good'],['gj-review-improve','improve'],['gj-review-next','next']]){
      const node=$(field);if(node)node.value=record[key]||'';
    }
    const input=$('gj-day-images');if(input)input.value='';
    $('gj-review-feedback').textContent='';refreshDayEvidenceCount(date);
  }
  async function refreshDayEvidenceCount(date){
    const btn=$('gj-day-evidence-view');if(!btn||!date)return;
    try{const images=await listEvidence(dayKey(date));if(typeof selectedDateStr!=='undefined'&&selectedDateStr===date)btn.textContent='Screenshots ('+images.length+')';}
    catch{btn.textContent='Screenshots (unavailable)';}
  }
  async function saveReview(){
    if(saveReviewBusy)return;
    if(typeof selectedDateStr==='undefined'||!selectedDateStr)return toast('Select a date first.',true);
    const date=selectedDateStr,files=Array.from($('gj-day-images')?.files||[]);
    const reviews=read(REVIEW_KEY,{});
    reviews[date]={
      session:$('gj-review-session').value,plan:$('gj-review-plan').value,
      grade:$('gj-review-grade').value,good:$('gj-review-good').value.trim(),
      improve:$('gj-review-improve').value.trim(),next:$('gj-review-next').value.trim(),
      updatedAt:new Date().toISOString()
    };
    const notes=read('dailyNotes',{});notes[date]=$('daily-notes').value;
    const save=$('gj-save-review');save.disabled=true;saveReviewBusy=true;
    try{
      localStorage.setItem('dailyNotes',JSON.stringify(notes));
      localStorage.setItem(REVIEW_KEY,JSON.stringify(reviews));
      let count=0,warning='';
      if(files.length){try{count=await addScreenshots(dayKey(date),files);}catch(e){warning=e.message;}}
      $('gj-day-images').value='';$('gj-review-feedback').textContent=warning?'Review saved; screenshot issue: '+warning:'Review saved · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      toast(warning?'Review saved, but screenshots were not saved.':'Daily review saved.'+(count?' '+count+' image(s) attached.':''),!!warning);
      refreshDayEvidenceCount(date);markReviewedDays();
    }catch(e){toast('Could not save review: '+e.message,true);}
    finally{save.disabled=false;saveReviewBusy=false;}
  }
  function markReviewedDays(){
    const reviews=read(REVIEW_KEY,{}),notes=read('dailyNotes',{});
    const cells=$('calendar-grid')?.querySelectorAll('.cal-day')||[];
    if(typeof calendarDate==='undefined')return;
    cells.forEach(el=>{
      const day=Number(el.textContent);if(!Number.isInteger(day)||day<1||day>31)return;
      const date=new Date(calendarDate.getFullYear(),calendarDate.getMonth(),day).toDateString();
      el.classList.toggle('has-review',!!reviews[date]||!!notes[date]);
      el.setAttribute('aria-label',date+(reviews[date]?' · reviewed':''));
      el.tabIndex=0;el.setAttribute('role','button');
      el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();window.selectDay(date);}};
    });
  }
  function installCalendarHooks(){
    if(typeof window.showDailyDetail==='function'){
      const original=window.showDailyDetail;
      window.showDailyDetail=function(date,data){original.apply(this,arguments);hydrateReview(date);};
    }
    if(typeof window.renderCalendar==='function'){
      const original=window.renderCalendar;
      window.renderCalendar=function(){
        original.apply(this,arguments);
        if(typeof selectedDateStr!=='undefined'&&selectedDateStr && $('daily-detail')?.classList.contains('hidden')){
          const date=new Date(selectedDateStr);
          if(!Number.isNaN(date.getTime())&&date.getFullYear()===calendarDate.getFullYear()&&date.getMonth()===calendarDate.getMonth())
            window.showDailyDetail(selectedDateStr,{pnl:0,count:0,wins:0,losses:0});
        }
        markReviewedDays();
      };
    }
    // Preserve old dailyNotes semantics; the new save includes structured review + optional images.
    window.saveDailyNote=saveReview;
  }
  function buildTradeExtras(){
    const modal=$('log-modal');if(!modal||$('gj-trade-extra'))return;
    const scroller=modal.querySelector(':scope > div > div:nth-child(2)');if(!scroller)return;
    const details=document.createElement('details');details.id='gj-trade-extra';details.className='gj-trade-extra';
    const summary=document.createElement('summary');summary.textContent='Setup, discipline and screenshots (optional)';
    const body=document.createElement('div');body.className='gj-trade-extra-body';
    const row=document.createElement('div');row.className='gj-split';
    row.append(field('Setup','gj-trade-setup',[['','Not specified'],['ob','Order block'],['fvg','Fair value gap'],['sweep','Liquidity sweep'],['structure','Structure break'],['other','Other']]),
      field('Session','gj-trade-session',[['','Not specified'],['london','London'],['newyork','New York'],['asia','Asia'],['other','Other']]));
    const discipline=document.createElement('div');discipline.className='gj-split';
    discipline.append(field('Plan followed?','gj-trade-plan',[['','Not specified'],['yes','Yes'],['partial','Partially'],['no','No']]),
      field('Execution state','gj-trade-emotion',[['','Not specified'],['focused','Focused'],['hesitant','Hesitant'],['rushed','Rushed'],['fomo','FOMO']]));
    const evidence=document.createElement('div');evidence.className='gj-evidence-picker';
    evidence.innerHTML='<div><p class="gj-section-title">Chart screenshots</p><p class="gj-evidence-meta">Attach up to 5 images · device-only evidence</p></div>';
    const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';input.id='gj-trade-images';input.setAttribute('aria-label','Attach screenshots to this trade');
    evidence.append(input);
    body.append(row,discipline);details.append(summary,body);scroller.append(details,evidence);
    // Names describe the existing calculation correctly: numeric price-distance points, not money.
    const metric=$('metric-pnl')?.parentElement?.querySelector('span:first-child');if(metric)metric.textContent='Net price points';
  }
  function filteredTrades(){
    let list=read('myTrades',[]);if(!Array.isArray(list))return [];
    if(typeof currentFilter==='undefined')return list;
    if(currentFilter==='win')list=list.filter(t=>t.result==='win');
    if(currentFilter==='loss')list=list.filter(t=>t.result==='loss');
    if(currentFilter==='buy')list=list.filter(t=>t.direction==='BUY');
    if(currentFilter==='sell')list=list.filter(t=>t.direction==='SELL');
    return list;
  }
  // Render stored trade notes as text, never HTML. Avoids unsafe interpolation in the legacy list.
  function renderEliteTrades(){
    const container=$('trades-container');if(!container)return;
    const trades=filteredTrades();container.replaceChildren();
    if(!trades.length){const blank=document.createElement('p');blank.className='text-center text-[var(--text-muted)] py-10';blank.textContent='No trades in this view. Log a trade to begin your record.';container.append(blank);return;}
    for(const trade of trades){
      const card=document.createElement('article');card.className='trade-card gj-trade-card';
      const main=document.createElement('div');main.className='gj-trade-card-main';
      const heading=document.createElement('div');heading.className='gj-row';heading.style.justifyContent='flex-start';heading.style.flexWrap='wrap';
      const symbol=document.createElement('strong');symbol.className='gj-trade-symbol';symbol.textContent=String(trade.asset||'UNKNOWN');
      const dir=document.createElement('span');dir.className='gj-pill';dir.textContent=trade.direction==='SELL'?'SELL':'BUY';dir.style.color=trade.direction==='SELL'?'var(--negative)':'var(--positive)';
      heading.append(symbol,dir);main.append(heading);
      const date=new Date(trade.id);
      const dateText=Number.isNaN(date.getTime())?'Unknown date':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
      const overview=document.createElement('p');overview.className='gj-trade-card-meta';
      overview.textContent=dateText+' · Entry '+String(trade.entry)+' · Exit '+String(trade.exit);main.append(overview);
      if(trade.notes){const note=document.createElement('p');note.className='gj-trade-note';note.textContent=String(trade.notes);main.append(note);}
      const actions=document.createElement('div');actions.className='gj-trade-card-actions';
      const screenshots=document.createElement('button');screenshots.type='button';screenshots.textContent='📎 Screenshots';screenshots.setAttribute('aria-label','View screenshots for '+String(trade.asset));
      screenshots.addEventListener('click',()=>openViewer(tradeKey(trade.id)));
      actions.append(screenshots);
      const context=trade.gj||{};
      const labels=[context.setup,context.session,context.plan?('Plan '+context.plan):''].filter(Boolean);
      if(labels.length){const label=document.createElement('span');label.className='gj-trade-meta';label.textContent=labels.join(' · ');actions.append(label);}
      main.append(actions);
      const right=document.createElement('div');right.className='gj-trade-card-right';
      const points=Number(trade.points)||0;
      const value=document.createElement('p');value.className='gj-trade-points';value.style.color=points>0?'var(--positive)':points<0?'var(--negative)':'var(--text-main)';value.textContent=(points>0?'+':'')+points.toFixed(1)+' pts';
      const remove=document.createElement('button');remove.type='button';remove.className='gj-delete-trade';remove.textContent='Delete';remove.setAttribute('aria-label','Delete trade '+String(trade.asset));remove.addEventListener('click',()=>window.deleteTrade(trade.id));
      right.append(value,remove);card.append(main,right);container.append(card);
      listEvidence(tradeKey(trade.id)).then(images=>{screenshots.textContent='📎 Screenshots ('+images.length+')';}).catch(()=>{});
    }
  }
  function decorateTradeCards(){
    const cards=$('trades-container')?.querySelectorAll('.trade-card')||[];
    const list=filteredTrades();
    cards.forEach((card,index)=>{
      const trade=list[index];if(!trade||card.querySelector('.gj-trade-card-actions'))return;
      const buttons=document.createElement('div');buttons.className='gj-trade-card-actions';
      const view=document.createElement('button');view.type='button';view.textContent='📎 Screenshots';view.setAttribute('aria-label','View screenshots for '+trade.asset);
      view.addEventListener('click',()=>openViewer(tradeKey(trade.id)));
      buttons.append(view);
      const meta=trade.gj||{};
      const values=[meta.setup,meta.session,meta.plan&&('Plan '+meta.plan)].filter(Boolean);
      if(values.length){const label=document.createElement('span');label.className='gj-trade-meta';label.textContent=values.join(' · ');buttons.append(label);}
      const first=card.firstElementChild;if(first)first.append(buttons);
      listEvidence(tradeKey(trade.id)).then(images=>{view.textContent='📎 Screenshots ('+images.length+')';}).catch(()=>{view.textContent='📎 Screenshots';});
    });
  }
  function refreshEvidenceCounts(){if(typeof window.renderTrades==='function')window.renderTrades();if(typeof selectedDateStr!=='undefined'&&selectedDateStr)refreshDayEvidenceCount(selectedDateStr);}
  function installTradeHooks(){
    // Replace only the HTML trade-list renderer; original storage and performance math remain intact.
    if(typeof window.renderTrades==='function')window.renderTrades=renderEliteTrades;
    window.filterTrades=function(type){
      if(typeof currentFilter!=='undefined')currentFilter=type;
      document.querySelectorAll('#view-trades .filter-btn').forEach(button=>{
        const active=button.getAttribute('onclick')==="filterTrades('"+type+"')";
        button.classList.toggle('active',active);
        button.classList.toggle('text-white',active);
        if(active)button.classList.remove('text-[var(--text-muted)]');else button.classList.add('text-[var(--text-muted)]');
      });
      window.renderTrades();
    };
    if(typeof window.savePersonalTrade==='function'){
      const original=window.savePersonalTrade;
      window.savePersonalTrade=async function(){
        if(saveTradeBusy)return;saveTradeBusy=true;
        const pre=new Set((read('myTrades',[])||[]).map(t=>t.id));
        const meta={setup:$('gj-trade-setup')?.value||'',session:$('gj-trade-session')?.value||'',plan:$('gj-trade-plan')?.value||'',emotion:$('gj-trade-emotion')?.value||''};
        const files=Array.from($('gj-trade-images')?.files||[]);
        try{
          original.apply(this,arguments);
          const trades=read('myTrades',[]);
          const created=Array.isArray(trades)?trades.find(t=>!pre.has(t.id)):null;
          if(!created)return;
          if(Object.values(meta).some(Boolean)){
            created.gj=meta;
            localStorage.setItem('myTrades',JSON.stringify(trades));
          }
          if(files.length){try{await addScreenshots(tradeKey(created.id),files);toast('Trade logged with '+files.length+' screenshot(s).');}
            catch(e){toast('Trade logged; screenshot not saved: '+e.message,true);}}
          else toast('Trade recorded. Review your execution after the session.');
          if($('gj-trade-images'))$('gj-trade-images').value='';
          for(const key of ['gj-trade-setup','gj-trade-session','gj-trade-plan','gj-trade-emotion'])if($(key))$(key).value='';
          if($('gj-trade-extra'))$('gj-trade-extra').open=false;
          window.renderTrades();
        }catch(e){toast('Trade could not be saved: '+e.message,true);}
        finally{saveTradeBusy=false;}
      };
    }
    if(typeof window.deleteTrade==='function'){
      const original=window.deleteTrade;
      window.deleteTrade=function(id){
        const before=(read('myTrades',[])||[]).some(t=>t.id===id);
        original.apply(this,arguments);
        const after=(read('myTrades',[])||[]).some(t=>t.id===id);
        if(before&&!after)deleteEvidenceOwner(tradeKey(id)).catch(e=>toast('Trade removed, but image cleanup failed: '+e.message,true));
      };
    }
    window.clearJournal=async function(){
      if(!confirm('Permanently delete ALL local trades, daily reviews, notes and screenshots on this browser? Export a backup first.'))return;
      try{
        localStorage.removeItem('myTrades');localStorage.removeItem('dailyNotes');localStorage.removeItem(REVIEW_KEY);
        await writeEvidence([],true);
        window.renderDashboard();window.renderTrades();window.renderCalendar();toast('Local journal cleared.');
      }catch(e){toast('Clear failed: '+e.message,true);}
    };
  }
  function fileToDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
  function downloadFile(name,blob){
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function exportBackup(){
    const button=$('gj-backup-export');button.disabled=true;
    try{
      const images=await listEvidence();
      const evidence=[];
      for(const image of images)evidence.push({id:image.id,owner:image.owner,name:image.name,created:image.created,width:image.width,height:image.height,data:await fileToDataURL(image.blob)});
      const backup={format:'gongola-journal-backup',version:2,exportedAt:new Date().toISOString(),
        myTrades:read('myTrades',[]),dailyNotes:read('dailyNotes',{}),journalSettings:read('journalSettings',{}),
        dailyReviews:read(REVIEW_KEY,{}),appearance:localStorage.getItem(APPEARANCE_KEY)||'obsidian',images:evidence};
      const name='gongola-journal-backup-'+new Date().toISOString().slice(0,10)+'.json';
      downloadFile(name,new Blob([JSON.stringify(backup)],{type:'application/json'}));
      toast('Backup exported with '+evidence.length+' screenshot(s). Keep it somewhere safe.');
    }catch(e){toast('Backup could not be created: '+e.message,true);}
    finally{button.disabled=false;}
  }
  async function importBackup(file){
    if(!file)return;
    try{
      if(file.size>100*1024*1024)throw new Error('Backup exceeds 100 MB.');
      const backup=JSON.parse(await file.text());
      if(backup.format!=='gongola-journal-backup'||backup.version!==2 || !Array.isArray(backup.myTrades) || !Array.isArray(backup.images) || typeof backup.dailyNotes!=='object'||!backup.dailyNotes || Array.isArray(backup.dailyNotes) || typeof backup.dailyReviews!=='object'||!backup.dailyReviews || Array.isArray(backup.dailyReviews) ||typeof backup.journalSettings!=='object'||!backup.journalSettings ||Array.isArray(backup.journalSettings))throw new Error('This is not a valid Gongola Journal v2 backup.');
      if(backup.images.length>500)throw new Error('Backup has too many images.');
      if(backup.myTrades.some(t=>!t||!Number.isFinite(Number(t.id))||!Number.isFinite(Number(t.entry))||!Number.isFinite(Number(t.exit))||!Number.isFinite(Number(t.points))||typeof t.asset!=='string'||!['BUY','SELL'].includes(t.direction)||!['win','loss','even'].includes(t.result)))throw new Error('Backup contains invalid trade records.');
      const records=[];
      for(const item of backup.images){
        if(typeof item.id!=='string'||typeof item.owner!=='string'||typeof item.data!=='string'||!/^data:image\/(webp|png|jpeg);base64,/.test(item.data))throw new Error('Backup contains an unsupported image.');
        const response=await fetch(item.data);const blob=await response.blob();
        if(blob.size>MAX_IMAGE_BYTES)throw new Error('Backup image exceeds allowed size.');
        records.push({id:item.id,owner:item.owner,name:String(item.name||'Screenshot').slice(0,120),created:Number(item.created)||Date.now(),width:Number(item.width)||0,height:Number(item.height)||0,blob});
      }
      if(!confirm('Restore this backup? It will REPLACE trades, notes, reviews, settings and screenshots stored in this browser. Cancel if you have not exported your current journal.'))return;
      const keys=['myTrades','dailyNotes','journalSettings',REVIEW_KEY,APPEARANCE_KEY];
      const previous=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
      const oldImages=await listEvidence();
      try{
        localStorage.setItem('myTrades',JSON.stringify(backup.myTrades));
        localStorage.setItem('dailyNotes',JSON.stringify(backup.dailyNotes));
        localStorage.setItem('journalSettings',JSON.stringify(backup.journalSettings));
        localStorage.setItem(REVIEW_KEY,JSON.stringify(backup.dailyReviews));
        localStorage.setItem(APPEARANCE_KEY,['obsidian','midnight','slate'].includes(backup.appearance)?backup.appearance:'obsidian');
        await writeEvidence(records,true);
      }catch(error){
        for(const k of keys){try{if(previous[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,previous[k]);}catch{}}
        try{await writeEvidence(oldImages,true);}catch{}
        throw error;
      }
      if(typeof window.switchView==='function')window.switchView('dashboard');
      if(typeof window.loadSettings==='function')window.loadSettings();
      if(typeof window.renderCalendar==='function')window.renderCalendar();
      if(typeof window.renderTrades==='function')window.renderTrades();
      if(typeof window.renderDashboard==='function')window.renderDashboard();
      if(typeof window.gjSetTheme==='function')window.gjSetTheme(backup.appearance);
      toast('Backup restored. '+records.length+' screenshot(s) available.');
    }catch(e){toast('Restore failed: '+e.message,true);}
    finally{if($('gj-backup-import'))$('gj-backup-import').value='';}
  }
  function buildBackupPanel(){
    const settings=$('view-settings');if(!settings||$('gj-backup-panel'))return;
    const wrap=document.createElement('section');wrap.id='gj-backup-panel';wrap.className='gj-workflow-card gj-backup-bar';
    wrap.innerHTML='<div><p class="gj-eyebrow">Data custody</p><h2 class="gj-section-title" style="margin-top:4px">Private journal backup</h2><p class="gj-subtext" style="margin-top:6px">Trades, reviews and screenshots are stored locally in this browser. Supabase login does not synchronize these personal journal records. Export regularly—clearing browser data or switching phones can erase local records.</p></div>';
    const actions=document.createElement('div');actions.className='gj-backup-actions';
    const exp=document.createElement('button');exp.type='button';exp.id='gj-backup-export';exp.className='gj-btn gj-btn--primary';exp.textContent='Export full backup';exp.addEventListener('click',exportBackup);
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.id='gj-backup-import';input.setAttribute('aria-label','Select Gongola backup to restore');input.addEventListener('change',e=>importBackup(e.target.files?.[0]));
    actions.append(exp,input);wrap.append(actions);
    settings.append(wrap);
  }
  function init(){
    buildTodayBar();buildReviewForm();buildTradeExtras();buildBackupPanel();
    installCalendarHooks();installTradeHooks();
    if(typeof window.renderCalendar==='function')window.renderCalendar();
    if(typeof window.renderTrades==='function')window.renderTrades();
    if(typeof window.renderDashboard==='function')window.renderDashboard();
    const metric=$('metric-pnl')?.parentElement?.querySelector('span:first-child');if(metric)metric.textContent='Net price points';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
