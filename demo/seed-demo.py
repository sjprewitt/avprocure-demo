#!/usr/bin/env python3
"""
AVProcure demo seed.

Builds a fully populated AVProcure database from invented data: no customer,
pricing or vendor information from any live system is used or required. The
schema is created by the application's own create_schema() (see mkdemo.php), so
the demo database is structurally identical to a production one by construction.

Deterministic: the same seed always produces the same database.
"""
import sqlite3, random, json, sys
from datetime import date, timedelta

DB = sys.argv[1] if len(sys.argv) > 1 else 'avp-demo.db'
random.seed(1729)
TODAY = date(2026, 10, 1)
def d(off):  return (TODAY - timedelta(days=off)).strftime('%-m/%-d/%Y')
def iso(off): return (TODAY - timedelta(days=off)).isoformat() + 'T16:00:00.000Z'
_n = [0]
def uid(p=''):
    _n[0] += 1
    return f'{p}{_n[0]:06x}{random.randint(0,0xfff):03x}'

con = sqlite3.connect(DB); cur = con.cursor()
ins = lambda t, r: cur.execute(
    f"insert into {t} ({','.join(r)}) values ({','.join('?'*len(r))})", list(r.values()))

# ── Catalog ──────────────────────────────────────────────────────────────────
CAT_CODES = {'Speakers':'SPK','Amplifiers & Receivers':'AMP','Control Systems':'CTL',
  'Networking':'NET','Display Devices':'DSP','Projectors & Screens':'PRJ','Video':'VID',
  'Audio':'AUD','Lighting':'LGT','Power & Protection':'PWR','Cables & Connectors':'CAB',
  'Rack & Enclosures':'RCK','Mounts & Brackets':'MNT','Wall Plates & Faceplates':'WPL',
  'Access Control & Security':'SEC','Supplies & Hardware':'SUP','Computers & Servers':'CMP'}
LINES = [  # (manufacturer, mfgcode, category, model prefixes, price band)
 ('Crestron','CRE','Control Systems',['CP4N','TSW-770','TST-1080','DIN-AP4','MC4'],(400,3200)),
 ('Crestron','CRE','Video',['DM-NVX-363','DM-NVX-384','HD-MD4X2','DM-MD8X8'],(900,4800)),
 ('Lutron','LUT','Lighting',['QSE-CI-NWK','HQP7-2','LQSE-4A5','QSPS-P1-1','MRF2S-6ANS'],(90,1400)),
 ('Sonance','SON','Speakers',['VX62R','VX66R','VX82R','IS6','R1','PS-C83RT'],(180,1700)),
 ('Sonos','SNO','Audio',['Era 300','Era 100','Arc Ultra','Sub 4','Amp','Port'],(230,1100)),
 ('Ubiquiti','UBI','Networking',['U7-Pro','USW-Pro-24-PoE','UDM-SE','UNVR','E7-US'],(140,1900)),
 ('Araknis','ARA','Networking',['AN-310-SW-16','AN-810-AP-I','AN-110-RT-4L2W'],(150,1200)),
 ('Middle Atlantic','MID','Rack & Enclosures',['WRK-44','SR-2','U1','PDLT-2X','RSH4A2'],(45,2400)),
 ('SurgeX','SRG','Power & Protection',['SX-1120-RT','UPS-1000-OL','SEQ-1U','XSG-20'],(320,2600)),
 ('Samsung','SAM','Display Devices',['QN65S95','QN75QN90','QB65C','QM55C'],(900,4200)),
 ('Sony','SNY','Display Devices',['K-65XR70','K-75XR80','FWD-55X80'],(1100,5600)),
 ('Epson','EPS','Projectors & Screens',['LS12000','QB1000','PU2220B'],(2400,9500)),
 ('Screen Innovations','SCI','Projectors & Screens',['SI-7-120','Zero-G-100','Solo-2-110'],(1400,7200)),
 ('Marantz','MAR','Amplifiers & Receivers',['Cinema 40','Cinema 60','AV10','MM7055'],(900,6400)),
 ('Kaleidescape','KAL','Video',['Strato V','Terra 22TB','Terra Prime 48TB'],(2200,14000)),
 ('Liberty Wire','LIB','Cables & Connectors',['14-4C-P-WHT','16-2C-P-BLK','CAT6A-P-BLU'],(85,480)),
 ('Leviton','LEV','Wall Plates & Faceplates',['61110-RE6','42080-2ES','AWP-1G-W'],(2,28)),
 ('Chief','CHF','Mounts & Brackets',['LTM1U','XSM1U','RPMAU','CMA440'],(55,620)),
 ('Luxul','LUX','Networking',['AMS-1208P','XWR-3150','ABR-4500'],(190,900)),
 ('Apple','APP','Computers & Servers',['Apple TV 4K 128GB','Mac mini M4'],(130,1400)),
]
catalog, by_cat = [], {}
for mfg, mcode, cat, models, (lo, hi) in LINES:
    for i, base in enumerate(models):
        for variant in range(random.randint(2, 5)):
            model = base if variant == 0 else f'{base}-{random.choice(["B","W","K","MKII","2","PRO"])}'
            sku = f'{CAT_CODES[cat]}-{mcode}-{len(catalog)+1:04d}'
            msrp = round(random.uniform(lo, hi), 2)
            cost = round(msrp * random.uniform(0.45, 0.68), 2)
            rec = dict(sku=sku, manufacturer=mfg, model=model, category=cat,
                       subcategory='', url='', shortDesc=f'{mfg} {model}', longDesc='',
                       msrp=msrp, unitCost=cost, unitPrice=msrp)
            ins('catalog', rec); catalog.append(rec); by_cat.setdefault(cat, []).append(rec)

