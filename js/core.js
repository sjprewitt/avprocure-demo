// ═══════════════════════════════════════════════
// HTML ESCAPING — wrap any DB/user-sourced string before it goes into an
// innerHTML template. Escapes both element-text and quoted-attribute contexts.
// Do NOT wrap values that are intentionally HTML (e.g. *Badge() helpers) or
// already-built markup fragments.
// NB: named escHtml (not esc) — several render functions declare a LOCAL
// `const esc` regex/quote-escaper that would otherwise shadow this.
// ═══════════════════════════════════════════════
function escHtml(v){
  return String(v ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function setDirty(d){
  isDirty=d;
  _dbUpdateBadge();
}

// ═══════════════════════════════════════════════
// DB HELPERS — fire-and-forget API persistence
// ═══════════════════════════════════════════════
const _PK = {
  catalog:'sku', inventory:'id', projects:'id', projectItems:'id',
  orders:'poNumber', orderItems:'id', rmas:'rmaId', locations:'id', transfers:'id'
};

let _dbPending = 0;

function _dbUpdateBadge(){
  const badge=document.getElementById('unsaved-badge');
  const text=document.getElementById('unsaved-text');
  const pulse=badge.querySelector('.pulse');
  if(_dbPending>0){
    text.textContent='Saving…';
    badge.style.color='var(--text-muted)';
    badge.style.background='rgba(120,120,140,0.08)';
    badge.style.borderColor='rgba(120,120,140,0.2)';
    pulse.style.display='block';
  } else if(isDirty){
    text.textContent='Unsaved changes';
    badge.style.color='var(--warn)';
    badge.style.background='rgba(247,201,79,0.08)';
    badge.style.borderColor='rgba(247,201,79,0.2)';
    pulse.style.display='block';
  } else {
    text.textContent='Saved ✓';
    badge.style.color='var(--accent3)';
    badge.style.background='rgba(79,247,160,0.08)';
    badge.style.borderColor='rgba(79,247,160,0.2)';
    pulse.style.display='none';
  }
}

function _dbDone(){
  if(--_dbPending<=0){ _dbPending=0; isDirty=false; }
  _dbUpdateBadge();
}

function _dbFail(msg){
  if(--_dbPending<0) _dbPending=0;
  _dbUpdateBadge(); // isDirty stays true → "Unsaved changes"
  console.error(msg); toast('DB write failed','error');
}
// ── Session expiry recovery ───────────────────────────────────────────────────
let _sessionExpiredShown=false;
let _reauthPopup=null;
// Queue of {type:'save',entity,record} or {type:'delete',entity,id} for retry after reauth
const _failedQueue=[];

function _showSessionExpired(){
  if(_sessionExpiredShown) return;
  _sessionExpiredShown=true;
  const banner=document.createElement('div');
  banner.id='session-expired-banner';
  banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:var(--accent4);color:#fff;text-align:center;padding:10px 16px;font-family:var(--font-ui);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
  banner.innerHTML='⚠ Session expired — your edits are queued and will be saved once you sign back in. <button onclick="_openReauthPopup()" style="background:#fff;color:var(--accent4);border:none;border-radius:4px;padding:4px 14px;cursor:pointer;font-weight:700;font-size:13px;">Sign In</button>';
  document.body.prepend(banner);
  // Listen for auth:ok from the popup
  window.addEventListener('message', function _onAuthOk(e){
    if(e.origin!==window.location.origin) return;
    if(e.data && e.data.type==='auth:ok'){
      window.removeEventListener('message',_onAuthOk);
      _reauthPopup=null;
      _retryFailedQueue();
    }
  });
}

function _openReauthPopup(){
  const w=420, h=400;
  const left=Math.round(window.screenX+(window.outerWidth-w)/2);
  const top=Math.round(window.screenY+(window.outerHeight-h)/2);
  if(_reauthPopup && !_reauthPopup.closed){ _reauthPopup.focus(); return; }
  _reauthPopup=window.open('./gate.php?reauth','avp_reauth',`width=${w},height=${h},left=${left},top=${top},resizable=yes`);
  if(!_reauthPopup){
    // Popup blocked — fall back to a redirect warning
    toast('Pop-up blocked. Click OK to reload (changes will be lost).','error');
    if(confirm('Your session has expired.\n\nClick OK to reload and log back in (unsaved changes will be lost), or Cancel to stay.'))
      location.reload();
  }
}

function _retryFailedQueue(){
  const banner=document.getElementById('session-expired-banner');
  if(banner) banner.remove();
  _sessionExpiredShown=false;
  if(!_failedQueue.length){ toast('Signed in','success'); return; }
  const n=_failedQueue.length;
  let done=0, failed=0;
  const check=()=>{ done++; if(done===n){ if(failed) toast(`${failed} write(s) still failed`,'error'); else toast(`${n} queued write(s) saved`,'success'); } };
  while(_failedQueue.length){
    const item=_failedQueue.shift();
    if(item.type==='save'){
      _dbPending++; _dbUpdateBadge();
      fetch(`api/${item.entity}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.record)})
        .then(r=>{ if(!r.ok) throw new Error(); _dbDone(); check(); })
        .catch(()=>{ _dbFail(`retry save ${item.entity}`); failed++; check(); });
    } else {
      _dbPending++; _dbUpdateBadge();
      fetch(`api/${item.entity}/${encodeURIComponent(item.id)}`,{method:'DELETE'})
        .then(r=>{ if(!r.ok) throw new Error(); _dbDone(); check(); })
        .catch(()=>{ _dbFail(`retry delete ${item.entity}`); failed++; check(); });
    }
  }
}

function dbSave(entity, record){
  _dbPending++; _dbUpdateBadge();
  fetch(`api/${entity}`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(record)
  }).then(r=>{
    if(r.status===401){
      _dbFail(`[DB] save ${entity}: session expired`);
      _failedQueue.push({type:'save',entity,record:Object.assign({},record)});
      _showSessionExpired(); return;
    }
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    _dbDone();
  }).catch(err=>{ _dbFail(`[DB] save ${entity}: ${err}`); });
}

function dbSaveMany(entity, records){ records.forEach(r=>dbSave(entity, r)); }

function dbDelete(entity, id){
  _dbPending++; _dbUpdateBadge();
  fetch(`api/${entity}/${encodeURIComponent(id)}`, {method:'DELETE'})
    .then(r=>{
      if(r.status===401){
        _dbFail(`[DB] delete ${entity}: session expired`);
        _failedQueue.push({type:'delete',entity,id});
        _showSessionExpired(); return;
      }
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      _dbDone();
    }).catch(err=>{ _dbFail(`[DB] delete ${entity}/${id}: ${err}`); });
}

function dbDeleteMany(entity, ids){ ids.forEach(id=>dbDelete(entity, id)); }

// ═══════════════════════════════════════════════
// PAGE NAV
// ═══════════════════════════════════════════════
function toggleNavDrawer(){
  const open=document.querySelector('.topbar-center').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('open',open);
}
function closeNavDrawer(){
  document.querySelector('.topbar-center').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('open');
}

// Pages whose bottom-nav button lives in the "More" dropup
const _bnMorePages=new Set(['pb','rma','loc','proj']);

function showPage(p){
  closeNavDrawer();
  closeMobileAddSheet();
  closeBnMore();
  closeTopbarActions();
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab,.bn-tab').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.bn-more-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.getElementById('tab-'+p)?.classList.add('active');
  if(_bnMorePages.has(p)){
    // Highlight the "More" tab itself, plus the specific item in the panel
    document.getElementById('bn-more')?.classList.add('active');
    document.getElementById('bn-'+p)?.classList.add('active');
  } else {
    document.getElementById('bn-'+p)?.classList.add('active');
  }
  const fab=document.getElementById('mobile-fab');
  if(fab) fab.style.display=document.querySelector('#page-'+p+' .add-bar')?'':'none';
}

function toggleBnMore(){
  const panel=document.getElementById('bn-more-panel');
  const backdrop=document.getElementById('bn-more-backdrop');
  const fab=document.getElementById('mobile-fab');
  const icon=document.getElementById('bn-more-icon');
  const opening=!panel.classList.contains('open');
  panel.classList.toggle('open',opening);
  backdrop.classList.toggle('open',opening);
  icon.textContent=opening?'✕':'≡';
  if(fab) fab.classList.toggle('bn-hidden',opening);
}

function closeBnMore(){
  document.getElementById('bn-more-panel')?.classList.remove('open');
  document.getElementById('bn-more-backdrop')?.classList.remove('open');
  const icon=document.getElementById('bn-more-icon');
  if(icon) icon.textContent='≡';
  const fab=document.getElementById('mobile-fab');
  if(fab) fab.classList.remove('bn-hidden');
}

function toggleTopbarActions(){
  const panel=document.getElementById('topbar-actions-panel');
  const backdrop=document.getElementById('topbar-actions-backdrop');
  const opening=!panel.classList.contains('open');
  panel.classList.toggle('open',opening);
  backdrop.classList.toggle('open',opening);
}

function closeTopbarActions(){
  document.getElementById('topbar-actions-panel')?.classList.remove('open');
  document.getElementById('topbar-actions-backdrop')?.classList.remove('open');
}

function toggleMobileAddSheet(){
  const bar=[...document.querySelectorAll('.page.active .add-bar')].find(el=>{
    for(let p=el.parentElement;p&&!p.classList.contains('page');p=p.parentElement){
      if(getComputedStyle(p).display==='none') return false;
    }
    return true;
  });
  if(!bar) return;
  const opening=!bar.classList.contains('open');
  bar.classList.toggle('open',opening);
  document.getElementById('mobile-fab').classList.toggle('open',opening);
  document.getElementById('add-sheet-backdrop').classList.toggle('open',opening);
  if(opening && !scanModeActive) _applyFilterHintsToForm();
}

function closeMobileAddSheet(){
  document.querySelectorAll('.add-bar.open').forEach(el=>el.classList.remove('open'));
  const fab=document.getElementById('mobile-fab');
  if(fab) fab.classList.remove('open');
  const bd=document.getElementById('add-sheet-backdrop');
  if(bd) bd.classList.remove('open');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE (context-aware: inv or pb)
// ═══════════════════════════════════════════════
function acOpen(ctx,field){
  if(ctx==='inv'&&field==='model'&&!acCtx.inv.mfg.selected) return;
  if(ctx==='item'&&field==='model'&&!acCtx.item.mfg.selected) return;
  if(ctx==='poi'&&field==='model'&&!acCtx.poi.mfg.selected) return;
  if(ctx==='npo'&&field==='model'&&!acCtx.npo.mfg.selected) return;
  if(ctx==='si'&&field==='model'&&!acCtx.si.mfg.selected) return;
  if(ctx==='editpoi'&&field==='model'&&!acCtx.editpoi.mfg.selected) return;
  if(ctx==='rma'&&field==='model'&&!acCtx.rma.mfg.selected) return;
  acFilter(ctx,field);
}

// Project autocomplete options — matched and sorted by Client · Location context
// as well as by name, so duplicate project names (Unallocated, Main, Theater…)
// are grouped predictably and every row carries its context. Rows carry the
// project id (data-pid) so selection resolves exactly, never by ambiguous name.
function _acProjOpts(q){
  return projects.map(p=>({p, pctx:(typeof _xfrProjCtx==='function')?_xfrProjCtx(p):''}))
    .filter(o=> !q || (o.p.name||'').toLowerCase().includes(q) || o.pctx.toLowerCase().includes(q))
    .sort((a,b)=> a.pctx.localeCompare(b.pctx,undefined,{sensitivity:'base'})
               || (a.p.name||'').localeCompare(b.p.name||''));
}

function acFilter(ctx,field){
  const prefix = ctx==='inv'?'inv':ctx==='item'?'item':ctx==='poi'?'poi':ctx==='po'?'po':ctx==='npo'?'npo':ctx==='rma'?'rma':ctx==='si'?'si':ctx==='editpoi'?'edit-poi':ctx==='editpo'?'edit-po':'pb';
  const inp=document.getElementById(`${prefix}-${field}`);
  const dd =document.getElementById(`dd-${ctx}-${field}`);
  if(!inp||!dd) return;
  const q=inp.value.trim().toLowerCase();
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let options=[];

  if(ctx==='inv'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else if(field==='cat') options=Object.keys(CAT_CODES).filter(c=>!q||c.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.inv.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='item'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.item.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='poi'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.poi.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='npo'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.npo.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='si'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.si.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='editpoi'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else options=(modelsByMfg[acCtx.editpoi.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
  } else if(ctx==='editpo'){
    if(field==='project') options=_acProjOpts(q);
  } else if(ctx==='rma'){
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else if(field==='model') options=(modelsByMfg[acCtx.rma.mfg.selected]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
    else if(field==='project') options=_acProjOpts(q);
  } else if(ctx==='po'){
    if(field==='project') options=_acProjOpts(q);
  } else {
    if(field==='mfg') options=manufacturers.filter(m=>!q||m.toLowerCase().includes(q));
    else if(field==='cat') options=categories.filter(c=>!q||c.toLowerCase().includes(q));
    else if(field==='model'){
      const mfg=document.getElementById('pb-mfg').value.trim();
      options=(modelsByMfg[mfg]||[]).filter(m=>!q||m.model.toLowerCase().includes(q));
    }
  }

  acCtx[ctx][field].focusIdx=-1;
  const hiHtml=safe=>q?safe.replace(new RegExp(`(${esc(q)})`,'gi'),'<mark>$1</mark>'):safe;
  dd.innerHTML=!options.length?`<div class="ac-empty">No matches${ctx==='pb'&&(field==='mfg'||field==='cat')?' — will create new':''}</div>`
    :field==='project'?options.map(({p,pctx})=>
        `<div class="ac-option" data-val="${escHtml(p.name||'')}" data-pid="${escHtml(p.id)}"
          onmousedown="acSelectCtx(event,'${ctx}','${field}')" style="white-space:normal;line-height:1.3;">
          <div style="font-weight:600;">${hiHtml(escHtml(p.name||'(unnamed)'))}</div>
          ${pctx?`<div style="font-size:11px;color:var(--text-dim);">${hiHtml(escHtml(pctx))}</div>`:''}
        </div>`).join('')
    :options.map((opt,i)=>{
        const label=typeof opt==='string'?opt:(opt.model||opt.name||'');
        const display=opt.id?opt.name:label;
        const safe=escHtml(display);
        const hi=q?safe.replace(new RegExp(`(${esc(q)})`,'gi'),'<mark>$1</mark>'):safe;
        return `<div class="ac-option" data-val="${escHtml(label)}"
          onmousedown="acSelectCtx(event,'${ctx}','${field}')">${hi}</div>`;
      }).join('');
  dd.classList.add('open');
  document.querySelectorAll(`[id^="dd-${ctx}-"]`).forEach(d=>{if(d.id!==`dd-${ctx}-${field}`)d.classList.remove('open');});
}

function acSelectCtx(e,ctx,field){e.preventDefault();acDoSelect(ctx,field,e.currentTarget.dataset.val,e.currentTarget.dataset.pid);}

function acDoSelect(ctx,field,val,pid){
  const prefix = ctx==='inv'?'inv':ctx==='item'?'item':ctx==='poi'?'poi':ctx==='po'?'po':ctx==='npo'?'npo':ctx==='rma'?'rma':ctx==='si'?'si':ctx==='editpoi'?'edit-poi':ctx==='editpo'?'edit-po':'pb';
  const inp=document.getElementById(`${prefix}-${field}`);
  const dd =document.getElementById(`dd-${ctx}-${field}`);
  inp.value=val; dd.classList.remove('open');
  acCtx[ctx][field].selected=val;
  // Project rows carry their id, so a duplicate name resolves to the right project.
  if(field==='project'&&pid) acCtx[ctx][field].selected=pid;

  if(ctx==='inv'){
    if(field==='mfg'){
      acCtx.inv.model.selected=null;
      acCtx.inv.cat.selected=null;
      const mi=document.getElementById('inv-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('inv-sku').value='';
      _invCatClear();
      invCheckReady();
      setTimeout(()=>{mi.focus();acFilter('inv','model');},50);
    } else if(field==='cat'){
      acCtx.inv.cat.selected=val;
    } else { // model
      const entry=(modelsByMfg[acCtx.inv.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('inv-sku').value=entry?entry.sku:'';
      _invCatSet(entry?entry.category:null);
      invCheckReady();
      setTimeout(()=>document.getElementById(invType==='serialized'?'inv-serial':'inv-qty').focus(),50);
    }
  } else if(ctx==='item'){
    if(field==='mfg'){
      acCtx.item.model.selected=null;
      const mi=document.getElementById('item-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('item-sku').value='';
      document.getElementById('item-price').value='';
      itemCheckReady();
      setTimeout(()=>{mi.focus();acFilter('item','model');},50);
    } else {
      const entry=(modelsByMfg[acCtx.item.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('item-sku').value=entry?entry.sku:'';
      // Auto-fill unit cost from pricebook
      if(entry){
        const pb=catalog.find(r=>r.sku===entry.sku);
        if(pb&&pb.unitCost) document.getElementById('item-price').value=pb.unitCost;
      }
      itemCheckReady();
      setTimeout(()=>document.getElementById('item-qty').focus(),50);
    }
  } else if(ctx==='poi'){
    if(field==='mfg'){
      acCtx.poi.model.selected=null;
      const mi=document.getElementById('poi-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('poi-sku').value='';
      document.getElementById('poi-price').value='';
      poiCheckReady();
      setTimeout(()=>{mi.focus();acFilter('poi','model');},50);
    } else {
      const entry=(modelsByMfg[acCtx.poi.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('poi-sku').value=entry?entry.sku:'';
      if(entry){ const pb=catalog.find(r=>r.sku===entry.sku); if(pb&&pb.unitCost) document.getElementById('poi-price').value=pb.unitCost; }
      poiCheckReady();
      setTimeout(()=>document.getElementById('poi-qty').focus(),50);
    }
  } else if(ctx==='npo'){
    if(field==='mfg'){
      acCtx.npo.model.selected=null;
      const mi=document.getElementById('npo-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('npo-sku').value='';
      document.getElementById('npo-price').value='';
      document.getElementById('npo-add-pb').disabled=true;
      setTimeout(()=>{mi.focus();acFilter('npo','model');},50);
    } else {
      const entry=(modelsByMfg[acCtx.npo.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('npo-sku').value=entry?entry.sku:'';
      if(entry){ const pb=catalog.find(r=>r.sku===entry.sku); if(pb&&pb.unitCost) document.getElementById('npo-price').value=pb.unitCost; }
      document.getElementById('npo-add-pb').disabled=false;
      setTimeout(()=>document.getElementById('npo-qty').focus(),50);
    }
  } else if(ctx==='editpoi'){
    if(field==='mfg'){
      acCtx.editpoi.model.selected=null;
      const mi=document.getElementById('edit-poi-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('edit-poi-sku').value='';
      setTimeout(()=>{mi.focus();acFilter('editpoi','model');},50);
    } else {
      const entry=(modelsByMfg[acCtx.editpoi.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('edit-poi-sku').value=entry?entry.sku:'';
    }
  } else if(ctx==='editpo'){
    if(field==='project'){
      const proj=(pid&&projects.find(p=>p.id===pid))||projects.find(p=>p.name===val||p.id===val);
      if(proj){ acCtx.editpo.project.selected=proj.id; document.getElementById('edit-po-project').value=proj.name; }
    }
  } else if(ctx==='si'){
    if(field==='mfg'){
      acCtx.si.model.selected=null;
      const mi=document.getElementById('si-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('si-sku').value='';
      document.getElementById('si-cost').value='';
      document.getElementById('si-price').value='';
      siCheckReady();
      setTimeout(()=>{mi.focus();acFilter('si','model');},50);
    } else {
      const entry=(modelsByMfg[acCtx.si.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('si-sku').value=entry?entry.sku:'';
      if(entry){
        const pb=catalog.find(r=>r.sku===entry.sku);
        if(pb){
          if(pb.unitCost) document.getElementById('si-cost').value=parseFloat(pb.unitCost).toFixed(2);
          const price=pb.unitPrice||pb.msrp||0;
          if(price) document.getElementById('si-price').value=parseFloat(price).toFixed(2);
        }
      }
      siCheckReady();
      setTimeout(()=>document.getElementById('si-qty').focus(),50);
    }
  } else if(ctx==='rma'){
    if(field==='mfg'){
      acCtx.rma.model.selected=null;
      const mi=document.getElementById('rma-model');
      mi.value=''; mi.disabled=false; mi.placeholder='Type to search…';
      document.getElementById('rma-sku').value='';
      rmaCheckReady();
      setTimeout(()=>{mi.focus();acFilter('rma','model');},50);
    } else if(field==='model'){
      const entry=(modelsByMfg[acCtx.rma.mfg.selected]||[]).find(m=>m.model===val);
      document.getElementById('rma-sku').value=entry?entry.sku:'';
      rmaCheckReady();
      setTimeout(()=>document.getElementById('rma-qty').focus(),50);
    } else if(field==='project'){
      // project autocomplete — val is project name, find ID
      const proj=(pid&&projects.find(p=>p.id===pid))||projects.find(p=>p.name===val||p.id===val);
      if(proj){ acCtx.rma.project.selected=proj.id; document.getElementById('rma-project').value=proj.name; }
    }
  } else if(ctx==='pb'){
    if(field==='mfg'){
      // Reset model when manufacturer changes
      document.getElementById('pb-model').value='';
      acCtx.pb.model.selected=null;
      pbGenerateSKU();
    } else if(field==='cat'){
      pbGenerateSKU();
    } else if(field==='model'){
      // Free text — just commit whatever was typed/selected
    }
    pbCheckReady();
  }
}

function acKey(e,ctx,field){
  const dd=document.getElementById(`dd-${ctx}-${field}`);
  const opts=dd.querySelectorAll('.ac-option');
  let idx=acCtx[ctx][field].focusIdx;
  if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,opts.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(idx-1,0);}
  else if(e.key==='Enter'){
    e.preventDefault();
    const t=idx>=0&&opts[idx]?opts[idx]:opts.length===1?opts[0]:null;
    if(t) acDoSelect(ctx,field,t.dataset.val,t.dataset.pid);
    else if(ctx==='pb'&&(field==='mfg'||field==='cat'||field==='model')){
      const v=document.getElementById(`pb-${field}`).value.trim();
      if(v){acCtx.pb[field].selected=v;if(field!=='model')pbGenerateSKU();pbCheckReady();}
      dd.classList.remove('open');
    }
    return;
  }
  else if(e.key==='Escape'||e.key==='Tab'){
    if(e.key==='Tab'){
      const t=idx>=0&&opts[idx]?opts[idx]:opts.length===1?opts[0]:null;
      if(t){
        e.preventDefault();
        acDoSelect(ctx,field,t.dataset.val,t.dataset.pid);
        if(ctx==='pb'){
          const nextId={mfg:'pb-model',model:'pb-cat',cat:'pb-sub'}[field];
          if(nextId) setTimeout(()=>document.getElementById(nextId).focus(),50);
        }
        return;
      }
    }
    // For PB free-text fields, commit what's typed
    if(ctx==='pb'&&(field==='mfg'||field==='cat'||field==='model')){
      const v=document.getElementById(`pb-${field}`).value.trim();
      if(v){acCtx.pb[field].selected=v;if(field!=='model')pbGenerateSKU();pbCheckReady();}
    }
    dd.classList.remove('open');
    return;
  }
  else return;
  acCtx[ctx][field].focusIdx=idx;
  opts.forEach((o,i)=>o.classList.toggle('focused',i===idx));
  if(opts[idx])opts[idx].scrollIntoView({block:'nearest'});
}

document.addEventListener('click',e=>{
  // Qty buttons
  const qBtn=e.target.closest('.qty-btn');
  if(qBtn){
    e.stopPropagation();
    const id=qBtn.dataset.id, delta=parseInt(qBtn.dataset.delta);
    if(id&&!isNaN(delta)) adjustQty(id,delta);
    return;
  }
  // Delete buttons
  const dBtn=e.target.closest('.btn-del[data-del]');
  if(dBtn){
    e.stopPropagation();
    deleteInvItem(dBtn.dataset.del);
    return;
  }
  // Group row toggle (inventory)
  const gRow=e.target.closest('.group-row[data-gkey]');
  if(gRow){
    const key=gRow.dataset.gkey;
    if(key.startsWith('po-')) openOrder(key.replace('po-',''));
    else if(projects.find(p=>p.id===key)){ projNavSource='proj'; openProject(key); }
    else if(window.matchMedia('(max-width:768px)').matches) openInvModal(key);
    else toggleGroup(key);
    return;
  }
  const dProj=e.target.closest('[data-del-proj]');
  if(dProj){ deleteProject(dProj.dataset.delProj); return; }
  const dPO=e.target.closest('[data-del-po]');
  if(dPO){ deleteOrder(dPO.dataset.delPo); return; }
  // Close autocomplete dropdowns
  if(!e.target.closest('.ac-wrap')) document.querySelectorAll('.ac-dropdown').forEach(d=>d.classList.remove('open'));
  // Close pricebook prompt dropdown on outside click
  if(!e.target.closest('#pb-prompt-inner')) document.getElementById('dd-pbp-cat')?.classList.remove('open');
  // Commit PB free-text on outside click
  ['mfg','cat','model'].forEach(f=>{
    const inp=document.getElementById(`pb-${f}`);
    if(inp&&!e.target.closest('.ac-wrap')){
      const v=inp.value.trim();
      if(v&&!acCtx.pb[f].selected){acCtx.pb[f].selected=v;if(f!=='model')pbGenerateSKU();pbCheckReady();}
    }
  });
});


let _tt;
function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='show '+type;
  clearTimeout(_tt); _tt=setTimeout(()=>el.className='',3000);
}

// ═══════════════════════════════════════════════
// AUTOLOAD — SQLite via API
// ═══════════════════════════════════════════════
async function fetchAllData(){
  try{
    const res = await fetch('api/data');
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    // Populate global arrays
    catalog      = d.catalog      || [];
    inventory    = d.inventory    || [];
    projects     = d.projects     || [];
    projectItems = d.projectItems || [];
    orders       = d.orders       || [];
    orders.forEach(o=>{ try{ o.otherCharges=JSON.parse(o.otherCharges||'[]'); }catch(e){ o.otherCharges=[]; } });
    orderItems   = d.orderItems   || [];
    rmas         = d.rmas         || [];
    locations    = d.locations    || [];
    transfers    = d.transfers    || [];
    invoices        = d.invoices        || [];
    invoiceItems    = d.invoiceItems    || [];
    invoicePayments = d.invoicePayments || [];
    vendorBills        = d.vendorBills        || [];
    vendorBillItems    = d.vendorBillItems    || [];
    vendorBillPayments = d.vendorBillPayments || [];
    clients = d.clients || [];
    clientLocations = d.clientLocations || [];
    vendors = d.vendors || [];
    shipments     = d.shipments     || [];
    shipmentItems = d.shipmentItems || [];
    deployments     = d.deployments     || [];
    deploymentItems = d.deploymentItems || [];
    deployCarts     = d.deployCarts     || [];
    deployCarts.forEach(c=>{ try{ c.items=JSON.parse(c.items||'[]'); }catch(e){ c.items=[]; } });
    if (typeof loadDeployCart === 'function') loadDeployCart();
    populateProjClientSelects();
    if(typeof populateAllVendorSelects==='function') populateAllVendorSelects();

    // Rebuild derived lookup structures (same as parseWorkbookData)
    const mfgSet=new Set(), catSet=new Set();
    modelsByMfg={};
    for(const r of catalog){
      mfgSet.add(r.manufacturer); catSet.add(r.category);
      if(!modelsByMfg[r.manufacturer]) modelsByMfg[r.manufacturer]=[];
      modelsByMfg[r.manufacturer].push({model:r.model,sku:r.sku,category:r.category});
    }
    Object.values(modelsByMfg).forEach(arr=>arr.sort((a,b)=>a.model.localeCompare(b.model)));
    manufacturers=[...mfgSet].sort((a,b)=>a.localeCompare(b));
    categories=[...catSet].filter(Boolean).sort((a,b)=>a.localeCompare(b));
    warehouses=locations.filter(l=>l.tierIndex===0||l.tierIndex==='0');

    document.getElementById('status-dot').classList.add('ready');
    document.getElementById('status-text').textContent='SQLite';
    document.getElementById('catalog-stats').textContent=
      `${catalog.length.toLocaleString()} products · ${manufacturers.length} manufacturers`;
    document.getElementById('po-date').valueAsDate=new Date();
    document.getElementById('rma-date').valueAsDate=new Date();

    setDirty(false); updateInvStats(); renderInvTable(); renderPBTable(); updatePBStats();
    renderProjTable(); updateProjStats(); generateNextProjId();
    renderOrdersTable(); updateOrdersStats();
    renderRMATable(); updateRMAStats();
    renderStockTable(); renderLocPage();
    renderFDPage();
    renderFDClientsTable();

    toast(`Loaded — ${catalog.length.toLocaleString()} products, ${inventory.length} inventory items, ${projects.length} projects, ${orders.length} orders, ${rmas.length} RMAs`,'success');
  } catch(err){
    console.warn('[AVProcure] SQLite load failed, falling back to xlsx:', err.message);
    // Fall back to xlsx autoload
    const AUTOLOAD_FILENAME = 'avprocure-export.xlsx';
    const base = window.location.href.replace(/\/[^/?#]*(\?.*)?$/, '/');
    fetch(base + AUTOLOAD_FILENAME)
      .then(res=>{ if(!res.ok) throw new Error(`HTTP ${res.status}`); return res.arrayBuffer(); })
      .then(buf=>{
        const bytes=new Uint8Array(buf);
        let binary='';
        for(let i=0;i<bytes.byteLength;i++) binary+=String.fromCharCode(bytes[i]);
        workbookData=binary; workbookName=AUTOLOAD_FILENAME;
        parseWorkbookData(workbookData, workbookName);
      })
      .catch(err2=>console.info('[AVProcure] Autoload skipped:', err2.message));
  }
}

document.addEventListener('DOMContentLoaded', fetchAllData);

// ── Map iframe → inventory navigation ────────────────────────────────────
window.addEventListener('message', function(e) {
  if (e.origin !== window.location.origin) return;
  if (!e.data || e.data.type !== 'map-nav-inv') return;
  mapNavToInv(e.data.code);
});

function mapNavToInv(code) {
  showPage('inv');
  const node = locations.find(l => l.code === code);
  if (!node) return;
  const t1 = document.getElementById('inv-loc-f1');
  const t2 = document.getElementById('inv-loc-f2');
  const t3 = document.getElementById('inv-loc-f3');
  if (!t1) return;
  const tier = +(node.tierIndex);
  if (tier === 1) {
    t1.value = node.id;
    invLocFilterT1Change();
  } else if (tier === 2) {
    const parent = locations.find(l => l.id === node.parentId);
    if (parent) {
      t1.value = parent.id;
      invLocFilterT1Change();
      t2.value = node.id;
      invLocFilterT2Change();
    }
  } else if (tier === 3) {
    const parent = locations.find(l => l.id === node.parentId);
    const grandparent = parent ? locations.find(l => l.id === parent.parentId) : null;
    if (grandparent) {
      t1.value = grandparent.id;
      invLocFilterT1Change();
      t2.value = parent.id;
      invLocFilterT2Change();
      t3.value = node.id;
      invLocFilterT3Change();
    }
  }
}
