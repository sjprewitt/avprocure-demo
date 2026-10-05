// ═══════════════════════════════════════════════
// RMAs
// ═══════════════════════════════════════════════

const RMA_STATUS_COLORS = {
  'Open':    {bg:'rgba(79,142,247,0.1)',  color:'var(--accent)'},
  'Shipped': {bg:'rgba(247,201,79,0.1)', color:'var(--warn)'},
  'Received':{bg:'rgba(79,247,160,0.1)', color:'var(--accent3)'},
  'Closed':  {bg:'rgba(74,85,112,0.2)',   color:'var(--text-dim)'},
  'Denied':  {bg:'rgba(247,79,126,0.1)', color:'var(--accent4)'},
};

const RMA_TYPE_COLORS = {
  'Return to Vendor':   {bg:'rgba(247,147,79,0.1)', color:'var(--accent2)'},
  'Customer Return':    {bg:'rgba(247,79,126,0.1)', color:'var(--accent4)'},
  'Repair/Service':     {bg:'rgba(247,201,79,0.1)', color:'var(--warn)'},
  'Exchange/Replacement':{bg:'rgba(79,247,160,0.1)',color:'var(--accent3)'},
};

// Project display with Client · Location context, so a stored "Unallocated" or
// "Main" is never ambiguous on the record either. Falls back to the name that
// was captured on the RMA when the project no longer resolves.
function _rmaProjCtx(r){
  const p=projects.find(x=>x.id===r.projectId);
  if(!p) return '';
  return (typeof _projCtxStr==='function')?_projCtxStr(p):'';
}

// ── Return shipping ───────────────────────────────────────────────────────────
// Carrier tracking URLs. No carrier API is wired up — the app records the
// shipment, it does not create labels; the label is bought in the carrier's own
// tool and its tracking number pasted back here.
const CARRIER_TRACK_URL = {
  'UPS':  n=>`https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  'FedEx':n=>`https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  'USPS': n=>`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  'DHL':  n=>`https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
};
function rmaTrackUrl(r){
  const f=CARRIER_TRACK_URL[r.carrier];
  return (f&&r.trackingNumber)?f(r.trackingNumber):'';
}
function rmaTrackHtml(r){
  if(!r.trackingNumber) return '<span class="dim">—</span>';
  const num=escHtml(r.trackingNumber);
  const url=rmaTrackUrl(r);
  const car=r.carrier?`<div style="font-size:10px;color:var(--text-dim);line-height:1.2;">${escHtml(r.carrier)}</div>`:'';
  const body=url
    ? `<a href="${escHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--accent);text-decoration:none;font-family:var(--font-mono);font-size:11px;">${num}</a>`
    : `<span style="font-family:var(--font-mono);font-size:11px;">${num}</span>`;
  return body+car;
}
// Third-party billing needs the account number, and the carrier validates it
// against the vendor's own postal code — so flag a missing one rather than
// letting the charge quietly fall back to us.
function _rmaBillHint(carrier,billing,acct){
  // Both receiver-billed and third-party-billed charge someone else's account,
  // and both silently revert to us if the account is missing or fails the
  // carrier's postal-code check.
  const acctBilled=billing.startsWith('Bill Receiver')||billing.startsWith('Third Party');
  if(acctBilled&&!acct.trim())
    return '\u26a0 This billing mode needs the vendor\'s account number, or the charge reverts to you.';
  if(acct.trim()&&!acctBilled)
    return 'Tip: set Billing to \u201cBill Receiver (vendor acct)\u201d \u2014 for a return the vendor is the recipient, so the account number is otherwise ignored.';
  if(acctBilled&&carrier)
    return `${carrier} validates the account against that party's postal code \u2014 make sure it matches the Ship To address below.`;
  return '';
}
function rmaBillingHint(){
  const el=document.getElementById('rma-ship-hint');
  if(!el) return;
  el.textContent=_rmaBillHint(
    document.getElementById('rma-carrier').value,
    document.getElementById('rma-billing-type').value,
    document.getElementById('rma-billing-account').value);
}
function rmaEditBillingHint(){
  const el=document.getElementById('edit-rma-ship-hint');
  if(!el) return;
  el.textContent=_rmaBillHint(
    document.getElementById('edit-rma-carrier').value,
    document.getElementById('edit-rma-billing-type').value,
    document.getElementById('edit-rma-billing-account').value);
}

