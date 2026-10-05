// ═══════════════════════════════════════════════
// LOCATIONS PAGE
// ═══════════════════════════════════════════════

// Returns only leaf locations (deepest tier — no children) for use in dropdowns
// Optionally filter by type. Uses full code as display label.
function leafLocations(type=null){
  const parentIds=new Set(locations.map(l=>l.parentId).filter(Boolean));
  return locations.filter(l=>{
    if(l.tierIndex===0) return false;           // exclude warehouse root nodes
    if(parentIds.has(l.id)) return false;       // exclude non-leaf nodes
    if(type && l.type!==type) return false;
    return true;
  });
}

function leafLocationOptions(type=null, valueField='id', selectedVal=''){
  const leaves=leafLocations(type);
  return leaves.map(l=>{
    const val=valueField==='code'?l.code:l.id;
    const sel=selectedVal===val?' selected':'';
    return `<option value="${escHtml(val)}"${sel}>${escHtml(l.code)}</option>`;
  }).join('');
}

function leafLocationOptgroups(valueField='id', selectedVal=''){
  const parentIds=new Set(locations.map(l=>l.parentId).filter(Boolean));
  const leaves=locations.filter(l=>l.tierIndex>0&&!parentIds.has(l.id));
  const stagingLeaves=leaves.filter(l=>l.type==='staging').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const generalLeaves=leaves.filter(l=>l.type==='general').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const makeOpts=(arr)=>arr.map(l=>{
    const val=valueField==='code'?l.code:l.id;
    const sel=selectedVal===val?' selected':'';
    return `<option value="${escHtml(val)}"${sel}>${escHtml(l.code)}</option>`;
  }).join('');
  return (stagingLeaves.length?`<optgroup label="── Staging ──">${makeOpts(stagingLeaves)}</optgroup>`:'')
    +(generalLeaves.length?`<optgroup label="── General Stock ──">${makeOpts(generalLeaves)}</optgroup>`:'');
}

// ── Stat chip updater ──
function updateLocStats(){
  const wEl=document.getElementById('loc-chip-warehouses');
  const lEl=document.getElementById('loc-chip-locations');
  const sEl=document.getElementById('loc-chip-staging');
  if(wEl) wEl.innerHTML=`${warehouses.length} <span>warehouses</span>`;
  if(lEl) lEl.innerHTML=`${locations.filter(l=>l.tierIndex>0).length} <span>locations</span>`;
  if(sEl) sEl.innerHTML=`${locations.filter(l=>l.type==='staging').length} <span>staging</span>`;
}

