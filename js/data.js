// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let workbookData = null, workbookName = 'AVProcure.xlsx';
let lastLoadedFile = null;
let catalog = [], manufacturers = [], modelsByMfg = {}, categories = [];
let inventory = [], pbFilterQuery = '', invFilterQuery = '', invLocationFilter = '',
    invStatusFilter = '', invLocFilterNodeId = '';
let locations = [], warehouses = [];   // structured location hierarchy
let projects = [], projectItems = [], projFilterQuery = '', projScopeFilter = null, projTypeFilter = 'all';
let projScopeSearch = '', projScopeCat = '';
let orders = [], orderItems = [], ordersFilterQuery = '', ordersTab = 'all', ordersStatFilter = null;
let rmas = [], rmaFilterQuery = '';
let transfers = []; // transfer event log
let clients = [];
let clientLocations = []; // Front Desk hierarchy: client work sites (Client → Location → Project)
let vendors = []; // vendor records (POs/bills/RMAs link via vendorId)
let shipments = [], shipmentItems = [];
let deployments = [], deploymentItems = []; // approved equipment releases (paper trail)
let deployCarts = [];       // saved, named deployment carts (server-side, cross-machine)
let deployCart = [];        // transient staging cart (mirrored to localStorage, not the DB)
let invSelected = new Set(); // inventory row multi-select for bulk add-to-cart
let currentClientId = null;
let fdClientsFilterQuery = '';
let _clientEditId = null;
let invoices=[], invoiceItems=[], invoicePayments=[];
let vendorBills=[], vendorBillItems=[], vendorBillPayments=[];
let fdTab='clients';
let fdInvFilterQuery='', fdInvStatusFilter='';
let fdBillFilterQuery='', fdBillStatusFilter='';
let currentInvoiceId=null, currentBillId=null;
let _invCostMode={tax:'$',tariff:'$',shipping:'$',labor:'$'};
let _billCostMode={tax:'$',tariff:'$',shipping:'$'};
let newBillItems=[], _nbFromPO=false, _nbLinkedPO='';
let _rpTarget=null; // {type:'inv'|'bill', id:string}
let currentProjectId = null, currentPONum = null, currentRMAId = null;
let poNavSource = null; // 'orders' | 'project' — tracks where openOrder was called from
let expandedGroups = new Set(), expandedScopeItems = new Set(), invType = 'serialized', isDirty = false;
let pendingPDFImport = [];
let npoItems = [];
let currentNPOProjectId = null;

// Scan Mode state
let scanModeActive  = false;
let stickyLocId     = '';
let stickyStatus    = 'Unallocated';
let stickyCondition = 'New';
let _pendingInvItem = null;

// Sort state: { col, dir } per table
let invSort    = {col:'manufacturer', dir:'asc'};
let invPage=0, invFilteredCache=[], invSearchTimer, invPageSize=50;
let pbSort     = {col:'manufacturer', dir:'asc'};
let pbPage=0, pbFilteredCache=[], pbSearchTimer;
const PB_PAGE_SIZE=100;
let projSort   = {col:'name', dir:'asc'};
let ordersSort = {col:'poNumber', dir:'desc'};
let projItemsSort = {col:'sku', dir:'asc'};
let projPOsSort = {col:'poNumber', dir:'desc'};
let rmaSort    = {col:'dateOpened', dir:'desc'};
let stockSort  = {col:'manufacturer', dir:'asc'};
let stockFilterQuery = '';

// Per-context AC state
let acCtx = {
  inv:  { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1}, cat:{selected:null,focusIdx:-1} },
  pb:   { mfg:{selected:null,focusIdx:-1}, cat:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  item: { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  poi:  { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  editpo: { project:{selected:null,focusIdx:-1} },
  editpoi:{ mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  si:   { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  po:   { project:{selected:null,focusIdx:-1} },
  npo:  { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1} },
  rma:  { mfg:{selected:null,focusIdx:-1}, model:{selected:null,focusIdx:-1}, project:{selected:null,focusIdx:-1} },
  pbp:  { cat:{selected:null,focusIdx:-1} },
};

const INV_COLS = ['SKU','Manufacturer','Model','Category','Type','Serial Number','Par','Qty',
                  'Location','Location ID','Condition','Status','Inv Status',
                  'Project','Project ID','PO Number','Notes','Date Added','Last Updated'];

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,5);}

// Category → 3-letter code map (mirrors existing SKUs)
const CAT_CODES = {
  'Speakers':'SPK','Amplifiers & Receivers':'AMP','Control Systems':'CTL',
  'Networking':'NET','Display Devices':'DSP','Projectors & Screens':'PRJ',
  'Video':'VID','Audio':'AUD','Lighting':'LGT','Power & Protection':'PWR',
  'Cables & Connectors':'CAB','Rack & Enclosures':'RCK','Mounts & Brackets':'MNT',
  'Wall Plates & Faceplates':'WPL','Access Control & Security':'SEC',
  'Supplies & Hardware':'SUP','Computers & Servers':'CMP','Tablets & Mobile':'TAB',
  'Apple & Streaming':'APL','Services & Misc':'SVC','Uncategorized':'UNC',
};

