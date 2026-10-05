
const fdFmt = n => '$' + (n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function invGrand(inv){
  const sub = inv.subtotal||0;
  const tax = inv.taxMode==='%' ? (inv.tax||0)/100*sub : (inv.tax||0);
  const tariff = inv.tariffMode==='%' ? (inv.tariff||0)/100*sub : (inv.tariff||0);
  const ship = inv.shippingMode==='%' ? (inv.shipping||0)/100*sub : (inv.shipping||0);
  const labor = inv.laborMode==='%' ? (inv.labor||0)/100*sub : (inv.labor||0);
  return sub + tax + tariff + ship + labor;
}

function invBalance(inv){
  const paid = invoicePayments.filter(p=>p.invoiceId===inv.id).reduce((s,p)=>s+(p.amount||0),0);
  const bal = invGrand(inv) - paid;
  // Snap sub-cent residuals (from %-adjustment float math) to zero so a fully paid
  // invoice reads exactly 0 — the Paid transition and every balance>0 check depend on it.
  return bal < 0.005 ? 0 : bal;
}

function billGrand(bill){
  const sub = bill.subtotal||0;
  const tax = bill.taxMode==='%' ? (bill.tax||0)/100*sub : (bill.tax||0);
  const tariff = bill.tariffMode==='%' ? (bill.tariff||0)/100*sub : (bill.tariff||0);
  const ship = bill.shippingMode==='%' ? (bill.shipping||0)/100*sub : (bill.shipping||0);
  return sub + tax + tariff + ship;
}

function billBalance(bill){
  const paid = vendorBillPayments.filter(p=>p.billId===bill.id).reduce((s,p)=>s+(p.amount||0),0);
  const bal = billGrand(bill) - paid;
  return bal < 0.005 ? 0 : bal;
}

function fdInvStatusBadge(inv){
  const today = new Date().toISOString().slice(0,10);
  let status = inv.status||'Draft';
  if(status!=='Paid' && inv.dueDate && inv.dueDate < today && invBalance(inv)>0) status='Overdue';
  const cls = {Draft:'tag-b',Sent:'tag-s',Partial:'tag-m',Paid:'tag-Complete',Overdue:'tag-b'}[status]||'tag-b';
  return `<span class="tag ${cls}" style="${status==='Overdue'?'color:var(--accent4);background:rgba(247,79,126,0.1);border-color:rgba(247,79,126,0.25);':''}">${escHtml(status)}</span>`;
}

function fdBillStatusBadge(bill){
  const today = new Date().toISOString().slice(0,10);
  let status = bill.status||'Draft';
  if(status!=='Paid' && bill.dueDate && bill.dueDate < today && billBalance(bill)>0) status='Overdue';
  const cls = {Draft:'tag-b',Received:'tag-s',Partial:'tag-m',Paid:'tag-Complete',Overdue:'tag-b'}[status]||'tag-b';
  return `<span class="tag ${cls}" style="${status==='Overdue'?'color:var(--accent4);background:rgba(247,79,126,0.1);border-color:rgba(247,79,126,0.25);':''}">${escHtml(status)}</span>`;
}

function renderFDPage(){
  updateFDStats();
  renderFDInvTable();
  renderFDBillTable();
  renderFDClientsTable();
}

function updateFDStats(){
  const today = new Date().toISOString().slice(0,10);
  const arOut = invoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+invBalance(i),0);
  const ovInv = invoices.filter(i=>i.status!=='Paid'&&i.dueDate&&i.dueDate<today&&invBalance(i)>0).length;
  const apOut = vendorBills.filter(b=>b.status!=='Paid').reduce((s,b)=>s+billBalance(b),0);
  const ovBill = vendorBills.filter(b=>b.status!=='Paid'&&b.dueDate&&b.dueDate<today&&billBalance(b)>0).length;
  const e=id=>document.getElementById(id);
  if(e('fd-ar-chip')) e('fd-ar-chip').innerHTML=fdFmt(arOut)+' <span>AR Outstanding</span>';
  if(e('fd-ov-inv-chip')) e('fd-ov-inv-chip').innerHTML=ovInv+' <span>Overdue Invoices</span>';
  if(e('fd-ap-chip')) e('fd-ap-chip').innerHTML=fdFmt(apOut)+' <span>AP Outstanding</span>';
  if(e('fd-ov-bill-chip')) e('fd-ov-bill-chip').innerHTML=ovBill+' <span>Overdue Bills</span>';
}

function setFDTab(tab){
  fdTab=tab;
  const views={inv:'fd-inv-view',bills:'fd-bills-view',clients:'fd-clients-view',vendors:'fd-vendors-view'};
  Object.entries(views).forEach(([t,vid])=>{
    const v=document.getElementById(vid);
    if(v) v.style.display=t===tab?'flex':'none';
    const btn=document.getElementById('fdtab-'+t);
    if(btn){ btn.style.color=t===tab?'var(--accent)':'var(--text-muted)'; btn.style.borderBottomColor=t===tab?'var(--accent)':'transparent'; }
  });
  if(tab==='clients') renderFDClientsTable();
  if(tab==='vendors') renderFDVendors();
}

