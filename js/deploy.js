// ══════════════════════════════════════════════════════════════════════════
//  DEPLOYMENT CART → RELEASE MANIFEST → APPROVE
//  Stage inventory units in a transient cart (localStorage), export an itemized/
//  serialized release manifest PDF, then approve to atomically mark everything
//  Deployed and write a permanent, reprintable record (who released it, who took
//  it, where, when). Uses the shared globals: inventory, projects, clients,
//  deployments, deploymentItems, deployCart, invSelected, transfers.
// ══════════════════════════════════════════════════════════════════════════

const DEPLOY_CART_KEY = 'avp_deploy_cart';

function _invById(id){ return inventory.find(i=>i.id===id); }
function _deployTerminal(it){ return !it || ['Deployed','Sold','Returned'].includes(it.invStatus); }
function _deployAvail(it){ return !it ? 0 : (it.type==='serialized' ? 1 : Math.max(0, it.qty||0)); }
function _cartQtyFor(id){ const e=deployCart.find(c=>c.inventoryId===id); return e?e.qty:0; }

// ── Cart persistence (transient; DB stores only approved releases) ──────────
function saveDeployCart(){
  try{ localStorage.setItem(DEPLOY_CART_KEY, JSON.stringify(deployCart)); }catch(e){}
  updateDeployBadge();
}
function refreshDeployCart(){
  const cleaned=[]; let dropped=0;
  for(const e of (Array.isArray(deployCart)?deployCart:[])){
    const it=_invById(e && e.inventoryId);
    if(!it || _deployTerminal(it)){ dropped++; continue; }
    const qty=Math.min(Math.max(1, parseInt(e.qty)||1), _deployAvail(it));
    if(qty>0) cleaned.push({inventoryId:it.id, qty}); else dropped++;
  }
  deployCart=cleaned; saveDeployCart();
  if(dropped) toast(`${dropped} cart item${dropped>1?'s':''} no longer available — removed`,'');
}
function loadDeployCart(){
  try{ deployCart=JSON.parse(localStorage.getItem(DEPLOY_CART_KEY)||'[]'); }catch(e){ deployCart=[]; }
  if(!Array.isArray(deployCart)) deployCart=[];
  refreshDeployCart();
}
function updateDeployBadge(){
  const el=document.getElementById('deploy-cart-badge'); if(!el) return;
  const n=deployCart.reduce((s,c)=>s+(c.qty||0),0);
  el.textContent = n ? `Cart (${n})` : 'Cart';
}

// ── Add / remove ────────────────────────────────────────────────────────────
function addToDeployCart(id, qty){
  const it=_invById(id);
  if(!it){ toast('Item not found','error'); return; }
  if(_deployTerminal(it)){ toast(`Already ${it.invStatus} — can't deploy`,'error'); return; }
  const cap=_deployAvail(it);
  if(cap<=0){ toast('Nothing available to deploy on this record','error'); return; }
  if(it.type==='serialized'){
    if(_cartQtyFor(id)>0){ toast('Already in cart',''); return; }
    deployCart.push({inventoryId:id, qty:1});
  } else {
    // Bulk: add the whole remaining pile by default; the exact deploy qty is then
    // adjustable per-line in the cart (see setDeployCartQty). No blocking prompt.
    const remaining=cap-_cartQtyFor(id);
    if(remaining<=0){ toast('All available already in cart',''); return; }
    const add=(qty!=null) ? Math.min(Math.max(1, parseInt(qty)||0), remaining) : remaining;
    if(add<=0){ toast('Enter a valid quantity','error'); return; }
    const e=deployCart.find(c=>c.inventoryId===id);
    if(e) e.qty+=add; else deployCart.push({inventoryId:id, qty:add});
  }
  saveDeployCart();
  toast('Added to deployment cart','success');
  if(document.getElementById('deploy-cart-overlay')) renderDeployCartBody();
}
function addSelectedToDeployCart(){
  if(!invSelected.size){ toast('Nothing selected','error'); return; }
  let added=0, skipped=0;
  for(const id of Array.from(invSelected)){
    const it=_invById(id);
    if(!it || _deployTerminal(it)){ skipped++; continue; }
    if(it.type==='serialized'){
      if(_cartQtyFor(id)>0){ skipped++; continue; }
      deployCart.push({inventoryId:id, qty:1}); added++;
    } else {
      const remaining=_deployAvail(it)-_cartQtyFor(id);
      if(remaining<=0){ skipped++; continue; }
      const e=deployCart.find(c=>c.inventoryId===id);
      if(e) e.qty+=remaining; else deployCart.push({inventoryId:id, qty:remaining});
      added++;
    }
  }
  saveDeployCart();
  clearInvSelection();
  renderInvTable();
  toast(`Added ${added} to cart${skipped?` · ${skipped} skipped`:''}`, added?'success':'');
}
function setDeployCartQty(id, val){
  const it=_invById(id), e=deployCart.find(c=>c.inventoryId===id);
  if(!it||!e) return;
  const avail=_deployAvail(it);
  e.qty=Math.min(Math.max(1, parseInt(val)||1), avail);  // clamp 1..on-hand
  saveDeployCart();
  renderDeployCartBody();
}
function removeFromDeployCart(id){ deployCart=deployCart.filter(c=>c.inventoryId!==id); saveDeployCart(); renderDeployCartBody(); }
function clearDeployCart(){ if(!deployCart.length) return; if(!confirm('Empty the deployment cart?')) return; deployCart=[]; saveDeployCart(); renderDeployCartBody(); }

