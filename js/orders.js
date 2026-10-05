function setOrdersTab(tab, el){
  ordersTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.style.color='var(--text-muted)'; b.style.borderBottomColor='transparent';
  });
  el.style.color='var(--accent)'; el.style.borderBottomColor='var(--accent)';
  renderOrdersTable();
}

function poCheckReady(){
  const num = document.getElementById('po-num').value.trim();
  const vendor = document.getElementById('po-vendor').value.trim();
  document.getElementById('po-btn-add').disabled = !(num && vendor);
}

function addPO(){
  const num = document.getElementById('po-num').value.trim();
  const vendor = document.getElementById('po-vendor').value.trim();
  if(!num||!vendor){ toast('PO Number and Vendor are required','error'); return; }
  if(orders.find(o=>o.poNumber===num)){ toast(`PO ${num} already exists`,'error'); return; }
  const projName = document.getElementById('po-project').value.trim();
  const proj = projects.find(p=>p.id===acCtx.po.project.selected)
            || projects.find(p=>p.name===projName||p.id===projName);
  const newPO={
    poNumber:num, vendor, vendorId:resolveVendorId(vendor),
    projectId:proj?proj.id:'',
    projectName:proj?proj.name:projName,
    status:document.getElementById('po-status').value,
    date:document.getElementById('po-date').value,
    shipment:document.getElementById('po-ship').value.trim(),
    totalValue:0, tax:0, tariff:0, shipping:0,
    notes:document.getElementById('po-notes').value.trim(),
  };
  orders.push(newPO);
  dbSave('orders', newPO);
  setDirty(true); updateOrdersStats(); renderOrdersTable(); resetPOForm();
  toast(`PO ${num} created`,'success');
}

function nextPONumber(){
  const nums = orders.map(o=>parseInt(o.poNumber)).filter(n=>!isNaN(n));
  return nums.length ? String(Math.max(...nums)+1) : '';
}

function resetPOForm(){
  ['po-vendor','po-project','po-ship','po-notes'].forEach(id=>{ document.getElementById(id).value=''; });
  const numEl=document.getElementById('po-num');
  numEl.value=nextPONumber();
  document.getElementById('po-status').value='Submitted';
  document.getElementById('po-date').valueAsDate=new Date();
  acCtx.po.project.selected=null;
  document.getElementById('po-btn-add').disabled=true;
  // Select the PO number so user can overwrite if needed
  setTimeout(()=>{numEl.select();},50);
}

function deleteOrder(poNum){
  const deletedItemIds=orderItems.filter(i=>i.poNumber===poNum).map(i=>i.id);
  const delShipIds=shipments.filter(s=>s.poNumber===poNum).map(s=>s.id);
  const delShipItemIds=shipmentItems.filter(si=>delShipIds.includes(si.shipmentId)).map(si=>si.id);
  orders = orders.filter(o=>o.poNumber!==poNum);
  orderItems = orderItems.filter(i=>i.poNumber!==poNum);
  shipments = shipments.filter(s=>s.poNumber!==poNum);
  shipmentItems = shipmentItems.filter(si=>!delShipIds.includes(si.shipmentId));
  dbDelete('orders', poNum);
  dbDeleteMany('orderItems', deletedItemIds);
  dbDeleteMany('shipments', delShipIds);
  dbDeleteMany('shipmentItems', delShipItemIds);
  setDirty(true); updateOrdersStats(); renderOrdersTable(); showOrdersList();
  toast(`PO ${poNum} deleted`,'success');
}

function filterOrders(q){ ordersFilterQuery=q; renderOrdersTable(); }

function setOrdersStatFilter(filter){
  ordersStatFilter = (filter === null || ordersStatFilter === filter) ? null : filter;
  if(ordersStatFilter) {
    ordersTab = 'all';
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.style.color='var(--text-muted)'; b.style.borderBottomColor='transparent';
    });
    const allTab = document.getElementById('otab-all');
    if(allTab){ allTab.style.color='var(--accent)'; allTab.style.borderBottomColor='var(--accent)'; }
  }
  updateOrdersStats();
  renderOrdersTable();
}

function updateOrdersStats(){
  const total = orders.length;
  const submitted = orders.filter(o=>o.status==='Submitted').length;
  const draft = orders.filter(o=>o.status==='Draft').length;
  const partial = orders.filter(o=>{
    const items=orderItems.filter(i=>i.poNumber===o.poNumber);
    return items.length>0 && items.some(i=>i.qtyReceived>0) && items.some(i=>i.qtyReceived<i.qtyOrdered);
  }).length;
  const received = orders.filter(o=>o.status==='Received').length;
  document.getElementById('o-chip-total').innerHTML=`${total} <span>POs</span>`;
  document.getElementById('o-chip-submitted').innerHTML=`${submitted} <span>submitted</span>`;
  document.getElementById('o-chip-draft').innerHTML=`${draft} <span>draft</span>`;
  document.getElementById('o-chip-partial').innerHTML=`${partial} <span>backordered</span>`;
  document.getElementById('o-chip-received').innerHTML=`${received} <span>received</span>`;
  ['o-chip-all','o-chip-submitted','o-chip-draft','o-chip-partial','o-chip-received'].forEach(id=>{
    document.getElementById(id).classList.remove('active');
  });
  if(!ordersStatFilter) document.getElementById('o-chip-all').classList.add('active');
  else if(ordersStatFilter==='submitted') document.getElementById('o-chip-submitted').classList.add('active');
  else if(ordersStatFilter==='draft') document.getElementById('o-chip-draft').classList.add('active');
  else if(ordersStatFilter==='backordered') document.getElementById('o-chip-partial').classList.add('active');
  else if(ordersStatFilter==='received') document.getElementById('o-chip-received').classList.add('active');
}

function recalcPOTotal(poNum){
  const items = orderItems.filter(i=>i.poNumber===poNum);
  const po = orders.find(o=>o.poNumber===poNum);
  if(!po) return;
  po.totalValue = items.reduce((s,i)=>s+(i.qtyOrdered*i.unitCost),0);
  po.itemDiscountTotal = items.reduce((s,i)=>s+(i.discount||0),0);
}

// Client · Location context for a PO's project, so a bare "Unallocated" is never ambiguous.
function poProjectLabel(o){
  const proj=projects.find(p=>p.id===o.projectId);
  const projName=o.projectName||(proj?proj.name:'')||'';
  const client=(proj&&typeof projClientName==='function')?projClientName(proj):'';
  const location=(proj&&typeof projLocationName==='function')?projLocationName(proj):'';
  return {projName, client, location, ctx:[client,location,projName].filter(Boolean).join(' · ')};
}

function renderOrdersTable(){
  applySortClasses('orders');
  const q = ordersFilterQuery.toLowerCase();
  let rows = orders.filter(o=>
    !q||[o.poNumber,o.vendor,o.projectName,o.status].some(v=>v&&v.toLowerCase().includes(q))
    ||orderItems.filter(i=>i.poNumber===o.poNumber).some(i=>i.model&&i.model.toLowerCase().includes(q))
  );
  if(ordersStatFilter==='submitted') rows=rows.filter(o=>o.status==='Submitted');
  else if(ordersStatFilter==='draft') rows=rows.filter(o=>o.status==='Draft');
  else if(ordersStatFilter==='backordered') rows=rows.filter(o=>{
    const items=orderItems.filter(i=>i.poNumber===o.poNumber);
    return items.length>0 && items.some(i=>i.qtyReceived>0) && items.some(i=>i.qtyReceived<i.qtyOrdered);
  });
  else if(ordersStatFilter==='received') rows=rows.filter(o=>o.status==='Received');
  else if(ordersTab==='backorder') rows=rows.filter(o=>{
    const items=orderItems.filter(i=>i.poNumber===o.poNumber);
    return items.length>0 && items.some(i=>i.qtyReceived>0) && items.some(i=>i.qtyReceived<i.qtyOrdered);
  });
  if(ordersSort.col==='items'){
    const d=ordersSort.dir==='asc'?1:-1;
    rows=rows.sort((a,b)=>(orderItems.filter(i=>i.poNumber===a.poNumber).length-orderItems.filter(i=>i.poNumber===b.poNumber).length)*d);
  } else {
    rows=sortRows(rows, ordersSort.col, ordersSort.dir);
  }
  const tbody=document.getElementById('orders-tbody');
  if(!rows.length){
    const msg = ordersTab==='backorder'?'No backordered POs.':orders.length?'No orders match.':'No purchase orders yet.';
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">◉</div><div style="font-size:13px">${msg}</div></div></td></tr>`;
    return;
  }
  const fmt=n=>n?'$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','):'—';
  const statusColors={'Draft':'tag-b','Submitted':'tag-s','Backorder':'tag-m','Received':'tag-Complete','Cancelled':'tag-b'};
  tbody.innerHTML=rows.map(o=>{
    const iCount=orderItems.filter(i=>i.poNumber===o.poNumber).length;
    const sc=statusColors[o.status]||'tag-b';
    const outstanding=orderItems.filter(i=>i.poNumber===o.poNumber&&i.qtyReceived<i.qtyOrdered).length;
    return `<tr class="group-row" data-gkey="po-${escHtml(o.poNumber)}">
      <td class="sku-cell">${escHtml(o.poNumber)}</td>
      <td style="font-weight:600">${escHtml(o.vendor)}</td>
      <td class="mobile-hide" style="color:var(--text-muted);font-size:12px">${(()=>{const l=poProjectLabel(o);const sub=[l.client,l.location].filter(Boolean).join(' · ');return `${escHtml(l.projName||'—')}${sub?`<div style="font-size:10px;color:var(--text-dim);">${escHtml(sub)}</div>`:''}`;})()}</td>
      <td><span class="tag ${sc}">${escHtml(o.status)}</span>${outstanding?` <span style="font-family:var(--font-mono);font-size:10px;color:var(--warn)">${outstanding} open</span>`:''}</td>
      <td class="mono mobile-hide" style="font-size:11px;color:var(--text-muted)">${escHtml(o.date||'—')}</td>
      <td class="mono">${fmt(poGrand(o))}</td>
      <td><span class="qty-badge qty-s">${iCount}</span></td>
      <td><button class="btn-del" data-del-po="${escHtml(o.poNumber)}">✕</button></td>
    </tr>`;
  }).join('');
}

function poDetailBack(){
  const po=orders.find(o=>o.poNumber===currentPONum);
  // Reset the Orders page first, whatever we navigate to. showPage only toggles
  // which .page is active — it does not restore the list/detail split — so leaving
  // the detail open here would show an empty Orders page on the next visit.
  showOrdersList();
  if(poNavSource==='stock'){
    // Arriving from Shop Stock is an explicit context worth returning to.
    showPage('stock');
  } else if(po && po.projectId && projects.some(pr=>pr.id===po.projectId)){
    // A PO belongs to its project, so Back goes there whether or not that's where
    // we came from. Resolved from the PO itself, not currentProjectId, which may
    // still point at whichever project was open last.
    showPage('proj');
    openProject(po.projectId);
    setProjDetailTab('pos');
  }
  // Otherwise we're already on the orders list — a PO with no project.
  poNavSource=null;
}

function showOrdersList(){
  document.getElementById('orders-list-view').style.display='flex';
  document.getElementById('orders-detail-view').style.display='none';
  currentPONum=null;
}

function openOrder(poNum, source){
  const po=orders.find(o=>o.poNumber===poNum); if(!po) return;
  currentPONum=poNum;
  // Editing, receiving, or importing re-renders the PO by calling openOrder with no
  // source. Don't overwrite where we arrived from, or Back reverts to the orders
  // list the moment anything on the PO is touched.
  if(source) poNavSource=source;
  else if(!poNavSource) poNavSource='orders';
  document.getElementById('orders-list-view').style.display='none';
  document.getElementById('orders-detail-view').style.display='flex';
  const sc={'Draft':'tag-b','Submitted':'tag-s','Backorder':'tag-m','Received':'tag-Complete','Cancelled':'tag-b'}[po.status]||'tag-b';
  document.getElementById('po-det-num').textContent=po.poNumber;
  document.getElementById('po-det-vendor').textContent=po.vendor;
  document.getElementById('po-det-status-badge').innerHTML=`<span class="tag ${sc}">${escHtml(po.status)}</span>`;
  document.getElementById('po-det-meta').textContent=[poProjectLabel(po).ctx,po.date,po.shipment].filter(Boolean).join(' · ');
  recalcPOTotal(poNum);
  const items=orderItems.filter(i=>i.poNumber===poNum);
  const grossTotal=items.reduce((s,i)=>s+(i.qtyOrdered*i.unitCost),0);
  const itemDiscTotal=items.reduce((s,i)=>s+(i.discount||0),0);
  const subtotal=grossTotal-itemDiscTotal;
  const outstanding=items.reduce((s,i)=>s+(Math.max(0,i.qtyOrdered-i.qtyReceived)*i.unitCost),0);
  const fmtM=n=>'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const tax=po?.tax||0, tariff=po?.tariff||0, poShip=po?.shipping||0, poDisc=po?.discount||0;
  const poOthers=Array.isArray(po.otherCharges)?po.otherCharges:[];
  const poOtherTotal=poOthers.reduce((s,c)=>s+(c.amount||0),0);
  document.getElementById('po-det-subtotal').textContent=fmtM(subtotal);
  const estResale=items.reduce((s,i)=>{
    const scopeItem=projectItems.find(p=>p.projectId===po.projectId&&((i.sku&&p.sku===i.sku)||(p.manufacturer===i.manufacturer&&p.model===i.model)));
    const price=scopeItem?.unitPrice??catalog.find(c=>c.sku===i.sku)?.unitPrice??catalog.find(c=>c.sku===i.sku)?.msrp??0;
    return s+(i.qtyOrdered*price);
  },0);
  document.getElementById('po-det-resale').textContent=estResale>0?fmtM(estResale):'—';
  document.getElementById('po-det-tax').textContent=tax>0?fmtM(tax):'—';
  document.getElementById('po-det-tariff').textContent=tariff>0?fmtM(tariff):'—';
  document.getElementById('po-det-shipping').textContent=poShip>0?fmtM(poShip):'—';
  document.getElementById('po-det-discount').textContent=poDisc>0?fmtM(poDisc):'—';
  const othersEl=document.getElementById('po-det-others');
  if(othersEl){
    othersEl.innerHTML=poOthers.length?poOthers.map(c=>`<div><div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase">${escHtml(c.label||'Other')}</div><div style="font-family:var(--font-mono);font-size:14px;color:var(--text-muted)">${fmtM(c.amount||0)}</div></div>`).join(''):'';
  }
  const shipAddrEl=document.getElementById('po-det-ship-addr');
  if(shipAddrEl){ shipAddrEl.textContent=po.shipAddress||''; }
  document.getElementById('po-det-grand').textContent=fmtM(subtotal+tax+tariff+poShip-poDisc+poOtherTotal);
  renderPOItems(poNum);
  renderPOShipments(poNum);
  resetPOIForm();
}