# ── Warehouse locations ──────────────────────────────────────────────────────
wh = dict(id=uid('loc'), parentId='', warehouseId='', name='Main Warehouse', code='WH1',
          tier='warehouse', tierIndex=0, type='warehouse', notes='', street='4120 Fabricated Way',
          city='Burbank', state='CA', zip='91505', phone='818-555-0142')
ins('locations', wh)
shelves = []
for aisle in 'ABCDEF':
    a = dict(id=uid('loc'), parentId=wh['id'], warehouseId=wh['id'], name=f'Aisle {aisle}',
             code=aisle, tier='aisle', tierIndex=1, type='general',
             notes='', street='', city='', state='', zip='', phone='')
    ins('locations', a)
    for rack in range(1, 6):
        r = dict(id=uid('loc'), parentId=a['id'], warehouseId=wh['id'], name=f'Rack {rack}',
                 code=f'{aisle}-{rack}', tier='rack', tierIndex=2, type='general',
                 notes='', street='', city='', state='', zip='', phone='')
        ins('locations', r)
        for sh in range(1, 5):
            s = dict(id=uid('loc'), parentId=r['id'], warehouseId=wh['id'], name=f'Shelf {sh}',
                     code=f'{aisle}-{rack}-{sh}', tier='shelf', tierIndex=3,
                     type='staging' if aisle == 'O' else 'general',
                     notes='', street='', city='', state='', zip='', phone='')
            ins('locations', s); shelves.append(s)
stock_loc = dict(id=uid('loc'), parentId=wh['id'], warehouseId=wh['id'], name='Shop Stock',
                 code='Stock', tier='shelf', tierIndex=3, type='general',
                 notes='', street='', city='', state='', zip='', phone='')
ins('locations', stock_loc)

# ── Vendors ──────────────────────────────────────────────────────────────────
VENDORS = ['Pinnacle AV Distribution','Westbrook Supply Co','Harbor Point Electronics',
 'Cascade Pro Audio','Meridian Trade Group','Northgate Technologies','Blue Larch Supply',
 'Fairmont AV Wholesale','Orchard Lane Distribution','Stonebridge Components',
 'Redwater Integration Supply','Lanternhouse Trading','Copperfield AV','Tidewater Systems Supply']
vendors = []
for v in VENDORS:
    rec = dict(id=uid('ven'), name=v, contactName=random.choice(['J. Alvarez','P. Nakamura','R. Obi','S. Lindqvist','M. Dufresne']),
               email=f"sales@{v.split()[0].lower()}.example", phone=f'818-555-{random.randint(1000,9999)}',
               website='', street=f'{random.randint(100,9000)} {random.choice(["Cedar","Juniper","Marlowe","Pembroke"])} Ave',
               city=random.choice(['Burbank','Van Nuys','Torrance','Anaheim']), state='CA',
               zip=f'9{random.randint(1000,1799)}', terms=random.choice(['Net 30','Net 15','Due on receipt']),
               accountNumber=f'ACCT-{random.randint(10000,99999)}', notes='', qbId='', qbSyncToken='')
    ins('vendors', rec); vendors.append(rec)

