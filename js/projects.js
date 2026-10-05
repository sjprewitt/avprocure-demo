function generateNextProjId(){
  const nums = projects.map(p=>{
    const m = p.id.match(/^PROJ(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = nums.length ? Math.max(...nums)+1 : 1;
  const id = 'PROJ' + String(next).padStart(4,'0');
  const el = document.getElementById('proj-id');
  if(el) el.value = id;
  return id;
}

function projCheckReady(){
  const name = document.getElementById('proj-name').value.trim();
  document.getElementById('proj-btn-add').disabled = !name;
}

function addProject(){
  const name = document.getElementById('proj-name').value.trim();
  if(!name){ toast('Project Name is required','error'); return; }
  const id = generateNextProjId();
  const newProj={
    id, name,
    status: document.getElementById('proj-status').value,
    firstName: document.getElementById('proj-first').value.trim(),
    lastName:  document.getElementById('proj-last').value.trim(),
    address:   document.getElementById('proj-addr').value.trim(),
    phone:     document.getElementById('proj-phone').value.trim(),
    email:     document.getElementById('proj-email').value.trim(),
    contractValue: parseFloat(document.getElementById('proj-value').value)||0,
    startDate:  document.getElementById('proj-start').value,
    targetDate: document.getElementById('proj-target').value,
    notes:      document.getElementById('proj-notes').value.trim(),
    clientId:document.getElementById('proj-client')?.value||'',
  };
  projects.push(newProj);
  dbSave('projects', newProj);
  setDirty(true); updateProjStats(); renderProjTable();
  resetProjForm();
  generateNextProjId();
  toast(`Project ${id} created`,'success');
}

function resetProjForm(){
  ['proj-name','proj-first','proj-last','proj-addr','proj-phone','proj-email','proj-notes'].forEach(id=>{
    document.getElementById(id).value='';
  });
  ['proj-value'].forEach(id=>{ document.getElementById(id).value=''; });
  ['proj-start','proj-target'].forEach(id=>{ document.getElementById(id).value=''; });
  document.getElementById('proj-status').value='Open';
  const pcSel=document.getElementById('proj-client');
  if(pcSel) pcSel.value='';
  document.getElementById('proj-btn-add').disabled=true;
}

function deleteProject(id){
  const proj=projects.find(p=>p.id===id);
  const pname=proj?proj.name:'';
  projects = projects.filter(p=>p.id!==id);
  // Unlink any orders from this project
  orders.forEach(o=>{ if(o.projectId===id){ o.projectId=''; o.projectName=''; dbSave('orders',o); }});
  // Delete this project's scope items so they don't orphan in the DB
  const scopeIds=projectItems.filter(i=>i.projectId===id).map(i=>i.id);
  projectItems=projectItems.filter(i=>i.projectId!==id);
  dbDeleteMany('projectItems', scopeIds);
  // Release this project's inventory back to unallocated stock. Modern records store the
  // project name in `project` and id in `projectId`; legacy records put the id in `project`.
  inventory.forEach(i=>{
    if(i.projectId===id || i.project===id || (pname && i.project===pname)){
      i.projectId=''; i.project='';
      if(!isStockItem(i) && (i.invStatus==='Allocated' || i.invStatus==='Staged')){
        i.invStatus='Unallocated'; i.status='Unallocated';
      }
      i.lastUpdated=new Date().toLocaleDateString('en-US');
      dbSave('inventory',i);
    }
  });
  dbDelete('projects', id);
  setDirty(true); updateProjStats(); renderProjTable(); updateInvStats(); renderInvTable(); renderStockTable(); showProjList();
  toast(`Project ${id} deleted`,'success');
}

function editProject(id){
  const p = projects.find(p=>p.id===id); if(!p) return;
  document.getElementById('edit-proj-name').value   = p.name;
  document.getElementById('edit-proj-first').value  = p.firstName;
  document.getElementById('edit-proj-last').value   = p.lastName;
  document.getElementById('edit-proj-addr').value   = p.address;
  document.getElementById('edit-proj-phone').value  = p.phone;
  document.getElementById('edit-proj-email').value  = p.email;
  document.getElementById('edit-proj-status').value = p.status;
  document.getElementById('edit-proj-value').value  = p.contractValue||'';
  document.getElementById('edit-proj-start').value  = p.startDate;
  document.getElementById('edit-proj-target').value = p.targetDate;
  document.getElementById('edit-proj-notes').value  = p.notes;
  populateProjClientSelects();
  const epcs=document.getElementById('edit-proj-client');
  if(epcs) epcs.value=p.clientId||'';
  document.getElementById('proj-modal').style.display='flex';
}

function saveEditProject(){
  const p = projects.find(p=>p.id===currentProjectId); if(!p) return;
  const oldName   = p.name;
  p.name          = document.getElementById('edit-proj-name').value.trim();
  p.firstName     = document.getElementById('edit-proj-first').value.trim();
  p.lastName      = document.getElementById('edit-proj-last').value.trim();
  p.address       = document.getElementById('edit-proj-addr').value.trim();
  p.phone         = document.getElementById('edit-proj-phone').value.trim();
  p.email         = document.getElementById('edit-proj-email').value.trim();
  p.status        = document.getElementById('edit-proj-status').value;
  p.contractValue = parseFloat(document.getElementById('edit-proj-value').value)||0;
  p.startDate     = document.getElementById('edit-proj-start').value;
  p.targetDate    = document.getElementById('edit-proj-target').value;
  p.notes         = document.getElementById('edit-proj-notes').value.trim();
  p.clientId    = document.getElementById('edit-proj-client')?.value || '';
  closeProjModal();
  const updatedProj=projects.find(p=>p.id===currentProjectId);
  if(updatedProj) dbSave('projects', updatedProj);
  // Cascade a name change to the denormalized copies so displays stay consistent.
  if(p.name && p.name!==oldName){
    inventory.forEach(inv=>{ if(inv.projectId===p.id && inv.project!==p.name){ inv.project=p.name; dbSave('inventory',inv); }});
    orders.forEach(o=>{ if(o.projectId===p.id && o.projectName!==p.name){ o.projectName=p.name; dbSave('orders',o); }});
  }
  setDirty(true); renderProjTable(); updateProjStats(); openProject(currentProjectId);
  toast('Project updated','success');
}

function closeProjModal(){
  document.getElementById('proj-modal').style.display='none';
}

// ═══════════════════════════════════════════════
// SORTING
// ═══════════════════════════════════════════════
function setSort(table, col){
  const states={inv:invSort,pb:pbSort,proj:projSort,orders:ordersSort,projItems:projItemsSort,projPOs:projPOsSort,rma:rmaSort,stock:stockSort};
  const s=states[table]; if(!s) return;
  if(s.col===col) s.dir=s.dir==='asc'?'desc':'asc';
  else { s.col=col; s.dir='asc'; }
  applySortClasses(table);
  if(table==='inv'){invPage=0;renderInvTable();}
  else if(table==='pb') renderPBTable();
  else if(table==='proj') renderProjTable();
  else if(table==='orders') renderOrdersTable();
  else if(table==='projItems') renderProjectScope(currentProjectId);
  else if(table==='projPOs') renderProjectPOs(currentProjectId);
  else if(table==='rma') renderRMATable();
  else if(table==='stock') renderStockTable();
}

function applySortClasses(table){
  const states={inv:invSort,pb:pbSort,proj:projSort,orders:ordersSort,projItems:projItemsSort,projPOs:projPOsSort,rma:rmaSort,stock:stockSort};
  const s=states[table]; if(!s) return;
  const selectors={inv:'#inv-tbody',pb:'#pb-tbody',proj:'#proj-tbody',orders:'#orders-tbody',projItems:'#scope-tbody',projPOs:'#proj-pos-tbody',rma:'#rma-tbody',stock:'#stock-tbody'};
  const tbody=document.querySelector(selectors[table]); if(!tbody) return;
  const thead=tbody.closest('table').querySelector('thead');
  if(!thead) return;
  thead.querySelectorAll('th.sortable').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    const col=th.getAttribute('onclick').match(/'([^']+)'\)$/)?.[1];
    if(col===s.col) th.classList.add(s.dir==='asc'?'sort-asc':'sort-desc');
  });
}

function sortRows(rows, col, dir){
  const d=dir==='asc'?1:-1;
  return [...rows].sort((a,b)=>{
    let av=a[col]??'', bv=b[col]??'';
    if(typeof av==='number'&&typeof bv==='number') return (av-bv)*d;
    return String(av).toLowerCase().localeCompare(String(bv).toLowerCase())*d;
  });
}




// Projects tab type filter (job = client jobs, stock = shop inventory, outbound = pallets).
// See docs/DESIGN-project-types.md. Default 'job' keeps client reporting free of stock/pallets.
function setProjTypeFilter(t){
  projTypeFilter=t;
  ['all','job','stock','outbound'].forEach(k=>{
    const b=document.getElementById('ptype-'+k); if(!b) return;
    const on=k===t; b.style.background=on?'var(--accent)':'transparent'; b.style.color=on?'#fff':'var(--text-muted)';
  });
  updateProjStats(); renderProjTable();
}

// A project is "empty" (hidden from the Projects tab by default) when nothing is
// attached: no scope lines, no inventory units, no POs. It still shows in the Front
// Desk tree — this only declutters the flat Projects list (e.g. Main/Change Order/Service).
let projShowEmpty=false;
function _projUsedIds(){
  const s=new Set();
  for(const pi of projectItems) if(pi.projectId) s.add(pi.projectId);
  for(const i of inventory)     if(i.projectId)  s.add(i.projectId);
  for(const o of orders)        if(o.projectId)  s.add(o.projectId);
  return s;
}
// Context helpers so a project name is never shown bare (Client · Location · Project).
function projLocationName(p){
  if(p && p.clientLocationId){ const l=clientLocations.find(x=>x.id===p.clientLocationId); if(l) return l.name||''; }
  return '';
}
function projClientName(p){
  const cid=_projClientId(p);   // resolves via clientLocation, else direct clientId
  if(cid){ const c=clients.find(x=>x.id===cid); if(c) return c.name||''; }
  return '';
}

function updateProjStats(){
  const used=_projUsedIds();
  let inType = projTypeFilter==='all' ? projects : projects.filter(p=>(p.type||'job')===projTypeFilter);
  if(!projShowEmpty) inType=inType.filter(p=>used.has(p.id));
  const total = inType.length;
  const open  = inType.filter(p=>p.status==='Open').length;
  const inprog= inType.filter(p=>p.status==='In Progress').length;
  const done  = inType.filter(p=>p.status==='Complete').length;
  document.getElementById('proj-chip-total').innerHTML = `${total} <span>projects</span>`;
  document.getElementById('proj-chip-open').innerHTML  = `${open} <span>open</span>`;
  document.getElementById('proj-chip-inprog').innerHTML= `${inprog} <span>in progress</span>`;
  document.getElementById('proj-chip-done').innerHTML  = `${done} <span>complete</span>`;
}

function filterProjects(q){
  projFilterQuery=q;
  renderProjTable();
}

function renderProjTable(){
  applySortClasses('proj');
  const q = projFilterQuery.toLowerCase();
  let rows = (projTypeFilter==='all'?projects:projects.filter(p=>(p.type||'job')===projTypeFilter)).filter(p=>
    !q||(()=>{const cname=p.clientId?(clients.find(c=>c.id===p.clientId)?.name||''):'';return [p.name,p.firstName,p.lastName,p.address,p.status,cname].some(v=>v&&v.toLowerCase().includes(q));})()

  );
  // Hide empty projects (no scope/inventory/POs) unless "Show empty" is on.
  const used=_projUsedIds();
  const scopeEmpties=rows.filter(p=>!used.has(p.id)).length;
  if(!projShowEmpty) rows=rows.filter(p=>used.has(p.id));
  const ec=document.getElementById('proj-empty-count'); if(ec) ec.textContent=scopeEmpties?`(${scopeEmpties})`:'';
  // Handle special computed columns
  if(projSort.col==='client'){
    const d=projSort.dir==='asc'?1:-1;
    rows=rows.sort((a,b)=>{
      const an=a.clientId?(clients.find(c=>c.id===a.clientId)?.name||[a.lastName,a.firstName].join(' ')):[a.lastName,a.firstName].join(' ');
      const bn=b.clientId?(clients.find(c=>c.id===b.clientId)?.name||[b.lastName,b.firstName].join(' ')):[b.lastName,b.firstName].join(' ');
      return an.localeCompare(bn)*d;
    });
  } else if(projSort.col==='items'){
    const d=projSort.dir==='asc'?1:-1;
    rows=rows.sort((a,b)=>(getProjectOrderItems(a.id).length-getProjectOrderItems(b.id).length)*d);
  } else {
    rows=sortRows(rows, projSort.col, projSort.dir);
  }
  const tbody = document.getElementById('proj-tbody');
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">◫</div>
      <div style="font-size:13px">${projects.length?'No projects match.':'No projects yet. Add one below.'}</div>
    </div></td></tr>`;
    return;
  }
  const fmt=n=>n?'$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','):'—';
  const statClass={'Open':'tag-Open','In Progress':'tag-InProg','Complete':'tag-Complete'};
  tbody.innerHTML=rows.map(p=>{
    const itemCount = projectItems.filter(i=>i.projectId===p.id).length;
    const sc = p.status==='Open'?'tag-s':p.status==='In Progress'?'tag-m':'tag-Complete';
    return `<tr class="group-row" data-gkey="${p.id}">
      <td style="font-weight:600">${escHtml(p.name)}</td>
      <td class="mobile-hide" style="color:var(--text-muted)">${escHtml(projClientName(p)||[p.firstName,p.lastName].filter(Boolean).join(' ')||'—')}</td>
      <td class="mobile-hide" style="color:var(--text-muted);font-size:12px">${escHtml(projLocationName(p)||'—')}</td>
      <td><span class="tag ${sc}">${escHtml(p.status)}</span></td>
      <td class="mono mobile-hide">${fmt(p.contractValue)}</td>
      <td class="mono mobile-hide" style="font-size:11px;color:var(--text-muted)">${escHtml(p.startDate||'—')}</td>
      <td class="mono mobile-hide" style="font-size:11px;color:var(--text-muted)">${escHtml(p.targetDate||'—')}</td>
      <td><span class="qty-badge qty-s">${itemCount}</span></td>
      <td><button class="btn-del" data-del-proj="${p.id}">✕</button></td>
    </tr>`;
  }).join('');
}

// Tag style for Complete status
const styleEl = document.createElement('style');
styleEl.textContent = `.tag-Complete{background:rgba(79,247,160,0.1);color:var(--accent3);} .tag-InProg{background:rgba(247,201,79,0.1);color:var(--warn);}`;
document.head.appendChild(styleEl);

function showProjList(){
  document.getElementById('proj-list-view').style.display='flex';
  document.getElementById('proj-detail-view').style.display='none';
  currentProjectId=null;
}

// Where the open project was navigated from: 'proj' (Projects list) or 'fd' (Front Desk tree).
let projNavSource='proj';
function projDetailBack(){
  if(projNavSource==='fd'){
    const pid=currentProjectId;
    projNavSource='proj';
    showPage('fd'); renderFDPage(); setFDTab('clients');
    if(typeof _fdExpandToProject==='function') setTimeout(()=>_fdExpandToProject(pid),60);
  } else {
    showProjList();
  }
}

let currentProjDetailTab = 'scope';

function setProjDetailTab(tab){
  currentProjDetailTab = tab;
  const isScope = tab==='scope';
  document.getElementById('proj-scope-tab').style.display = isScope?'flex':'none';
  document.getElementById('proj-pos-tab').style.display = isScope?'none':'flex';
  document.getElementById('ptab-scope').style.color = isScope?'var(--accent)':'var(--text-muted)';
  document.getElementById('ptab-scope').style.borderBottomColor = isScope?'var(--accent)':'transparent';
  document.getElementById('ptab-pos').style.color = isScope?'var(--text-muted)':'var(--accent)';
  document.getElementById('ptab-pos').style.borderBottomColor = isScope?'transparent':'var(--accent)';
}

function openProject(id){
  const p = projects.find(p=>p.id===id); if(!p) return;
  currentProjectId = id;
  projScopeFilter = null; projScopeSearch = ''; projScopeCat = '';
  { const s=document.getElementById('scope-search'); if(s) s.value=''; }
  document.getElementById('proj-list-view').style.display='none';
  document.getElementById('proj-detail-view').style.display='flex';

  document.getElementById('det-id').textContent = p.id;
  document.getElementById('det-name').textContent = p.name;
  const sc = p.status==='Open'?'tag-s':p.status==='In Progress'?'tag-m':'tag-Complete';
  document.getElementById('det-status-badge').innerHTML = `<span class="tag ${sc}">${escHtml(p.status)}</span>`;
  // "Mark Shipped" only applies to outbound pallets
  const _shipBtn=document.getElementById('proj-mark-shipped-btn');
  if(_shipBtn) _shipBtn.style.display=(p.type||'job')==='outbound'?'':'none';
  // Client · Location breadcrumb under the project name, so "Theater" is never ambiguous.
  const locName=projLocationName(p);
  const cid=_projClientId(p);
  const cl=cid?clients.find(c=>c.id===cid):null;
  let detClientStr;
  if(cl){
    const clContact=[cl.firstName,cl.lastName].filter(Boolean).join(' ');
    detClientStr=[cl.name,locName,clContact,cl.address,cl.phone,cl.email].filter(Boolean).join(' · ');
  } else {
    const det=[p.firstName,p.lastName].filter(Boolean).join(' ');
    detClientStr=[det,locName,p.address,p.phone,p.email].filter(Boolean).join(' — ');
  }
  document.getElementById('det-client').textContent=detClientStr||'—';
  document.getElementById('det-contract').textContent = p.contractValue ? '$'+parseFloat(p.contractValue).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',') : '—';

  // Backfill unitPrice from pricebook for any scope items that have $0
  backfillScopePrices(id);
  // Repair any inventory→scope links that were missed historically
  repairScopeLinks(id);

  setProjDetailTab('scope');
  renderProjectScope(id);
  renderProjectPOs(id);
  updateScopeTotal(id);
  resetScopeItemForm();
}

function backfillScopePrices(projectId){
  let changed=false;
  projectItems.filter(i=>i.projectId===projectId).forEach(i=>{
    const pb=catalog.find(r=>r.sku===i.sku||(r.manufacturer===i.manufacturer&&r.model===i.model));
    if(!pb) return;
    if(!(i.unitCost>0) && pb.unitCost>0){ i.unitCost=pb.unitCost; changed=true; }
    if(!(i.unitPrice>0)){
      if(pb.unitPrice>0){ i.unitPrice=pb.unitPrice; changed=true; }
      else if(pb.msrp>0){ i.unitPrice=pb.msrp; changed=true; }
    }
  });
  if(changed){
    projectItems.filter(i=>i.projectId===projectId).forEach(i=>dbSave('projectItems', i));
    setDirty(true);
  }
}

function updateScopeTotal(projectId){
  const fmt = n => n ? '$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',') : '—';
  const projPOs = orders.filter(o=>o.projectId===projectId);
  const projPONums = new Set(projPOs.map(o=>o.poNumber));
  const projOItems = orderItems.filter(i=>projPONums.has(i.poNumber));

  // Project Cost: sum of poGrand (unit costs + tax + tariff + shipping) for all POs
  const projCost = projPOs.reduce((s,o)=>s+poGrand(o), 0);

  // Client Price: for each PO line item, look up unitPrice from scope → catalog → msrp
  const clientPrice = projOItems.reduce((s,i)=>{
    const si = projectItems.find(pi=>pi.projectId===projectId&&(pi.sku&&pi.sku===i.sku||(pi.manufacturer===i.manufacturer&&pi.model===i.model&&pi.model)));
    const cat = i.sku ? catalog.find(c=>c.sku===i.sku) : null;
    const price = (si?.unitPrice>0 ? si.unitPrice : 0) || (cat?.unitPrice>0 ? cat.unitPrice : 0) || (cat?.msrp>0 ? cat.msrp : 0);
    return s + (i.qtyOrdered||0) * price;
  }, 0);

  const costEl = document.getElementById('det-cost');
  const priceEl = document.getElementById('det-price');
  if(costEl) costEl.textContent = projPOs.length ? fmt(projCost) : '—';
  if(priceEl) priceEl.textContent = projOItems.length ? fmt(clientPrice) : '—';
  updateProjectBreakdown(projectId);
}

function setScopeFilter(filter){
  projScopeFilter = (projScopeFilter === filter) ? null : filter;
  updateProjectBreakdown(currentProjectId);
  renderProjectScope(currentProjectId);
}

function setScopeSearch(v){ projScopeSearch = (v||'').trim().toLowerCase(); renderProjectScope(currentProjectId); }
function setScopeCat(v){ projScopeCat = v||''; renderProjectScope(currentProjectId); }
function clearScopeFilters(){
  projScopeSearch=''; projScopeCat=''; projScopeFilter=null;
  const s=document.getElementById('scope-search'); if(s) s.value='';
  const c=document.getElementById('scope-cat-filter'); if(c) c.value='';
  updateProjectBreakdown(currentProjectId);
  renderProjectScope(currentProjectId);
}

function updateProjectBreakdown(projectId){
  const el=document.getElementById('det-breakdown'); if(!el) return;

  // Scope totals
  const scopeItems=projectItems.filter(i=>i.projectId===projectId);
  const totalNeeded=scopeItems.reduce((s,i)=>s+(i.qty||0),0);
  if(!totalNeeded){ el.innerHTML=''; return; }

  // Count inventory records linked to this project by invStatus
  const projInv=inventory.filter(i=>i.projectId===projectId||(i.project===projectId&&!i.projectId));

  // On Order — scope qty minus what's been received
  const poItems=getProjectOrderItems(projectId);
  const totalOrdered=poItems.reduce((s,i)=>s+i.qtyOrdered,0);
  const totalReceived=poItems.reduce((s,i)=>s+i.qtyReceived,0);
  const onOrder=Math.max(0,totalOrdered-totalReceived);

  // Count by invStatus from actual inventory records
  const allocated=projInv.filter(i=>i.invStatus==='Allocated').reduce((s,i)=>s+(i.qty||1),0);
  const deployed=projInv.filter(i=>i.invStatus==='Deployed').reduce((s,i)=>s+(i.qty||1),0);

  // Pending = unfilled units of lines that aren't on any PO.
  // Same definition as the row Status badge and the Pending filter (onPO===0 && filled<qty),
  // so the chip always equals what the filter shows.
  let pending=0;
  for(const i of scopeItems){
    const openOnPO=getScopeItemOpenOnPO(projectId,i);
    const filled=getScopeItemFilled(i);
    if(openOnPO===0 && filled<(i.qty||1)) pending+=Math.max(0,(i.qty||0)-filled);
  }

  const activeFilter = projScopeFilter;
  const chip=(label,val,color,bg,key)=>{
    const isActive = (key===null && !activeFilter) || activeFilter===key;
    const activeBorder = isActive ? `2px solid ${color}` : `1px solid ${isActive?color:'rgba(128,128,128,0.25)'}`;
    const activeBg = isActive ? bg : 'transparent';
    const opacity = (!activeFilter||isActive) ? '1' : '0.45';
    return `<div onclick="setScopeFilter(${key===null?'null':`'${key}'`})" style="text-align:center;padding:4px 10px;background:${activeBg};border:${activeBorder};border-radius:6px;cursor:pointer;opacity:${opacity};transition:opacity 0.15s;">
        <div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:${color};">${val}</div>
        <div style="font-size:9px;color:${color};opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      </div>`;
  };

  el.innerHTML=[
    chip('All',       totalNeeded, 'var(--text)',      'rgba(128,128,128,0.1)', null),
    chip('Pending',   pending,     'var(--text-dim)',  'rgba(128,128,128,0.1)', 'pending'),
    chip('On Order',  onOrder,     'var(--warn)',      'rgba(247,201,79,0.07)', 'onorder'),
    chip('Allocated', allocated,   'var(--accent)',    'rgba(79,142,247,0.07)', 'allocated'),
    chip('Deployed',  deployed,    'var(--accent4)',   'rgba(247,79,126,0.07)', 'deployed'),
  ].join('');
}