function renderFDInvTable(){
  const today = new Date().toISOString().slice(0,10);
  let list = invoices.slice();
  const q = (fdInvFilterQuery||'').toLowerCase();
  const sf = fdInvStatusFilter;
  if(q) list = list.filter(i=>{
    const proj = projects.find(p=>p.id===i.projectId);
    return [i.invoiceNumber,i.clientName,proj?proj.name:'',i.status,i.notes].join(' ').toLowerCase().includes(q);
  });
  if(sf) list = list.filter(i=>{
    const eff = (i.status!=='Paid'&&i.dueDate&&i.dueDate<today&&invBalance(i)>0)?'Overdue':i.status;
    return eff===sf;
  });
  list.sort((a,b)=>(b.invoiceNumber||'').localeCompare(a.invoiceNumber||''));

  const totalInv = invoices.reduce((s,i)=>s+invGrand(i),0);
  const totalColl = invoices.reduce((s,i)=>s+invoicePayments.filter(p=>p.invoiceId===i.id).reduce((t,p)=>t+(p.amount||0),0),0);
  const totalOut = invoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+invBalance(i),0);
  const e=id=>document.getElementById(id);
  if(e('fd-inv-total-chip')) e('fd-inv-total-chip').innerHTML=fdFmt(totalInv)+' <span>invoiced</span>';
  if(e('fd-inv-collected-chip')) e('fd-inv-collected-chip').innerHTML=fdFmt(totalColl)+' <span>collected</span>';
  if(e('fd-inv-outstanding-chip')) e('fd-inv-outstanding-chip').innerHTML=fdFmt(totalOut)+' <span>outstanding</span>';

  const tbody = document.getElementById('fd-inv-tbody');
  if(!tbody) return;
  if(!list.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state" style="padding:30px"><div style="font-size:13px;color:var(--text-dim)">No invoices yet. Click "New Invoice" to get started.</div></div></td></tr>`;
    return;
  }
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  tbody.innerHTML = list.map(inv=>{
    const proj = projects.find(p=>p.id===inv.projectId);
    const grand = invGrand(inv);
    const bal = invBalance(inv);
    return `<tr class="group-row" onclick="openFDInvoice('${sk(inv.id)}')">
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${escHtml(inv.invoiceNumber||'—')}</td>
      <td>
        <div style="font-size:13px;font-weight:600">${escHtml(inv.clientName||'—')}</div>
        ${proj?`<div style="font-size:11px;color:var(--text-muted)">${escHtml(proj.name)}</div>`:''}
      </td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(inv.date||'—')}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(inv.dueDate||'—')}</td>
      <td>${fdInvStatusBadge(inv)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(grand)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:right;color:${bal>0?'var(--warn)':'var(--text-dim)'}">${bal>0?fdFmt(bal):'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn-del" onclick="event.stopPropagation();deleteFDInvoice('${sk(inv.id)}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function renderFDBillTable(){
  const today = new Date().toISOString().slice(0,10);
  let list = vendorBills.slice();
  const q = (fdBillFilterQuery||'').toLowerCase();
  const sf = fdBillStatusFilter;
  if(q) list = list.filter(b=>[b.billNumber,b.vendor,b.poNumber,b.status,b.notes].join(' ').toLowerCase().includes(q));
  if(sf) list = list.filter(b=>{
    const eff = (b.status!=='Paid'&&b.dueDate&&b.dueDate<today&&billBalance(b)>0)?'Overdue':b.status;
    return eff===sf;
  });
  list.sort((a,b)=>(b.billNumber||'').localeCompare(a.billNumber||''));

  const totalBilled = vendorBills.reduce((s,b)=>s+billGrand(b),0);
  const totalPaid = vendorBills.reduce((s,b)=>s+vendorBillPayments.filter(p=>p.billId===b.id).reduce((t,p)=>t+(p.amount||0),0),0);
  const totalOwed = vendorBills.filter(b=>b.status!=='Paid').reduce((s,b)=>s+billBalance(b),0);
  const e=id=>document.getElementById(id);
  if(e('fd-bill-total-chip')) e('fd-bill-total-chip').innerHTML=fdFmt(totalBilled)+' <span>billed</span>';
  if(e('fd-bill-paid-chip')) e('fd-bill-paid-chip').innerHTML=fdFmt(totalPaid)+' <span>paid</span>';
  if(e('fd-bill-owed-chip')) e('fd-bill-owed-chip').innerHTML=fdFmt(totalOwed)+' <span>outstanding</span>';

  const tbody = document.getElementById('fd-bill-tbody');
  if(!tbody) return;
  if(!list.length){
    tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state" style="padding:30px"><div style="font-size:13px;color:var(--text-dim)">No vendor bills yet. Click "From PO" or "Manual Bill" to get started.</div></div></td></tr>`;
    return;
  }
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  tbody.innerHTML = list.map(bill=>{
    const grand = billGrand(bill);
    const bal = billBalance(bill);
    return `<tr class="group-row" onclick="openFDBill('${sk(bill.id)}')">
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent2)">${escHtml(bill.billNumber||'—')}</td>
      <td style="font-size:13px;font-weight:600">${escHtml(bill.vendor||'—')}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${escHtml(bill.poNumber||'—')}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(bill.date||'—')}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(bill.dueDate||'—')}</td>
      <td>${fdBillStatusBadge(bill)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(grand)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:right;color:${bal>0?'var(--warn)':'var(--text-dim)'}">${bal>0?fdFmt(bal):'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn-del" onclick="event.stopPropagation();deleteFDBill('${sk(bill.id)}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function deleteFDInvoice(id){
  if(!confirm('Delete this invoice and all its items/payments?')) return;
  invoices = invoices.filter(i=>i.id!==id);
  const itemIds = invoiceItems.filter(i=>i.invoiceId===id).map(i=>i.id);
  const payIds = invoicePayments.filter(p=>p.invoiceId===id).map(p=>p.id);
  invoiceItems = invoiceItems.filter(i=>i.invoiceId!==id);
  invoicePayments = invoicePayments.filter(p=>p.invoiceId!==id);
  dbDelete('invoices', id);
  itemIds.forEach(i=>dbDelete('invoiceItems',i));
  payIds.forEach(i=>dbDelete('invoicePayments',i));
  renderFDPage(); setFDTab('inv'); toast('Invoice deleted','success');
}

function deleteFDBill(id){
  if(!confirm('Delete this vendor bill and all its items/payments?')) return;
  vendorBills = vendorBills.filter(b=>b.id!==id);
  const itemIds = vendorBillItems.filter(i=>i.billId===id).map(i=>i.id);
  const payIds = vendorBillPayments.filter(p=>p.billId===id).map(p=>p.id);
  vendorBillItems = vendorBillItems.filter(i=>i.billId!==id);
  vendorBillPayments = vendorBillPayments.filter(p=>p.billId!==id);
  dbDelete('vendorBills', id);
  itemIds.forEach(i=>dbDelete('vendorBillItems',i));
  payIds.forEach(i=>dbDelete('vendorBillPayments',i));
  renderFDPage(); setFDTab('bills'); toast('Vendor bill deleted','success');
}

// ── Invoice detail ──
function openFDInvoice(id){
  const inv = invoices.find(i=>i.id===id); if(!inv) return;
  currentInvoiceId = id;
  document.getElementById('fd-main-view').style.display='none';
  document.getElementById('fd-inv-detail-view').style.display='flex';
  document.getElementById('fd-bill-detail-view').style.display='none';
  const proj = projects.find(p=>p.id===inv.projectId);
  document.getElementById('fd-inv-det-num').textContent = inv.invoiceNumber||'—';
  document.getElementById('fd-inv-det-client').textContent = inv.clientName||'';
  document.getElementById('fd-inv-det-status-badge').innerHTML = fdInvStatusBadge(inv);
  document.getElementById('fd-inv-det-meta').textContent = [proj?proj.name:'', inv.date, inv.dueDate?'Due '+inv.dueDate:''].filter(Boolean).join(' · ');
  const grand = invGrand(inv);
  const bal = invBalance(inv);
  document.getElementById('fd-inv-det-total').textContent = fdFmt(grand);
  document.getElementById('fd-inv-det-balance').textContent = fdFmt(bal);
  document.getElementById('fd-inv-det-balance').style.color = bal>0?'var(--warn)':'var(--text-dim)';
  // Items
  const items = invoiceItems.filter(i=>i.invoiceId===id);
  const tbody = document.getElementById('fd-inv-det-items');
  tbody.innerHTML = items.length ? items.map(item=>{
    const lt = (item.qty||0)*(item.unitPrice||0);
    return `<tr><td style="padding:7px 10px;font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${escHtml(item.sku||'—')}</td>
    <td style="padding:7px 10px;font-size:13px">${escHtml(item.description||'')}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${item.qty||0}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(item.unitPrice||0)}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(lt)}</td></tr>`;
  }).join('') : `<tr><td colspan="5" style="padding:16px 10px;font-size:12px;color:var(--text-dim);text-align:center">No line items</td></tr>`;
  // Adjustments
  const sub = inv.subtotal||0;
  const adjDiv = document.getElementById('fd-inv-det-adj');
  const parts=[];
  const tax=(inv.taxMode==='%'?(inv.tax||0)/100*sub:inv.tax||0), tariff=(inv.tariffMode==='%'?(inv.tariff||0)/100*sub:inv.tariff||0), ship=(inv.shippingMode==='%'?(inv.shipping||0)/100*sub:inv.shipping||0), labor=(inv.laborMode==='%'?(inv.labor||0)/100*sub:inv.labor||0);
  if(tax) parts.push(`Tax: ${fdFmt(tax)}`);
  if(tariff) parts.push(`Tariff: ${fdFmt(tariff)}`);
  if(ship) parts.push(`Shipping: ${fdFmt(ship)}`);
  if(labor) parts.push(`Labor: ${fdFmt(labor)}`);
  adjDiv.innerHTML = parts.length?`<div style="display:flex;gap:20px;flex-wrap:wrap;">${parts.map(p=>`<span style="color:var(--text-muted)">${p}</span>`).join('')}</div>`:'';
  // Payments
  const payments = invoicePayments.filter(p=>p.invoiceId===id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const ptbody = document.getElementById('fd-inv-det-payments');
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  ptbody.innerHTML = payments.length ? payments.map(p=>`<tr>
    <td style="padding:7px 10px;font-size:12px">${escHtml(p.date||'—')}</td>
    <td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">${escHtml(p.method||'—')}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right;color:var(--accent3)">${fdFmt(p.amount||0)}</td>
    <td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">${escHtml(p.notes||'—')}</td>
    <td><button class="btn-del" onclick="deleteInvPayment('${sk(p.id)}')">✕</button></td>
  </tr>`) .join('') : `<tr><td colspan="5" style="padding:14px 10px;font-size:12px;color:var(--text-dim);text-align:center">No payments recorded</td></tr>`;
}

function fdInvDetailBack(){
  document.getElementById('fd-main-view').style.display='flex';
  document.getElementById('fd-inv-detail-view').style.display='none';
  currentInvoiceId=null;
  renderFDPage(); setFDTab('inv');
}

function deleteInvPayment(id){
  const pay = invoicePayments.find(p=>p.id===id); if(!pay) return;
  invoicePayments = invoicePayments.filter(p=>p.id!==id);
  dbDelete('invoicePayments', id);
  autoUpdateInvStatus(pay.invoiceId);
  openFDInvoice(pay.invoiceId);
  updateFDStats();
  toast('Payment removed','success');
}

// ── Bill detail ──
function openFDBill(id){
  const bill = vendorBills.find(b=>b.id===id); if(!bill) return;
  currentBillId = id;
  document.getElementById('fd-main-view').style.display='none';
  document.getElementById('fd-inv-detail-view').style.display='none';
  document.getElementById('fd-bill-detail-view').style.display='flex';
  document.getElementById('fd-bill-det-num').textContent = bill.billNumber||'—';
  document.getElementById('fd-bill-det-vendor').textContent = bill.vendor||'';
  document.getElementById('fd-bill-det-status-badge').innerHTML = fdBillStatusBadge(bill);
  document.getElementById('fd-bill-det-meta').textContent = [bill.poNumber?'PO '+bill.poNumber:'', bill.date, bill.dueDate?'Due '+bill.dueDate:''].filter(Boolean).join(' · ');
  const grand = billGrand(bill);
  const bal = billBalance(bill);
  document.getElementById('fd-bill-det-total').textContent = fdFmt(grand);
  document.getElementById('fd-bill-det-balance').textContent = fdFmt(bal);
  document.getElementById('fd-bill-det-balance').style.color = bal>0?'var(--warn)':'var(--text-dim)';
  const items = vendorBillItems.filter(i=>i.billId===id);
  const tbody = document.getElementById('fd-bill-det-items');
  tbody.innerHTML = items.length ? items.map(item=>{
    const lt = (item.qty||0)*(item.unitCost||0);
    return `<tr><td style="padding:7px 10px;font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${escHtml(item.sku||'—')}</td>
    <td style="padding:7px 10px;font-size:13px">${escHtml(item.description||'')}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${item.qty||0}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(item.unitCost||0)}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${fdFmt(lt)}</td></tr>`;
  }).join('') : `<tr><td colspan="5" style="padding:16px 10px;font-size:12px;color:var(--text-dim);text-align:center">No line items</td></tr>`;
  const sub = bill.subtotal||0;
  const adjDiv = document.getElementById('fd-bill-det-adj');
  const parts=[];
  const tax=(bill.taxMode==='%'?(bill.tax||0)/100*sub:bill.tax||0), tariff=(bill.tariffMode==='%'?(bill.tariff||0)/100*sub:bill.tariff||0), ship=(bill.shippingMode==='%'?(bill.shipping||0)/100*sub:bill.shipping||0);
  if(tax) parts.push(`Tax: ${fdFmt(tax)}`);
  if(tariff) parts.push(`Tariff: ${fdFmt(tariff)}`);
  if(ship) parts.push(`Shipping: ${fdFmt(ship)}`);
  adjDiv.innerHTML = parts.length?`<div style="display:flex;gap:20px;flex-wrap:wrap;">${parts.map(p=>`<span style="color:var(--text-muted)">${p}</span>`).join('')}</div>`:'';
  const payments = vendorBillPayments.filter(p=>p.billId===id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const ptbody = document.getElementById('fd-bill-det-payments');
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  ptbody.innerHTML = payments.length ? payments.map(p=>`<tr>
    <td style="padding:7px 10px;font-size:12px">${escHtml(p.date||'—')}</td>
    <td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">${escHtml(p.method||'—')}</td>
    <td style="padding:7px 10px;font-family:var(--font-mono);font-size:12px;text-align:right;color:var(--accent3)">${fdFmt(p.amount||0)}</td>
    <td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">${escHtml(p.notes||'—')}</td>
    <td><button class="btn-del" onclick="deleteBillPayment('${sk(p.id)}')">✕</button></td>
  </tr>`).join('') : `<tr><td colspan="5" style="padding:14px 10px;font-size:12px;color:var(--text-dim);text-align:center">No payments recorded</td></tr>`;
}

function fdBillDetailBack(){
  document.getElementById('fd-main-view').style.display='flex';
  document.getElementById('fd-bill-detail-view').style.display='none';
  currentBillId=null;
  renderFDPage(); setFDTab('bills');
}

function deleteBillPayment(id){
  const pay = vendorBillPayments.find(p=>p.id===id); if(!pay) return;
  vendorBillPayments = vendorBillPayments.filter(p=>p.id!==id);
  dbDelete('vendorBillPayments', id);
  autoUpdateBillStatus(pay.billId);
  openFDBill(pay.billId);
  updateFDStats();
  toast('Payment removed','success');
}

// ── Status auto-update ──
function autoUpdateInvStatus(invId){
  const inv = invoices.find(i=>i.id===invId); if(!inv) return;
  const bal = invBalance(inv);
  const today = new Date().toISOString().slice(0,10);
  let status;
  if(bal===0) status='Paid';
  else if(inv.dueDate&&inv.dueDate<today) status='Overdue';
  else if(invoicePayments.some(p=>p.invoiceId===invId&&(p.amount||0)>0)) status='Partial';
  else status=inv.status||'Sent';
  if(status!==inv.status){ inv.status=status; dbSave('invoices',inv); }
}

function autoUpdateBillStatus(billId){
  const bill = vendorBills.find(b=>b.id===billId); if(!bill) return;
  const bal = billBalance(bill);
  const today = new Date().toISOString().slice(0,10);
  let status;
  if(bal===0) status='Paid';
  else if(bill.dueDate&&bill.dueDate<today) status='Overdue';
  else if(vendorBillPayments.some(p=>p.billId===billId&&(p.amount||0)>0)) status='Partial';
  else status=bill.status||'Received';
  if(status!==bill.status){ bill.status=status; dbSave('vendorBills',bill); }
}

// ── Record Payment modal ──
function openRecordInvPayment(){
  const inv = invoices.find(i=>i.id===currentInvoiceId); if(!inv) return;
  _rpTarget={type:'inv', id:currentInvoiceId};
  document.getElementById('rp-modal-title').textContent='Record Invoice Payment';
  document.getElementById('rp-date').valueAsDate=new Date();
  document.getElementById('rp-amount').value='';
  document.getElementById('rp-notes').value='';
  document.getElementById('rp-balance-display').textContent=fdFmt(invBalance(inv));
  document.getElementById('rp-confirm-btn').disabled=true;
  document.getElementById('record-payment-modal').style.display='flex';
}

function openRecordBillPayment(){
  const bill = vendorBills.find(b=>b.id===currentBillId); if(!bill) return;
  _rpTarget={type:'bill', id:currentBillId};
  document.getElementById('rp-modal-title').textContent='Record Bill Payment';
  document.getElementById('rp-date').valueAsDate=new Date();
  document.getElementById('rp-amount').value='';
  document.getElementById('rp-notes').value='';
  document.getElementById('rp-balance-display').textContent=fdFmt(billBalance(bill));
  document.getElementById('rp-confirm-btn').disabled=true;
  document.getElementById('record-payment-modal').style.display='flex';
}

function rpCheckReady(){
  const amt=parseFloat(document.getElementById('rp-amount').value)||0;
  document.getElementById('rp-confirm-btn').disabled=amt<=0;
}

function closeRecordPayment(){
  document.getElementById('record-payment-modal').style.display='none';
  _rpTarget=null;
}

function confirmRecordPayment(){
  if(!_rpTarget) return;
  const amt=parseFloat(document.getElementById('rp-amount').value)||0;
  if(amt<=0){toast('Enter a valid amount','error');return;}
  const pay={
    id:uid(),
    date:document.getElementById('rp-date').value,
    amount:amt,
    method:document.getElementById('rp-method').value,
    notes:document.getElementById('rp-notes').value.trim(),
  };
  if(_rpTarget.type==='inv'){
    pay.invoiceId=_rpTarget.id;
    invoicePayments.push(pay);
    dbSave('invoicePayments',pay);
    autoUpdateInvStatus(_rpTarget.id);
    closeRecordPayment();
    openFDInvoice(_rpTarget.id);
  } else {
    pay.billId=_rpTarget.id;
    vendorBillPayments.push(pay);
    dbSave('vendorBillPayments',pay);
    autoUpdateBillStatus(_rpTarget.id);
    closeRecordPayment();
    openFDBill(_rpTarget.id);
  }
  updateFDStats();
  toast('Payment recorded','success');
}

// ── New Invoice modal ──
function nextInvoiceNumber(){
  const yr=new Date().getFullYear();
  const pfx=`INV-${yr}-`;
  const nums=invoices.filter(i=>i.invoiceNumber&&i.invoiceNumber.startsWith(pfx))
    .map(i=>parseInt(i.invoiceNumber.replace(pfx,''))||0);
  const next=(nums.length?Math.max(...nums):0)+1;
  return pfx+String(next).padStart(3,'0');
}

function openNewInvoiceModal(){
  // Populate project select — exclude stock projects (never client-invoiced);
  // job + outbound are billable (outbound = the pallet buyer). See project types.
  const sel=document.getElementById('ni-project');
  sel.innerHTML='<option value="">— Select Project —</option>';
  projects.filter(p=>(p.type||'job')!=='stock').forEach(p=>{
    const opt=document.createElement('option');
    opt.value=p.id;
    const cl=p.clientId?clients.find(c=>c.id===p.clientId):null;
    const cn=cl?cl.name:[p.firstName,p.lastName].filter(Boolean).join(' ');
    opt.textContent=p.name+(cn?' — '+cn:'');
    sel.appendChild(opt);
  });
  document.getElementById('ni-num').value=nextInvoiceNumber();
  document.getElementById('ni-date').valueAsDate=new Date();
  const due=new Date(); due.setDate(due.getDate()+30);
  document.getElementById('ni-due').valueAsDate=due;
  document.getElementById('ni-status').value='Draft';
  document.getElementById('ni-notes').value='';
  document.getElementById('ni-scope-section').style.display='none';
  document.getElementById('ni-scope-list').innerHTML='';
  ['tax','tariff','shipping','labor'].forEach(f=>{
    _invCostMode[f]='$';
    const btn=document.getElementById('ni-'+f+'-mode');
    const inp=document.getElementById('ni-'+f+'-val');
    if(btn) btn.textContent='$';
    if(inp){inp.value='';inp.placeholder='0.00';inp.step='0.01';}
    const calc=document.getElementById('ni-'+f+'-calc');
    if(calc) calc.textContent='';
  });
  niUpdateTotal();
  niCheckReady();
  document.getElementById('new-inv-modal').style.display='flex';
}

function niProjectChanged(){
  const projId=document.getElementById('ni-project').value;
  const section=document.getElementById('ni-scope-section');
  const list=document.getElementById('ni-scope-list');
  if(!projId){section.style.display='none';list.innerHTML='';niUpdateTotal();return;}
  const items=projectItems.filter(i=>i.projectId===projId);
  if(!items.length){section.style.display='none';list.innerHTML='';niUpdateTotal();return;}
  section.style.display='';
  list.innerHTML=items.map(item=>{
    const lineTotal=(item.qty||0)*(item.unitPrice||0);
    return `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border);" id="ni-sc-row-${item.id}">
      <input type="checkbox" data-scope-id="${item.id}" style="width:16px;height:16px;cursor:pointer;" onchange="niUpdateTotal()">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600">${escHtml(item.model||item.sku||'—')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(item.sku||'')} ${escHtml(item.manufacturer||'')}</div>
      </div>
      <input type="number" id="ni-sc-qty-${item.id}" value="${item.qty||1}" min="0" step="0.01"
        style="width:60px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;text-align:center;"
        oninput="niUpdateTotal()">
      <input type="number" id="ni-sc-price-${item.id}" value="${parseFloat(item.unitPrice||0).toFixed(2)}" min="0" step="0.01"
        style="width:80px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;text-align:right;"
        oninput="niUpdateTotal()">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent3);width:80px;text-align:right" id="ni-sc-lt-${item.id}">${fdFmt(lineTotal)}</div>
    </div>`;
  }).join('');
  niUpdateTotal();
}

function niGetSubtotal(){
  let total=0;
  document.querySelectorAll('#ni-scope-list input[type=checkbox]:checked').forEach(cb=>{
    const id=cb.dataset.scopeId;
    const qty=parseFloat(document.getElementById('ni-sc-qty-'+id)?.value)||0;
    const price=parseFloat(document.getElementById('ni-sc-price-'+id)?.value)||0;
    total+=qty*price;
  });
  return total;
}

function niGetAmount(field){
  const val=parseFloat(document.getElementById('ni-'+field+'-val').value)||0;
  return _invCostMode[field]==='%'?val/100*niGetSubtotal():val;
}

// Raw entered value (a percentage when mode is %, dollars when $). Stored alongside
// *Mode so the %-aware readers (invGrand / detail view) re-derive the amount; storing
// the computed amount here instead would be double-counted by those readers.
function niGetRaw(field){ return parseFloat(document.getElementById('ni-'+field+'-val').value)||0; }

function niToggleMode(field){
  const inp=document.getElementById('ni-'+field+'-val');
  const btn=document.getElementById('ni-'+field+'-mode');
  const sub=niGetSubtotal();
  if(_invCostMode[field]==='$'){
    const amt=parseFloat(inp.value)||0;
    _invCostMode[field]='%';
    btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):'';
    inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    _invCostMode[field]='$';
    btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2);
    inp.placeholder='0.00'; inp.step='0.01';
  }
  niUpdateTotal();
}

function niUpdateTotal(){
  const sub=niGetSubtotal();
  const tax=niGetAmount('tax'), tariff=niGetAmount('tariff'), ship=niGetAmount('shipping'), labor=niGetAmount('labor');
  const grand=sub+tax+tariff+ship+labor;
  document.getElementById('ni-subtotal-disp').textContent=fdFmt(sub);
  document.getElementById('ni-total').textContent=fdFmt(grand);
  ['tax','tariff','shipping','labor'].forEach(f=>{
    const calc=document.getElementById('ni-'+f+'-calc');
    if(calc) calc.textContent=_invCostMode[f]==='%'?'= '+fdFmt(niGetAmount(f)):'';
  });
  niCheckReady();
}

function niCheckReady(){
  const num=document.getElementById('ni-num').value.trim();
  const proj=document.getElementById('ni-project').value;
  const anyChecked=!![...document.querySelectorAll('#ni-scope-list input[type=checkbox]:checked')].length;
  const btn=document.getElementById('ni-confirm-btn');
  if(btn) btn.disabled=!(num&&proj&&anyChecked);
}

function closeNewInvoiceModal(){
  document.getElementById('new-inv-modal').style.display='none';
}

function confirmNewInvoice(){
  const num=document.getElementById('ni-num').value.trim();
  if(!num){toast('Invoice number required','error');return;}
  if(invoices.find(i=>i.invoiceNumber===num)){toast('Invoice '+num+' already exists','error');return;}
  const projId=document.getElementById('ni-project').value;
  const proj=projects.find(p=>p.id===projId);
  let cn='';
  if(proj?.clientId){
    const cl=clients.find(c=>c.id===proj.clientId);
    if(cl) cn=cl.name||[cl.firstName,cl.lastName].filter(Boolean).join(' ');
  }
  if(!cn) cn=proj?[proj.firstName,proj.lastName].filter(Boolean).join(' '):'';
  const sub=niGetSubtotal();
  const invId=uid();
  const inv={
    id:invId,
    invoiceNumber:num,
    projectId:projId,
    clientName:cn||proj?.name||'',
    date:document.getElementById('ni-date').value,
    dueDate:document.getElementById('ni-due').value,
    status:document.getElementById('ni-status').value,
    subtotal:sub,
    tax:niGetRaw('tax'), taxMode:_invCostMode.tax,
    tariff:niGetRaw('tariff'), tariffMode:_invCostMode.tariff,
    shipping:niGetRaw('shipping'), shippingMode:_invCostMode.shipping,
    labor:niGetRaw('labor'), laborMode:_invCostMode.labor,
    notes:document.getElementById('ni-notes').value.trim(),
  };
  invoices.push(inv);
  dbSave('invoices',inv);
  // Collect checked scope items
  document.querySelectorAll('#ni-scope-list input[type=checkbox]:checked').forEach(cb=>{
    const scopeId=cb.dataset.scopeId;
    const si=projectItems.find(i=>i.id===scopeId); if(!si) return;
    const qty=parseFloat(document.getElementById('ni-sc-qty-'+scopeId)?.value)||0;
    const price=parseFloat(document.getElementById('ni-sc-price-'+scopeId)?.value)||0;
    const item={
      id:uid(), invoiceId:invId, scopeItemId:scopeId,
      sku:si.sku||'', description:si.model||si.sku||'',
      qty, unitPrice:price, notes:'',
    };
    invoiceItems.push(item);
    dbSave('invoiceItems',item);
  });
  closeNewInvoiceModal();
  renderFDPage();
  toast('Invoice '+num+' created','success');
  showPage('fd');
  setTimeout(()=>openFDInvoice(invId),100);
}

// ── New Vendor Bill modal ──
function openNewBillFromPO(){
  _nbFromPO=true;
  _nbLinkedPO='';
  const openPOs=orders.filter(o=>o.status!=='Cancelled');
  if(!openPOs.length){toast('No POs found','error');return;}
  document.getElementById('nb-modal-title').textContent='New Vendor Bill — From PO';
  document.getElementById('nb-vendor').value='';
  document.getElementById('nb-num').value='';
  document.getElementById('nb-date').valueAsDate=new Date();
  const due=new Date(); due.setDate(due.getDate()+30);
  document.getElementById('nb-due').valueAsDate=due;
  document.getElementById('nb-status').value='Received';
  document.getElementById('nb-notes').value='';
  document.getElementById('nb-po-row').style.display='';
  // Populate PO picker (most recent first)
  const picker=document.getElementById('nb-po-num');
  picker.innerHTML='<option value="">— Select a PO to bill from —</option>';
  [...openPOs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(o=>{
    const opt=document.createElement('option');
    opt.value=o.poNumber;
    opt.textContent=`PO ${o.poNumber} — ${o.vendor}${o.projectName?' ('+o.projectName+')':''}${o.date?' · '+o.date:''}`;
    picker.appendChild(opt);
  });
  newBillItems=[];
  nbRenderItems();
  _resetBillCosts();
  nbCheckReady();
  document.getElementById('new-bill-modal').style.display='flex';
}

function openNewBillManual(){
  _nbFromPO=false;
  _nbLinkedPO='';
  document.getElementById('nb-modal-title').textContent='New Vendor Bill (Manual)';
  document.getElementById('nb-vendor').value='';
  document.getElementById('nb-num').value='';
  document.getElementById('nb-date').valueAsDate=new Date();
  const due=new Date(); due.setDate(due.getDate()+30);
  document.getElementById('nb-due').valueAsDate=due;
  document.getElementById('nb-status').value='Received';
  document.getElementById('nb-notes').value='';
  document.getElementById('nb-po-row').style.display='none';
  document.getElementById('nb-po-num').value='';
  document.getElementById('nb-add-item-row').style.display='flex';
  newBillItems=[];
  nbRenderItems();
  _resetBillCosts();
  nbCheckReady();
  document.getElementById('new-bill-modal').style.display='flex';
}

function openNewBillFromPONum(poNum){
  _nbFromPO=true;
  _loadBillFromPO(poNum);
}

function _loadBillFromPO(poNum){
  if(!poNum) return;
  const po=orders.find(o=>o.poNumber===poNum);
  if(!po){toast('PO not found','error');return;}
  _nbLinkedPO=poNum;
  // Ensure picker is populated (needed when called directly via openNewBillFromPONum)
  const picker=document.getElementById('nb-po-num');
  if(picker.tagName==='SELECT' && !picker.querySelector(`option[value="${poNum}"]`)){
    const openPOs=orders.filter(o=>o.status!=='Cancelled');
    picker.innerHTML='<option value="">— Select a PO to bill from —</option>';
    [...openPOs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o.poNumber;
      opt.textContent=`PO ${o.poNumber} — ${o.vendor}${o.projectName?' ('+o.projectName+')':''}${o.date?' · '+o.date:''}`;
      picker.appendChild(opt);
    });
  }
  if(picker.tagName==='SELECT') picker.value=poNum;
  document.getElementById('nb-modal-title').textContent='New Vendor Bill — From PO '+poNum;
  document.getElementById('nb-vendor').value=po.vendor||'';
  document.getElementById('nb-num').value='';
  document.getElementById('nb-date').valueAsDate=new Date();
  const due=new Date(); due.setDate(due.getDate()+30);
  document.getElementById('nb-due').valueAsDate=due;
  document.getElementById('nb-status').value='Received';
  document.getElementById('nb-notes').value='';
  document.getElementById('nb-po-row').style.display='';
  document.getElementById('nb-add-item-row').style.display='flex';
  // Pre-fill items from PO
  const poItems=orderItems.filter(i=>i.poNumber===poNum);
  newBillItems=poItems.map(i=>({
    id:uid(), poItemId:i.id,
    sku:i.sku||'',
    description:i.description||(i.model?`${i.manufacturer||''} ${i.model}`.trim():i.sku||''),
    qty:i.qtyOrdered||1, unitCost:i.unitCost||0, notes:'',
  }));
  nbRenderItems();
  // Pre-fill costs from PO
  _resetBillCosts();
  if(po.tax){document.getElementById('nb-tax-val').value=po.tax.toFixed(2);}
  if(po.tariff){document.getElementById('nb-tariff-val').value=po.tariff.toFixed(2);}
  if(po.shipping){document.getElementById('nb-shipping-val').value=po.shipping.toFixed(2);}
  nbUpdateTotal();
  nbCheckReady();
  document.getElementById('new-bill-modal').style.display='flex';
}

function _resetBillCosts(){
  _billCostMode={tax:'$',tariff:'$',shipping:'$'};
  ['tax','tariff','shipping'].forEach(f=>{
    const btn=document.getElementById('nb-'+f+'-mode');
    const inp=document.getElementById('nb-'+f+'-val');
    const calc=document.getElementById('nb-'+f+'-calc');
    if(btn) btn.textContent='$';
    if(inp){inp.value='';inp.placeholder='0.00';inp.step='0.01';}
    if(calc) calc.textContent='';
  });
  nbUpdateTotal();
}

function nbAddItem(){
  const desc=document.getElementById('nb-item-desc').value.trim();
  const qty=parseFloat(document.getElementById('nb-item-qty').value)||1;
  const cost=parseFloat(document.getElementById('nb-item-cost').value)||0;
  if(!desc){toast('Description required','error');return;}
  newBillItems.push({id:uid(),poItemId:'',sku:'',description:desc,qty,unitCost:cost,notes:''});
  document.getElementById('nb-item-desc').value='';
  document.getElementById('nb-item-qty').value='1';
  document.getElementById('nb-item-cost').value='';
  nbRenderItems();
  nbUpdateTotal();
  nbCheckReady();
}

function nbRemoveItem(idx){
  newBillItems.splice(idx,1);
  nbRenderItems();
  nbUpdateTotal();
  nbCheckReady();
}

function nbRenderItems(){
  const el=document.getElementById('nb-items-list'); if(!el) return;
  if(!newBillItems.length){el.innerHTML=`<div style="padding:12px 14px;font-size:12px;color:var(--text-dim)">No items yet.</div>`;return;}
  el.innerHTML=newBillItems.map((item,idx)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);">
    <div style="flex:1;font-size:12px">${escHtml(item.description)}</div>
    <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">×${item.qty}</span>
    <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent2)">${fdFmt(item.unitCost)}</span>
    <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent3)">${fdFmt(item.qty*item.unitCost)}</span>
    <button class="btn-del" onclick="nbRemoveItem(${idx})">✕</button>
  </div>`).join('');
}