# ── Clients, work sites, projects ────────────────────────────────────────────
FIRST = ['Avery','Marcus','Priya','Dashiell','Imogen','Rafael','Noor','Tobias','Celine','Everett',
         'Sunniva','Mateo','Ingrid','Oscar','Beatrix','Khalid','Rosalind','Ewan','Delphine','Soren',
         'Juniper','Casper','Mireille','Anton','Vivienne','Lennox']
LAST = ['Hollingsworth','Okonkwo','Vasquez','Lindqvist','Marchetti','Abernathy','Ferreira','Stillwell',
        'Nakashima','Beaumont','Calloway','Rosenthal','Thibodeaux','Ashworth','Delacroix','Yamamoto',
        'Pemberton','Oyelaran','Blackwood','Castellanos','Fairweather','Novakovic','Winterbourne',
        'Alsaffar','Montrose','Kirkpatrick']
SITE = ['Main Residence','Hillside House','Beach Property','Guest House','Canyon Estate','City Loft',
        'Lake Cabin','Studio','Ranch','Pool House']
STREETS = ['Alder Crest Rd','Verano Terrace','Mulholland Vista','Sandpiper Ln','Fennwick Dr',
           'Calabria Pl','Juniper Hollow','Westmere Ct','Bellhaven Rd','Tamarind Way']
CITY = [('Beverly Hills','90210'),('Malibu','90265'),('Pasadena','91106'),('Santa Monica','90402'),
        ('Encino','91436'),('Calabasas','91302'),('Manhattan Beach','90266'),('Studio City','91604')]

clients, sites, projects = [], [], []
for i in range(24):
    fn, ln = FIRST[i], LAST[i]
    city, zp = random.choice(CITY)
    c = dict(id=uid('cli'), name=f'{fn} {ln}', firstName=fn, lastName=ln,
             address=f'{random.randint(100,9800)} {random.choice(STREETS)}',
             street=f'{random.randint(100,9800)} {random.choice(STREETS)}', city=city, state='CA', zip=zp,
             phone=f'310-555-{random.randint(1000,9999)}',
             email=f'{fn.lower()}.{ln.lower()}@example.com', notes='', isDefault=0, qbId='', qbSyncToken='')
    ins('clients', c); clients.append(c)
    for j in range(random.randint(1, 2)):
        city2, zp2 = random.choice(CITY)
        s = dict(id=uid('site'), clientId=c['id'], name=SITE[(i+j) % len(SITE)],
                 street=f'{random.randint(100,9800)} {random.choice(STREETS)}', city=city2, state='CA',
                 zip=zp2, phone=c['phone'], notes='', isDefault=1 if j == 0 else 0, qbId='', qbSyncToken='')
        ins('client_locations', s); sites.append(s)
        for folder in (['Main','Service'] if j == 0 else ['Main']):
            p = dict(id=uid('prj'), name=folder,
                     status=random.choice(['Open','Open','In Progress','Complete']), type='job',
                     firstName=fn, lastName=ln, address=s['street'], phone=c['phone'], email=c['email'],
                     contractValue=round(random.uniform(18000, 420000), 2),
                     startDate=d(random.randint(60, 700)), targetDate=d(-random.randint(10, 200)),
                     notes='', clientId=c['id'], clientLocationId=s['id'], qbId='', qbSyncToken='')
            ins('projects', p); projects.append(p)
# Shop-stock pseudo-project (the app treats type='stock' as a stock pool)
shop = dict(id=uid('prj'), name='Shop-Stock', status='Open', type='stock', firstName='', lastName='',
            address='', phone='', email='', contractValue=0, startDate=d(900), targetDate='',
            notes='Internal shop stock', clientId='', clientLocationId='', qbId='', qbSyncToken='')
ins('projects', shop); projects.append(shop)
jobs = [p for p in projects if p['type'] == 'job']