// Cancelled POs are void: their qtyOrdered must never count as "on PO" against a scope
// line, because nothing is inbound anymore. Anything actually received before the PO was
// cancelled still counts as FILLED — that axis is derived from inventory links
// (getScopeItemFilled), not from PO rows — so no received units are lost here.
// This is the single chokepoint for every scope PO figure (on-PO, received, open-on-PO,
// the On Order chip, and the Pending/On PO status badge), so excluding here fixes all of them.
function getProjectOrderItems(projectId){
  const linkedPOs = orders.filter(o=>o.projectId===projectId&&o.status!=='Cancelled').map(o=>o.poNumber);
  return orderItems.filter(i=>linkedPOs.includes(i.poNumber));
}

// Qty on PO for a scope item = sum of qtyOrdered across all linked PO items for same SKU/model
// Normalized string compare — trims and lowercases both sides
function _norm(s){ return (s||'').trim().toLowerCase(); }

// Returns true if two item records refer to the same product.
// Prefers SKU when both sides have one; falls back to manufacturer+model.
function _itemMatch(a, b){
  const aSku=_norm(a.sku), bSku=_norm(b.sku);
  if(aSku && bSku) return aSku===bSku;
  return _norm(a.manufacturer)===_norm(b.manufacturer) && _norm(a.model)===_norm(b.model);
}

