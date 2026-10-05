// ═══════════════════════════════════════════════

function filterStock(q){ stockFilterQuery=q; renderStockTable(); }

function getStockItems(){
  // All inventory items with location === 'Stock'
  return inventory.filter(i=>isStockItem(i));
}

function getStockOnOrder(item){
  // Find the Shop-Stock project
  const ssp=projects.find(p=>p.name.trim().toLowerCase()==='shop-stock');
  if(!ssp) return [];
  // POs linked to shop-stock that are not fully received
  const openPOs=orders.filter(o=>o.projectId===ssp.id&&o.status!=='Received'&&o.status!=='Cancelled');
  const results=[];
  for(const po of openPOs){
    const poItems=orderItems.filter(i=>i.poNumber===po.poNumber);
    const matched=poItems.find(pi=>
      (item.sku&&pi.sku===item.sku)||(pi.manufacturer===item.manufacturer&&pi.model===item.model)
    );
    if(matched){
      const outstanding=Math.max(0,matched.qtyOrdered-matched.qtyReceived);
      if(outstanding>0) results.push({poNumber:po.poNumber,qty:outstanding});
    }
  }
  return results;
}

function getStockLastReceived(item){
  // Most recent dateReceived across all order items matching this item
  const allPOItems=orderItems.filter(pi=>
    ((item.sku&&pi.sku===item.sku)||(pi.manufacturer===item.manufacturer&&pi.model===item.model))
    &&pi.dateReceived
  );
  if(!allPOItems.length) return '';
  // Sort descending and take first
  return allPOItems.sort((a,b)=>new Date(b.dateReceived)-new Date(a.dateReceived))[0].dateReceived;
}

function updateStockQty(id, delta){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  const newQty=Math.max(0, item.qty+delta);
  item.qty=newQty;
  syncStockStatus(item);
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
  updateStockStats();
  renderStockTable();
}

function updateStockQtyDirect(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.qty=Math.max(0,parseInt(val)||0);
  syncStockStatus(item);
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
  updateStockStats();
}

function updateStockPar(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.par=Math.max(0,parseInt(val)||0);
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
  renderStockTable();
}

function updateStockNotes(id, val){
  const item=inventory.find(i=>i.id===id); if(!item) return;
  item.notes=val.trim();
  item.lastUpdated=new Date().toLocaleDateString('en-US');
  dbSave('inventory', item);
  setDirty(true);
}

function updateStockStats(){
  const items=getStockItems();
  const total=items.length;
  const ok=items.filter(i=>i.qty>=(i.par||0)).length;
  const low=items.filter(i=>i.qty>0&&i.qty<(i.par||0)).length;
  const out=items.filter(i=>i.qty===0).length;
  document.getElementById('stock-chip-total').innerHTML=`${total} <span>items</span>`;
  document.getElementById('stock-chip-ok').innerHTML=`${ok} <span>at par</span>`;
  document.getElementById('stock-chip-low').innerHTML=`${low} <span>low</span>`;
  document.getElementById('stock-chip-out').innerHTML=`${out} <span>out</span>`;
}