function nbGetSubtotal(){
  return newBillItems.reduce((s,i)=>s+(i.qty||0)*(i.unitCost||0),0);
}

function nbGetAmount(field){
  const val=parseFloat(document.getElementById('nb-'+field+'-val').value)||0;
  return _billCostMode[field]==='%'?val/100*nbGetSubtotal():val;
}

// Raw entered value (percentage or dollars) — stored with *Mode; see niGetRaw.
function nbGetRaw(field){ return parseFloat(document.getElementById('nb-'+field+'-val').value)||0; }

function nbToggleMode(field){
  const inp=document.getElementById('nb-'+field+'-val');
  const btn=document.getElementById('nb-'+field+'-mode');
  const sub=nbGetSubtotal();
  if(_billCostMode[field]==='$'){
    const amt=parseFloat(inp.value)||0;
    _billCostMode[field]='%';
    btn.textContent='%';
    inp.value=sub>0?(amt/sub*100).toFixed(4):'';
    inp.placeholder='0.000%'; inp.step='0.001';
  } else {
    const pct=parseFloat(inp.value)||0;
    _billCostMode[field]='$';
    btn.textContent='$';
    inp.value=(pct/100*sub).toFixed(2);
    inp.placeholder='0.00'; inp.step='0.01';
  }
  nbUpdateTotal();
}