# ── Purchase orders ──────────────────────────────────────────────────────────
orders, oitems = [], []
po_no = 2100
for _ in range(190):
    po_no += random.randint(1, 3)
    p = shop if random.random() < 0.15 else random.choice(jobs)
    v = random.choice(vendors)
    status = random.choices(['Received','Submitted','Backorder','Draft'], [5,4,2,1])[0]
    o = dict(poNumber=str(po_no), vendor=v['name'], projectId=p['id'], projectName=p['name'],
             status=status, date=d(random.randint(5, 640)), shipment=random.choice(['Ground','Freight','2-Day','Will Call']),
             totalValue=0, itemDiscountTotal=0, tax=0, tariff=0, shipping=round(random.uniform(0, 310), 2),
             discount=0, notes='', shipAddress='', otherCharges='[]', vendorId=v['id'])
    total = 0
    lines = []
    for _ in range(random.randint(1, 6)):
        c = random.choice(catalog)
        qty = random.choices([1,2,3,4,6,10],[7,5,3,2,1,1])[0]
        recvd = qty if status == 'Received' else (random.randint(0, qty) if status == 'Backorder' else 0)
        it = dict(id=uid('oi'), poNumber=o['poNumber'], sku=c['sku'], manufacturer=c['manufacturer'],
                  model=c['model'], description='', category=c['category'], qtyOrdered=qty,
                  qtyReceived=recvd, unitCost=c['unitCost'], discount=0, notes='',
                  dateReceived=o['date'] if recvd else '')
        lines.append(it); total += qty * c['unitCost']
    o['totalValue'] = round(total + o['shipping'], 2)
    ins('orders', o); orders.append(o)
    for it in lines:
        ins('order_items', it); oitems.append(it)

# ── Inventory, received against those POs ────────────────────────────────────
inventory = []
for it in oitems:
    if not it['qtyReceived']:
        continue
    o = next(x for x in orders if x['poNumber'] == it['poNumber'])
    p = next(x for x in projects if x['id'] == o['projectId'])
    is_stock = p['type'] == 'stock'
    serialized = it['category'] not in ('Cables & Connectors','Wall Plates & Faceplates','Supplies & Hardware')
    n = it['qtyReceived'] if serialized else 1
    for k in range(n):
        st = ('In Stock' if is_stock else
              random.choices(['Allocated','Deployed','Unallocated'], [4,5,2])[0])
        loc = stock_loc if is_stock else random.choice(shelves)
        deployed = st == 'Deployed'
        rec = dict(id=uid('inv'), sku=it['sku'], manufacturer=it['manufacturer'], model=it['model'],
                   category=it['category'], type='serialized' if serialized else 'bulk',
                   serial=f'{random.randint(100,999)}{random.choice("ABCDEFGH")}{random.randint(10000,99999)}' if serialized else '',
                   par=0, qty=1 if serialized else it['qtyReceived'],
                   location='' if deployed else loc['code'], locationId='' if deployed else loc['id'],
                   condition=random.choices(['New','New','New','Good','Fair'], [6,5,4,2,1])[0],
                   status=st, invStatus=st,
                   project='' if is_stock else p['name'], projectId='' if is_stock else p['id'],
                   poNumber=o['poNumber'], notes=f"From PO {o['poNumber']}",
                   dateAdded=o['date'], lastUpdated=o['date'])
        ins('inventory', rec); inventory.append(rec)

# ── Scope lines, derived from what each project actually ordered ─────────────
# Built after inventory so coverage (Filled / Partial / Pending) reflects real
# order and receipt history rather than random pairings.
scope = []
for p in jobs:
    held = [i for i in inventory if i['projectId'] == p['id']]
    bysku = {}
    for i in held:
        bysku.setdefault(i['sku'], []).append(i)
    for sku, units in bysku.items():
        c = next(x for x in catalog if x['sku'] == sku)
        got = sum(u['qty'] for u in units)
        # most lines fully satisfied, some still short -> Partial
        want = got if random.random() < 0.72 else got + random.randint(1, 3)
        si = dict(id=uid('si'), projectId=p['id'], sku=sku, manufacturer=c['manufacturer'],
                  model=c['model'], category=c['category'], qty=want,
                  unitCost=c['unitCost'], unitPrice=c['unitPrice'],
                  inventoryIds=json.dumps([u['id'] for u in units]), unfilledIds='[]',
                  itemStatus='Filled' if got >= want else 'Partial', notes='', filled=got)
        ins('project_items', si); scope.append(si)
    # a few lines not yet ordered at all -> Pending, drives the PO picker
    for _ in range(random.randint(0, 4)):
        c = random.choice(catalog)
        si = dict(id=uid('si'), projectId=p['id'], sku=c['sku'], manufacturer=c['manufacturer'],
                  model=c['model'], category=c['category'], qty=random.randint(1, 6),
                  unitCost=c['unitCost'], unitPrice=c['unitPrice'], inventoryIds='[]',
                  unfilledIds='[]', itemStatus='Pending', notes='', filled=0)
        ins('project_items', si); scope.append(si)