function rmaStatusBadge(s){
  const c=RMA_STATUS_COLORS[s]||{bg:'var(--surface3)',color:'var(--text-muted)'};
  return `<span style="font-size:10px;font-family:var(--font-mono);padding:2px 7px;border-radius:3px;background:${c.bg};color:${c.color}">${escHtml(s)}</span>`;
}

function rmaTypeBadge(t){
  const c=RMA_TYPE_COLORS[t]||{bg:'var(--surface3)',color:'var(--text-muted)'};
  const short={'Return to Vendor':'RTV','Customer Return':'CR','Repair/Service':'REPAIR','Exchange/Replacement':'XCHG'}[t]||t;
  return `<span style="font-size:10px;font-family:var(--font-mono);padding:2px 7px;border-radius:3px;background:${c.bg};color:${c.color}">${escHtml(short)}</span>`;
}

function generateNextRMAId(){
  const nums=rmas.map(r=>parseInt((r.rmaId||'').replace(/\D/g,''))||0);
  const next=(nums.length?Math.max(...nums):0)+1;
  const id='RMA'+String(next).padStart(4,'0');
  const el=document.getElementById('rma-id');
  if(el) el.value=id;
  return id;
}

function rmaCheckReady(){
  const type=document.getElementById('rma-type').value;
  const mfg=acCtx.rma.mfg.selected;
  const model=acCtx.rma.model.selected||document.getElementById('rma-model').value.trim();
  const reason=document.getElementById('rma-reason').value.trim();
  document.getElementById('rma-btn-add').disabled=!(type&&mfg&&model&&reason);
}

function addRMA(){
  const type=document.getElementById('rma-type').value;
  const mfg=acCtx.rma.mfg.selected;
  const model=acCtx.rma.model.selected||document.getElementById('rma-model').value.trim();
  const sku=document.getElementById('rma-sku').value.trim();
  const qty=Math.max(1,parseInt(document.getElementById('rma-qty').value)||1);
  const reason=document.getElementById('rma-reason').value.trim();
  const status=document.getElementById('rma-status').value;
  const date=document.getElementById('rma-date').value;
  const vendor=document.getElementById('rma-vendor').value.trim();
  const carrier=document.getElementById('rma-carrier').value;
  const billingType=document.getElementById('rma-billing-type').value;
  const billingAccount=document.getElementById('rma-billing-account').value.trim().toUpperCase();
  const trackingNumber=document.getElementById('rma-tracking').value.trim();
  const vendorRmaNumber=document.getElementById('rma-vendor-rma').value.trim();
  const shipToAddress=document.getElementById('rma-ship-to').value.trim();

  // Resolve project
  const projInput=document.getElementById('rma-project').value.trim();
  const projObj=projects.find(p=>p.id===acCtx.rma.project.selected)
               ||projects.find(p=>p.name===projInput||p.id===projInput);
  const projectId=projObj?projObj.id:'';
  const projectName=projObj?projObj.name:projInput;

  const rmaId=document.getElementById('rma-id').value||generateNextRMAId();
  // A tracking number at creation means it already shipped — stamp the date.
  const dateShipped=trackingNumber?date:'';
  const rmaRecord={rmaId,type,projectId,projectName,sku,manufacturer:mfg,model,qty,vendor,status,reason,
    dateOpened:date,dateClosed:'',carrier,billingType,billingAccount,trackingNumber,dateShipped,
    vendorRmaNumber,shipToAddress};
  rmas.push(rmaRecord);
  dbSave('rmas', rmaRecord);
  setDirty(true);
  updateRMAStats();
  renderRMATable();
  generateNextRMAId();
  // Reset form
  document.getElementById('rma-type').value='';
  document.getElementById('rma-mfg').value='';
  document.getElementById('rma-model').value='';
  document.getElementById('rma-model').disabled=true;
  document.getElementById('rma-model').placeholder='Select manufacturer first…';
  document.getElementById('rma-sku').value='';
  document.getElementById('rma-qty').value=1;
  document.getElementById('rma-project').value='';
  document.getElementById('rma-vendor').value='';
  document.getElementById('rma-carrier').value='';
  document.getElementById('rma-billing-type').value='';
  document.getElementById('rma-billing-account').value='';
  document.getElementById('rma-tracking').value='';
  document.getElementById('rma-vendor-rma').value='';
  document.getElementById('rma-ship-to').value='';
  rmaBillingHint();
  document.getElementById('rma-status').value='Open';
  document.getElementById('rma-reason').value='';
  document.getElementById('rma-date').valueAsDate=new Date();
  acCtx.rma={mfg:{selected:null,focusIdx:-1},model:{selected:null,focusIdx:-1},project:{selected:null,focusIdx:-1}};
  rmaCheckReady();
  toast(`${rmaId} created`,'success');
}

