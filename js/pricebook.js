// ── SKU minting ──────────────────────────────────────────────────────────────
// Every SKU in the system is CAT-MFG-NNNN, generated here and nowhere else.
// Inventory records and order lines never invent their own — they carry the SKU
// of a catalog entry, which is what makes it unique and resolvable.
function generateSku(category, manufacturer){
  const cat=(category||'').trim();
  const catCode=CAT_CODES[cat]||cat.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||'UNC';
  const mfgCodeMap=getMfgCodeMap();
  const mfgCode=mfgCodeMap[manufacturer]||generateMfgCode(manufacturer,mfgCodeMap);
  const prefix=`${catCode}-${mfgCode}-`;
  const used=catalog.filter(r=>r.sku&&r.sku.startsWith(prefix))
    .map(r=>{ const n=parseInt(r.sku.split('-')[2]); return isNaN(n)?0:n; });
  return `${prefix}${String((used.length?Math.max(...used):0)+1).padStart(4,'0')}`;
}

// Resolve an item to a catalog SKU, creating the catalog entry if this
// manufacturer + model pair has never been seen. Returns '' when there isn't
// enough to identify a product — a free-form line carrying only a description.
// Callers MUST refuse to create inventory in that case rather than saving a
// record with no SKU.
function ensureCatalogSku({manufacturer, model, category, unitCost}={}){
  const mfg=(manufacturer||'').trim(), mod=(model||'').trim();
  if(!mfg||!mod) return '';
  const existing=catalog.find(r=>r.manufacturer===mfg&&r.model===mod&&r.sku);
  if(existing) return existing.sku;
  const cat=(category||'').trim();
  const entry={sku:generateSku(cat,mfg), manufacturer:mfg, model:mod, category:cat,
    subcategory:'', url:'', shortDesc:'', longDesc:'', msrp:0,
    unitCost:unitCost||0, unitPrice:0};
  catalog.push(entry);
  dbSave('catalog', entry);
  registerCatalogEntry(entry);
  return entry.sku;
}

// Keep the in-memory lookup tables the autocompletes read in step with catalog.
function registerCatalogEntry(entry){
  const mfg=entry.manufacturer;
  if(!modelsByMfg[mfg]) modelsByMfg[mfg]=[];
  if(!modelsByMfg[mfg].some(m=>m.model===entry.model))
    modelsByMfg[mfg].push({model:entry.model, sku:entry.sku, category:entry.category});
  modelsByMfg[mfg].sort((a,b)=>a.model.localeCompare(b.model));
  if(!manufacturers.includes(mfg)){ manufacturers.push(mfg); manufacturers.sort((a,b)=>a.localeCompare(b)); }
  if(entry.category&&!categories.includes(entry.category)){ categories.push(entry.category); categories.sort((a,b)=>a.localeCompare(b)); }
}

function getMfgCodeMap(){
  const map={};
  for(const r of catalog){
    if(r.sku&&r.manufacturer){
      const parts=r.sku.split('-');
      if(parts.length>=2) map[r.manufacturer]=parts[1];
    }
  }
  return map;
}

function generateMfgCode(mfgName, existingCodes){
  const clean=mfgName.toUpperCase().replace(/[^A-Z]/g,'');
  const candidates=[
    clean.slice(0,3),
    clean.length>=4?clean[0]+clean[2]+clean[3]:null,
    clean.length>=3?clean[0]+clean[clean.length-2]+clean[clean.length-1]:null,
  ];
  const words=mfgName.toUpperCase().split(/\s+/).filter(w=>/^[A-Z]/.test(w));
  if(words.length>=3) candidates.push(words.map(w=>w[0]).join('').slice(0,3));
  if(words.length===2){candidates.push(words[0][0]+words[1].slice(0,2));candidates.push(words[0].slice(0,2)+words[1][0]);}
  for(const c of candidates){
    if(c&&c.length===3&&!Object.values(existingCodes).includes(c)) return c;
  }
  for(let i=0;i<100;i++){
    const c=(clean.slice(0,2)+(i<10?'0'+i:i)).slice(0,3);
    if(!Object.values(existingCodes).includes(c)) return c;
  }
  return clean.slice(0,3);
}