function nbUpdateTotal(){
  const sub=nbGetSubtotal();
  const grand=sub+nbGetAmount('tax')+nbGetAmount('tariff')+nbGetAmount('shipping');
  document.getElementById('nb-subtotal-disp').textContent=fdFmt(sub);
  document.getElementById('nb-total').textContent=fdFmt(grand);
  ['tax','tariff','shipping'].forEach(f=>{
    const calc=document.getElementById('nb-'+f+'-calc');
    if(calc) calc.textContent=_billCostMode[f]==='%'?'= '+fdFmt(nbGetAmount(f)):'';
  });
}

function nbCheckReady(){
  const num=document.getElementById('nb-num').value.trim();
  const vendor=document.getElementById('nb-vendor').value.trim();
  const btn=document.getElementById('nb-confirm-btn');
  if(btn) btn.disabled=!(num&&vendor&&newBillItems.length);
}

function closeNewBillModal(){
  document.getElementById('new-bill-modal').style.display='none';
  newBillItems=[];
  _nbFromPO=false;
  _nbLinkedPO='';
}

function confirmNewBill(){
  const num=document.getElementById('nb-num').value.trim();
  const vendor=document.getElementById('nb-vendor').value.trim();
  if(!num||!vendor){toast('Bill number and vendor are required','error');return;}
  if(vendorBills.find(b=>b.billNumber===num)){toast('Bill '+num+' already exists','error');return;}
  if(!newBillItems.length){toast('Add at least one item','error');return;}
  const sub=nbGetSubtotal();
  const billId=uid();
  const bill={
    id:billId,
    billNumber:num,
    poNumber:_nbLinkedPO||'',
    vendor, vendorId:resolveVendorId(vendor),
    date:document.getElementById('nb-date').value,
    dueDate:document.getElementById('nb-due').value,
    status:document.getElementById('nb-status').value,
    subtotal:sub,
    tax:nbGetRaw('tax'), taxMode:_billCostMode.tax,
    tariff:nbGetRaw('tariff'), tariffMode:_billCostMode.tariff,
    shipping:nbGetRaw('shipping'), shippingMode:_billCostMode.shipping,
    notes:document.getElementById('nb-notes').value.trim(),
  };
  vendorBills.push(bill);
  dbSave('vendorBills',bill);
  newBillItems.forEach(item=>{
    const bi={id:item.id,billId,poItemId:item.poItemId||'',sku:item.sku||'',description:item.description,qty:item.qty,unitCost:item.unitCost,notes:item.notes||''};
    vendorBillItems.push(bi);
    dbSave('vendorBillItems',bi);
  });
  closeNewBillModal();
  renderFDPage();
  toast('Bill '+num+' created','success');
  showPage('fd');
  setFDTab('bills');
  setTimeout(()=>openFDBill(billId),100);
}

// ── Clients ──────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════
// CLIENT HIERARCHY TREE  (Client → Location → Project)
// Mirrors the warehouse Locations tree: fully-rendered nested divs; expand
// state lives in the DOM (display) and is captured/restored around re-renders.
// clientLocations = work sites (distinct from the warehouse `locations` table).
// ══════════════════════════════════════════════════════════════════════════
let _fdLocEditId=null, _fdLocClientId=null, _fdApLocId=null, _fdMoveProjId=null;

// Front Desk view filter: 'scope' (default — only clients with a project that has
// scope items) | 'all' (every client + the Unassigned Projects section).
let fdFilter='scope';
function setFDFilter(f){
  fdFilter=f;
  ['all','scope'].forEach(x=>{
    const btn=document.getElementById('fdf-'+x);
    if(btn){ btn.style.background=x===f?'var(--accent)':'transparent'; btn.style.color=x===f?'#fff':'var(--text-muted)'; }
  });
  renderFDClientsTable();
}
function _fdScopeProjIds(){ const s=new Set(); for(const pi of projectItems) if(pi.projectId) s.add(pi.projectId); return s; }
function fdClientHasScope(clientId, scopeSet){
  const locIds=new Set(clientLocations.filter(l=>l.clientId===clientId).map(l=>l.id));
  return projects.some(p=>locIds.has(p.clientLocationId) && scopeSet.has(p.id));
}