# Shop-stock par levels so the reorder report has something to show
for i in inventory:
    if i['invStatus'] == 'In Stock' and random.random() < 0.6:
        # mostly at or above par; a minority short, so the reorder report is meaningful
        par = i['qty'] + random.choice([-1, 0, 0, 0, 1, 2])
        cur.execute('update inventory set par=? where id=?', (max(1, par), i['id']))

# ── Deployments (release records + transfer log) ─────────────────────────────
dep_pool = [i for i in inventory if i['invStatus'] == 'Deployed']
random.shuffle(dep_pool)
while len(dep_pool) > 6:
    batch = [dep_pool.pop() for _ in range(random.randint(2, 9)) if dep_pool]
    p = next(x for x in projects if x['id'] == batch[0]['projectId']) if batch[0]['projectId'] else jobs[0]
    off = random.randint(3, 400)
    dep = dict(id=uid('dep'), date=d(off), timestamp=iso(off), status='approved',
               recipient=random.choice(['D. Marchetti','L. Okafor','T. Brennan','R. Sandoval','K. Weiss']),
               destination=p['name'], destinationProjectId=p['id'],
               releasedBy='demo', notes='')
    ins('deployments', dep)
    for b in batch:
        ins('deployment_items', dict(id=uid('di'), deploymentId=dep['id'], inventoryId=b['id'],
            sku=b['sku'], manufacturer=b['manufacturer'], model=b['model'], serial=b['serial'], qty=b['qty']))
        ins('transfers', dict(id=uid('xf'), timestamp=dep['timestamp'], inventoryId=b['id'], sku=b['sku'],
            manufacturer=b['manufacturer'], model=b['model'], serial=b['serial'], qty=b['qty'],
            fromProjectId=b['projectId'], fromProject=b['project'], toProjectId=p['id'], toProject=p['name'],
            fromLocation='', fromLocationId='', toLocation='Deployed', toLocationId='',
            notes=f"Deployed to {dep['recipient']} @ {dep['destination']}"))

# ── Invoices ─────────────────────────────────────────────────────────────────
for n, p in enumerate(random.sample(jobs, 28), start=1):
    c = next((x for x in clients if x['id'] == p['clientId']), None)
    lines = [s for s in scope if s['projectId'] == p['id']][:6]
    if not lines: continue
    sub = round(sum(l['qty'] * l['unitPrice'] for l in lines), 2)
    off = random.randint(5, 420)
    inv = dict(id=uid('invc'), invoiceNumber=f'INV-2026-{n:04d}', projectId=p['id'],
               clientName=c['name'] if c else '', date=d(off), dueDate=d(off-30),
               status=random.choice(['Draft','Sent','Paid','Partial']), subtotal=sub,
               tax=round(sub*0.0975, 2), taxMode='%', tariff=0, tariffMode='$', shipping=0,
               shippingMode='$', labor=round(random.uniform(1500, 24000), 2), laborMode='$', notes='')
    ins('invoices', inv)
    for l in lines:
        ins('invoice_items', dict(id=uid('ii'), invoiceId=inv['id'], scopeItemId=l['id'], sku=l['sku'],
            description=f"{l['manufacturer']} {l['model']}", qty=l['qty'], unitPrice=l['unitPrice'], notes=''))
    if inv['status'] in ('Paid','Partial'):
        amt = inv['subtotal'] + inv['tax'] + inv['labor']
        ins('invoice_payments', dict(id=uid('pay'), invoiceId=inv['id'], date=d(max(off-20, 2)),
            amount=round(amt if inv['status'] == 'Paid' else amt*0.5, 2),
            method=random.choice(['Check','ACH','Wire','Card']), notes=''))

