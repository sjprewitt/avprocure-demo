// ═══════════════════════════════════════════════
// FILE I/O
// ═══════════════════════════════════════════════
function handleDrop(e){
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  if(e.dataTransfer.files[0]){ lastLoadedFile=e.dataTransfer.files[0]; readFile(lastLoadedFile); }
}
function openWorkbook(e){ if(e.target.files[0]){ lastLoadedFile=e.target.files[0]; readFile(lastLoadedFile); } e.target.value=''; }
function openFile(){ document.getElementById('file-input').click(); }

function refreshWorkbook(){
  if(!workbookData){ toast('No workbook loaded','error'); return; }
  parseWorkbookData(workbookData, workbookName);
  toast('Reloaded from workbook','success');
}

function readFile(file){
  workbookName=file.name;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      workbookData=ev.target.result;
      parseWorkbookData(workbookData, workbookName);
    }catch(err){toast('Failed: '+err.message,'error');console.error(err);}
  };
  reader.readAsBinaryString(file);
}

function parseWorkbookData(data, name){
  try{
      const wb=XLSX.read(data,{type:'binary'});

      // Load Pricebook
      const pbSheet=wb.SheetNames.find(s=>s.toLowerCase().includes('product')||s.toLowerCase().includes('book')||s.toLowerCase().includes('catalog'));
      if(!pbSheet){toast('Pricebook sheet not found','error');return;}
      const pbRows=XLSX.utils.sheet_to_json(wb.Sheets[pbSheet],{defval:''});
      const keys=Object.keys(pbRows[0]||{});
      const find=(...ns)=>keys.find(k=>ns.some(n=>k.toLowerCase().includes(n.toLowerCase())));
      const skuCol=find('sku'),mfgCol=find('manufacturer','mfg'),modCol=find('model'),catCol=find('category'),subCol=find('subcategory'),urlCol=find('url'),msrpCol=find('msrp'),costCol=find('cost'),priceCol=find('price','unit price'),shortCol=find('short description','short desc'),longCol=find('long description','long desc');

      catalog=pbRows.map(r=>({
        sku:    skuCol?String(r[skuCol]||'').trim():'',
        manufacturer:String(r[mfgCol]||'').trim(),
        model:  String(r[modCol]||'').trim(),
        category: catCol?String(r[catCol]||'').trim():'',
        subcategory: subCol?String(r[subCol]||'').trim():'',
        url:    urlCol?String(r[urlCol]||'').trim():'',
        shortDesc: shortCol?String(r[shortCol]||'').trim():'',
        longDesc:  longCol?String(r[longCol]||'').trim():'',
        msrp:   parseFloat(r[msrpCol])||0,
        unitCost:parseFloat(r[costCol])||0,
        unitPrice:priceCol?parseFloat(r[priceCol])||0:0,
      })).filter(r=>r.manufacturer&&r.model);

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

      // Load existing Inventory
      inventory=[];
      const invSheet=wb.SheetNames.find(s=>s.toLowerCase().includes('inventory'));
      if(invSheet){
        const invRows=XLSX.utils.sheet_to_json(wb.Sheets[invSheet],{defval:''});
        for(const r of invRows){
          const mfg=String(r['Manufacturer']||'').trim();
          const mod=String(r['Model']||'').trim();
          if(!mfg&&!mod) continue;
          inventory.push({
            id:uid(),sku:String(r['SKU']||'').trim(),
            manufacturer:mfg,model:mod,
            category:String(r['Category']||'').trim(),
            type:String(r['Type']||'serialized').trim(),
            serial:String(r['Serial Number']||'').trim(),
            par:parseInt(r['Par'])||0,
            qty:parseInt(r['Qty'])||1,
            location:String(r['Location']||'').trim(),
            locationId:String(r['Location ID']||'').trim(),
            condition:String(r['Condition']||'New').trim(),
            status:String(r['Status']||'In Stock').trim(),
            invStatus:String(r['Inv Status']||'').trim(),  // In Stock | Allocated | Staged | Deployed | Returned
            project:String(r['Project']||'').trim(),
            projectId:String(r['Project ID']||'').trim(),
            poNumber:String(r['PO Number']||'').trim(),
            notes:String(r['Notes']||'').trim(),
            dateAdded:String(r['Date Added']||'').trim(),
            lastUpdated:String(r['Last Updated']||'').trim(),
          });
        }
      }

      // Load Projects
      projects = [];
      const projSheet = wb.SheetNames.find(s=>s.toLowerCase()==='projects');
      if(projSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[projSheet],{defval:''});
        for(const r of rows){
          const id = String(r['Project ID']||'').trim();
          if(!id) continue;
          projects.push({
            id, name:String(r['Project Name']||'').trim(),
            status:String(r['Status']||'Open').trim(),
            firstName:String(r['Client First Name']||'').trim(),
            lastName:String(r['Client Last Name']||'').trim(),
            address:String(r['Address']||'').trim(),
            phone:String(r['Phone']||'').trim(),
            email:String(r['Email']||'').trim(),
            contractValue:parseFloat(r['Contract Value'])||0,
            startDate:String(r['Start Date']||'').trim(),
            targetDate:String(r['Target Completion']||'').trim(),
            notes:String(r['Notes']||'').trim(),
          });
        }
      }

      // Load Project Items
      projectItems = [];
      const piSheet = wb.SheetNames.find(s=>s.toLowerCase().includes('project item')||s.toLowerCase()==='project items');
      if(piSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[piSheet],{defval:''});
        for(const r of rows){
          const pid = String(r['Project ID']||'').trim();
          if(!pid) continue;
          projectItems.push({
            id:uid(), projectId:pid,
            sku:String(r['SKU']||'').trim(),
            manufacturer:String(r['Manufacturer']||'').trim(),
            model:String(r['Model']||'').trim(),
            category:String(r['Category']||'').trim(),
            qty:parseInt(r['Qty'])||1,
            unitCost:parseFloat(r['Unit Cost'])||0,
            unitPrice:parseFloat(r['Unit Price'])||0,
            inventoryIds:String(r['Inventory IDs']||'').trim().split(',').map(s=>s.trim()).filter(Boolean),
            itemStatus:String(r['Item Status']||'Ordered').trim(),
            notes:String(r['Notes']||'').trim(),
          });
        }
      }

      // Load Orders
      orders = [];
      const ordSheet = wb.SheetNames.find(s=>s.toLowerCase()==='orders');
      if(ordSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[ordSheet],{defval:''});
        for(const r of rows){
          const num = String(r['PO Number']||'').trim();
          if(!num) continue;
          orders.push({
            poNumber:num,
            vendor:String(r['Vendor']||'').trim(),
            projectId:String(r['Project ID']||'').trim(),
            projectName:String(r['Project Name']||'').trim(),
            status:String(r['Status']||'Submitted').trim(),
            date:String(r['Date']||'').trim(),
            shipment:String(r['Shipment']||'').trim(),
            totalValue:parseFloat(r['Total Value'])||0,
            itemDiscountTotal:parseFloat(r['Item Discount Total'])||0,
            tax:parseFloat(r['Tax'])||0,
            tariff:parseFloat(r['Tariff'])||0,
            shipping:parseFloat(r['Shipping'])||0,
            discount:parseFloat(r['Order Discount'])||0,
            notes:String(r['Notes']||'').trim(),
          });
        }
      }

      // Load Order Items
      orderItems = [];
      const oiSheet = wb.SheetNames.find(s=>s.toLowerCase().includes('order item')||s.toLowerCase()==='order items');
      if(oiSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[oiSheet],{defval:''});
        for(const r of rows){
          const num = String(r['PO Number']||'').trim();
          if(!num) continue;
          orderItems.push({
            id:uid(), poNumber:num,
            sku:String(r['SKU']||'').trim(),
            manufacturer:String(r['Manufacturer']||'').trim(),
            model:String(r['Model']||'').trim(),
            description:String(r['Description']||'').trim(),
            qtyOrdered:parseInt(r['Qty Ordered'])||1,
            qtyReceived:parseInt(r['Qty Received'])||0,
            unitCost:parseFloat(r['Unit Cost'])||0,
            discount:parseFloat(r['Discount'])||0,
            notes:String(r['Notes']||'').trim(),
            dateReceived:String(r['Date Received']||'').trim(),
          });
        }
      }

      // Load RMAs
      rmas = [];
      const rmaSheet = wb.SheetNames.find(s=>s.toLowerCase()==='rmas');
      if(rmaSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[rmaSheet],{defval:''});
        for(const r of rows){
          const id = String(r['RMA ID']||'').trim();
          if(!id) continue;
          rmas.push({
            rmaId:id,
            type:String(r['Type']||'Return to Vendor').trim(),
            projectId:String(r['Project ID']||'').trim(),
            projectName:String(r['Project Name']||'').trim(),
            sku:String(r['SKU']||'').trim(),
            manufacturer:String(r['Manufacturer']||'').trim(),
            model:String(r['Model']||'').trim(),
            qty:parseInt(r['Qty'])||1,
            vendor:String(r['Vendor']||'').trim(),
            status:String(r['Status']||'Open').trim(),
            reason:String(r['Reason']||'').trim(),
            dateOpened:String(r['Date Opened']||'').trim(),
            dateClosed:String(r['Date Closed']||'').trim(),
            carrier:String(r['Carrier']||'').trim(),
            billingType:String(r['Billing']||'').trim(),
            billingAccount:String(r['Billing Acct #']||'').trim(),
            trackingNumber:String(r['Tracking #']||'').trim(),
            dateShipped:String(r['Date Shipped']||'').trim(),
            vendorRmaNumber:String(r['Vendor RMA #']||'').trim(),
            shipToAddress:String(r['Ship To']||'').trim(),
          });
        }
      }

      document.getElementById('status-dot').classList.add('ready');
      document.getElementById('status-text').textContent=name;
      document.getElementById('catalog-stats').textContent=
        `${catalog.length.toLocaleString()} products · ${manufacturers.length} manufacturers`;

      document.getElementById('po-date').valueAsDate = new Date();

      document.getElementById('rma-date').valueAsDate = new Date();

      setDirty(false); updateInvStats(); renderInvTable(); renderPBTable(); updatePBStats();
      renderProjTable(); updateProjStats(); generateNextProjId();
      // Reconcile PO statuses from actual orderItems data
      orders.forEach(o=>{
        const items=orderItems.filter(i=>i.poNumber===o.poNumber);
        if(!items.length) return;
        const allReceived=items.every(i=>i.qtyReceived>=i.qtyOrdered);
        const anyReceived=items.some(i=>i.qtyReceived>0);
        const anyOutstanding=items.some(i=>i.qtyReceived<i.qtyOrdered);
        if(allReceived) o.status='Received';
        else if(anyReceived&&anyOutstanding) o.status='Backorder';
      });

      renderOrdersTable(); updateOrdersStats(); resetPOForm();
      renderRMATable(); updateRMAStats(); generateNextRMAId();
      renderStockTable();

      // Load Locations sheet
      locations = []; warehouses = [];
      const locSheet = wb.SheetNames.find(s=>s.toLowerCase()==='locations');
      if(locSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[locSheet],{defval:''});
        for(const r of rows){
          const id = String(r['Location ID']||'').trim();
          if(!id) continue;
          const rec = {
            id,
            parentId:    String(r['Parent ID']||'').trim(),
            warehouseId: String(r['Warehouse ID']||'').trim(),
            name:        String(r['Name']||'').trim(),
            code:        String(r['Code']||'').trim(),
            tier:        String(r['Tier']||'').trim(),
            tierIndex:   parseInt(r['Tier Index'])||0,
            type:        String(r['Type']||'general').trim(),
            notes:       String(r['Notes']||'').trim(),
          };
          locations.push(rec);
          if(rec.tierIndex===0) warehouses.push(rec);
        }
      }
      // Merge Shop-Stock sheet par/notes into inventory records
      const ssSheet = wb.SheetNames.find(s=>s.toLowerCase().replace(/[\s-]/g,'').includes('shopstock')||s.toLowerCase()==='shop-stock');
      if(ssSheet){
        const ssRows = XLSX.utils.sheet_to_json(wb.Sheets[ssSheet],{defval:''});
        for(const r of ssRows){
          const mfg=String(r['Manufacturer']||r['Brand']||'').trim();
          const mod=String(r['Model']||'').trim();
          if(!mfg||!mod) continue;
          const sku=String(r['SKU']||'').trim();
          const par=parseInt(r['Par'])||0;
          const notes=String(r['Notes']||'').trim();
          // Find matching inventory record
          const inv=inventory.find(i=>isStockItem(i)&&
            ((sku&&i.sku===sku)||(i.manufacturer===mfg&&i.model===mod))
          );
          if(inv){
            // Merge par and notes from Sheet if not already set
            if(par>0 && !inv.par) inv.par=par;
            if(notes && !inv.notes) inv.notes=notes;
          }
        }
      }

      renderLocPage();

      // Load Transfers
      transfers = [];
      const xfrSheet = wb.SheetNames.find(s=>s.toLowerCase()==='transfers');
      if(xfrSheet){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[xfrSheet],{defval:''});
        for(const r of rows){
          const id=String(r['Transfer ID']||'').trim(); if(!id) continue;
          transfers.push({
            id,
            timestamp:    String(r['Timestamp']||'').trim(),
            inventoryId:  String(r['Inventory ID']||'').trim(),
            sku:          String(r['SKU']||'').trim(),
            manufacturer: String(r['Manufacturer']||'').trim(),
            model:        String(r['Model']||'').trim(),
            serial:       String(r['Serial']||'').trim(),
            qty:          parseInt(r['Qty'])||1,
            fromProjectId:String(r['From Project ID']||'').trim(),
            fromProject:  String(r['From Project']||'').trim(),
            toProjectId:  String(r['To Project ID']||'').trim(),
            toProject:    String(r['To Project']||'').trim(),
            fromLocation: String(r['From Location']||'').trim(),
            fromLocationId:String(r['From Location ID']||'').trim(),
            toLocation:   String(r['To Location']||'').trim(),
            toLocationId: String(r['To Location ID']||'').trim(),
            notes:        String(r['Notes']||'').trim(),
          });
        }
      }

      toast(`Loaded — ${catalog.length.toLocaleString()} products, ${inventory.length} inventory items, ${projects.length} projects, ${orders.length} orders, ${rmas.length} RMAs`,'success');
    }catch(err){toast('Failed: '+err.message,'error');console.error(err);}
}