function renderStockTable(){
  applySortClasses('stock');
  const tbody=document.getElementById('stock-tbody');
  if(!tbody) return;

  const q=stockFilterQuery.toLowerCase();
  let items=getStockItems();
  if(q) items=items.filter(i=>[i.manufacturer,i.model,i.category,i.notes].some(v=>(v||'').toLowerCase().includes(q)));

  // Add computed fields for sorting
  items=items.map(i=>({
    ...i,
    needToOrder:(i.par||0)-i.qty,
    onOrderRaw:getStockOnOrder(i),
    lastReceived:getStockLastReceived(i),
  }));

  // Sort
  const {col,dir}=stockSort;
  const d=dir==='asc'?1:-1;
  items.sort((a,b)=>{
    if(col==='qty'||col==='par'||col==='needToOrder') return ((a[col]??0)-(b[col]??0))*d;
    if(col==='onOrder') return (a.onOrderRaw.reduce((s,x)=>s+x.qty,0)-b.onOrderRaw.reduce((s,x)=>s+x.qty,0))*d;
    if(col==='lastReceived') return (new Date(a.lastReceived||0)-new Date(b.lastReceived||0))*d;
    return String(a[col]||'').toLowerCase().localeCompare(String(b[col]||'').toLowerCase())*d;
  });

  updateStockStats();

  if(!items.length){
    tbody.innerHTML=`<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">⬢</div><div style="font-size:13px">No shop stock items. Add items to the Shop-Stock project scope to populate this list.</div></div></td></tr>`;
    return;
  }

  const sk=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  tbody.innerHTML=items.map(i=>{
    const par=i.par||0;
    const qty=i.qty;
    const needToOrder=par-qty;

    // Row color
    let rowBg;
    if(qty===0)        rowBg='background:rgba(247,79,126,0.13);';
    else if(qty<par)   rowBg='background:rgba(247,201,79,0.10);';
    else               rowBg='background:rgba(79,247,160,0.07);';

    // Status badge
    const statusColor=qty===0?'var(--accent4)':qty<par?'var(--warn)':'var(--accent3)';
    const statusBg=qty===0?'rgba(247,79,126,0.1)':qty<par?'rgba(247,201,79,0.1)':'rgba(79,247,160,0.1)';
    const statusBadge=`<span style="font-size:10px;font-family:var(--font-mono);padding:2px 7px;border-radius:3px;background:${statusBg};color:${statusColor}">${escHtml(i.status||'On Hand')}</span>`;

    // Need to order cell
    const ntoColor=needToOrder>0?'var(--warn)':needToOrder<0?'var(--accent3)':'var(--text-dim)';
    const ntoCell=`<span style="font-family:var(--font-mono);font-size:12px;color:${ntoColor};font-weight:${needToOrder>0?'700':'400'}">${needToOrder>0?'+'+needToOrder:needToOrder}</span>`;

    // On Order
    const onOrderLinks=i.onOrderRaw.length
      ? i.onOrderRaw.map(o=>`<a href="#" onclick="event.preventDefault();showPage('orders');openOrder('${sk(o.poNumber)}','stock')"
          style="color:var(--accent);font-family:var(--font-mono);font-size:11px;text-decoration:none;white-space:nowrap;">PO${escHtml(o.poNumber)} (${o.qty})</a>`).join(' ')
      : '<span class="dim">—</span>';

    return `<tr class="group-row" style="${rowBg}">
      <td style="font-size:13px">${escHtml(i.manufacturer)}</td>
      <td style="font-size:13px">${escHtml(i.model)}</td>
      <td class="mobile-hide"><span class="pb-cat-tag">${escHtml(i.category||'—')}</span></td>
      <td class="mono">
        <div class="qty-ctrl">
          <span class="qty-btn minus" onclick="event.stopPropagation();updateStockQty('${sk(i.id)}',-1)">-</span>
          <input type="number" value="${qty}" min="0"
            onchange="updateStockQtyDirect('${sk(i.id)}',this.value)"
            onclick="event.stopPropagation()"
            style="width:46px;padding:3px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
          <span class="qty-btn plus" onclick="event.stopPropagation();updateStockQty('${sk(i.id)}',1)">+</span>
        </div>
      </td>
      <td class="mono">
        <input type="number" value="${par}" min="0"
          onchange="updateStockPar('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="width:46px;padding:3px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none;text-align:center;"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
      </td>
      <td style="text-align:center">${ntoCell}</td>
      <td>${statusBadge}</td>
      <td class="mobile-hide" style="font-size:11px">${onOrderLinks}</td>
      <td class="mono mobile-hide" style="font-size:11px">
        <input type="text" value="${escHtml(i.notes||'')}" placeholder="—"
          onchange="updateStockNotes('${sk(i.id)}',this.value)"
          onclick="event.stopPropagation()"
          style="background:none;border:none;border-bottom:1px solid transparent;width:100%;font-family:var(--font-ui);font-size:12px;color:var(--text-muted);outline:none;padding:0;cursor:text;"
          onfocus="this.style.borderBottomColor='var(--accent)'" onblur="this.style.borderBottomColor='transparent'">
      </td>
      <td class="mono mobile-hide" style="font-size:10px;color:var(--text-muted)">${escHtml(i.lastReceived||'—')}</td>
    </tr>`;
  }).join('');
}