# ── RMAs ─────────────────────────────────────────────────────────────────────
for i in range(9):
    src = random.choice(inventory); v = random.choice(vendors)
    p = next((x for x in projects if x['id'] == src['projectId']), jobs[0])
    off = random.randint(10, 300)
    ins('rmas', dict(rmaId=f'RMA-{2026}{i+101}', type=random.choice(
            ['Return to Vendor','Exchange/Replacement','Repair/Service','Customer Return']),
        projectId=p['id'], projectName=p['name'], sku=src['sku'], manufacturer=src['manufacturer'],
        model=src['model'], qty=1, vendor=v['name'],
        status=random.choice(['Open','Shipped','Received','Closed']),
        reason=random.choice(['DOA on commissioning','Intermittent HDMI handshake','Physical damage in transit',
                              'Wrong variant shipped','Fan noise']),
        dateOpened=d(off), dateClosed=d(max(off-25, 1)) if random.random() > .5 else '',
        carrier=random.choice(['UPS','FedEx']), billingType='Bill Receiver',
        billingAccount=v['accountNumber'], trackingNumber=f'1Z{random.randint(10**9,10**10)}',
        dateShipped=d(max(off-3, 1)), vendorRmaNumber=f'V{random.randint(100000,999999)}',
        shipToAddress=f"{v['street']}, {v['city']}, CA {v['zip']}", vendorId=v['id']))


# ── Vendor bills (AP side of Front Desk) and inbound shipments ───────────────
received = [o for o in orders if o['status'] in ('Received','Backorder')]
for n, o in enumerate(random.sample(received, min(46, len(received))), start=1):
    lines = [i for i in oitems if i['poNumber'] == o['poNumber']]
    sub = round(sum(l['qtyOrdered'] * l['unitCost'] for l in lines), 2)
    off = random.randint(4, 500)
    v = next((x for x in vendors if x['name'] == o['vendor']), vendors[0])
    bill = dict(id=uid('vb'), billNumber=f'B-{random.randint(40000,99999)}', poNumber=o['poNumber'],
                vendor=o['vendor'], date=d(off), dueDate=d(max(off-30, 1)),
                status=random.choices(['Paid','Open','Partial','Overdue'], [5,4,2,1])[0],
                subtotal=sub, tax=round(sub*0.0975, 2), taxMode='%', tariff=0, tariffMode='$',
                shipping=o['shipping'], shippingMode='$', notes='', vendorId=v['id'])
    ins('vendor_bills', bill)
    for l in lines:
        ins('vendor_bill_items', dict(id=uid('vbi'), billId=bill['id'], poItemId=l['id'], sku=l['sku'],
            description=f"{l['manufacturer']} {l['model']}", qty=l['qtyOrdered'],
            unitCost=l['unitCost'], notes=''))
    if bill['status'] in ('Paid','Partial'):
        amt = bill['subtotal'] + bill['tax'] + bill['shipping']
        ins('vendor_bill_payments', dict(id=uid('vbp'), billId=bill['id'], date=d(max(off-14, 1)),
            amount=round(amt if bill['status'] == 'Paid' else amt*0.4, 2),
            method=random.choice(['ACH','Check','Card']), notes=''))

for o in random.sample(orders, 38):
    lines = [i for i in oitems if i['poNumber'] == o['poNumber']]
    if not lines: continue
    sh = dict(id=uid('shp'), poNumber=o['poNumber'], projectId=o['projectId'],
              carrier=random.choice(['UPS','FedEx','Freight — Estes','Will Call']),
              trackingNumber=f'1Z{random.randint(10**9,10**10)}',
              estDelivery=d(-random.randint(0, 20)),
              status=random.choice(['In Transit','Delivered','Pending']), notes='')
    ins('shipments', sh)
    for l in lines:
        ins('shipment_items', dict(id=uid('shi'), shipmentId=sh['id'], orderItemId=l['id'],
            qtyShipped=l['qtyOrdered']))

con.commit()
for t in ('catalog','clients','client_locations','vendors','locations','projects','project_items',
          'orders','order_items','inventory','transfers','deployments','deployment_items',
          'invoices','invoice_items','invoice_payments','vendor_bills','vendor_bill_items',
          'vendor_bill_payments','shipments','shipment_items','rmas'):
    print(f"{t:<20}{cur.execute(f'select count(*) from {t}').fetchone()[0]:>7}")
con.close()