// ── Inventory row multi-select ───────────────────────────────────────────────
function toggleInvSelect(id, checked){
  if(checked) invSelected.add(id); else invSelected.delete(id);
  updateInvSelectionBar();
}
function toggleInvSelectGroup(idsCsv, checked){
  const ids=(idsCsv||'').split(',').filter(Boolean);
  ids.forEach(id=>{ if(checked) invSelected.add(id); else invSelected.delete(id); });
  document.querySelectorAll('#inv-tbody input[data-inv-select]').forEach(cb=>{
    if(ids.includes(cb.getAttribute('data-inv-select'))) cb.checked=checked;
  });
  updateInvSelectionBar();
}
function toggleInvSelectAll(checked){
  document.querySelectorAll('#inv-tbody input[data-inv-select]').forEach(cb=>{
    cb.checked=checked;
    const id=cb.getAttribute('data-inv-select');
    if(checked) invSelected.add(id); else invSelected.delete(id);
  });
  document.querySelectorAll('#inv-tbody input.inv-selbox:not([data-inv-select])').forEach(cb=>{ cb.checked=checked; });
  updateInvSelectionBar();
}
function clearInvSelection(){
  invSelected.clear();
  document.querySelectorAll('#inv-tbody input.inv-selbox').forEach(cb=>{ cb.checked=false; });
  const sa=document.getElementById('inv-select-all'); if(sa) sa.checked=false;
  updateInvSelectionBar();
}
function updateInvSelectionBar(){
  let bar=document.getElementById('inv-sel-bar');
  const n=invSelected.size;
  if(!n){ if(bar) bar.remove(); return; }
  if(!bar){
    bar=document.createElement('div');
    bar.id='inv-sel-bar';
    bar.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:400;background:var(--surface);border:1px solid var(--accent);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.4);display:flex;align-items:center;gap:14px;padding:10px 16px;';
    document.body.appendChild(bar);
  }
  bar.innerHTML=`<span style="font-size:13px;color:var(--text);"><b>${n}</b> selected</span>
    <button class="btn" onclick="openInventoryPickList()" style="font-size:12px;background:rgba(79,142,247,0.12);color:var(--accent);border:1px solid rgba(79,142,247,0.35);padding:6px 12px;">📋 Pick List</button>
    <button class="btn" onclick="addSelectedToDeployCart()" style="font-size:12px;background:rgba(247,79,126,0.12);color:var(--accent4);border:1px solid rgba(247,79,126,0.3);padding:6px 12px;">⬆ Add to Deployment Cart</button>
    <button class="btn btn-ghost" onclick="clearInvSelection()" style="font-size:12px;padding:6px 10px;">Clear</button>`;
}