function replaceSheet(wb, name, ws){
  wb.Sheets[name] = ws;
  if(wb.SheetNames.indexOf(name) === -1) wb.SheetNames.push(name);
}

function buildWorkbookBlob(){
  const wb = workbookData ? XLSX.read(workbookData, {type:'binary'}) : XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('en-US');

  // Inventory sheet
  const invRows = inventory.map(i=>({
    'SKU':i.sku, 'Manufacturer':i.manufacturer, 'Model':i.model, 'Category':i.category,
    'Type':i.type, 'Serial Number':i.serial, 'Par':i.par||0, 'Qty':i.qty,
    'Location':i.location, 'Location ID':i.locationId||'',
    'Condition':i.condition, 'Status':i.status, 'Inv Status':i.invStatus||'',
    'Project':i.project, 'Project ID':i.projectId||'',
    'PO Number':i.poNumber||'',
    'Notes':i.notes,
    'Date Added':i.dateAdded||today, 'Last Updated':today,
  }));
  const invWs = XLSX.utils.json_to_sheet(invRows, {header:INV_COLS});
  invWs['!cols'] = [16,24,42,22,12,20,6,8,14,16,14,14,14,22,14,14,36,14,14].map(w=>({wch:w}));
  const invName = wb.SheetNames.find(s=>s.toLowerCase().includes('inventory'))||'Inventory';
  replaceSheet(wb, invName, invWs);

  // Pricebook sheet
  const pbName = wb.SheetNames.find(s=>s.toLowerCase().includes('product')||s.toLowerCase().includes('book'))||'Pricebook';
  const pbRows = catalog.map(r=>({
    'Manufacturer':r.manufacturer, 'Model':r.model, 'Category':r.category,
    'Subcategory':r.subcategory||'', 'URL':r.url||'',
    'Short Description':r.shortDesc||'', 'Long Description':r.longDesc||'',
    'MSRP':r.msrp||'', 'Unit Cost':r.unitCost||'', 'Unit Price':r.unitPrice||'',
    'SKU':r.sku,
  }));
  const pbWs = XLSX.utils.json_to_sheet(pbRows, {header:['Manufacturer','Model','Category','Subcategory','URL','Short Description','Long Description','MSRP','Unit Cost','Unit Price','SKU']});
  pbWs['!cols'] = [24,40,22,22,40,50,60,12,12,12,16].map(w=>({wch:w}));
  replaceSheet(wb, pbName, pbWs);

  // Projects sheet
  const projSheetName = wb.SheetNames.find(s=>s.toLowerCase()==='projects')||'Projects';
  const projRows = projects.map(p=>({
    'Project ID':p.id, 'Project Name':p.name, 'Status':p.status,
    'Client First Name':p.firstName, 'Client Last Name':p.lastName,
    'Address':p.address, 'Phone':p.phone, 'Email':p.email,
    'Contract Value':p.contractValue||'',
    'Start Date':p.startDate, 'Target Completion':p.targetDate, 'Notes':p.notes,
  }));
  const projWs = XLSX.utils.json_to_sheet(projRows, {header:['Project ID','Project Name','Status','Client First Name','Client Last Name','Address','Phone','Email','Contract Value','Start Date','Target Completion','Notes']});
  projWs['!cols'] = [12,20,12,16,16,30,14,24,14,12,14,36].map(w=>({wch:w}));
  replaceSheet(wb, projSheetName, projWs);

  // Project Items sheet
  const piName = wb.SheetNames.find(s=>s.toLowerCase().includes('project item'))||'Project Items';
  const piRows = projectItems.map(i=>({
    'Project ID':i.projectId, 'SKU':i.sku,
    'Manufacturer':i.manufacturer, 'Model':i.model, 'Category':i.category,
    'Qty':i.qty, 'Unit Cost':i.unitCost||0, 'Unit Price':i.unitPrice||0,
    'Line Total':i.qty*(i.unitPrice||0),
    'Item Status':i.itemStatus, 'Notes':i.notes,
    'Inventory IDs':(i.inventoryIds||[]).join(','),
  }));
  const piWs = XLSX.utils.json_to_sheet(piRows, {header:['Project ID','SKU','Manufacturer','Model','Category','Qty','Unit Cost','Unit Price','Line Total','Item Status','Notes','Inventory IDs']});
  piWs['!cols'] = [12,14,22,36,20,6,12,12,12,12,30,40].map(w=>({wch:w}));
  replaceSheet(wb, piName, piWs);

  // Orders sheet
  const ordName = wb.SheetNames.find(s=>s.toLowerCase()==='orders')||'Orders';
  const ordRows = orders.map(o=>({
    'PO Number':o.poNumber, 'Vendor':o.vendor,
    'Project ID':o.projectId, 'Project Name':o.projectName,
    'Status':o.status, 'Date':o.date, 'Shipment':o.shipment,
    'Total Value':o.totalValue||'', 'Item Discount Total':o.itemDiscountTotal||0,
    'Tax':o.tax||0, 'Tariff':o.tariff||0, 'Shipping':o.shipping||0,
    'Order Discount':o.discount||0, 'Grand Total':poGrand(o), 'Notes':o.notes,
  }));
  const ordWs = XLSX.utils.json_to_sheet(ordRows,{header:['PO Number','Vendor','Project ID','Project Name','Status','Date','Shipment','Total Value','Item Discount Total','Tax','Tariff','Shipping','Order Discount','Grand Total','Notes']});
  ordWs['!cols']=[12,20,12,18,12,12,12,12,14,10,10,10,12,12,30].map(w=>({wch:w}));
  replaceSheet(wb, ordName, ordWs);

  // Order Items sheet
  const oiName = wb.SheetNames.find(s=>s.toLowerCase().includes('order item'))||'Order Items';
  const oiRows = orderItems.map(i=>({
    'PO Number':i.poNumber, 'SKU':i.sku,
    'Manufacturer':i.manufacturer, 'Model':i.model, 'Description':i.description,
    'Qty Ordered':i.qtyOrdered, 'Qty Received':i.qtyReceived,
    'Unit Cost':i.unitCost, 'Discount':i.discount||0,
    'Line Total':(i.qtyOrdered*i.unitCost)-(i.discount||0),
    'Notes':i.notes, 'Date Received':i.dateReceived||'',
  }));
  const oiWs = XLSX.utils.json_to_sheet(oiRows,{header:['PO Number','SKU','Manufacturer','Model','Description','Qty Ordered','Qty Received','Unit Cost','Discount','Line Total','Notes','Date Received']});
  oiWs['!cols']=[12,14,22,36,40,10,10,12,10,12,30,20].map(w=>({wch:w}));
  replaceSheet(wb, oiName, oiWs);

  // RMAs sheet
  const rmaName = wb.SheetNames.find(s=>s.toLowerCase()==='rmas')||'RMAs';
  const rmaRows = rmas.map(r=>({
    'RMA ID':r.rmaId, 'Type':r.type,
    'Project ID':r.projectId, 'Project Name':r.projectName,
    'SKU':r.sku, 'Manufacturer':r.manufacturer, 'Model':r.model,
    'Qty':r.qty, 'Vendor':r.vendor,
    'Status':r.status, 'Reason':r.reason,
    'Date Opened':r.dateOpened, 'Date Closed':r.dateClosed,
    'Carrier':r.carrier||'', 'Billing':r.billingType||'',
    'Billing Acct #':r.billingAccount||'', 'Tracking #':r.trackingNumber||'',
    'Date Shipped':r.dateShipped||'',
    'Vendor RMA #':r.vendorRmaNumber||'', 'Ship To':r.shipToAddress||'',
  }));
  const rmaWs = XLSX.utils.json_to_sheet(rmaRows,{header:['RMA ID','Type','Project ID','Project Name','SKU','Manufacturer','Model','Qty','Vendor','Status','Reason','Date Opened','Date Closed','Carrier','Billing','Billing Acct #','Tracking #','Date Shipped','Vendor RMA #','Ship To']});
  rmaWs['!cols']=[12,20,12,18,14,22,36,6,20,12,40,14,14,10,22,16,26,14,14,40].map(w=>({wch:w}));
  replaceSheet(wb, rmaName, rmaWs);

  // Locations sheet
  if(locations.length){
    const LOC_COLS = ['Location ID','Parent ID','Warehouse ID','Name','Code','Tier','Tier Index','Type','Notes'];
    const locRows = locations.map(l=>({
      'Location ID':l.id, 'Parent ID':l.parentId||'', 'Warehouse ID':l.warehouseId||'',
      'Name':l.name, 'Code':l.code, 'Tier':l.tier, 'Tier Index':l.tierIndex,
      'Type':l.type, 'Notes':l.notes||'',
    }));
    const locWs = XLSX.utils.json_to_sheet(locRows,{header:LOC_COLS});
    locWs['!cols']=[16,16,16,20,20,12,10,14,30].map(w=>({wch:w}));
    replaceSheet(wb,'Locations',locWs);
  }

  // Transfers sheet
  if(transfers.length){
    const XFR_COLS=['Transfer ID','Timestamp','Inventory ID','SKU','Manufacturer','Model','Serial','Qty',
      'From Project ID','From Project','To Project ID','To Project',
      'From Location','From Location ID','To Location','To Location ID','Notes'];
    const xfrRows=transfers.map(t=>({
      'Transfer ID':t.id, 'Timestamp':t.timestamp,
      'Inventory ID':t.inventoryId||'', 'SKU':t.sku||'',
      'Manufacturer':t.manufacturer, 'Model':t.model, 'Serial':t.serial||'', 'Qty':t.qty,
      'From Project ID':t.fromProjectId||'', 'From Project':t.fromProject||'',
      'To Project ID':t.toProjectId||'', 'To Project':t.toProject||'',
      'From Location':t.fromLocation||'', 'From Location ID':t.fromLocationId||'',
      'To Location':t.toLocation||'', 'To Location ID':t.toLocationId||'',
      'Notes':t.notes||'',
    }));
    const xfrWs=XLSX.utils.json_to_sheet(xfrRows,{header:XFR_COLS});
    xfrWs['!cols']=[16,20,16,14,22,36,20,6,16,22,16,22,16,16,16,16,40].map(w=>({wch:w}));
    replaceSheet(wb,'Transfers',xfrWs);
  }

  // Shop-Stock sheet
  const ssName = wb.SheetNames.find(s=>s.toLowerCase().replace(/[\s-]/g,'').includes('shopstock')||s.toLowerCase()==='shop-stock')||'Shop-Stock';
  const stockItems = inventory.filter(i=>isStockItem(i));
  if(stockItems.length){
    const SS_COLS=['SKU','Manufacturer','Model','Category','On Hand','Par','Need to Order','Status','Notes','Last Updated'];
    const ssRows = stockItems.map(i=>({
      'SKU':i.sku||'', 'Manufacturer':i.manufacturer, 'Model':i.model, 'Category':i.category||'',
      'On Hand':i.qty||0, 'Par':i.par||0,
      'Need to Order':Math.max(0,(i.par||0)-(i.qty||0)),
      'Status':i.qty>0?'On Hand':'Out of Stock',
      'Notes':i.notes||'', 'Last Updated':today,
    }));
    const ssWs = XLSX.utils.json_to_sheet(ssRows,{header:SS_COLS});
    ssWs['!cols']=[14,22,36,18,10,8,14,14,30,14].map(w=>({wch:w}));
    replaceSheet(wb, ssName, ssWs);
  }

  // Restore sheet order
  const order = ['Decoder Ring','Product Book','Inventory','Orders','Order Items','Projects','Project Items','Vendors','RMAs','Shop-Stock','Locations','Transfers'];
  wb.SheetNames.sort((a,b)=>(order.indexOf(a)===-1?99:order.indexOf(a))-(order.indexOf(b)===-1?99:order.indexOf(b)));

  const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  return new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

async function blobToBinary(blob){
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for(let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return binary;
}

async function migrateToSQLite(){
  if(!workbookData){ toast('Load a workbook first','error'); return; }
  toast('Migrating to SQLite…','info');
  try{
    const payload = {
      catalog, inventory, projects,
      projectItems, orders, orderItems,
      rmas, locations, transfers
    };
    const res = await fetch('api/migrate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if(!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    toast('Migration complete — SQLite DB populated','info');
    console.log('[AVProcure] Migration result:', json);
  } catch(err){
    toast('Migration failed: '+err.message,'error');
    console.error('[AVProcure] Migration error:', err);
  }
}

function autoSave(){ /* no-op — xlsx auto-save removed; use Export to Excel button */ }

async function exportToExcel(){
  try{
    const blob = buildWorkbookBlob();
    if(window.showSaveFilePicker){
      try{
        const fh = await window.showSaveFilePicker({
          suggestedName: workbookName,
          types:[{description:'Excel Workbook', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}],
        });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        workbookName = fh.name;
      } catch(err){
        if(err.name==='AbortError') return;
        throw err;
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = workbookName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }
    workbookData = await blobToBinary(blob);
    setDirty(false);
    toast('Excel export downloaded','success');
  } catch(err){
    toast('Export failed: '+err.message, 'error');
    console.error('exportToExcel failed:', err);
  }
}


// ══════════════════════════════════════════════════════════════════════════
// EXPORT MENU (admin-only) — Excel (.xlsx) · JSON (.json) · SQLite DB (.db)
// ══════════════════════════════════════════════════════════════════════════
function _downloadBlob(blob, filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function toggleExportMenu(){
  const m=document.getElementById('export-menu'); if(m) m.style.display=(m.style.display==='none'||!m.style.display)?'block':'none';
}
function closeExportMenu(){ const m=document.getElementById('export-menu'); if(m) m.style.display='none'; }

function doExport(fmt){
  closeExportMenu();
  if(fmt==='xlsx') exportToExcel();
  else if(fmt==='json') exportJSON();
  else if(fmt==='db') downloadDB();
}

// Full in-memory data dump as JSON (mirrors the API /api/data entities).
function exportJSON(){
  try{
    const data={
      catalog, inventory, projects, projectItems, orders, orderItems, rmas, locations,
      transfers, clients, clientLocations, vendors,
      invoices, invoiceItems, invoicePayments,
      vendorBills, vendorBillItems, vendorBillPayments,
      shipments, shipmentItems, deployments, deploymentItems, deployCarts,
    };
    _downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),
      'avprocure-'+new Date().toISOString().slice(0,10)+'.json');
    toast('JSON exported','success');
  }catch(err){ toast('JSON export failed: '+err.message,'error'); console.error(err); }
}

// Admin-only: download a data-only copy of the SQLite DB (server strips auth tables).
function downloadDB(){
  const a=document.createElement('a'); a.href='export-db.php';
  document.body.appendChild(a); a.click(); a.remove();
  toast('Preparing database download…','success');
}

// Hide all export controls for non-admin users (the DB endpoint also enforces this server-side).
function _applyExportAdminGate(){
  if(window.APP_IS_ADMIN) return;
  const w=document.getElementById('export-wrap'); if(w) w.style.display='none';
  document.querySelectorAll('.export-admin-only').forEach(el=>el.style.display='none');
}
document.addEventListener('DOMContentLoaded', _applyExportAdminGate);
document.addEventListener('click', e=>{ if(!e.target.closest('#export-wrap')) closeExportMenu(); });