function updateRMAStats(){
  const total=rmas.length;
  const open=rmas.filter(r=>r.status==='Open').length;
  const shipped=rmas.filter(r=>r.status==='Shipped').length;
  const received=rmas.filter(r=>r.status==='Received').length;
  document.getElementById('rma-chip-total').innerHTML=`${total} <span>RMAs</span>`;
  document.getElementById('rma-chip-open').innerHTML=`${open} <span>open</span>`;
  document.getElementById('rma-chip-shipped').innerHTML=`${shipped} <span>shipped</span>`;
  document.getElementById('rma-chip-received').innerHTML=`${received} <span>received</span>`;
}

function filterRMAs(q){
  rmaFilterQuery=q.toLowerCase();
  renderRMATable();
}

function renderRMATable(){
  const tbody=document.getElementById('rma-tbody');
  if(!tbody) return;
  let rows=rmas;
  if(rmaFilterQuery){
    rows=rows.filter(r=>
      r.rmaId.toLowerCase().includes(rmaFilterQuery)||
      r.manufacturer.toLowerCase().includes(rmaFilterQuery)||
      r.model.toLowerCase().includes(rmaFilterQuery)||
      r.sku.toLowerCase().includes(rmaFilterQuery)||
      r.projectName.toLowerCase().includes(rmaFilterQuery)||
      _rmaProjCtx(r).toLowerCase().includes(rmaFilterQuery)||
      (r.carrier||'').toLowerCase().includes(rmaFilterQuery)||
      (r.trackingNumber||'').toLowerCase().includes(rmaFilterQuery)||
      (r.billingAccount||'').toLowerCase().includes(rmaFilterQuery)||
      (r.vendorRmaNumber||'').toLowerCase().includes(rmaFilterQuery)||
      r.type.toLowerCase().includes(rmaFilterQuery)||
      r.vendor.toLowerCase().includes(rmaFilterQuery)||
      r.reason.toLowerCase().includes(rmaFilterQuery)||
      r.status.toLowerCase().includes(rmaFilterQuery)
    );
  }
  rows=sortRows(rows,rmaSort.col,rmaSort.dir);
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="12"><div class="empty-state"><div class="empty-icon">↩</div>No RMAs${rmaFilterQuery?' matching search':''}</div></td></tr>`;
    return;
  }
  tbody.innerHTML=rows.map(r=>`
    <tr class="group-row" data-gkey="rma-${escHtml(r.rmaId)}" style="cursor:pointer;">
      <td class="sku-cell">${escHtml(r.rmaId)}${r.vendorRmaNumber?`<div style="font-size:10px;color:var(--text-dim);line-height:1.2;font-family:var(--font-mono);">\u21b3 ${escHtml(r.vendorRmaNumber)}</div>`:''}</td>
      <td>${rmaTypeBadge(r.type)}</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${escHtml(r.projectName||'—')}${(c=>c?`<div style="font-size:10px;color:var(--text-dim);line-height:1.2;">${escHtml(c)}</div>`:'')(_rmaProjCtx(r))}</td>
      <td class="sku-cell mobile-hide">${escHtml(r.sku||'—')}</td>
      <td style="font-size:12px">${escHtml(r.manufacturer)}</td>
      <td style="font-size:12px">${escHtml(r.model)}</td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:center">${r.qty}</td>
      <td class="mobile-hide" style="font-size:12px;color:var(--text-muted)">${escHtml(r.vendor||'—')}</td>
      <td>${rmaStatusBadge(r.status)}</td>
      <td class="mobile-hide">${rmaTrackHtml(r)}</td>
      <td class="mono mobile-hide">${escHtml(r.dateOpened||'—')}</td>
      <td><button class="btn-del" data-del-rma="${escHtml(r.rmaId)}" onclick="event.stopPropagation();deleteRMA('${escHtml(r.rmaId)}')">✕</button></td>
    </tr>`).join('');
  applySortClasses('rma');
}

function showRMAList(){
  document.getElementById('rma-list-view').style.display='flex';
  document.getElementById('rma-detail-view').style.display='none';
}

function openRMA(id){
  const r=rmas.find(x=>x.rmaId===id); if(!r) return;
  currentRMAId=id;
  document.getElementById('rma-list-view').style.display='none';
  document.getElementById('rma-detail-view').style.display='flex';

  document.getElementById('rma-det-id').textContent=r.rmaId;
  document.getElementById('rma-det-type-badge').innerHTML=rmaTypeBadge(r.type);
  document.getElementById('rma-det-status-badge').innerHTML=rmaStatusBadge(r.status);

  const meta=[];
  if(r.manufacturer||r.model) meta.push(`${r.manufacturer} ${r.model}`.trim());
  if(r.sku) meta.push(r.sku);
  if(r.projectName) meta.push(`Project: ${r.projectName}`+((c)=>c?` (${c})`:'')(_rmaProjCtx(r)));
  if(r.vendor) meta.push(`Vendor: ${r.vendor}`);
  document.getElementById('rma-det-meta').textContent=meta.join(' · ');

  const fields=[
    ['RMA ID',r.rmaId],['Vendor RMA #',r.vendorRmaNumber||'—'],['Type',r.type],['Status',r.status],
    ['Manufacturer',r.manufacturer||'—'],['Model',r.model||'—'],['SKU',r.sku||'—'],
    ['Qty',r.qty],['Vendor',r.vendor||'—'],
    ['Project',((n,c)=>c?`${n} · ${c}`:n)(r.projectName||r.projectId||'—',_rmaProjCtx(r))],
    ['Date Opened',r.dateOpened||'—'],['Date Closed',r.dateClosed||'—'],
    ['Carrier',r.carrier||'—'],['Billing',r.billingType||'—'],
    ['Billing Acct #',r.billingAccount||'—'],['Date Shipped',r.dateShipped||'—'],
  ];
  document.getElementById('rma-det-body').innerHTML=fields.map(([label,val])=>`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;">
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">${label}</div>
      <div style="font-size:13px;color:var(--text);">${escHtml(val)}</div>
    </div>`).join('');
  const shipTo=r.shipToAddress||'';
  const trkUrl=rmaTrackUrl(r);
  document.getElementById('rma-det-body').innerHTML+=`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;">
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Tracking #</div>
      <div style="font-size:13px;color:var(--text);font-family:var(--font-mono);">${
        r.trackingNumber
          ? (trkUrl?`<a href="${escHtml(trkUrl)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">${escHtml(r.trackingNumber)} \u2197</a>`
                  : escHtml(r.trackingNumber))
          : '\u2014'}</div>
    </div>`;
  document.getElementById('rma-det-body').innerHTML+=`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;grid-column:1/-1;">
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Ship To (return address)</div>
      <div style="font-size:13px;color:var(--text);white-space:pre-wrap;">${shipTo?escHtml(shipTo):'\u2014'}</div>
    </div>`;
  document.getElementById('rma-det-reason').textContent=r.reason||'—';
}

function editRMA(id){
  const r=rmas.find(x=>x.rmaId===id); if(!r) return;
  document.getElementById('edit-rma-type').value=r.type;
  document.getElementById('edit-rma-status').value=r.status;
  document.getElementById('edit-rma-vendor').value=r.vendor;
  document.getElementById('edit-rma-qty').value=r.qty;
  document.getElementById('edit-rma-date').value=r.dateOpened;
  document.getElementById('edit-rma-date-closed').value=r.dateClosed||'';
  document.getElementById('edit-rma-reason').value=r.reason;
  document.getElementById('edit-rma-carrier').value=r.carrier||'';
  document.getElementById('edit-rma-billing-type').value=r.billingType||'';
  document.getElementById('edit-rma-billing-account').value=r.billingAccount||'';
  document.getElementById('edit-rma-tracking').value=r.trackingNumber||'';
  document.getElementById('edit-rma-vendor-rma').value=r.vendorRmaNumber||'';
  document.getElementById('edit-rma-ship-to').value=r.shipToAddress||'';
  document.getElementById('edit-rma-date-shipped').value=r.dateShipped||'';
  rmaEditBillingHint();
  const modal=document.getElementById('rma-modal');
  modal.style.display='flex';
}

function saveEditRMA(){
  const r=rmas.find(x=>x.rmaId===currentRMAId); if(!r) return;
  r.type=document.getElementById('edit-rma-type').value;
  r.status=document.getElementById('edit-rma-status').value;
  r.vendor=document.getElementById('edit-rma-vendor').value.trim();
  r.qty=Math.max(1,parseInt(document.getElementById('edit-rma-qty').value)||1);
  r.dateOpened=document.getElementById('edit-rma-date').value;
  r.dateClosed=document.getElementById('edit-rma-date-closed').value;
  r.reason=document.getElementById('edit-rma-reason').value.trim();
  r.carrier=document.getElementById('edit-rma-carrier').value;
  r.billingType=document.getElementById('edit-rma-billing-type').value;
  r.billingAccount=document.getElementById('edit-rma-billing-account').value.trim().toUpperCase();
  r.trackingNumber=document.getElementById('edit-rma-tracking').value.trim();
  r.dateShipped=document.getElementById('edit-rma-date-shipped').value;
  r.vendorRmaNumber=document.getElementById('edit-rma-vendor-rma').value.trim();
  r.shipToAddress=document.getElementById('edit-rma-ship-to').value.trim();
  // Marking it Shipped without a date is almost always "today" — fill it in
  // rather than leaving the record half-stamped.
  if(r.status==='Shipped'&&!r.dateShipped) r.dateShipped=new Date().toISOString().slice(0,10);
  dbSave('rmas', r);
  setDirty(true);
  updateRMAStats();
  renderRMATable();
  closeRMAModal();
  openRMA(currentRMAId);
  toast('RMA updated','success');
}

function closeRMAModal(){
  document.getElementById('rma-modal').style.display='none';
}

function deleteRMA(id){
  if(!confirm(`Delete ${id}?`)) return;
  rmas=rmas.filter(r=>r.rmaId!==id);
  dbDelete('rmas', id);
  setDirty(true);
  updateRMAStats();
  renderRMATable();
  if(currentRMAId===id) showRMAList();
  generateNextRMAId();
  toast(`${id} deleted`);
}

// Wire up RMA row clicks via existing event delegation
document.addEventListener('click', e=>{
  const rmaRow=e.target.closest('.group-row[data-gkey^="rma-"]');
  if(rmaRow&&!e.target.closest('button')){
    const id=rmaRow.dataset.gkey.replace('rma-','');
    openRMA(id);
  }
});