// ── Main page renderer — shows warehouse list ──
function renderLocPage(){
  updateLocStats();
  const body=document.getElementById('loc-body'); if(!body) return;
  if(warehouses.length===0){
    body.innerHTML=`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:60px 20px;text-align:center;">
        <div style="font-size:40px;opacity:0.3;">⬡</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-muted);">No warehouses configured yet</div>
        <div style="font-size:13px;color:var(--text-dim);max-width:400px;line-height:1.7;">
          Use <strong style="color:var(--accent)">Auto Setup New Warehouse</strong> in the toolbar to run the setup wizard, or add one manually.
        </div>
      </div>`;
    return;
  }
  body.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Your Warehouses</div>
      ${warehouses.map(w=>{
        const childCount=locations.filter(l=>l.warehouseId===w.id&&l.tierIndex>0).length;
        const stagingCount=locations.filter(l=>l.warehouseId===w.id&&l.type==='staging').length;
        const addr=[w.notes].filter(Boolean).join('');
        return `
          <div onclick="locShowWarehouseDetail('${w.id}')"
            style="display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color 0.15s,background 0.15s;"
            onmouseover="this.style.borderColor='var(--border-bright)';this.style.background='var(--surface2)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">
            <span style="font-size:28px;opacity:0.7;">🏭</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:700;">${escHtml(w.name)}</div>
              ${addr?`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(addr)}</div>`:''}
            </div>
            <div style="display:flex;gap:16px;align-items:center;flex-shrink:0;">
              <div style="text-align:right;">
                <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent);">${childCount}</div>
                <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">locations</div>
              </div>
              ${stagingCount>0?`
              <div style="text-align:right;">
                <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent3);">${stagingCount}</div>
                <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">staging</div>
              </div>`:''}
              <span style="color:var(--text-dim);font-size:14px;">▶</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── Warehouse Detail view ──
function locShowWarehouseDetail(whId){
  const wh=warehouses.find(w=>w.id===whId); if(!wh) return;
  const body=document.getElementById('loc-body'); if(!body) return;
  updateLocStats();

  // Determine deepest tier in this warehouse so we never show + ADD on leaf nodes
  const whLocs=locations.filter(l=>l.warehouseId===whId);
  const maxTierIndex=whLocs.reduce((m,l)=>Math.max(m,l.tierIndex),0);

  // Next tier name after a given node (for the Add modal label)
  function nextTierName(loc){
    const nextTi=loc.tierIndex+1;
    const sample=whLocs.find(l=>l.tierIndex===nextTi);
    return sample?sample.tier:'location';
  }

  // Build the nested tree HTML
  function nodeHtml(loc, depth){
    const children=locations.filter(l=>l.parentId===loc.id).sort((a,b)=>a.name.localeCompare(b.name));
    const hasChildren=children.length>0;
    const isStaging=loc.type==='staging';
    const isQuarantine=loc.type==='quarantine';
    const typeColor=isStaging?'var(--accent3)':isQuarantine?'var(--accent4)':'var(--text-muted)';
    const typeBadge=isStaging?'<span style="font-size:9px;padding:1px 6px;background:rgba(79,247,160,0.1);color:var(--accent3);border:1px solid rgba(79,247,160,0.2);border-radius:3px;margin-left:6px;">STAGING</span>':isQuarantine?'<span style="font-size:9px;padding:1px 6px;background:rgba(247,79,126,0.1);color:var(--accent4);border:1px solid rgba(247,79,126,0.2);border-radius:3px;margin-left:6px;">QUARANTINE</span>':'';
    const nodeId=`loc-node-${loc.id}`;
    const childId=`loc-children-${loc.id}`;
    const indent=depth*20;
    const canAdd=loc.tierIndex < maxTierIndex;
    return `
      <div style="margin-left:${indent}px;">
        <div id="${nodeId}" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;
          border:1px solid transparent;transition:background 0.1s,border-color 0.1s;"
          onmouseover="this.style.background='var(--surface2)';this.style.borderColor='var(--border)';this.querySelector('.loc-actions').style.opacity='1'"
          onmouseout="this.style.background='';this.style.borderColor='transparent';this.querySelector('.loc-actions').style.opacity='0'">
          ${hasChildren
            ? `<span onclick="locToggleNode('${loc.id}')" id="caret-${loc.id}"
                style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;
                border-radius:3px;background:var(--surface3);color:var(--text-muted);font-size:9px;
                cursor:pointer;flex-shrink:0;transition:transform 0.15s;">▶</span>`
            : `<span style="display:inline-block;width:16px;flex-shrink:0;"></span>`}
          <span style="font-size:13px;font-weight:${depth===0?'600':'400'};color:${typeColor};">${escHtml(loc.name)}</span>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);">${escHtml(loc.code)}</span>
          ${typeBadge}
          <div class="loc-actions" style="display:flex;gap:3px;opacity:0;transition:opacity 0.1s;margin-left:8px;">
            ${canAdd?`<button onclick="event.stopPropagation();locAddChild('${loc.id}','${whId}')"
              style="font-size:10px;padding:2px 6px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:var(--accent);cursor:pointer;font-family:var(--font-ui);">+ ADD</button>`:''}
            <button onclick="event.stopPropagation();locEditNode('${loc.id}')"
              style="font-size:10px;padding:2px 6px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:var(--text-muted);cursor:pointer;font-family:var(--font-ui);">✎ EDIT</button>
            <button onclick="event.stopPropagation();locDeleteNode('${loc.id}')"
              style="font-size:10px;padding:2px 6px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:var(--accent4);cursor:pointer;font-family:var(--font-ui);">🗑</button>
          </div>
        </div>
        ${hasChildren?`<div id="${childId}" style="display:none;">${children.map(c=>nodeHtml(c,depth+1)).join('')}</div>`:''}
      </div>`;
  }

  const tier1=locations.filter(l=>l.warehouseId===whId&&l.tierIndex===1).sort((a,b)=>a.name.localeCompare(b.name));
  const tier1Name=tier1.length>0?tier1[0].tier:(_wiz?_wiz.tiers[0]?.name||'Location':'Location');

  body.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:0;height:100%;">
      <!-- Back + Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        <button class="btn btn-ghost" onclick="renderLocPage()" style="font-size:12px;">← Warehouses</button>
        <div style="flex:1;">
          <div style="font-size:17px;font-weight:700;">${escHtml(wh.name)}</div>
          ${wh.notes?`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${escHtml(wh.notes)}</div>`:''}
        </div>
        <button class="btn btn-ghost" onclick="locEditWhAddress('${whId}')" style="font-size:12px;">✎ Edit Address</button>
        <button class="btn btn-ghost" onclick="locAddTopTier('${whId}')" style="font-size:12px;color:var(--accent);border-color:rgba(79,142,247,0.35);">+ Add ${escHtml(tier1Name)}</button>
        <button class="btn btn-ghost" onclick="locCollapseAll('${whId}')" style="font-size:12px;">Collapse All</button>
        <button class="btn btn-ghost" onclick="locExpandAll('${whId}')" style="font-size:12px;">Expand All</button>
      </div>

      <!-- Main area: tree + activity -->
      <div style="display:flex;gap:20px;flex:1;min-height:0;overflow:hidden;">

        <!-- Tree -->
        <div style="flex:1;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;"
             id="loc-tree-${whId}">
          <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">
            Locations — ${escHtml(wh.name)}
          </div>
          ${tier1.length===0
            ? `<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:13px;">No locations yet.<br>Use <strong style="color:var(--accent)">+ Add ${escHtml(tier1Name)}</strong> in the header to get started.</div>`
            : tier1.map(l=>nodeHtml(l,0)).join('')}
        </div>

        <!-- Activity panel -->
        <div style="width:240px;flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:0;">
          <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Activity</div>
          ${(()=>{
            // Transfers involving this warehouse's locations
            const whLocIds=new Set(locations.filter(l=>l.warehouseId===whId).map(l=>l.id));
            const whLocCodes=new Set(locations.filter(l=>l.warehouseId===whId).map(l=>l.code));
            const relevant=transfers.filter(t=>
              whLocIds.has(t.fromLocationId)||whLocIds.has(t.toLocationId)||
              whLocCodes.has(t.fromLocation)||whLocCodes.has(t.toLocation)
            ).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,30);
            if(!relevant.length) return `<div style="font-size:12px;color:var(--text-dim);text-align:center;padding-top:10px;">No activity recorded yet.</div>`;
            return relevant.map(t=>{
              const d=new Date(t.timestamp);
              const dateStr=isNaN(d)?t.timestamp:(d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}));
              const isIn=whLocIds.has(t.toLocationId)||whLocCodes.has(t.toLocation);
              const arrow=isIn?'↓':'↑';
              const arrowColor=isIn?'var(--accent3)':'var(--accent4)';
              const label=`${t.manufacturer} ${t.model}`.trim()||(t.sku||'Item');
              const sub=isIn
                ? `from ${t.fromProject||t.fromLocation||'?'}`
                : `to ${t.toProject||t.toLocation||'?'}`;
              return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:14px;color:${arrowColor};flex-shrink:0;">${arrow}</span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(label)}</div>
                    <div style="font-size:10px;color:var(--text-dim);">×${t.qty} ${escHtml(sub)}</div>
                    <div style="font-size:9px;color:var(--text-dim);margin-top:1px;">${escHtml(dateStr)}</div>
                  </div>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>

      </div>
    </div>`;

}

function locToggleNode(locId){
  const children=document.getElementById(`loc-children-${locId}`);
  const caret=document.getElementById(`caret-${locId}`);
  if(!children) return;
  const open=children.style.display==='none'||children.style.display==='';
  children.style.display=open?'block':'none';
  if(caret) caret.style.transform=open?'rotate(90deg)':'rotate(0deg)';
}

function locExpandAll(whId){
  const tree=document.getElementById('loc-tree-'+whId); if(!tree) return;
  tree.querySelectorAll('[id^="loc-children-"]').forEach(el=>el.style.display='block');
  tree.querySelectorAll('[id^="caret-"]').forEach(el=>el.style.transform='rotate(90deg)');
}

function locCollapseAll(whId){
  const tree=document.getElementById('loc-tree-'+whId); if(!tree) return;
  tree.querySelectorAll('[id^="loc-children-"]').forEach(el=>el.style.display='none');
  tree.querySelectorAll('[id^="caret-"]').forEach(el=>el.style.transform='rotate(0deg)');
}

// Capture which nodes are currently expanded, restore after re-render
function locCaptureExpanded(whId){
  const tree=document.getElementById('loc-tree-'+whId); if(!tree) return new Set();
  const open=new Set();
  tree.querySelectorAll('[id^="loc-children-"]').forEach(el=>{
    if(el.style.display==='block') open.add(el.id.replace('loc-children-',''));
  });
  return open;
}

function locRestoreExpanded(whId, open){
  if(!open||!open.size) return;
  open.forEach(locId=>{
    const children=document.getElementById(`loc-children-${locId}`);
    const caret=document.getElementById(`caret-${locId}`);
    if(children){ children.style.display='block'; }
    if(caret){ caret.style.transform='rotate(90deg)'; }
  });
}

function locAddTopTier(whId){
  const wh=warehouses.find(w=>w.id===whId); if(!wh) return;
  const whLocs=locations.filter(l=>l.warehouseId===whId);

  // Determine tier-1 name from existing locations or fall back
  const sample=whLocs.find(l=>l.tierIndex===1);
  const tierName=sample?sample.tier:'Location';

  // Suggest next sequential name
  const existing=whLocs.filter(l=>l.tierIndex===1).sort((a,b)=>a.name.localeCompare(b.name));
  const last=existing[existing.length-1];
  let suggested='';
  if(last){
    const lastPart=last.name.split(' ').pop();
    const isAlpha=/^[A-Z]$/.test(lastPart);
    if(isAlpha) suggested=`${tierName} ${String.fromCharCode(lastPart.charCodeAt(0)+1)}`;
    else { const num=parseInt(lastPart); if(!isNaN(num)) suggested=`${tierName} ${String(num+1).padStart(lastPart.length,'0')}`; }
  }
  if(!suggested) suggested=`${tierName} A`;

  const name=prompt(`Add new ${tierName} to "${wh.name}":\nName:`, suggested);
  if(!name||!name.trim()) return;

  const namePart=name.trim().split(' ').pop();
  const newLoc={
    id:uid(), parentId:whId, warehouseId:whId,
    name:name.trim(), code:namePart,
    tier:tierName, tierIndex:1,
    type:'general', notes:'',
  };
  locations.push(newLoc);
  dbSave('locations', newLoc);
  setDirty(true);
  updateLocStats();
  const open=locCaptureExpanded(whId);
  locShowWarehouseDetail(whId);
  locRestoreExpanded(whId, open);
}

function locAddChild(parentId, whId){
  const parent=locations.find(l=>l.id===parentId); if(!parent) return;
  const whLocs=locations.filter(l=>l.warehouseId===parent.warehouseId);

  // Determine child tier name and index
  const childTierIndex=parent.tierIndex+1;
  const sample=whLocs.find(l=>l.tierIndex===childTierIndex);
  const childTierName=sample?sample.tier:'location';

  // Suggest next sequential name based on existing siblings
  const siblings=locations.filter(l=>l.parentId===parentId);
  const lastSibling=siblings.sort((a,b)=>a.name.localeCompare(b.name)).pop();
  let suggestedName='';
  if(lastSibling){
    const lastPart=lastSibling.name.split(' ').pop();
    const isAlpha=/^[A-Z]$/.test(lastPart);
    if(isAlpha) suggestedName=`${childTierName} ${String.fromCharCode(lastPart.charCodeAt(0)+1)}`;
    else {
      const num=parseInt(lastPart);
      if(!isNaN(num)) suggestedName=`${childTierName} ${String(num+1).padStart(lastPart.length,'0')}`;
    }
  }
  if(!suggestedName) suggestedName=`${childTierName} 01`;

  // Show inline prompt modal
  const name=prompt(`Add ${childTierName} under "${parent.name}":\nName:`, suggestedName);
  if(!name||!name.trim()) return;

  // Determine type — inherit staging from parent
  const inheritedType=parent.type==='staging'?'staging':'general';

  // Build location code from parent code + name suffix
  const namePart=name.trim().split(' ').pop();
  const delimiter='-';
  const newCode=parent.code?`${parent.code}${delimiter}${namePart}`:namePart;

  const open=locCaptureExpanded(parent.warehouseId);
  // Ensure parent is in open set so new child is visible
  open.add(parentId);

  const newLoc={
    id:uid(),
    parentId,
    warehouseId:parent.warehouseId,
    name:name.trim(),
    code:newCode,
    tier:childTierName,
    tierIndex:childTierIndex,
    type:inheritedType,
    notes:'',
  };
  locations.push(newLoc);
  dbSave('locations', newLoc);
  setDirty(true);
  updateLocStats();
  locShowWarehouseDetail(parent.warehouseId);
  locRestoreExpanded(parent.warehouseId, open);
}

function locEditNode(locId){
  const loc=locations.find(l=>l.id===locId); if(!loc) return;
  const wh=warehouses.find(w=>w.id===loc.warehouseId); if(!wh) return;
  const open=locCaptureExpanded(wh.id);
  const newName=prompt(`Rename "${loc.name}":`, loc.name);
  if(!newName||newName.trim()===loc.name) return;
  loc.name=newName.trim();
  dbSave('locations', loc);
  setDirty(true); updateLocStats();
  locShowWarehouseDetail(wh.id);
  locRestoreExpanded(wh.id, open);
}

function locDeleteNode(locId){
  const loc=locations.find(l=>l.id===locId); if(!loc) return;
  const wh=warehouses.find(w=>w.id===loc.warehouseId); if(!wh) return;
  const open=locCaptureExpanded(wh.id);
  const children=locations.filter(l=>l.parentId===locId);
  const invUsed=inventory.filter(i=>i.location===loc.code||i.location===loc.id);
  let msg=`Delete "${loc.name}"?`;
  if(children.length) msg+=`\n\nWarning: this will also delete ${children.length} child location(s).`;
  if(invUsed.length) msg+=`\n\nWarning: ${invUsed.length} inventory record(s) reference this location.`;
  if(!confirm(msg)) return;
  const toRemove=new Set();
  function collect(id){ toRemove.add(id); locations.filter(l=>l.parentId===id).forEach(c=>collect(c.id)); }
  collect(locId);
  const whId=loc.warehouseId;
  locations=locations.filter(l=>!toRemove.has(l.id));
  warehouses=warehouses.filter(w=>!toRemove.has(w.id));
  dbDeleteMany('locations', [...toRemove]);
  setDirty(true); updateLocStats();
  if(toRemove.has(whId)){ renderLocPage(); return; }
  locShowWarehouseDetail(whId);
  // Restore expanded state, minus any nodes that were just deleted
  const pruned=new Set([...open].filter(id=>!toRemove.has(id)));
  locRestoreExpanded(whId, pruned);
}

// ── Toolbar button handlers ──
function locShowSetup(){ openWarehouseWizard(); }
function locShowAddManual(){ toast('Manual warehouse add — coming soon','info'); }

// ══ WAREHOUSE SETUP WIZARD ══════════════════════

let _wiz = null;

function openWarehouseWizard(){
  showPage('loc');
  _wiz = {
    whName:'', whAddress:'', whCity:'', whState:'', whZip:'', whContact:'', whPhone:'',
    tiers: [],
    delimiter: '-',
    stagingNodes: new Set(),
    step: 'info',
  };
  _wizRender();
}

function _wizRender(){
  const body=document.getElementById('loc-body'); if(!body) return;
  const steps=['Info','Tiers',..._wiz.tiers.map(t=>t.name||'Tier'),'Review'];
  const stepIdx=_wiz.step==='info'?0:_wiz.step==='tiers'?1:_wiz.step==='review'?steps.length-1:2+parseInt(_wiz.step.split('-')[1]);
  const crumbs=steps.map((s,i)=>`
    <span style="font-size:11px;font-weight:${i===stepIdx?'700':'400'};
      color:${i===stepIdx?'var(--text)':'var(--text-dim)'};
      background:${i===stepIdx?'var(--surface3)':'transparent'};
      padding:3px 9px;border-radius:4px;white-space:nowrap;">${i+1}. ${s.toUpperCase()}</span>
    ${i<steps.length-1?'<span style="color:var(--text-dim);font-size:10px;padding:0 2px;">›</span>':''}`
  ).join('');

  let content='';
  if(_wiz.step==='info')        content=_wizInfoHtml();
  else if(_wiz.step==='tiers')  content=_wizTiersHtml();
  else if(_wiz.step==='review') content=_wizReviewHtml();
  else content=_wizTierStepHtml(parseInt(_wiz.step.split('-')[1]));

  body.innerHTML=`
    <div style="display:flex;flex-direction:column;height:100%;">
      <!-- Back to warehouses -->
      <div style="margin-bottom:14px;">
        <button class="btn btn-ghost" onclick="_wizCancel()" style="font-size:12px;">← Back to Warehouses</button>
      </div>
      <!-- Breadcrumb -->
      <div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        ${crumbs}
      </div>
      <!-- Step content + preview -->
      <div style="display:flex;gap:20px;flex:1;min-height:0;overflow:hidden;">
        <div style="flex:1;overflow-y:auto;">${content}</div>
        <div id="wiz-preview" style="width:220px;flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;overflow-y:auto;">
          ${_wizPreviewHtml()}
        </div>
      </div>
      <!-- Nav -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
        <button class="btn btn-ghost" onclick="_wizBack()" style="font-size:13px;">${_wiz.step==='info'?'← Cancel':'← Previous'}</button>
        <button class="btn" id="wiz-next-btn" onclick="_wizNext()"
          style="background:rgba(79,142,247,0.15);color:var(--accent);border:1px solid rgba(79,142,247,0.35);font-size:13px;padding:8px 22px;">
          ${_wiz.step==='review'?'✓ Finish':'Next →'}
        </button>
      </div>
    </div>`;
  _wizValidate();
}

function _wizInfoHtml(){
  return `
    <div style="display:flex;flex-direction:column;gap:14px;max-width:480px;">
      <div style="font-size:14px;font-weight:700;">Warehouse Details</div>
      <div style="font-size:12px;color:var(--text-muted);">Enter basic info for your new warehouse location.</div>
      <div>
        <label class="fl">Warehouse Name <span style="color:var(--accent4)">*</span></label>
        <input class="plain-input" placeholder="e.g. Main Warehouse" value="${_wiz.whName}"
          oninput="_wiz.whName=this.value.trim();_wizValidate();_wizUpdatePreview()">
      </div>
      <div>
        <label class="fl">Street Address</label>
        <input class="plain-input" placeholder="123 Main St" value="${_wiz.whAddress}"
          oninput="_wiz.whAddress=this.value;_wizUpdatePreview()">
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:2;"><label class="fl">City</label>
          <input class="plain-input" placeholder="City" value="${_wiz.whCity}" oninput="_wiz.whCity=this.value;_wizUpdatePreview()"></div>
        <div style="flex:1;"><label class="fl">State</label>
          <input class="plain-input" placeholder="CA" value="${_wiz.whState}" oninput="_wiz.whState=this.value;_wizUpdatePreview()"></div>
        <div style="flex:1;"><label class="fl">ZIP</label>
          <input class="plain-input" placeholder="90210" value="${_wiz.whZip}" oninput="_wiz.whZip=this.value;_wizUpdatePreview()"></div>
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:2;"><label class="fl">Contact Person</label>
          <input class="plain-input" placeholder="Name" value="${_wiz.whContact}" oninput="_wiz.whContact=this.value;_wizUpdatePreview()"></div>
        <div style="flex:2;"><label class="fl">Phone</label>
          <input class="plain-input" placeholder="(555) 000-0000" value="${_wiz.whPhone}" oninput="_wiz.whPhone=this.value;_wizUpdatePreview()"></div>
      </div>
    </div>`;
}

function _wizTiersHtml(){
  if(_wiz.tiers.length===0) _wiz.tiers.push({name:'',qty:1,start:'01'});
  return `
    <div style="display:flex;flex-direction:column;gap:16px;max-width:480px;">
      <div style="font-size:14px;font-weight:700;">Tier Setup</div>
      <div style="font-size:12px;color:var(--text-muted);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 13px;line-height:1.7;">
        Define the naming for each tier of your warehouse layout. Tiers nest into each other and allow you to organise your warehouse down to the exact shelf.
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${_wiz.tiers.map((t,i)=>`
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:11px;color:var(--text-dim);width:56px;flex-shrink:0;">Tier ${i+1}${i>0?' (opt.)':''}</div>
            <input class="plain-input" style="flex:1;" placeholder="${['Aisle','Rack','Shelf','Bin'][i]||'Level'}"
              value="${t.name}" oninput="_wiz.tiers[${i}].name=this.value.trim();_wizValidate();_wizUpdatePreview();">
            ${i>0?`<button onclick="_wizRemoveTier(${i})" style="background:none;border:none;color:var(--accent4);cursor:pointer;font-size:15px;padding:2px 6px;">✕</button>`:'<div style="width:24px;"></div>'}
          </div>`).join('')}
      </div>
      ${_wiz.tiers.length<4?`<button class="btn btn-ghost" onclick="_wizAddTier()" style="align-self:flex-start;font-size:12px;">＋ Add Tier</button>`:''}
      <div>
        <label class="fl">Location Code Delimiter</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          ${['>', '-', '/', '.'].map(d=>`
            <button onclick="_wiz.delimiter='${d}';_wizUpdatePreview();document.querySelectorAll('.delim-btn').forEach(b=>{b.style.color=b.dataset.d==='${d}'?'var(--accent)':'';b.style.background=b.dataset.d==='${d}'?'var(--accent-glow)':'var(--surface2)';b.style.borderColor=b.dataset.d==='${d}'?'rgba(79,142,247,0.4)':'var(--border)';})"
              class="btn btn-ghost delim-btn" data-d="${d}"
              style="font-family:var(--font-mono);font-size:14px;width:38px;${_wiz.delimiter===d?'color:var(--accent);background:var(--accent-glow);border-color:rgba(79,142,247,0.4);':''}">
              ${d}
            </button>`).join('')}
        </div>
      </div>
    </div>`;
}

function _wizTierStepHtml(ti){
  const t=_wiz.tiers[ti];
  const parentName=ti===0?'warehouse':(_wiz.tiers[ti-1].name||`Tier ${ti}`);
  const tierName=t.name||`Tier ${ti+1}`;
  const qty=Math.max(1,parseInt(t.qty)||1);
  const nodes=_genNodes(t.start||'01',qty);
  return `
    <div style="display:flex;flex-direction:column;gap:16px;max-width:480px;">
      <div style="font-size:14px;font-weight:700;">${tierName} Configuration</div>
      <div>
        <label class="fl">How many ${tierName}s does each ${parentName} have? <span style="color:var(--accent4)">*</span></label>
        <input class="plain-input" type="number" min="1" max="999" style="width:120px;margin-top:6px;"
          value="${t.qty||1}" oninput="_wiz.tiers[${ti}].qty=Math.max(1,parseInt(this.value)||1);_wizValidate();_wizUpdatePreview();">
      </div>
      <div>
        <label class="fl">Starting name / number</label>
        <input class="plain-input" style="width:120px;margin-top:6px;" placeholder="01"
          value="${t.start||'01'}" oninput="_wiz.tiers[${ti}].start=this.value.trim()||'01';_wizUpdatePreview();">
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.6;">
          Use letters (A, B, C…) or zero-padded numbers (01, 001…).<br>
          ${qty>1?`Labels: <strong style="color:var(--text-muted)">${nodes[0]}</strong> → <strong style="color:var(--text-muted)">${nodes[nodes.length-1]}</strong>`:''}
        </div>
      </div>
    </div>`;
}

function _wizReviewHtml(){
  const tree=_buildWizTree();
  const totalLocs=_countWizNodes(tree);
  const tier1Nodes=tree.children||[];
  const codes=_previewCodes();
  return `
    <div style="display:flex;flex-direction:column;gap:16px;max-width:480px;">
      <div style="font-size:14px;font-weight:700;">Review & Staging</div>
      <div style="font-size:12px;color:var(--text-muted);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 13px;line-height:1.7;">
        Review your storage areas before finishing. You can adjust individual locations after setup completes.
      </div>
      ${tier1Nodes.length>0?`
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Mark Staging Areas</div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;line-height:1.6;">
            Staging locations hold project-allocated items after receiving, before installation. Check any ${_wiz.tiers[0]?.name||'areas'} that serve as staging.
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${tier1Nodes.map((n,i)=>`
              <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;">
                <input type="checkbox" ${_wiz.stagingNodes.has(i)?'checked':''}
                  onchange="if(this.checked)_wiz.stagingNodes.add(${i});else _wiz.stagingNodes.delete(${i});_wizUpdatePreview();"
                  style="width:14px;height:14px;accent-color:var(--accent3);">
                <span style="font-size:13px;font-family:var(--font-mono);">${n.name}</span>
                ${_wiz.stagingNodes.has(i)?`<span style="font-size:10px;padding:2px 7px;background:rgba(79,247,160,0.1);color:var(--accent3);border:1px solid rgba(79,247,160,0.25);border-radius:4px;margin-left:auto;">STAGING</span>`:''}
              </label>`).join('')}
          </div>
        </div>`:''}
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Location Codes</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${codes.slice(0,4).map(c=>`<span style="font-family:var(--font-mono);font-size:11px;padding:3px 9px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--accent);">${c}</span>`).join('')}
          ${codes.length>4?`<span style="font-size:11px;color:var(--text-dim);padding:3px 6px;">+${codes.length-4} more</span>`:''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);padding:10px 14px;background:rgba(79,142,247,0.06);border:1px solid rgba(79,142,247,0.2);border-radius:6px;">
        Finishing will create <strong style="color:var(--text)">${totalLocs} location records</strong> across <strong style="color:var(--text)">${tier1Nodes.length} ${_wiz.tiers[0]?.name||'top-level location'}s</strong>.
      </div>
    </div>`;
}

function _wizPreviewHtml(){
  const tree=_buildWizTree();
  if(!tree.name&&!(tree.children||[]).length) return `<div style="font-size:11px;color:var(--text-dim);text-align:center;padding-top:16px;">Preview builds as you go.</div>`;
  function node(n,d){
    const isStaging=n.staging;
    return `<div style="padding:2px 0 2px ${d*12}px;">
      <div style="font-size:11px;padding:3px 7px;background:var(--surface2);border-radius:4px;
        color:${isStaging?'var(--accent3)':'var(--text-muted)'};
        border:1px solid ${isStaging?'rgba(79,247,160,0.2)':'transparent'};">
        ${escHtml(n.name)}${isStaging?' <span style="font-size:9px;opacity:0.7">✦</span>':''}
      </div></div>
      ${(n.children||[]).map(c=>node(c,d+1)).join('')}`;
  }
  return `<div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Preview</div>`+node(tree,0);
}

function _wizUpdatePreview(){
  const el=document.getElementById('wiz-preview');
  if(el) el.innerHTML=_wizPreviewHtml();
  if(_wiz.step==='review') _wizRender();
}

function _genNodes(start,qty){
  const nodes=[];
  if(/^[a-zA-Z]+$/.test(start)){
    let code=start.toUpperCase().charCodeAt(0);
    for(let i=0;i<qty;i++) nodes.push(String.fromCharCode(code+i));
  } else {
    const pad=start.length, base=parseInt(start)||1;
    for(let i=0;i<qty;i++) nodes.push(String(base+i).padStart(pad,'0'));
  }
  return nodes;
}

function _buildWizTree(){
  const root={name:_wiz.whName||'New Warehouse',children:[],staging:false};
  if(!_wiz.tiers.length||!_wiz.tiers[0].name) return root;
  function build(parent,ti){
    if(ti>=_wiz.tiers.length) return;
    const t=_wiz.tiers[ti];
    if(!t.name) return;
    const nodes=_genNodes(t.start||'01',Math.max(1,parseInt(t.qty)||1));
    nodes.forEach((n,ni)=>{
      const child={name:`${t.name} ${n}`,children:[],staging:ti===0&&_wiz.stagingNodes.has(ni)};
      parent.children.push(child);
      build(child,ti+1);
    });
  }
  build(root,0);
  return root;
}

function _countWizNodes(node){
  return (node.children||[]).reduce((sum,c)=>sum+1+_countWizNodes(c),0);
}

function _previewCodes(){
  const codes=[], delim=_wiz.delimiter;
  function walk(node,path){
    const seg=node.name.split(' ').pop();
    const np=path?`${path}${delim}${seg}`:seg;
    if(!(node.children||[]).length){codes.push(np);return;}
    node.children.forEach(c=>walk(c,np));
  }
  (_buildWizTree().children||[]).forEach(c=>walk(c,''));
  return codes;
}

function _wizAddTier(){
  if(_wiz.tiers.length>=4) return;
  _wiz.tiers.push({name:'',qty:1,start:'01'});
  _wizRender();
}
function _wizRemoveTier(i){
  _wiz.tiers.splice(i,1);
  _wizRender();
}

function _wizValidate(){
  const btn=document.getElementById('wiz-next-btn'); if(!btn) return;
  let ok=true;
  if(_wiz.step==='info') ok=!!_wiz.whName;
  else if(_wiz.step==='tiers') ok=_wiz.tiers.length>0&&_wiz.tiers.every(t=>t.name);
  else if(_wiz.step==='review') ok=true;
  else ok=_wiz.tiers[parseInt(_wiz.step.split('-')[1])]?.qty>0;
  btn.disabled=!ok;
  btn.style.opacity=ok?'1':'0.4';
  btn.style.cursor=ok?'pointer':'not-allowed';
}

function _wizNext(){
  if(_wiz.step==='info'){ if(!_wiz.tiers.length) _wiz.tiers.push({name:'',qty:1,start:'01'}); _wiz.step='tiers'; }
  else if(_wiz.step==='tiers') _wiz.step='tier-0';
  else if(_wiz.step==='review'){ _wizFinish(); return; }
  else {
    const ti=parseInt(_wiz.step.split('-')[1]);
    _wiz.step=ti<_wiz.tiers.length-1?`tier-${ti+1}`:'review';
  }
  _wizRender();
}

function _wizBack(){
  if(_wiz.step==='info'){ _wizCancel(); return; }
  if(_wiz.step==='tiers') _wiz.step='info';
  else if(_wiz.step==='review') _wiz.step=`tier-${_wiz.tiers.length-1}`;
  else { const ti=parseInt(_wiz.step.split('-')[1]); _wiz.step=ti===0?'tiers':`tier-${ti-1}`; }
  _wizRender();
}

function _wizCancel(){
  _wiz=null;
  showPage('loc');
  renderLocPage();
}

function _wizFinish(){
  const whId=uid();
  const newLocs=[{
    id:whId, parentId:'', warehouseId:whId,
    name:_wiz.whName, code:_wiz.whName, tier:'warehouse', tierIndex:0, type:'warehouse',
    notes:[_wiz.whAddress,_wiz.whCity,_wiz.whState,_wiz.whZip,_wiz.whContact,_wiz.whPhone].filter(Boolean).join(', '),
    street:_wiz.whAddress||'', city:_wiz.whCity||'', state:_wiz.whState||'', zip:_wiz.whZip||'', phone:_wiz.whPhone||'',
  }];
  function generate(parentId,parentCode,ti,inheritStaging){
    if(ti>=_wiz.tiers.length) return;
    const t=_wiz.tiers[ti];
    const nodes=_genNodes(t.start||'01',Math.max(1,parseInt(t.qty)||1));
    nodes.forEach((n,ni)=>{
      const id=uid();
      const code=parentCode?`${parentCode}${_wiz.delimiter}${n}`:n;
      const isStaging=inheritStaging||(ti===0&&_wiz.stagingNodes.has(ni));
      newLocs.push({
        id, parentId, warehouseId:whId,
        name:`${t.name} ${n}`, code, tier:t.name, tierIndex:ti+1,
        type:isStaging?'staging':'general',
        notes:'',
      });
      generate(id,code,ti+1,isStaging);
    });
  }
  generate(whId,'',0,false);
  locations.push(...newLocs);
  warehouses.push(newLocs[0]);
  dbSaveMany('locations', newLocs);
  setDirty(true);
  const whName=newLocs[0].name;
  const locCount=newLocs.length-1;
  _wiz=null;
  updateLocStats();
  showPage('loc');
  renderLocPage();
  toast(`Warehouse "${whName}" created — ${locCount} locations generated`,'success');
  locShowWarehouseDetail(whId);
}

// ── Warehouse address edit modal ──
function locEditWhAddress(whId){
  const wh=warehouses.find(w=>w.id===whId); if(!wh) return;
  const existing=document.getElementById('loc-addr-modal');
  if(existing) existing.remove();
  const m=document.createElement('div');
  m.id='loc-addr-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:300;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  m.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border-bright);border-radius:12px;width:400px;max-width:95vw;box-shadow:0 24px 80px rgba(0,0,0,0.5);padding:24px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px;">Edit Ship-To Address — ${escHtml(wh.name)}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label class="fl">Street Address</label>
          <input class="plain-input" id="loc-addr-street" value="${escHtml(wh.street||'')}" placeholder="3351 La Cienega Pl"></div>
        <div style="display:flex;gap:8px;">
          <div style="flex:2;"><label class="fl">City</label>
            <input class="plain-input" id="loc-addr-city" value="${escHtml(wh.city||'')}" placeholder="Los Angeles"></div>
          <div style="flex:1;"><label class="fl">State</label>
            <input class="plain-input" id="loc-addr-state" value="${escHtml(wh.state||'')}" placeholder="CA"></div>
          <div style="flex:1;"><label class="fl">ZIP</label>
            <input class="plain-input" id="loc-addr-zip" value="${escHtml(wh.zip||'')}" placeholder="90016"></div>
        </div>
        <div><label class="fl">Phone (optional)</label>
          <input class="plain-input" id="loc-addr-phone" value="${escHtml(wh.phone||'')}" placeholder="555-0100"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
        <button onclick="document.getElementById('loc-addr-modal').remove()" class="btn btn-ghost">Cancel</button>
        <button onclick="locSaveWhAddress('${whId}')" class="btn" style="background:var(--accent);color:#fff;border:none;padding:9px 20px;border-radius:6px;font-family:var(--font-ui);font-size:13px;font-weight:700;cursor:pointer;">Save</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('loc-addr-street').focus(),50);
}

function locSaveWhAddress(whId){
  const wh=warehouses.find(w=>w.id===whId); if(!wh) return;
  wh.street=document.getElementById('loc-addr-street').value.trim();
  wh.city=document.getElementById('loc-addr-city').value.trim();
  wh.state=document.getElementById('loc-addr-state').value.trim();
  wh.zip=document.getElementById('loc-addr-zip').value.trim();
  wh.phone=document.getElementById('loc-addr-phone').value.trim();
  // Rebuild notes for display
  wh.notes=[wh.street,wh.city,wh.state,wh.zip,wh.phone].filter(Boolean).join(', ');
  dbSave('locations', wh);
  setDirty(true);
  document.getElementById('loc-addr-modal').remove();
  locShowWarehouseDetail(whId);
  toast('Address updated','success');
}