function renderPOItems(poNum){
  const items=orderItems.filter(i=>i.poNumber===poNum);
  const tbody=document.getElementById('po-items-tbody');
  if(!items.length){
    tbody.innerHTML=`<tr><td colspan="11"><div class="empty-state" style="padding:30px"><div style="font-size:13px;color:var(--text-dim)">No items on this PO. Add below.</div></div></td></tr>`;
    return;
  }
  const po=orders.find(o=>o.poNumber===poNum);
  const poProjectId=po?po.projectId:'';
  const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  tbody.innerHTML=items.map(i=>{
    const outstanding=Math.max(0,i.qtyOrdered-i.qtyReceived);
    const isc=outstanding===0?'tag-Complete':i.qtyReceived>0?'tag-m':'tag-s';
    const istatus=outstanding===0?'Received':i.qtyReceived>0?'Backorder':'Ordered';
    const qtyShipped=getItemQtyShipped(i.id);
    const shipBadge=qtyShipped>=i.qtyOrdered
      ?`<span class="tag" style="font-size:9px;padding:1px 5px;margin-left:4px;background:rgba(79,142,247,0.15);color:var(--accent);border:1px solid rgba(79,142,247,0.3);">🚚 Shipped</span>`
      :qtyShipped>0
        ?`<span class="tag" style="font-size:9px;padding:1px 5px;margin-left:4px;background:rgba(247,201,79,0.1);color:var(--warn);border:1px solid rgba(247,201,79,0.25);">🚚 ${qtyShipped}/${i.qtyOrdered}</span>`
        :'';
    const label=i.description
      ?`<span style="font-style:italic;color:var(--text-muted)">${escHtml(i.description)}</span>`
      :`${i.manufacturer?`<span style="font-size:11px;color:var(--text-muted)">${escHtml(i.manufacturer)}</span> `:''}${escHtml(i.model)}`;
    return `<tr class="group-row">
      <td class="sku-cell">${i.sku?escHtml(i.sku):'<span class="dim">—</span>'}</td>
      <td style="font-size:13px">${label}</td>
      <td class="mono">
        <input type="number" value="${i.qtyOrdered}" min="${i.qtyReceived||1}" step="1"
          onchange="poiInlineQty('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:60px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td class="mono" style="color:var(--accent3)">${i.qtyReceived}</td>
      <td class="mono" style="color:${outstanding>0?'var(--warn)':'var(--text-dim)'}">${outstanding||'—'}</td>
      <td class="mono">
        ${i.qtyReceived>0
          ? `<div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;">
              <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim);">$${parseFloat(i.unitCost).toFixed(2)}</span>
              <button title="Cost locked — this line has been received, so its unit cost is a historical record. Click to correct it." onclick="event.stopPropagation();poiUnlockCost('${sk(i.id)}',this)" style="background:none;border:none;cursor:pointer;font-size:11px;line-height:1;opacity:0.55;padding:0;">🔒</button>
            </div>`
          : `<input type="number" value="${parseFloat(i.unitCost).toFixed(2)}" min="0" step="0.01"
              onchange="poiInlinePrice('${sk(i.id)}',this.value)"
              onclick="event.stopPropagation()"
              style="width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">`}
      </td>
      <td class="mono">
        <input type="number" value="${i.discount>0?parseFloat(i.discount).toFixed(2):''}" min="0" step="0.01" placeholder="0.00"
          onchange="poiInlineDiscount('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--accent4);outline:none;text-align:right;"
          onfocus="this.style.borderColor='var(--accent4)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td class="mono">$${((i.qtyOrdered*i.unitCost)-(i.discount||0)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</td>
      <td><span class="tag ${isc}">${istatus}</span>${shipBadge}</td>
      <td class="mono" style="font-size:10px;color:var(--text-muted)">${escHtml(i.dateReceived||'—')}</td>
      <td style="white-space:nowrap">
        <button class="btn-del" style="margin-right:4px;" onclick="event.stopPropagation();openEditPOItemModal('${sk(i.id)}')">✎</button>
        <button class="btn-del" style="margin-right:4px;color:var(--accent3);border-color:rgba(79,247,160,0.3);" onclick="event.stopPropagation();addPOItemToScope('${sk(i.id)}')" title="Add to project scope">＋</button>
        ${i.qtyReceived>0?`<button class="btn-del" style="margin-right:4px;color:var(--accent);border-color:rgba(79,142,247,0.3);" onclick="event.stopPropagation();openTransferFromPOI('${sk(i.id)}')" title="Transfer / Relocate">⇄</button>`:''}
        ${i.qtyReceived>0?`<button class="btn-del" style="margin-right:4px;color:var(--warn);border-color:rgba(247,201,79,0.3);" onclick="event.stopPropagation();openUnreceiveModal('${sk(i.id)}')" title="Un-receive">↩</button>`:''}
        <button class="btn-del" onclick="event.stopPropagation();deletePOItem('${sk(i.id)}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function poiCheckReady(){
  document.getElementById('poi-btn-add').disabled=!(acCtx.poi.mfg.selected&&acCtx.poi.model.selected);
}

function addPOItem(){
  const mfg=acCtx.poi.mfg.selected, model=acCtx.poi.model.selected;
  if(!mfg||!model||!currentPONum) return;
  const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
  const newItem={
    id:uid(), poNumber:currentPONum,
    sku:document.getElementById('poi-sku').value,
    manufacturer:mfg, model,
    description:'',
    category:entry?entry.category:'',
    qtyOrdered:Math.max(1,parseInt(document.getElementById('poi-qty').value)||1),
    qtyReceived:0,
    unitCost:parseFloat(document.getElementById('poi-price').value)||0,
    discount:parseFloat(document.getElementById('poi-discount').value)||0,
    notes:document.getElementById('poi-notes').value.trim(),
    dateReceived:'',
  };
  orderItems.push(newItem);
  recalcPOTotal(currentPONum);
  const thisPO0=orders.find(o=>o.poNumber===currentPONum);
  dbSave('orderItems', newItem);
  if(thisPO0) dbSave('orders', thisPO0);
  setDirty(true); renderPOItems(currentPONum); openOrder(currentPONum); renderOrdersTable();
  // Refresh project detail if this PO is linked to the currently viewed project
  const thisPO=orders.find(o=>o.poNumber===currentPONum);
  if(thisPO&&thisPO.projectId) refreshProjectDetail(thisPO.projectId);
  resetPOIForm(); toast('Item added to PO','success');
}

function deletePOItem(id){
  orderItems=orderItems.filter(i=>i.id!==id);
  recalcPOTotal(currentPONum);
  const thisPO2=orders.find(o=>o.poNumber===currentPONum);
  dbDelete('orderItems', id);
  if(thisPO2) dbSave('orders', thisPO2);
  if(thisPO2&&thisPO2.projectId) refreshProjectDetail(thisPO2.projectId);
  setDirty(true); renderPOItems(currentPONum); openOrder(currentPONum); renderOrdersTable();
}

function resetPOIForm(){
  ['poi-mfg','poi-model','poi-sku','poi-notes'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('poi-qty').value=1;
  document.getElementById('poi-price').value='';
  document.getElementById('poi-discount').value='';
  document.getElementById('poi-model').disabled=true;
  document.getElementById('poi-model').placeholder='Select manufacturer first…';
  acCtx.poi.mfg.selected=acCtx.poi.model.selected=null;
  document.getElementById('poi-btn-add').disabled=true;
}

// ── INLINE PO ITEM EDITS ──
function poiInlineQty(id, val){
  const item=orderItems.find(i=>i.id===id); if(!item) return;
  const qty=Math.max(item.qtyReceived||1, parseInt(val)||1);
  item.qtyOrdered=qty;
  recalcPOTotal(currentPONum);
  const po=orders.find(o=>o.poNumber===currentPONum);
  dbSave('orderItems', item);
  if(po) dbSave('orders', po);
  setDirty(true);
  openOrder(currentPONum);
  if(po&&po.projectId) refreshProjectDetail(po.projectId);
}

// Once a PO line has been received, its unit cost is a historical cost-history record for
// that product (see showCostHistory). It is locked in the UI; poiUnlockCost is the explicit
// override. This guard is defense-in-depth so nothing rewrites a received line's cost without
// going through that deliberate unlock.
const _poiCostUnlocked = new Set();
function poiInlinePrice(id, val){
  const item=orderItems.find(i=>i.id===id); if(!item) return;
  if(item.qtyReceived>0 && !_poiCostUnlocked.has(id)){
    toast('Cost locked — this line has been received. Click the 🔒 to correct it.','error');
    openOrder(currentPONum);
    return;
  }
  item.unitCost=parseFloat(val)||0;
  _poiCostUnlocked.delete(id);
  recalcPOTotal(currentPONum);
  const po=orders.find(o=>o.poNumber===currentPONum);
  dbSave('orderItems', item);
  if(po) dbSave('orders', po);
  setDirty(true);
  openOrder(currentPONum);
  if(po&&po.projectId) refreshProjectDetail(po.projectId);
}

// Deliberately unlock a received line's cost for correction. Swaps the locked display for an
// editable input in place; the next poiInlinePrice commit consumes the unlock and re-locks.
function poiUnlockCost(id, btn){
  const item=orderItems.find(i=>i.id===id), cell=btn&&btn.closest('td');
  if(!item||!cell) return;
  if(!confirm('This unit cost is locked because the PO line has been received.\n\nEditing it changes the historical cost recorded for this purchase, which affects this product’s cost history. Continue?')) return;
  _poiCostUnlocked.add(id);
  const inp=document.createElement('input');
  inp.type='number'; inp.min='0'; inp.step='0.01'; inp.value=parseFloat(item.unitCost).toFixed(2);
  inp.style.cssText='width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--accent);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;';
  inp.onclick=e=>e.stopPropagation();
  inp.onchange=()=>poiInlinePrice(id, inp.value);
  cell.innerHTML=''; cell.appendChild(inp); inp.focus(); inp.select();
}

// ── EDIT PO HEADER MODAL ──
let currentEditPONum = null;

function openEditPOModal(poNum){
  const po=orders.find(o=>o.poNumber===poNum); if(!po) return;
  currentEditPONum=poNum;
  document.getElementById('edit-po-vendor').value=po.vendor||'';
  document.getElementById('edit-po-status').value=po.status||'Submitted';
  document.getElementById('edit-po-date').value=po.date||'';
  document.getElementById('edit-po-ship').value=po.shipment||'';
  document.getElementById('edit-po-notes').value=po.notes||'';
  // Project
  const proj=projects.find(p=>p.id===po.projectId);
  document.getElementById('edit-po-project').value=proj?proj.name:(po.projectName||'');
  acCtx.editpo.project.selected=po.projectId||null;
  // Ship-to address
  npoPopulateAddrSelect('epo-ship-addr-sel');
  const savedAddr=po.shipAddress||'';
  document.getElementById('epo-ship-addr').value=savedAddr;
  document.getElementById('epo-ship-addr-sel').value=savedAddr;
  if(!savedAddr){
    const fallback=npoDefaultShipAddr();
    if(fallback){ document.getElementById('epo-ship-addr').value=fallback; document.getElementById('epo-ship-addr-sel').value=fallback; }
  }
  // Additional costs
  _epoCostMode={tax:'$', tariff:'$', shipping:'$', discount:'$', other:'$'};
  ['tax','tariff','shipping','discount'].forEach(f=>{
    document.getElementById('epo-'+f+'-mode').textContent='$';
    const inp=document.getElementById('epo-'+f+'-val');
    inp.value=(po[f]>0)?parseFloat(po[f]).toFixed(2):'';
    inp.placeholder='0.00'; inp.step='0.01';
    document.getElementById('epo-'+f+'-calc').textContent='';
  });
  _epoOtherCharges=(Array.isArray(po.otherCharges)?po.otherCharges:[]).map(c=>({id:uid(),label:c.label||'',mode:c.mode||'$',initAmount:(c.value??c.amount)||0}));
  epoRenderOtherCharges();
  epoUpdateCalc('tax'); epoUpdateCalc('tariff'); epoUpdateCalc('shipping'); epoUpdateCalc('discount');
  // Populate scope picker with remaining project items
  _epoScopeDiscMode={};
  const epoPicker=document.getElementById('epo-scope-picker');
  const epoScopeList=document.getElementById('epo-scope-list');
  // Resolve project — prefer stored projectId, fall back to matching by name
  let epoProjId=po.projectId;
  if(!epoProjId && po.projectName){
    const byName=projects.find(p=>p.name===po.projectName);
    if(byName) epoProjId=byName.id;
  }
  if(epoProjId){
    const allScope=projectItems.filter(i=>i.projectId===epoProjId);
    const scopeItems=allScope
      .map(i=>{
        // Coverage = filled units + units still inbound on a PO. A received-then-unfilled
        // unit drops out of "filled" and is no longer inbound, so it reappears as needed.
        const filled=getScopeItemFilled(i);
        const openOnPO=getScopeItemOpenOnPO(epoProjId,i);
        return {...i,_remaining:Math.max(0,(i.qty||0)-filled-openOnPO),_openOnPO:openOnPO,_filled:filled};
      })
      .filter(i=>i._remaining>0);
    epoPicker.style.display='block';
    if(scopeItems.length){
      const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      epoScopeList.innerHTML=scopeItems.map(i=>`
        <div id="epo-sc-row-${i.id}" style="display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--border);transition:background 0.1s;">
          <input type="checkbox" id="epo-sc-${i.id}" data-scope-id="${i.id}" onchange="epoScopeRowToggle('${sk(i.id)}')"
            style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;">
          <label for="epo-sc-${i.id}" style="flex:1;cursor:pointer;">
            <span style="font-size:13px;">${escHtml(i.manufacturer)} ${escHtml(i.model)}</span>
            ${i.sku?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-left:8px;">${escHtml(i.sku)}</span>`:''}
            <span style="font-size:11px;color:var(--text-dim);margin-left:6px;">need: ${i._remaining}${i._openOnPO>0?` (${i._openOnPO} on PO)`:''}${i._filled>0?` (${i._filled} filled)`:''}</span>
          </label>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">Qty</label>
            <input type="number" id="epo-sc-qty-${i.id}" value="${i._remaining}" min="1"
              style="width:58px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;">
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">Unit Cost $</label>
            <input type="number" id="epo-sc-price-${i.id}" value="${i.unitCost>0?parseFloat(i.unitCost).toFixed(2):''}" min="0" step="0.01" placeholder="0.00"
              style="width:90px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;">
          </div>
          <div style="display:flex;align-items:center;gap:4px;" title="Discount">
            <button id="epo-sc-disc-btn-${i.id}" onclick="epoToggleScopeDiscMode('${sk(i.id)}')" style="padding:2px 6px;font-size:11px;font-weight:700;min-width:28px;border-radius:4px;background:var(--surface3);border:1px solid var(--border);color:var(--accent4);cursor:pointer;">$</button>
            <input type="number" id="epo-sc-disc-${i.id}" value="" min="0" step="0.01" placeholder="0"
              style="width:72px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--accent4);outline:none;text-align:right;">
          </div>
        </div>`).join('');
    } else {
      epoScopeList.innerHTML=`<div style="padding:12px 14px;font-size:12px;color:var(--text-dim);">All scope items for this project are already covered by existing POs.</div>`;
    }
  } else { epoPicker.style.display='none'; epoScopeList.innerHTML=''; }
  document.getElementById('edit-po-modal').style.display='flex';
  setTimeout(()=>document.getElementById('edit-po-vendor').focus(),100);
}

function closeEditPOModal(){
  document.getElementById('edit-po-modal').style.display='none';
  const p=document.getElementById('epo-scope-picker');
  const l=document.getElementById('epo-scope-list');
  if(p) p.style.display='none';
  if(l) l.innerHTML='';
  _epoScopeDiscMode={};
  currentEditPONum=null;
}

function saveEditPO(){
  const po=orders.find(o=>o.poNumber===currentEditPONum); if(!po) return;
  const vendor=document.getElementById('edit-po-vendor').value.trim();
  if(!vendor){ toast('Vendor is required','error'); return; }
  po.vendor=vendor; po.vendorId=resolveVendorId(vendor);
  po.status=document.getElementById('edit-po-status').value;
  po.date=document.getElementById('edit-po-date').value;
  po.shipment=document.getElementById('edit-po-ship').value.trim();
  po.notes=document.getElementById('edit-po-notes').value.trim();
  po.shipAddress=document.getElementById('epo-ship-addr').value.trim();
  po.tax=epoGetAmount('tax');
  po.tariff=epoGetAmount('tariff');
  po.shipping=epoGetAmount('shipping');
  po.discount=epoGetAmount('discount');
  po.otherCharges=epoCollectOtherCharges();
  // Project
  const projId=acCtx.editpo.project.selected;
  const projName=document.getElementById('edit-po-project').value.trim();
  if(projId){
    const proj=projects.find(p=>p.id===projId);
    po.projectId=projId;
    po.projectName=proj?proj.name:projName;
  } else if(!projName){
    po.projectId=''; po.projectName='';
  } else {
    const proj=projects.find(p=>p.name===projName);
    po.projectId=proj?proj.id:''; po.projectName=projName;
  }
  // Collect checked scope items and add as new PO line items
  const updatedScopeIds=new Set();
  document.querySelectorAll('#epo-scope-list input[type=checkbox]:checked').forEach(cb=>{
    const id=cb.dataset.scopeId;
    const scopeItem=projectItems.find(i=>i.id===id); if(!scopeItem) return;
    const qty=Math.max(1,parseInt(document.getElementById('epo-sc-qty-'+id)?.value)||1);
    const price=parseFloat(document.getElementById('epo-sc-price-'+id)?.value)||0;
    const discRaw=parseFloat(document.getElementById('epo-sc-disc-'+id)?.value)||0;
    const disc=(_epoScopeDiscMode[id]||'$')==='%'?discRaw/100*(qty*price):discRaw;
    const newItem={id:uid(),poNumber:po.poNumber,sku:scopeItem.sku,manufacturer:scopeItem.manufacturer,model:scopeItem.model,description:'',category:scopeItem.category||'',qtyOrdered:qty,qtyReceived:0,unitCost:price,discount:disc,notes:'',dateReceived:''};
    orderItems.push(newItem);
    dbSave('orderItems',newItem);
    scopeItem.itemStatus='On PO';
    updatedScopeIds.add(scopeItem.id);
  });
  projectItems.filter(si=>updatedScopeIds.has(si.id)).forEach(si=>dbSave('projectItems',si));
  recalcPOTotal(po.poNumber);
  dbSave('orders', po);
  setDirty(true);
  const savedNum=currentEditPONum;
  closeEditPOModal();
  openOrder(savedNum);
  renderOrdersTable(); updateOrdersStats();
  if(po.projectId){ renderProjTable(); updateProjStats(); if(currentProjectId===po.projectId) refreshProjectDetail(po.projectId); }
  toast('PO updated','success');
}

// ── PO ADD-ON COSTS ──────────────────────────────────────────────────────────
function poGrand(po){
  const others=Array.isArray(po.otherCharges)?po.otherCharges.reduce((s,c)=>s+(c.amount||0),0):0;
  return (po.totalValue||0)-(po.itemDiscountTotal||0)+(po.tax||0)+(po.tariff||0)+(po.shipping||0)-(po.discount||0)+others;
}

// Edit PO modal cost state
let _epoCostMode={tax:'$', tariff:'$', shipping:'$', discount:'$'};
let _epoOtherCharges=[];
let _epoScopeDiscMode={};

function epoScopeRowToggle(id){
  const cb=document.getElementById('epo-sc-'+id);
  const row=document.getElementById('epo-sc-row-'+id);
  if(row) row.style.background=cb&&cb.checked?'var(--accent-glow)':'';
}

function epoToggleScopeDiscMode(id){
  const btn=document.getElementById('epo-sc-disc-btn-'+id);
  const inp=document.getElementById('epo-sc-disc-'+id);
  const qty=parseFloat(document.getElementById('epo-sc-qty-'+id)?.value)||0;
  const price=parseFloat(document.getElementById('epo-sc-price-'+id)?.value)||0;
  const base=qty*price;
  const curMode=_epoScopeDiscMode[id]||'$';
  const curVal=parseFloat(inp.value)||0;
  if(curMode==='$'){
    _epoScopeDiscMode[id]='%';
    inp.value=base>0?parseFloat((curVal/base*100).toFixed(4)):0;
    btn.textContent='%';
  } else {
    _epoScopeDiscMode[id]='$';
    inp.value=parseFloat((curVal/100*base).toFixed(2));
    btn.textContent='$';
  }
}

function epoGetSubtotal(){
  if(!currentEditPONum) return 0;
  return orderItems.filter(i=>i.poNumber===currentEditPONum)
    .reduce((s,i)=>s+(i.qtyOrdered*i.unitCost)-(i.discount||0),0);
}

function epoGetAmount(field){
  const val=parseFloat(document.getElementById('epo-'+field+'-val').value)||0;
  return _epoCostMode[field]==='%'?val/100*epoGetSubtotal():val;
}

function epoToggleMode(field){
  const inp=document.getElementById('epo-'+field+'-val');
  const btn=document.getElementById('epo-'+field+'-mode');
  const sub=epoGetSubtotal();
  if(_epoCostMode[field]==='$'){
    const amt=parseFloat(inp.value)||0;
    _epoCostMode[field]='%';
    btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):'';
    inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    _epoCostMode[field]='$';
    btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2);
    inp.placeholder='0.00'; inp.step='0.01';
  }
  epoUpdateCalc(field);
}

function epoUpdateCalc(field){
  const fmtN=n=>'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const calcEl=document.getElementById('epo-'+field+'-calc');
  if(calcEl) calcEl.textContent=_epoCostMode[field]==='%'?'= '+fmtN(epoGetAmount(field)):'';
  const sub=epoGetSubtotal();
  const grand=sub+epoGetAmount('tax')+epoGetAmount('tariff')+epoGetAmount('shipping')-epoGetAmount('discount')+epoGetOtherTotal();
  const sd=document.getElementById('epo-subtotal-disp');
  if(sd) sd.textContent=fmtN(sub);
  const gd=document.getElementById('epo-grand');
  if(gd) gd.textContent=fmtN(grand);
}

// New PO modal cost state
let _npoCostMode={tax:'$', tariff:'$', shipping:'$', discount:'$'};
let _npoOtherCharges=[];
let _npoScopeDiscMode={};

function npoItemDiscountAmt(item){
  const base=item.qty*item.unitCost;
  return item.discountMode==='%'?(item.discount||0)/100*base:(item.discount||0);
}

function npoGetSubtotal(){
  const manualTotal=npoItems.reduce((s,i)=>s+(i.qty*i.unitCost)-npoItemDiscountAmt(i),0);
  let scopeTotal=0;
  document.querySelectorAll('#npo-scope-list input[type=checkbox]:checked').forEach(cb=>{
    const id=cb.dataset.scopeId;
    const qty=parseFloat(document.getElementById('npo-sc-qty-'+id)?.value)||0;
    const price=parseFloat(document.getElementById('npo-sc-price-'+id)?.value)||0;
    const discRaw=parseFloat(document.getElementById('npo-sc-disc-'+id)?.value)||0;
    const discAmt=(_npoScopeDiscMode[id]||'$')==='%'?discRaw/100*(qty*price):discRaw;
    scopeTotal+=qty*price-discAmt;
  });
  return manualTotal+scopeTotal;
}

function npoGetAmount(field){
  const val=parseFloat(document.getElementById('npo-'+field+'-val').value)||0;
  return _npoCostMode[field]==='%'?val/100*npoGetSubtotal():val;
}

function npoToggleMode(field){
  const inp=document.getElementById('npo-'+field+'-val');
  const btn=document.getElementById('npo-'+field+'-mode');
  const sub=npoGetSubtotal();
  if(_npoCostMode[field]==='$'){
    const amt=parseFloat(inp.value)||0;
    _npoCostMode[field]='%';
    btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):'';
    inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    _npoCostMode[field]='$';
    btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2);
    inp.placeholder='0.00'; inp.step='0.01';
  }
  npoUpdateTotal();
}

function resetNPOCosts(){
  _npoCostMode={tax:'$', tariff:'$', shipping:'$', discount:'$'};
  ['tax','tariff','shipping','discount'].forEach(f=>{
    const btn=document.getElementById('npo-'+f+'-mode');
    const inp=document.getElementById('npo-'+f+'-val');
    const calc=document.getElementById('npo-'+f+'-calc');
    if(btn) btn.textContent='$';
    if(inp){inp.value=''; inp.placeholder='0.00'; inp.step='0.01';}
    if(calc) calc.textContent='';
  });
  _npoOtherCharges=[];
  npoRenderOtherCharges();
}

function npoWhAddr(wh){
  // Build properly formatted ship-to from structured fields when available
  if(wh.street||wh.city){
    const cityLine=[wh.city,[wh.state,wh.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [wh.name,wh.street,cityLine,wh.phone].filter(Boolean).join('\n');
  }
  // Fallback for warehouses created before structured fields were added
  return wh.notes?`${wh.name}\n${wh.notes}`:wh.name;
}

function npoDefaultShipAddr(){
  // Prefer isDefault client address, then fall back to first warehouse
  const def=clients.find(c=>c.isDefault);
  if(def) return npoClientAddr(def);
  if(warehouses.length) return npoWhAddr(warehouses[0]);
  return '';
}

function npoClientAddr(c){
  const cityLine=[c.city,[c.state,c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  // If structured fields exist use them; otherwise fall back to legacy single-line address
  if(c.street||c.city){
    return [c.name,c.street,cityLine,c.phone].filter(Boolean).join('\n');
  }
  return c.address||'';
}

function npoPopulateAddrSelect(selId){
  const sel=document.getElementById(selId); if(!sel) return;
  const esc=s=>(s||'').replace(/"/g,'&quot;');
  let html='<option value="">— select location —</option>';
  if(warehouses.length){
    html+=`<optgroup label="Warehouses">`;
    html+=warehouses.map(w=>`<option value="${escHtml(npoWhAddr(w))}">${escHtml(w.name)}</option>`).join('');
    html+=`</optgroup>`;
  }
  if(clients.length){
    html+=`<optgroup label="Clients">`;
    html+=clients.map(c=>`<option value="${escHtml(npoClientAddr(c))}">${escHtml(c.name)}</option>`).join('');
    html+=`</optgroup>`;
  }
  sel.innerHTML=html;
}

function npoInitShipAddr(){
  npoPopulateAddrSelect('npo-ship-addr-sel');
  const addr=npoDefaultShipAddr();
  document.getElementById('npo-ship-addr').value=addr;
  document.getElementById('npo-ship-addr-sel').value=addr;
}

function npoOnAddrSelect(selId, addrId){
  const sel=document.getElementById(selId);
  const inp=document.getElementById(addrId);
  if(sel&&inp) inp.value=sel.value;
}

// ── DYNAMIC OTHER CHARGES ────────────────────────────────────────────────────
function _ocRowHTML(prefix, c){
  const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const id=c.id;
  // % values carry 4 decimals (matching the toggle); dollars use 2. Truncating a
  // percentage to 2dp on reload would silently round e.g. 3.3333% down to 3.33%.
  const initVal=c.initAmount>0?parseFloat(c.initAmount).toFixed(c.mode==='%'?4:2):'';
  return `<div id="${prefix}-oc-row-${id}" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
    <input type="text" id="${prefix}-oc-label-${id}" value="${escHtml(c.label)}" placeholder="Label" class="plain-input" style="width:78px;font-size:11px;padding:2px 6px;flex-shrink:0;">
    <button type="button" id="${prefix}-oc-mode-${id}" onclick="${prefix}ToggleOCMode('${sk(id)}')" title="Toggle $ / %" style="padding:2px 8px;font-size:11px;font-weight:700;min-width:34px;border-radius:4px;background:var(--surface3);border:1px solid var(--border);color:var(--text);cursor:pointer;">${c.mode}</button>
    <input id="${prefix}-oc-val-${id}" type="number" min="0" step="0.01" placeholder="0.00" value="${initVal}" class="plain-input" style="width:100px;" oninput="${prefix}UpdateOC()">
    <span id="${prefix}-oc-calc-${id}" style="font-size:11px;font-family:var(--font-mono);color:var(--accent3);min-width:80px;"></span>
    <button type="button" onclick="${prefix}RemoveOC('${sk(id)}')" style="padding:2px 7px;border-radius:4px;background:none;border:1px solid rgba(247,79,126,0.3);color:var(--accent4);cursor:pointer;font-size:11px;">✕</button>
  </div>`;
}

function npoRenderOtherCharges(){
  const c=document.getElementById('npo-other-charges'); if(!c) return;
  c.innerHTML=_npoOtherCharges.map(oc=>_ocRowHTML('npo',oc)).join('');
  npoUpdateTotal();
}
function npoAddOC(){
  _npoOtherCharges.push({id:uid(),label:'',mode:'$',initAmount:0});
  npoRenderOtherCharges();
  setTimeout(()=>{const rows=document.querySelectorAll('[id^="npo-oc-label-"]');if(rows.length)rows[rows.length-1].focus();},50);
}
function npoRemoveOC(id){
  _npoOtherCharges=_npoOtherCharges.filter(c=>c.id!==id);
  document.getElementById('npo-oc-row-'+id)?.remove();
  npoUpdateTotal();
}
function npoToggleOCMode(id){
  const c=_npoOtherCharges.find(c=>c.id===id); if(!c) return;
  const inp=document.getElementById('npo-oc-val-'+id);
  const btn=document.getElementById('npo-oc-mode-'+id);
  const sub=npoGetSubtotal();
  if(c.mode==='$'){
    const amt=parseFloat(inp.value)||0;
    c.mode='%'; btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):''; inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    c.mode='$'; btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2); inp.placeholder='0.00'; inp.step='0.01';
  }
  npoUpdateTotal();
}
function npoUpdateOC(){ npoUpdateTotal(); }
function npoGetOCAmount(prefix, arr, id){
  const c=arr.find(c=>c.id===id); if(!c) return 0;
  const val=parseFloat(document.getElementById(prefix+'-oc-val-'+id)?.value)||0;
  const sub=prefix==='npo'?npoGetSubtotal():epoGetSubtotal();
  return c.mode==='%'?val/100*sub:val;
}
function npoGetOtherTotal(){
  const fmtN=n=>'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return _npoOtherCharges.reduce((s,c)=>{
    const amt=npoGetOCAmount('npo',_npoOtherCharges,c.id);
    const calcEl=document.getElementById('npo-oc-calc-'+c.id);
    if(calcEl) calcEl.textContent=c.mode==='%'?'= '+fmtN(amt):'';
    return s+amt;
  },0);
}
function npoCollectOtherCharges(){
  return _npoOtherCharges.map(c=>({
    label:document.getElementById('npo-oc-label-'+c.id)?.value.trim()||'',
    mode:c.mode,
    value:parseFloat(document.getElementById('npo-oc-val-'+c.id)?.value)||0,
    amount:npoGetOCAmount('npo',_npoOtherCharges,c.id)
  }));
}

function epoRenderOtherCharges(){
  const c=document.getElementById('epo-other-charges'); if(!c) return;
  c.innerHTML=_epoOtherCharges.map(oc=>_ocRowHTML('epo',oc)).join('');
  epoUpdateCalc('tax');
}
function epoAddOC(){
  _epoOtherCharges.push({id:uid(),label:'',mode:'$',initAmount:0});
  epoRenderOtherCharges();
  setTimeout(()=>{const rows=document.querySelectorAll('[id^="epo-oc-label-"]');if(rows.length)rows[rows.length-1].focus();},50);
}
function epoRemoveOC(id){
  _epoOtherCharges=_epoOtherCharges.filter(c=>c.id!==id);
  document.getElementById('epo-oc-row-'+id)?.remove();
  epoUpdateCalc('tax');
}
function epoToggleOCMode(id){
  const c=_epoOtherCharges.find(c=>c.id===id); if(!c) return;
  const inp=document.getElementById('epo-oc-val-'+id);
  const btn=document.getElementById('epo-oc-mode-'+id);
  const sub=epoGetSubtotal();
  if(c.mode==='$'){
    const amt=parseFloat(inp.value)||0;
    c.mode='%'; btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):''; inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    c.mode='$'; btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2); inp.placeholder='0.00'; inp.step='0.01';
  }
  epoUpdateCalc('tax');
}
function epoUpdateOC(){ epoUpdateCalc('tax'); }
function epoGetOtherTotal(){
  const fmtN=n=>'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return _epoOtherCharges.reduce((s,c)=>{
    const val=parseFloat(document.getElementById('epo-oc-val-'+c.id)?.value)||0;
    const sub=epoGetSubtotal();
    const amt=c.mode==='%'?val/100*sub:val;
    const calcEl=document.getElementById('epo-oc-calc-'+c.id);
    if(calcEl) calcEl.textContent=c.mode==='%'?'= '+fmtN(amt):'';
    return s+amt;
  },0);
}
function epoCollectOtherCharges(){
  const sub=epoGetSubtotal();
  return _epoOtherCharges.map(c=>{
    const val=parseFloat(document.getElementById('epo-oc-val-'+c.id)?.value)||0;
    return {
      label:document.getElementById('epo-oc-label-'+c.id)?.value.trim()||'',
      mode:c.mode,
      value:val,
      amount:c.mode==='%'?val/100*sub:val
    };
  });
}

function npoSetItemDiscount(id, val){
  const item=npoItems.find(i=>i.id===id); if(!item) return;
  item.discount=parseFloat(val)||0;
  npoRenderItems(); npoUpdateTotal();
}

function npoToggleItemMode(id){
  const item=npoItems.find(i=>i.id===id); if(!item) return;
  const base=item.qty*item.unitCost;
  if((item.discountMode||'$')==='$'){
    const amt=item.discount||0;
    item.discountMode='%';
    item.discount=base>0?parseFloat((amt/base*100).toFixed(4)):0;
  } else {
    const pct=item.discount||0;
    item.discountMode='$';
    item.discount=parseFloat((pct/100*base).toFixed(2));
  }
  npoRenderItems(); npoUpdateTotal();
}

function npoToggleScopeDiscMode(id){
  const btn=document.getElementById('npo-sc-disc-btn-'+id);
  const inp=document.getElementById('npo-sc-disc-'+id);
  const qty=parseFloat(document.getElementById('npo-sc-qty-'+id)?.value)||0;
  const price=parseFloat(document.getElementById('npo-sc-price-'+id)?.value)||0;
  const base=qty*price;
  const curMode=_npoScopeDiscMode[id]||'$';
  const curVal=parseFloat(inp.value)||0;
  if(curMode==='$'){
    _npoScopeDiscMode[id]='%';
    inp.value=base>0?parseFloat((curVal/base*100).toFixed(4)):0;
    btn.textContent='%';
  } else {
    _npoScopeDiscMode[id]='$';
    inp.value=parseFloat((curVal/100*base).toFixed(2));
    btn.textContent='$';
  }
  npoCheckReady();
}

function poiInlineDiscount(id, val){
  const item=orderItems.find(i=>i.id===id); if(!item) return;
  item.discount=parseFloat(val)||0;
  recalcPOTotal(currentPONum);
  const po=orders.find(o=>o.poNumber===currentPONum);
  dbSave('orderItems', item);
  if(po) dbSave('orders', po);
  setDirty(true);
  openOrder(currentPONum);
  if(po&&po.projectId) refreshProjectDetail(po.projectId);
}

// ── EDIT PO ITEM MODAL ──
let currentEditPOItemId = null;

function openEditPOItemModal(id){
  const item=orderItems.find(i=>i.id===id); if(!item) return;
  currentEditPOItemId=id;
  document.getElementById('edit-poi-mfg').value=item.manufacturer||'';
  document.getElementById('edit-poi-model').value=item.model||item.description||'';
  document.getElementById('edit-poi-sku').value=item.sku||'';
  document.getElementById('edit-poi-qty').value=item.qtyOrdered;
  document.getElementById('edit-poi-price').value=parseFloat(item.unitCost).toFixed(2);
  document.getElementById('edit-poi-discount').value=item.discount>0?parseFloat(item.discount).toFixed(2):'';
  document.getElementById('edit-poi-notes').value=item.notes||item.description||'';
  // Enable model input if mfg is set
  const modelInp=document.getElementById('edit-poi-model');
  if(item.manufacturer){
    modelInp.disabled=false;
    acCtx.editpoi.mfg.selected=item.manufacturer;
  } else {
    modelInp.disabled=true;
    acCtx.editpoi.mfg.selected=null;
  }
  acCtx.editpoi.model.selected=item.model||null;
  document.getElementById('edit-poi-modal').style.display='flex';
}

function closeEditPOItemModal(){
  document.getElementById('edit-poi-modal').style.display='none';
  currentEditPOItemId=null;
  acCtx.editpoi.mfg.selected=null;
  acCtx.editpoi.model.selected=null;
}

function saveEditPOItem(){
  const item=orderItems.find(i=>i.id===currentEditPOItemId); if(!item) return;
  const mfg=document.getElementById('edit-poi-mfg').value.trim();
  const model=document.getElementById('edit-poi-model').value.trim();
  const qty=Math.max(item.qtyReceived||1, parseInt(document.getElementById('edit-poi-qty').value)||1);
  const price=parseFloat(document.getElementById('edit-poi-price').value)||0;
  const notes=document.getElementById('edit-poi-notes').value.trim();
  // If it's a manual item (no mfg/model), treat notes as description
  if(!mfg&&!model&&notes){ item.description=notes; item.manufacturer=''; item.model=''; }
  else {
    item.manufacturer=mfg;
    item.model=model||item.model;
    if(acCtx.editpoi.model.selected===model){
      const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
      if(entry) item.sku=entry.sku;
    }
    item.description='';
    item.notes=notes;
  }
  item.qtyOrdered=qty;
  item.unitCost=price;
  item.discount=parseFloat(document.getElementById('edit-poi-discount').value)||0;
  recalcPOTotal(currentPONum);
  const po=orders.find(o=>o.poNumber===currentPONum);
  dbSave('orderItems', item);
  if(po) dbSave('orders', po);
  setDirty(true);
  closeEditPOItemModal();
  openOrder(currentPONum);
  renderOrdersTable();
  if(po&&po.projectId) refreshProjectDetail(po.projectId);
  toast('Item updated','success');
}


let receiveStage = 1; // 1 = qty entry, 2 = serial entry
let receiveQtyMap = {}; // itemId -> qty being received this session
// Dropship: the vendor shipped straight to site, so the units are never on a shelf.
// Receiving books them in as Deployed and writes the release record in one step.
let receiveDropship = {on:false, recipient:'', dest:'', projId:'', notes:''};

function openReceiveModal(){
  const items=orderItems.filter(i=>i.poNumber===currentPONum&&i.qtyReceived<i.qtyOrdered);
  if(!items.length){ toast('All items already fully received','success'); return; }
  receiveStage=1; receiveQtyMap={};
  receiveDropship={on:false, recipient:'', dest:'', projId:'', notes:''};
  renderReceiveStage1(items);
  document.getElementById('receive-modal').style.display='flex';
}

function renderReceiveStage1(items){
  const po=orders.find(o=>o.poNumber===currentPONum);
  const proj=po?projects.find(p=>p.id===po.projectId):null;
  const html=`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;">
        <input type="checkbox" id="recv-dropship" onchange="toggleRecvDropship()" style="cursor:pointer;">
        Dropshipped — deploy on receipt
      </label>
      <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">Vendor shipped direct to site. Units are booked in as Deployed with no location, and a release record is written — no staging shelf, no second pass in the deployment cart.</div>
      <div id="recv-dropship-fields" style="display:none;margin-top:10px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:150px;">
            <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Received by (on site)</label>
            <input type="text" id="recv-ds-recipient" placeholder="Who took delivery"
              style="width:100%;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;">
          </div>
          <div style="flex:1;min-width:150px;">
            <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Destination</label>
            <input type="text" id="recv-ds-dest" value="${escHtml(proj?proj.name:'')}" placeholder="Site / project"
              style="width:100%;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;">
          </div>
        </div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:600;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Step 1 — Quantities</div>
    ${items.map(i=>`
    <div style="padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;font-size:13px">${escHtml(i.manufacturer)} ${escHtml(i.model)}${i.sku?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-left:8px">${escHtml(i.sku)}</span>`:''}</div>
        <div style="font-size:11px;color:var(--text-dim)">Ordered: ${i.qtyOrdered} · Received: ${i.qtyReceived}</div>
        <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
          <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Receiving now</label>
          <input type="number" min="0" max="${i.qtyOrdered-i.qtyReceived}" value="${i.qtyOrdered-i.qtyReceived}"
                 data-item-id="${i.id}"
                 style="width:70px;padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:13px;color:var(--text);outline:none;text-align:center;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
          <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Type</label>
          <select data-item-type="${i.id}"
                  style="padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;">
            <option value="serialized">Serialized</option>
            <option value="bulk">Bulk</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Location</label>
          ${locations.length
            ? _recvLocHtml(`${i.id}`, `data-item-loc="${i.id}"`)
            : `<input type="text" placeholder="e.g. A>01>01" data-item-loc="${i.id}"
                 style="width:120px;padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;">`
          }
        </div>
      </div>
    </div>`).join('')}`;
  document.getElementById('receive-items').innerHTML=html;
  if(locations.length) items.forEach(i=>_recvLocInit(`${i.id}`));
  document.getElementById('receive-confirm-btn').textContent='Next →';
  document.getElementById('receive-confirm-btn').onclick=advanceReceive;
}

// Dropshipped units never get a location, so the per-line Location pickers are
// switched off rather than silently ignored.
function toggleRecvDropship(){
  const on=!!document.getElementById('recv-dropship')?.checked;
  const fields=document.getElementById('recv-dropship-fields');
  if(fields) fields.style.display=on?'block':'none';
  document.querySelectorAll('#receive-items [data-item-loc]').forEach(el=>{
    el.disabled=on;
    const wrap=el.closest('div');
    if(wrap) wrap.style.opacity=on?'0.35':'';
  });
  if(on) document.getElementById('recv-ds-recipient')?.focus();
}

function advanceReceive(){
  const qtyInputs=document.querySelectorAll('#receive-items input[data-item-id]');
  const typeSelects=document.querySelectorAll('#receive-items select[data-item-type]');
  receiveQtyMap={};
  qtyInputs.forEach(inp=>{
    const id=inp.dataset.itemId;
    const qty=Math.max(0,parseInt(inp.value)||0);
    const typeEl=[...typeSelects].find(s=>s.dataset.itemType===id);
    const locEl=document.querySelector(`[data-item-loc="${id}"]`);
    const type=typeEl?typeEl.value:'serialized';
    const location=locEl?locEl.value.trim():'';
    if(qty>0) receiveQtyMap[id]={qty, type, location};
  });
  if(!Object.keys(receiveQtyMap).length){ closeReceiveModal(); return; }
  const dsOn=!!document.getElementById('recv-dropship')?.checked;
  if(dsOn){
    const po=orders.find(o=>o.poNumber===currentPONum);
    const recipient=(document.getElementById('recv-ds-recipient')?.value||'').trim();
    const dest=(document.getElementById('recv-ds-dest')?.value||'').trim();
    // The release record is the only proof of who took delivery — don't write a
    // deployment with nobody's name on it.
    if(!recipient){ toast('Dropship: enter who took delivery on site','error'); return; }
    if(!dest){ toast('Dropship: enter a destination','error'); return; }
    receiveDropship={on:true, recipient, dest, projId:po?po.projectId||'':'', notes:''};
  } else {
    receiveDropship={on:false, recipient:'', dest:'', projId:'', notes:''};
  }
  const needsSerials=Object.values(receiveQtyMap).some(v=>v.type==='serialized');
  if(needsSerials){ renderReceiveStage2(); }
  else { finalizeReceive({}); }
}

function renderReceiveStage2(){
  const po=orders.find(o=>o.poNumber===currentPONum);
  let html=`<div style="font-size:11px;font-weight:600;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Step 2 — Serial Numbers</div>`;
  for(const [id, {qty, type}] of Object.entries(receiveQtyMap)){
    if(type!=='serialized') continue;
    const item=orderItems.find(i=>i.id===id); if(!item) continue;
    html+=`<div style="padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${escHtml(item.manufacturer)} ${escHtml(item.model)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${Array.from({length:qty},(_,n)=>`
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="font-size:11px;color:var(--text-dim);min-width:50px;">Unit ${n+1}</label>
            <input type="text" placeholder="Serial number (optional)"
                   data-serial-item="${id}" data-serial-idx="${n}"
                   onkeydown="if(event.key==='Enter'){event.preventDefault();const all=document.querySelectorAll('#receive-items input[data-serial-item]');const idx=Array.from(all).indexOf(this);if(all[idx+1])all[idx+1].focus();}"
                   style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;">
            <button class="scan-btn" title="Scan barcode" onclick="openScanner(this.previousElementSibling)">⊡</button>
            ${locations.length
              ? _recvLocHtml(`${id}-u${n}`, `data-loc-item="${id}" data-loc-idx="${n}"`)
              : `<input type="text" placeholder="Location"
                   data-loc-item="${id}" data-loc-idx="${n}"
                   value="${escHtml(receiveQtyMap[id]?.location||'')}"
                   style="width:120px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-ui);font-size:12px;color:var(--text);outline:none;">`
            }
          </div>`).join('')}
      </div>
    </div>`;
  }
  document.getElementById('receive-items').innerHTML=html;
  // Init cascading location pickers with the stage-1 location pre-selected
  if(locations.length){
    for(const [id, {qty, type}] of Object.entries(receiveQtyMap)){
      if(type!=='serialized') continue;
      const presel=receiveQtyMap[id]?.location||'';
      for(let n=0;n<qty;n++) _recvLocInit(`${id}-u${n}`, presel);
    }
  }
  // Auto-focus first serial field for scanning
  setTimeout(()=>{ const first=document.querySelector('#receive-items input[data-serial-item]'); if(first) first.focus(); },50);
  // Switch confirm button to finalize
  const btn=document.getElementById('receive-confirm-btn');
  btn.textContent='Confirm Receipt';
  btn.onclick=()=>{
    const serials={}, locs={};
    document.querySelectorAll('#receive-items input[data-serial-item]').forEach(inp=>{
      const id=inp.dataset.serialItem;
      if(!serials[id]) serials[id]=[];
      serials[id].push(inp.value.trim());
    });
    document.querySelectorAll('#receive-items [data-loc-item]').forEach(inp=>{
      const id=inp.dataset.locItem;
      if(!locs[id]) locs[id]=[];
      locs[id].push(inp.value.trim());
    });
    finalizeReceive(serials, locs);
  };
}

// Links a new inventory record ID to the matching scope item's inventoryIds[].
// "Filled" is derived from these links at render time (getScopeItemFilled), so nothing else to update.
function linkInvToScope(projectId, orderItem, invId){
  const scopeItem = projectItems.find(si=>
    si.projectId===projectId && _itemMatch(si, orderItem)
  );
  if(!scopeItem) return;
  if(!scopeItem.inventoryIds) scopeItem.inventoryIds=[];
  if(!scopeItem.inventoryIds.includes(invId)) scopeItem.inventoryIds.push(invId);
  // A freshly linked unit is filled, so it can't also be "unfilled".
  if(Array.isArray(scopeItem.unfilledIds)) scopeItem.unfilledIds=scopeItem.unfilledIds.filter(id=>id!==invId);
}

function finalizeReceive(serials, locs={}){
  const po=orders.find(o=>o.poNumber===currentPONum); if(!po) return;
  const now=new Date();
  const today=now.toLocaleDateString('en-US');
  const dateTimeStamp=now.toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});

  // Detect if this is a Shop-Stock PO
  const isShopStock = po.projectName && po.projectName.trim().toLowerCase() === 'shop-stock';

  const touchedInvIds = new Set(); // track all inventory records created or updated

  // Dropship: units are born Deployed and are recorded on a release rather than
  // landing on a shelf. The deployment header is created once for the whole receive.
  const dropship=!!receiveDropship.on;
  const dep=dropship?_createDeployment({
    recipient:receiveDropship.recipient,
    destination:receiveDropship.dest,
    projectId:receiveDropship.projId||po.projectId||'',
    notes:`Dropshipped on PO ${currentPONum}`}):null;

  // Every inventory record must carry a catalog SKU — receiving is the last gate
  // before one exists. Check every line first, so an unidentifiable one aborts the
  // whole receive instead of leaving half the shipment booked in.
  const needSku=Object.keys(receiveQtyMap)
    .map(id=>orderItems.find(i=>i.id===id)).filter(it=>it&&!it.sku);
  const unidentified=needSku.filter(it=>!(it.manufacturer||'').trim()||!(it.model||'').trim());
  if(unidentified.length){
    toast(`Cannot receive — no manufacturer/model on: ${unidentified.map(it=>it.description||it.model||'(blank line)').join(', ')}. Add these to the pricebook first.`,'error');
    return;
  }
  needSku.forEach(it=>{
    it.sku=ensureCatalogSku({manufacturer:it.manufacturer, model:it.model,
      category:it.category, unitCost:it.unitCost});
    dbSave('orderItems', it);
  });

  for(const [id, {qty, type, location}] of Object.entries(receiveQtyMap)){
    const item=orderItems.find(i=>i.id===id); if(!item) continue;
    item.qtyReceived=Math.min(item.qtyOrdered, item.qtyReceived+qty);
    item.dateReceived=dateTimeStamp;
    const itemSerials=serials[id]||[];
    const itemLocs=locs[id]||[];

    // Shop-Stock items always go to location 'Stock' with On Hand status.
    // A dropship overrides both: it has no location, and it is already deployed.
    const finalLocation = dropship ? '' : isShopStock ? 'Stock' : location;
    const finalStatus   = dropship ? 'Deployed' : isShopStock ? 'On Hand' : (po.projectId ? 'Allocated' : 'In Stock');

    // Resolve locationId from locations table
    const locRecord = locations.find(l=>l.code===finalLocation||l.id===finalLocation);
    const finalLocationId = locRecord?locRecord.id:'';

    // Determine invStatus based on destination type
    const finalInvStatus = dropship ? 'Deployed'
      : isShopStock ? 'In Stock'
      : locRecord&&locRecord.type==='staging' ? 'Staged'
      : po.projectId ? 'Allocated'
      : 'In Stock';

    if(type==='bulk'){
      // A dropship is its own release — it must not be folded into an existing
      // on-hand stack, which would put deployed units back on a shelf.
      const existing=dropship?null:inventory.find(inv=>
        inv.sku===item.sku&&inv.manufacturer===item.manufacturer&&
        inv.model===item.model&&inv.type==='bulk'&&
        (isShopStock?inv.location==='Stock':inv.projectId===(po.projectId||''))
      );
      if(existing){
        existing.qty+=qty;
        existing.lastUpdated=today;
        if(!isShopStock && finalLocation) existing.location=finalLocation;
        if(finalLocationId) existing.locationId=finalLocationId;
        if(finalInvStatus) existing.invStatus=finalInvStatus;
        syncStockStatus(existing);
        touchedInvIds.add(existing.id);
        // Link to scope item
        if(!isShopStock && po.projectId) linkInvToScope(po.projectId, item, existing.id);
      } else {
        const newId=uid();
        const rec={
          id:newId, sku:item.sku,
          manufacturer:item.manufacturer, model:item.model, category:item.category||'',
          type:'bulk', qty, serial:'', par:0,
          location:finalLocation, locationId:finalLocationId,
          condition:'New',
          status:finalStatus,
          invStatus:finalInvStatus,
          project:isShopStock?'':(po.projectName||''),
          projectId:isShopStock?'':(po.projectId||''),
          poNumber:currentPONum,
          notes:dropship?`From PO ${currentPONum} — dropshipped to site`:`From PO ${currentPONum}`,
          dateAdded:today, lastUpdated:today,
        };
        inventory.push(rec);
        touchedInvIds.add(newId);
        if(dropship) _addDeploymentItem(dep, rec, qty);
        if(!isShopStock && po.projectId) linkInvToScope(po.projectId, item, newId);
      }
    } else {
      for(let n=0;n<qty;n++){
        const unitLoc=dropship?'':(itemLocs[n]||finalLocation||'');
        const unitLocRec=unitLoc!==finalLocation?locations.find(l=>l.code===unitLoc||l.id===unitLoc):locRecord;
        const unitLocId=dropship?'':(unitLocRec?unitLocRec.id:finalLocationId);
        const unitInvStatus=dropship?'Deployed'
          :unitLocRec&&unitLocRec.type==='staging'?'Staged'
          :po.projectId?'Allocated':'In Stock';
        const newId=uid();
        const rec={
          id:newId, sku:item.sku,
          manufacturer:item.manufacturer, model:item.model, category:item.category||'',
          type:'serialized', qty:1, serial:itemSerials[n]||'', par:0,
          location:unitLoc, locationId:unitLocId,
          condition:'New',
          status:finalStatus,
          invStatus:unitInvStatus,
          project:isShopStock?'':(po.projectName||''),
          projectId:isShopStock?'':(po.projectId||''),
          poNumber:currentPONum,
          notes:dropship?`From PO ${currentPONum} — dropshipped to site`:`From PO ${currentPONum}`,
          dateAdded:today, lastUpdated:today,
        };
        inventory.push(rec);
        touchedInvIds.add(newId);
        if(dropship) _addDeploymentItem(dep, rec, 1);
        if(!isShopStock && po.projectId) linkInvToScope(po.projectId, item, newId);
      }
    }
  }

  // Update PO status
  const items=orderItems.filter(i=>i.poNumber===currentPONum);
  const allReceived=items.every(i=>i.qtyReceived>=i.qtyOrdered);
  const anyReceived=items.some(i=>i.qtyReceived>0);
  const anyOutstanding=items.some(i=>i.qtyReceived<i.qtyOrdered);
  po.status=allReceived?'Received':(anyReceived&&anyOutstanding)?'Backorder':'Submitted';

  // Persist all changes to DB
  Object.keys(receiveQtyMap).forEach(id=>{
    const item=orderItems.find(i=>i.id===id);
    if(item) dbSave('orderItems', item);
  });
  dbSave('orders', po);
  touchedInvIds.forEach(id=>{ const inv=inventory.find(i=>i.id===id); if(inv) dbSave('inventory',inv); });
  if(po.projectId){
    projectItems.filter(si=>si.projectId===po.projectId).forEach(si=>dbSave('projectItems', si));
  }

  closeReceiveModal();
  setDirty(true); updateInvStats(); renderInvTable(); renderOrdersTable(); updateOrdersStats(); openOrder(currentPONum);
  const recvPO=orders.find(o=>o.poNumber===currentPONum);
  if(recvPO&&recvPO.projectId) refreshProjectDetail(recvPO.projectId);
  renderStockTable();
  if(dropship){
    if(typeof updateDeployBadge==='function') updateDeployBadge();
    toast(`Received and deployed to ${receiveDropship.dest} — release recorded`,'success');
    if(confirm('Dropship received and deployed. Print the release manifest now?')) exportDeployManifest(dep.id);
  } else {
    toast('Items received and added to inventory','success');
  }
}

function closeReceiveModal(){
  document.getElementById('receive-modal').style.display='none';
  receiveStage=1; receiveQtyMap={};
  receiveDropship={on:false, recipient:'', dest:'', projId:'', notes:''};
  const btn=document.getElementById('receive-confirm-btn');
  if(btn){ btn.textContent='Next →'; btn.onclick=advanceReceive; }
}

// ── PDF IMPORT ──
function importPDFs(e){
  const files=[...e.target.files]; if(!files.length) return;
  e.target.value='';
  pendingPDFImport=[];

  document.getElementById('pdf-review-body').innerHTML=`
    <div style="padding:40px;text-align:center;color:var(--text-muted);">
      <div style="font-size:28px;margin-bottom:12px">📄</div>
      <div style="font-size:14px;font-weight:600">Reading PDFs...</div>
      <div id="pdf-progress" style="font-size:12px;color:var(--text-dim);margin-top:8px">0 of ${files.length} processed</div>
    </div>`;
  document.getElementById('pdf-modal').style.display='flex';

  let done=0;
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      parsePDFWithPDFJS(ev.target.result, file.name).then(parsed=>{
        pendingPDFImport.push(parsed);
        done++;
        const prog=document.getElementById('pdf-progress');
        if(prog) prog.textContent=`${done} of ${files.length} processed`;
        if(done===files.length) showPDFReview();
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

async function parsePDFWithPDFJS(arrayBuffer, filename){
  const fnMatch=filename.match(/^(\d+)/);
  const poNum=fnMatch?fnMatch[1]:'';
  const fnProjName=filename.match(/^\d+_(.+?)\.pdf$/i)?.[1]||'';

  // Load PDF.js from CDN
  if(!window.pdfjsLib){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.integrity='sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
      s.crossOrigin='anonymous';
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
  const page=await pdf.getPage(1);
  const content=await page.getTextContent();

  // Get all text items with their x,y positions
  const items=content.items.map(i=>({
    text:i.str, x:Math.round(i.transform[4]), y:Math.round(i.transform[5])
  })).filter(i=>i.text.trim());

  // Group by y position (same line = within 4px)
  const lines=[];
  for(const item of items){
    const existing=lines.find(l=>Math.abs(l.y-item.y)<=4);
    if(existing){ existing.parts.push(item); existing.parts.sort((a,b)=>a.x-b.x); }
    else lines.push({y:item.y, parts:[item]});
  }
  lines.sort((a,b)=>b.y-a.y); // top to bottom

  const getText=line=>line.parts.map(p=>p.text).join(' ').trim();
  const allText=lines.map(getText);

  // Extract fields
  let vendor='', date='', shipment='', projName=fnProjName;

  for(let i=0;i<allText.length;i++){
    const t=allText[i];
    if(t==='Vendor:' && allText[i+1]) vendor=allText[i+1].trim();
    if(t.startsWith('Date:') && t.length>5) date=t.replace('Date:','').trim();
    if(t==='Date:' && allText[i+1]) date=allText[i+1].trim();
    if(t.startsWith('Shipment Preference:') && t.length>20) shipment=t.replace('Shipment Preference:','').trim();
    if(t.startsWith('Vendor Reference No.:') && t.length>21) projName=t.replace('Vendor Reference No.:','').trim();
    if(t==='Vendor Reference No.:' && allText[i+1]) projName=allText[i+1].trim();
    if(t==='Terms:' && allText[i+1] && !projName) projName=allText[i+1].trim();
  }

  // Parse line items: find rows that have a price column
  // Strategy: find lines that contain both item text (left) and $price (right)
  // In the PDF, item text is at x<300, price columns at x>400
  const poItems=[];
  const priceLines=lines.filter(l=>{
    const rightParts=l.parts.filter(p=>p.x>400);
    return rightParts.some(p=>/^\$[\d,]+\.\d{2}$/.test(p.text));
  });

  for(const line of priceLines){
    const leftParts=line.parts.filter(p=>p.x<350);
    const rightParts=line.parts.filter(p=>p.x>400);
    if(!leftParts.length) continue;
    const itemText=leftParts.map(p=>p.text).join(' ').trim();
    // Skip summary rows
    if(['Price:','Total Price:','Terms:'].some(s=>itemText.includes(s))) continue;
    if(!itemText || itemText.length<3) continue;

    // Find qty — usually middle column x 350-450 or small number in left area
    const qtyParts=line.parts.filter(p=>p.x>=300&&p.x<=430);
    const qtyText=qtyParts.map(p=>p.text).join(' ').replace(/EA/,'').trim();
    const qty=parseInt(qtyText)||1;

    // First $ value in right column = unit price
    const prices=rightParts.filter(p=>/^\$[\d,]+\.\d{2}$/.test(p.text));
    const price=prices.length?parseFloat(prices[0].text.replace(/[$,]/g,'')):0;

    const pbMatch=matchPricebook(itemText);
    poItems.push({
      rawName:itemText, qty, price,
      sku:pbMatch?pbMatch.sku:'',
      manufacturer:pbMatch?pbMatch.manufacturer:'',
      model:pbMatch?pbMatch.model:itemText,
      description:'',
      matched:!!pbMatch, confidence:pbMatch?pbMatch.confidence:0,
      _pendingMfg:'', _pendingModel:'', _pendingCat:'',
    });
  }

  const matchedProj=projects.find(p=>p.name.toLowerCase()===projName.toLowerCase());
  return {poNumber:poNum, vendor, date, shipment, projName, matchedProjId:matchedProj?matchedProj.id:'', items:poItems};
}

function matchPricebook(rawName){
  // Try exact SKU match first
  const skuMatch=rawName.match(/\b([A-Z]{2,3}-[A-Z0-9]{2,4}-\d{4})\b/);
  if(skuMatch){ const r=catalog.find(c=>c.sku===skuMatch[1]); if(r) return {...r,confidence:100}; }
  // Try matching model number (last word or part number pattern)
  const words=rawName.trim().split(/\s+/);
  // Score each catalog entry
  let best=null, bestScore=0;
  for(const r of catalog){
    let score=0;
    const modelLower=r.model.toLowerCase();
    const mfgLower=r.manufacturer.toLowerCase();
    const rawLower=rawName.toLowerCase();
    if(rawLower.includes(modelLower)&&modelLower.length>4) score+=60;
    if(rawLower.includes(mfgLower)&&mfgLower.length>3) score+=30;
    // Word overlap
    const modelWords=r.model.toLowerCase().split(/\s+/);
    const matchWords=modelWords.filter(w=>w.length>3&&rawLower.includes(w));
    score+=matchWords.length*10;
    if(score>bestScore&&score>=40){ bestScore=score; best={...r,confidence:Math.min(score,99)}; }
  }
  return best;
}

function showPDFReview(){
  const body=document.getElementById('pdf-review-body');
  body.innerHTML=pendingPDFImport.map((po,pi)=>{
    const projOptions=projects.map(p=>`<option value="${escHtml(p.id)}"${p.id===po.matchedProjId?' selected':''}>${escHtml(p.name)} (${escHtml(p.id)})</option>`).join('');
    const itemsHtml=po.items.map((item,ii)=>{
      const confColor=item.confidence>=80?'var(--accent3)':item.confidence>=50?'var(--warn)':'var(--accent4)';
      const confLabel=item.confidence>=80?'Good match':item.confidence>=50?'Partial match':'No match';
      return `<div style="padding:10px 12px;background:var(--surface2);border-radius:6px;margin-bottom:6px;border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:2px">Parsed:</div>
            <div style="font-size:12px;font-weight:600">${escHtml(item.rawName)}</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Qty: ${item.qty} · $${item.price.toFixed(2)}</div>
          <div style="font-size:11px;padding:3px 8px;border-radius:4px;background:${item.matched?'rgba(79,247,160,0.1)':'rgba(247,79,126,0.1)'};color:${confColor};">${confLabel}${item.confidence?` (${item.confidence}%)`:''}</div>
        </div>
        ${item.matched?`
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent)">${escHtml(item.sku)}</span>
            <span style="font-size:12px">${escHtml(item.manufacturer)} — ${escHtml(item.model)}</span>
            <button onclick="unmatchPDFItem(${pi},${ii})" style="background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Change</button>
          </div>` :
          `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:0 0 160px;display:flex;flex-direction:column;gap:3px;">
              <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Manufacturer</label>
              <input class="plain-input" id="pmfg-${pi}-${ii}" type="text" placeholder="Manufacturer" style="font-size:12px;padding:6px 10px;" oninput="updatePDFItem(${pi},${ii})">
            </div>
            <div style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:3px;">
              <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Model</label>
              <input class="plain-input" id="pmod-${pi}-${ii}" type="text" value="${escHtml(item.model)}" style="font-size:12px;padding:6px 10px;" oninput="updatePDFItem(${pi},${ii})">
            </div>
            <div style="flex:0 0 150px;display:flex;flex-direction:column;gap:3px;">
              <label style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Category</label>
              <input class="plain-input" id="pcat-${pi}-${ii}" type="text" placeholder="Category" style="font-size:12px;padding:6px 10px;" oninput="updatePDFItem(${pi},${ii})">
            </div>
            <button onclick="addToPricebookFromPDF(${pi},${ii})" style="padding:7px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Add to Pricebook</button>
          </div>`
        }
      </div>`;
    }).join('');

    return `<div style="background:var(--surface2);border:1px solid var(--border-bright);border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent)">PO ${escHtml(po.poNumber)}</span>
        <span style="font-size:13px;font-weight:600">${escHtml(po.vendor)}</span>
        <span style="font-size:12px;color:var(--text-muted)">${escHtml(po.date)}</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
          <label style="font-size:10px;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase">Project:</label>
          <select id="pproj-${pi}" style="background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:4px 8px;font-family:var(--font-ui);font-size:12px;outline:none;">
            <option value="">— No project —</option>
            ${projOptions}
          </select>
        </div>
      </div>
      ${itemsHtml}
    </div>`;
  }).join('');
  document.getElementById('pdf-modal').style.display='flex';
}

function unmatchPDFItem(pi,ii){
  pendingPDFImport[pi].items[ii].matched=false;
  pendingPDFImport[pi].items[ii].sku='';
  pendingPDFImport[pi].items[ii].manufacturer='';
  pendingPDFImport[pi].items[ii].confidence=0;
  showPDFReview();
}

function updatePDFItem(pi,ii){
  const mfg=document.getElementById(`pmfg-${pi}-${ii}`)?.value.trim()||'';
  const mod=document.getElementById(`pmod-${pi}-${ii}`)?.value.trim()||'';
  const cat=document.getElementById(`pcat-${pi}-${ii}`)?.value.trim()||'';
  pendingPDFImport[pi].items[ii]._pendingMfg=mfg;
  pendingPDFImport[pi].items[ii]._pendingModel=mod;
  pendingPDFImport[pi].items[ii]._pendingCat=cat;
}

function addToPricebookFromPDF(pi,ii){
  const item=pendingPDFImport[pi].items[ii];
  const mfg=(document.getElementById(`pmfg-${pi}-${ii}`)?.value||item._pendingMfg).trim();
  const mod=(document.getElementById(`pmod-${pi}-${ii}`)?.value||item._pendingModel||item.rawName).trim();
  const cat=(document.getElementById(`pcat-${pi}-${ii}`)?.value||item._pendingCat).trim();
  if(!mfg||!mod){ toast('Manufacturer and Model are required','error'); return; }
  // Check duplicate
  if(catalog.find(r=>r.manufacturer===mfg&&r.model===mod)){
    // Already exists — just link it
    const existing=catalog.find(r=>r.manufacturer===mfg&&r.model===mod);
    item.matched=true; item.sku=existing.sku; item.manufacturer=mfg; item.model=mod; item.confidence=100;
    showPDFReview(); return;
  }
  // Generate SKU
  const sku=generateSku(cat, mfg);
  const newItem={sku,manufacturer:mfg,model:mod,category:cat,subcategory:'',url:'',shortDesc:'',longDesc:'',msrp:item.price,unitCost:item.price,unitPrice:item.price};
  catalog.push(newItem);
  dbSave('catalog', newItem);
  catalog.sort((a,b)=>a.manufacturer.localeCompare(b.manufacturer)||a.model.localeCompare(b.model));
  if(!manufacturers.includes(mfg)){ manufacturers.push(mfg); manufacturers.sort((a,b)=>a.localeCompare(b)); }
  if(!modelsByMfg[mfg]) modelsByMfg[mfg]=[];
  modelsByMfg[mfg].push({model:mod,sku,category:cat});
  if(cat&&!categories.includes(cat)){ categories.push(cat); categories.sort((a,b)=>a.localeCompare(b)); }
  item.matched=true; item.sku=sku; item.manufacturer=mfg; item.model=mod; item.confidence=100;
  setDirty(true); updatePBStats();
  toast(`Added ${sku} to Pricebook`,'success');
  showPDFReview();
}

function confirmPDFImport(){
  let imported=0;
  pendingPDFImport.forEach((po,pi)=>{
    if(orders.find(o=>o.poNumber===po.poNumber)){ return; } // skip dupes
    const selProj=document.getElementById(`pproj-${pi}`)?.value||po.matchedProjId||'';
    const proj=projects.find(p=>p.id===selProj);
    const newOrder={
      poNumber:po.poNumber, vendor:po.vendor,
      projectId:proj?proj.id:'', projectName:proj?proj.name:po.projName,
      status:'Submitted', date:po.date, shipment:po.shipment,
      totalValue:po.items.reduce((s,i)=>s+(i.qty*i.price),0),
      notes:'',
    };
    orders.push(newOrder);
    dbSave('orders', newOrder);
    po.items.forEach(item=>{
      const newItem={
        id:uid(), poNumber:po.poNumber,
        sku:item.sku, manufacturer:item.manufacturer||item.rawName,
        model:item.model||item.rawName, description:'',
        category:'', qtyOrdered:item.qty, qtyReceived:0,
        unitCost:item.price, notes:'',
      };
      orderItems.push(newItem);
      dbSave('orderItems', newItem);
    });
    imported++;
  });
  closePDFModal();
  setDirty(true); updateOrdersStats(); renderOrdersTable();
  // Refresh any projects that got new POs
  const affectedProjects=[...new Set(pendingPDFImport.map(po=>po.matchedProjId).filter(Boolean))];
  affectedProjects.forEach(pid=>refreshProjectDetail(pid));
  toast(`Imported ${imported} PO${imported!==1?'s':''}. Status: Submitted — use Receive Shipment to add items to inventory.`,'success');
}

function closePDFModal(){ document.getElementById('pdf-modal').style.display='none'; pendingPDFImport=[]; }

// ═══════════════════════════════════════════════
// NEW PO FROM PROJECT
// ═══════════════════════════════════════════════

function openNewPOFromProject(projectId){
  const proj=projects.find(p=>p.id===projectId); if(!proj) return;
  currentNPOProjectId=projectId;
  npoItems=[]; _npoScopeDiscMode={};
  resetNPOCosts();
  document.getElementById('new-po-proj-label').textContent=proj.name;
  document.getElementById('npo-num').value=nextPONumber();
  document.getElementById('npo-vendor').value='';
  document.getElementById('npo-date').valueAsDate=new Date();
  document.getElementById('npo-ship').value='Ground';
  document.getElementById('npo-status').value='Submitted';
  document.getElementById('npo-notes').value='';
  document.getElementById('npo-confirm-btn').disabled=true;
  npoInitShipAddr();
  setNPOMode('pb');
  npoRenderItems();
  npoUpdateTotal();

  // Populate scope picker — exclude units already filled OR still inbound on an existing PO.
  // Coverage = filled + openOnPO (ordered − received); a received-then-unfilled unit reappears.
  const scopeItems = projectItems
    .filter(i=>i.projectId===projectId)
    .map(i=>{
      const filled=getScopeItemFilled(i);
      const openOnPO=getScopeItemOpenOnPO(projectId,i);
      return {...i,_remaining:Math.max(0,(i.qty||0)-filled-openOnPO),_openOnPO:openOnPO,_filled:filled};
    })
    .filter(i=>i._remaining>0);
  const picker = document.getElementById('npo-scope-picker');
  const list = document.getElementById('npo-scope-list');
  if(scopeItems.length){
    picker.style.display='block';
    list.innerHTML = scopeItems.map(i=>{
      const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<div id="npo-sc-row-${i.id}" style="display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--border);transition:background 0.1s;">
        <input type="checkbox" id="npo-sc-${i.id}" data-scope-id="${i.id}"
          onchange="npoScopeRowToggle('${sk(i.id)}')"
          style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;">
        <label for="npo-sc-${i.id}" style="flex:1;cursor:pointer;">
          <span style="font-size:13px;">${escHtml(i.manufacturer)} ${escHtml(i.model)}</span>
          ${i.sku?`<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-left:8px;">${escHtml(i.sku)}</span>`:''}
          <span style="font-size:11px;color:var(--text-dim);margin-left:6px;">need: ${i._remaining}${i._openOnPO>0?` (${i._openOnPO} on PO)`:''}${i._filled>0?` (${i._filled} filled)`:''}</span>
        </label>
        <div style="display:flex;align-items:center;gap:6px;">
          <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">Qty</label>
          <input type="number" id="npo-sc-qty-${i.id}" value="${i._remaining}" min="1"
            oninput="npoCheckReady()"
            style="width:58px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;">
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">Unit Cost $</label>
          <input type="number" id="npo-sc-price-${i.id}" value="${i.unitCost>0?parseFloat(i.unitCost).toFixed(2):''}" min="0" step="0.01" placeholder="0.00"
            oninput="npoCheckReady()"
            style="width:90px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;">
        </div>
        <div style="display:flex;align-items:center;gap:4px;" title="Discount">
          <button id="npo-sc-disc-btn-${i.id}" onclick="npoToggleScopeDiscMode('${sk(i.id)}')" style="padding:2px 6px;font-size:11px;font-weight:700;min-width:28px;border-radius:4px;background:var(--surface3);border:1px solid var(--border);color:var(--accent4);cursor:pointer;">$</button>
          <input type="number" id="npo-sc-disc-${i.id}" value="" min="0" step="0.01" placeholder="0"
            oninput="npoCheckReady()"
            style="width:72px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--accent4);outline:none;text-align:right;">
        </div>
      </div>`;
    }).join('');
  } else {
    picker.style.display='none';
    list.innerHTML='';
  }

  document.getElementById('new-po-modal').style.display='flex';
  setTimeout(()=>{const el=document.getElementById('npo-num');el.focus();el.select();},100);
}

function npoScopeRowToggle(id){
  const cb=document.getElementById('npo-sc-'+id);
  const row=document.getElementById('npo-sc-row-'+id);
  if(row) row.style.background=cb&&cb.checked?'var(--accent-glow)':'';
  npoCheckReady();
}

function npoScopeToggle(){ npoCheckReady(); }

function closeNewPOModal(){
  document.getElementById('new-po-modal').style.display='none';
  const picker=document.getElementById('npo-scope-picker');
  if(picker) picker.style.display='none';
  const list=document.getElementById('npo-scope-list');
  if(list) list.innerHTML='';
  npoItems=[]; _npoScopeDiscMode={};
  currentNPOProjectId=null;
  resetNPOCosts();
  resetNPOPBForm();
}

function confirmNewPO(another=false){
  const num=document.getElementById('npo-num').value.trim();
  const vendor=document.getElementById('npo-vendor').value.trim();
  if(!num||!vendor){ toast('PO Number and Vendor are required','error'); return; }
  if(orders.find(o=>o.poNumber===num)){ toast(`PO ${num} already exists`,'error'); return; }

  // Collect checked scope items
  const allItems=[...npoItems];
  const updatedScopeIds=new Set();
  document.querySelectorAll('#npo-scope-list input[type=checkbox]:checked').forEach(cb=>{
    const id=cb.dataset.scopeId;
    const scopeItem=projectItems.find(i=>i.id===id); if(!scopeItem) return;
    const qty=Math.max(1,parseInt(document.getElementById('npo-sc-qty-'+id)?.value)||1);
    const price=parseFloat(document.getElementById('npo-sc-price-'+id)?.value)||0;
    const discRaw=parseFloat(document.getElementById('npo-sc-disc-'+id)?.value)||0;
    const disc=(_npoScopeDiscMode[id]||'$')==='%'?discRaw/100*(qty*price):discRaw;
    allItems.push({
      id:uid(), sku:scopeItem.sku,
      manufacturer:scopeItem.manufacturer, model:scopeItem.model,
      description:'', category:scopeItem.category||'',
      qty, unitCost:price, discount:disc, isManual:false,
    });
    scopeItem.itemStatus='On PO';
    updatedScopeIds.add(scopeItem.id);
  });

  if(!allItems.length){ toast('Add at least one item to the PO','error'); return; }

  const proj=projects.find(p=>p.id===currentNPOProjectId);
  const total=allItems.reduce((s,i)=>s+(i.qty*i.unitCost),0);
  const itemDiscountTotal=allItems.reduce((s,i)=>s+npoItemDiscountAmt(i),0);
  const newPO={
    poNumber:num, vendor, vendorId:resolveVendorId(vendor),
    projectId:currentNPOProjectId||'',
    projectName:proj?proj.name:'',
    status:document.getElementById('npo-status').value,
    date:document.getElementById('npo-date').value,
    shipment:document.getElementById('npo-ship').value.trim(),
    totalValue:total,
    itemDiscountTotal,
    shipAddress:document.getElementById('npo-ship-addr').value.trim(),
    tax:npoGetAmount('tax'),
    tariff:npoGetAmount('tariff'),
    shipping:npoGetAmount('shipping'),
    discount:npoGetAmount('discount'),
    otherCharges:npoCollectOtherCharges(),
    notes:document.getElementById('npo-notes').value.trim(),
  };
  orders.push(newPO);
  dbSave('orders', newPO);
  // Save scope items whose itemStatus changed to 'On PO' (tracked by real scope id above)
  allItems.forEach(item=>{
    const newOI={
      id:uid(), poNumber:num,
      sku:item.sku,
      manufacturer:item.isManual?'':item.manufacturer,
      model:item.isManual?'':item.model,
      description:item.isManual?item.description:'',
      category:item.category||'',
      qtyOrdered:item.qty, qtyReceived:0,
      unitCost:item.unitCost,
      discount:npoItemDiscountAmt(item),
      notes:'',
      dateReceived:'',
    };
    orderItems.push(newOI);
    dbSave('orderItems', newOI);
  });
  projectItems.filter(si=>updatedScopeIds.has(si.id)).forEach(si=>dbSave('projectItems', si));
  setDirty(true); updateOrdersStats(); renderOrdersTable();
  renderProjTable(); updateProjStats();
  const fromProject=currentNPOProjectId;
  if(currentProjectId && currentProjectId===fromProject) refreshProjectDetail(currentProjectId);

  if(another){
    npoItems=[]; _npoScopeDiscMode={};
    const nextNum=nextPONumber();
    document.getElementById('npo-num').value=nextNum;
    document.getElementById('npo-vendor').value='';
    document.getElementById('npo-notes').value='';
    document.getElementById('npo-ship').value='Ground';
    document.getElementById('npo-status').value='Submitted';
    document.getElementById('npo-date').valueAsDate=new Date();
    document.querySelectorAll('#npo-scope-list input[type=checkbox]').forEach(cb=>{
      cb.checked=false;
      const row=document.getElementById('npo-sc-row-'+cb.dataset.scopeId);
      if(row) row.style.background='';
    });
    resetNPOCosts();
    npoRenderItems(); npoUpdateTotal();
    resetNPOPBForm(); setNPOMode('pb');
    npoCheckReady();
    setTimeout(()=>{const el=document.getElementById('npo-num');el.focus();el.select();},50);
    toast(`PO ${num} created — ready for next PO`,'success');
  } else {
    closeNewPOModal();
    toast(`PO ${num} created`,'success');
    if(fromProject && currentProjectId===fromProject){
      setProjDetailTab('pos');
    } else {
      showPage('orders');
      setTimeout(()=>openOrder(num),100);
    }
  }
}

function setNPOMode(mode){
  const isPB=mode==='pb';
  document.getElementById('npo-pb-row').style.display=isPB?'flex':'none';
  document.getElementById('npo-manual-row').style.display=isPB?'none':'flex';
  document.getElementById('npo-mode-pb').style.background=isPB?'var(--accent)':'var(--surface2)';
  document.getElementById('npo-mode-pb').style.color=isPB?'#fff':'var(--text-muted)';
  document.getElementById('npo-mode-manual').style.background=isPB?'var(--surface2)':'var(--accent)';
  document.getElementById('npo-mode-manual').style.color=isPB?'var(--text-muted)':'#fff';
}

function npoCheckReady(){
  const num=document.getElementById('npo-num').value.trim();
  const vendor=document.getElementById('npo-vendor').value.trim();
  const anyChecked=!![...document.querySelectorAll('#npo-scope-list input[type=checkbox]:checked')].length;
  const ok=!!(num&&vendor&&(npoItems.length||anyChecked));
  document.getElementById('npo-confirm-btn').disabled=!ok;
  document.getElementById('npo-another-btn').disabled=!ok;
  // Also update running total to include checked scope items
  npoUpdateTotal();
}

function addNPOPricebookItem(){
  const mfg=acCtx.npo.mfg.selected;
  const model=acCtx.npo.model.selected;
  if(!mfg||!model) return;
  const entry=(modelsByMfg[mfg]||[]).find(m=>m.model===model);
  const qty=Math.max(1,parseInt(document.getElementById('npo-qty').value)||1);
  const price=parseFloat(document.getElementById('npo-price').value)||0;
  npoItems.push({
    id:uid(), sku:entry?entry.sku:'',
    manufacturer:mfg, model, description:'',
    category:entry?entry.category:'',
    qty, unitCost:price, isManual:false,
    discount:0, discountMode:'$',
  });
  npoRenderItems(); npoUpdateTotal(); resetNPOPBForm();
}

function addNPOManualItem(){
  const desc=document.getElementById('npo-manual-desc').value.trim();
  if(!desc){ toast('Description is required','error'); return; }
  const qty=Math.max(1,parseInt(document.getElementById('npo-manual-qty').value)||1);
  const price=parseFloat(document.getElementById('npo-manual-price').value)||0;
  npoItems.push({id:uid(), sku:'', manufacturer:'', model:'', description:desc, category:'', qty, unitCost:price, isManual:true, discount:0, discountMode:'$'});
  npoRenderItems(); npoUpdateTotal();
  document.getElementById('npo-manual-desc').value='';
  document.getElementById('npo-manual-qty').value=1;
  document.getElementById('npo-manual-price').value='';
}

function npoRenderItems(){
  const el=document.getElementById('npo-items-list');
  if(!npoItems.length){
    el.innerHTML=`<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:12px;">No items added yet.</div>`;
    return;
  }
  el.innerHTML=npoItems.map(i=>{
    const label=i.isManual
      ?`<span style="color:var(--text-muted);font-style:italic">${escHtml(i.description)}</span>`
      :`${escHtml(i.manufacturer)} ${escHtml(i.model)}${i.sku?` <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent)">${escHtml(i.sku)}</span>`:''}`;
    const discAmt=npoItemDiscountAmt(i);
    const net=i.qty*i.unitCost-discAmt;
    const lt=net.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    const discVal=i.discount>0?i.discount:'';
    const discMode=i.discountMode||'$';
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;font-size:13px;">${label}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="qty-btn minus" onclick="npoAdjustQty('${i.id}',-1)">-</span>
        <span style="font-family:var(--font-mono);font-size:13px;min-width:20px;text-align:center;">${i.qty}</span>
        <span class="qty-btn plus" onclick="npoAdjustQty('${i.id}',1)">+</span>
      </div>
      <input type="number" value="${i.unitCost}" min="0" step="0.01"
        onchange="npoUpdatePrice('${i.id}',this.value)"
        title="Unit Cost"
        style="width:90px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:right;">
      <div style="display:flex;align-items:center;gap:4px;" title="Discount">
        <button onclick="npoToggleItemMode('${i.id}')" style="padding:2px 6px;font-size:11px;font-weight:700;min-width:28px;border-radius:4px;background:var(--surface3);border:1px solid var(--border);color:var(--accent4);cursor:pointer;">${discMode}</button>
        <input type="number" value="${discVal}" min="0" step="0.01" placeholder="0"
          onchange="npoSetItemDiscount('${i.id}',this.value)"
          title="Discount (${discMode})"
          style="width:70px;padding:4px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:12px;color:var(--accent4);outline:none;text-align:right;">
      </div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent3);min-width:70px;text-align:right;">$${lt}</div>
      <button onclick="npoRemoveItem('${i.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
    </div>`;
  }).join('');
}

function npoAdjustQty(id,delta){
  const item=npoItems.find(i=>i.id===id); if(!item) return;
  item.qty=Math.max(1,item.qty+delta);
  npoRenderItems(); npoUpdateTotal();
}

function npoUpdatePrice(id,val){
  const item=npoItems.find(i=>i.id===id); if(!item) return;
  item.unitCost=parseFloat(val)||0;
  npoUpdateTotal();
}

function npoRemoveItem(id){
  npoItems=npoItems.filter(i=>i.id!==id);
  npoRenderItems(); npoUpdateTotal();
}

function npoUpdateTotal(){
  const fmtN=n=>'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const sub=npoGetSubtotal();
  const tax=npoGetAmount('tax'), tariff=npoGetAmount('tariff'), ship=npoGetAmount('shipping'), disc=npoGetAmount('discount');
  const other=npoGetOtherTotal();
  const grand=sub+tax+tariff+ship-disc+other;
  const amounts={tax,tariff,shipping:ship,discount:disc};
  ['tax','tariff','shipping','discount'].forEach(f=>{
    const calcEl=document.getElementById('npo-'+f+'-calc');
    if(calcEl) calcEl.textContent=_npoCostMode[f]==='%'?'= '+fmtN(amounts[f]):'';
  });
  const subEl=document.getElementById('npo-subtotal');
  if(subEl) subEl.textContent=fmtN(sub);
  document.getElementById('npo-total').textContent=fmtN(grand);
}

function resetNPOPBForm(){
  ['npo-mfg','npo-model','npo-sku'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('npo-qty').value=1;
  document.getElementById('npo-price').value='';
  document.getElementById('npo-model').disabled=true;
  document.getElementById('npo-model').placeholder='Select manufacturer first…';
  acCtx.npo.mfg.selected=acCtx.npo.model.selected=null;
  document.getElementById('npo-add-pb').disabled=true;
}

// ═══════════════════════════════════════════════
// RMAs
// ═══════════════════════════════════════════════



// ── SHIPMENT TRACKING ──

function getItemQtyShipped(orderItemId, excludeShipmentId){
  return shipmentItems
    .filter(si=>si.orderItemId===orderItemId && si.shipmentId!==excludeShipmentId)
    .reduce((s,si)=>s+(parseInt(si.qtyShipped)||0),0);
}

function shipmentTrackingUrl(carrier, trackingNumber){
  if(!trackingNumber) return null;
  const n=encodeURIComponent(trackingNumber.trim());
  switch(carrier){
    case 'UPS':   return `https://www.ups.com/track?tracknum=${n}`;
    case 'FedEx': return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'USPS':  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case 'DHL':   return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
    default:      return null;
  }
}

function renderPOShipments(poNum){
  const list=document.getElementById('po-shipments-list'); if(!list) return;
  const poShipments=shipments.filter(s=>s.poNumber===poNum);
  if(!poShipments.length){
    list.innerHTML=`<div style="font-size:12px;color:var(--text-dim);padding:4px 0;">No shipments logged yet.</div>`;
    return;
  }
  const statusColor={'In Transit':'var(--warn)','Delivered':'var(--accent3)','Exception':'var(--accent4)'};
  list.innerHTML=poShipments.map((s,idx)=>{
    const items=shipmentItems.filter(si=>si.shipmentId===s.id);
    const url=shipmentTrackingUrl(s.carrier,s.trackingNumber);
    const trackHtml=url
      ?`<a href="${escHtml(url)}" target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escHtml(s.trackingNumber)}</a>`
      :`<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${escHtml(s.trackingNumber||'—')}</span>`;
    const itemLines=items.map(si=>{
      const oi=orderItems.find(o=>o.id===si.orderItemId);
      if(!oi) return '';
      const label=oi.description||(oi.model||'');
      return `<span style="font-size:11px;color:var(--text-muted);">${escHtml(label)}: <span style="font-family:var(--font-mono);color:var(--text);">${si.qtyShipped}</span></span>`;
    }).filter(Boolean).join('<span style="color:var(--border-bright);margin:0 6px;">·</span>');
    const sc=statusColor[s.status]||'var(--text-muted)';
    const sk=s.id.replace(/'/g,"\\'");
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;align-items:flex-start;gap:14px;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:700;color:var(--text);">Shipment ${idx+1}</span>
          ${s.carrier?`<span style="font-size:10px;color:var(--text-muted);background:var(--surface3);padding:1px 6px;border-radius:10px;">${escHtml(s.carrier)}</span>`:''}
          <span style="font-size:10px;font-weight:700;color:${sc};">${escHtml(s.status)}</span>
          ${s.estDelivery?`<span style="font-size:10px;color:var(--text-dim);">ETA ${escHtml(s.estDelivery)}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${trackHtml}
          ${itemLines?`<span style="color:var(--border-bright);margin:0 2px;">|</span>${itemLines}`:''}
        </div>
        ${s.notes?`<div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${escHtml(s.notes)}</div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn-del" onclick="openEditShipmentModal('${sk}')" title="Edit">✎</button>
        <button class="btn-del" onclick="deleteShipment('${sk}')" style="color:var(--accent4);border-color:rgba(247,79,126,0.3);" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');
}

let _editShipmentId = null;

function openAddShipmentModal(){
  _editShipmentId = null;
  document.getElementById('shipment-modal-title').textContent='Log Shipment';
  document.getElementById('sm-carrier').value='';
  document.getElementById('sm-tracking').value='';
  document.getElementById('sm-eta').value='';
  document.getElementById('sm-status').value='In Transit';
  document.getElementById('sm-notes').value='';
  smCarrierChange();
  _renderShipmentItemRows(null);
  document.getElementById('shipment-modal').style.display='flex';
}

function openEditShipmentModal(shipmentId){
  const s=shipments.find(x=>x.id===shipmentId); if(!s) return;
  _editShipmentId = shipmentId;
  document.getElementById('shipment-modal-title').textContent='Edit Shipment';
  document.getElementById('sm-carrier').value=s.carrier||'';
  document.getElementById('sm-tracking').value=s.trackingNumber||'';
  document.getElementById('sm-eta').value=s.estDelivery||'';
  document.getElementById('sm-status').value=s.status||'In Transit';
  document.getElementById('sm-notes').value=s.notes||'';
  smCarrierChange();
  _renderShipmentItemRows(shipmentId);
  document.getElementById('shipment-modal').style.display='flex';
}

function closeShipmentModal(){
  document.getElementById('shipment-modal').style.display='none';
  _editShipmentId=null;
}

function smCarrierChange(){
  const carrier=document.getElementById('sm-carrier').value;
  const tracking=document.getElementById('sm-tracking').value.trim();
  const url=shipmentTrackingUrl(carrier,tracking);
  const linkRow=document.getElementById('sm-tracking-link-row');
  const link=document.getElementById('sm-tracking-link');
  if(url && tracking){ linkRow.style.display='block'; link.href=url; }
  else { linkRow.style.display='none'; }
}

function _renderShipmentItemRows(editShipmentId){
  const container=document.getElementById('sm-items-list'); if(!container) return;
  const items=orderItems.filter(i=>i.poNumber===currentPONum);
  if(!items.length){ container.innerHTML=`<div style="font-size:12px;color:var(--text-dim);">No items on this PO.</div>`; return; }
  const existingQtyMap={};
  if(editShipmentId){
    shipmentItems.filter(si=>si.shipmentId===editShipmentId).forEach(si=>{ existingQtyMap[si.orderItemId]=si.qtyShipped; });
  }
  container.innerHTML=items.map(i=>{
    const alreadyShipped=getItemQtyShipped(i.id, editShipmentId);
    const maxQty=Math.max(0, i.qtyOrdered-alreadyShipped);
    const checked=editShipmentId && existingQtyMap[i.id]>0;
    const preQty=existingQtyMap[i.id]||Math.min(maxQty, i.qtyOrdered-i.qtyReceived);
    const label=i.description||(i.manufacturer?`${i.manufacturer} ${i.model}`:i.model);
    const sk=i.id.replace(/'/g,"\\'");
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
      <input type="checkbox" id="sm-chk-${sk}" onchange="smItemToggle('${sk}')" ${checked?'checked':''} style="width:16px;height:16px;flex-shrink:0;cursor:pointer;">
      <div style="flex:1;min-width:0;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(label)}">${escHtml(label)}</div>
      <span style="font-size:10px;color:var(--text-dim);flex-shrink:0;">${alreadyShipped>0?`${alreadyShipped} already logged`:''}</span>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
        <input type="number" id="sm-qty-${sk}" min="1" max="${maxQty}" value="${preQty||1}"
          style="width:56px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);text-align:center;"
          ${!checked?'disabled':''}>
        <span style="font-size:10px;color:var(--text-dim);">/ ${i.qtyOrdered}</span>
      </div>
    </div>`;
  }).join('');
}

function smItemToggle(itemId){
  const chk=document.getElementById(`sm-chk-${itemId}`);
  const qty=document.getElementById(`sm-qty-${itemId}`);
  if(qty) qty.disabled=!chk.checked;
}

function saveShipment(){
  const carrier=document.getElementById('sm-carrier').value;
  const trackingNumber=document.getElementById('sm-tracking').value.trim();
  const estDelivery=document.getElementById('sm-eta').value;
  const status=document.getElementById('sm-status').value;
  const notes=document.getElementById('sm-notes').value.trim();

  const items=orderItems.filter(i=>i.poNumber===currentPONum);
  const selectedItems=items.filter(i=>{
    const chk=document.getElementById(`sm-chk-${i.id}`);
    return chk && chk.checked;
  });
  if(!selectedItems.length){ toast('Select at least one item','error'); return; }

  const shipmentId = _editShipmentId || uid();
  const shipmentRecord={ id:shipmentId, poNumber:currentPONum, carrier, trackingNumber, estDelivery, status, notes };

  if(_editShipmentId){
    const idx=shipments.findIndex(s=>s.id===_editShipmentId);
    if(idx>=0) shipments[idx]=shipmentRecord; else shipments.push(shipmentRecord);
    const oldItemIds=shipmentItems.filter(si=>si.shipmentId===_editShipmentId).map(si=>si.id);
    shipmentItems=shipmentItems.filter(si=>si.shipmentId!==_editShipmentId);
    dbDeleteMany('shipmentItems', oldItemIds);
  } else {
    shipments.push(shipmentRecord);
  }
  dbSave('shipments', shipmentRecord);

  selectedItems.forEach(i=>{
    const qtyEl=document.getElementById(`sm-qty-${i.id}`);
    const qty=Math.max(1, parseInt(qtyEl?.value)||1);
    const siRecord={ id:uid(), shipmentId, orderItemId:i.id, qtyShipped:qty };
    shipmentItems.push(siRecord);
    dbSave('shipmentItems', siRecord);
  });

  const isEdit=!!_editShipmentId;
  closeShipmentModal();
  renderPOShipments(currentPONum);
  renderPOItems(currentPONum);
  toast(isEdit?'Shipment updated':'Shipment logged','success');
}

function deleteShipment(shipmentId){
  if(!confirm('Delete this shipment record?')) return;
  const siIds=shipmentItems.filter(si=>si.shipmentId===shipmentId).map(si=>si.id);
  shipments=shipments.filter(s=>s.id!==shipmentId);
  shipmentItems=shipmentItems.filter(si=>si.shipmentId!==shipmentId);
  dbDelete('shipments', shipmentId);
  dbDeleteMany('shipmentItems', siIds);
  renderPOShipments(currentPONum);
  renderPOItems(currentPONum);
  toast('Shipment deleted','success');
}

// ── UN-RECEIVE ──

let _unreceiveItemId = null;

function _unreceiveInvMatch(inv, item){
  if(item.sku && inv.sku) return inv.sku === item.sku;
  return inv.manufacturer === item.manufacturer && inv.model === item.model;
}

function openUnreceiveModal(orderItemId){
  const item=orderItems.find(i=>i.id===orderItemId); if(!item||!item.qtyReceived) return;
  _unreceiveItemId=orderItemId;
  const label=item.description||(item.manufacturer?`${item.manufacturer} ${item.model}`:item.model);
  document.getElementById('unreceive-item-label').innerHTML=
    `<span style="font-weight:600;">${escHtml(label)}</span><br><span style="font-size:11px;color:var(--text-muted);">${item.qtyReceived} unit${item.qtyReceived!==1?'s':''} received</span>`;
  const qtyInput=document.getElementById('unreceive-qty');
  qtyInput.max=item.qtyReceived;
  qtyInput.value=item.qtyReceived;
  document.getElementById('unreceive-qty-max').textContent=`max ${item.qtyReceived}`;
  const matchingInv=inventory.filter(inv=>inv.poNumber===item.poNumber && _unreceiveInvMatch(inv,item));
  const hasMoved=matchingInv.some(inv=>transfers.some(t=>t.inventoryId===inv.id));
  const warnEl=document.getElementById('unreceive-warning');
  if(hasMoved){
    warnEl.style.display='block';
    warnEl.textContent='⚠ Some of these inventory records have been transferred. Reversing the receipt will still remove them — verify no downstream work depends on them.';
  } else {
    warnEl.style.display='none';
  }
  document.getElementById('unreceive-modal').style.display='flex';
}

function closeUnreceiveModal(){
  document.getElementById('unreceive-modal').style.display='none';
  _unreceiveItemId=null;
}

function confirmUnreceive(){
  const item=orderItems.find(i=>i.id===_unreceiveItemId); if(!item) return;
  const qtyEl=document.getElementById('unreceive-qty');
  const qty=Math.min(item.qtyReceived, Math.max(1, parseInt(qtyEl.value)||1));

  const matchingInv=inventory
    .filter(inv=>inv.poNumber===item.poNumber && _unreceiveInvMatch(inv,item))
    .sort((a,b)=>(b.dateAdded||'').localeCompare(a.dateAdded||''));

  const modifiedScopeIds=new Set();

  if(matchingInv.length && matchingInv[0].type==='bulk'){
    // Bulk: reduce qty on records, newest first
    let remaining=qty;
    for(const inv of matchingInv){
      if(remaining<=0) break;
      const take=Math.min(remaining, inv.qty||0);
      inv.qty=(inv.qty||0)-take;
      remaining-=take;
      if(inv.qty<=0){
        // Remove this record entirely
        projectItems.forEach(si=>{
          if(Array.isArray(si.inventoryIds)&&si.inventoryIds.includes(inv.id)){
            si.inventoryIds=si.inventoryIds.filter(id=>id!==inv.id);
            modifiedScopeIds.add(si.id);
          }
        });
        inventory=inventory.filter(r=>r.id!==inv.id);
        dbDelete('inventory',inv.id);
      } else {
        dbSave('inventory',inv);
      }
    }
  } else {
    // Serialized: delete most recent qty records
    const toRemove=matchingInv.slice(0,qty);
    toRemove.forEach(inv=>{
      projectItems.forEach(si=>{
        if(Array.isArray(si.inventoryIds)&&si.inventoryIds.includes(inv.id)){
          si.inventoryIds=si.inventoryIds.filter(id=>id!==inv.id);
          modifiedScopeIds.add(si.id);
        }
      });
      inventory=inventory.filter(r=>r.id!==inv.id);
      dbDelete('inventory',inv.id);
    });
  }

  // Update order item
  item.qtyReceived=Math.max(0,item.qtyReceived-qty);
  if(item.qtyReceived===0) item.dateReceived='';
  dbSave('orderItems',item);

  // Save modified scope items
  projectItems.filter(si=>modifiedScopeIds.has(si.id)).forEach(si=>dbSave('projectItems',si));

  // Recalculate PO status
  const po=orders.find(o=>o.poNumber===currentPONum);
  if(po){
    const poItems=orderItems.filter(i=>i.poNumber===currentPONum);
    const allRec=poItems.every(i=>i.qtyReceived>=i.qtyOrdered);
    const anyRec=poItems.some(i=>i.qtyReceived>0);
    const anyOut=poItems.some(i=>i.qtyReceived<i.qtyOrdered);
    po.status=allRec?'Received':anyRec&&anyOut?'Backorder':'Submitted';
    dbSave('orders',po);
    if(po.projectId) refreshProjectDetail(po.projectId);
  }

  closeUnreceiveModal();
  renderPOItems(currentPONum);
  renderPOShipments(currentPONum);
  openOrder(currentPONum);
  renderOrdersTable();
  updateOrdersStats();
  toast('Receipt reversed','success');
}

// Serial numbers of the received/filled units behind a PO line item, for the installer
// pick list. Two paths, precise first:
//   1) units the receive flow stamped with this exact poNumber (inventory.poNumber) — the
//      correct source once items are received through the flow.
//   2) fallback for legacy units received before poNumber stamping existed: units of the
//      same product linked to the PO's project. Capped at the line qty so, when two POs on
//      one project ordered the same product, one pick list doesn't over-list the other's.
// Bulk units contribute no serial. Terminal/gone units (Returned, Sold) are excluded.
function getPoLineSerials(po, lineItem){
  let units = inventory.filter(inv=>inv.poNumber===po.poNumber && _itemMatch(inv, lineItem));
  if(!units.length && po.projectId){
    units = inventory.filter(inv=>
      (inv.projectId===po.projectId || (inv.project===po.projectId && !inv.projectId)) &&
      _itemMatch(inv, lineItem) &&
      inv.invStatus!=='Returned' && inv.invStatus!=='Sold');
  }
  const serials = units
    .filter(u=>u.type==='serialized' && u.serial && u.serial.trim())
    .map(u=>u.serial.trim());
  return serials.slice(0, lineItem.qtyOrdered||serials.length);
}

// ── COST HISTORY ──
// Purchase-cost trend for one product over time, derived read-only from PO line items (each a
// dated, immutable snapshot). No schema, no stored history: the POs ARE the ledger. Matches by
// SKU (falling back to manufacturer+model) so legacy lines are caught too.
function _costHistSparkline(vals, w=280, h=46){
  const nz=vals.filter(v=>v>0);
  if(nz.length<2) return '';
  const min=Math.min(...nz), max=Math.max(...nz), span=(max-min)||1, n=vals.length;
  let poly=[], dots=[];
  vals.forEach((c,idx)=>{
    const x=n>1?(idx/(n-1))*(w-10)+5:w/2;
    const y=c>0?(h-6)-((c-min)/span)*(h-16):h-6;
    if(c>0){ poly.push(`${x.toFixed(1)},${y.toFixed(1)}`); dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--accent)"/>`); }
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;max-width:100%;">
    <polyline points="${poly.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots.join('')}
  </svg>`;
}

function showCostHistory(sku){
  const prod=catalog.find(c=>c.sku===sku)||{sku:sku,manufacturer:'',model:''};
  const pts=[];
  orderItems.forEach(oi=>{
    if(!_itemMatch(oi, prod)) return;
    const po=orders.find(o=>o.poNumber===oi.poNumber);
    pts.push({
      date:(po&&po.date)||'', vendor:(po&&po.vendor)||'', status:(po&&po.status)||'',
      po:oi.poNumber, qty:oi.qtyOrdered||0, cost:parseFloat(oi.unitCost)||0,
    });
  });
  if(!pts.length){ toast('No purchase history for this product yet','error'); return; }
  pts.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.po).localeCompare(String(b.po)));

  const fmt=n=>'$'+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const nz=pts.filter(p=>p.cost>0).map(p=>p.cost);
  const low=nz.length?Math.min(...nz):0, high=nz.length?Math.max(...nz):0;
  const avg=nz.length?nz.reduce((s,c)=>s+c,0)/nz.length:0;
  const latest=nz.length?nz[nz.length-1]:0, firstNz=nz.length?nz[0]:0;
  const chg=firstNz?((latest-firstNz)/firstNz*100):0;
  const chgTxt=nz.length<2?'<span class="dim">—</span>'
    :`<span style="color:${chg>0.05?'var(--accent4)':chg<-0.05?'var(--accent3)':'var(--text-dim)'};">${chg>0.05?'▲':chg<-0.05?'▼':''} ${Math.abs(chg).toFixed(1)}%</span>`;

  const chip=(label,val)=>`<div style="text-align:center;padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;min-width:78px;">
      <div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:var(--text);">${val}</div>
      <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${label}</div></div>`;

  let prev=null;
  const bodyRows=pts.map(p=>{
    let delta='<span class="dim">—</span>';
    if(prev!==null && p.cost>0 && prev>0){
      const d=p.cost-prev;
      if(Math.abs(d)>0.005){ const up=d>0; delta=`<span style="color:${up?'var(--accent4)':'var(--accent3)'};">${up?'▲':'▼'} ${fmt(Math.abs(d))}</span>`; }
    }
    if(p.cost>0) prev=p.cost;
    const cx=p.status==='Cancelled';
    return `<tr style="${cx?'opacity:0.5;':''}">
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap;">${escHtml(p.date||'—')}</td>
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);">${escHtml(p.vendor||'—')}</td>
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);"><a href="#" onclick="event.preventDefault();closeCostHistory();showPage('orders');setTimeout(()=>openOrder('${escHtml(String(p.po))}'),40)" style="color:var(--accent);font-family:var(--font-mono);text-decoration:none;">${escHtml(String(p.po))}</a>${cx?' <span style="font-size:9px;color:var(--warn);">cancelled</span>':''}</td>
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--font-mono);">${p.qty}</td>
      <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--font-mono);font-weight:600;">${p.cost>0?fmt(p.cost):'<span class="dim">—</span>'}</td>
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);text-align:right;font-family:var(--font-mono);">${delta}</td>
    </tr>`;
  }).join('');

  const overlay=document.createElement('div');
  overlay.id='cost-hist-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px;';
  overlay.onclick=e=>{ if(e.target===overlay) closeCostHistory(); };
  overlay.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:640px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px 12px;">
      <div>
        <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);">Purchase Cost History</div>
        <div style="font-size:18px;font-weight:700;margin-top:3px;">${escHtml(prod.manufacturer||'')} ${escHtml(prod.model||'')}</div>
        ${prod.sku?`<div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-top:2px;">${escHtml(prod.sku)}</div>`:''}
      </div>
      <button onclick="closeCostHistory()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">×</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 14px;">
      ${chip('Latest', latest?fmt(latest):'—')}
      ${chip('Low', low?fmt(low):'—')}
      ${chip('High', high?fmt(high):'—')}
      ${chip('Avg', avg?fmt(avg):'—')}
      ${chip('Purchases', pts.length)}
      ${chip('Change', chgTxt)}
    </div>
    ${nz.length>=2?`<div style="padding:0 20px 14px;">${_costHistSparkline(pts.map(p=>p.cost))}</div>`:''}
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:7px 10px;text-align:left;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Date</th>
        <th style="padding:7px 10px;text-align:left;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Vendor</th>
        <th style="padding:7px 10px;text-align:left;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">PO</th>
        <th style="padding:7px 10px;text-align:center;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Qty</th>
        <th style="padding:7px 10px;text-align:right;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Unit Cost</th>
        <th style="padding:7px 10px;text-align:right;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Δ</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div style="padding:12px 20px 18px;font-size:10px;color:var(--text-dim);">Costs are per-PO snapshots and never change once a line is received. Newer prices are added by new POs.</div>
  </div>`;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', _costHistEsc);
}
function _costHistEsc(e){ if(e.key==='Escape') closeCostHistory(); }
function closeCostHistory(){ const o=document.getElementById('cost-hist-overlay'); if(o) o.remove(); document.removeEventListener('keydown', _costHistEsc); }

// ── PICK LIST ITEM PICKER ──
// Lets the user choose which PO lines go on the pick list PDF (all checked by default),
// instead of always exporting the whole PO.
function openPickListPicker(poNum){
  const po=orders.find(o=>o.poNumber===poNum); if(!po) return;
  const items=orderItems.filter(i=>i.poNumber===poNum);
  if(!items.length){ toast('This PO has no items','error'); return; }
  let ov=document.getElementById('picklist-picker-overlay'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='picklist-picker-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:600;padding:24px;';
  ov.onclick=e=>{ if(e.target===ov) closePickListPicker(); };
  const rows=items.map(i=>{
    const nSer=getPoLineSerials(po,i).length;
    return `<label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" class="pl-pick" value="${escHtml(i.id)}" checked>
      <span style="flex:1;font-size:13px;">${escHtml(i.manufacturer||'')} <b>${escHtml(i.model||'')}</b>${i.description?` <span style="color:var(--text-dim);font-style:italic;">${escHtml(i.description)}</span>`:''}</span>
      <span style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);white-space:nowrap;">qty ${i.qtyOrdered}${nSer?` · ${nSer} S/N`:''}</span>
    </label>`;
  }).join('');
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:600px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);">
      <div><div style="font-size:16px;font-weight:700;">Pick List — choose items</div><div style="font-size:11px;color:var(--text-dim);">PO ${escHtml(poNum)}</div></div>
      <button onclick="closePickListPicker()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div style="padding:8px 16px;display:flex;gap:10px;border-bottom:1px solid var(--border);">
      <button class="btn btn-ghost" onclick="document.querySelectorAll('#picklist-picker-overlay .pl-pick').forEach(c=>{c.checked=true;})" style="font-size:11px;">Select all</button>
      <button class="btn btn-ghost" onclick="document.querySelectorAll('#picklist-picker-overlay .pl-pick').forEach(c=>{c.checked=false;})" style="font-size:11px;">None</button>
    </div>
    <div style="padding:6px 16px;">${rows}</div>
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--surface);">
      <button class="btn btn-ghost" onclick="closePickListPicker()" style="font-size:12px;">Cancel</button>
      <button class="btn" onclick="exportSelectedPickList('${poNum}')" style="font-size:12px;background:rgba(79,142,247,0.12);color:var(--accent);border:1px solid rgba(79,142,247,0.4);">🖨 Export Pick List</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
function closePickListPicker(){ const o=document.getElementById('picklist-picker-overlay'); if(o) o.remove(); }
function exportSelectedPickList(poNum){
  const ids=Array.from(document.querySelectorAll('#picklist-picker-overlay .pl-pick:checked')).map(c=>c.value);
  if(!ids.length){ toast('Select at least one item for the pick list','error'); return; }
  closePickListPicker();
  exportPOtoPDF(poNum, true, ids);
}

// ── EXPORT PO TO PDF ──
// hidePrices=true produces a pick-list copy for staged boxes: no unit prices, discounts,
// line totals, totals block, tax/shipping — just items + quantities + the serial numbers of
// the filled units (replacing the internal SKU, which installers don't need). Everything else
// matches the standard export so the two PDFs are visually identical apart from those columns.
function exportPOtoPDF(poNum, hidePrices=false, onlyItemIds=null){
  const po = orders.find(o=>o.poNumber===poNum); if(!po) return;
  const projCtx = (typeof poProjectLabel==='function' ? (poProjectLabel(po).ctx||'') : (po.projectName||''));
  let items = orderItems.filter(i=>i.poNumber===poNum);
  // Pick list can export a chosen subset (see openPickListPicker); full PO ignores this.
  if(onlyItemIds && onlyItemIds.length) items = items.filter(i=>onlyItemIds.includes(i.id));
  if(!items.length){ toast('No items to export','error'); return; }
  const grossTotal = items.reduce((s,i)=>s+(i.qtyOrdered*i.unitCost),0);
  const itemDiscTotal = items.reduce((s,i)=>s+(i.discount||0),0);
  const total = grossTotal - itemDiscTotal;
  const tax = po.tax||0, tariff = po.tariff||0, shipping = po.shipping||0, poDiscount = po.discount||0;
  const poOthers = Array.isArray(po.otherCharges)?po.otherCharges:[];
  const otherTotal = poOthers.reduce((s,c)=>s+(c.amount||0),0);
  const grand = total+tax+tariff+shipping-poDiscount+otherTotal;
  const fmt = n => '$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

  const rows = items.map(i=>{
    // Pick list: show the serials of the filled units in place of the internal SKU.
    const serials = hidePrices ? getPoLineSerials(po, i) : [];
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;">
        <div style="font-weight:600">${escHtml(i.manufacturer)} ${escHtml(i.model)}</div>
        ${i.description?`<div style="font-size:11px;color:#666;font-style:italic">${escHtml(i.description)}</div>`:''}
        ${hidePrices
          ? (serials.length
              ? `<div style="font-size:10px;color:#333;font-family:monospace;margin-top:3px;line-height:1.55;word-break:break-word;overflow-wrap:anywhere;">S/N: ${serials.map(escHtml).join(', ')}</div>`
              : '')
          : (i.sku?`<div style="font-size:10px;color:#999;font-family:monospace">${escHtml(i.sku)}</div>`:'')}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;text-align:center;font-size:12px;">${i.qtyOrdered}</td>
      ${hidePrices?'':`
      <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;text-align:right;font-size:12px;">${fmt(i.unitCost)}</td>
      ${i.discount>0?`<td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;text-align:right;font-size:12px;color:#c0392b;">−${fmt(i.discount)}</td>`:`<td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;text-align:right;font-size:12px;color:#aaa;">—</td>`}
      <td style="padding:10px 12px;border-bottom:1px solid #e0e0e0;text-align:right;font-size:12px;font-weight:600;">${fmt((i.qtyOrdered*i.unitCost)-(i.discount||0))}</td>`}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${hidePrices?`Pick List ${escHtml(poNum)}`:`PO ${escHtml(poNum)}`}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: Arial, Helvetica, sans-serif; color:#222; background:#fff; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
  }
</style>
</head>
<body>
<div style="max-width:780px;margin:0 auto;padding:40px 48px;">

  <!-- Header banner -->
  <div style="background:#2a2a2a;padding:22px 28px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;">
    <div>
      <div style="color:#fff;font-size:11px;letter-spacing:3px;font-weight:400;text-transform:uppercase;margin-bottom:4px;">AVPROCURE</div>
      <div style="color:#fff;font-size:28px;font-weight:700;letter-spacing:1px;">${hidePrices?'Pick List':'Purchase Order'}</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#ccc;font-size:11px;margin-bottom:4px;letter-spacing:1px;">PO NUMBER</div>
      <div style="color:#fff;font-size:26px;font-weight:700;font-family:monospace;">${escHtml(poNum)}</div>
    </div>
  </div>

  <!-- Meta strip -->
  <div style="background:#f5f5f5;border:1px solid #ddd;border-top:none;padding:14px 28px;display:flex;flex-wrap:wrap;gap:14px 32px;margin-bottom:28px;">
    <div><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Date</div><div style="font-size:13px;">${escHtml(po.date||'—')}</div></div>
    <div style="min-width:0;"><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Project</div><div style="font-size:13px;">${escHtml(projCtx||'—')}</div></div>
    <div><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Shipment</div><div style="font-size:13px;">${escHtml(po.shipment||'Ground')}</div></div>
    <div><div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Status</div><div style="font-size:13px;">${escHtml(po.status)}</div></div>
  </div>

  <!-- From / To -->
  <div style="display:flex;gap:24px;margin-bottom:28px;">
    <div style="flex:1;border:1px solid #ddd;border-radius:4px;padding:16px 18px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:8px;">Vendor</div>
      <div style="font-size:13px;font-weight:700;">${escHtml(po.vendor)}</div>
    </div>
    <div style="flex:1;border:1px solid #ddd;border-radius:4px;padding:16px 18px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin-bottom:8px;">Ship To</div>
      ${(po.shipAddress||'').split('\n').filter(Boolean).map((line,i)=>`<div style="font-size:${i===0?'13':'12'}px;${i===0?'font-weight:700;':'color:#555;'}">${escHtml(line)}</div>`).join('')||'<div style="font-size:12px;color:#aaa;">No address specified</div>'}
    </div>
  </div>

  <!-- Line items table -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-radius:4px;overflow:hidden;">
    <thead>
      <tr style="background:#2a2a2a;">
        <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;">Item</th>
        <th style="padding:10px 12px;text-align:center;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:60px;">Qty</th>
        ${hidePrices?'':`
        <th style="padding:10px 12px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:110px;">Unit Cost</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:100px;">Discount</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:600;width:120px;">Line Total</th>`}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Totals -->
  ${hidePrices?'':`
  <div style="display:flex;justify-content:flex-end;margin-top:0;border:1px solid #ddd;border-top:none;">
    <div style="min-width:260px;padding:12px 16px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#555;">
        <span>Subtotal:</span><span>${fmt(grossTotal)}</span>
      </div>
      ${itemDiscTotal?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#c0392b;"><span>Item Discounts:</span><span>−${fmt(itemDiscTotal)}</span></div>`:''}
      ${tax?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#555;"><span>Tax${total?' ('+((tax/total)*100).toFixed(2).replace(/\.?0+$/,'')+'%)':''}:</span><span>${fmt(tax)}</span></div>`:''}
      ${tariff?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#555;"><span>Tariff${total?' ('+((tariff/total)*100).toFixed(2).replace(/\.?0+$/,'')+'%)':''}:</span><span>${fmt(tariff)}</span></div>`:''}
      ${shipping?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#555;"><span>Shipping:</span><span>${fmt(shipping)}</span></div>`:''}
      ${poDiscount?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#c0392b;"><span>Discount:</span><span>−${fmt(poDiscount)}</span></div>`:''}
      ${poOthers.map(c=>c.amount?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#555;"><span>${escHtml(c.label||'Other')}:</span><span>${fmt(c.amount)}</span></div>`:'').join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-size:14px;font-weight:700;border-top:2px solid #222;margin-top:4px;">
        <span>Grand Total:</span><span>${fmt(grand)}</span>
      </div>
    </div>
  </div>`}

  <!-- Terms -->
  <div style="margin-top:20px;display:flex;gap:8px;">
    <div>
      <div style="font-size:11px;font-weight:700;">Project / Job</div>
      <div style="font-size:12px;color:#555;">${escHtml(projCtx||'—')}</div>
    </div>
  </div>

  ${po.notes?`<div style="margin-top:16px;padding:12px 14px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#555;"><strong>Notes:</strong> ${escHtml(po.notes)}</div>`:''}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:14px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
    <span>AVProcure</span>
    <span>Page 1 of 1</span>
  </div>

  <!-- Print button -->
  <div class="no-print" style="margin-top:28px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 28px;background:#2a2a2a;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
  </div>
</div>
</body>
</html>`;

  const win = window.open('','_blank');
  if(!win){ toast('Pop-up blocked — allow pop-ups to export the PDF','error'); return; }
  win.document.write(html);
  win.document.close();
}