function getScopeItemQtyOnPO(projectId, item){
  return getProjectOrderItems(projectId)
    .filter(i=>_itemMatch(i, item))
    .reduce((s,i)=>s+i.qtyOrdered,0);
}

// Stock a project may draw on: not owned by another job (shop stock tagged to a
// stock project still counts), and sitting on the shelf in any of the wordings the
// data has carried — "Unallocated" from an unfill, "In Stock" or "On Hand" from
// receiving, or blank on older records. Both fill paths ask this same question:
// the allocate modal and the "already in stock?" prompt when a scope line is added.
function isAllocatableStock(inv){
  return (!inv.projectId||isStockProjectId(inv.projectId)) &&
    (inv.invStatus==='Unallocated'||inv.invStatus==='In Stock'||inv.invStatus==='On Hand'||
     (!inv.invStatus&&isStockItem(inv)));
}

// Returns actual inventory records linked to a scope item.
// unfilledIds = units that were received then deliberately pulled off this project
// (see unfillScopeInventory); they are excluded so they no longer count as filled.
function getScopeItemInventory(scopeItem){
  const unfilled=Array.isArray(scopeItem.unfilledIds)?scopeItem.unfilledIds:[];
  if(scopeItem.inventoryIds&&scopeItem.inventoryIds.length){
    return inventory.filter(i=>scopeItem.inventoryIds.includes(i.id)&&!unfilled.includes(i.id));
  }
  // Fallback for items received before scope was added or before linking was in place
  return inventory.filter(i=>
    i.projectId===scopeItem.projectId && _itemMatch(i, scopeItem) && !unfilled.includes(i.id)
  );
}

// FILLED axis (scope) = units of inventory linked to this scope line. Derived, never stored.
function getScopeItemFilled(scopeItem){
  return getScopeItemInventory(scopeItem).reduce((s,r)=>s+(r.qty||1),0);
}

// RECEIVED axis (PO) = qty received on this project's PO lines matching the scope line.
function getScopeItemQtyReceived(projectId, item){
  return getProjectOrderItems(projectId)
    .filter(i=>_itemMatch(i, item))
    .reduce((s,i)=>s+(i.qtyReceived||0),0);
}

// OPEN-ON-PO axis = ordered units not yet received — units genuinely still inbound.
// Coverage uses filled + openOnPO (not raw qtyOrdered), so a unit that was received
// and then unfilled correctly stops counting as covered and reappears as needed.
function getScopeItemOpenOnPO(projectId, item){
  return Math.max(0, getScopeItemQtyOnPO(projectId,item)-getScopeItemQtyReceived(projectId,item));
}