// ── Client name ordering (directory style) ───────────────────────────────────
// The front desk lists clients "Last, First". The structured firstName/lastName
// fields win when they are filled in; otherwise the surname is taken as the last
// word of the stored name, skipping a trailing generational suffix. A name that
// reads as an organisation is left alone — inverting "Acme AV Group" into
// "Group, Acme AV" would be worse than leaving it unsorted by surname.
const _FD_NAME_SUFFIXES=new Set(['jr','jr.','sr','sr.','ii','iii','iv','md','m.d.','phd','ph.d.','esq','esq.','dds']);
const _FD_ORG_MARKERS=/\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|co|co\.|company|ltd|ltd\.|lp|llp|pllc|trust|group|partners|properties|associates|holdings|foundation|av|systems|design|designs|builders|construction)\b|&/i;

// {last, first} for a client, or null when the name should not be inverted.
function _fdSplitClientName(c){
  const first=(c.firstName||'').trim(), last=(c.lastName||'').trim();
  if(last) return {last, first};
  const name=(c.name||'').trim();
  if(!name || _FD_ORG_MARKERS.test(name)) return null;
  const parts=name.split(/\s+/);
  // Walk back past a suffix so "First Last Jr" surnames on Last, not Jr.
  let end=parts.length-1;
  while(end>0 && _FD_NAME_SUFFIXES.has(parts[end].toLowerCase())) end--;
  if(end<1) return null;  // one word — a mononym, or an org the markers missed
  return {last:parts[end], first:parts.slice(0,end).concat(parts.slice(end+1)).join(' ')};
}

// "Last, First" — used for both the label and the sort key, so the list reads
// in the order it is sorted. Falls back to the stored name.
function fdClientDisplayName(c){
  const n=_fdSplitClientName(c);
  return n ? [n.last, n.first].filter(Boolean).join(', ') : (c.name||'');
}

// Default client stays pinned to the top; the rest go A-Z by surname.
function _fdClientOrder(a,b){
  return (b.isDefault?1:0)-(a.isDefault?1:0) ||
    fdClientDisplayName(a).localeCompare(fdClientDisplayName(b),undefined,{sensitivity:'base'});
}

function fdLocationsOf(clientId){
  return clientLocations.filter(l=>l.clientId===clientId)
    .sort((a,b)=>(b.isDefault?1:0)-(a.isDefault?1:0) || (a.name||'').localeCompare(b.name||''));
}
// Pin the default folders (Main, Change Order, Service) to the top, then A–Z.
const _FD_FOLDER_ORDER={'main':0,'change order':1,'service':2};
function _fdProjRank(p){ const k=(p.name||'').trim().toLowerCase(); return (k in _FD_FOLDER_ORDER)?_FD_FOLDER_ORDER[k]:9; }
function fdProjectsOf(locId){
  return projects.filter(p=>p.clientLocationId===locId)
    .sort((a,b)=>_fdProjRank(a)-_fdProjRank(b) || (a.name||'').localeCompare(b.name||''));
}
function fdClientProjCount(clientId){
  const locIds=new Set(clientLocations.filter(l=>l.clientId===clientId).map(l=>l.id));
  return projects.filter(p=>locIds.has(p.clientLocationId)).length;
}
function _fdLocClient(locId){ const l=clientLocations.find(x=>x.id===locId); return l?l.clientId:''; }

function renderFDClientsTable(){
  const setupRow=document.getElementById('fd-clients-setup-row');
  if(setupRow) setupRow.style.display=clients.length===0?'':'none';
  const chip=document.getElementById('fd-clients-total-chip');
  const host=document.getElementById('fd-clients-tree'); if(!host) return;
  const open=fdCaptureExpanded();

  const q=(fdClientsFilterQuery||'').toLowerCase();
  const matchClient=c=>{
    if(!q) return true;
    if([c.name,c.firstName,c.lastName,c.phone,c.email,c.address].filter(Boolean).join(' ').toLowerCase().includes(q)) return true;
    const locs=fdLocationsOf(c.id);
    if(locs.some(l=>(l.name||'').toLowerCase().includes(q))) return true;
    const locIds=new Set(locs.map(l=>l.id));
    return projects.some(p=>locIds.has(p.clientLocationId)&&(p.name||'').toLowerCase().includes(q));
  };
  const scopeSet = fdFilter==='scope' ? _fdScopeProjIds() : null;
  const list=clients.slice()
    .sort(_fdClientOrder)
    .filter(matchClient)
    .filter(c=>fdFilter!=='scope' || fdClientHasScope(c.id, scopeSet));
  if(chip) chip.innerHTML=list.length+' <span>'+(fdFilter==='scope'?'with scope':'clients')+'</span>';

  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const fmt=n=>n?'$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','):'';
  const sc=s=>s==='Open'?'tag-s':s==='In Progress'?'tag-m':'tag-Complete';

  const caret=(id,has)=>has
    ? `<span onclick="event.stopPropagation();fdTreeToggle('${id}')" id="fd-caret-${id}" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;background:var(--surface3);color:var(--text-muted);font-size:9px;cursor:pointer;flex-shrink:0;transition:transform 0.15s;">▶</span>`
    : `<span style="display:inline-block;width:16px;flex-shrink:0;"></span>`;
  const actBtn=(onclick,color,label)=>`<button onclick="event.stopPropagation();${onclick}" style="font-size:10px;padding:2px 6px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;color:${color};cursor:pointer;font-family:var(--font-ui);">${label}</button>`;
  const rowWrap=(inner)=>`<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid transparent;"
      onmouseover="this.style.background='var(--surface2)';this.style.borderColor='var(--border)';var a=this.querySelector('.fd-actions');if(a)a.style.opacity='1'"
      onmouseout="this.style.background='';this.style.borderColor='transparent';var a=this.querySelector('.fd-actions');if(a)a.style.opacity='0'">${inner}</div>`;

  const projHtml=(p)=>{
    const id=sk(p.id);
    const scN=projectItems.filter(i=>i.projectId===p.id).length;
    return `<div style="margin-left:40px;">${rowWrap(`
      <span style="display:inline-block;width:16px;flex-shrink:0;"></span>
      <span onclick="projNavSource='fd';showPage('proj');setTimeout(()=>openProject('${id}'),40)" style="font-size:13px;color:var(--accent);cursor:pointer;">${escHtml(p.name)}</span>
      <span class="tag ${sc(p.status)}" style="font-size:9px;">${escHtml(p.status||'Open')}</span>
      <span style="font-size:10px;color:var(--text-dim);">${scN} item${scN===1?'':'s'}</span>
      ${p.contractValue?`<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);">${fmt(p.contractValue)}</span>`:''}
      <div class="fd-actions" style="display:flex;gap:3px;opacity:0;transition:opacity 0.1s;margin-left:8px;">
        ${actBtn(`fdMoveProject('${id}')`,'var(--accent)','⇄ MOVE')}
        ${actBtn(`fdRemoveProjectFromLocation('${id}')`,'var(--accent4)','🗑')}
      </div>`)}</div>`;
  };
  const locHtml=(l)=>{
    const id=sk(l.id);
    const ps=fdProjectsOf(l.id);
    return `<div style="margin-left:20px;">${rowWrap(`
      ${caret(id,ps.length>0)}
      <span onclick="event.stopPropagation();fdTreeToggle('${id}')" style="font-size:13px;font-weight:500;cursor:pointer;">${escHtml(l.name)}</span>
      ${l.isDefault?`<span style="font-size:9px;padding:1px 5px;background:rgba(79,142,247,0.1);color:var(--accent);border:1px solid rgba(79,142,247,0.2);border-radius:3px;">DEFAULT</span>`:''}
      <span style="font-size:10px;color:var(--text-dim);">${ps.length} proj</span>
      <div class="fd-actions" style="display:flex;gap:3px;opacity:0;transition:opacity 0.1s;margin-left:8px;">
        ${actBtn(`fdAddProjectToLocation('${id}')`,'var(--accent)','+ PROJECT')}
        ${actBtn(`fdEditLocation('${id}')`,'var(--text-muted)','✎')}
        ${actBtn(`fdDeleteLocation('${id}')`,'var(--accent4)','🗑')}
      </div>`)}
      <div id="fd-children-${id}" style="display:none;">${ps.map(projHtml).join('')||'<div style="margin-left:40px;padding:6px 8px;font-size:11px;color:var(--text-dim);">No projects — use + PROJECT.</div>'}</div>
    </div>`;
  };
  const clientHtml=(c)=>{
    const id=sk(c.id);
    const locs=fdLocationsOf(c.id);
    const pc=fdClientProjCount(c.id);
    return `<div>${rowWrap(`
      ${caret(id,locs.length>0)}
      <span onclick="event.stopPropagation();fdTreeToggle('${id}')" style="font-size:14px;font-weight:600;cursor:pointer;">${escHtml(fdClientDisplayName(c))}</span>
      ${c.isDefault?`<span class="tag tag-s" style="font-size:9px;padding:1px 6px;">Default</span>`:''}
      <span style="font-size:10px;color:var(--text-dim);">${locs.length} loc · ${pc} proj</span>
      <div class="fd-actions" style="display:flex;gap:3px;opacity:0;transition:opacity 0.1s;margin-left:8px;">
        ${actBtn(`fdAddLocation('${id}')`,'var(--accent)','+ LOCATION')}
        ${actBtn(`editClient('${id}')`,'var(--text-muted)','✎')}
        ${actBtn(`deleteClient('${id}')`,'var(--accent4)','🗑')}
      </div>`)}
      <div id="fd-children-${id}" style="display:none;">${locs.map(locHtml).join('')||'<div style="margin-left:20px;padding:6px 8px;font-size:11px;color:var(--text-dim);">No locations — use + LOCATION.</div>'}</div>
    </div>`;
  };

  // Unassigned projects (no clientLocationId) — reachable + movable so nothing is lost.
  const unfiled=projects.filter(p=>!p.clientLocationId);
  let unassignedHtml='';
  if(unfiled.length && fdFilter==='all'){
    const id='unassigned';
    unassignedHtml=`<div style="margin-top:8px;border-top:1px dashed var(--border);padding-top:8px;">${rowWrap(`
      ${caret(id,true)}
      <span onclick="event.stopPropagation();fdTreeToggle('${id}')" style="font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;">— Unassigned Projects —</span>
      <span style="font-size:10px;color:var(--text-dim);">${unfiled.length}</span>`)}
      <div id="fd-children-${id}" style="display:none;">${unfiled.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(projHtml).join('')}</div>
    </div>`;
  }

  host.innerHTML=(list.length
    ? list.map(clientHtml).join('')
    : `<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px;">${clients.length?'No clients match search.':'No clients yet. Click "+ New Client".'}</div>`)
    + unassignedHtml;
  fdRestoreExpanded(open);
  if(q) fdTreeExpandAll(); // reveal matches while searching
}