// ── Cart modal ───────────────────────────────────────────────────────────────
function openDeployCart(){
  refreshDeployCart();
  let ov=document.getElementById('deploy-cart-overlay'); if(ov) ov.remove();
  ov=document.createElement('div');
  ov.id='deploy-cart-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:600;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closeDeployCart(); };
  // Group projects by Client · Location so duplicate project names (Unallocated,
  // Main, Change Order…) are disambiguated and the list reads cleanly.
  const _grp={};
  projects.forEach(p=>{
    const cl=(typeof projClientName==='function'?projClientName(p):'')||'';
    const lo=(typeof projLocationName==='function'?projLocationName(p):'')||'';
    const key=[cl,lo].filter(Boolean).join(' · ')||'— Unassigned —';
    (_grp[key]=_grp[key]||[]).push(p);
  });
  const projOpts=Object.keys(_grp).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})).map(k=>{
    const opts=_grp[k].slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''))
      .map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name||'(unnamed)')}</option>`).join('');
    return `<optgroup label="${escHtml(k)}">${opts}</optgroup>`;
  }).join('');
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:720px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);">
      <div style="font-size:17px;font-weight:700;">🚚 Deployment Cart</div>
      <button onclick="closeDeployCart()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--surface2);">
      <input id="deploy-cart-name" placeholder="Name this cart (e.g. job name + date)" value="${escHtml(_activeCartName)}"
        style="flex:1;min-width:160px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:6px 8px;font-size:12px;outline:none;">
      <button class="btn btn-ghost" onclick="saveNamedCart()" style="font-size:12px;" title="Save this cart to reopen later, from any machine">💾 Save Cart</button>
      <button class="btn btn-ghost" onclick="openSavedCarts()" style="font-size:12px;">📁 Saved (${deployCarts.length})</button>
      <button class="btn btn-ghost" onclick="newCart()" style="font-size:12px;" title="Start a fresh empty cart">＋ New</button>
    </div>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Destination — Project</label>
          <select id="deploy-proj" onchange="deployProjectChange()" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
            <option value="">— none / ad-hoc —</option>${projOpts}
          </select>
        </div>
        <div>
          <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Recipient — who took it *</label>
          <input id="deploy-recipient" type="text" placeholder="Name of person taking shipment" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
        </div>
      </div>
      <div>
        <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Destination — address / detail *</label>
        <input id="deploy-dest" type="text" placeholder="Where it's going (auto-fills from project; editable)" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
      </div>
      <div>
        <label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Notes</label>
        <input id="deploy-notes" type="text" placeholder="Optional" style="width:100%;margin-top:4px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 8px;font-size:13px;outline:none;">
      </div>
      <div id="deploy-cart-body"></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;padding:14px 20px;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--surface);">
      <button class="btn btn-ghost" onclick="clearDeployCart()" style="font-size:12px;">Clear Cart</button>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-ghost" onclick="exportDeployManifest()" style="font-size:12px;">🖨 Export Manifest</button>
        <button class="btn" onclick="approveDeployment()" style="font-size:12px;background:rgba(79,247,160,0.14);color:var(--accent3);border:1px solid rgba(79,247,160,0.3);">✓ Approve &amp; Deploy</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  renderDeployCartBody();
}
function closeDeployCart(){ const o=document.getElementById('deploy-cart-overlay'); if(o) o.remove(); }

// ── Saved (named) carts — persisted server-side so they survive a cleared browser and
//    reopen from any machine; multiple can be saved at once. ────────────────────────────
let _activeCartName = '';
function _cartUnits(items){
  return (items||[]).reduce((s,e)=>{ const it=_invById(e.inventoryId); return s+((it&&it.type==='serialized')?1:(e.qty||0)); },0);
}
function _refreshSavedCount(){
  const btn=document.querySelector('#deploy-cart-overlay [onclick="openSavedCarts()"]');
  if(btn) btn.textContent=`📁 Saved (${deployCarts.length})`;
}
function saveNamedCart(){
  const nameEl=document.getElementById('deploy-cart-name');
  const name=(nameEl?nameEl.value:'').trim();
  if(!name){ toast('Enter a name for the cart','error'); if(nameEl) nameEl.focus(); return; }
  if(!deployCart.length){ toast('Cart is empty — nothing to save','error'); return; }
  const now=new Date().toISOString();
  const items=deployCart.map(e=>({inventoryId:e.inventoryId, qty:e.qty}));
  // Upsert by name (case-insensitive) so re-saving under the same name updates in place.
  let rec=deployCarts.find(c=>(c.name||'').trim().toLowerCase()===name.toLowerCase());
  if(rec){ rec.name=name; rec.updatedAt=now; rec.items=items; }
  else { rec={id:uid(), name, createdAt:now, updatedAt:now, notes:'', items}; deployCarts.push(rec); }
  dbSave('deployCarts', rec);
  setDirty(true);
  _activeCartName=name;
  _refreshSavedCount();
  toast(`Cart “${name}” saved (${items.length} line${items.length!==1?'s':''})`,'success');
}
function loadNamedCart(id){
  const rec=deployCarts.find(c=>c.id===id); if(!rec){ toast('Cart not found','error'); return; }
  if(deployCart.length && !confirm(`Replace the current cart (${deployCart.length} line${deployCart.length!==1?'s':''}) with “${rec.name}”?`)) return;
  deployCart=(rec.items||[]).map(e=>({inventoryId:e.inventoryId, qty:Math.max(1,parseInt(e.qty)||1)}));
  refreshDeployCart();          // drops any items no longer available, persists to localStorage
  _activeCartName=rec.name||'';
  closeSavedCarts();
  if(!document.getElementById('deploy-cart-overlay')) openDeployCart();
  else { renderDeployCartBody(); const n=document.getElementById('deploy-cart-name'); if(n) n.value=_activeCartName; }
  toast(`Loaded “${rec.name}” (${deployCart.length} line${deployCart.length!==1?'s':''})`,'success');
}
function deleteNamedCart(id){
  const rec=deployCarts.find(c=>c.id===id); if(!rec) return;
  if(!confirm(`Delete saved cart “${rec.name}”? (This does not touch inventory.)`)) return;
  deployCarts=deployCarts.filter(c=>c.id!==id);
  dbDelete('deployCarts', id);
  setDirty(true);
  renderSavedCartsBody();
  _refreshSavedCount();
  toast('Saved cart deleted','');
}
function newCart(){
  if(deployCart.length && !confirm(`Start a new empty cart? The current cart (${deployCart.length} line${deployCart.length!==1?'s':''}) will be cleared — save it first if you want to keep it.`)) return;
  deployCart=[]; saveDeployCart(); _activeCartName='';
  const n=document.getElementById('deploy-cart-name'); if(n) n.value='';
  renderDeployCartBody();
  toast('New empty cart','');
}
function openSavedCarts(){
  let ov=document.getElementById('saved-carts-overlay'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='saved-carts-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:700;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closeSavedCarts(); };
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:560px;width:100%;max-height:82vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);">
      <div style="font-size:16px;font-weight:700;">📁 Saved Carts</div>
      <button onclick="closeSavedCarts()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div id="saved-carts-body" style="padding:8px 12px;"></div>
  </div>`;
  document.body.appendChild(ov);
  renderSavedCartsBody();
}
function closeSavedCarts(){ const o=document.getElementById('saved-carts-overlay'); if(o) o.remove(); }
function renderSavedCartsBody(){
  const el=document.getElementById('saved-carts-body'); if(!el) return;
  const list=deployCarts.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  if(!list.length){ el.innerHTML='<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:24px;">No saved carts yet. Build a cart, name it, and click 💾 Save Cart.</div>'; return; }
  el.innerHTML=list.map(c=>{
    const units=_cartUnits(c.items), lines=(c.items||[]).length;
    const when=c.updatedAt?new Date(c.updatedAt).toLocaleString('en-US'):'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 8px;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.name||'(unnamed)')}</div>
        <div style="font-size:11px;color:var(--text-dim);">${lines} line${lines!==1?'s':''} · ${units} unit${units!==1?'s':''}${when?` · ${escHtml(when)}`:''}</div>
      </div>
      <button class="btn" onclick="loadNamedCart('${escHtml(c.id)}')" style="font-size:11px;padding:5px 10px;background:rgba(79,142,247,0.12);color:var(--accent);border:1px solid rgba(79,142,247,0.4);">Load</button>
      <button class="btn-del" onclick="deleteNamedCart('${escHtml(c.id)}')" title="Delete saved cart">✕</button>
    </div>`;
  }).join('');
}

function renderDeployCartBody(){
  const el=document.getElementById('deploy-cart-body'); if(!el){ updateDeployBadge(); return; }
  if(!deployCart.length){
    el.innerHTML='<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:24px;">Cart is empty. On the Inventory tab, tick items and “Add to Deployment Cart”, or use the ⬆ button on a row.</div>';
    updateDeployBadge(); return;
  }
  let totalUnits=0;
  const rows=deployCart.map(e=>{
    const it=_invById(e.inventoryId); if(!it) return '';
    const units=it.type==='serialized'?1:e.qty; totalUnits+=units;
    const avail=_deployAvail(it);
    const serial=it.type==='serialized'
      ? (it.serial?`<span style="color:var(--text)">${escHtml(it.serial)}</span>`:'<span style="color:var(--warn)">no serial</span>')
      : `<span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="color:var(--text-dim);font-size:11px;">deploy</span>
          <input type="number" min="1" max="${avail}" value="${e.qty}" title="Quantity to deploy (max ${avail} on hand)"
            onchange="setDeployCartQty('${escHtml(it.id)}',this.value)" onclick="event.stopPropagation()"
            style="width:64px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;padding:2px 5px;">
          <span style="color:var(--text-dim);font-size:10px;">of ${avail} on hand (bulk)</span>
        </span>`;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:6px 8px;font-size:12px;">${escHtml(it.manufacturer||'')} <b>${escHtml(it.model||'')}</b></td>
      <td style="padding:6px 8px;font-size:11px;font-family:var(--font-mono);">${serial}</td>
      <td style="padding:6px 8px;text-align:right;"><button class="btn-del" onclick="removeFromDeployCart('${escHtml(it.id)}')" title="Remove">✕</button></td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:12px;font-weight:700;">Items</span>
      <span style="font-size:12px;color:var(--text-dim);">${totalUnits} unit${totalUnits!==1?'s':''} · ${deployCart.length} line${deployCart.length!==1?'s':''}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>`;
  updateDeployBadge();
}

function deployProjectChange(){
  const sel=document.getElementById('deploy-proj'), dest=document.getElementById('deploy-dest');
  if(!sel||!dest) return;
  const p=projects.find(x=>x.id===sel.value); if(!p) return;
  const parts=[];
  const client=p.clientId?clients.find(c=>c.id===p.clientId):null;
  if(client){
    if(client.name) parts.push(client.name);
    if(client.street) parts.push(client.street);
    const cl=[client.city,[client.state,client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if(cl) parts.push(cl);
  } else if(p.address){ parts.push(p.address); }
  if(!parts.length) parts.push(p.name);
  dest.value=parts.join(', ');
}

// ── Manifest PDF (draft from cart, or reprint from a stored deployment) ───────
function _deployRowsFromCart(){
  const rows=[]; let total=0;
  for(const e of deployCart){
    const it=_invById(e.inventoryId); if(!it) continue;
    const units=it.type==='serialized'?1:e.qty; total+=units;
    rows.push({mfg:it.manufacturer||'', model:it.model||'', category:it.category||'',
      serial:it.type==='serialized'?(it.serial||''):'', qty:units, bulk:it.type!=='serialized'});
  }
  return {rows, total};
}
function _deployRowsFromRecord(dep){
  const items=deploymentItems.filter(di=>di.deploymentId===dep.id);
  let total=0;
  const rows=items.map(di=>{ const units=di.qty||1; total+=units;
    return {mfg:di.manufacturer||'', model:di.model||'', category:'',
      serial:di.serial||'', qty:units, bulk:!di.serial && units>1}; });
  return {rows, total};
}
function exportDeployManifest(deploymentId){
  let rows, total, meta;
  if(deploymentId){
    const dep=deployments.find(d=>d.id===deploymentId);
    if(!dep){ toast('Deployment not found','error'); return; }
    ({rows,total}=_deployRowsFromRecord(dep));
    meta={draft:false, date:dep.date||'', when:dep.timestamp?new Date(dep.timestamp).toLocaleString('en-US'):(dep.date||''),
      recipient:dep.recipient||'', destination:dep.destination||'', releasedBy:dep.releasedBy||''};
  } else {
    if(!deployCart.length){ toast('Cart is empty','error'); return; }
    ({rows,total}=_deployRowsFromCart());
    meta={draft:true,
      date:new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),
      when:new Date().toLocaleString('en-US'),
      recipient:((document.getElementById('deploy-recipient')||{}).value||''),
      destination:((document.getElementById('deploy-dest')||{}).value||''),
      releasedBy:(window.APP_USER||'')};
  }
  if(!rows.length){ toast('Nothing to put on the manifest','error'); return; }
  rows.sort((a,b)=>(a.mfg+' '+a.model).localeCompare(b.mfg+' '+b.model));
  const bodyRows=rows.map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':'#f9f9fb'}">
      <td style="padding:8px 12px;font-size:12px;text-align:center;border-bottom:1px solid #e8e8ee;color:#888;">${i+1}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #e8e8ee;font-weight:600;">${escHtml(r.mfg||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #e8e8ee;">${escHtml(r.model||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;color:#555;border-bottom:1px solid #e8e8ee;">${escHtml(r.category||'—')}</td>
      <td style="padding:8px 12px;font-size:12px;font-family:monospace;border-bottom:1px solid #e8e8ee;">${r.serial?escHtml(r.serial):(r.bulk?`<span style="color:#888">bulk &times; ${r.qty}</span>`:'<span style="color:#c0392b">&mdash; no serial &mdash;</span>')}</td>
    </tr>`).join('');
  const draftTag=meta.draft?'<span style="font-size:11px;background:#c0392b;color:#fff;padding:2px 8px;border-radius:3px;letter-spacing:1px;margin-left:10px;vertical-align:middle;">DRAFT</span>':'';
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Deployment Manifest${meta.draft?' (Draft)':''}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#222;background:#fff;}
@media print{.no-print{display:none;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
</head><body>
<div style="max-width:800px;margin:0 auto;padding:48px 48px 60px;">
  <div style="background:#2a2a2a;padding:22px 28px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="color:#fff;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">AVProcure</div>
      <div style="color:#fff;font-size:28px;font-weight:700;letter-spacing:1px;">Deployment / Release Manifest${draftTag}</div>
    </div>
    <div style="text-align:right;color:#fff;">
      <div style="color:#ccc;font-size:12px;">${escHtml(meta.when||meta.date||'')}</div>
    </div>
  </div>
  <div style="display:flex;gap:0;margin-bottom:28px;border:1px solid #ddd;border-top:none;">
    <div style="flex:1;padding:14px 18px;border-right:1px solid #eee;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:6px;">Released From / By</div>
      <div style="font-size:13px;font-weight:700;">Main Warehouse</div>
      ${meta.releasedBy?`<div style="font-size:12px;color:#555;">Released by: ${escHtml(meta.releasedBy)}</div>`:''}
      <div style="font-size:12px;color:#555;">${escHtml(meta.when||meta.date||'')}</div>
    </div>
    <div style="flex:1;padding:14px 18px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:6px;">Released To</div>
      <div style="font-size:13px;font-weight:700;">${escHtml(meta.recipient||'—')}</div>
      <div style="font-size:12px;color:#555;">${escHtml(meta.destination||'—')}</div>
    </div>
    <div style="flex:0 0 130px;padding:14px 18px;text-align:right;border-left:1px solid #eee;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:6px;">Total Units</div>
      <div style="font-size:26px;font-weight:700;">${total}</div>
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
    <div style="flex:1;"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:26px;">Released By</div><div style="border-top:1px solid #999;font-size:11px;color:#888;padding-top:4px;">Signature / Date</div></div>
    <div style="flex:1;"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:26px;">Received By</div><div style="border-top:1px solid #999;font-size:11px;color:#888;padding-top:4px;">Signature / Date</div></div>
  </div>
  <div style="margin-top:40px;padding-top:14px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
    <span>Deployment Manifest</span><span>${escHtml(meta.when||meta.date||'')}</span>
  </div>
  <div class="no-print" style="margin-top:28px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 28px;background:#2a2a2a;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
</div></body></html>`;
  const win=window.open('','_blank');
  if(!win){ toast('Pop-up blocked — allow pop-ups to export the manifest','error'); return; }
  win.document.write(html); win.document.close();
}

// ── Approve & deploy: status flips + permanent record + audit trail ──────────
function _logDeployTransfer(rec, qty, fromLoc, fromLocId, dep){
  const xfr={id:uid(), timestamp:dep.timestamp, inventoryId:rec.id, sku:rec.sku||'',
    manufacturer:rec.manufacturer||'', model:rec.model||'', serial:rec.serial||'', qty:qty||1,
    fromProjectId:rec.projectId||'', fromProject:rec.project||'',
    toProjectId:dep.destinationProjectId||'', toProject:'',
    fromLocation:fromLoc||'', fromLocationId:fromLocId||'', toLocation:'Deployed', toLocationId:'',
    notes:`Deployed to ${dep.recipient} @ ${dep.destination}`};
  transfers.push(xfr); dbSave('transfers', xfr);
}
// Create an approved deployment header. Shared by the deployment cart and by
// dropship receiving, so a shipment that never touched a shelf still produces the
// same release record, manifest, and audit trail as one picked from the warehouse.
function _createDeployment({recipient, destination, projectId, notes}){
  const now=new Date();
  const dep={id:uid(), date:now.toLocaleDateString('en-US'), timestamp:now.toISOString(),
    status:'approved', recipient, destination, destinationProjectId:projectId||'',
    releasedBy:(window.APP_USER||''), notes:notes||''};
  deployments.push(dep); dbSave('deployments', dep);
  return dep;
}

// Record one already-Deployed inventory record against a deployment, with its
// transfer log. fromLoc is where the unit came from — blank for a dropship, which
// never had a location to leave.
function _addDeploymentItem(dep, rec, qty, fromLoc, fromLocId){
  const di={id:uid(), deploymentId:dep.id, inventoryId:rec.id, sku:rec.sku||'',
    manufacturer:rec.manufacturer||'', model:rec.model||'',
    serial:rec.type==='serialized'?(rec.serial||''):'', qty:qty||1};
  deploymentItems.push(di); dbSave('deploymentItems', di);
  _logDeployTransfer(rec, qty||1, fromLoc||'', fromLocId||'', dep);
  return di;
}

function approveDeployment(){
  if(!deployCart.length){ toast('Cart is empty','error'); return; }
  refreshDeployCart();
  if(!deployCart.length){ toast('Nothing left to deploy','error'); return; }
  const recipient=((document.getElementById('deploy-recipient')||{}).value||'').trim();
  const dest=((document.getElementById('deploy-dest')||{}).value||'').trim();
  const projId=((document.getElementById('deploy-proj')||{}).value||'');
  const notes=((document.getElementById('deploy-notes')||{}).value||'').trim();
  if(!recipient){ toast('Enter who is taking the shipment (recipient)','error'); return; }
  if(!dest){ toast('Enter a destination (pick a project or type one)','error'); return; }
  const units=deployCart.reduce((s,c)=>{ const it=_invById(c.inventoryId); return s+((it&&it.type==='serialized')?1:c.qty); },0);
  if(!confirm(`Approve & deploy ${units} unit(s) to “${dest}”?\n\nThis marks them Deployed and records the release.`)) return;

  const now=new Date();
  const dateStr=now.toLocaleDateString('en-US');
  const ts=now.toISOString();
  const depId=uid();
  const dep={id:depId, date:dateStr, timestamp:ts, status:'approved', recipient, destination:dest,
    destinationProjectId:projId||'', releasedBy:(window.APP_USER||''), notes};
  const depItems=[];

  for(const e of deployCart){
    const it=_invById(e.inventoryId); if(!it) continue;
    const fromLoc=it.location||'', fromLocId=it.locationId||'';
    if(it.type==='serialized' || e.qty>=(it.qty||0)){
      it.invStatus='Deployed'; it.status='Deployed'; it.location=''; it.locationId=''; it.lastUpdated=dateStr;
      dbSave('inventory', it);
      depItems.push({id:uid(), deploymentId:depId, inventoryId:it.id, sku:it.sku||'',
        manufacturer:it.manufacturer||'', model:it.model||'',
        serial:it.type==='serialized'?(it.serial||''):'', qty:it.type==='serialized'?1:(it.qty||1)});
      _logDeployTransfer(it, it.type==='serialized'?1:(it.qty||1), fromLoc, fromLocId, dep);
    } else {
      // partial bulk → split: decrement source, create a Deployed clone for the deployed qty
      const deployQty=e.qty;
      it.qty=(it.qty||0)-deployQty; it.lastUpdated=dateStr; dbSave('inventory', it);
      const clone={...it, id:uid(), qty:deployQty, invStatus:'Deployed', status:'Deployed', location:'', locationId:'', lastUpdated:dateStr};
      inventory.push(clone); dbSave('inventory', clone);
      depItems.push({id:uid(), deploymentId:depId, inventoryId:clone.id, sku:clone.sku||'',
        manufacturer:clone.manufacturer||'', model:clone.model||'', serial:'', qty:deployQty});
      _logDeployTransfer(clone, deployQty, fromLoc, fromLocId, dep);
    }
  }
  deployments.push(dep); dbSave('deployments', dep);
  depItems.forEach(di=>{ deploymentItems.push(di); dbSave('deploymentItems', di); });

  deployCart=[]; saveDeployCart();
  setDirty(true); updateInvStats(); renderInvTable();
  closeDeployCart();
  toast(`Deployed ${units} unit(s) — release recorded`,'success');
  if(confirm('Deployment recorded. Print the release manifest now?')) exportDeployManifest(depId);
}

// ── Deployments history / reprint ────────────────────────────────────────────
function openDeploymentsLog(){
  let ov=document.getElementById('deploy-log-overlay'); if(ov) ov.remove();
  ov=document.createElement('div');
  ov.id='deploy-log-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:600;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closeDeploymentsLog(); };
  const list=deployments.slice().sort((a,b)=>String(b.timestamp||b.date||'').localeCompare(String(a.timestamp||a.date||'')));
  const body=list.length?list.map(d=>{
    const n=deploymentItems.filter(di=>di.deploymentId===d.id).reduce((s,di)=>s+(di.qty||1),0);
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:7px 10px;font-size:12px;white-space:nowrap;">${escHtml(d.date||'')}</td>
      <td style="padding:7px 10px;font-size:12px;">${escHtml(d.recipient||'—')}</td>
      <td style="padding:7px 10px;font-size:12px;color:var(--text-dim);">${escHtml(d.destination||'—')}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:center;font-family:var(--font-mono);">${n}</td>
      <td style="padding:7px 10px;text-align:right;"><button class="btn btn-ghost" onclick="exportDeployManifest('${escHtml(d.id)}')" style="font-size:11px;padding:4px 8px;">🖨 Manifest</button></td>
    </tr>`;
  }).join(''):`<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px;">No deployments yet.</td></tr>`;
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:720px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);">
      <div style="font-size:17px;font-weight:700;">📋 Deployments</div>
      <button onclick="closeDeploymentsLog()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Date</th>
        <th style="padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Recipient</th>
        <th style="padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Destination</th>
        <th style="padding:7px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Units</th>
        <th></th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
  document.body.appendChild(ov);
}
function closeDeploymentsLog(){ const o=document.getElementById('deploy-log-overlay'); if(o) o.remove(); }

// ══ INVENTORY PICK LIST ══
// A printable pull-sheet of the checked inventory items (manufacturer, model, serial,
// location, project). Bulk lines support a partial pick quantity. Read-only — it changes
// no inventory status (unlike the deployment cart); it's just a list of what to go grab.
let invPickList = [];

// Resolve an item's project to its full Client · Location · Project breadcrumb.
// Two projects can share a name ("Unallocated", "Main"), so the printed sheet
// must group and sort on identity, not on the bare name — otherwise two
// different projects collapse into one band and their units interleave.
function _projRef(it){
  const p=projects.find(x=>x.id===(it&&(it.projectId||it.project)));
  if(!p){ const raw=(it&&it.project)||''; return {id:'', name:raw, ctx:'', full:raw}; }
  const client=(typeof projClientName==='function')?projClientName(p):'';
  const loc=(typeof projLocationName==='function')?projLocationName(p):'';
  return {
    id:p.id,
    name:p.name||'',
    ctx:[client,loc].filter(Boolean).join(' \u00b7 '),
    full:[client,loc,p.name].filter(Boolean).join(' \u00b7 '),
  };
}
function _projName(it){ return _projRef(it).name; }
// Order: project A–Z by full breadcrumb (so same-named projects separate and
// sort under their client), then manufacturer A–Z, then model. Unassigned last.
function _pickListCmp(a,b){
  const pa=(a.projSort||a.project||'￿').toLowerCase(), pb=(b.projSort||b.project||'￿').toLowerCase();
  return pa.localeCompare(pb)
    || (a.mfg||'').toLowerCase().localeCompare((b.mfg||'').toLowerCase())
    || (a.model||'').toLowerCase().localeCompare((b.model||'').toLowerCase());
}

function openInventoryPickList(){
  if(!invSelected.size){ toast('Select inventory items first','error'); return; }
  invPickList=[];
  for(const id of Array.from(invSelected)){
    const it=_invById(id); if(!it) continue;
    invPickList.push({inventoryId:id, qty:(it.type==='serialized'?1:Math.max(1,it.qty||1))});
  }
  if(!invPickList.length){ toast('No valid items selected','error'); return; }
  // Match the printed order: project A–Z, then manufacturer A–Z, then model.
  invPickList.sort((a,b)=>{
    const ia=_invById(a.inventoryId), ib=_invById(b.inventoryId);
    return _pickListCmp(
      {projSort:_projRef(ia).full, mfg:ia.manufacturer, model:ia.model},
      {projSort:_projRef(ib).full, mfg:ib.manufacturer, model:ib.model});
  });
  let ov=document.getElementById('inv-picklist-overlay'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='inv-picklist-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:600;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closeInventoryPickList(); };
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:840px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);">
      <div style="font-size:17px;font-weight:700;">📋 Pick List</div>
      <button onclick="closeInventoryPickList()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div style="padding:6px 12px;" id="inv-picklist-body"></div>
    <div style="display:flex;justify-content:space-between;gap:10px;padding:14px 20px;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--surface);">
      <div style="font-size:11px;color:var(--text-dim);align-self:center;">Lower the qty on a bulk line to pick a partial amount. Nothing here changes inventory status.</div>
      <button class="btn" onclick="exportInventoryPickList()" style="font-size:12px;background:rgba(79,142,247,0.12);color:var(--accent);border:1px solid rgba(79,142,247,0.4);">🖨 Print Pick List</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  renderInvPickListBody();
}
function closeInventoryPickList(){ const o=document.getElementById('inv-picklist-overlay'); if(o) o.remove(); }

function renderInvPickListBody(){
  const el=document.getElementById('inv-picklist-body'); if(!el) return;
  if(!invPickList.length){ el.innerHTML='<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:24px;">No items.</div>'; return; }
  const th='padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);';
  const rows=invPickList.map(e=>{
    const it=_invById(e.inventoryId); if(!it) return '';
    const isSer=it.type==='serialized';
    const qtyCell=isSer
      ? '<span style="font-family:var(--font-mono);font-size:12px;">1</span>'
      : `<input type="number" min="1" max="${Math.max(1,it.qty||1)}" value="${e.qty}" onchange="setPickListQty('${escHtml(it.id)}',this.value)" style="width:56px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);text-align:right;padding:2px 5px;outline:none;"> <span style="color:var(--text-dim);font-size:10px;">/ ${it.qty||1}</span>`;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:6px 8px;font-size:12px;">${escHtml(it.manufacturer||'—')}</td>
      <td style="padding:6px 8px;font-size:12px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(it.model||'')}">${escHtml(it.model||'—')}</td>
      <td style="padding:6px 8px;font-size:11px;font-family:var(--font-mono);">${isSer?(it.serial?escHtml(it.serial):'<span style="color:var(--warn)">no serial</span>'):'<span style="color:var(--text-dim)">bulk</span>'}</td>
      <td style="padding:6px 8px;font-size:11px;font-family:var(--font-mono);">${it.location?escHtml(it.location):'<span style="color:var(--text-dim)">—</span>'}</td>
      <td style="padding:6px 8px;font-size:11px;">${(pr=>pr.name
        ? escHtml(pr.name)+(pr.ctx?`<div style="font-size:10px;color:var(--text-dim);line-height:1.2;">${escHtml(pr.ctx)}</div>`:'')
        : '—')(_projRef(it))}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${qtyCell}</td>
      <td style="padding:6px 8px;text-align:right;"><button class="btn-del" onclick="removeFromPickList('${escHtml(it.id)}')" title="Remove">✕</button></td>
    </tr>`;
  }).join('');
  el.innerHTML=`<table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:var(--surface2);">
      <th style="${th}">Manufacturer</th><th style="${th}">Model</th><th style="${th}">Serial</th>
      <th style="${th}">Location</th><th style="${th}">Project</th>
      <th style="${th}text-align:right;">Qty</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function setPickListQty(id, val){
  const it=_invById(id), e=invPickList.find(x=>x.inventoryId===id);
  if(!it||!e) return;
  e.qty=Math.min(Math.max(1, parseInt(val)||1), Math.max(1, it.qty||1));  // clamp 1..on-hand
  renderInvPickListBody();
}
function removeFromPickList(id){
  invPickList=invPickList.filter(x=>x.inventoryId!==id);
  if(!invPickList.length){ closeInventoryPickList(); return; }
  renderInvPickListBody();
}

function exportInventoryPickList(){
  if(!invPickList.length){ toast('Nothing to print','error'); return; }
  const rows=[]; let totalUnits=0;
  for(const e of invPickList){
    const it=_invById(e.inventoryId); if(!it) continue;
    const isSer=it.type==='serialized';
    const qty=isSer?1:e.qty; totalUnits+=qty;
    const pr=_projRef(it);
    rows.push({mfg:it.manufacturer||'', model:it.model||'', serial:isSer?(it.serial||''):'', bulk:!isSer,
      location:it.location||'', qty,
      projId:pr.id, projName:pr.name, projCtx:pr.ctx, projSort:pr.full, project:pr.name});
  }
  // Group by project (A–Z), then manufacturer (A–Z), then model. Unassigned goes last.
  rows.sort((a,b)=>_pickListCmp(a,b));
  const today=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  let lastProj=null, i=0;
  const bodyRows=rows.map(r=>{
    // Break on project id, not name — two projects named "Unallocated" are two bands.
    const key=r.projId||('name:'+(r.projName||''));
    let header='';
    if(key!==lastProj){
      const label=r.projName
        ? (r.projCtx?`<span style="font-weight:400;color:#555;">${escHtml(r.projCtx)} \u00b7 </span>`:'')+`<span style="font-weight:700;">${escHtml(r.projName)}</span>`
        : '<span style="font-weight:700;">\u2014 No Project \u2014</span>';
      header=`<tr><td colspan="7" style="background:#eeeef2;font-size:12px;padding:8px 10px;border-top:2px solid #ccc;border-bottom:1px solid #ddd;color:#333;">${label}</td></tr>`;
      lastProj=key; i=0;
    }
    const bg=(i++%2===0)?'#fff':'#f9f9fb';
    return `${header}
    <tr style="background:${bg}">
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;text-align:center;width:26px;"><span style="display:inline-block;width:12px;height:12px;border:1.5px solid #888;border-radius:2px;"></span></td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;text-align:center;font-family:monospace;font-weight:700;">${r.qty}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;font-weight:600;">${escHtml(r.mfg||'—')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;">${escHtml(r.model||'—')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;font-family:monospace;font-size:11px;">${r.serial?escHtml(r.serial):(r.bulk?'<span style="color:#888">bulk</span>':'<span style="color:#c0392b">— no serial —</span>')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;font-family:monospace;font-weight:700;">${r.location?escHtml(r.location):'<span style="color:#c0392b">—</span>'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e8e8ee;color:#555;">${escHtml(r.projName||'—')}</td>
    </tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pick List</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#222;background:#fff;}
@media print{.no-print{display:none;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
</head><body>
<div style="max-width:840px;margin:0 auto;padding:44px 44px 60px;">
  <div style="background:#2a2a2a;padding:20px 26px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="color:#fff;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">AVProcure</div>
      <div style="color:#fff;font-size:26px;font-weight:700;letter-spacing:1px;">Pick List</div>
    </div>
    <div style="text-align:right;color:#fff;">
      <div style="color:#ccc;font-size:12px;">${escHtml(today)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px;">${totalUnits} unit${totalUnits!==1?'s':''}</div>
      <div style="color:#ccc;font-size:11px;">${rows.length} line${rows.length!==1?'s':''}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e8e8ee;">
    <thead><tr style="background:#2a2a2a;">
      <th style="padding:8px 10px;text-align:center;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:26px;">✓</th>
      <th style="padding:8px 10px;text-align:center;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:42px;">Qty</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:140px;">Manufacturer</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;">Model</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:150px;">Serial</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:90px;">Location</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#fff;font-weight:600;width:150px;">Project</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div style="margin-top:40px;padding-top:14px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
    <span>Pick List</span><span>${escHtml(today)}</span>
  </div>
  <div class="no-print" style="margin-top:26px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 28px;background:#2a2a2a;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
</div></body></html>`;
  const win=window.open('','_blank');
  if(!win){ toast('Pop-up blocked — allow pop-ups to print the pick list','error'); return; }
  win.document.write(html); win.document.close();
}