function pbGenerateSKU(){
  const mfg=document.getElementById('pb-mfg').value.trim();
  const catVal=document.getElementById('pb-cat').value.trim();
  if(!mfg||!catVal){document.getElementById('pb-sku').value='';return;}

  // Get category code
  const catCode=CAT_CODES[catVal]||catVal.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||'UNC';

  // Get or generate manufacturer code
  const mfgCodeMap=getMfgCodeMap();
  let mfgCode=mfgCodeMap[mfg];
  if(!mfgCode) mfgCode=generateMfgCode(mfg,mfgCodeMap);

  // Find next sequence number for this cat+mfg combo
  const prefix=`${catCode}-${mfgCode}-`;
  const existing=catalog.filter(r=>r.sku&&r.sku.startsWith(prefix)).map(r=>{
    const n=parseInt(r.sku.split('-')[2]); return isNaN(n)?0:n;
  });
  const next=(existing.length?Math.max(...existing):0)+1;
  document.getElementById('pb-sku').value=`${prefix}${String(next).padStart(4,'0')}`;
}

function pbModelInput(){
  pbCheckReady();
  // Show dropdown of existing models for this manufacturer
  const mfg=document.getElementById('pb-mfg').value.trim();
  if(mfg) acFilter('pb','model');
  else document.getElementById('dd-pb-model').classList.remove('open');
}
function pbModelFocus(){
  const mfg=document.getElementById('pb-mfg').value.trim();
  if(mfg) acFilter('pb','model');
}

function pbCheckReady(){
  const mfg=document.getElementById('pb-mfg').value.trim();
  const mod=document.getElementById('pb-model').value.trim();
  const cat=document.getElementById('pb-cat').value.trim();
  document.getElementById('pb-btn-add').disabled=!(mfg&&mod&&cat);
  if(mfg&&cat) pbGenerateSKU();
}

function addPBItem(){
  const mfg=document.getElementById('pb-mfg').value.trim();
  const mod=document.getElementById('pb-model').value.trim();
  const cat=document.getElementById('pb-cat').value.trim();
  if(!mfg||!mod||!cat){toast('Manufacturer, Model, and Category are required','error');return;}

  // Check for duplicate
  if(catalog.find(r=>r.manufacturer===mfg&&r.model===mod)){
    toast('This manufacturer + model already exists in the Pricebook','error'); return;
  }

  const sku=document.getElementById('pb-sku').value;
  const newItem={
    sku, manufacturer:mfg, model:mod, category:cat,
    subcategory:document.getElementById('pb-sub').value.trim(),
    url:document.getElementById('pb-url').value.trim(),
    msrp:parseFloat(document.getElementById('pb-msrp').value)||0,
    unitCost:parseFloat(document.getElementById('pb-cost').value)||0,
    unitPrice:parseFloat(document.getElementById('pb-price').value)||0,
  };

  catalog.push(newItem);
  catalog.sort((a,b)=>a.manufacturer.localeCompare(b.manufacturer)||a.model.localeCompare(b.model));

  // Update manufacturer/model lookups
  if(!manufacturers.includes(mfg)){
    manufacturers.push(mfg); manufacturers.sort((a,b)=>a.localeCompare(b));
  }
  if(!modelsByMfg[mfg]) modelsByMfg[mfg]=[];
  modelsByMfg[mfg].push({model:mod,sku,category:cat});
  if(!categories.includes(cat)){categories.push(cat);categories.sort((a,b)=>a.localeCompare(b));}

  dbSave('catalog', newItem);
  setDirty(true); updatePBStats(); renderPBTable(); resetPBForm();
  toast(`Added ${sku} — ${mfg} / ${mod}`,'success');
}

function deletePBItem(sku){
  if(!confirm(`Remove ${sku} from the Pricebook?`)) return;
  catalog=catalog.filter(r=>r.sku!==sku);
  // Rebuild lookups
  const mfgSet=new Set(), catSet=new Set();
  modelsByMfg={};
  for(const r of catalog){
    mfgSet.add(r.manufacturer); catSet.add(r.category);
    if(!modelsByMfg[r.manufacturer]) modelsByMfg[r.manufacturer]=[];
    modelsByMfg[r.manufacturer].push({model:r.model,sku:r.sku,category:r.category});
  }
  manufacturers=[...mfgSet].sort((a,b)=>a.localeCompare(b));
  categories=[...catSet].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  dbDelete('catalog', sku);
  setDirty(true); updatePBStats(); renderPBTable();
  toast('Product removed','success');
}

function updatePBField(sku, field, val, inputEl){
  const item=catalog.find(r=>r.sku===sku);
  if(!item) return;
  const num=parseFloat(val);
  item[field]=(!isNaN(num)&&num>=0)?num:0;
  if(inputEl) inputEl.value=item[field]?item[field].toFixed(2):'';
  dbSave('catalog', item);
  setDirty(true);
}