// ── Tree expand/collapse (DOM-held state, like the Locations tree) ──
function fdTreeToggle(id){
  const ch=document.getElementById('fd-children-'+id), car=document.getElementById('fd-caret-'+id);
  if(!ch) return;
  const opening=ch.style.display==='none'||ch.style.display==='';
  ch.style.display=opening?'block':'none';
  if(car) car.style.transform=opening?'rotate(90deg)':'rotate(0deg)';
}
function fdTreeExpandAll(){
  const host=document.getElementById('fd-clients-tree'); if(!host) return;
  host.querySelectorAll('[id^="fd-children-"]').forEach(el=>el.style.display='block');
  host.querySelectorAll('[id^="fd-caret-"]').forEach(el=>el.style.transform='rotate(90deg)');
}
function fdTreeCollapseAll(){
  const host=document.getElementById('fd-clients-tree'); if(!host) return;
  host.querySelectorAll('[id^="fd-children-"]').forEach(el=>el.style.display='none');
  host.querySelectorAll('[id^="fd-caret-"]').forEach(el=>el.style.transform='rotate(0deg)');
}
function fdCaptureExpanded(){
  const host=document.getElementById('fd-clients-tree'); if(!host) return new Set();
  const open=new Set();
  host.querySelectorAll('[id^="fd-children-"]').forEach(el=>{ if(el.style.display==='block') open.add(el.id.replace('fd-children-','')); });
  return open;
}
function fdRestoreExpanded(open){
  if(!open||!open.size) return;
  open.forEach(id=>{ const ch=document.getElementById('fd-children-'+id), car=document.getElementById('fd-caret-'+id); if(ch)ch.style.display='block'; if(car)car.style.transform='rotate(90deg)'; });
}

// Expand the tree down to a project's client + location (used by the project "← Back" button).
function _fdExpandToProject(projId){
  const p=projects.find(x=>x.id===projId); if(!p||!p.clientLocationId) return;
  const loc=clientLocations.find(l=>l.id===p.clientLocationId); if(!loc) return;
  // The default 'scope' filter hides clients with no scoped projects — switch to 'all' if needed.
  if(!document.getElementById('fd-children-'+loc.clientId) && typeof setFDFilter==='function') setFDFilter('all');
  [loc.clientId, loc.id].forEach(id=>{
    const ch=document.getElementById('fd-children-'+id), car=document.getElementById('fd-caret-'+id);
    if(ch) ch.style.display='block';
    if(car) car.style.transform='rotate(90deg)';
  });
  const car=document.getElementById('fd-caret-'+loc.clientId);
  if(car && car.scrollIntoView) car.scrollIntoView({block:'center'});
}

// ── Shared lightweight overlay (built on the fly, like the deployments log) ──
function _fdCloseOverlay(){ const o=document.getElementById('fd-overlay'); if(o) o.remove(); }
function _fdOverlay(inner){
  _fdCloseOverlay();
  const ov=document.createElement('div'); ov.id='fd-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:300;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px;';
  ov.onclick=e=>{ if(e.target===ov) _fdCloseOverlay(); };
  ov.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border-bright);border-radius:12px;width:460px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.5);">${inner}</div>`;
  document.body.appendChild(ov);
  return ov;
}

// ── Location CRUD ──
function fdAddLocation(clientId){ _fdLocOpen(clientId,null); }
function fdEditLocation(locId){ const l=clientLocations.find(x=>x.id===locId); if(l) _fdLocOpen(l.clientId,l); }
function _fdLocOpen(clientId, loc){
  _fdLocClientId=clientId; _fdLocEditId=loc?loc.id:null;
  const c=clients.find(x=>x.id===clientId);
  const v=k=>escHtml((loc&&loc[k])||'');
  _fdOverlay(`
    <div style="padding:20px 22px 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">${loc?'Edit':'New'} Location${c?` · ${escHtml(c.name)}`:''}</div>
      <button onclick="_fdCloseOverlay()" style="background:none;border:none;color:var(--text-muted);font-size:17px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px 22px 22px;display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
      <div style="grid-column:1/-1"><label class="fl">Location Name <span style="color:var(--accent4);font-size:8px">*</span></label>
        <input class="plain-input" id="fd-loc-name" value="${v('name')}" placeholder="Main, Lake House, Office…" oninput="document.getElementById('fd-loc-save').disabled=!this.value.trim()"></div>
      <div style="grid-column:1/-1"><label class="fl">Street</label><input class="plain-input" id="fd-loc-street" value="${v('street')}"></div>
      <div><label class="fl">City</label><input class="plain-input" id="fd-loc-city" value="${v('city')}"></div>
      <div><label class="fl">State</label><input class="plain-input" id="fd-loc-state" value="${v('state')}"></div>
      <div><label class="fl">ZIP</label><input class="plain-input" id="fd-loc-zip" value="${v('zip')}"></div>
      <div style="grid-column:1/-1"><label class="fl">Phone</label><input class="plain-input" id="fd-loc-phone" value="${v('phone')}"></div>
      <div style="grid-column:1/-1"><label class="fl">Notes</label><input class="plain-input" id="fd-loc-notes" value="${v('notes')}"></div>
    </div>
    <div style="padding:0 22px 20px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="_fdCloseOverlay()">Cancel</button>
      <button class="btn" id="fd-loc-save" ${loc?'':'disabled'} onclick="fdSaveLocation()" style="background:var(--accent);color:#fff;border:none;padding:9px 20px;border-radius:6px;font-weight:700;">Save</button>
    </div>`);
  setTimeout(()=>document.getElementById('fd-loc-name')?.focus(),50);
}
function fdSaveLocation(){
  const name=document.getElementById('fd-loc-name').value.trim(); if(!name){ toast('Location name required','error'); return; }
  const existing=clientLocations.find(l=>l.id===_fdLocEditId);
  const rec=Object.assign({}, existing||{}, {
    id:_fdLocEditId||uid(), clientId:_fdLocClientId, name,
    street:document.getElementById('fd-loc-street').value.trim(),
    city:document.getElementById('fd-loc-city').value.trim(),
    state:document.getElementById('fd-loc-state').value.trim(),
    zip:document.getElementById('fd-loc-zip').value.trim(),
    phone:document.getElementById('fd-loc-phone').value.trim(),
    notes:document.getElementById('fd-loc-notes').value.trim(),
    isDefault: existing?existing.isDefault:0,
  });
  if(_fdLocEditId){ const i=clientLocations.findIndex(l=>l.id===_fdLocEditId); if(i>=0) clientLocations[i]=rec; else clientLocations.push(rec); }
  else clientLocations.push(rec);
  dbSave('clientLocations',rec);
  _fdCloseOverlay(); renderFDClientsTable();
  toast(_fdLocEditId?'Location updated':'Location added','success');
}
function fdDeleteLocation(locId){
  const l=clientLocations.find(x=>x.id===locId); if(!l) return;
  const ps=fdProjectsOf(locId);
  if(!confirm(`Delete location "${l.name}"?${ps.length?`\n\nIts ${ps.length} project(s) will become Unassigned (not deleted).`:''}`)) return;
  ps.forEach(p=>{ p.clientLocationId=''; dbSave('projects',p); });
  clientLocations=clientLocations.filter(x=>x.id!==locId);
  dbDelete('clientLocations',locId);
  renderFDClientsTable(); renderProjTable();
  toast('Location deleted','success');
}

// ── Add / link a project under a location ──
function fdAddProjectToLocation(locId){
  _fdApLocId=locId;
  const l=clientLocations.find(x=>x.id===locId), c=l?clients.find(cl=>cl.id===l.clientId):null;
  const unfiled=projects.filter(p=>!p.clientLocationId).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  _fdOverlay(`
    <div style="padding:20px 22px 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">Add Project · ${escHtml((c?c.name+' / ':'')+(l?l.name:''))}</div>
      <button onclick="_fdCloseOverlay()" style="background:none;border:none;color:var(--text-muted);font-size:17px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px 22px 22px;display:flex;flex-direction:column;gap:16px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Create New</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input class="plain-input" id="fd-ap-name" placeholder="Project name *" oninput="document.getElementById('fd-ap-create').disabled=!this.value.trim()">
          <div style="display:flex;gap:8px;">
            <select class="plain-select" id="fd-ap-status" style="flex:1;"><option>Open</option><option>In Progress</option><option>Complete</option></select>
            <input class="plain-input" id="fd-ap-value" type="number" min="0" step="0.01" placeholder="Contract $" style="width:140px;">
          </div>
          <div style="display:flex;justify-content:flex-end;"><button class="btn" id="fd-ap-create" disabled onclick="fdCreateProjectInLocation()" style="background:var(--accent);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:700;font-size:12px;">Create</button></div>
        </div>
      </div>
      ${unfiled.length?`<div style="border-top:1px solid var(--border);padding-top:14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Move an Unassigned Project here</div>
        <div style="display:flex;gap:8px;">
          <select class="plain-select" id="fd-ap-existing" style="flex:1;"><option value="">— select —</option>${unfiled.map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join('')}</select>
          <button class="btn" onclick="fdLinkProjectToLocation()" style="background:rgba(79,142,247,0.15);color:var(--accent);border:1px solid rgba(79,142,247,0.35);font-size:12px;">Move</button>
        </div>
      </div>`:''}
    </div>`);
  setTimeout(()=>document.getElementById('fd-ap-name')?.focus(),50);
}
function fdCreateProjectInLocation(){
  const name=document.getElementById('fd-ap-name').value.trim(); if(!name){ toast('Project name required','error'); return; }
  const rec={ id:uid(), name, status:document.getElementById('fd-ap-status').value,
    contractValue:parseFloat(document.getElementById('fd-ap-value').value)||0,
    type:'job', clientLocationId:_fdApLocId, clientId:_fdLocClient(_fdApLocId) };
  projects.push(rec); dbSave('projects',rec);
  _fdCloseOverlay(); renderFDClientsTable(); renderProjTable(); if(typeof updateProjStats==='function') updateProjStats();
  toast('Project created','success');
}
function fdLinkProjectToLocation(){
  const pid=document.getElementById('fd-ap-existing').value; if(!pid){ toast('Select a project','error'); return; }
  const p=projects.find(x=>x.id===pid); if(!p) return;
  p.clientLocationId=_fdApLocId; p.clientId=_fdLocClient(_fdApLocId); dbSave('projects',p);
  _fdCloseOverlay(); renderFDClientsTable(); renderProjTable();
  toast('Project moved','success');
}

