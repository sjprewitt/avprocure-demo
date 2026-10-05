// ═══════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════
function _invCatSet(cat){
  const el=document.getElementById('inv-cat'); if(!el) return;
  if(cat){
    el.value=cat; el.readOnly=true;
    el.style.color='var(--accent)'; el.style.background='var(--surface3)';
    acCtx.inv.cat.selected=cat;
  } else {
    _invCatClear();
  }
}
function _invCatClear(){
  const el=document.getElementById('inv-cat'); if(!el) return;
  el.value=''; el.readOnly=false;
  el.style.color=''; el.style.background='';
  acCtx.inv.cat.selected=null;
  document.getElementById('dd-inv-cat')?.classList.remove('open');
}

function setInvType(t){
  invType=t;
  document.getElementById('tog-serial').classList.toggle('active',t==='serialized');
  document.getElementById('tog-bulk').classList.toggle('active',t==='bulk');
  document.getElementById('inv-serial-grp').style.display=t==='serialized'?'':'none';
  document.getElementById('inv-qty-grp').style.display=t==='bulk'?'':'none';
  const batchBtn=document.getElementById('inv-btn-batch');
  if(batchBtn) batchBtn.style.display=t==='serialized'?'':'none';
}

function invCheckReady(){
  const ready=!!(acCtx.inv.mfg.selected&&acCtx.inv.model.selected);
  document.getElementById('inv-btn-add').disabled=!ready;
  const batchBtn=document.getElementById('inv-btn-batch');
  if(batchBtn){ batchBtn.disabled=!ready; batchBtn.style.display=invType==='serialized'?'':'none'; }
}

function addInvItem(){
  const mfg=acCtx.inv.mfg.selected, model=acCtx.inv.model.selected;
  if(!mfg||!model) return;
  const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
  _buildPendingInvItem(mfg, model, entry);
  if(!entry){
    const preFillCat=acCtx.inv.cat.selected||document.getElementById('inv-cat').value.trim();
    openPBPrompt(mfg, model, preFillCat);
  } else {
    _commitInvItem(entry);
  }
}

function _buildPendingInvItem(mfg, model, entry){
  const today=new Date().toLocaleDateString('en-US');
  const locSel=document.getElementById('inv-loc');
  const locId=locSel?locSel.value:'';
  const locRec=locId?locations.find(l=>l.id===locId):null;
  const locCode=locRec?locRec.code:'';
  const projSel=document.getElementById('inv-proj');
  const projId=projSel?projSel.value:'';
  const projRec=projId?projects.find(p=>p.id===projId):null;
  const autoInvStatus=projId?'Allocated':'Unallocated';
  const formInvStatus=document.getElementById('inv-status').value||autoInvStatus;
  _pendingInvItem={
    id:uid(),
    sku:entry?entry.sku:(document.getElementById('inv-sku').value||''),
    manufacturer:mfg,model,
    category:entry?entry.category:(acCtx.inv.cat.selected||document.getElementById('inv-cat').value.trim()||''),
    type:invType,par:0,
    qty:invType==='bulk'?Math.max(1,parseInt(document.getElementById('inv-qty').value)||1):1,
    serial:invType==='serialized'?document.getElementById('inv-serial').value.trim():'',
    location:locCode,locationId:locId,
    condition:document.getElementById('inv-cond').value,
    status:formInvStatus,invStatus:formInvStatus,
    project:projRec?projRec.name:'',projectId:projId,
    poNumber:'',
    notes:document.getElementById('inv-notes').value.trim(),
    dateAdded:today,lastUpdated:today,
  };
}

function _commitInvItem(entry){
  if(!_pendingInvItem) return;
  if(entry){
    if(entry.sku) _pendingInvItem.sku=entry.sku;
    if(entry.category) _pendingInvItem.category=entry.category;
  }
  inventory.push(_pendingInvItem);
  dbSave('inventory', _pendingInvItem);
  _pendingInvItem=null;
  setDirty(true); updateInvStats(); renderInvTable(); resetInvForm(); renderStockTable();
  toast('Item added','success');
}

function invLocChanged(){
  const locSel=document.getElementById('inv-loc');
  const locId=locSel?locSel.value:'';
  const locRec=locId?locations.find(l=>l.id===locId):null;
  const statusSel=document.getElementById('inv-status');
  if(statusSel && locRec){
    if(locRec.type==='staging') statusSel.value='Staged';
    else if(locRec.type==='general') statusSel.value='In Stock';
  }
  if(scanModeActive){
    stickyLocId=locId;
    stickyStatus=statusSel?statusSel.value:stickyStatus;
    _refreshScanBanner();
  }
}

function populateInvLocSelect(){
  const sel=document.getElementById('inv-loc'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— None —</option>'+leafLocationOptgroups('id');
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
  _locCascadeInit('inv');
  if(cur) _locCascadeSetLeaf('inv',cur);
}

// ── Cascading location picker ─────────────────────────────────────────────────

function _locCascadeTierName(idx){
  const rec=locations.find(l=>+(l.tierIndex)===idx);
  return rec?rec.tier:`Tier ${idx}`;
}

function _locCascadeEls(prefix){
  if(prefix==='inv'){
    return [
      document.getElementById('inv-loc-t1'),
      document.getElementById('inv-loc-t2'),
      document.getElementById('inv-loc-t3'),
      document.getElementById('inv-loc'),
    ];
  }
  return [
    document.getElementById(`${prefix}-t1`),
    document.getElementById(`${prefix}-t2`),
    document.getElementById(`${prefix}-t3`),
    document.getElementById(prefix),
  ];
}

function _locCascadeSetHidden(prefix,leafId){
  const [,,, hidden]=_locCascadeEls(prefix);
  if(!hidden) return;
  hidden.innerHTML=`<option value="${escHtml(leafId)}">${escHtml(leafId)}</option><option value="">—</option>`;
  hidden.value=leafId;
  hidden.dispatchEvent(new Event('change',{bubbles:true}));
}

function _locCascadeInit(prefix){
  const [t1,t2,t3]=_locCascadeEls(prefix);
  if(!t1) return;
  const t1Name=_locCascadeTierName(1)||'Aisle';
  const t2Name=_locCascadeTierName(2)||'Rack';
  const t3Name=_locCascadeTierName(3)||'Shelf';
  const t1Nodes=locations.filter(l=>+(l.tierIndex)===1).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  t1.innerHTML=`<option value="">${escHtml(t1Name)}…</option>`
    +t1Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
  if(t2){ t2.innerHTML=`<option value="">${escHtml(t2Name)}…</option>`; t2.disabled=true; }
  if(t3){ t3.innerHTML=`<option value="">${escHtml(t3Name)}…</option>`; t3.disabled=true; }
}

function _locCascadeT1(prefix){
  const [t1,t2,t3]=_locCascadeEls(prefix);
  if(!t1.value){ _locCascadeSetHidden(prefix,''); return; }
  const t2Nodes=locations.filter(l=>l.parentId===t1.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(t3){ t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`; t3.disabled=true; }
  if(!t2Nodes.length){
    _locCascadeSetHidden(prefix,t1.value);
  } else {
    const t2Name=_locCascadeTierName(2)||'Rack';
    t2.innerHTML=`<option value="">${escHtml(t2Name)}…</option>`
      +t2Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
    t2.disabled=false;
    _locCascadeSetHidden(prefix,'');
  }
}

function _locCascadeT2(prefix){
  const [t1,t2,t3]=_locCascadeEls(prefix);
  if(!t2||!t2.value){ _locCascadeSetHidden(prefix,''); return; }
  const t3Nodes=locations.filter(l=>l.parentId===t2.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(!t3Nodes.length){
    _locCascadeSetHidden(prefix,t2.value);
  } else {
    const t3Name=_locCascadeTierName(3)||'Shelf';
    t3.innerHTML=`<option value="">${escHtml(t3Name)}…</option>`
      +t3Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
    t3.disabled=false;
    _locCascadeSetHidden(prefix,'');
  }
}

function _locCascadeT3(prefix){
  const [,,t3]=_locCascadeEls(prefix);
  if(!t3||!t3.value){ _locCascadeSetHidden(prefix,''); return; }
  _locCascadeSetHidden(prefix,t3.value);
}

function _locCascadeReset(prefix){
  const [t1,t2,t3,hidden]=_locCascadeEls(prefix);
  _locCascadeInit(prefix);
  if(hidden){ hidden.innerHTML='<option value="">— None —</option>'; hidden.value=''; }
}

function _locCascadeSetLeaf(prefix,leafId){
  if(!leafId){ _locCascadeInit(prefix); return; }
  const leaf=locations.find(l=>l.id===leafId);
  if(!leaf){ _locCascadeInit(prefix); return; }
  // Build ancestor chain from tier-1 down to leaf
  const chain=[];
  let cur=leaf;
  while(cur && +(cur.tierIndex)>0){
    chain.unshift(cur);
    cur=cur.parentId?locations.find(l=>l.id===cur.parentId):null;
  }
  _locCascadeInit(prefix);
  const [t1,t2,t3]=_locCascadeEls(prefix);
  if(chain[0]&&t1){ t1.value=chain[0].id; _locCascadeT1(prefix); }
  if(chain[1]&&t2){ t2.value=chain[1].id; _locCascadeT2(prefix); }
  if(chain[2]&&t3){ t3.value=chain[2].id; _locCascadeT3(prefix); }
}

// ── PO receive modal — cascading 3-level location picker ─────────────────────
// Each item/unit gets its own uid. The hidden input carries data-item-loc /
// data-loc-item so advanceReceive() and finalizeReceive() read .value unchanged.
// Values stored are location codes (matching the previous flat dropdown).

function _recvLocHtml(uid, extraAttrs){
  const ss='padding:4px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-ui);font-size:11px;color:var(--text);outline:none;width:110px;display:block;';
  return `<div style="display:flex;flex-direction:column;gap:2px;">
    <select id="recv-${uid}-t1" onchange="_recvLocT1('${uid}')" style="${ss}"></select>
    <select id="recv-${uid}-t2" onchange="_recvLocT2('${uid}')" style="${ss}" disabled></select>
    <select id="recv-${uid}-t3" onchange="_recvLocT3('${uid}')" style="${ss}" disabled></select>
    <input type="hidden" id="recv-${uid}-val" ${extraAttrs} value="">
  </div>`;
}

function _recvLocSet(uid, code){
  const el=document.getElementById(`recv-${uid}-val`);
  if(el) el.value=code||'';
}

function _recvLocT1(uid){
  const t1=document.getElementById(`recv-${uid}-t1`);
  const t2=document.getElementById(`recv-${uid}-t2`);
  const t3=document.getElementById(`recv-${uid}-t3`);
  if(!t1) return;
  _recvLocSet(uid,'');
  if(!t1.value){
    if(t2){t2.innerHTML=`<option value="">${escHtml(_locCascadeTierName(2)||'Bay')}…</option>`;t2.disabled=true;}
    if(t3){t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`;t3.disabled=true;}
    return;
  }
  const t2Nodes=locations.filter(l=>l.parentId===t1.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(t3){t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`;t3.disabled=true;}
  if(!t2Nodes.length){
    const leaf=locations.find(l=>l.id===t1.value);
    _recvLocSet(uid,leaf?leaf.code:'');
    if(t2){t2.innerHTML=`<option value="">${escHtml(_locCascadeTierName(2)||'Bay')}…</option>`;t2.disabled=true;}
  } else {
    if(t2){
      t2.innerHTML=`<option value="">${escHtml(_locCascadeTierName(2)||'Bay')}…</option>`
        +t2Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
      t2.disabled=false;
    }
  }
}

function _recvLocT2(uid){
  const t2=document.getElementById(`recv-${uid}-t2`);
  const t3=document.getElementById(`recv-${uid}-t3`);
  if(!t2) return;
  _recvLocSet(uid,'');
  if(!t2.value){
    if(t3){t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`;t3.disabled=true;}
    return;
  }
  const t3Nodes=locations.filter(l=>l.parentId===t2.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(!t3Nodes.length){
    const leaf=locations.find(l=>l.id===t2.value);
    _recvLocSet(uid,leaf?leaf.code:'');
    if(t3){t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`;t3.disabled=true;}
  } else {
    if(t3){
      t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`
        +t3Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
      t3.disabled=false;
    }
  }
}

function _recvLocT3(uid){
  const t3=document.getElementById(`recv-${uid}-t3`);
  if(!t3||!t3.value){ _recvLocSet(uid,''); return; }
  const leaf=locations.find(l=>l.id===t3.value);
  _recvLocSet(uid,leaf?leaf.code:'');
}

function _recvLocInit(uid, selectedVal=''){
  const t1=document.getElementById(`recv-${uid}-t1`);
  const t2=document.getElementById(`recv-${uid}-t2`);
  const t3=document.getElementById(`recv-${uid}-t3`);
  if(!t1) return;
  const t1Name=_locCascadeTierName(1)||'Area';
  const t2Name=_locCascadeTierName(2)||'Bay';
  const t3Name=_locCascadeTierName(3)||'Shelf';
  const t1Nodes=locations.filter(l=>+(l.tierIndex)===1).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  t1.innerHTML=`<option value="">${escHtml(t1Name)}…</option>`
    +t1Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
  if(t2){t2.innerHTML=`<option value="">${escHtml(t2Name)}…</option>`;t2.disabled=true;}
  if(t3){t3.innerHTML=`<option value="">${escHtml(t3Name)}…</option>`;t3.disabled=true;}
  _recvLocSet(uid,'');
  if(!selectedVal) return;
  // Pre-select by code or id — build ancestor chain then cascade down
  const leaf=locations.find(l=>l.code===selectedVal||l.id===selectedVal);
  if(!leaf) return;
  const chain=[];
  let cur=leaf;
  while(cur && +(cur.tierIndex)>0){
    chain.unshift(cur);
    cur=cur.parentId?locations.find(l=>l.id===cur.parentId):null;
  }
  if(chain[0]&&t1){ t1.value=chain[0].id; _recvLocT1(uid); }
  if(chain[1]&&t2){ t2.value=chain[1].id; _recvLocT2(uid); }
  if(chain[2]&&t3){ t3.value=chain[2].id; _recvLocT3(uid); }
  // Ensure the leaf code is stored even if cascade ended early
  const leafCode=chain[chain.length-1]?.code||'';
  _recvLocSet(uid,leafCode);
}

function populateInvProjSelect(){
  const sel=document.getElementById('inv-proj'); if(!sel) return;
  const cur=sel.value;
  // Group active projects by Client · Location so duplicate names are readable.
  const _g={};
  projects.filter(p=>p.status!=='Complete').forEach(p=>{
    const k=(typeof _xfrProjCtx==='function')?_xfrProjCtx(p):(p.name||'');
    (_g[k]=_g[k]||[]).push(p);
  });
  const groups=Object.keys(_g).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})).map(k=>{
    const opts=_g[k].slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''))
      .map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name||'(unnamed)')}</option>`).join('');
    return `<optgroup label="${escHtml(k)}">${opts}</optgroup>`;
  }).join('');
  sel.innerHTML='<option value="">— None —</option>'+groups;
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
}

// ── Inline "Allocate to" for unallocated inventory rows ───────────────────────
// One click assigns an unallocated unit to a project AND adds it to that
// project's scope (project_items) — same scope step the Transfer modal runs.
let _allocOptsCache={n:-1, html:''};
function _invAllocOptionsHtml(){
  if(_allocOptsCache.n===projects.length) return _allocOptsCache.html;
  const g={};
  projects.filter(p=>p.status!=='Complete').forEach(p=>{
    const k=(typeof _xfrProjCtx==='function')?_xfrProjCtx(p):(p.name||'');
    (g[k]=g[k]||[]).push(p);
  });
  const html=Object.keys(g).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})).map(k=>{
    const opts=g[k].slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''))
      .map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name||'(unnamed)')}</option>`).join('');
    return `<optgroup label="${escHtml(k)}">${opts}</optgroup>`;
  }).join('');
  _allocOptsCache={n:projects.length, html};
  return html;
}
function _invAllocSelectHtml(itemId){
  const eid=String(itemId).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `<select onclick="event.stopPropagation()" onchange="allocateInvToProject('${eid}',this.value)"
    title="Allocate to a project (also adds it to that project's scope)"
    style="background:var(--surface2);border:1px dashed var(--border);border-radius:4px;font-size:11px;color:var(--text-dim);outline:none;padding:2px 4px;cursor:pointer;max-width:150px;">
    <option value="">Allocate to…</option>${_invAllocOptionsHtml()}
  </select>`;
}
function allocateInvToProject(itemId, projId){
  if(!projId) return;
  const item=inventory.find(i=>i.id===itemId); if(!item){ toast('Item not found','error'); return; }
  const proj=projects.find(p=>p.id===projId); if(!proj){ toast('Project not found','error'); return; }
  const today=new Date().toLocaleDateString('en-US');
  const fromName=item.project||'(unassigned)';
  // 1) allocate the physical unit
  item.projectId=proj.id; item.project=proj.name;
  item.status='Allocated'; item.invStatus='Allocated'; item.lastUpdated=today;
  dbSave('inventory', item);
  // 2) ensure destination scope line (mirror Transfer step 4)
  const existingScope=projectItems.find(i=> i.projectId===proj.id &&
    (item.sku ? i.sku===item.sku : (i.manufacturer===item.manufacturer && i.model===item.model)));
  if(!existingScope){
    const pb=catalog.find(r=> item.sku ? r.sku===item.sku : (r.manufacturer===item.manufacturer && r.model===item.model));
    const scope={ id:uid(), projectId:proj.id, sku:item.sku||'',
      manufacturer:item.manufacturer, model:item.model,
      category:item.category||(pb?pb.category:''), qty:item.qty||1,
      unitCost:pb?(pb.unitCost||0):0, unitPrice:pb?(pb.unitPrice||pb.msrp||0):0,
      itemStatus:'On PO', inventoryIds:[item.id],
      notes:`Allocated from stock (${fromName})` };
    projectItems.push(scope); dbSave('projectItems', scope);
  } else {
    if(!Array.isArray(existingScope.inventoryIds)) existingScope.inventoryIds=[];
    if(!existingScope.inventoryIds.includes(item.id)) existingScope.inventoryIds.push(item.id);
    dbSave('projectItems', existingScope);
  }
  // 3) audit trail
  transfers.push({ id:uid(), timestamp:new Date().toISOString(),
    inventoryId:item.id, sku:item.sku||'', manufacturer:item.manufacturer, model:item.model,
    serial:item.serial||'', qty:item.qty||1,
    fromProjectId:'', fromProject:fromName, toProjectId:proj.id, toProject:proj.name,
    fromLocation:item.location||'', fromLocationId:item.locationId||'',
    toLocation:item.location||'', toLocationId:item.locationId||'',
    notes:'Inline allocate from inventory' });
  dbSave('transfers', transfers[transfers.length-1]);
  setDirty(true);
  updateInvStats(); renderInvTable(); renderStockTable();
  if(typeof updateProjStats==='function') updateProjStats();
  toast(`Allocated ${item.model} → ${proj.name} · added to scope`,'success');
}