function renderProjectScope(projectId){
  if(!projectId) return;
  applySortClasses('projItems');
  const allScope = projectItems.filter(i=>i.projectId===projectId);
  // Keep the category dropdown in sync with the categories actually present.
  const cats=[...new Set(allScope.map(i=>i.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const catSel=document.getElementById('scope-cat-filter');
  if(catSel){
    if(projScopeCat && !cats.includes(projScopeCat)) projScopeCat='';
    catSel.innerHTML='<option value="">All categories</option>'
      +cats.map(c=>`<option value="${escHtml(c)}"${projScopeCat===c?' selected':''}>${escHtml(c)}</option>`).join('');
  }
  let items = allScope;
  if(projScopeFilter){
    const poItems=getProjectOrderItems(projectId);
    items=items.filter(i=>{
      const openOnPO=getScopeItemOpenOnPO(projectId,i);
      const invRecs=getScopeItemInventory(i);
      const filled=getScopeItemFilled(i);
      if(projScopeFilter==='pending')   return openOnPO===0 && filled<(i.qty||1);
      if(projScopeFilter==='onorder')   return openOnPO>0 && filled<(i.qty||1);
      if(projScopeFilter==='allocated') return invRecs.some(r=>r.invStatus==='Allocated');
      if(projScopeFilter==='deployed')  return invRecs.some(r=>r.invStatus==='Deployed');
      return true;
    });
  }
  if(projScopeCat) items=items.filter(i=>(i.category||'')===projScopeCat);
  if(projScopeSearch){
    const q=projScopeSearch;
    items=items.filter(i=>[i.sku,i.manufacturer,i.model,i.notes].some(v=>v&&String(v).toLowerCase().includes(q)));
  }
  // Filtered-count hint
  const cntEl=document.getElementById('scope-filter-count');
  if(cntEl) cntEl.textContent = (items.length!==allScope.length) ? `Showing ${items.length} of ${allScope.length}` : '';
  items = sortRows(items, projItemsSort.col, projItemsSort.dir);
  const tbody = document.getElementById('scope-tbody');
  if(!tbody) return;
  if(!items.length){
    const anyFilter = projScopeFilter||projScopeCat||projScopeSearch;
    const msg=anyFilter?'No scope items match the current filters.':'No scope items yet. Add pricebook items below, then create POs from the Purchase Orders tab.';
    tbody.innerHTML=`<tr><td colspan="16"><div class="empty-state" style="padding:40px">
      <div style="font-size:13px;color:var(--text-dim)">${msg}</div>
    </div></td></tr>`;
    return;
  }
  const fmt=n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const linkedPOs = orders.filter(o=>o.projectId===projectId);
  const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const rows=[];
  for(const i of items){
    const onPO = getScopeItemQtyOnPO(projectId, i);
    const received = getScopeItemQtyReceived(projectId, i);
    const openOnPO = Math.max(0, onPO - received);
    const invRecs = getScopeItemInventory(i);
    const filled = invRecs.reduce((s,r)=>s+(r.qty||1),0);
    // Status keys off filled + units still inbound (openOnPO), so a received-then-unfilled
    // line drops back to "Pending" rather than falsely showing "On PO".
    const sc = filled>=i.qty?'tag-Complete':openOnPO>0?'tag-m':'tag-s';
    const status = filled>=i.qty?'Filled':openOnPO>0?'On PO':'Pending';
    const itemPOs = linkedPOs.filter(o=>{
      const poItems=orderItems.filter(pi=>pi.poNumber===o.poNumber);
      return poItems.some(pi=>(i.sku&&pi.sku===i.sku)||(pi.manufacturer===i.manufacturer&&pi.model===i.model));
    });
    // A cancelled PO is still shown for traceability, but struck through and dimmed so a
    // line reading "Pending" next to a PO number explains itself at a glance.
    const poLinks = itemPOs.length
      ? itemPOs.map(o=>{
          const cx = o.status==='Cancelled';
          return `<a href="#" title="${cx?`PO ${escHtml(o.poNumber)} was cancelled — no longer counted as on PO`:`Open PO ${escHtml(o.poNumber)}`}" onclick="event.preventDefault();showPage('orders');openOrder('${sk(o.poNumber)}','project')"
          style="color:${cx?'var(--text-dim)':'var(--accent)'};font-family:var(--font-mono);font-size:11px;text-decoration:${cx?'line-through':'none'};">${escHtml(o.poNumber)}</a>`;
        }).join(', ')
      : '<span class="dim">—</span>';
    const lineTotal = i.qty * (i.unitPrice||0);
    const hasInv = invRecs.length > 0;
    const isOpen = expandedScopeItems.has(i.id);
    const counts={};
    invRecs.forEach(r=>{ const st=r.invStatus||'In Stock'; counts[st]=(counts[st]||0)+(r.qty||1); });
    const colors={Staged:'var(--accent3)',Allocated:'var(--accent)',Deployed:'var(--accent4)','In Stock':'var(--text-dim)','On Hand':'var(--text-dim)'};
    const invStatusCell = hasInv
      ? Object.entries(counts).map(([s,n])=>`<span style="font-size:9px;padding:1px 5px;border-radius:3px;border:1px solid ${colors[s]||'var(--text-dim)'};color:${colors[s]||'var(--text-dim)'};margin-right:3px;">${n} ${escHtml(s)}</span>`).join('')
      : '<span class="dim">—</span>';
    const availableStock=inventory.filter(inv=>
      ((i.sku&&inv.sku===i.sku)||(inv.manufacturer===i.manufacturer&&inv.model===i.model))&&
      isAllocatableStock(inv)
    );
    const stockQty=availableStock.reduce((s,inv)=>s+(inv.qty||1),0);
    rows.push(`<tr class="group-row" onclick="toggleScopeItem('${sk(i.id)}')">
      <td style="text-align:center;padding-left:4px;">${hasInv?`<span class="caret${isOpen?' open':''}">▶</span>`:'<span class="caret-spacer"></span>'}</td>
      <td class="sku-cell">${i.sku?escHtml(i.sku):'<span class="dim">—</span>'}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(i.manufacturer)}</td>
      <td style="font-size:13px">${escHtml(i.model)}</td>
      <td class="mono" style="text-align:center">
        <input type="number" value="${i.qty||1}" min="1" step="1"
          onchange="scopeItemUpdateQty('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:60px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td class="mono" style="text-align:center;color:var(--accent)">${onPO||'—'}</td>
      <td class="mono" style="text-align:center;color:var(--accent4)">${received||'—'}</td>
      <td class="mono" style="text-align:center;color:var(--accent3)">${filled}/${i.qty}</td>
      <td><span class="tag ${sc}">${status}</span></td>
      <td class="mono">
        <input type="number" value="${i.unitCost!=null&&i.unitCost!==''?parseFloat(i.unitCost||0).toFixed(2):''}" min="0" step="0.01"
          onchange="scopeItemUpdateCost('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td class="mono">
        <input type="number" value="${i.unitPrice!=null&&i.unitPrice!==''?parseFloat(i.unitPrice||0).toFixed(2):''}" min="0" step="0.01"
          onchange="scopeItemUpdatePrice('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td class="mono">${fmt(lineTotal)}</td>
      <td style="font-size:11px">${poLinks}</td>
      <td style="font-size:11px">${invStatusCell}</td>
      <td style="font-size:11px;color:var(--text-dim)">${escHtml(i.notes||'—')}</td>
      <td style="white-space:nowrap;">${stockQty>0?`<button class="btn-del" onclick="event.stopPropagation();openAllocateModal('${sk(i.id)}')" title="Allocate from stock (${stockQty} available)" style="color:var(--accent3);border-color:rgba(79,247,160,0.3);margin-right:2px;">⊕</button>`:''}<button class="btn-del" onclick="event.stopPropagation();deleteScopeItem('${sk(i.id)}')">✕</button></td>
    </tr>`);
    if(hasInv && isOpen){
      for(const r of invRecs){
        const loc=r.location?escHtml(r.location):'<span class="dim">—</span>';
        const ser=r.serial?`<span class="mono" style="font-size:10px">${escHtml(r.serial)}</span>`:'<span class="dim">—</span>';
        const cond=r.condition||'New';
        const ist=r.invStatus||r.status||'In Stock';
        const istColor=colors[ist]||'var(--text-dim)';
        rows.push(`<tr style="background:rgba(255,255,255,0.02);">
          <td></td>
          <td colspan="2" style="padding-left:24px;font-size:10px;color:var(--text-dim)">⤷ inventory</td>
          <td style="font-size:11px">${ser}</td>
          <td colspan="2" style="font-size:11px;color:var(--text-dim)" class="mono">${loc}</td>
          <td><span style="font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid ${istColor};color:${istColor};">${escHtml(ist)}</span></td>
          <td><span class="tag tag-${escHtml(cond)}" style="font-size:9px">${escHtml(cond)}</span></td>
          <td colspan="6" style="font-size:10px;color:var(--text-dim)">${escHtml(r.notes||'')}</td>
          <td></td>
          <td style="white-space:nowrap;"><button class="btn-del" onclick="event.stopPropagation();unfillScopeInventory('${sk(i.id)}','${sk(r.id)}')" title="Unfill — release this unit to unallocated stock" style="color:var(--warn);border-color:rgba(247,201,79,0.35);margin-right:2px;">↩</button><button class="btn-del" onclick="event.stopPropagation();openTransferFromInv('${sk(r.id)}')" title="Transfer / Relocate" style="color:var(--accent);border-color:rgba(79,142,247,0.3);">⇄</button></td>
        </tr>`);
      }
    }
  }
  tbody.innerHTML=rows.join('');
}

function renderProjectPOs(projectId){
  if(!projectId) return;
  applySortClasses('projPOs');
  const linkedPOs = orders.filter(o=>o.projectId===projectId);
  const rows = sortRows(linkedPOs, projPOsSort.col, projPOsSort.dir);
  const tbody = document.getElementById('proj-pos-tbody');
  if(!tbody) return;
  const fmt=n=>n?'$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','):'—';
  const sc={'Draft':'tag-b','Submitted':'tag-s','Backorder':'tag-m','Received':'tag-Complete','Cancelled':'tag-b'};
  const scopeItems = projectItems.filter(i=>i.projectId===projectId);
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state" style="padding:40px">
      <div style="font-size:13px;color:var(--text-dim)">No purchase orders yet. Use <strong>+ New PO</strong> to create one.</div>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML=rows.map(o=>{
    const poLineItems=orderItems.filter(i=>i.poNumber===o.poNumber);
    const iCount=poLineItems.length;
    // Scope analysis: for each PO line item, check if it matches a scope item
    let inScopeCount=0;
    poLineItems.forEach(pi=>{
      const matched=scopeItems.some(si=>
        (si.sku&&si.sku===pi.sku)||(si.manufacturer===pi.manufacturer&&si.model===pi.model)
      );
      if(matched) inScopeCount++;
    });
    let scopeLabel, scopeStyle;
    if(!iCount){
      scopeLabel='—'; scopeStyle='color:var(--text-dim)';
    } else if(inScopeCount===iCount){
      scopeLabel='In Scope'; scopeStyle='background:rgba(79,247,160,0.1);color:var(--accent3)';
    } else if(inScopeCount===0){
      scopeLabel='Not In Scope'; scopeStyle='background:rgba(247,79,126,0.1);color:var(--accent4)';
    } else {
      scopeLabel='Partly In Scope'; scopeStyle='background:rgba(247,201,79,0.1);color:var(--warn)';
    }
    const scopeCell = iCount
      ? `<span style="font-size:10px;font-family:var(--font-mono);padding:2px 7px;border-radius:3px;${scopeStyle}">${scopeLabel}</span>`
      : `<span style="color:var(--text-dim)">—</span>`;
    return `<tr class="group-row" onclick="showPage('orders');openOrder('${o.poNumber.replace(/'/g,"\\'")}','project')">
      <td class="sku-cell" style="color:var(--accent);font-family:var(--font-mono);font-size:11px;">${escHtml(o.poNumber)}</td>
      <td style="font-weight:600">${escHtml(o.vendor)}</td>
      <td><span class="tag ${sc[o.status]||'tag-b'}">${escHtml(o.status)}</span></td>
      <td class="mono" style="font-size:11px;color:var(--text-muted)">${escHtml(o.date||'—')}</td>
      <td class="mono">${fmt(poGrand(o))}</td>
      <td><span class="qty-badge qty-s">${iCount}</span></td>
      <td>${scopeCell}</td>
      <td><button class="btn-del" onclick="event.stopPropagation();deleteOrderFromProject('${o.poNumber.replace(/'/g,"\\'")}')">✕</button></td>
    </tr>`;
  }).join('');
}

function deleteOrderFromProject(poNum){
  if(!confirm(`Delete PO ${poNum}?`)) return;
  const deletedItemIds=orderItems.filter(i=>i.poNumber===poNum).map(i=>i.id);
  const delShipIds=shipments.filter(s=>s.poNumber===poNum).map(s=>s.id);
  const delShipItemIds=shipmentItems.filter(si=>delShipIds.includes(si.shipmentId)).map(si=>si.id);
  orders=orders.filter(o=>o.poNumber!==poNum);
  orderItems=orderItems.filter(i=>i.poNumber!==poNum);
  shipments=shipments.filter(s=>s.poNumber!==poNum);
  shipmentItems=shipmentItems.filter(si=>!delShipIds.includes(si.shipmentId));
  dbDelete('orders', poNum);
  dbDeleteMany('orderItems', deletedItemIds);
  dbDeleteMany('shipments', delShipIds);
  dbDeleteMany('shipmentItems', delShipItemIds);
  setDirty(true); updateOrdersStats(); renderOrdersTable();
  renderProjectPOs(currentProjectId);
  renderProjectScope(currentProjectId);
  toast(`PO ${poNum} deleted`,'success');
}

// Retroactively links inventory records to scope items for a project.
// Catches gaps where the PO had no projectId at receive time, or old code missed the link.
function repairScopeLinks(projectId){
  const projPONums=new Set(orders.filter(o=>o.projectId===projectId).map(o=>o.poNumber));
  const projInv=inventory.filter(i=>i.projectId===projectId||projPONums.has(i.poNumber));
  projectItems.filter(si=>si.projectId===projectId).forEach(si=>{
    if(!si.inventoryIds) si.inventoryIds=[];
    const unfilled=Array.isArray(si.unfilledIds)?si.unfilledIds:[];
    let changed=false;
    projInv.filter(i=>_itemMatch(i,si)).forEach(i=>{
      // Skip units that were deliberately unfilled — don't silently re-link them.
      if(unfilled.includes(i.id)) return;
      // Don't re-link a record that now belongs to a different project (e.g. transferred away):
      // it may still carry this project's PO number, but its current owner is elsewhere.
      if(i.projectId && i.projectId!==projectId) return;
      if(!si.inventoryIds.includes(i.id)){ si.inventoryIds.push(i.id); changed=true; }
    });
    if(changed) dbSave('projectItems',si);
  });
}

// Diagnostic — call diagScopeItem('s4pcb') from the browser console to inspect a specific item
window.diagScopeItem=function(modelFragment){
  const frag=modelFragment.toLowerCase();
  console.group('diagScopeItem: '+modelFragment);
  const sis=projectItems.filter(i=>i.model&&i.model.toLowerCase().includes(frag));
  console.log('Scope items found:', sis.map(i=>({id:i.id,projectId:i.projectId,mfg:i.manufacturer,model:i.model,inventoryIds:i.inventoryIds})));
  const invs=inventory.filter(i=>i.model&&i.model.toLowerCase().includes(frag));
  console.log('Inventory records found:', invs.map(i=>({id:i.id,projectId:i.projectId,poNumber:i.poNumber,mfg:i.manufacturer,model:i.model,qty:i.qty})));
  const ois=orderItems.filter(i=>i.model&&i.model.toLowerCase().includes(frag));
  console.log('Order items found:', ois.map(i=>({id:i.id,poNumber:i.poNumber,mfg:i.manufacturer,model:i.model,qtyOrdered:i.qtyOrdered,qtyReceived:i.qtyReceived})));
  sis.forEach(si=>{
    const projPONums=new Set(orders.filter(o=>o.projectId===si.projectId).map(o=>o.poNumber));
    console.log(`Project PO numbers for scope item "${si.model}":`, [...projPONums]);
    console.log('_itemMatch results against inventory:', invs.map(i=>({invModel:i.model,invMfg:i.manufacturer,matches:_itemMatch(i,si),invProjectId:i.projectId,inProjPOs:projPONums.has(i.poNumber)})));
  });
  console.groupEnd();
};

function refreshProjectDetail(projectId){
  if(!projectId || projectId!==currentProjectId) return;
  repairScopeLinks(projectId);
  renderProjectScope(projectId);
  renderProjectPOs(projectId);
  updateScopeTotal(projectId);
  renderProjTable();
}

// ── SCOPE ITEM FORM ──
function siCheckReady(){
  document.getElementById('si-btn-add').disabled=!(acCtx.si.mfg.selected&&acCtx.si.model.selected);
}

function addScopeItem(){
  const mfg=acCtx.si.mfg.selected, model=acCtx.si.model.selected;
  if(!mfg||!model||!currentProjectId){ toast('Select manufacturer and model','error'); return; }
  const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
  const sku=document.getElementById('si-sku').value;
  const existingScopeItem = projectItems.find(i=>i.projectId===currentProjectId&&(
    (sku && i.sku===sku) || (!sku && i.manufacturer===mfg && i.model===model)
  ));
  if(existingScopeItem){
    const addQty=Math.max(1,parseInt(document.getElementById('si-qty').value)||1);
    existingScopeItem.qty=(existingScopeItem.qty||0)+addQty;
    dbSave('projectItems', existingScopeItem);
    setDirty(true);
    renderProjectScope(currentProjectId);
    updateScopeTotal(currentProjectId);
    renderProjTable();
    resetScopeItemForm();
    toast(`${mfg} ${model} qty updated to ${existingScopeItem.qty}`,'success');
    return;
  }
  const pb=entry?catalog.find(r=>r.sku===entry.sku):null;

  // Unit Cost — from form, then pricebook, else null
  const costEl=document.getElementById('si-cost');
  let unitCost=costEl&&costEl.value!==''?parseFloat(costEl.value)||0:null;
  if(unitCost===null && pb && pb.unitCost) unitCost=pb.unitCost;

  // Unit Price — from form, then pricebook (unitPrice > msrp), else null
  const priceEl=document.getElementById('si-price');
  let unitPrice=priceEl&&priceEl.value!==''?parseFloat(priceEl.value)||0:null;
  if(unitPrice===null && pb) unitPrice=pb.unitPrice||pb.msrp||null;

  // Check for existing unallocated inventory before ordering new
  const availableInv=inventory.filter(i=>
    ((i.sku&&i.sku===sku)||(i.manufacturer===mfg&&i.model===model)) &&
    isAllocatableStock(i)
  );
  let allocate=false;
  if(availableInv.length){
    const totalAvailQty=availableInv.reduce((s,i)=>s+(i.qty||1),0);
    const locNames=[...new Set(availableInv.map(i=>i.location||'Unknown'))].join(', ');
    const scopeQty=Math.max(1,parseInt(document.getElementById('si-qty').value)||1);
    allocate=confirm(
      `${totalAvailQty} unit${totalAvailQty!==1?'s':''} of ${mfg} ${model} ${totalAvailQty===1?'is':'are'} already in stock at: ${locNames}.\n\nAllocate existing stock to this project instead of ordering new?`
    );
    if(allocate){
      let remaining=scopeQty;
      const proj=projects.find(p=>p.id===currentProjectId);
      // Mutate in memory first, merge + persist after — see mergeBulkStacks.
      const touched=[], fresh=new Set();
      for(const inv of availableInv){
        if(remaining<=0) break;
        const take=Math.min(remaining, inv.qty||1);
        if(inv.type==='bulk'&&take<inv.qty){
          const splitRec={...inv,id:uid(),qty:inv.qty-take,projectId:'',project:''};
          inventory.push(splitRec);
          fresh.add(splitRec.id); touched.push(splitRec);
          inv.qty=take;
        }
        inv.projectId=currentProjectId;
        inv.project=proj?proj.name:'';
        inv.invStatus='Allocated';
        touched.push(inv);
        remaining-=take;
      }
      touched.forEach(rec=>{ if(inventory.includes(rec)) mergeBulkStacks(rec, fresh); });
      setDirty(true);
      updateInvStats(); renderInvTable();
    }
  }

  const newScopeItem={
    id:uid(), projectId:currentProjectId,
    sku, manufacturer:mfg, model,
    category:entry?entry.category:'',
    qty:Math.max(1,parseInt(document.getElementById('si-qty').value)||1),
    unitCost: unitCost??0,
    unitPrice: unitPrice??0,
    itemStatus:'Pending',
    notes:document.getElementById('si-notes').value.trim(),
    inventoryIds:[],
  };
  projectItems.push(newScopeItem);

  // If existing inventory was allocated, link those IDs to the scope item (filled is derived)
  // A record absorbed by mergeBulkStacks is gone from inventory — link the survivors only.
  if(allocate && availableInv.length){
    availableInv.filter(inv=>inventory.includes(inv)&&inv.projectId===currentProjectId).forEach(inv=>{
      if(!newScopeItem.inventoryIds.includes(inv.id)) newScopeItem.inventoryIds.push(inv.id);
    });
  }

  dbSave('projectItems', newScopeItem);
  setDirty(true);
  renderProjectScope(currentProjectId);
  updateScopeTotal(currentProjectId);
  renderProjTable();
  resetScopeItemForm();
  renderStockTable();
  toast(`${mfg} ${model} added to scope`,'success');
}

function deleteScopeItem(id){
  const item=projectItems.find(i=>i.id===id); if(!item) return;
  const linked=getScopeItemInventory(item);
  if(linked.length){ openRemoveScopeModal(id); return; }
  if(!confirm(`Remove ${item.manufacturer} ${item.model} from scope?`)) return;
  projectItems=projectItems.filter(i=>i.id!==id);
  dbDelete('projectItems', id);
  setDirty(true);
  renderProjectScope(currentProjectId);
  updateScopeTotal(currentProjectId);
  renderProjTable();
  renderStockTable();
  toast('Item removed from scope','success');
}

let _rsiScopeItemId=null;

function openRemoveScopeModal(scopeItemId){
  const item=projectItems.find(i=>i.id===scopeItemId); if(!item) return;
  _rsiScopeItemId=scopeItemId;
  const recs=getScopeItemInventory(item);
  const units=recs.reduce((s,r)=>s+(r.qty||1),0);
  document.getElementById('rsi-item-label').textContent=
    `${item.manufacturer} ${item.model}${item.sku?' — '+item.sku:''}`;
  document.getElementById('rsi-count-note').textContent=
    `${units} unit${units!==1?'s':''} currently linked to this scope item need a destination.`;
  // Open-PO informational note (units ordered but not yet received)
  const openPO=(item.qty||0)-units;
  const poNote=document.getElementById('rsi-open-po-note');
  if(openPO>0){
    poNote.style.display='';
    poNote.textContent=`Note: ${openPO} unit(s) are on an open PO and not yet received. Removing this scope item does not cancel the PO; when those units arrive they will enter inventory unlinked to any scope.`;
  } else poNote.style.display='none';
  // Destination project dropdown (exclude current project)
  document.getElementById('rsi-proj').innerHTML=
    projects.filter(p=>p.id!==item.projectId)
      .map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join('');
  _locCascadeInit('rsi-loc');
  document.getElementById('rsi-loc').innerHTML='<option value="">— None —</option>';
  document.getElementById('rsi-note').value='';
  document.querySelector('input[name="rsi-mode"][value="unalloc"]').checked=true;
  rsiSetMode('unalloc');
  document.getElementById('rsi-modal').style.display='flex';
}

function rsiSetMode(mode){
  document.getElementById('rsi-proj-wrap').style.display=mode==='transfer'?'block':'none';
  document.getElementById('rsi-confirm-btn').textContent=
    mode==='transfer'?'Transfer Units':'Return to Unallocated';
}

function closeRemoveScopeModal(){
  document.getElementById('rsi-modal').style.display='none';
  _rsiScopeItemId=null;
}

function confirmRemoveScope(){
  const item=projectItems.find(i=>i.id===_rsiScopeItemId);
  if(!item){ closeRemoveScopeModal(); return; }
  const mode=document.querySelector('input[name="rsi-mode"]:checked').value;
  const note=document.getElementById('rsi-note').value.trim();
  const today=new Date().toLocaleDateString('en-US');
  const timestamp=new Date().toISOString();
  const locId=document.getElementById('rsi-loc').value||'';
  const locRec=locId?locations.find(l=>l.id===locId):null;
  const locCode=locRec?locRec.code:'';

  // Resolve destination project (transfer mode)
  let dest=null;
  if(mode==='transfer'){
    const destId=document.getElementById('rsi-proj').value;
    if(!destId){ toast('Select a destination project','error'); return; }
    if(destId===item.projectId){ toast('Choose a different project','error'); return; }
    dest=projects.find(p=>p.id===destId);
    if(!dest){ toast('Destination project not found','error'); return; }
  }

  // Snapshot the linked records ONCE before any mutation
  const recs=getScopeItemInventory(item);
  const destInvStatus = mode==='transfer'
    ? (locRec&&locRec.type==='staging'?'Staged':'Allocated')
    : 'Unallocated';

  const movedIds=[];
  for(const rec of recs){
    const fromProjectId=rec.projectId||'', fromProject=rec.project||'';
    const fromLocation=rec.location||'', fromLocationId=rec.locationId||'';
    if(mode==='transfer'){
      rec.projectId=dest.id; rec.project=dest.name;
      rec.invStatus=destInvStatus; rec.status='Allocated';
    } else {
      rec.projectId=''; rec.project='';
      rec.invStatus='Unallocated'; rec.status='Unallocated';
    }
    if(locId){ rec.locationId=locId; rec.location=locCode; }
    rec.lastUpdated=today;
    if(note) rec.notes=(rec.notes?rec.notes+'; ':'')+`Removed from ${fromProject}: ${note}`;
    movedIds.push(rec.id);
    // PO link preserved: rec.poNumber is never touched
    const xfr={
      id:uid(), timestamp,
      inventoryId:rec.id, sku:rec.sku||'',
      manufacturer:rec.manufacturer, model:rec.model, serial:rec.serial||'', qty:(rec.qty||1),
      fromProjectId, fromProject,
      toProjectId: mode==='transfer'?dest.id:'', toProject: mode==='transfer'?dest.name:'',
      fromLocation, fromLocationId,
      toLocation: locCode||fromLocation, toLocationId: locId||fromLocationId,
      notes: note||(mode==='transfer'?`Transferred from ${fromProject}`:`Returned to stock from ${fromProject}`),
    };
    transfers.push(xfr); dbSave('transfers', xfr);
    dbSave('inventory', rec);
  }

  // Transfer mode: link moved units into destination scope (create or merge)
  if(mode==='transfer'){
    let destScope=projectItems.find(i=>
      i.projectId===dest.id &&
      ((item.sku&&i.sku===item.sku)||(i.manufacturer===item.manufacturer&&i.model===item.model))
    );
    if(!destScope){
      const pb=catalog.find(r=>item.sku?r.sku===item.sku:(r.manufacturer===item.manufacturer&&r.model===item.model));
      destScope={
        id:uid(), projectId:dest.id,
        sku:item.sku||'', manufacturer:item.manufacturer, model:item.model,
        category:pb?pb.category:(item.category||''),
        qty:movedIds.length,
        unitCost:pb?(pb.unitCost||0):(item.unitCost||0),
        unitPrice:pb?(pb.unitPrice||pb.msrp||0):(item.unitPrice||0),
        itemStatus: destInvStatus==='Staged'?'Staged':'Allocated',
        inventoryIds:[...movedIds],
        notes: note?`Transferred in: ${note}`:'Transferred in from another project',
      };
      projectItems.push(destScope);
    } else {
      if(!destScope.inventoryIds) destScope.inventoryIds=[];
      movedIds.forEach(id=>{ if(!destScope.inventoryIds.includes(id)) destScope.inventoryIds.push(id); });
    }
    // Expand dest scope qty so derived filled never exceeds qty (filled is computed from inventoryIds)
    const destFilled=(destScope.inventoryIds||[])
      .reduce((s,id)=>{ const r=inventory.find(i=>i.id===id); return s+(r?(r.qty||1):0); },0);
    destScope.qty=Math.max(destScope.qty||0, destFilled);
    dbSave('projectItems', destScope);
  }

  // Delete the source scope item
  const srcProjectId=item.projectId;
  projectItems=projectItems.filter(i=>i.id!==_rsiScopeItemId);
  dbDelete('projectItems', _rsiScopeItemId);

  setDirty(true);
  closeRemoveScopeModal();
  renderProjectScope(srcProjectId);
  updateScopeTotal(srcProjectId);
  updateProjectBreakdown(srcProjectId);
  renderProjTable();
  updateInvStats(); renderInvTable(); renderStockTable();
  const units=recs.reduce((s,r)=>s+(r.qty||1),0);
  toast(mode==='transfer'
    ? `${units} unit${units!==1?'s':''} transferred to ${dest.name}`
    : `${units} unit${units!==1?'s':''} returned to Unallocated stock`,'success');
}

let _allocScopeItemId=null;

// Units a single inventory record can contribute: serialized records are always one
// physical unit; bulk records carry their qty.
function _allocAvail(inv){ return inv.type==='serialized'?1:Math.max(1,inv.qty||1); }

function openAllocateModal(scopeItemId){
  const item=projectItems.find(i=>i.id===scopeItemId);
  if(!item) return;
  _allocScopeItemId=scopeItemId;
  // Need = what this line still lacks. Drives which rows pre-check and how many
  // units each pre-fills, so filling a 1-qty line off a bulk record takes 1, not the record.
  const filled=getScopeItemFilled(item);
  const need=Math.max(0,(item.qty||1)-filled);
  document.getElementById('alloc-modal-item-label').textContent=
    `${item.manufacturer} ${item.model}${item.sku?' — '+item.sku:''} · ${filled}/${item.qty||1} filled${need?` · need ${need}`:' · line is filled'}`;
  const available=inventory.filter(inv=>
    ((item.sku&&inv.sku===item.sku)||(inv.manufacturer===item.manufacturer&&inv.model===item.model))&&
    isAllocatableStock(inv)
  );
  const colors={Staged:'var(--accent3)',Allocated:'var(--accent)',Deployed:'var(--accent4)',
    'In Stock':'var(--text-dim)','On Hand':'var(--text-dim)'};
  const body=document.getElementById('alloc-modal-body');
  if(!available.length){
    body.innerHTML='<div style="color:var(--text-dim);font-size:13px;padding:16px 0;">No matching unallocated inventory found.</div>';
    document.getElementById('alloc-confirm-btn').disabled=true;
  } else {
    document.getElementById('alloc-confirm-btn').disabled=false;
    // Greedy pre-fill: walk the records taking only as many units as the line still needs.
    let remaining=need;
    const plan={};
    for(const inv of available){
      const take=Math.min(remaining, _allocAvail(inv));
      plan[inv.id]=take;
      remaining-=take;
    }
    const anyPartial=available.some(inv=>_allocAvail(inv)>1);
    body.innerHTML=`<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;width:28px;"></th>
        <th style="padding:6px 8px;text-align:left;">Serial / ID</th>
        <th style="padding:6px 8px;text-align:left;">Location</th>
        <th style="padding:6px 8px;text-align:center;">Qty</th>
        <th style="padding:6px 8px;text-align:left;">Status</th>
      </tr></thead>
      <tbody>${available.map(inv=>{
        const st=inv.invStatus||inv.status||'In Stock';
        const stColor=colors[st]||'var(--text-dim)';
        const avail=_allocAvail(inv);
        const take=plan[inv.id]||0;
        // Bulk record → editable qty, so part of it can be allocated and the rest left in stock.
        const qtyCell=avail>1
          ? `<input type="number" min="1" max="${avail}" value="${take||1}" data-alloc-qty="${escHtml(inv.id)}"
               title="Units to allocate (max ${avail} on hand)" onclick="event.stopPropagation()"
               style="width:56px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;padding:2px 5px;">
             <span style="color:var(--text-dim);font-size:10px;margin-left:4px;">of ${avail}</span>`
          : `<span style="font-family:var(--font-mono);">1</span>`;
        return `<tr style="border-bottom:1px solid var(--border);font-size:12px;">
          <td style="padding:7px 8px;text-align:center;"><input type="checkbox" data-alloc-inv="${escHtml(inv.id)}" style="cursor:pointer;"${take>0?' checked':''}></td>
          <td style="padding:7px 8px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${escHtml(inv.serial||inv.id.slice(-6))}</td>
          <td style="padding:7px 8px;color:var(--text-muted);">${escHtml(inv.location||'—')}</td>
          <td style="padding:7px 8px;text-align:center;">${qtyCell}</td>
          <td style="padding:7px 8px;"><span style="font-size:9px;padding:1px 6px;border-radius:3px;border:1px solid ${stColor};color:${stColor};">${escHtml(st)}</span></td>
        </tr>`;
      }).join('')}</tbody></table>${anyPartial?`<div style="font-size:11px;color:var(--text-dim);padding:8px 2px 0;">Lower the qty on a bulk line to take part of it — the remainder stays in unallocated stock as its own record.</div>`:''}`;
  }
  document.getElementById('alloc-modal').style.display='flex';
}

function closeAllocateModal(){
  document.getElementById('alloc-modal').style.display='none';
  _allocScopeItemId=null;
}

function confirmAllocate(){
  const scopeItem=projectItems.find(i=>i.id===_allocScopeItemId);
  if(!scopeItem){ closeAllocateModal(); return; }
  const proj=projects.find(p=>p.id===scopeItem.projectId);
  const checked=[...document.querySelectorAll('#alloc-modal-body input[data-alloc-inv]:checked')]
    .map(el=>el.dataset.allocInv);
  if(!checked.length){ toast('No inventory selected','error'); return; }
  if(!scopeItem.inventoryIds) scopeItem.inventoryIds=[];
  const today=new Date().toLocaleDateString('en-US');
  const qtyById={};
  document.querySelectorAll('#alloc-modal-body input[data-alloc-qty]').forEach(el=>{
    qtyById[el.dataset.allocQty]=Math.max(1,parseInt(el.value)||1);
  });
  // Mutate in memory first, then merge + persist — a record must never be saved
  // and deleted in the same operation (see mergeBulkStacks).
  const touched=[], fresh=new Set();
  let totalAllocated=0, splits=0;
  for(const invId of checked){
    const inv=inventory.find(i=>i.id===invId);
    if(!inv) continue;
    const avail=_allocAvail(inv);
    const take=Math.min(qtyById[invId]??avail, avail);
    // Partial bulk → split: this record keeps the allocated units, the remainder
    // stays behind as its own record (same location, PO, condition, shelf status).
    if(take<avail){
      const rem={...inv, id:uid(), qty:avail-take, projectId:'', project:'', lastUpdated:today};
      inventory.push(rem);
      fresh.add(rem.id); touched.push(rem);
      inv.qty=take; inv.lastUpdated=today; splits++;
    }
    inv.projectId=scopeItem.projectId;
    inv.project=proj?proj.name:'';
    inv.invStatus='Allocated';
    inv.status='Allocated';
    if(!scopeItem.inventoryIds.includes(invId)) scopeItem.inventoryIds.push(invId);
    // If this exact unit was previously unfilled from this line, re-filling clears the exclusion.
    if(Array.isArray(scopeItem.unfilledIds)) scopeItem.unfilledIds=scopeItem.unfilledIds.filter(id=>id!==invId);
    totalAllocated+=(inv.qty||1);
    touched.push(inv);
  }
  // Remainders rejoin the shelf stack they came from; allocated units join the stack
  // this project already holds. Absorbed scope links are repointed at the survivor.
  const before=inventory.length;
  touched.forEach(rec=>{ if(inventory.includes(rec)) mergeBulkStacks(rec, fresh); });
  // `before` is post-split, so any further drop in record count is stacks absorbed.
  const merged=Math.max(0, before-inventory.length);
  dbSave('projectItems',scopeItem);
  setDirty(true);
  closeAllocateModal();
  renderProjectScope(scopeItem.projectId);
  updateProjectBreakdown(scopeItem.projectId);
  updateInvStats(); renderInvTable(); renderStockTable();
  const note=[splits?`${splits} split`:'', merged?`${merged} stack${merged!==1?'s':''} merged`:''].filter(Boolean).join(' · ');
  toast(`${totalAllocated} unit${totalAllocated!==1?'s':''} allocated to scope item${note?` · ${note}`:''}`,'success');
}

// Unfill a single inventory unit from a scope line: the unit was received for this project
// but had to be pulled for something else. Releases it to unallocated stock (so it can be
// filled on another project), drops the filled count here, and — because it stays on the
// scope line at the same qty — the line reverts to Pending and reappears in the PO picker.
function unfillScopeInventory(scopeItemId, invId){
  const scopeItem=projectItems.find(i=>i.id===scopeItemId); if(!scopeItem) return;
  const inv=inventory.find(i=>i.id===invId); if(!inv) return;
  const proj=projects.find(p=>p.id===scopeItem.projectId);
  const projName=proj?proj.name:(inv.project||'');
  const total=inv.qty||1;

  // Bulk lines release partially — a project holding 2 of something it only needs 1 of
  // should be able to give back exactly 1 rather than dumping the whole stack and refilling.
  let units=total;
  if(inv.type!=='serialized' && total>1){
    const ans=prompt(`Unfill how many of the ${total} ${inv.manufacturer} ${inv.model} on this project?\n\n1–${total} — whatever is left stays allocated here.`, String(total));
    if(ans===null) return;
    units=Math.min(total, Math.max(0, parseInt(ans)||0));
    if(!units) return;
  } else if(!confirm(`Unfill ${total} unit${total!==1?'s':''} of ${inv.manufacturer} ${inv.model} from this project?\n\nIt will return to unallocated stock and this scope line will show as needing fill again.`)) return;

  const today=new Date().toLocaleDateString('en-US');
  const timestamp=new Date().toISOString();
  const fromProjectId=inv.projectId||'', fromProject=inv.project||projName;
  const fromLocation=inv.location||'', fromLocationId=inv.locationId||'';
  const partial=units<total;

  // Partial release splits the record: `rel` goes back to stock, `inv` keeps the rest
  // allocated and stays linked to the scope line. A full release just flips this record.
  const fresh=new Set();
  let rel=inv;
  if(partial){
    rel={...inv, id:uid(), qty:units, lastUpdated:today};
    inventory.push(rel); fresh.add(rel.id);
    inv.qty=total-units; inv.lastUpdated=today;
  }
  rel.projectId=''; rel.project='';
  rel.invStatus='Unallocated'; rel.status='Unallocated';

  // Mark the released record as deliberately unfilled so repairScopeLinks won't
  // silently re-attach it (its poNumber still belongs to this project's PO). On a full
  // release the scope line drops the link too; on a partial one it keeps what stayed.
  if(!Array.isArray(scopeItem.unfilledIds)) scopeItem.unfilledIds=[];
  if(!scopeItem.unfilledIds.includes(rel.id)) scopeItem.unfilledIds.push(rel.id);
  if(!partial && Array.isArray(scopeItem.inventoryIds)) scopeItem.inventoryIds=scopeItem.inventoryIds.filter(id=>id!==invId);
  dbSave('projectItems', scopeItem);

  // Audit trail — mirrors the "return to stock" transfer log.
  const xfr={
    id:uid(), timestamp,
    inventoryId:rel.id, sku:rel.sku||'',
    manufacturer:rel.manufacturer, model:rel.model, serial:rel.serial||'', qty:units,
    fromProjectId, fromProject,
    toProjectId:'', toProject:'',
    fromLocation, fromLocationId,
    toLocation:fromLocation, toLocationId:fromLocationId,
    notes:`Unfilled from ${fromProject||'project'} — returned to unallocated stock`,
  };
  transfers.push(xfr); dbSave('transfers', xfr);

  // Back on the shelf, the released record is the same stack as any matching stock units
  // in that location — recombine so a split doesn't leave two piles. Merged last, so the
  // transfer logged above still names the record that moved, and so each record is
  // persisted exactly once (mergeBulkStacks saves what it keeps).
  mergeBulkStacks(rel, fresh);
  if(partial && inventory.includes(inv)) mergeBulkStacks(inv, fresh);

  setDirty(true);
  renderProjectScope(scopeItem.projectId);
  updateProjectBreakdown(scopeItem.projectId);
  updateScopeTotal(scopeItem.projectId);
  renderProjTable();
  updateInvStats(); renderInvTable(); renderStockTable();
  toast(`${units} unit${units!==1?'s':''} unfilled — returned to unallocated stock${partial?` · ${total-units} still allocated`:''}`,'success');
}

function scopeItemUpdateQty(id, val){
  const item=projectItems.find(i=>i.id===id); if(!item) return;
  item.qty=Math.max(1,parseInt(val)||1);
  dbSave('projectItems', item);
  setDirty(true);
  updateScopeTotal(currentProjectId);
  renderProjectScope(currentProjectId);
}

function scopeItemUpdateCost(id, val){
  const item=projectItems.find(i=>i.id===id); if(!item) return;
  item.unitCost=parseFloat(val)||0;
  dbSave('projectItems', item);
  setDirty(true);
}

function scopeItemUpdatePrice(id, val){
  const item=projectItems.find(i=>i.id===id); if(!item) return;
  item.unitPrice=parseFloat(val)||0;
  dbSave('projectItems', item);
  setDirty(true);
  updateScopeTotal(currentProjectId);
  renderProjectScope(currentProjectId);
}

// Fix 4: Add PO item to project scope
function addPOItemToScope(poItemId){
  const poi=orderItems.find(i=>i.id===poItemId); if(!poi) return;
  const po=orders.find(o=>o.poNumber===poi.poNumber); if(!po) return;

  // If PO has no project, prompt user to first link it to a project
  if(!po.projectId){
    toast('This PO is not linked to a project. Edit the PO to assign a project first.','error');
    return;
  }

  const projectId=po.projectId;

  // Check for duplicate — use parens to avoid operator precedence bug
  const alreadyInScope=projectItems.find(i=>
    i.projectId===projectId &&
    ((poi.sku && i.sku && i.sku===poi.sku) ||
     (i.manufacturer===poi.manufacturer && i.model===poi.model))
  );
  if(alreadyInScope){ toast('Already in scope','error'); return; }

  // Unit cost from the PO line (order items carry unitCost, not unitPrice); resale
  // price from the pricebook (the PO doesn't carry a resale price).
  const pb=catalog.find(r=>
    (poi.sku && r.sku===poi.sku) ||
    (r.manufacturer===poi.manufacturer && r.model===poi.model)
  );
  let unitCost=poi.unitCost||0;
  if(!unitCost && pb) unitCost=pb.unitCost||0;
  const unitPrice=pb?(pb.unitPrice||pb.msrp||0):0;
  const newPOScope={
    id:uid(), projectId,
    sku:poi.sku||'', manufacturer:poi.manufacturer||'', model:poi.model||poi.description||'',
    category:poi.category||'',
    qty:poi.qtyOrdered||1,
    unitCost,
    unitPrice,
    itemStatus:'On PO',
    notes:'',
  };
  projectItems.push(newPOScope);
  dbSave('projectItems', newPOScope);
  setDirty(true);
  toast(`${poi.manufacturer||''} ${poi.model||poi.description||''} added to scope`.trim(),'success');
  // Refresh project detail if currently viewing that project
  if(currentProjectId===projectId){
    renderProjectScope(projectId);
    updateScopeTotal(projectId);
  }
}

// Fix 5: Export Scope as Invoice PDF
function exportScopeInvoice(projectId){
  const proj=projects.find(p=>p.id===projectId); if(!proj) return;
  const items=projectItems.filter(i=>i.projectId===projectId);
  if(!items.length){ toast('No scope items to export','error'); return; }
  const fmt=n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const total=items.reduce((s,i)=>s+(i.qty*(i.unitPrice||0)),0);
  const today=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const rows=items.map((i,idx)=>`
    <tr style="background:${idx%2===0?'#fff':'#f9f9fb'}">
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #e8e8ee;">
        ${i.sku?`<div style="font-family:monospace;font-size:10px;color:#888;margin-bottom:2px">${escHtml(i.sku)}</div>`:''}
        <div style="font-weight:600">${escHtml(i.manufacturer)} ${escHtml(i.model)}</div>
        ${i.notes?`<div style="font-size:11px;color:#888;margin-top:2px">${escHtml(i.notes)}</div>`:''}
      </td>
      <td style="padding:10px 14px;font-size:12px;text-align:center;border-bottom:1px solid #e8e8ee;">${i.qty}</td>
      <td style="padding:10px 14px;font-size:12px;text-align:right;font-family:monospace;border-bottom:1px solid #e8e8ee;">${i.unitPrice>0?fmt(i.unitPrice):'—'}</td>
      <td style="padding:10px 14px;font-size:12px;text-align:right;font-family:monospace;font-weight:600;border-bottom:1px solid #e8e8ee;">${i.unitPrice>0?fmt(i.qty*i.unitPrice):'—'}</td>
    </tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice — ${escHtml(proj.name)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#222;background:#fff;}
@media print{.no-print{display:none;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
</head><body>
<div style="max-width:800px;margin:0 auto;padding:48px 48px 60px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;">
    <div>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:6px;">AVProcure</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:-0.5px;">Invoice</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:700;color:#333;">${escHtml(proj.name)}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">${today}</div>
      ${proj.contractValue?`<div style="font-size:12px;color:#888;margin-top:2px;">Contract: ${fmt(proj.contractValue)}</div>`:''}
    </div>
  </div>
  ${[proj.firstName,proj.lastName].filter(Boolean).join(' ')||proj.address?`
  <div style="margin-bottom:28px;padding:14px 16px;background:#f5f5f8;border-radius:6px;font-size:13px;">
    ${[proj.firstName,proj.lastName].filter(Boolean).join(' ')
      ?`<div style="font-weight:600">${escHtml([proj.firstName,proj.lastName].filter(Boolean).join(' '))}</div>`:''}
    ${proj.address?`<div style="color:#555;margin-top:2px">${escHtml(proj.address)}</div>`:''}
  </div>`:''}
  <table style="width:100%;border-collapse:collapse;border:1px solid #e8e8ee;border-radius:6px;overflow:hidden;">
    <thead>
      <tr style="background:#2a2a2a;">
        <th style="padding:10px 14px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;">Item</th>
        <th style="padding:10px 14px;text-align:center;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:60px;">Qty</th>
        <th style="padding:10px 14px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:120px;">Unit Price</th>
        <th style="padding:10px 14px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:130px;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-top:0;border:1px solid #e8e8ee;border-top:none;">
    <div style="min-width:260px;padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-top:2px solid #222;margin-top:4px;font-weight:700;">
        <span>Total</span><span>${fmt(total)}</span>
      </div>
    </div>
  </div>
  <div class="no-print" style="margin-top:32px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 28px;background:#2a2a2a;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
</div></body></html>`;
  const win=window.open('','_blank');
  if(!win){ toast('Pop-up blocked — allow pop-ups to export the invoice','error'); return; }
  win.document.write(html);
  win.document.close();
}

// Pallet Manifest — itemized packing list of the serialized/bulk inventory units
// currently filling a project's scope, for outbound shipping. Contents + serials
// only (no pricing). One row per serialized unit; bulk records show a qty.
function exportPalletManifest(projectId){
  const proj=projects.find(p=>p.id===projectId); if(!proj) return;
  const scope=projectItems.filter(i=>i.projectId===projectId);
  const rows=[]; let totalUnits=0;
  scope.forEach(si=>{
    getScopeItemInventory(si).forEach(r=>{
      const units=r.type==='serialized'?1:(r.qty||1);
      totalUnits+=units;
      rows.push({
        mfg:r.manufacturer||si.manufacturer||'', model:r.model||si.model||'',
        category:r.category||si.category||'', serial:r.type==='serialized'?(r.serial||''):'',
        qty:units, bulk:r.type!=='serialized',
      });
    });
  });
  if(!rows.length){ toast('No assigned inventory to include on the manifest','error'); return; }
  rows.sort((a,b)=>(a.mfg+' '+a.model).localeCompare(b.mfg+' '+b.model));
  const today=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const client=proj.clientId?clients.find(c=>c.id===proj.clientId):null;
  const shipToName=client?client.name:([proj.firstName,proj.lastName].filter(Boolean).join(' ')||proj.name);
  const shipToLines=[];
  if(client){
    if(client.street) shipToLines.push(client.street);
    const cl=[client.city,[client.state,client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if(cl) shipToLines.push(cl);
    if(client.phone) shipToLines.push(client.phone);
  } else if(proj.address) shipToLines.push(proj.address);
  const bodyRows=rows.map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':'#f9f9fb'}">
      <td style="padding:8px 12px;font-size:12px;text-align:center;border-bottom:1px solid #e8e8ee;color:#888;">${i+1}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #e8e8ee;font-weight:600;">${escHtml(r.mfg||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #e8e8ee;">${escHtml(r.model||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;color:#555;border-bottom:1px solid #e8e8ee;">${escHtml(r.category||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;font-family:monospace;border-bottom:1px solid #e8e8ee;">${r.serial?escHtml(r.serial):(r.bulk?`<span style="color:#888">bulk &times; ${r.qty}</span>`:'<span style="color:#c0392b">&mdash; no serial &mdash;</span>')}</td>
    </tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pallet Manifest — ${escHtml(proj.name)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#222;background:#fff;}
@media print{.no-print{display:none;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
</head><body>
<div style="max-width:800px;margin:0 auto;padding:48px 48px 60px;">
  <div style="background:#2a2a2a;padding:22px 28px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="color:#fff;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">AVProcure</div>
      <div style="color:#fff;font-size:28px;font-weight:700;letter-spacing:1px;">Pallet Manifest</div>
    </div>
    <div style="text-align:right;color:#fff;">
      <div style="font-size:20px;font-weight:700;">${escHtml(proj.name)}</div>
      <div style="color:#ccc;font-size:12px;margin-top:4px;">${escHtml(today)}</div>
    </div>
  </div>
  <div style="display:flex;gap:0;margin-bottom:28px;border:1px solid #ddd;border-top:none;">
    <div style="flex:1;padding:14px 18px;border-right:1px solid #eee;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:6px;">Ship To</div>
      <div style="font-size:13px;font-weight:700;">${escHtml(shipToName)}</div>
      ${shipToLines.map(l=>`<div style="font-size:12px;color:#555;">${escHtml(l)}</div>`).join('')}
    </div>
    <div style="flex:0 0 200px;padding:14px 18px;text-align:right;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:6px;">Total Units</div>
      <div style="font-size:26px;font-weight:700;">${totalUnits}</div>
      <div style="font-size:11px;color:#888;">${rows.length} line${rows.length!==1?'s':''}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e8e8ee;border-radius:6px;overflow:hidden;">
    <thead><tr style="background:#2a2a2a;">
      <th style="padding:9px 12px;text-align:center;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#fff;font-weight:600;width:36px;">#</th>
      <th style="padding:9px 12px;text-align:left;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#fff;font-weight:600;width:150px;">Manufacturer</th>
      <th style="padding:9px 12px;text-align:left;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#fff;font-weight:600;">Model</th>
      <th style="padding:9px 12px;text-align:left;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#fff;font-weight:600;width:130px;">Category</th>
      <th style="padding:9px 12px;text-align:left;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#fff;font-weight:600;width:155px;">Serial Number</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div style="margin-top:32px;display:flex;justify-content:space-between;gap:40px;">
    <div style="flex:1;"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:26px;">Packed By</div><div style="border-top:1px solid #999;font-size:11px;color:#888;padding-top:4px;">Signature / Date</div></div>
    <div style="flex:1;"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:26px;">Received By</div><div style="border-top:1px solid #999;font-size:11px;color:#888;padding-top:4px;">Signature / Date</div></div>
  </div>
  <div style="margin-top:40px;padding-top:14px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
    <span>Pallet Manifest</span><span>${escHtml(proj.name)} &middot; ${escHtml(today)}</span>
  </div>
  <div class="no-print" style="margin-top:28px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 28px;background:#2a2a2a;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
</div></body></html>`;
  const win=window.open('','_blank');
  if(!win){ toast('Pop-up blocked — allow pop-ups to export the manifest','error'); return; }
  win.document.write(html);
  win.document.close();
}

// Mark an outbound pallet as shipped: every unit filling its scope (plus anything else it
// owns) is set to the terminal 'Sold' status, dropped from on-hand/availability, a transfer
// is logged to a "shipped out" sink, and the pallet is set Complete. Inverse of receiving.
function markPalletShipped(projectId){
  const proj=projects.find(p=>p.id===projectId); if(!proj) return;
  if((proj.type||'job')!=='outbound'){ toast('Only outbound pallets can be shipped','error'); return; }
  const seen=new Set(); const units=[];
  projectItems.filter(i=>i.projectId===projectId).forEach(si=>
    getScopeItemInventory(si).forEach(r=>{ if(!seen.has(r.id)){ seen.add(r.id); units.push(r); } }));
  inventory.forEach(r=>{ if(r.projectId===projectId && !seen.has(r.id)){ seen.add(r.id); units.push(r); } });
  const live=units.filter(r=>r.invStatus!=='Sold');
  if(!live.length){ toast('Nothing on this pallet to ship (empty or already shipped)','error'); return; }
  if(!confirm(`Mark "${proj.name}" as SHIPPED?\n\n${live.length} unit(s) will be marked Sold and removed from on-hand inventory, and the pallet set to Complete. The manifest and invoice remain available.`)) return;
  const today=new Date().toLocaleDateString('en-US');
  const timestamp=new Date().toISOString();
  live.forEach(inv=>{
    const fromLoc=inv.location||'', fromLocId=inv.locationId||'', fromProj=inv.project||'', fromProjId=inv.projectId||'';
    inv.invStatus='Sold'; inv.status='Sold';
    inv.location=''; inv.locationId='';
    inv.lastUpdated=today;
    dbSave('inventory', inv);
    const xfr={
      id:uid(), timestamp,
      inventoryId:inv.id, sku:inv.sku||'',
      manufacturer:inv.manufacturer, model:inv.model, serial:inv.serial||'', qty:(inv.qty||1),
      fromProjectId:fromProjId, fromProject:fromProj,
      toProjectId:'', toProject:'(shipped out)',
      fromLocation:fromLoc, fromLocationId:fromLocId, toLocation:'', toLocationId:'',
      notes:`Shipped out / sold via ${proj.name}`,
    };
    transfers.push(xfr); dbSave('transfers', xfr);
  });
  proj.status='Complete'; dbSave('projects', proj);
  setDirty(true);
  updateInvStats(); renderInvTable(); renderStockTable();
  renderProjTable(); updateProjStats();
  openProject(projectId);
  toast(`${proj.name} shipped — ${live.length} unit(s) marked Sold`,'success');
}



function resetScopeItemForm(){
  ['si-mfg','si-model','si-sku'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const qty=document.getElementById('si-qty'); if(qty) qty.value=1;
  const cost=document.getElementById('si-cost'); if(cost) cost.value='';
  const price=document.getElementById('si-price'); if(price) price.value='';
  const notes=document.getElementById('si-notes'); if(notes) notes.value='';
  const modelInp=document.getElementById('si-model');
  if(modelInp){ modelInp.disabled=true; modelInp.placeholder='Select manufacturer first…'; }
  acCtx.si.mfg.selected=null; acCtx.si.model.selected=null;
  const btn=document.getElementById('si-btn-add'); if(btn) btn.disabled=true;
  const mfgInp=document.getElementById('si-mfg');
  if(mfgInp){const bar=mfgInp.closest('.add-bar');if(!bar||bar.classList.contains('open')||window.innerWidth>768) mfgInp.focus();}
}

// ══════════════════════════════════════════════════════════════════════════
// REASSIGN / SPLIT SCOPE
// Drain a catch-all project by moving each scope line — and the inventory that
// fills it — into a sibling project (same client location), one at a time or in
// batches, until the source is empty. POs stay on the source (reassign those
// separately). Writes immediately; a moved line can be undone in-session.
// ══════════════════════════════════════════════════════════════════════════
let _reassignSourceId=null, _reassignItemIds=[], _reassignPONums=[], _reassignMode='scope';

// The client a project belongs to — resolved via its location (authoritative)
// with its direct clientId as a fallback.
function _projClientId(p){
  if(p && p.clientLocationId){ const l=clientLocations.find(x=>x.id===p.clientLocationId); if(l) return l.clientId||''; }
  return (p && p.clientId) || '';
}
// Reassign destinations = every OTHER project belonging to the SAME CLIENT
// (across all that client's locations), so scope never moves to another client.
function _reassignDests(src){
  const cid=_projClientId(src);
  if(!cid) return [];
  return projects.filter(p=>p.id!==src.id && _projClientId(p)===cid)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
}

function openReassignScope(projectId){
  const src=projects.find(p=>p.id===projectId);
  if(!src){ toast('Project not found','error'); return; }
  if(!_reassignDests(src).length){ toast('No sibling projects to move into — create projects under this location in Front Desk first','error'); return; }
  const scope=projectItems.filter(i=>i.projectId===projectId);
  const pos=orders.filter(o=>o.projectId===projectId);
  if(!scope.length && !pos.length){ toast('Nothing to reassign (no scope items or POs)','error'); return; }
  _reassignSourceId=projectId;
  _reassignItemIds=scope.map(i=>i.id);
  _reassignPONums=pos.map(o=>o.poNumber);
  _reassignMode = scope.length ? 'scope' : 'pos';
  _renderReassignModal();
}

// Move a whole PO (all its lines) to dest — sets projectId + the denormalized projectName.
function _movePO(order, dest){
  order.projectId=dest.id; order.projectName=dest.name; dbSave('orders', order);
}
function reassignPO(poNum, destId){
  const o=orders.find(x=>x.poNumber===poNum); if(!o) return;
  const dest=projects.find(p=>p.id===destId); if(!dest) return;
  _movePO(o, dest);
  _renderReassignModal();
}
function setReassignMode(m){ _reassignMode=m; _renderReassignModal(); }

// Move one scope line + its currently-filled units to dest. Captures units via
// getScopeItemInventory (handles both explicit inventoryIds and the legacy
// project+product fallback), makes the link explicit, then repoints everything.
function _moveScopeLine(pi, dest){
  const units=getScopeItemInventory(pi);
  const ids=units.map(u=>u.id);
  if(ids.length) pi.inventoryIds=Array.from(new Set([...(pi.inventoryIds||[]), ...ids]));
  pi.projectId=dest.id; dbSave('projectItems', pi);
  units.forEach(inv=>{ inv.projectId=dest.id; inv.project=dest.name; dbSave('inventory', inv); });
}

function reassignScopeItem(itemId, destId){
  const pi=projectItems.find(i=>i.id===itemId); if(!pi) return;
  const dest=projects.find(p=>p.id===destId); if(!dest) return;
  _moveScopeLine(pi, dest);
  _renderReassignModal();
}

function reassignBatch(){
  const destId=document.getElementById('rsa-batch-dest').value;
  if(!destId){ toast('Pick a destination','error'); return; }
  const dest=projects.find(p=>p.id===destId); if(!dest) return;
  const checks=[...document.querySelectorAll('.rsa-chk:checked')];
  if(!checks.length){ toast('Check some rows first','error'); return; }
  if(_reassignMode==='pos'){
    checks.forEach(c=>{ const o=orders.find(x=>x.poNumber===c.dataset.po); if(o) _movePO(o, dest); });
  } else {
    checks.forEach(c=>{ const pi=projectItems.find(i=>i.id===c.dataset.id); if(pi) _moveScopeLine(pi, dest); });
  }
  toast(`Moved ${checks.length} → ${dest.name}`,'success');
  _renderReassignModal();
}

function rsaToggleAll(chk){ document.querySelectorAll('.rsa-chk:not([disabled])').forEach(c=>c.checked=chk); }

function closeReassignScope(){
  const o=document.getElementById('reassign-overlay'); if(o) o.remove();
  _reassignSourceId=null; _reassignItemIds=[]; _reassignPONums=[]; _reassignMode='scope';
  if(currentProjectId) refreshProjectDetail(currentProjectId);
  renderProjTable(); updateProjStats(); renderOrdersTable(); updateOrdersStats();
}

function _renderReassignModal(){
  const src=projects.find(p=>p.id===_reassignSourceId); if(!src) return;
  const dests=_reassignDests(src);
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const fmt=n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const destOpts=dests.map(d=>`<option value="${escHtml(d.id)}">${escHtml(d.name)}</option>`).join('');
  const mode=_reassignMode;

  const items=_reassignItemIds.map(id=>projectItems.find(i=>i.id===id)).filter(Boolean)
    .sort((a,b)=>(a.manufacturer||'').toLowerCase().localeCompare((b.manufacturer||'').toLowerCase())
              || (a.model||'').toLowerCase().localeCompare((b.model||'').toLowerCase()));
  const pos=_reassignPONums.map(n=>orders.find(o=>o.poNumber===n)).filter(Boolean)
    .sort((a,b)=>String(a.poNumber).localeCompare(String(b.poNumber),undefined,{numeric:true}));
  const scopeRemaining=items.filter(i=>i.projectId===_reassignSourceId).length;
  const poRemaining=pos.filter(o=>o.projectId===_reassignSourceId).length;
  const list = mode==='pos' ? pos : items;
  const remaining = mode==='pos' ? poRemaining : scopeRemaining;

  const tally={};
  list.forEach(x=>{ if(x.projectId!==_reassignSourceId) tally[x.projectId]=(tally[x.projectId]||0)+1; });
  const tallyHtml=dests.filter(d=>tally[d.id]).map(d=>`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(79,247,160,0.1);color:var(--accent3);margin-left:4px;">${escHtml(d.name)}: ${tally[d.id]}</span>`).join('');

  let rowsHtml, headCols;
  if(mode==='pos'){
    headCols=`<th style="width:30px;"></th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">PO · Vendor</th>
      <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Date</th>
      <th style="padding:6px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Total</th>
      <th style="padding:6px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Destination</th>`;
    rowsHtml=pos.map(o=>{
      const moved=o.projectId!==_reassignSourceId;
      const dest=moved?projects.find(p=>p.id===o.projectId):null;
      const total=typeof poGrand==='function'?poGrand(o):(o.totalValue||0);
      return `<tr style="border-bottom:1px solid var(--border);${moved?'opacity:0.5;':''}">
        <td style="padding:6px 8px;text-align:center;"><input type="checkbox" class="rsa-chk" data-po="${escHtml(o.poNumber)}" ${moved?'disabled':''}></td>
        <td style="padding:6px 8px;font-size:12px;"><b style="font-family:var(--font-mono);">${escHtml(o.poNumber)}</b> <span style="color:var(--text-dim);">${escHtml(o.vendor||'')}</span>${o.status==='Cancelled'?' <span style="color:var(--accent4);font-size:10px;">(cancelled)</span>':''}</td>
        <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text-dim);">${escHtml(o.date||'—')}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-size:11px;">${fmt(total)}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">
          ${moved
            ? `<span style="font-size:11px;color:var(--accent3);">→ ${escHtml(dest?dest.name:'?')}</span> <a href="#" onclick="event.preventDefault();reassignPO('${sk(o.poNumber)}','${sk(_reassignSourceId)}')" style="font-size:10px;color:var(--text-dim);margin-left:4px;">undo</a>`
            : `<select onchange="if(this.value)reassignPO('${sk(o.poNumber)}',this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text);padding:3px 6px;"><option value="">— keep here —</option>${destOpts}</select>`}
        </td>
      </tr>`;
    }).join('');
  } else {
    headCols=`<th style="width:30px;"></th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Item</th>
      <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Qty</th>
      <th style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Inv</th>
      <th style="padding:6px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Destination</th>`;
    rowsHtml=items.map(i=>{
      const moved=i.projectId!==_reassignSourceId;
      const dest=moved?projects.find(p=>p.id===i.projectId):null;
      const invN=getScopeItemInventory(i).reduce((s,r)=>s+(r.qty||1),0);
      return `<tr style="border-bottom:1px solid var(--border);${moved?'opacity:0.5;':''}">
        <td style="padding:6px 8px;text-align:center;"><input type="checkbox" class="rsa-chk" data-id="${escHtml(i.id)}" ${moved?'disabled':''}></td>
        <td style="padding:6px 8px;font-size:12px;">${escHtml(i.manufacturer||'')} <b>${escHtml(i.model||'')}</b>${i.sku?` <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);">${escHtml(i.sku)}</span>`:''}</td>
        <td style="padding:6px 8px;text-align:center;font-family:var(--font-mono);font-size:11px;">${i.qty||1}</td>
        <td style="padding:6px 8px;text-align:center;font-size:10px;color:var(--text-dim);">${invN?invN+'u':'—'}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">
          ${moved
            ? `<span style="font-size:11px;color:var(--accent3);">→ ${escHtml(dest?dest.name:'?')}</span> <a href="#" onclick="event.preventDefault();reassignScopeItem('${sk(i.id)}','${sk(_reassignSourceId)}')" style="font-size:10px;color:var(--text-dim);margin-left:4px;">undo</a>`
            : `<select onchange="if(this.value)reassignScopeItem('${sk(i.id)}',this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text);padding:3px 6px;"><option value="">— keep here —</option>${destOpts}</select>`}
        </td>
      </tr>`;
    }).join('');
  }

  const srcEmpty = !projectItems.some(i=>i.projectId===_reassignSourceId)
                && !inventory.some(i=>i.projectId===_reassignSourceId)
                && !orders.some(o=>o.projectId===_reassignSourceId);
  const tabBtn=(m,label)=>`<button onclick="setReassignMode('${m}')" style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:5px;cursor:pointer;border:1px solid ${mode===m?'var(--accent)':'var(--border)'};background:${mode===m?'var(--accent)':'transparent'};color:${mode===m?'#fff':'var(--text-muted)'};">${label}</button>`;
  const noteHtml = mode==='pos'
    ? 'Moving a PO moves the whole order (all its lines) to the destination project.'
    : 'Filled inventory moves with each scope line.';

  let ov=document.getElementById('reassign-overlay'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='reassign-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:400;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px;';
  ov.onclick=e=>{ if(e.target===ov) closeReassignScope(); };
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border-bright);border-radius:12px;width:700px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.5);">
    <div style="padding:18px 22px 12px;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:15px;font-weight:700;">⇄ Reassign — ${escHtml(src.name)}</div>
        <button onclick="closeReassignScope()" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;">✕</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;">${tabBtn('scope',`Scope (${scopeRemaining})`)}${tabBtn('pos',`POs (${poRemaining})`)}</div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted);"><b style="color:${remaining?'var(--warn)':'var(--accent3)'};">${remaining}</b> ${mode==='pos'?'PO':'item'}(s) still here${remaining?'':' — all moved'}.${tallyHtml}</div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:11px;color:var(--text-dim);cursor:pointer;"><input type="checkbox" onchange="rsaToggleAll(this.checked)"> select all</label>
        <span style="font-size:11px;color:var(--text-dim);">move checked →</span>
        <select id="rsa-batch-dest" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-size:12px;color:var(--text);padding:4px 8px;"><option value="">— destination —</option>${destOpts}</select>
        <button class="btn" onclick="reassignBatch()" style="font-size:12px;padding:5px 12px;background:rgba(79,142,247,0.15);color:var(--accent);border:1px solid rgba(79,142,247,0.35);">Move</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="position:sticky;top:0;background:var(--surface2);z-index:1;">${headCols}</tr></thead>
        <tbody>${rowsHtml||`<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px;">${mode==='pos'?'No POs on this project.':'No scope items.'}</td></tr>`}</tbody>
      </table>
    </div>
    <div style="padding:12px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div style="font-size:11px;color:var(--text-dim);">${noteHtml}</div>
      <div style="display:flex;gap:8px;">
        ${srcEmpty?`<button class="btn" onclick="deleteProject('${sk(_reassignSourceId)}');closeReassignScope()" style="font-size:12px;padding:6px 14px;background:rgba(247,79,126,0.1);color:var(--accent4);border:1px solid rgba(247,79,126,0.25);">Delete empty '${escHtml(src.name)}'</button>`:''}
        <button class="btn" onclick="closeReassignScope()" style="font-size:12px;padding:6px 16px;background:var(--accent);color:#fff;border:none;">Done</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
}


// ═══════════════════════════════════════════════