function resetPBForm(){
  ['pb-mfg','pb-model','pb-cat','pb-sub','pb-sku','pb-url'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ['pb-msrp','pb-cost','pb-price'].forEach(id=>{document.getElementById(id).value='';});
  acCtx.pb.mfg.selected=acCtx.pb.cat.selected=null;
  document.getElementById('pb-btn-add').disabled=true;
  document.getElementById('pb-mfg').focus();
}

function renderPBTable(){
  applySortClasses('pb');
  const q=pbFilterQuery.toLowerCase();
  pbFilteredCache=sortRows(
    catalog.filter(r=>!q||[r.sku,r.manufacturer,r.model,r.category].some(v=>v.toLowerCase().includes(q))),
    pbSort.col, pbSort.dir
  );
  const maxPage=Math.max(0,Math.ceil(pbFilteredCache.length/PB_PAGE_SIZE)-1);
  if(pbPage>maxPage) pbPage=maxPage;
  renderPBPage();
}

function renderPBPage(){
  const rows=pbFilteredCache;
  const tbody=document.getElementById('pb-tbody');
  const pag=document.getElementById('pb-pagination');
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">◈</div><div style="font-size:13px">${catalog.length?'No products match.':'No products loaded.'}</div></div></td></tr>`;
    if(pag) pag.style.display='none';
    return;
  }
  const start=pbPage*PB_PAGE_SIZE;
  tbody.innerHTML=rows.slice(start,start+PB_PAGE_SIZE).map(r=>{
    const esku=r.sku.replace(/'/g,"\\'");
    const fv=n=>n?parseFloat(n).toFixed(2):'';
    return `<tr class="group-row">
    <td class="sku-cell mobile-hide">${r.sku?escHtml(r.sku):'<span class="dim">—</span>'}</td>
    <td>${escHtml(r.manufacturer)}</td>
    <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.model)}</td>
    <td class="mobile-hide"><span class="pb-cat-tag">${escHtml(r.category||'—')}</span></td>
    <td class="pb-price mobile-hide"><input class="pb-inline-edit" type="number" step="0.01" min="0" value="${fv(r.msrp)}" placeholder="—" onchange="updatePBField('${esku}','msrp',this.value,this)"></td>
    <td class="pb-price"><input class="pb-inline-edit" type="number" step="0.01" min="0" value="${fv(r.unitCost)}" placeholder="—" onchange="updatePBField('${esku}','unitCost',this.value,this)"></td>
    <td class="pb-price mobile-hide"><input class="pb-inline-edit" type="number" step="0.01" min="0" value="${fv(r.unitPrice)}" placeholder="—" onchange="updatePBField('${esku}','unitPrice',this.value,this)"></td>
    <td style="white-space:nowrap;">
      <button title="Purchase cost history" onclick="showCostHistory('${esku}')" style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.7;padding:0 4px;">📈</button>
      <button class="btn-del" onclick="deletePBItem('${esku}')">✕</button>
    </td>
  </tr>`;
  }).join('');
  if(pag){
    const totalPages=Math.ceil(rows.length/PB_PAGE_SIZE);
    pag.style.display=totalPages>1?'flex':'none';
    document.getElementById('pb-pag-info').textContent=`${start+1}–${Math.min(start+PB_PAGE_SIZE,rows.length)} of ${rows.length.toLocaleString()}`;
    document.getElementById('pb-pag-prev').disabled=pbPage===0;
    document.getElementById('pb-pag-next').disabled=pbPage>=totalPages-1;
  }
}

function pbPagPrev(){if(pbPage>0){pbPage--;renderPBPage();}}
function pbPagNext(){if(pbPage<Math.ceil(pbFilteredCache.length/PB_PAGE_SIZE)-1){pbPage++;renderPBPage();}}

function filterPB(q){
  pbFilterQuery=q;
  clearTimeout(pbSearchTimer);
  pbSearchTimer=setTimeout(()=>{pbPage=0;renderPBTable();},200);
}

function updatePBStats(){
  const mfgs=new Set(catalog.map(r=>r.manufacturer)).size;
  const cats=new Set(catalog.map(r=>r.category)).size;
  document.getElementById('pb-chip-total').innerHTML=`${catalog.length.toLocaleString()} <span>products</span>`;
  document.getElementById('pb-chip-mfg').innerHTML=`${mfgs} <span>manufacturers</span>`;
  document.getElementById('pb-chip-cats').innerHTML=`${cats} <span>categories</span>`;
}

// ═══════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════