// ── Project cell rendering (Client · Location context) ────────────────────────
// Makes "what is allocated where" legible: the project name plus a muted
// Client · Location sub-line, so duplicate names (Unallocated…) are distinct.
function _projCtxStr(p){
  const cl=(typeof projClientName==='function'?projClientName(p):'')||'';
  const lo=(typeof projLocationName==='function'?projLocationName(p):'')||'';
  return [cl,lo].filter(Boolean).join(' · ');
}
function _projLinkHtml(p){
  const eid=String(p.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `<a href="#" onclick="event.preventDefault();event.stopPropagation();showPage('proj');setTimeout(()=>openProject('${eid}'),50)" style="color:var(--accent);text-decoration:none;">${escHtml(p.name||'(unnamed)')}</a>`;
}
// Single unit / child row.
function _invProjCellHtml(item){
  const p=projects.find(x=>x.id===(item.projectId||item.project));
  if(p){ const c=_projCtxStr(p); return _projLinkHtml(p)+(c?`<div style="font-size:10px;color:var(--text-dim);line-height:1.2;">${escHtml(c)}</div>`:''); }
  if(item.project) return escHtml(item.project);
  if(isStockItem(item)) return '<span class="dim">—</span>';
  return _invAllocSelectHtml(item.id);
}
// Group row: distinct projects with per-project unit counts. Returns null if the
// group's units are in no project (caller decides —/allocate dropdown).
function _invProjGroupHtml(items){
  const m=new Map();
  items.forEach(it=>{ const p=projects.find(x=>x.id===(it.projectId||it.project)); if(p){ const e=m.get(p.id)||{p,count:0}; e.count+=(it.qty||1); m.set(p.id,e); } });
  if(m.size===0) return null;
  const arr=[...m.values()].sort((a,b)=>b.count-a.count);
  const rows=arr.slice(0,3).map(({p,count})=>{
    const c=_projCtxStr(p);
    return `<div style="line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;">`
      + `${count>1?`<span style="color:var(--text-dim)">${count}× </span>`:''}${_projLinkHtml(p)}`
      + `${c?`<span style="font-size:10px;color:var(--text-dim)"> · ${escHtml(c)}</span>`:''}</div>`;
  }).join('');
  return rows+(arr.length>3?`<div style="font-size:10px;color:var(--text-dim)">+${arr.length-3} more…</div>`:'');
}

function deleteInvItem(id){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  const k=iKey(item);
  if(!inventory.filter(i=>i.id!==id&&iKey(i)===k).length) expandedGroups.delete(k);
  inventory=inventory.filter(i=>i.id!==id);
  dbDelete('inventory', id);
  setDirty(true); updateInvStats(); renderInvTable();
  toast('Removed','success');
}

function adjustQty(id, delta){
  const item=inventory.find(i=>i.id===id);
  if(!item) return;
  if(item.type==='serialized'){
    if(delta < 0){
      deleteInvItem(id);
    } else {
      toast('To add another serialized unit, use the Add form below','success');
      document.getElementById('inv-mfg').value = item.manufacturer;
      acCtx.inv.mfg.selected = item.manufacturer;
      const mi = document.getElementById('inv-model');
      mi.disabled = false; mi.value = item.model;
      acCtx.inv.model.selected = item.model;
      document.getElementById('inv-sku').value = item.sku;
      document.getElementById('inv-btn-add').disabled = false;
      mi.focus();
    }
    return;
  }
  // Bulk
  const newQty = item.qty + delta;
  if(newQty <= 0){
    if(isStockItem(item)){
      // Stock items persist at qty 0
      item.qty = 0;
      syncStockStatus(item);
      item.lastUpdated = new Date().toLocaleDateString('en-US');
      dbSave('inventory', item);
      setDirty(true); updateInvStats(); renderInvTable();
    } else {
      deleteInvItem(id);
    }
    return;
  }
  item.qty = newQty;
  syncStockStatus(item);
  item.lastUpdated = new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true); updateInvStats(); renderInvTable();
}