// ── Move a project to any location (across clients) ──
function fdMoveProject(projId){
  const p=projects.find(x=>x.id===projId); if(!p){ return; }
  _fdMoveProjId=projId;
  const opts=clients.slice().sort(_fdClientOrder).map(c=>{
    const locs=fdLocationsOf(c.id); if(!locs.length) return '';
    return `<optgroup label="${escHtml(fdClientDisplayName(c))}">${locs.map(l=>`<option value="${escHtml(l.id)}"${p.clientLocationId===l.id?' selected':''}>${escHtml(l.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  _fdOverlay(`
    <div style="padding:20px 22px 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">Move "${escHtml(p.name)}"</div>
      <button onclick="_fdCloseOverlay()" style="background:none;border:none;color:var(--text-muted);font-size:17px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px 22px 22px;">
      <label class="fl">Destination location</label>
      <select class="plain-select" id="fd-move-dest" style="width:100%;">${opts||'<option value="">(no locations exist yet)</option>'}</select>
    </div>
    <div style="padding:0 22px 20px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="_fdCloseOverlay()">Cancel</button>
      <button class="btn" onclick="fdConfirmMove()" style="background:var(--accent);color:#fff;border:none;padding:9px 20px;border-radius:6px;font-weight:700;">Move</button>
    </div>`);
}
function fdConfirmMove(){
  const p=projects.find(x=>x.id===_fdMoveProjId); if(!p) return;
  const dest=document.getElementById('fd-move-dest').value; if(!dest){ toast('Pick a destination','error'); return; }
  p.clientLocationId=dest; p.clientId=_fdLocClient(dest); dbSave('projects',p);
  _fdCloseOverlay(); renderFDClientsTable(); renderProjTable();
  toast('Project moved','success');
}
function fdRemoveProjectFromLocation(projId){
  const p=projects.find(x=>x.id===projId); if(!p) return;
  if(!confirm(`Remove "${p.name}" from its location? It becomes Unassigned (not deleted).`)) return;
  p.clientLocationId=''; p.clientId=''; dbSave('projects',p);
  renderFDClientsTable(); renderProjTable();
  toast('Project unfiled','success');
}

function openFDClientDetail(id){
  const c=clients.find(c=>c.id===id); if(!c) return;
  currentClientId=id;
  document.getElementById('fd-main-view').style.display='none';
  document.getElementById('fd-inv-detail-view').style.display='none';
  document.getElementById('fd-bill-detail-view').style.display='none';
  document.getElementById('fd-client-detail-view').style.display='flex';
  document.getElementById('fd-client-det-name').textContent=c.name;
  document.getElementById('fd-client-det-default-badge').innerHTML=c.isDefault?`<span class="tag tag-s" style="font-size:9px;padding:1px 6px;">Default</span>`:'';
  const meta=[[c.firstName,c.lastName].filter(Boolean).join(' '),c.address,c.phone,c.email].filter(Boolean).join(' · ');
  document.getElementById('fd-client-det-meta').textContent=meta||'No contact info';
  renderClientDetailProjects(id);
}

function renderClientDetailProjects(clientId){
  const tbody=document.getElementById('fd-client-det-projects'); if(!tbody) return;
  const linked=projects.filter(p=>p.clientId===clientId);
  if(!linked.length){
    tbody.innerHTML=`<tr><td colspan="4" style="padding:14px 10px;font-size:12px;color:var(--text-dim);text-align:center">No linked projects. Click "Add Project" above.</td></tr>`;
    return;
  }
  const fmt=n=>n?'$'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','):'—';
  const sc=s=>s==='Open'?'tag-s':s==='In Progress'?'tag-m':'tag-Complete';
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  tbody.innerHTML=linked.map(p=>`<tr>
    <td style="padding:8px 10px;font-size:13px;color:var(--accent);cursor:pointer;font-weight:600;" onclick="showPage('proj');setTimeout(()=>openProject('${sk(p.id)}'),50)">${escHtml(p.name)}</td>
    <td style="padding:8px 10px"><span class="tag ${sc(p.status)}">${escHtml(p.status)}</span></td>
    <td style="padding:8px 10px;font-family:var(--font-mono);font-size:12px;text-align:right">${fmt(p.contractValue)}</td>
    <td style="padding:8px 10px"><button class="btn-del" onclick="unlinkProjectFromClient('${sk(p.id)}')">✕</button></td>
  </tr>`).join('');
}

function fdClientDetailBack(){
  document.getElementById('fd-main-view').style.display='flex';
  document.getElementById('fd-client-detail-view').style.display='none';
  currentClientId=null;
  setFDTab('clients');
}

function unlinkProjectFromClient(projId){
  const p=projects.find(p=>p.id===projId); if(!p) return;
  p.clientId=''; p.clientLocationId='';
  dbSave('projects',p);
  if(currentClientId) renderClientDetailProjects(currentClientId);
  renderFDClientsTable();
  renderProjTable();
  toast('Project unlinked','success');
}

function openNewClientModal(){
  _clientEditId=null;
  document.getElementById('client-modal-title').textContent='New Client';
  ['client-name','client-first','client-last','client-street','client-city','client-state','client-zip','client-phone','client-email','client-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('client-isdefault').checked=false;
  document.getElementById('client-modal-save-btn').disabled=true;
  document.getElementById('client-modal').style.display='flex';
  setTimeout(()=>document.getElementById('client-name').focus(),50);
}

function editClient(id){
  const c=clients.find(c=>c.id===id); if(!c) return;
  _clientEditId=id;
  document.getElementById('client-modal-title').textContent='Edit Client';
  document.getElementById('client-name').value=c.name||'';
  document.getElementById('client-first').value=c.firstName||'';
  document.getElementById('client-last').value=c.lastName||'';
  document.getElementById('client-street').value=c.street||c.address||'';
  document.getElementById('client-city').value=c.city||'';
  document.getElementById('client-state').value=c.state||'';
  document.getElementById('client-zip').value=c.zip||'';
  document.getElementById('client-phone').value=c.phone||'';
  document.getElementById('client-email').value=c.email||'';
  document.getElementById('client-notes').value=c.notes||'';
  document.getElementById('client-isdefault').checked=!!c.isDefault;
  document.getElementById('client-modal-save-btn').disabled=false;
  document.getElementById('client-modal').style.display='flex';
}

function closeClientModal(){
  document.getElementById('client-modal').style.display='none';
}

function clientCheckReady(){
  document.getElementById('client-modal-save-btn').disabled=!document.getElementById('client-name').value.trim();
}

// Scaffold a brand-new client's default tree: a "Main" location holding the three
// default sibling folders (Main / Change Order / Service). Mirrors the backfill migration.
function _fdScaffoldNewClient(clientId, c){
  const locId=uid();
  const loc={ id:locId, clientId, name:'Main', isDefault:1,
    street:(c&&c.street)||'', city:(c&&c.city)||'', state:(c&&c.state)||'',
    zip:(c&&c.zip)||'', phone:(c&&c.phone)||'', notes:'' };
  clientLocations.push(loc); dbSave('clientLocations',loc);
  ['Main','Change Order','Service'].forEach(n=>{
    const p={ id:uid(), name:n, status:'Open', type:'job', clientLocationId:locId, clientId };
    projects.push(p); dbSave('projects',p);
  });
}

function saveClientModal(){
  const name=document.getElementById('client-name').value.trim();
  if(!name){toast('Client name is required','error');return;}
  const isNew=!_clientEditId;
  const isDefault=document.getElementById('client-isdefault').checked?1:0;
  if(isDefault) clients.forEach(c=>{if(c.isDefault&&c.id!==(_clientEditId||'')){ c.isDefault=0; dbSave('clients',c); }});
  const id=_clientEditId||uid();
  const street=document.getElementById('client-street').value.trim();
  const city=document.getElementById('client-city').value.trim();
  const state=document.getElementById('client-state').value.trim();
  const zip=document.getElementById('client-zip').value.trim();
  const cityLine=[city,[state,zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rec={
    id, name,
    firstName:document.getElementById('client-first').value.trim(),
    lastName:document.getElementById('client-last').value.trim(),
    street, city, state, zip,
    address:street,
    phone:document.getElementById('client-phone').value.trim(),
    email:document.getElementById('client-email').value.trim(),
    notes:document.getElementById('client-notes').value.trim(),
    isDefault,
  };
  if(_clientEditId){ const idx=clients.findIndex(c=>c.id===_clientEditId); if(idx>=0) clients[idx]=rec; else clients.push(rec); }
  else clients.push(rec);
  dbSave('clients',rec);
  if(isNew) _fdScaffoldNewClient(id, rec);
  populateProjClientSelects();
  closeClientModal();
  renderFDClientsTable();
  if(currentClientId===id) openFDClientDetail(id);
  toast(isNew?'Client created':'Client updated','success');
}

function deleteClient(id){
  const locs=clientLocations.filter(l=>l.clientId===id);
  const pc=fdClientProjCount(id);
  if(!confirm(`Delete this client?${locs.length?`\n\nIts ${locs.length} location(s) will be deleted`:''}${pc?` and ${pc} project(s) will become Unassigned (not deleted).`:(locs.length?'.':'')}`)) return;
  const locIds=new Set(locs.map(l=>l.id));
  projects.forEach(p=>{ if(locIds.has(p.clientLocationId)||p.clientId===id){ p.clientLocationId=''; p.clientId=''; dbSave('projects',p); }});
  locs.forEach(l=>dbDelete('clientLocations',l.id));
  clientLocations=clientLocations.filter(l=>l.clientId!==id);
  clients=clients.filter(c=>c.id!==id);
  dbDelete('clients',id);
  populateProjClientSelects();
  if(currentClientId===id){ fdClientDetailBack(); }
  renderFDClientsTable();
  renderProjTable();
  toast('Client deleted','success');
}

function setupDefaultClient(){
  if(clients.find(c=>c.isDefault)){toast('A default client already exists','error');return;}
  const id=uid();
  const rec={id,name:'House Account',firstName:'',lastName:'',address:'',phone:'',email:'',notes:'',isDefault:1};
  clients.push(rec);
  dbSave('clients',rec);
  // Scaffold the shop: a "Shop" location holding shop-stock / shop-ops / shop-other
  // (only when those folders don't already exist, to avoid duplicating an existing shop).
  const locId=uid();
  const loc={id:locId,clientId:id,name:'Shop',isDefault:1};
  clientLocations.push(loc); dbSave('clientLocations',loc);
  ['shop-stock','shop-ops','shop-other'].forEach(n=>{
    const norm=s=>(s||'').trim().toLowerCase().replace(/[\s_]/g,'-');
    const existing=projects.find(p=>norm(p.name)===n);
    if(existing){ existing.clientLocationId=locId; existing.clientId=id; dbSave('projects',existing); }
    else { const p={id:uid(),name:n,status:'Open',type:'stock',clientLocationId:locId,clientId:id}; projects.push(p); dbSave('projects',p); }
  });
  populateProjClientSelects();
  renderFDClientsTable();
  renderProjTable();
  toast('House Account + Shop created','success');
}

function openAddProjectToClient(clientId){
  const unlinked=projects.filter(p=>!p.clientId);
  const sel=document.getElementById('apc-existing-sel');
  sel.innerHTML='<option value="">— select unlinked project —</option>';
  unlinked.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
  document.getElementById('apc-new-proj-name').value='';
  document.getElementById('apc-new-proj-status').value='Open';
  document.getElementById('apc-new-proj-value').value='';
  document.getElementById('apc-create-btn').disabled=true;
  document.getElementById('add-proj-to-client-modal').style.display='flex';
}

function closeAddProjToClient(){
  document.getElementById('add-proj-to-client-modal').style.display='none';
}

function apcCheckReady(){
  document.getElementById('apc-create-btn').disabled=!document.getElementById('apc-new-proj-name').value.trim();
}

function confirmLinkExistingProject(){
  const projId=document.getElementById('apc-existing-sel').value;
  if(!projId){toast('Select a project first','error');return;}
  const p=projects.find(p=>p.id===projId); if(!p) return;
  p.clientId=currentClientId;
  dbSave('projects',p);
  closeAddProjToClient();
  renderClientDetailProjects(currentClientId);
  renderProjTable();
  toast('Project linked','success');
}

function confirmNewProjectForClient(){
  const name=document.getElementById('apc-new-proj-name').value.trim();
  if(!name){toast('Project name is required','error');return;}
  const id=generateNextProjId();
  const newProj={
    id, name,
    status:document.getElementById('apc-new-proj-status').value,
    clientId:currentClientId,
    firstName:'', lastName:'', address:'', phone:'', email:'',
    contractValue:parseFloat(document.getElementById('apc-new-proj-value').value)||0,
    startDate:'', targetDate:'', notes:'',
  };
  projects.push(newProj);
  dbSave('projects',newProj);
  closeAddProjToClient();
  renderClientDetailProjects(currentClientId);
  renderProjTable(); updateProjStats();
  generateNextProjId();
  toast('Project '+id+' created and linked','success');
}

function populateProjClientSelects(){
  ['proj-client','edit-proj-client'].forEach(selId=>{
    const sel=document.getElementById(selId); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">— No client —</option>';
    clients.forEach(c=>{
      const o=document.createElement('option');
      o.value=c.id;
      const cn=[c.firstName,c.lastName].filter(Boolean).join(' ');
      o.textContent=c.name+(cn?' ('+cn+')':'');
      sel.appendChild(o);
    });
    if(cur) sel.value=cur;
  });
}

// ══════════════════════════════════════════════════════════════════════════
// VENDORS (Front Desk sub-tab) — list / add / edit / merge
// ══════════════════════════════════════════════════════════════════════════
let fdVendorFilterQuery='', _vendorEditId=null, _mergeFromId=null;

function _vendorPOCount(id){ return orders.filter(o=>o.vendorId===id).length; }
function _vendorBillCount(id){ return vendorBills.filter(b=>b.vendorId===id).length; }

function renderFDVendors(){
  const chip=document.getElementById('fd-vendors-total-chip');
  const tbody=document.getElementById('fd-vendors-tbody'); if(!tbody) return;
  const q=(fdVendorFilterQuery||'').toLowerCase();
  let list=vendors.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  if(q) list=list.filter(v=>[v.name,v.contactName,v.email,v.phone].filter(Boolean).join(' ').toLowerCase().includes(q));
  if(chip) chip.innerHTML=list.length+' <span>vendors</span>';
  const sk=s=>(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  if(!list.length){ tbody.innerHTML=`<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px;">${vendors.length?'No vendors match.':'No vendors yet.'}</td></tr>`; return; }
  tbody.innerHTML=list.map(v=>{
    const po=_vendorPOCount(v.id), bl=_vendorBillCount(v.id);
    return `<tr>
      <td style="font-weight:600">${escHtml(v.name)}</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${escHtml(v.contactName||'—')}</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${escHtml(v.email||'—')}</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${escHtml(v.phone||'—')}</td>
      <td style="text-align:center"><span class="qty-badge qty-s">${po}</span></td>
      <td style="text-align:center"><span class="qty-badge qty-b">${bl}</span></td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-del" onclick="openVendorModal('${sk(v.id)}')" title="Edit" style="color:var(--text-muted);">✎</button>
        <button class="btn-del" onclick="openMergeVendor('${sk(v.id)}')" title="Merge into another vendor" style="color:var(--accent);border-color:rgba(79,142,247,0.3);">⇉</button>
        <button class="btn-del" onclick="deleteVendor('${sk(v.id)}')" title="Delete" style="color:var(--accent4);border-color:rgba(247,79,126,0.3);">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function openVendorModal(id){
  _vendorEditId=id||null;
  const v=id?vendors.find(x=>x.id===id):null;
  const val=k=>escHtml((v&&v[k])||'');
  _fdOverlay(`
    <div style="padding:20px 22px 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">${v?'Edit':'New'} Vendor</div>
      <button onclick="_fdCloseOverlay()" style="background:none;border:none;color:var(--text-muted);font-size:17px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px 22px 22px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="grid-column:1/-1"><label class="fl">Vendor Name <span style="color:var(--accent4);font-size:8px">*</span></label>
        <input class="plain-input" id="ven-name" value="${val('name')}" oninput="document.getElementById('ven-save').disabled=!this.value.trim()"></div>
      <div><label class="fl">Contact Name</label><input class="plain-input" id="ven-contact" value="${val('contactName')}"></div>
      <div><label class="fl">Phone</label><input class="plain-input" id="ven-phone" value="${val('phone')}"></div>
      <div><label class="fl">Email</label><input class="plain-input" id="ven-email" value="${val('email')}"></div>
      <div><label class="fl">Website</label><input class="plain-input" id="ven-website" value="${val('website')}"></div>
      <div style="grid-column:1/-1"><label class="fl">Street</label><input class="plain-input" id="ven-street" value="${val('street')}"></div>
      <div><label class="fl">City</label><input class="plain-input" id="ven-city" value="${val('city')}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><label class="fl">State</label><input class="plain-input" id="ven-state" value="${val('state')}"></div>
        <div><label class="fl">ZIP</label><input class="plain-input" id="ven-zip" value="${val('zip')}"></div>
      </div>
      <div><label class="fl">Payment Terms</label><input class="plain-input" id="ven-terms" value="${val('terms')}" placeholder="Net 30"></div>
      <div><label class="fl">Account #</label><input class="plain-input" id="ven-account" value="${val('accountNumber')}"></div>
      <div style="grid-column:1/-1"><label class="fl">Notes</label><input class="plain-input" id="ven-notes" value="${val('notes')}"></div>
    </div>
    <div style="padding:0 22px 20px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="_fdCloseOverlay()">Cancel</button>
      <button class="btn" id="ven-save" ${v?'':'disabled'} onclick="saveVendor()" style="background:var(--accent);color:#fff;border:none;padding:9px 20px;border-radius:6px;font-weight:700;">Save</button>
    </div>`);
  setTimeout(()=>document.getElementById('ven-name')?.focus(),50);
}

function saveVendor(){
  const name=document.getElementById('ven-name').value.trim(); if(!name){ toast('Vendor name required','error'); return; }
  const existing=vendors.find(v=>v.id===_vendorEditId);
  const oldName=existing?existing.name:null;
  const rec=Object.assign({}, existing||{}, {
    id:_vendorEditId||uid(), name,
    contactName:document.getElementById('ven-contact').value.trim(),
    phone:document.getElementById('ven-phone').value.trim(),
    email:document.getElementById('ven-email').value.trim(),
    website:document.getElementById('ven-website').value.trim(),
    street:document.getElementById('ven-street').value.trim(),
    city:document.getElementById('ven-city').value.trim(),
    state:document.getElementById('ven-state').value.trim(),
    zip:document.getElementById('ven-zip').value.trim(),
    terms:document.getElementById('ven-terms').value.trim(),
    accountNumber:document.getElementById('ven-account').value.trim(),
    notes:document.getElementById('ven-notes').value.trim(),
  });
  if(_vendorEditId){ const i=vendors.findIndex(v=>v.id===_vendorEditId); if(i>=0) vendors[i]=rec; else vendors.push(rec); }
  else vendors.push(rec);
  dbSave('vendors', rec);
  // Cascade a name change to the denormalized vendor text on POs / bills / RMAs.
  if(oldName && oldName!==name){
    orders.forEach(o=>{ if(o.vendorId===rec.id && o.vendor!==name){ o.vendor=name; dbSave('orders',o); }});
    vendorBills.forEach(b=>{ if(b.vendorId===rec.id && b.vendor!==name){ b.vendor=name; dbSave('vendorBills',b); }});
    rmas.forEach(r=>{ if(r.vendorId===rec.id && r.vendor!==name){ r.vendor=name; dbSave('rmas',r); }});
  }
  populateAllVendorSelects();
  // If this create was launched from a PO/Bill "＋ New vendor…", select it back there.
  if(_vendorSelectTarget){
    const sel=document.getElementById(_vendorSelectTarget);
    if(sel){ sel.value=rec.name; vendorSelectChanged(sel); }
    _vendorSelectTarget=null;
  }
  _fdCloseOverlay(); renderFDVendors();
  toast(_vendorEditId?'Vendor updated':'Vendor created','success');
}

function deleteVendor(id){
  const v=vendors.find(x=>x.id===id); if(!v) return;
  const po=_vendorPOCount(id), bl=_vendorBillCount(id);
  if(po||bl){ toast(`Can't delete — ${po} PO(s) / ${bl} bill(s) reference this vendor. Merge instead.`,'error'); return; }
  if(!confirm(`Delete vendor "${v.name}"?`)) return;
  vendors=vendors.filter(x=>x.id!==id);
  dbDelete('vendors', id);
  renderFDVendors(); populateAllVendorSelects();
  toast('Vendor deleted','success');
}

// Merge this vendor INTO another (repoint POs/bills/RMAs, then delete this one).
function openMergeVendor(id){
  const from=vendors.find(v=>v.id===id); if(!from) return;
  _mergeFromId=id;
  const opts=vendors.filter(v=>v.id!==id).sort((a,b)=>(a.name||'').localeCompare(b.name||''))
    .map(v=>`<option value="${escHtml(v.id)}">${escHtml(v.name)}</option>`).join('');
  const po=_vendorPOCount(id), bl=_vendorBillCount(id);
  _fdOverlay(`
    <div style="padding:20px 22px 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">Merge "${escHtml(from.name)}"</div>
      <button onclick="_fdCloseOverlay()" style="background:none;border:none;color:var(--text-muted);font-size:17px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px 22px 22px;">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Moves this vendor's <b>${po}</b> PO(s) and <b>${bl}</b> bill(s) to another vendor, then deletes "${escHtml(from.name)}". Can't be undone.</div>
      <label class="fl">Merge into</label>
      <select class="plain-select" id="merge-into" style="width:100%;">${opts||'<option value="">(no other vendors)</option>'}</select>
    </div>
    <div style="padding:0 22px 20px;display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="_fdCloseOverlay()">Cancel</button>
      <button class="btn" onclick="confirmMergeVendor()" style="background:var(--accent4);color:#fff;border:none;padding:9px 20px;border-radius:6px;font-weight:700;">Merge</button>
    </div>`);
}
function confirmMergeVendor(){
  const toId=document.getElementById('merge-into').value; if(!toId){ toast('Pick a target vendor','error'); return; }
  const from=vendors.find(v=>v.id===_mergeFromId), to=vendors.find(v=>v.id===toId); if(!from||!to) return;
  orders.forEach(o=>{ if(o.vendorId===from.id){ o.vendorId=to.id; o.vendor=to.name; dbSave('orders',o); }});
  vendorBills.forEach(b=>{ if(b.vendorId===from.id){ b.vendorId=to.id; b.vendor=to.name; dbSave('vendorBills',b); }});
  rmas.forEach(r=>{ if(r.vendorId===from.id){ r.vendorId=to.id; r.vendor=to.name; dbSave('rmas',r); }});
  vendors=vendors.filter(v=>v.id!==from.id);
  dbDelete('vendors', from.id);
  _fdCloseOverlay(); renderFDVendors(); populateAllVendorSelects();
  toast(`Merged into ${to.name}`,'success');
}

// ── Vendor <select> pickers on the PO / Bill forms (dropdown + inline create) ──
let _vendorSelectTarget=null;
function populateVendorSelect(selectId, selectedName){
  const sel=document.getElementById(selectId); if(!sel) return;
  const cur = (selectedName!=null) ? selectedName : sel.value;
  let html='<option value="">— Select vendor —</option><option value="__new__">＋ New vendor…</option>';
  vendors.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).forEach(v=>{
    html+=`<option value="${escHtml(v.name)}">${escHtml(v.name)}</option>`;
  });
  sel.innerHTML=html;
  if(cur) sel.value=cur;
}
function populateAllVendorSelects(){
  ['po-vendor','npo-vendor','edit-po-vendor','nb-vendor'].forEach(id=>{ if(document.getElementById(id)) populateVendorSelect(id); });
}
// A vendor dropdown changed. "＋ New vendor…" opens the create form and, on save,
// selects the newly-created vendor back in this same dropdown.
function vendorSelectChanged(sel){
  if(sel.value==='__new__'){
    _vendorSelectTarget=sel.id;
    sel.value='';
    openVendorModal();
    return;
  }
  if(sel.id==='po-vendor' && typeof poCheckReady==='function') poCheckReady();
  else if(sel.id==='npo-vendor' && typeof npoCheckReady==='function') npoCheckReady();
  else if(sel.id==='nb-vendor' && typeof nbCheckReady==='function') nbCheckReady();
}