function resetInvForm(){
  ['inv-mfg','inv-model','inv-sku','inv-serial','inv-notes'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  _invCatClear();
  document.getElementById('inv-qty').value=1;
  document.getElementById('inv-model').disabled=true;
  document.getElementById('inv-model').placeholder='Select manufacturer first…';
  acCtx.inv.mfg.selected=acCtx.inv.model.selected=acCtx.inv.cat.selected=null;
  document.getElementById('inv-btn-add').disabled=true;
  if(scanModeActive){
    _applyStickyToForm();
  } else {
    _locCascadeReset('inv');
    const projEl=document.getElementById('inv-proj'); if(projEl) projEl.selectedIndex=0;
    document.getElementById('inv-cond').value='New';
    document.getElementById('inv-status').value='Unallocated';
    _applyFilterHintsToForm();
  }
  document.getElementById('inv-mfg').focus();
}

// ── Scan Mode ────────────────────────────────────────────────────────────────

function toggleScanMode(){
  if(scanModeActive) endScanMode(); else startScanMode();
}

function startScanMode(){
  scanModeActive=true;
  const locSel=document.getElementById('inv-loc');
  stickyLocId=locSel?locSel.value:'';
  const statusSel=document.getElementById('inv-status');
  stickyStatus=statusSel?statusSel.value:'Unallocated';
  const condSel=document.getElementById('inv-cond');
  stickyCondition=condSel?condSel.value:'New';
  document.getElementById('scan-mode-banner').classList.add('active');
  const btn=document.getElementById('btn-scan-mode');
  if(btn){ btn.style.background='rgba(79,247,160,0.1)'; btn.style.borderColor='rgba(79,247,160,0.5)'; }
  _refreshScanBanner();
  _applyStickyToForm();
}

function endScanMode(){
  scanModeActive=false;
  document.getElementById('scan-mode-banner').classList.remove('active');
  const btn=document.getElementById('btn-scan-mode');
  if(btn){ btn.style.background=''; btn.style.borderColor=''; }
}

function _refreshScanBanner(){
  const locRec=stickyLocId?locations.find(l=>l.id===stickyLocId):null;
  document.getElementById('scan-loc-label').textContent=locRec?locRec.code:'No location set';
  document.getElementById('scan-status-label').textContent=stickyStatus;
}

function _applyStickyToForm(){
  _locCascadeSetLeaf('inv',stickyLocId);
  const locSel=document.getElementById('inv-loc');
  if(locSel) locSel.value=stickyLocId;
  const statusSel=document.getElementById('inv-status');
  if(statusSel) statusSel.value=stickyStatus;
  const condSel=document.getElementById('inv-cond');
  if(condSel) condSel.value=stickyCondition;
  const projSel=document.getElementById('inv-proj');
  if(projSel) projSel.selectedIndex=0;
}

function _applyFilterHintsToForm(){
  if(invLocFilterNodeId){
    _locCascadeSetLeaf('inv', invLocFilterNodeId);
    const locSel=document.getElementById('inv-loc');
    if(locSel) locSel.value=invLocFilterNodeId;
    invLocChanged();
  }
  if(invStatusFilter && invStatusFilter!=='__none__'){
    const statusSel=document.getElementById('inv-status');
    if(statusSel) statusSel.value=invStatusFilter;
  }
}

function openScanLocPicker(){
  const bar=document.querySelector('#page-inv .add-bar');
  if(bar) bar.classList.add('open');
  setTimeout(()=>{
    const loc=document.getElementById('inv-loc-t1');
    if(loc) loc.focus();
  },50);
}

function cycleScanStatus(){
  const opts=['Unallocated','In Stock','Staged','Allocated','Deployed','Returned'];
  const idx=opts.indexOf(stickyStatus);
  stickyStatus=opts[(idx+1)%opts.length];
  _refreshScanBanner();
  _applyStickyToForm();
}

// ── Pricebook Prompt ─────────────────────────────────────────────────────────

function openPBPrompt(mfg, model, preFillCat=''){
  document.getElementById('pbp-subtitle').textContent=`${mfg} / ${model}`;
  ['pbp-subcat','pbp-url'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['pbp-cost','pbp-price','pbp-msrp'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  acCtx.pbp.cat.focusIdx=-1;
  if(preFillCat){
    document.getElementById('pbp-cat').value=preFillCat;
    acCtx.pbp.cat.selected=preFillCat;
    pbpGenerateSKU();
    pbpUpdateConfirmBtn();
  } else {
    document.getElementById('pbp-cat').value='';
    document.getElementById('pbp-sku').value='';
    acCtx.pbp.cat.selected=null;
    document.getElementById('pbp-btn-confirm').disabled=true;
    document.getElementById('pbp-btn-confirm').style.opacity='0.5';
  }
  document.getElementById('pb-prompt-modal').style.display='flex';
  setTimeout(()=>document.getElementById(preFillCat?'pbp-subcat':'pbp-cat').focus(),80);
}

function cancelPBPrompt(){
  _pendingInvItem=null;
  document.getElementById('pb-prompt-modal').style.display='none';
  document.getElementById('dd-pbp-cat').classList.remove('open');
}

function skipPBPrompt(){
  document.getElementById('pb-prompt-modal').style.display='none';
  document.getElementById('dd-pbp-cat').classList.remove('open');
  // Abort the add. Committing here used to save an inventory record with a blank
  // SKU, because the SKU is minted by the pricebook entry this prompt creates.
  // The form keeps its values so the entry can be completed instead of retyped.
  _pendingInvItem=null;
  toast('Not added — a pricebook entry is needed to assign a SKU','error');
}

function confirmPBPrompt(){
  const cat=acCtx.pbp.cat.selected||document.getElementById('pbp-cat').value.trim();
  if(!cat){ document.getElementById('pbp-cat').focus(); return; }
  if(!_pendingInvItem) return;
  const mfg=_pendingInvItem.manufacturer;
  const model=_pendingInvItem.model;
  const subcat=document.getElementById('pbp-subcat').value.trim();
  const unitCost=parseFloat(document.getElementById('pbp-cost').value)||0;
  const unitPrice=parseFloat(document.getElementById('pbp-price').value)||0;
  const msrp=parseFloat(document.getElementById('pbp-msrp').value)||0;
  const url=document.getElementById('pbp-url').value.trim();

  const sku=generateSku(cat, mfg);
  const newEntry={sku,manufacturer:mfg,model,category:cat,subcategory:subcat,
    url,shortDesc:'',longDesc:'',msrp,unitCost,unitPrice};
  catalog.push(newEntry);
  registerCatalogEntry(newEntry);
  dbSave('catalog',newEntry);
  setDirty(true);

  document.getElementById('pb-prompt-modal').style.display='none';
  document.getElementById('dd-pbp-cat').classList.remove('open');
  _commitInvItem({sku,category:cat});
}

function pbpCatInput(){
  const q=document.getElementById('pbp-cat').value.trim().toLowerCase();
  acCtx.pbp.cat.selected=null;
  pbpUpdateConfirmBtn();
  pbpGenerateSKU();
  const dd=document.getElementById('dd-pbp-cat');
  const cats=Object.keys(CAT_CODES);
  const filtered=q?cats.filter(c=>c.toLowerCase().includes(q)):cats;
  if(!filtered.length){ dd.classList.remove('open'); return; }
  acCtx.pbp.cat.focusIdx=Math.max(-1,Math.min(acCtx.pbp.cat.focusIdx,filtered.length-1));
  dd.innerHTML=filtered.map((c,i)=>
    `<div class="ac-opt${i===acCtx.pbp.cat.focusIdx?' focused':''}" onmousedown="pbpCatSelect(${escHtml(JSON.stringify(c))})">
       <span class="ac-main">${escHtml(c)}</span>
       <span class="ac-sub" style="font-family:var(--font-mono);font-size:10px">${CAT_CODES[c]}</span>
     </div>`
  ).join('');
  dd.classList.add('open');
}

function pbpCatFocus(){ acCtx.pbp.cat.focusIdx=-1; pbpCatInput(); }

function pbpCatKey(e){
  const dd=document.getElementById('dd-pbp-cat');
  const opts=dd.querySelectorAll('.ac-opt');
  if(e.key==='ArrowDown'){ e.preventDefault(); acCtx.pbp.cat.focusIdx=Math.min(acCtx.pbp.cat.focusIdx+1,opts.length-1); pbpCatInput(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); acCtx.pbp.cat.focusIdx=Math.max(acCtx.pbp.cat.focusIdx-1,0); pbpCatInput(); }
  else if(e.key==='Enter'||e.key==='Tab'){
    if(acCtx.pbp.cat.focusIdx>=0&&opts[acCtx.pbp.cat.focusIdx]){
      e.preventDefault();
      pbpCatSelect(opts[acCtx.pbp.cat.focusIdx].querySelector('.ac-main').textContent);
    } else {
      const v=document.getElementById('pbp-cat').value.trim();
      if(v){ e.preventDefault(); pbpCatSelect(v); }
    }
  } else if(e.key==='Escape'){ dd.classList.remove('open'); }
}

function pbpCatSelect(val){
  document.getElementById('pbp-cat').value=val;
  acCtx.pbp.cat.selected=val;
  acCtx.pbp.cat.focusIdx=-1;
  document.getElementById('dd-pbp-cat').classList.remove('open');
  pbpGenerateSKU();
  pbpUpdateConfirmBtn();
}

function pbpGenerateSKU(){
  const cat=acCtx.pbp.cat.selected||document.getElementById('pbp-cat').value.trim();
  const mfg=_pendingInvItem?_pendingInvItem.manufacturer:'';
  if(!cat||!mfg){ document.getElementById('pbp-sku').value=''; return; }
  const catCode=CAT_CODES[cat]||cat.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||'UNC';
  const mfgCodeMap=getMfgCodeMap();
  const mfgCode=mfgCodeMap[mfg]||generateMfgCode(mfg,mfgCodeMap);
  const prefix=`${catCode}-${mfgCode}-`;
  const existing=catalog.filter(r=>r.sku&&r.sku.startsWith(prefix)).map(r=>{
    const n=parseInt(r.sku.split('-')[2]); return isNaN(n)?0:n;
  });
  const next=(existing.length?Math.max(...existing):0)+1;
  document.getElementById('pbp-sku').value=`${prefix}${String(next).padStart(4,'0')}`;
}

function pbpUpdateConfirmBtn(){
  const cat=acCtx.pbp.cat.selected||document.getElementById('pbp-cat').value.trim();
  const btn=document.getElementById('pbp-btn-confirm');
  btn.disabled=!cat;
  btn.style.opacity=cat?'1':'0.5';
}

// ── Camera Scanner ───────────────────────────────────────────────────────────

// ── Camera Scanner (photo-capture approach) ──────────────────────────────────
// Uses <input capture="environment"> so the native camera handles focus/autofocus.
// Decoded via BarcodeDetector on the still image. Falls back to manual entry.

let _scanTarget=null, _scanPreviewUrl=null;

function openScanner(inputEl){
  _scanTarget=inputEl;
  if(_scanPreviewUrl){ URL.revokeObjectURL(_scanPreviewUrl); _scanPreviewUrl=null; }
  const preview=document.getElementById('scan-preview');
  if(preview){ preview.style.display='none'; preview.src=''; }
  document.getElementById('scan-file-input').click();
}

async function handleScanCapture(event){
  const file=event.target.files[0];
  event.target.value=''; // reset so re-tapping works
  if(!file) return;

  // Show modal with preview and "Detecting…" state
  if(_scanPreviewUrl){ URL.revokeObjectURL(_scanPreviewUrl); _scanPreviewUrl=null; }
  _scanPreviewUrl=URL.createObjectURL(file);
  const preview=document.getElementById('scan-preview');
  preview.src=_scanPreviewUrl; preview.style.display='block';

  const inp=document.getElementById('scan-manual-input');
  const btn=document.getElementById('scan-confirm-btn');
  inp.value=''; btn.disabled=true; btn.style.opacity='0.4';
  document.getElementById('scanner-modal').style.display='flex';
  _setScanStatus('Detecting barcode…');

  if(!window.BarcodeDetector){
    _setScanStatus('Auto-detect not supported on this browser — type below');
    inp.focus(); return;
  }
  try {
    const supported=BarcodeDetector.getSupportedFormats
      ? await BarcodeDetector.getSupportedFormats() : [];
    const formats=supported.length?supported:['qr_code'];
    const detector=new BarcodeDetector({formats});
    const bitmap=await createImageBitmap(file);
    const codes=await detector.detect(bitmap);
    bitmap.close();
    if(codes&&codes.length){
      const val=codes[0].rawValue;
      // Auto-fill target and close — no need to keep modal open
      if(_scanTarget){
        _scanTarget.value=val;
        _scanTarget.dispatchEvent(new Event('input',{bubbles:true}));
        _scanTarget.dispatchEvent(new Event('change',{bubbles:true}));
        _scanTarget.focus();
      }
      closeScanner();
      toast('Scanned: '+val,'success');
    } else {
      _setScanStatus('No barcode found — type it below or tap Camera to retry');
      inp.focus();
    }
  } catch(e){
    _setScanStatus('Detection error — type below');
    inp.focus();
  }
}

function _setScanStatus(msg){
  const el=document.getElementById('scan-status');
  if(el) el.textContent=msg;
}

function onScanManualInput(){
  const val=document.getElementById('scan-manual-input').value.trim();
  const btn=document.getElementById('scan-confirm-btn');
  btn.disabled=!val; btn.style.opacity=val?'1':'0.4';
}

function confirmScan(){
  const val=document.getElementById('scan-manual-input').value.trim();
  if(!val) return;
  if(_scanTarget){
    _scanTarget.value=val;
    _scanTarget.dispatchEvent(new Event('input',{bubbles:true}));
    _scanTarget.dispatchEvent(new Event('change',{bubbles:true}));
    _scanTarget.focus();
  }
  closeScanner();
  toast('Scanned: '+val,'success');
}

function closeScanner(){
  document.getElementById('scanner-modal').style.display='none';
  if(_scanPreviewUrl){ URL.revokeObjectURL(_scanPreviewUrl); _scanPreviewUrl=null; }
  const preview=document.getElementById('scan-preview');
  if(preview){ preview.src=''; preview.style.display='none'; }
  _scanTarget=null;
}

const iKey=i=>`${i.sku}||${i.manufacturer}||${i.model}`;

// A project is a "stock" pool when its type is 'stock' (see docs/DESIGN-project-types.md).
// Used for allocation availability so shop-stock stays allocatable to jobs after being
// tagged to the stock project.
const isStockProjectId=pid=>!!pid&&projects.some(p=>p.id===pid&&(p.type||'job')==='stock');

// Shop-stock ON HAND = physically at the 'Stock' location, or carrying a stock status.
// Deliberately NOT ownership-based: the stock project also holds deployed/allocated
// equipment that must NOT show on the Shop Stock tab. The location clause no longer requires
// an empty invStatus, so 'In Stock' items at the Stock location now show (fixes hidden stock).
const isStockItem=i=>
  i.invStatus==='On Hand'||i.invStatus==='Out of Stock'||
  (i.location&&i.location.trim().toLowerCase()==='stock');

function syncStockStatus(item){
  if(!isStockItem(item)) return;
  item.status = item.qty > 0 ? 'On Hand' : 'Out of Stock';
}

function getInvGroups(){
  const q=invFilterQuery.toLowerCase();
  // Build location descendant set once if a node filter is active
  const locNodeSet=invLocFilterNodeId?_locDescendants(invLocFilterNodeId):null;
  const filtered=inventory.filter(i=>{
    if(q && ![i.sku,i.manufacturer,i.model,i.serial,i.location,i.project,i.notes,i.invStatus].some(v=>v&&v.toLowerCase().includes(q))) return false;
    if(invStatusFilter){
      if(invStatusFilter==='__none__') return !i.location;
      if((i.invStatus||'')!==invStatusFilter) return false;
    }
    if(locNodeSet){
      if(!i.locationId||!locNodeSet.has(i.locationId)) return false;
    }
    return true;
  });
  const map={};
  for(const item of filtered){
    // Serialized units are individual lines (keyed by their own id); bulk records still
    // group by model (sku||mfg||model) so same-model bulk collapses into one row.
    const k=item.type==='serialized'?item.id:iKey(item);
    if(!map[k]) map[k]={key:k,sku:item.sku,manufacturer:item.manufacturer,model:item.model,items:[],totalQty:0,hasSerialized:false,hasBulk:false};
    map[k].items.push(item); map[k].totalQty+=item.qty;
    if(item.type==='serialized') map[k].hasSerialized=true;
    if(item.type==='bulk') map[k].hasBulk=true;
  }
  const {col,dir}=invSort;
  const groups=Object.values(map);
  // Pre-compute expensive sort keys once rather than inside the comparator
  if(col==='location'||col==='project'){
    for(const g of groups) g._sk=[...new Set(g.items.map(i=>i[col]).filter(Boolean))].join(',');
  }
  groups.sort((a,b)=>{
    const d=dir==='asc'?1:-1;
    let av,bv;
    if(col==='qty'){av=a.totalQty;bv=b.totalQty;return(av-bv)*d;}
    if(col==='par'){av=a.items[0]?.par||0;bv=b.items[0]?.par||0;return(av-bv)*d;}
    if(col==='type'){av=a.hasSerialized&&a.hasBulk?'mixed':a.hasSerialized?'serialized':'bulk';bv=b.hasSerialized&&b.hasBulk?'mixed':b.hasSerialized?'serialized':'bulk';}
    else if(col==='serial'){av=a.items[0]?.serial||'';bv=b.items[0]?.serial||'';}
    else if(col==='condition'){av=a.items[0]?.condition||'';bv=b.items[0]?.condition||'';}
    else if(col==='status'){av=a.items[0]?.status||'';bv=b.items[0]?.status||'';}
    else if(col==='location'||col==='project'){av=a._sk;bv=b._sk;}
    else{av=a[col]||'';bv=b[col]||'';}
    return String(av).toLowerCase().localeCompare(String(bv).toLowerCase())*d;
  });
  return groups;
}

function toggleGroup(key){expandedGroups.has(key)?expandedGroups.delete(key):expandedGroups.add(key);renderInvPage();}
function toggleScopeItem(id){expandedScopeItems.has(id)?expandedScopeItems.delete(id):expandedScopeItems.add(id);renderProjectScope(currentProjectId);}

function openInvModal(key){
  const skFn=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const groups=getInvGroups();
  const g=groups.find(g=>skFn(g.key)===key);
  if(!g) return;
  document.getElementById('inv-modal-mfg').textContent=g.manufacturer;
  document.getElementById('inv-modal-model').textContent=g.model;
  const skuEl=document.getElementById('inv-modal-sku');
  skuEl.textContent=g.sku||''; skuEl.style.display=g.sku?'':'none';
  const multi=g.items.length>1;
  let html='';
  if(multi){
    html+=`<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">${g.items.length} units</div>`;
    g.items.forEach((item,idx)=>{
      const c=item.condition||'New';
      const sOpts=isStockItem(item)?['On Hand','Out of Stock']:['Unallocated','Allocated','Deployed','Sold','Returned'];
      const sk2=skFn(item.id), gk=skFn(g.key);
      html+=`<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);">Unit ${idx+1}${item.serial?' — '+escHtml(item.serial):''}</span>
          <div style="display:flex;gap:5px;">
            <button class="btn-del" onclick="addToDeployCart('${sk2}');closeInvModal()" title="Deploy" style="color:var(--accent4);border-color:rgba(247,79,126,0.3);">⬆</button>
            <button class="btn-del" onclick="openTransferFromInv('${sk2}');closeInvModal()" title="Transfer" style="color:var(--accent);border-color:rgba(79,142,247,0.3);">⇄</button>
            <button class="btn-del" onclick="deleteInvItem('${sk2}');closeInvModal()">✕</button>
          </div>
        </div>
        ${item.type==='serialized'?`<div style="margin-bottom:8px;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">SERIAL</div>
          <div style="display:flex;gap:5px;align-items:center;">
            <input type="text" value="${escHtml(item.serial||'')}" placeholder="enter serial…"
              onchange="updateInvSerial('${sk2}',this.value)"
              style="flex:1;min-width:0;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;padding:5px 8px;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
            <button class="scan-btn" title="Scan barcode" onclick="openScanner(this.previousElementSibling)">⊡</button>
          </div>
        </div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">STATUS</div>
            <select onchange="updateInvStatus('${sk2}',this.value)"
              style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;padding:5px 6px;">
              ${sOpts.map(s=>`<option style="background:var(--surface2)"${(item.invStatus||item.status||'In Stock')===s?' selected':''}>${escHtml(s)}</option>`).join('')}
            </select>
          </div>
          <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">CONDITION</div>
            <span class="tag tag-${escHtml(c)}" style="font-size:11px;">${escHtml(c)}</span>
          </div>
          <div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">LOCATION</div>
            <select onchange="updateInvLocationInline('${sk2}',this.value)"
              style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;padding:5px 6px;">
              <option value="">— None —</option>
              ${leafLocationOptgroups('code',item.location||'')}
            </select>
          </div>
          ${item.project?`<div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">PROJECT</div><div style="font-size:12px;color:var(--text-muted)">${escHtml(item.project)}</div></div>`:''}
        </div>
      </div>`;
    });
  } else {
    const item=g.items[0];
    const c=item.condition||'New';
    const tc=item.type==='serialized'?'tag-s':'tag-b';
    const sOpts=isStockItem(item)?['On Hand','Out of Stock']:['Unallocated','Allocated','Deployed','Sold','Returned'];
    const sk2=skFn(item.id), gk=skFn(g.key);
    html=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">TYPE</div>
        <span class="tag ${tc}">${escHtml(item.type||'bulk')}</span>
      </div>
      <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">CONDITION</div>
        <span class="tag tag-${escHtml(c)}">${escHtml(c)}</span>
      </div>
      <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">QTY</div>
        <div class="qty-ctrl">
          <span class="qty-btn minus" onclick="adjustQty('${sk2}',-1);openInvModal('${gk}')">-</span>
          <span class="qty-badge ${tc}" id="inv-modal-qty">${item.qty}</span>
          <span class="qty-btn plus" onclick="adjustQty('${sk2}',1);openInvModal('${gk}')">+</span>
        </div>
      </div>
      <div><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">STATUS</div>
        <select onchange="updateInvStatus('${sk2}',this.value)"
          style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;padding:5px 6px;">
          ${sOpts.map(s=>`<option style="background:var(--surface2)"${(item.invStatus||item.status||'In Stock')===s?' selected':''}>${escHtml(s)}</option>`).join('')}
        </select>
      </div>
      ${item.type==='serialized'?`<div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">SERIAL</div>
        <div style="display:flex;gap:5px;align-items:center;">
          <input type="text" value="${(item.serial||'').replace(/"/g,'&quot;')}" placeholder="enter serial…"
            onchange="updateInvSerial('${sk2}',this.value)"
            style="flex:1;min-width:0;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;padding:5px 8px;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
          <button class="scan-btn" title="Scan barcode" onclick="openScanner(this.previousElementSibling)">⊡</button>
        </div>
      </div>`:''}
      <div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">LOCATION</div>
        <select onchange="updateInvLocationInline('${sk2}',this.value)"
          style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;padding:5px 6px;">
          <option value="">— None —</option>
          ${leafLocationOptgroups('code',item.location||'')}
        </select>
      </div>
      ${item.project?`<div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">PROJECT</div><div style="font-size:12px;color:var(--text-muted)">${escHtml(item.project)}</div></div>`:''}
    </div>
    <div style="display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--border);">
      <button class="btn" onclick="addToDeployCart('${sk2}');closeInvModal()" style="flex:1;font-size:12px;background:rgba(247,79,126,0.1);color:var(--accent4);border-color:rgba(247,79,126,0.3);">⬆ Deploy</button>
      <button class="btn btn-ghost" onclick="openTransferFromInv('${sk2}');closeInvModal()" style="flex:1;font-size:12px;">⇄ Transfer</button>
      <button class="btn btn-ghost" onclick="deleteInvItem('${sk2}');closeInvModal()" style="flex:1;font-size:12px;color:var(--accent4);border-color:rgba(247,79,126,0.3);">✕ Delete</button>
    </div>`;
  }
  document.getElementById('inv-modal-body').innerHTML=html;
  document.getElementById('inv-detail-modal').style.display='flex';
}

function closeInvModal(){
  document.getElementById('inv-detail-modal').style.display='none';
}


function renderInvTable(){
  applySortClasses('inv');
  refreshInvLocFilters();
  populateInvLocSelect();
  populateInvProjSelect();
  invFilteredCache=getInvGroups();
  const _eff=invPageSize||invFilteredCache.length||1;
  const maxPage=Math.max(0,Math.ceil(invFilteredCache.length/_eff)-1);
  if(invPage>maxPage) invPage=0;
  renderInvPage();
}

function renderInvPage(){
  const groups=invFilteredCache;
  const tbody=document.getElementById('inv-tbody');
  const pag=document.getElementById('inv-pagination');
  const isStockView=false;
  if(!groups.length){
    tbody.innerHTML=`<tr><td colspan="14"><div class="empty-state"><div class="empty-icon">⬡</div><div style="font-size:13px">${inventory.length?'No items match.':'No inventory yet. Add items below.'}</div></div></td></tr>`;
    if(pag) pag.style.display='none';
    return;
  }
  // Build leaf location optgroups once per page render (avoids O(n * locations) calls)
  const _leafOpts=(()=>{
    const parentIds=new Set(locations.map(l=>l.parentId).filter(Boolean));
    const leaves=locations.filter(l=>l.tierIndex>0&&!parentIds.has(l.id));
    const staging=leaves.filter(l=>l.type==='staging').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
    const general=leaves.filter(l=>l.type==='general').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
    const makeOpts=(arr,sel)=>arr.map(l=>{const s=sel===l.code?' selected':'';return `<option value="${escHtml(l.code)}"${s}>${escHtml(l.code)}</option>`;}).join('');
    return(sel='')=>(staging.length?`<optgroup label="── Staging ──">${makeOpts(staging,sel)}</optgroup>`:'')
      +(general.length?`<optgroup label="── General Stock ──">${makeOpts(general,sel)}</optgroup>`:'');
  })();
  // Build project lookup map once per page render
  const projById=new Map(projects.map(p=>[p.id,p]));
  const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const start=invPageSize?invPage*invPageSize:0;
  const pageGroups=invPageSize?groups.slice(start,start+invPageSize):groups;
  let html='';
  for(const g of pageGroups){
    const isOpen=expandedGroups.has(g.key), multi=g.items.length>1;
    const qc=g.hasSerialized&&g.hasBulk?'qty-m':g.hasSerialized?'qty-s':'qty-b';
    const tc=g.hasSerialized&&g.hasBulk?'tag-m':g.hasSerialized?'tag-s':'tag-b';
    const tl=g.hasSerialized&&g.hasBulk?'mixed':g.hasSerialized?'serialized':'bulk';
    const locs=[...new Set(g.items.map(i=>i.location).filter(Boolean))];
    const locStr=locs.length?locs.slice(0,2).map(escHtml).join(', ')+(locs.length>2?` +${locs.length-2}`:''):'<span class="dim">—</span>';
    const cond=g.items[0].condition||'New', stat=(g.items[0].status||'In Stock').replace(/\s+/g,'');
    // Only show "varies" when the group's values genuinely differ (not just because qty>1)
    const conds=[...new Set(g.items.map(i=>i.condition||'New'))];
    const condVaries=conds.length>1;
    const stats=[...new Set(g.items.map(i=>i.invStatus||i.status||'In Stock'))];
    const statVaries=stats.length>1;
    const serials=g.items.filter(i=>i.type==='serialized'&&i.serial).map(i=>i.serial);
    const serialCell=multi
      ? (serials.length?`<span class="dim" style="font-size:11px">${serials.length} serial${serials.length>1?'s':''}</span>`:'<span class="dim">—</span>')
      : (g.items[0].type==='serialized'
          ? `<div style="display:flex;gap:4px;align-items:center;">
              <input type="text" value="${escHtml(g.items[0].serial||'')}" placeholder="scan or type serial…"
                data-inv-serial autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                onclick="event.stopPropagation()"
                onkeydown="commitInvSerialKey(event,'${sk(g.items[0].id)}')"
                onchange="updateInvSerial('${sk(g.items[0].id)}',this.value)"
                style="flex:1;min-width:0;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;padding:2px 5px;"
                onfocus="this.style.borderColor='var(--accent)';this.select()" onblur="this.style.borderColor='var(--border)'">
              <button class="scan-btn" title="Scan barcode" style="width:24px;height:24px;font-size:12px;" onclick="event.stopPropagation();openScanner(this.previousElementSibling)">⊡</button>
            </div>`
          : (g.items[0].serial?`<span class="mono" style="font-size:11px">${escHtml(g.items[0].serial)}</span>`:'<span class="dim">—</span>'));
    const qtyCell=multi
      ? `<span class="qty-badge ${qc}">${g.totalQty}</span>`
      : `<div class="qty-ctrl"><span class="qty-btn minus" onclick="adjustQty('${g.items[0].id}',-1)">-</span><span class="qty-badge ${qc}">${g.totalQty}</span><span class="qty-btn plus" onclick="adjustQty('${g.items[0].id}',1)">+</span></div>`;
    const firstItem=g.items[0];
    const stockItem=isStockItem(firstItem);
    const par=firstItem.par||0;
    const qty=g.totalQty;
    let rowBg='';
    if(isStockView&&stockItem){
      if(qty===0)          rowBg='background:rgba(247,79,126,0.12);';
      else if(qty<par)     rowBg='background:rgba(247,201,79,0.10);';
      else                 rowBg='background:rgba(79,247,160,0.07);';
    }
    const parCell=isStockView
      ? `<td class="mono" style="display:table-cell">
          <input type="number" value="${par}" min="0" step="1"
            onchange="updateInvPar('${sk(firstItem.id)}',this.value)"
            onclick="event.stopPropagation()"
            style="width:46px;padding:3px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
        </td>`
      : `<td style="display:none"></td>`;
    const statusOptions=stockItem?['On Hand','Out of Stock']:['Unallocated','Allocated','Deployed','Sold','Returned'];
    const statColors={Unallocated:'var(--text-dim)',Allocated:'var(--accent)',Deployed:'var(--accent4)',Returned:'var(--warn)','On Hand':'var(--accent3)','Out of Stock':'var(--warn)','In Stock':'var(--text-dim)'};
    const statusCell=multi
      ? (statVaries
          ? '<span class="dim">varies</span>'
          : `<span style="font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid ${statColors[stats[0]]||'var(--text-dim)'};color:${statColors[stats[0]]||'var(--text-dim)'};white-space:nowrap;">${escHtml(stats[0])}</span>`)
      : `<select onclick="event.stopPropagation()" onchange="updateInvStatus('${sk(firstItem.id)}',this.value)"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;padding:2px 4px;cursor:pointer;width:100%;">
          ${statusOptions.map(s=>`<option style="background:var(--surface2);color:var(--text)"${(firstItem.invStatus||firstItem.status||'In Stock')===s?' selected':''}>${escHtml(s)}</option>`).join('')}
        </select>`;
    const invStatuses=[...new Set(g.items.map(i=>i.invStatus).filter(Boolean))];
    const invStatusStr=invStatuses.length===1?invStatuses[0]:invStatuses.length>1?'mixed':'';
    const invStatusColor=invStatusStr==='Unallocated'?'var(--text-dim)':invStatusStr==='Allocated'?'var(--accent)':invStatusStr==='Deployed'?'var(--accent4)':invStatusStr==='Returned'?'var(--warn)':'var(--text-dim)';
    const invStatusBadge=invStatusStr?`<span style="font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid ${invStatusColor};color:${invStatusColor};white-space:nowrap;">${escHtml(invStatusStr)}</span>`:'';
    const selBox=multi
      ? `<input type="checkbox" class="inv-selbox" onclick="event.stopPropagation()" onchange="toggleInvSelectGroup('${g.items.map(i=>i.id).join(',')}',this.checked)">`
      : `<input type="checkbox" class="inv-selbox" data-inv-select="${firstItem.id}" onclick="event.stopPropagation()" onchange="toggleInvSelect('${sk(firstItem.id)}',this.checked)"${invSelected.has(firstItem.id)?' checked':''}>`;
    html+=`<tr class="group-row" data-gkey="${sk(g.key)}" style="${rowBg}">
      <td class="mobile-hide" style="text-align:center">${selBox}</td>
      <td class="mobile-hide">${multi?`<span class="caret${isOpen?' open':''}">▶</span>`:'<span class="caret-spacer"></span>'}</td>
      <td class="sku-cell mobile-hide">${g.sku?escHtml(g.sku):'<span class="dim">—</span>'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(g.manufacturer)}">${escHtml(g.manufacturer)}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(g.model)}">${escHtml(g.model)}</td>
      <td class="mobile-hide">${qtyCell}</td>
      ${parCell}
      <td class="mobile-hide">${multi
        ? `<span class="tag ${tc}">${tl}</span>`
        : `<select onclick="event.stopPropagation()" onchange="convertInvType('${sk(g.key)}',this.value)"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;padding:2px 4px;cursor:pointer;width:100%;">
            <option value="bulk"${!g.hasSerialized?' selected':''}>bulk</option>
            <option value="serialized"${g.hasSerialized?' selected':''}>serialized</option>
          </select>`
      }</td>
      <td class="mobile-hide">${serialCell}</td>
      <td class="mobile-hide">${condVaries?'<span class="dim">varies</span>':`<span class="tag tag-${escHtml(cond)}">${escHtml(cond)}</span>`}</td>
      <td class="mobile-hide">${statusCell}</td>
      <td class="mobile-hide">${multi
        ? `<span class="mono" style="font-size:11px">${locStr}</span>`
        : `<select onclick="event.stopPropagation()" onchange="updateInvLocationInline('${sk(firstItem.id)}',this.value)"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;padding:2px 4px;cursor:pointer;width:100%;">
            <option value="">— None —</option>
            ${_leafOpts(firstItem.location||'')}
          </select>`
      }</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${(()=>{const gh=_invProjGroupHtml(g.items);if(gh)return gh;return (!multi && !stockItem)?_invAllocSelectHtml(firstItem.id):'<span class="dim">—</span>';})()}</td>
      <td class="mobile-hide" style="white-space:nowrap">${!multi?`
        <button class="btn-del" onclick="event.stopPropagation();addToDeployCart('${sk(firstItem.id)}')" title="Add to Deployment Cart" style="margin-right:3px;color:var(--accent4);border-color:rgba(247,79,126,0.3);">⬆</button>
        <button class="btn-del" onclick="event.stopPropagation();openStatusModal('${sk(firstItem.id)}')" title="Change status / undeploy" style="margin-right:3px;color:var(--accent3);border-color:rgba(79,247,160,0.3);">⟳</button>
        <button class="btn-del" onclick="event.stopPropagation();openTransferFromInv('${sk(firstItem.id)}')" title="Transfer / Relocate" style="margin-right:3px;color:var(--accent);border-color:rgba(79,142,247,0.3);">⇄</button>
        <button class="btn-del" data-del="${firstItem.id}">✕</button>`:''}</td>
    </tr>`;
    if(multi) for(const item of g.items){
      const c=(item.condition||'New'), s=(item.status||'In Stock').replace(/\s+/g,'');
      const childSerial=item.type==='serialized'
        ?`<div style="display:flex;gap:4px;align-items:center;">
            <input type="text" value="${escHtml(item.serial||'')}" placeholder="enter serial…"
              onclick="event.stopPropagation()"
              onchange="updateInvSerial('${sk(item.id)}',this.value)"
              style="flex:1;min-width:0;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;padding:2px 5px;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
            <button class="scan-btn" title="Scan barcode" style="width:24px;height:24px;font-size:12px;" onclick="event.stopPropagation();openScanner(this.previousElementSibling)">⊡</button>
          </div>`
        :'<span class="dim">—</span>';
      const childQty=`<div class="qty-ctrl"><span class="qty-btn minus" onclick="adjustQty('${sk(item.id)}',-1)">-</span><span class="qty-badge ${item.type==='serialized'?'qty-s':'qty-b'}">${item.qty}</span><span class="qty-btn plus" onclick="adjustQty('${sk(item.id)}',1)">+</span></div>`;
      const childStatusOpts=isStockItem(item)?['On Hand','Out of Stock']:['Unallocated','Allocated','Deployed','Sold','Returned'];
      let childRowBg='';
      if(isStockView&&isStockItem(item)){
        if(item.qty===0)                childRowBg='background:rgba(247,79,126,0.12);';
        else if(item.qty<(item.par||0)) childRowBg='background:rgba(247,201,79,0.10);';
        else                            childRowBg='background:rgba(79,247,160,0.07);';
      }
      const childInvStatus=item.invStatus||'';
      const childInvStatusColor=childInvStatus==='Unallocated'?'var(--text-dim)':childInvStatus==='Allocated'?'var(--accent)':childInvStatus==='Deployed'?'var(--accent4)':childInvStatus==='Returned'?'var(--warn)':'var(--text-dim)';
      const childInvBadge=childInvStatus?`<span style="font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid ${childInvStatusColor};color:${childInvStatusColor};">${escHtml(childInvStatus)}</span>`:'';
      html+=`<tr class="child-row${isOpen?' visible':''}" data-group="${sk(g.key)}" style="${childRowBg}">
        <td class="mobile-hide" style="text-align:center"><input type="checkbox" class="inv-selbox" data-inv-select="${item.id}" onclick="event.stopPropagation()" onchange="toggleInvSelect('${sk(item.id)}',this.checked)"${invSelected.has(item.id)?' checked':''}></td>
        <td></td><td class="mobile-hide"></td><td></td>
        <td style="padding-left:38px;font-size:12px">
          <select onclick="event.stopPropagation()" onchange="convertInvType('${sk(g.key)}',this.value)"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:10px;color:var(--text);outline:none;padding:1px 3px;cursor:pointer;">
            <option value="bulk"${item.type!=='serialized'?' selected':''}>bulk</option>
            <option value="serialized"${item.type==='serialized'?' selected':''}>serialized</option>
          </select>
        </td>
        <td>${childQty}</td>
        ${isStockView?`<td style="display:table-cell"></td>`:`<td style="display:none"></td>`}
        <td class="mobile-hide"></td>
        <td class="mobile-hide">${childSerial}</td>
        <td class="mobile-hide"><span class="tag tag-${escHtml(c)}" style="font-size:9px">${escHtml(c)}</span></td>
        <td><select onclick="event.stopPropagation()" onchange="updateInvStatus('${sk(item.id)}',this.value)"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-ui);font-size:11px;color:var(--text);outline:none;padding:2px 4px;cursor:pointer;width:100%;">
          ${childStatusOpts.map(st=>`<option style="background:var(--surface2);color:var(--text)"${(item.invStatus||item.status||'In Stock')===st?' selected':''}>${escHtml(st)}</option>`).join('')}
        </select></td>
        <td class="mobile-hide mono" style="font-size:11px;color:var(--text-muted)">
          <select onclick="event.stopPropagation()" onchange="updateInvLocationInline('${sk(item.id)}',this.value)"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;padding:2px 4px;cursor:pointer;width:100%;">
            <option value="">— None —</option>
            ${_leafOpts(item.location||'')}
          </select>
        </td>
        <td class="mobile-hide" style="font-size:12px">${_invProjCellHtml(item)}</td>
        <td style="white-space:nowrap">
          <button class="btn-del" onclick="event.stopPropagation();addToDeployCart('${sk(item.id)}')" title="Add to Deployment Cart" style="margin-right:3px;color:var(--accent4);border-color:rgba(247,79,126,0.3);">⬆</button>
          <button class="btn-del" onclick="event.stopPropagation();openStatusModal('${sk(item.id)}')" title="Change status / undeploy" style="margin-right:3px;color:var(--accent3);border-color:rgba(79,247,160,0.3);">⟳</button>
          <button class="btn-del" onclick="event.stopPropagation();openTransferFromInv('${sk(item.id)}')" title="Transfer / Relocate" style="margin-right:3px;color:var(--accent);border-color:rgba(79,142,247,0.3);">⇄</button>
          <button class="btn-del" data-del="${sk(item.id)}">✕</button>
        </td>
      </tr>`;
    }
  }
  tbody.innerHTML=html;
  if(pag){
    const eff=invPageSize||groups.length||1;
    const totalPages=Math.ceil(groups.length/eff);
    const showNav=totalPages>1;
    pag.style.display=groups.length?'flex':'none';
    const prevBtn=document.getElementById('inv-pag-prev');
    const nextBtn=document.getElementById('inv-pag-next');
    const jumpSel=document.getElementById('inv-pag-jump');
    const infoEl=document.getElementById('inv-pag-info');
    const sizeSel=document.getElementById('inv-page-size');
    if(prevBtn){prevBtn.style.display=showNav?'':'none';prevBtn.disabled=invPage===0;}
    if(nextBtn){nextBtn.style.display=showNav?'':'none';nextBtn.disabled=invPage>=totalPages-1;}
    if(jumpSel){
      jumpSel.style.display=showNav?'':'none';
      if(showNav) jumpSel.innerHTML=Array.from({length:totalPages},(_,i)=>`<option value="${i}"${i===invPage?' selected':''}>Page ${i+1}</option>`).join('');
    }
    if(infoEl) infoEl.textContent=invPageSize?`${start+1}–${Math.min(start+invPageSize,groups.length)} of ${groups.length.toLocaleString()}`:`All ${groups.length.toLocaleString()}`;
    if(sizeSel) sizeSel.value=String(invPageSize);
  }
}

function filterInv(q){
  invFilterQuery=q;
  clearTimeout(invSearchTimer);
  invSearchTimer=setTimeout(()=>{invPage=0;renderInvTable();},150);
}
function invPagPrev(){if(invPage>0){invPage--;renderInvPage();}}
function invPagNext(){const e=invPageSize||invFilteredCache.length||1;if(invPage<Math.ceil(invFilteredCache.length/e)-1){invPage++;renderInvPage();}}
function invPagJump(val){invPage=parseInt(val)||0;renderInvPage();}
function invSetPageSize(val){invPageSize=parseInt(val)||0;invPage=0;renderInvPage();}

function setInvLocationFilter(val){ /* legacy no-op */ }

function setInvStatusFilter(val){
  invStatusFilter=val;
  invPage=0;
  renderInvTable();
  // Mirror the active filter into the always-visible desktop add form (the mobile FAB
  // sheet gets this on open; the desktop add-bar has no open event, so sync on change).
  if(!scanModeActive) _applyFilterHintsToForm();
}

function invLocFilterT1Change(){
  const t1=document.getElementById('inv-loc-f1');
  const t2=document.getElementById('inv-loc-f2');
  const t3=document.getElementById('inv-loc-f3');
  if(!t1.value){
    invLocFilterNodeId='';
    t2.innerHTML=`<option value="">${escHtml(_locCascadeTierName(2)||'Rack')}…</option>`; t2.disabled=true; t2.style.opacity='0.5';
    t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`; t3.disabled=true; t3.style.opacity='0.5';
    invPage=0; renderInvTable(); return;
  }
  invLocFilterNodeId=t1.value;
  const t2Nodes=locations.filter(l=>l.parentId===t1.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`; t3.disabled=true; t3.style.opacity='0.5';
  if(t2Nodes.length){
    const t2Name=_locCascadeTierName(2)||'Rack';
    t2.innerHTML=`<option value="">${escHtml(t2Name)}…</option>`+t2Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
    t2.disabled=false; t2.style.opacity='1';
  } else {
    t2.innerHTML=`<option value="">${escHtml(_locCascadeTierName(2)||'Rack')}…</option>`; t2.disabled=true; t2.style.opacity='0.5';
  }
  invPage=0; renderInvTable();
  if(!scanModeActive) _applyFilterHintsToForm();
}

function invLocFilterT2Change(){
  const t1=document.getElementById('inv-loc-f1');
  const t2=document.getElementById('inv-loc-f2');
  const t3=document.getElementById('inv-loc-f3');
  if(!t2.value){
    invLocFilterNodeId=t1.value||'';
    t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`; t3.disabled=true; t3.style.opacity='0.5';
    invPage=0; renderInvTable(); return;
  }
  invLocFilterNodeId=t2.value;
  const t3Nodes=locations.filter(l=>l.parentId===t2.value).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(t3Nodes.length){
    const t3Name=_locCascadeTierName(3)||'Shelf';
    t3.innerHTML=`<option value="">${escHtml(t3Name)}…</option>`+t3Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
    t3.disabled=false; t3.style.opacity='1';
  } else {
    t3.innerHTML=`<option value="">${escHtml(_locCascadeTierName(3)||'Shelf')}…</option>`; t3.disabled=true; t3.style.opacity='0.5';
  }
  invPage=0; renderInvTable();
  if(!scanModeActive) _applyFilterHintsToForm();
}

function invLocFilterT3Change(){
  const t2=document.getElementById('inv-loc-f2');
  const t3=document.getElementById('inv-loc-f3');
  invLocFilterNodeId=t3.value||t2.value||'';
  invPage=0; renderInvTable();
  if(!scanModeActive) _applyFilterHintsToForm();
}

function _locDescendants(nodeId){
  const result=new Set();
  const queue=[nodeId];
  while(queue.length){
    const id=queue.shift();
    result.add(id);
    locations.filter(l=>l.parentId===id).forEach(l=>queue.push(l.id));
  }
  return result;
}

function refreshInvLocFilters(){
  // Refresh status dropdown
  const statusSel=document.getElementById('inv-status-filter');
  if(statusSel){
    const cur=statusSel.value;
    const statuses=[...new Set(inventory.map(i=>i.invStatus).filter(Boolean))].sort();
    statusSel.innerHTML='<option value="">All Status</option>'
      +(inventory.some(i=>!i.location)?'<option value="__none__">— No Location —</option>':'')
      +statuses.map(s=>`<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
    if(cur && [...statusSel.options].some(o=>o.value===cur)) statusSel.value=cur;
    else if(cur){ statusSel.value=''; invStatusFilter=''; }
  }
  // Initialize T1 if empty (first load or location data changed)
  const t1=document.getElementById('inv-loc-f1');
  if(t1 && t1.options.length<=1){
    const t1Nodes=locations.filter(l=>+(l.tierIndex)===1).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
    const t1Name=_locCascadeTierName(1)||'Aisle';
    t1.innerHTML=`<option value="">${escHtml(t1Name)}…</option>`+t1Nodes.map(l=>`<option value="${escHtml(l.id)}">${escHtml(l.code)}</option>`).join('');
  }
}
function updateInvLocation(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.location=val.trim();
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
}

function updateInvLocationInline(id, code){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.location=code;
  const locRec=code?locations.find(l=>l.code===code):null;
  item.locationId=locRec?locRec.id:'';
  // Auto-update status based on location type
  if(!isStockItem(item)){
    if(!code) { /* no location change to status */ }
    else if(locRec?.type==='staging') { item.invStatus='Staged'; item.status='Staged'; }
    else if(locRec?.type==='general' && item.invStatus==='Unallocated') { /* keep */ }
  }
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true); updateInvStats();
}

function updateInvSerial(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.serial=val.trim();
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
}

// Wedge/handheld barcode scanners "type" the code then send an Enter (sometimes Tab).
// Commit on that terminator so the scan actually saves (blur-only was too easy to miss),
// then jump to the next serial field so a run of items can be scanned back-to-back.
function commitInvSerialKey(e, id){
  if(e.key!=='Enter'&&e.key!=='Tab') return;
  e.preventDefault();
  const el=e.currentTarget;
  updateInvSerial(id, el.value);
  if(el.value.trim()) toast('Serial saved: '+el.value.trim(),'success');
  const fields=[...document.querySelectorAll('input[data-inv-serial]')];
  const next=fields[fields.indexOf(el)+1];
  if(next){ next.focus(); next.select(); } else el.blur();
}

// ── Bulk stack merge ─────────────────────────────────────────────────────────
// Bulk units of the same item, in the same location, condition, and allocation
// state are ONE stack — not a pile of qty-1 records. Call this whenever a bulk
// record lands in a new state (allocated to a project, released back to stock)
// so partial splits recombine instead of leaving a trail behind them.
//
// `keep` survives and absorbs every other matching record; scope links pointing
// at an absorbed record are repointed at the survivor so filled counts hold.
// Transfer/deployment history stores its own mfg/model/qty, so absorbed ids
// leave the audit trail readable.
//
// This is also the persist point for `keep` — it always saves it. Callers must
// NOT dbSave a record before merging it: dbSave and dbDelete are fire-and-forget
// and can land out of order, which would resurrect a stack that was merged away.
// Ids in `freshIds` were created this operation and never persisted, so they are
// dropped from memory without a DELETE.
function mergeBulkStacks(keep, freshIds){
  if(!keep) return keep;
  if(keep.type==='serialized'){ dbSave('inventory',keep); return keep; }

  // Everything sitting on the shelf counts as one state, whatever the historical
  // wording of its invStatus ("In Stock" from receiving, "Unallocated" from an
  // unfill, "On Hand", or blank on older records).
  const state=inv=>_isShelfStatus(inv.invStatus)?'stock':(inv.invStatus||'');
  const keepState=state(keep);
  const dupes=inventory.filter(o=>
    o.id!==keep.id && o.type!=='serialized' &&
    (o.sku||'')===(keep.sku||'') &&
    o.manufacturer===keep.manufacturer && o.model===keep.model &&
    (o.location||'')===(keep.location||'') && (o.locationId||'')===(keep.locationId||'') &&
    (o.condition||'')===(keep.condition||'') &&
    (o.projectId||'')===(keep.projectId||'') &&
    state(o)===keepState
  );

  if(dupes.length){
    const dupeIds=new Set(dupes.map(d=>d.id));
    keep.qty=(keep.qty||1)+dupes.reduce((s,d)=>s+(d.qty||1),0);
    keep.lastUpdated=new Date().toLocaleDateString('en-US');

    const touched=new Set();
    projectItems.forEach(si=>{
      if(Array.isArray(si.inventoryIds)&&si.inventoryIds.some(id=>dupeIds.has(id))){
        si.inventoryIds=[...new Set(si.inventoryIds.map(id=>dupeIds.has(id)?keep.id:id))];
        touched.add(si);
      }
      // An absorbed id can't be excluded any more — the survivor carries the
      // exclusion only if it was unfilled in its own right.
      if(Array.isArray(si.unfilledIds)&&si.unfilledIds.some(id=>dupeIds.has(id))){
        si.unfilledIds=si.unfilledIds.filter(id=>!dupeIds.has(id));
        touched.add(si);
      }
    });

    inventory=inventory.filter(i=>!dupeIds.has(i.id));
    dbDeleteMany('inventory',[...dupeIds].filter(id=>!(freshIds&&freshIds.has(id))));
    touched.forEach(si=>dbSave('projectItems',si));
  }

  dbSave('inventory',keep);
  return keep;
}

// Shelf = available stock, in any of the wordings the data has carried over time.
function _isShelfStatus(st){
  return !st || st==='Unallocated' || st==='In Stock' || st==='On Hand';
}

// ── Backfill: inventory saved before a SKU was required ──────────────────────
// Resolves each blank-SKU record against the catalog by its own manufacturer +
// model, creating the catalog entry when that pair is new. Records with neither
// can't be identified — they are listed for manual triage rather than guessed at.
// Run from the console: repairMissingSkus()
function repairMissingSkus(){
  const blank=inventory.filter(i=>!i.sku);
  const today=new Date().toLocaleDateString('en-US');
  const fixed=[], stuck=[];
  blank.forEach(i=>{
    const sku=ensureCatalogSku({manufacturer:i.manufacturer, model:i.model, category:i.category});
    if(sku){
      i.sku=sku; i.lastUpdated=today; dbSave('inventory', i);
      fixed.push({id:i.id, sku, manufacturer:i.manufacturer, model:i.model});
    } else {
      stuck.push({id:i.id, manufacturer:i.manufacturer||'—', model:i.model||'—',
        qty:i.qty, po:i.poNumber||'—', location:i.location||'—', added:i.dateAdded||'—'});
    }
  });
  if(fixed.length){ setDirty(true); updateInvStats(); renderInvTable(); renderStockTable(); }
  console.log(`repairMissingSkus: ${blank.length} blank · ${fixed.length} assigned · ${stuck.length} unidentifiable`);
  if(fixed.length) console.table(fixed);
  if(stuck.length) console.table(stuck);
  toast(`${fixed.length} SKU${fixed.length!==1?'s':''} assigned${stuck.length?` · ${stuck.length} need a manufacturer + model`:''}`,
    stuck.length?'error':'success');
  return {blank:blank.length, fixed, stuck};
}

function convertInvType(gKey, newType){
  const today=new Date().toLocaleDateString('en-US');
  // Find all items in this group
  // gKey is a model iKey (bulk group) or a serialized unit's own id — match either.
  const groupItems=inventory.filter(i=>iKey(i)===gKey||i.id===gKey);
  if(!groupItems.length) return;

  const currentType=groupItems[0].type;
  if(currentType===newType) return; // no-op

  if(newType==='serialized'){
    // Bulk → Serialized: split each bulk record into qty individual serialized records
    const newItems=[];
    for(const item of groupItems){
      const qty=item.qty||1;
      for(let n=0;n<qty;n++){
        newItems.push({...item, id:n===0?item.id:uid(), type:'serialized', qty:1, serial:'', lastUpdated:today});
      }
    }
    // Remove originals, insert new. Some new records REUSE an original id (n===0), so
    // only DELETE ids that aren't being re-saved — deleting and REPLACE-ing the same PK
    // as parallel fire-and-forget requests can race and drop the record.
    const ids=new Set(groupItems.map(i=>i.id));
    const savedIds=new Set(newItems.map(i=>i.id));
    const delIds=[...ids].filter(id=>!savedIds.has(id));
    inventory=inventory.filter(i=>!ids.has(i.id));
    inventory.push(...newItems);
    dbDeleteMany('inventory', delIds);
    dbSaveMany('inventory', newItems);
    expandedGroups.add(gKey);
  } else {
    // Serialized → Bulk: collapse all into one record with summed qty
    const totalQty=groupItems.reduce((s,i)=>s+(i.qty||1),0);
    const base={...groupItems[0], type:'bulk', qty:totalQty, serial:'', lastUpdated:today};
    const ids=new Set(groupItems.map(i=>i.id));
    // base reuses groupItems[0].id — delete only the other units so the reused PK
    // isn't deleted-then-replaced in a race.
    const delIds2=[...ids].filter(id=>id!==base.id);
    inventory=inventory.filter(i=>!ids.has(i.id));
    inventory.push(base);
    dbDeleteMany('inventory', delIds2);
    dbSave('inventory', base);
    expandedGroups.delete(gKey);
  }
  setDirty(true); updateInvStats(); renderInvTable();
}

function updateInvStatus(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.invStatus=val;
  item.status=val;
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true); updateInvStats();
}

function deployInvItem(id){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.invStatus='Deployed';
  item.status='Deployed';
  item.location='';
  item.locationId='';
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true); updateInvStats(); renderInvTable();
  toast(`${item.model} marked as Deployed`,'success');
}

// Leaf-location <option>s for pickers outside renderInvPage (mirrors the in-render _leafOpts).
function leafLocationOptions(sel){
  const parentIds=new Set(locations.map(l=>l.parentId).filter(Boolean));
  const leaves=locations.filter(l=>l.tierIndex>0&&!parentIds.has(l.id));
  const grp=(type,label)=>{
    const arr=leaves.filter(l=>l.type===type).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
    return arr.length?`<optgroup label="${label}">`+arr.map(l=>`<option value="${escHtml(l.code)}"${sel===l.code?' selected':''}>${escHtml(l.code)}</option>`).join('')+'</optgroup>':'';
  };
  return grp('staging','── Staging ──')+grp('general','── General Stock ──');
}

// ── CHANGE STATUS / UNDEPLOY ──
// A button+modal to correct an item's status (e.g. undeploy back to Allocated), optionally
// set/restore a location, and log the change (with a reason) to the transfers audit trail.
const INV_STATUS_CHOICES=['Unallocated','Allocated','Staged','Deployed','Returned','Sold','On Hand','Out of Stock'];
function openStatusModal(id){
  const it=inventory.find(i=>i.id===id); if(!it){ toast('Item not found','error'); return; }
  const cur=it.invStatus||it.status||'';
  const choices=(cur && !INV_STATUS_CHOICES.includes(cur))?[cur,...INV_STATUS_CHOICES]:INV_STATUS_CHOICES;
  let ov=document.getElementById('inv-status-modal-ov'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='inv-status-modal-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:600;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closeStatusModal(); };
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);">
      <div style="font-size:16px;font-weight:700;">⟳ Change Status</div>
      <button onclick="closeStatusModal()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:13px;">${escHtml(it.manufacturer||'')} <b>${escHtml(it.model||'')}</b>${it.serial?` <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);">${escHtml(it.serial)}</span>`:''}</div>
      <div style="font-size:11px;color:var(--text-dim);">Currently: <b style="color:var(--text)">${escHtml(cur||'—')}</b>${it.location?` · ${escHtml(it.location)}`:''}</div>
      <div>
        <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">New status</label>
        <select id="status-new" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
          ${choices.map(s=>`<option${s===cur?' selected':''}>${escHtml(s)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Location (set/restore)</label>
        <select id="status-loc" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
          <option value="">— None —</option>${leafLocationOptions(it.location||'')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Reason (optional — logged)</label>
        <input id="status-reason" type="text" placeholder="e.g. deployed by mistake — staying in warehouse" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--border);">
      <button class="btn btn-ghost" onclick="closeStatusModal()" style="font-size:12px;">Cancel</button>
      <button class="btn" onclick="applyStatusChange('${id}')" style="font-size:12px;background:rgba(79,247,160,0.14);color:var(--accent3);border:1px solid rgba(79,247,160,0.3);">Save</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function closeStatusModal(){ const o=document.getElementById('inv-status-modal-ov'); if(o) o.remove(); }
function applyStatusChange(id){
  const it=inventory.find(i=>i.id===id); if(!it) return;
  const newStatus=(document.getElementById('status-new')||{}).value||'';
  const newLoc=(document.getElementById('status-loc')||{}).value||'';
  const reason=((document.getElementById('status-reason')||{}).value||'').trim();
  const oldStatus=it.invStatus||it.status||'', oldLoc=it.location||'';
  if(newStatus===oldStatus && newLoc===oldLoc){ toast('No change','' ); closeStatusModal(); return; }
  it.invStatus=newStatus; it.status=newStatus;
  it.location=newLoc;
  const locRec=newLoc?locations.find(l=>l.code===newLoc):null;
  it.locationId=locRec?locRec.id:'';
  it.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', it);
  const xfr={id:uid(), timestamp:new Date().toISOString(), inventoryId:it.id, sku:it.sku||'',
    manufacturer:it.manufacturer||'', model:it.model||'', serial:it.serial||'', qty:it.qty||1,
    fromProjectId:it.projectId||'', fromProject:it.project||'', toProjectId:it.projectId||'', toProject:'',
    fromLocation:oldLoc, fromLocationId:'', toLocation:newLoc||newStatus, toLocationId:it.locationId||'',
    notes:`Status: ${oldStatus||'—'} → ${newStatus}${(oldLoc!==newLoc)?` · loc ${oldLoc||'—'}→${newLoc||'—'}`:''}${reason?` — ${reason}`:''}`};
  transfers.push(xfr); dbSave('transfers', xfr);
  setDirty(true); updateInvStats(); renderInvTable();
  closeStatusModal();
  toast(`Status → ${newStatus}`,'success');
}

function updateInvPar(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.par=Math.max(0,parseInt(val)||0);
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true); renderInvTable();
}

function getKnownVendors(){
  const s=new Set();
  vendors.forEach(v=>{ if(v.name) s.add(v.name); });
  orders.forEach(o=>{ if(o.vendor) s.add(o.vendor); });
  return [...s].sort((a,b)=>a.localeCompare(b));
}
// Find-or-create a vendor by name; returns its id (creates + persists a record if new).
function resolveVendorId(name){
  name=(name||'').trim(); if(!name) return '';
  let v=vendors.find(x=>(x.name||'').trim().toLowerCase()===name.toLowerCase());
  if(!v){ v={id:uid(), name}; vendors.push(v); dbSave('vendors', v); }
  return v.id;
}

function acVendor(inputId){
  const inp=document.getElementById(inputId); if(!inp) return;
  const ddId='dd-'+inputId;
  const dd=document.getElementById(ddId); if(!dd) return;
  const q=inp.value.trim().toLowerCase();
  const vendors=getKnownVendors().filter(v=>!q||v.toLowerCase().includes(q));
  if(!vendors.length){ dd.classList.remove('open'); return; }
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  dd.innerHTML=vendors.map(v=>{
    const safe=escHtml(v);
    const hi=q?safe.replace(new RegExp(`(${esc(q)})`,'gi'),'<mark>$1</mark>'):safe;
    return `<div class="ac-option" data-val="${escHtml(v)}" onmousedown="acVendorSelect(event,'${inputId}')">${hi}</div>`;
  }).join('');
  dd.classList.add('open');
}

function acVendorSelect(e, inputId){
  e.preventDefault();
  const inp=document.getElementById(inputId); if(!inp) return;
  inp.value=e.currentTarget.dataset.val;
  document.getElementById('dd-'+inputId).classList.remove('open');
  if(inputId==='po-vendor') poCheckReady();
  else if(inputId==='npo-vendor') npoCheckReady();
  // edit-po-vendor needs no ready check — vendor field in modal
}

function acVendorKey(e, inputId){
  const dd=document.getElementById('dd-'+inputId); if(!dd) return;
  const opts=dd.querySelectorAll('.ac-option');
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    let idx=[...opts].findIndex(o=>o.classList.contains('focused'));
    opts.forEach(o=>o.classList.remove('focused'));
    idx=e.key==='ArrowDown'?Math.min(idx+1,opts.length-1):Math.max(idx-1,0);
    if(opts[idx]){opts[idx].classList.add('focused');opts[idx].scrollIntoView({block:'nearest'});}
  } else if(e.key==='Enter'){
    e.preventDefault();
    const focused=dd.querySelector('.ac-option.focused')||opts[0];
    if(focused){ document.getElementById(inputId).value=focused.dataset.val; dd.classList.remove('open'); if(inputId==='po-vendor')poCheckReady();else npoCheckReady(); }
  } else if(e.key==='Escape'){
    dd.classList.remove('open');
  }
}

function updateInvStats(){
  const skus=new Set(inventory.map(iKey)).size;
  const units=inventory.reduce((s,i)=>s+i.qty,0);
  const ser=inventory.filter(i=>i.type==='serialized').length;
  const blk=inventory.filter(i=>i.type==='bulk').reduce((s,i)=>s+i.qty,0);
  document.getElementById('chip-skus').innerHTML=`${skus} <span>SKUs</span>`;
  document.getElementById('chip-units').innerHTML=`${units} <span>units</span>`;
  document.getElementById('chip-serialized').innerHTML=`${ser} <span>serialized</span>`;
  document.getElementById('chip-bulk').innerHTML=`${blk} <span>bulk</span>`;
}

// ═══════════════════════════════════════════════
// PRODUCT BOOK
// ═══════════════════════════════════════════════

// Build mfg code map from existing catalog SKUs

// ═══════════════════════════════════════════════
// TRANSFER
// ═══════════════════════════════════════════════

let xfrContext = null;
// xfrContext = { type: 'inv'|'poi', invId, poiId, fromProjectId, fromProjectName, manufacturer, model, sku, maxQty }

function openTransferFromInv(invId){
  const item = inventory.find(i=>i.id===invId); if(!item) return;
  const fromProj = projects.find(p=>p.id===item.projectId||p.id===item.project);
  // For serialized groups, collect all sibling items so we can transfer them as serialized
  const siblings = item.type==='serialized'
    ? inventory.filter(i=>i.type==='serialized'&&iKey(i)===iKey(item)&&(i.projectId||i.project||'')===(item.projectId||item.project||''))
    : null;
  xfrContext = {
    type:'inv', invId,
    fromProjectId: item.projectId||item.project||'',
    fromProjectName: fromProj ? fromProj.name : (item.project||'No project'),
    fromLocation: item.location||'',
    fromLocationId: item.locationId||'',
    manufacturer: item.manufacturer, model: item.model, sku: item.sku,
    itemType: item.type,
    serialSiblings: siblings,
    maxQty: item.type==='serialized' ? (siblings?siblings.length:1) : item.qty,
  };
  _openTransferModal();
}

function openTransferFromPOI(poiId){
  const poi = orderItems.find(i=>i.id===poiId); if(!poi) return;
  const po = orders.find(o=>o.poNumber===poi.poNumber); if(!po) return;
  const fromProj = projects.find(p=>p.id===po.projectId);
  xfrContext = {
    type:'poi', poiId,
    fromProjectId: po.projectId||'',
    fromProjectName: fromProj ? fromProj.name : (po.projectName||'No project'),
    manufacturer: poi.manufacturer, model: poi.model||poi.description, sku: poi.sku,
    maxQty: poi.qtyReceived,
    poNum: po.poNumber,
  };
  _openTransferModal();
}

function _openTransferModal(){
  const ctx = xfrContext;
  const label = [ctx.manufacturer, ctx.model].filter(Boolean).join(' ');
  document.getElementById('xfr-subtitle').textContent = label + (ctx.sku ? ` · ${ctx.sku}` : '');
  document.getElementById('xfr-from').textContent = ctx.fromProjectName || '(unassigned)';
  document.getElementById('xfr-qty').value = ctx.itemType==='serialized' ? ctx.maxQty : 1;
  document.getElementById('xfr-qty').max = ctx.maxQty;

  // Show from-location
  const fromLocEl = document.getElementById('xfr-from-loc');
  if(fromLocEl) fromLocEl.textContent = ctx.fromLocation || '—';

  // Build to-location cascade — initialize T1 tier
  _locCascadeInit('xfr-to-loc');
  const toLoc = document.getElementById('xfr-to-loc');
  if(toLoc) toLoc.innerHTML='<option value="">— Keep current location —</option>';

  // For serialized, qty field is read-only (you transfer whole units, serials are fixed)
  const qtyInput = document.getElementById('xfr-qty');
  if(ctx.itemType==='serialized'){
    qtyInput.readOnly = true;
    qtyInput.style.opacity = '0.6';
    xfrRenderSerialList();
  } else {
    qtyInput.readOnly = false;
    qtyInput.style.opacity = '';
    const sl = document.getElementById('xfr-serial-list');
    if(sl) sl.style.display = 'none';
  }
  document.getElementById('xfr-to-proj').value = '';
  document.getElementById('xfr-note').value = '';
  document.getElementById('xfr-warning').style.display = 'none';
  document.getElementById('dd-xfr-proj').classList.remove('open');
  xfrSelectedProjId = null;
  xfrCheckReady();
  document.getElementById('transfer-modal').style.display = 'flex';
  setTimeout(()=>document.getElementById('xfr-to-proj').focus(), 60);
}

function xfrRenderSerialList(){
  const ctx = xfrContext;
  const sl = document.getElementById('xfr-serial-list');
  if(!sl || !ctx || !ctx.serialSiblings) return;
  const items = ctx.serialSiblings;
  sl.innerHTML = `<div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Serialized units to transfer</div>`
    + items.map((it,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);">
        <input type="checkbox" data-xfr-serial-id="${it.id}" checked
          style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;"
          onchange="xfrUpdateSerialQty()">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);flex:0 0 140px;">${escHtml(it.serial||'(no serial)')}</span>
        <span style="font-size:11px;color:var(--text-muted);">${escHtml(it.location||'')}</span>
      </div>`).join('');
  sl.style.display = 'block';
}

function xfrUpdateSerialQty(){
  const checked = document.querySelectorAll('#xfr-serial-list input[data-xfr-serial-id]:checked').length;
  document.getElementById('xfr-qty').value = checked;
  xfrCheckReady();
}

function closeTransferModal(){
  document.getElementById('transfer-modal').style.display = 'none';
  xfrContext = null;
  xfrSelectedProjId = null;
  document.getElementById('dd-xfr-proj').classList.remove('open');
}

let xfrSelectedProjId = null;

function _xfrProjCtx(p){
  const cl=(typeof projClientName==='function'?projClientName(p):'')||'';
  const lo=(typeof projLocationName==='function'?projLocationName(p):'')||'';
  return [cl,lo].filter(Boolean).join(' · ')||'— Unassigned —';
}

function xfrFilterProjects(){
  const q = document.getElementById('xfr-to-proj').value.trim().toLowerCase();
  const dd = document.getElementById('dd-xfr-proj');
  // Match against project name AND its Client · Location context, and show that
  // context on every row so duplicate project names (Unallocated/Main/…) are
  // distinguishable. Sorted by client·location, then project name.
  const list = projects.map(p=>({p, ctx:_xfrProjCtx(p)}))
    .filter(o=> !q || o.p.name.toLowerCase().includes(q) || o.ctx.toLowerCase().includes(q))
    .sort((a,b)=> a.ctx.localeCompare(b.ctx,undefined,{sensitivity:'base'}) || (a.p.name||'').localeCompare(b.p.name||''))
    .slice(0,12);
  if(!list.length){ dd.classList.remove('open'); return; }
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const mark=s=>{ const safe=escHtml(s); return q ? safe.replace(new RegExp(`(${esc(q)})`,'gi'),'<mark>$1</mark>') : safe; };
  dd.innerHTML = list.map(({p,ctx})=>
    `<div class="ac-option" data-id="${escHtml(p.id)}" data-name="${escHtml(p.name)}"
      onmousedown="xfrSelectProj(event)" style="white-space:normal;line-height:1.3;">
      <div style="font-weight:600;">${mark(p.name||'(unnamed)')}</div>
      <div style="font-size:11px;color:var(--text-dim);">${mark(ctx)}</div>
    </div>`).join('');
  dd.classList.add('open');
  xfrSelectedProjId = null;
  xfrCheckReady();
}

function xfrSelectProj(e){
  e.preventDefault();
  const el = e.currentTarget;
  xfrSelectedProjId = el.dataset.id;
  document.getElementById('xfr-to-proj').value = el.dataset.name;
  document.getElementById('dd-xfr-proj').classList.remove('open');
  xfrUpdateWarning();
  xfrCheckReady();
}

function xfrProjKey(e){
  const dd = document.getElementById('dd-xfr-proj');
  const opts = dd.querySelectorAll('.ac-option');
  let idx = [...opts].findIndex(o=>o.classList.contains('focused'));
  if(e.key==='ArrowDown'){ e.preventDefault(); idx=Math.min(idx+1,opts.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); idx=Math.max(idx-1,0); }
  else if(e.key==='Enter'){
    e.preventDefault();
    const t = idx>=0&&opts[idx]?opts[idx]:opts.length===1?opts[0]:null;
    if(t){ xfrSelectedProjId=t.dataset.id; document.getElementById('xfr-to-proj').value=t.dataset.name; dd.classList.remove('open'); xfrUpdateWarning(); xfrCheckReady(); }
    return;
  } else if(e.key==='Escape'){ dd.classList.remove('open'); return; } else return;
  opts.forEach((o,i)=>o.classList.toggle('focused',i===idx));
  if(opts[idx]) opts[idx].scrollIntoView({block:'nearest'});
}

function xfrCheckReady(){
  const qty = parseInt(document.getElementById('xfr-qty').value)||0;
  const ctx = xfrContext;
  const toLocId = document.getElementById('xfr-to-loc')?.value||'';
  // Valid if: qty ok AND (project selected OR a new location is chosen)
  const hasProject = !!xfrSelectedProjId;
  const hasNewLocation = !!toLocId;
  const ok = qty >= 1 && ctx && qty <= ctx.maxQty && (hasProject || hasNewLocation);
  document.getElementById('xfr-confirm-btn').disabled = !ok;
  if(ok) xfrUpdateWarning();
}

function xfrUpdateWarning(){
  const ctx = xfrContext; if(!ctx) return;
  const qty = parseInt(document.getElementById('xfr-qty').value)||1;
  const toLocId = document.getElementById('xfr-to-loc')?.value||'';
  const toLocRec = toLocId ? locations.find(l=>l.id===toLocId) : null;
  const toLocCode = toLocRec ? toLocRec.code : '';
  const isLocationOnly = !xfrSelectedProjId;
  const toProj = xfrSelectedProjId ? projects.find(p=>p.id===xfrSelectedProjId) : null;
  const lines = [];

  if(isLocationOnly){
    lines.push(`Location-only move — project assignment will not change.`);
    if(toLocCode) lines.push(`Item will be relocated to <strong>${toLocCode}</strong>.`);
    lines.push(`A transfer log entry will be created for this move.`);
  } else {
    const existingScope = projectItems.find(i=>
      i.projectId===xfrSelectedProjId &&
      (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model)
    );
    if(ctx.type==='poi'){
      lines.push(`Qty Received on original PO will decrease by ${qty}.`);
    } else {
      lines.push(`Inventory record on source project will decrease by ${qty}.`);
    }
    if(!existingScope){
      lines.push(`Item is not yet in ${toProj?toProj.name:'destination'} scope — it will be added automatically.`);
    } else {
      lines.push(`Item already in ${toProj?toProj.name:'destination'} scope — Qty Received will increase.`);
    }
    if(ctx.fromProjectId){
      lines.push(`Source project Qty Received for this item will decrease by ${qty}.`);
    }
    if(xfrSelectedProjId === ctx.fromProjectId){
      lines.push(`⚠ Same project selected — only the location will change.`);
    }
  }
  const w = document.getElementById('xfr-warning');
  w.innerHTML = lines.map(l=>`• ${escHtml(l)}`).join('<br>');
  w.style.display = 'block';
}

function confirmTransfer(){
  const ctx = xfrContext; if(!ctx) return;
  const toLocId = document.getElementById('xfr-to-loc')?.value||'';
  const isLocationOnly = !xfrSelectedProjId;
  if(isLocationOnly && !toLocId){ toast('Select a destination location or a project','error'); return; }

  let qty = parseInt(document.getElementById('xfr-qty').value)||1;
  const note = document.getElementById('xfr-note').value.trim();
  const today = new Date().toLocaleDateString('en-US');
  const timestamp = new Date().toISOString();
  const toProj = xfrSelectedProjId ? projects.find(p=>p.id===xfrSelectedProjId) : null;
  const toProjName = toProj ? toProj.name : (isLocationOnly ? (ctx.fromProjectName||'') : xfrSelectedProjId);
  const toProjId = isLocationOnly ? (ctx.fromProjectId||'') : xfrSelectedProjId;

  // Resolve destination location
  const toLocRec = toLocId ? locations.find(l=>l.id===toLocId) : null;
  const toLocCode = toLocRec ? toLocRec.code : '';
  const toInvStatus = toLocRec?.type==='staging' ? 'Staged'
    : toProjId ? 'Allocated' : 'In Stock';

  // ── LOCATION-ONLY PATH ──
  if(isLocationOnly){
    if(ctx.itemType==='serialized'){
      const checkedBoxes = document.querySelectorAll('#xfr-serial-list input[data-xfr-serial-id]:checked');
      qty = checkedBoxes.length;
      if(qty===0){ toast('Select at least one unit to transfer','error'); return; }
      [...checkedBoxes].forEach(cb=>{
        const rec = inventory.find(i=>i.id===cb.dataset.xfrSerialId); if(!rec) return;
        const xfr={
          id:uid(), timestamp,
          inventoryId:rec.id, sku:rec.sku||'',
          manufacturer:rec.manufacturer, model:rec.model, serial:rec.serial||'', qty:1,
          fromProjectId:ctx.fromProjectId||'', fromProject:ctx.fromProjectName||'',
          toProjectId:ctx.fromProjectId||'', toProject:ctx.fromProjectName||'',
          fromLocation:rec.location||'', fromLocationId:rec.locationId||'',
          toLocation:toLocCode, toLocationId:toLocId,
          notes:note||'Location-only move',
        };
        transfers.push(xfr);
        dbSave('transfers', xfr);
        rec.location = toLocCode;
        rec.locationId = toLocId;
        rec.invStatus = toInvStatus;
        rec.lastUpdated = today;
        if(note) rec.notes = (rec.notes?rec.notes+'; ':'')+`Relocated to ${toLocCode}: ${note}`;
        dbSave('inventory', rec);
      });
    } else {
      const inv = inventory.find(i=>i.id===ctx.invId); if(!inv){ toast('Source item not found','error'); return; }
      const xfr={
        id:uid(), timestamp,
        inventoryId:inv.id, sku:inv.sku||'',
        manufacturer:inv.manufacturer, model:inv.model, serial:'', qty,
        fromProjectId:ctx.fromProjectId||'', fromProject:ctx.fromProjectName||'',
        toProjectId:ctx.fromProjectId||'', toProject:ctx.fromProjectName||'',
        fromLocation:inv.location||'', fromLocationId:inv.locationId||'',
        toLocation:toLocCode, toLocationId:toLocId,
        notes:note||'Location-only move',
      };
      transfers.push(xfr);
      dbSave('transfers', xfr);
      inv.location = toLocCode;
      inv.locationId = toLocId;
      inv.invStatus = toInvStatus;
      inv.lastUpdated = today;
      if(note) inv.notes = (inv.notes?inv.notes+'; ':'')+`Relocated to ${toLocCode}: ${note}`;
      dbSave('inventory', inv);
    }
    setDirty(true);
    updateInvStats(); renderInvTable(); renderStockTable();
    closeTransferModal();
    toast(`Relocated ${qty}× ${ctx.model} → ${toLocCode}`,'success');
    return;
  }

  // ── CROSS-PROJECT (or same-project) TRANSFER PATH ──

  // ── Step 1: Decrement / update source ──
  if(ctx.type==='poi'){
    const poi = orderItems.find(i=>i.id===ctx.poiId); if(!poi){ toast('Source item not found','error'); return; }
    if(qty > poi.qtyReceived){ toast('Qty exceeds received quantity','error'); return; }
    poi.qtyReceived = Math.max(0, poi.qtyReceived - qty);
    const srcInv = inventory.find(i=>
      (i.projectId===ctx.fromProjectId||i.project===ctx.fromProjectId) &&
      (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model) &&
      i.type==='bulk'
    );
    if(srcInv){
      srcInv.qty = Math.max(0, srcInv.qty - qty);
      srcInv.lastUpdated = today;
      if(srcInv.qty===0) srcInv.invStatus='Deployed';
    }
  } else {
    if(ctx.itemType==='serialized'){
      const checkedNow = document.querySelectorAll('#xfr-serial-list input[data-xfr-serial-id]:checked');
      qty = checkedNow.length;
      if(qty===0){ toast('Select at least one unit to transfer','error'); return; }
    } else {
      const inv = inventory.find(i=>i.id===ctx.invId); if(!inv){ toast('Source item not found','error'); return; }
      if(qty > inv.qty){ toast('Qty exceeds available quantity','error'); return; }
      inv.qty = Math.max(0, inv.qty - qty);
      inv.lastUpdated = today;
      if(inv.qty===0 && !isStockItem(inv)){
        inventory = inventory.filter(i=>i.id!==ctx.invId);
      } else {
        if(inv.qty===0) inv.invStatus='Deployed';
      }
    }
    if(ctx.fromProjectId && ctx.itemType!=='serialized'){
      const srcPOs = orders.filter(o=>o.projectId===ctx.fromProjectId).map(o=>o.poNumber);
      const srcPOI = orderItems.find(i=>
        srcPOs.includes(i.poNumber) &&
        (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model) &&
        i.qtyReceived > 0
      );
      if(srcPOI) srcPOI.qtyReceived = Math.max(0, srcPOI.qtyReceived - qty);
    }
  }

  // ── Step 2: Add to / update destination inventory ──
  const transferredIds = [];
  if(ctx.itemType==='serialized'){
    const checkedBoxes = document.querySelectorAll('#xfr-serial-list input[data-xfr-serial-id]:checked');
    const idsToMove = [...checkedBoxes].map(cb=>cb.dataset.xfrSerialId);
    idsToMove.forEach(sid=>{
      const rec = inventory.find(i=>i.id===sid);
      if(!rec) return;
      transferredIds.push(sid);
      transfers.push({
        id:uid(), timestamp,
        inventoryId:rec.id, sku:rec.sku||'',
        manufacturer:rec.manufacturer, model:rec.model, serial:rec.serial||'', qty:1,
        fromProjectId:ctx.fromProjectId||'', fromProject:ctx.fromProjectName||'',
        toProjectId:toProjId, toProject:toProjName,
        fromLocation:rec.location||'', fromLocationId:rec.locationId||'',
        toLocation:toLocCode||rec.location||'', toLocationId:toLocId||rec.locationId||'',
        notes:note,
      });
      rec.projectId = toProjId;
      rec.project = toProjName;
      rec.invStatus = toInvStatus;
      if(toLocId){ rec.locationId=toLocId; rec.location=toLocCode; }
      rec.lastUpdated = today;
      if(note) rec.notes = (rec.notes?rec.notes+'; ':'')+`Transferred from ${ctx.fromProjectName}: ${note}`;
    });
  } else {
    const destInv = inventory.find(i=>
      (i.projectId===toProjId||i.project===toProjId) &&
      (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model) &&
      i.type==='bulk'
    );
    if(destInv){
      destInv.qty += qty;
      destInv.invStatus = toInvStatus;
      if(toLocId){ destInv.locationId=toLocId; destInv.location=toLocCode; }
      destInv.lastUpdated = today;
      if(note) destInv.notes = (destInv.notes?destInv.notes+'; ':'')+`Transfer: ${note}`;
      transferredIds.push(destInv.id);
    } else {
      const newId = uid();
      inventory.push({
        id:newId, sku:ctx.sku||'',
        manufacturer:ctx.manufacturer, model:ctx.model, category:'',
        type:'bulk', qty, serial:'', par:0,
        location:toLocCode||ctx.fromLocation||'',
        locationId:toLocId||ctx.fromLocationId||'',
        condition:'New', status:'Allocated',
        invStatus:toInvStatus,
        project:toProjName, projectId:toProjId,
        poNumber:'',
        notes: note ? `Transferred from ${ctx.fromProjectName}: ${note}` : `Transferred from ${ctx.fromProjectName}`,
        dateAdded:today, lastUpdated:today,
      });
      transferredIds.push(newId);
    }
    transfers.push({
      id:uid(), timestamp,
      inventoryId:transferredIds[0]||'', sku:ctx.sku||'',
      manufacturer:ctx.manufacturer, model:ctx.model, serial:'', qty,
      fromProjectId:ctx.fromProjectId||'', fromProject:ctx.fromProjectName||'',
      toProjectId:toProjId, toProject:toProjName,
      fromLocation:ctx.fromLocation||'', fromLocationId:ctx.fromLocationId||'',
      toLocation:toLocCode||ctx.fromLocation||'', toLocationId:toLocId||ctx.fromLocationId||'',
      notes:note,
    });
  }

  // ── Step 3: PO qtyReceived on destination (skip if same project) ──
  if(toProjId !== ctx.fromProjectId){
    const destPOs = orders.filter(o=>o.projectId===toProjId).map(o=>o.poNumber);
    const destPOI = orderItems.find(i=>
      destPOs.includes(i.poNumber) &&
      (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model)
    );
    if(destPOI){
      destPOI.qtyReceived += qty;
      if(destPOI.qtyReceived > destPOI.qtyOrdered) destPOI.qtyOrdered = destPOI.qtyReceived;
    }
  }

  // ── Step 4: Ensure item in destination scope (skip if same project) ──
  if(toProjId !== ctx.fromProjectId){
    const existingScope = projectItems.find(i=>
      i.projectId===toProjId &&
      (ctx.sku ? i.sku===ctx.sku : i.manufacturer===ctx.manufacturer&&i.model===ctx.model)
    );
    if(!existingScope){
      const pb = catalog.find(r=>ctx.sku?r.sku===ctx.sku:(r.manufacturer===ctx.manufacturer&&r.model===ctx.model));
      const newScopeItem={
        id:uid(), projectId:toProjId,
        sku:ctx.sku||'', manufacturer:ctx.manufacturer, model:ctx.model,
        category:pb?pb.category:'',
        qty, unitCost:pb?pb.unitCost||0:0, unitPrice:pb?(pb.unitPrice||pb.msrp||0):0,
        itemStatus:'On PO',
        inventoryIds:[...transferredIds],
        notes:note?`Transferred from ${ctx.fromProjectName}: ${note}`:`Transferred from ${ctx.fromProjectName}`,
      };
      projectItems.push(newScopeItem);
      dbSave('projectItems', newScopeItem);
    } else {
      // Merge transferred IDs into existing scope item
      if(!existingScope.inventoryIds) existingScope.inventoryIds=[];
      transferredIds.forEach(id=>{ if(!existingScope.inventoryIds.includes(id)) existingScope.inventoryIds.push(id); });
      dbSave('projectItems', existingScope);
    }
  }

  // Remove moved serialized units from the SOURCE project's scope line so they stop
  // counting as filled there — they now belong to the destination project. (Bulk moves
  // decrement the source record's qty in place, so its link stays valid and needs no unlink.)
  if(ctx.itemType==='serialized' && ctx.fromProjectId && ctx.fromProjectId!==toProjId){
    const srcScope=projectItems.find(i=>
      i.projectId===ctx.fromProjectId &&
      (ctx.sku ? i.sku===ctx.sku : (i.manufacturer===ctx.manufacturer && i.model===ctx.model))
    );
    if(srcScope && Array.isArray(srcScope.inventoryIds)){
      const before=srcScope.inventoryIds.length;
      srcScope.inventoryIds=srcScope.inventoryIds.filter(id=>!transferredIds.includes(id));
      if(srcScope.inventoryIds.length!==before) dbSave('projectItems', srcScope);
    }
  }

  // Save all modified inventory, transfers, orderItems from cross-project path
  transferredIds.forEach(id=>{ const inv=inventory.find(i=>i.id===id); if(inv) dbSave('inventory',inv); });
  transfers.slice(-transferredIds.length||-1).forEach(xfr=>dbSave('transfers', xfr));
  if(ctx.type==='poi'){
    const poi=orderItems.find(i=>i.id===ctx.poiId); if(poi) dbSave('orderItems',poi);
    const srcInv=inventory.find(i=>
      (i.projectId===ctx.fromProjectId) &&
      (ctx.sku?i.sku===ctx.sku:i.manufacturer===ctx.manufacturer&&i.model===ctx.model) && i.type==='bulk'
    ); if(srcInv) dbSave('inventory',srcInv);
  } else if(ctx.itemType!=='serialized'){
    if(ctx.fromProjectId){
      const srcPOs=orders.filter(o=>o.projectId===ctx.fromProjectId).map(o=>o.poNumber);
      const srcPOI=orderItems.find(i=>srcPOs.includes(i.poNumber)&&(ctx.sku?i.sku===ctx.sku:i.manufacturer===ctx.manufacturer&&i.model===ctx.model)&&i.qtyReceived>=0);
      if(srcPOI) dbSave('orderItems',srcPOI);
    }
  }
  if(toProjId!==ctx.fromProjectId){
    const destPOs=orders.filter(o=>o.projectId===toProjId).map(o=>o.poNumber);
    const destPOI=orderItems.find(i=>destPOs.includes(i.poNumber)&&(ctx.sku?i.sku===ctx.sku:i.manufacturer===ctx.manufacturer&&i.model===ctx.model));
    if(destPOI) dbSave('orderItems',destPOI);
  }

  setDirty(true);
  updateInvStats(); renderInvTable(); renderStockTable();
  updateOrdersStats(); renderOrdersTable();
  if(ctx.type==='poi' && currentPONum) renderPOItems(currentPONum);
  if(currentProjectId){
    if(currentProjectId===ctx.fromProjectId||currentProjectId===toProjId){
      renderProjectScope(currentProjectId);
      updateScopeTotal(currentProjectId);
    }
  }
  closeTransferModal();
  toast(`Transferred ${qty}× ${ctx.model} → ${toProjName}${toLocCode?' @ '+toLocCode:''}`,'success');
}

// ═══════════════════════════════════════════════
// BATCH ADD (SERIALIZED)
// ═══════════════════════════════════════════════
function openBatchAddModal(){
  const mfg=acCtx.inv.mfg.selected, model=acCtx.inv.model.selected;
  if(!mfg||!model||invType!=='serialized') return;
  const sku=document.getElementById('inv-sku').value;
  document.getElementById('batch-subtitle').textContent=[mfg,model].filter(Boolean).join(' ')+(sku?` · ${sku}`:'');
  document.getElementById('batch-qty').value=2;
  batchRebuildSerialFields();
  document.getElementById('batch-add-modal').style.display='flex';
  setTimeout(()=>{const f=document.querySelector('#batch-serial-fields input[data-batch-serial]');if(f)f.focus();},60);
}

function closeBatchAddModal(){
  document.getElementById('batch-add-modal').style.display='none';
}

function batchRebuildSerialFields(){
  const n=Math.max(1,Math.min(100,parseInt(document.getElementById('batch-qty').value)||2));
  const container=document.getElementById('batch-serial-fields');
  // Preserve already-typed values
  const existing=[];
  container.querySelectorAll('input[data-batch-serial]').forEach(el=>existing.push(el.value));
  container.innerHTML='';
  for(let i=0;i<n;i++){
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;';
    row.innerHTML=`
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);min-width:24px;text-align:right;">${i+1}</span>
      <input type="text" data-batch-serial="${i}" placeholder="Scan or type serial…"
        style="flex:1;padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;"
        onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
        onkeydown="if(event.key==='Enter'){event.preventDefault();const all=document.querySelectorAll('#batch-serial-fields input[data-batch-serial]');const idx=parseInt(this.dataset.batchSerial);if(all[idx+1])all[idx+1].focus();}">
      <button class="scan-btn" title="Scan barcode" onclick="openScanner(this.previousElementSibling)">⊡</button>`;
    const inp=row.querySelector('input');
    if(existing[i]) inp.value=existing[i];
    container.appendChild(row);
  }
}

function confirmBatchAdd(){
  const mfg=acCtx.inv.mfg.selected, model=acCtx.inv.model.selected;
  if(!mfg||!model) return;
  const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
  const sku=document.getElementById('inv-sku').value;

  const locSel=document.getElementById('inv-loc');
  const locId=locSel?locSel.value:'';
  const locRec=locId?locations.find(l=>l.id===locId):null;
  const locCode=locRec?locRec.code:'';

  const projSel=document.getElementById('inv-proj');
  const projId=projSel?projSel.value:'';
  const projRec=projId?projects.find(p=>p.id===projId):null;

  const autoInvStatus=projId?'Allocated':'Unallocated';
  const formInvStatus=document.getElementById('inv-status').value||autoInvStatus;
  const cond=document.getElementById('inv-cond').value;
  const notes=document.getElementById('inv-notes').value.trim();
  const today=new Date().toLocaleDateString('en-US');
  const serials=[];
  document.querySelectorAll('#batch-serial-fields input[data-batch-serial]').forEach(inp=>serials.push(inp.value.trim()));
  const batchItems=[];
  serials.forEach(serial=>{
    const newItem={
      id:uid(), sku, manufacturer:mfg, model, category:entry?entry.category:'',
      type:'serialized', qty:1, serial, par:0,
      location:locCode, locationId:locId,
      condition:cond,
      status:formInvStatus,
      invStatus:formInvStatus,
      project:projRec?projRec.name:'', projectId:projId,
      poNumber:'', notes,
      dateAdded:today, lastUpdated:today,
    };
    inventory.push(newItem);
    batchItems.push(newItem);
  });
  dbSaveMany('inventory', batchItems);
  setDirty(true); updateInvStats(); renderInvTable(); renderStockTable();
  closeBatchAddModal();
  resetInvForm();
  toast(`Added ${serials.length} serialized unit${serials.length!==1?'s':''}`, 'success');
}

// ═══════════════════════════════════════════════
// FRONT DESK
// ═══════════════════════════════════════════════

