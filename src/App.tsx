import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { InvoicePDFDocument } from './components/InvoicePDFDocument';
import type { 
  CompanyProfile, 
  ClientProfile, 
  InvoiceLedgerRow, 
  InvoiceItem 
} from './components/InvoicePDFDocument';
import { PDFViewer } from '@react-pdf/renderer';

// ==========================================
// SEED MOCK DATA FOR ORGANIZATIONS & TENANTS
// ==========================================
interface OrgProfile extends CompanyProfile {
  id: string;
}

const MOCK_ORGS: OrgProfile[] = [
  { id: 'org1', businessName: 'Apex Operational Systems LLC', email: 'finance@apex-ops.io', routingNumber: '121000248', accountNumber: '998877665544' },
  { id: 'org2', businessName: 'Sovereign Ventures Group', email: 'admin@sovereign-ventures.com', routingNumber: '021000021', accountNumber: '112233445566' }
];

const MOCK_CLIENTS: Record<string, ClientProfile[]> = {
  'org1': [
    { name: 'Quantum Core Technologies', email: 'billing@quantum-core.com', address: '100 Research Way, Suite B, Austin, TX 78701' },
    { name: 'Helix BioLabs Inc', email: 'accountspayable@helixbio.com', address: '450 Innovation Blvd, Cambridge, MA 02139' }
  ],
  'org2': [
    { name: 'Global Logistics Hub', email: 'invoices@globallogistics.net', address: '99 Freeways Way, Dallas, TX 75201' },
    { name: 'Nova Software Solutions', email: 'billing@novasoft.io', address: '10 Tech Plaza, San Francisco, CA 94103' }
  ]
};

const MOCK_QUOTES: Record<string, any[]> = {
  'org1': [
    { id: 'q1', quote_number: 'QT-2026-001', client_name: 'Quantum Core Technologies', status: 'converted', tax_rate_basis_points: 825, created_at: '2026-05-10T12:00:00Z', subtotal_cents: 1250000, tax_cents: 103125, grand_total_cents: 1353125 },
    { id: 'q2', quote_number: 'QT-2026-002', client_name: 'Helix BioLabs Inc', status: 'sent', tax_rate_basis_points: 625, created_at: '2026-06-01T09:30:00Z', subtotal_cents: 480000, tax_cents: 30000, grand_total_cents: 510000 }
  ],
  'org2': [
    { id: 'q3', quote_number: 'QT-2026-003', client_name: 'Global Logistics Hub', status: 'sent', tax_rate_basis_points: 0, created_at: '2026-06-05T14:00:00Z', subtotal_cents: 1540000, tax_cents: 0, grand_total_cents: 1540000 }
  ]
};

const MOCK_INVOICES: Record<string, any[]> = {
  'org1': [
    { id: 'inv1', invoice_number: 'INV-QT-2026-001', client_name: 'Quantum Core Technologies', client_email: 'billing@quantum-core.com', client_address: '100 Research Way, Suite B, Austin, TX 78701', status: 'paid', due_date: '2026-06-09T00:00:00Z', subtotal_cents: 1250000, tax_cents: 103125, grand_total_cents: 1353125 },
    { id: 'inv2', invoice_number: 'INV-2026-002', client_name: 'Helix BioLabs Inc', client_email: 'accountspayable@helixbio.com', client_address: '450 Innovation Blvd, Cambridge, MA 02139', status: 'sent', due_date: '2026-07-05T00:00:00Z', subtotal_cents: 840000, tax_cents: 52500, grand_total_cents: 892500 }
  ],
  'org2': [
    { id: 'inv3', invoice_number: 'INV-2026-003', client_name: 'Global Logistics Hub', client_email: 'invoices@globallogistics.net', client_address: '99 Freeways Way, Dallas, TX 75201', status: 'overdue', due_date: '2026-06-01T00:00:00Z', subtotal_cents: 650000, tax_cents: 0, grand_total_cents: 650000 }
  ]
};

const MOCK_EXPENSES: Record<string, any[]> = {
  'org1': [
    { id: 'e1', title: 'AWS Cloud Compute', category: 'software', amount_cents: 48900, expense_date: '2026-05-15T00:00:00Z', supplier_name: 'Amazon Web Services', status: 'approved' },
    { id: 'e2', title: 'Facility Rent', category: 'rent', amount_cents: 350000, expense_date: '2026-06-01T00:00:00Z', supplier_name: 'Prime Real Estate LLC', status: 'approved' }
  ],
  'org2': [
    { id: 'e3', title: 'Google Workspace SaaS', category: 'software', amount_cents: 12000, expense_date: '2026-06-01T00:00:00Z', supplier_name: 'Google LLC', status: 'approved' }
  ]
};

const MOCK_ITEMS: Record<string, InvoiceItem[]> = {
  'QT-2026-001': [
    { title: 'Custom Systems Architecture consulting', description: '45 hours at contract rate of $150.00/hr', total_cents: 675000 },
    { title: 'Raw Material Dev Board Prototypes', description: '5 experimental units with 15% markup', total_cents: 575000 }
  ],
  'QT-2026-002': [
    { title: 'Operational Pipeline Engineering', description: 'Flat-rate infrastructure deployment', total_cents: 480000 }
  ],
  'QT-2026-003': [
    { title: 'Logistics Software Audit', description: 'Audit of global transport systems', total_cents: 1540000 }
  ],
  'INV-QT-2026-001': [
    { title: 'Custom Systems Architecture consulting', description: '45 hours at contract rate of $150.00/hr', total_cents: 675000 },
    { title: 'Raw Material Dev Board Prototypes', description: '5 experimental units with 15% markup', total_cents: 575000 }
  ],
  'INV-2026-002': [
    { title: 'Labor: BioLabs API integrations', description: '56 hours at $150.00/hr', total_cents: 840000 }
  ],
  'INV-2026-003': [
    { title: 'B2B Logistics operational audit', description: 'Flat-rate consulting assets', total_cents: 650000 }
  ]
};

const MOCK_BANK_ACCOUNTS: Record<string, any[]> = {
  'org1': [
    { id: 'ba1', name: 'SVB Operations Checking', mask: '2488', official_name: 'Silicon Valley Bank checking', balance_cents: 4500000, account_type: 'checking' },
    { id: 'ba2', name: 'Mercury Reserves Savings', mask: '9982', official_name: 'Mercury checking account', balance_cents: 18500000, account_type: 'savings' }
  ],
  'org2': [
    { id: 'ba3', name: 'Chase Business checking', mask: '1120', official_name: 'JP Morgan Chase checking', balance_cents: 12500000, account_type: 'checking' }
  ]
};

const MOCK_PENDING_TX: Record<string, any[]> = {
  'org1': [
    { id: 'pt1', date: '2026-06-10', merchant_name: 'AWS Cloud Hosting', amount_cents: 124500, suggested_category: 'software', details: 'Web Hosting Services' },
    { id: 'pt2', date: '2026-06-11', merchant_name: 'Prime Property Leasing', amount_cents: 350000, suggested_category: 'rent', details: 'Monthly Office Rent' },
    { id: 'pt3', date: '2026-06-12', merchant_name: 'Office Depot Stationery', amount_cents: 4589, suggested_category: 'other', details: 'Office Supplies' }
  ],
  'org2': [
    { id: 'pt4', date: '2026-06-12', merchant_name: 'GitHub Copilot Business', amount_cents: 3800, suggested_category: 'software', details: 'SaaS Developer Subscription' }
  ]
};

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'quotes' | 'invoices' | 'expenses' | 'settings'>('dashboard');
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Authentication & Tenancy States
  const [session, setSession] = useState<{ user: { email: string } } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Tenant switcher state
  const [activeOrg, setActiveOrg] = useState<OrgProfile>(MOCK_ORGS[0]);
  const [orgsList, setOrgsList] = useState<OrgProfile[]>(MOCK_ORGS);

  // Core database tables states (loaded dynamically per activeOrg)
  const [clients, setClients] = useState<ClientProfile[]>(MOCK_CLIENTS['org1']);
  const [quotes, setQuotes] = useState<any[]>(MOCK_QUOTES['org1']);
  const [invoices, setInvoices] = useState<any[]>(MOCK_INVOICES['org1']);
  const [expenses, setExpenses] = useState<any[]>(MOCK_EXPENSES['org1']);
  const [itemsMap, setItemsMap] = useState<Record<string, InvoiceItem[]>>(MOCK_ITEMS);
  const [bankAccounts, setBankAccounts] = useState<any[]>(MOCK_BANK_ACCOUNTS['org1']);
  const [pendingTx, setPendingTx] = useState<any[]>(MOCK_PENDING_TX['org1']);

  // Plaid connection mock
  const [showPlaidModal, setShowPlaidModal] = useState(false);
  const [selectedBankName, setSelectedBankName] = useState('Chase Bank');

  // Command metrics totals
  const [metrics, setMetrics] = useState({
    totalSales: 1353125,
    outstanding: 892500,
    totalExpenses: 398900,
    netProfit: 954225
  });

  // Forms / Modal visible controllers
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedInvoicePDF, setSelectedInvoicePDF] = useState<string | null>(null);

  // Form details states
  const [newClient, setNewClient] = useState({ name: '', email: '', address: '' });
  const [newQuote, setNewQuote] = useState({ clientName: '', taxRateBasis: 0, title: '', desc: '', amount: 0 });
  const [newExpense, setNewExpense] = useState({ title: '', category: 'materials', amount: 0, supplier: '' });

  // PWA Offline network state listener
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync data whenever the active organization shifts
  useEffect(() => {
    const orgId = activeOrg.id;
    if (!isDbConnected) {
      // Load mock dataset for chosen organization
      setClients(MOCK_CLIENTS[orgId] || []);
      setQuotes(MOCK_QUOTES[orgId] || []);
      setInvoices(MOCK_INVOICES[orgId] || []);
      setExpenses(MOCK_EXPENSES[orgId] || []);
      setBankAccounts(MOCK_BANK_ACCOUNTS[orgId] || []);
      setPendingTx(MOCK_PENDING_TX[orgId] || []);
      recalculateMetrics(orgId);
    } else {
      fetchRealData(orgId);
    }
  }, [activeOrg]);

  // Check Supabase Connection
  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from('profiles').select('*').limit(1);
        if (!error) {
          setIsDbConnected(true);
          // Check for active auth session
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            setSession({ user: { email: sessionData.session.user.email || '' } });
            await fetchOrganizations();
          }
        }
      } catch {
        setIsDbConnected(false);
      }
    }
    checkConnection();
  }, []);

  const recalculateMetrics = (orgId: string) => {
    const invs = MOCK_INVOICES[orgId] || [];
    const exps = MOCK_EXPENSES[orgId] || [];

    const totalSales = invs.reduce((acc, curr) => curr.status === 'paid' ? acc + curr.grand_total_cents : acc, 0);
    const outstanding = invs.reduce((acc, curr) => (curr.status === 'sent' || curr.status === 'overdue') ? acc + curr.grand_total_cents : acc, 0);
    const totalExpenses = exps.reduce((acc, curr) => acc + curr.amount_cents, 0);
    const netProfit = totalSales - totalExpenses;

    setMetrics({ totalSales, outstanding, totalExpenses, netProfit });
  };

  const fetchOrganizations = async () => {
    const { data: orgs } = await supabase.from('organizations').select('*');
    if (orgs && orgs.length > 0) {
      const formattedOrgs: OrgProfile[] = orgs.map(o => ({
        id: o.id,
        businessName: o.name,
        email: o.billing_email,
        routingNumber: o.routing_number || '',
        accountNumber: o.account_number || ''
      }));
      setOrgsList(formattedOrgs);
      setActiveOrg(formattedOrgs[0]);
    }
  };

  const fetchRealData = async (orgId: string) => {
    // Fetch clients
    const { data: clientList } = await supabase.from('clients').select('*').eq('organization_id', orgId);
    if (clientList) setClients(clientList);

    // Fetch quotes view
    const { data: quoteList } = await supabase.from('quote_ledger').select('*').eq('user_id', orgId); // view holds org mappings
    if (quoteList) setQuotes(quoteList);

    // Fetch invoices view
    const { data: invoiceList } = await supabase.from('invoice_ledger').select('*');
    if (invoiceList) setInvoices(invoiceList.filter(i => i.organization_id === orgId));

    // Fetch expenses
    const { data: expenseList } = await supabase.from('expenses').select('*').eq('organization_id', orgId);
    if (expenseList) setExpenses(expenseList);

    // Fetch bank accounts
    const { data: bankAccs } = await supabase.from('bank_accounts').select('*').eq('organization_id', orgId);
    if (bankAccs) setBankAccounts(bankAccs);

    // Fetch pending transactions
    const { data: pending } = await supabase.from('expenses').select('*').eq('organization_id', orgId).eq('status', 'pending_review');
    if (pending) setPendingTx(pending);
  };

  // ==========================================
  // AUTHENTICATION & LOGIN PROCESSORS
  // ==========================================
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;

    if (isDbConnected) {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) alert(error.message);
        else alert('Account verification email issued.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) alert(error.message);
        else {
          setSession({ user: { email: data.session?.user.email || authEmail } });
          await fetchOrganizations();
        }
      }
    } else {
      // Mock Login Bypass
      setSession({ user: { email: authEmail } });
    }
  };

  const handleLogout = async () => {
    if (isDbConnected) {
      await supabase.auth.signOut();
    }
    setSession(null);
  };

  // ==========================================
  // OPERATIONAL WORKFLOW ACTIONS
  // ==========================================
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return;

    if (isDbConnected) {
      await supabase.from('clients').insert({
        organization_id: activeOrg.id,
        name: newClient.name,
        email: newClient.email,
        address: newClient.address
      });
      await fetchRealData(activeOrg.id);
    } else {
      const updated = [...clients, { ...newClient }];
      setClients(updated);
      MOCK_CLIENTS[activeOrg.id] = updated;
    }
    setShowAddClient(false);
    setNewClient({ name: '', email: '', address: '' });
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuote.clientName || !newQuote.title || !newQuote.amount) return;

    const amountCents = Math.round(newQuote.amount * 100);
    const quoteNum = `QT-2026-0${quotes.length + 1}`;

    if (isDbConnected) {
      const { data: clData } = await supabase.from('clients').select('id').eq('name', newQuote.clientName).eq('organization_id', activeOrg.id).single();
      if (clData) {
        const { data: qData } = await supabase.from('quotes').insert({
          organization_id: activeOrg.id,
          client_id: clData.id,
          quote_number: quoteNum,
          tax_rate_basis_points: newQuote.taxRateBasis,
          status: 'draft'
        }).select('id').single();

        if (qData) {
          await supabase.from('quote_items').insert({
            quote_id: qData.id,
            item_type: 'flat_rate',
            title: newQuote.title,
            description: newQuote.desc || 'Operational service asset',
            total_cents: amountCents
          });
          await fetchRealData(activeOrg.id);
        }
      }
    } else {
      const subtotal = amountCents;
      const tax = Math.round((subtotal * newQuote.taxRateBasis) / 10000);
      const grandTotal = subtotal + tax;

      const qItem = {
        id: `q-${quotes.length + 1}`,
        quote_number: quoteNum,
        client_name: newQuote.clientName,
        status: 'draft',
        tax_rate_basis_points: newQuote.taxRateBasis,
        created_at: new Date().toISOString(),
        subtotal_cents: subtotal,
        tax_cents: tax,
        grand_total_cents: grandTotal
      };

      const updated = [qItem, ...quotes];
      setQuotes(updated);
      MOCK_QUOTES[activeOrg.id] = updated;

      setItemsMap({
        ...itemsMap,
        [quoteNum]: [{ title: newQuote.title, description: newQuote.desc, total_cents: amountCents }]
      });
    }
    setShowAddQuote(false);
    setNewQuote({ clientName: '', taxRateBasis: 0, title: '', desc: '', amount: 0 });
  };

  const handleConvertQuote = async (quoteId: string, quoteNumber: string) => {
    if (isDbConnected) {
      const { data, error } = await supabase.rpc('convert_quote_to_invoice', { target_quote_id: quoteId });
      if (!error) {
        await fetchRealData(activeOrg.id);
        alert(`Quote successfully converted to Invoice: ${data}`);
      } else {
        alert(error.message);
      }
    } else {
      const q = quotes.find(item => item.id === quoteId);
      if (q) {
        q.status = 'converted';
        setQuotes([...quotes]);

        const newInvoiceNum = `INV-${quoteNumber}`;
        const matchedClient = clients.find(c => c.name === q.client_name) || MOCK_CLIENTS[activeOrg.id][0];

        const newInv = {
          id: `inv-${invoices.length + 1}`,
          invoice_number: newInvoiceNum,
          client_name: q.client_name,
          client_email: matchedClient.email,
          client_address: matchedClient.address,
          status: 'sent',
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          subtotal_cents: q.subtotal_cents,
          tax_cents: q.tax_cents,
          grand_total_cents: q.grand_total_cents
        };

        const updatedInvoices = [newInv, ...invoices];
        setInvoices(updatedInvoices);
        MOCK_INVOICES[activeOrg.id] = updatedInvoices;

        setItemsMap({
          ...itemsMap,
          [newInvoiceNum]: itemsMap[quoteNumber] || []
        });

        recalculateMetrics(activeOrg.id);
        alert(`Converted to invoice ${newInvoiceNum} in offline ledger!`);
      }
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    if (isDbConnected) {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
      await fetchRealData(activeOrg.id);
    } else {
      const updated = invoices.map(inv => {
        if (inv.id === invoiceId) {
          return { ...inv, status: 'paid' };
        }
        return inv;
      });
      setInvoices(updated);
      MOCK_INVOICES[activeOrg.id] = updated;
      recalculateMetrics(activeOrg.id);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) return;

    const amountCents = Math.round(newExpense.amount * 100);

    if (isDbConnected) {
      await supabase.from('expenses').insert({
        organization_id: activeOrg.id,
        title: newExpense.title,
        category: newExpense.category,
        amount_cents: amountCents,
        expense_date: new Date().toISOString(),
        status: 'approved'
      });
      await fetchRealData(activeOrg.id);
    } else {
      const updated = [
        {
          id: `e-${expenses.length + 1}`,
          title: newExpense.title,
          category: newExpense.category,
          amount_cents: amountCents,
          expense_date: new Date().toISOString(),
          supplier_name: newExpense.supplier || 'General Supplier',
          status: 'approved'
        },
        ...expenses
      ];
      setExpenses(updated);
      MOCK_EXPENSES[activeOrg.id] = updated;
      recalculateMetrics(activeOrg.id);
    }
    setShowAddExpense(false);
    setNewExpense({ title: '', category: 'materials', amount: 0, supplier: '' });
  };

  // ==========================================
  // AI EXPENSE AUTO-CATEGORIZATION CONFIRMATION
  // ==========================================
  const handleApproveAICategory = async (txId: string, category: string) => {
    const txItem = pendingTx.find(t => t.id === txId);
    if (!txItem) return;

    if (isDbConnected) {
      // In Supabase, mapping creates the categorized expense and updates status
      await supabase.from('expenses').update({ status: 'approved', category }).eq('id', txId);
      await fetchRealData(activeOrg.id);
    } else {
      // Local Mock
      // 1. Move to active approved expenses
      const approvedExp = {
        id: `e-${expenses.length + 1}`,
        title: txItem.merchant_name,
        category: category,
        amount_cents: txItem.amount_cents,
        expense_date: new Date(txItem.date).toISOString(),
        supplier_name: txItem.merchant_name,
        status: 'approved'
      };

      const updatedApproved = [approvedExp, ...expenses];
      setExpenses(updatedApproved);
      MOCK_EXPENSES[activeOrg.id] = updatedApproved;

      // 2. Remove from pending review queue
      const updatedPending = pendingTx.filter(t => t.id !== txId);
      setPendingTx(updatedPending);
      MOCK_PENDING_TX[activeOrg.id] = updatedPending;

      recalculateMetrics(activeOrg.id);
    }
  };

  // ==========================================
  // PLAID LINK MOCK ENGINE
  // ==========================================
  const handleLinkBank = () => {
    if (isDbConnected) {
      // Production Plaid SDK initiation
      alert('Plaid Link initialized securely. Authenticating with Sandbox...');
    } else {
      setShowPlaidModal(true);
    }
  };

  const submitPlaidMockConnection = () => {
    const maskNum = Math.floor(1000 + Math.random() * 9000).toString();
    const newAccObj = {
      id: `ba-${bankAccounts.length + 1}`,
      name: `${selectedBankName} Checking`,
      mask: maskNum,
      official_name: `${selectedBankName} B2B checking account`,
      balance_cents: 25000000,
      account_type: 'checking'
    };

    const updatedAccs = [...bankAccounts, newAccObj];
    setBankAccounts(updatedAccs);
    MOCK_BANK_ACCOUNTS[activeOrg.id] = updatedAccs;

    setShowPlaidModal(false);
    alert(`Connected checking account ending in -${maskNum} via Plaid!`);
  };

  // Formats
  const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // ==========================================
  // UNATHENTICATED ROUTING
  // ==========================================
  if (!session) {
    return (
      <div className="auth-container">
        <div className="dashboard-grid-bg"></div>
        <div className="auth-card">
          <div className="auth-logo">
            <span className="brand-accent">Book</span>Keeper
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '30px' }}>
            Multi-Tenant Operational Ledger Portal
          </p>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input 
                type="email" 
                className="form-control" 
                placeholder="you@yourdomain.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
              {isSignUp ? 'Sign Up New Account' : 'Secure Login'}
            </button>

            <button 
              type="button" 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', textAlign: 'center', marginTop: '10px' }}
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already have an account? Login' : 'Need an organization account? Sign Up'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-grid-bg"></div>
      
      {/* PWA offline banner */}
      {isOffline && (
        <div className="offline-banner">
          ⚠️ Running in Offline Mode (Offline Cache Active). Creating records requires connection.
        </div>
      )}

      <div className="app-container">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-accent">Book</span>Keeper
          </div>

          {/* SaaS tenant switcher */}
          <div className="org-switcher">
            <label className="org-label">Active Entity</label>
            <select 
              className="org-select-control"
              value={activeOrg.id}
              onChange={(e) => {
                const selected = orgsList.find(o => o.id === e.target.value);
                if (selected) setActiveOrg(selected);
              }}
            >
              {orgsList.map(o => (
                <option key={o.id} value={o.id}>{o.businessName}</option>
              ))}
            </select>
          </div>

          <ul className="sidebar-menu">
            <li>
              <button 
                className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                Dashboard
              </button>
            </li>
            <li>
              <button 
                className={`menu-item ${activeTab === 'clients' ? 'active' : ''}`}
                onClick={() => setActiveTab('clients')}
              >
                Clients
              </button>
            </li>
            <li>
              <button 
                className={`menu-item ${activeTab === 'quotes' ? 'active' : ''}`}
                onClick={() => setActiveTab('quotes')}
              >
                Quotes Pipeline
              </button>
            </li>
            <li>
              <button 
                className={`menu-item ${activeTab === 'invoices' ? 'active' : ''}`}
                onClick={() => setActiveTab('invoices')}
              >
                Invoices Ledger
              </button>
            </li>
            <li>
              <button 
                className={`menu-item ${activeTab === 'expenses' ? 'active' : ''}`}
                onClick={() => setActiveTab('expenses')}
              >
                Expenses & Vendor
              </button>
            </li>
            <li>
              <button 
                className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                LLC Bank Settings
              </button>
            </li>
          </ul>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#4b5563' }}>
              Logged in: <strong style={{ color: 'var(--text-secondary)' }}>{session.user.email}</strong>
            </div>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </aside>

        {/* WORKSPACE */}
        <main className="workspace">
          
          <header className="workspace-header">
            <div>
              <h1 className="workspace-title">
                {activeTab === 'dashboard' && 'Command Dashboard'}
                {activeTab === 'clients' && 'Client Profiles'}
                {activeTab === 'quotes' && 'Sales estimates'}
                {activeTab === 'invoices' && 'Invoices & Receivables'}
                {activeTab === 'expenses' && 'Ledger & Bank Feed'}
                {activeTab === 'settings' && 'Banking rules'}
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {activeOrg.businessName} • Multi-Tenant LLC Operations
              </p>
            </div>
            
            <div className="flex gap-2">
              {activeTab === 'clients' && (
                <button className="btn btn-primary" onClick={() => setShowAddClient(true)}>+ Add Client</button>
              )}
              {activeTab === 'quotes' && (
                <button className="btn btn-primary" onClick={() => setShowAddQuote(true)}>+ New Quote</button>
              )}
              {activeTab === 'expenses' && (
                <div className="flex gap-2">
                  <button className="btn btn-secondary" onClick={handleLinkBank}>🔗 Link Bank Account</button>
                  <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>+ Log Expense</button>
                </div>
              )}
            </div>
          </header>

          {/* METRICS */}
          <section className="metrics-grid">
            <div className="metric-card">
              <div className="metric-title">Total Sales (Collected)</div>
              <div className="metric-value sales-color">{formatCurrency(metrics.totalSales)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Outstanding Receivables</div>
              <div className="metric-value receivable-color">{formatCurrency(metrics.outstanding)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Total Expenses</div>
              <div className="metric-value expense-color">{formatCurrency(metrics.totalExpenses)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Net Profit</div>
              <div className="metric-value profit-color">{formatCurrency(metrics.netProfit)}</div>
            </div>
          </section>

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* Linked Bank accounts overview */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '15px' }}>Linked Business Bank Feed</h3>
                <div className="plaid-grid">
                  {bankAccounts.map((ba, idx) => (
                    <div key={idx} className="bank-card">
                      <div className="bank-name">{ba.name}</div>
                      <div className="bank-type">{ba.official_name} - ending in {ba.mask}</div>
                      <div className="bank-balance sales-color">{formatCurrency(ba.balance_cents)}</div>
                    </div>
                  ))}
                  {bankAccounts.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No active bank integrations linked to this LLC. Link a bank via Plaid link.</div>
                  )}
                </div>
              </div>

              {/* Invoices list */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Active Invoices Overview</h2>
                </div>
                <div className="table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Client Name</th>
                        <th>Due Date</th>
                        <th>Grand Total</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv, index) => (
                        <tr key={index}>
                          <td className="mono">{inv.invoice_number}</td>
                          <td>{inv.client_name}</td>
                          <td>{formatDate(inv.due_date)}</td>
                          <td className="mono text-right">{formatCurrency(inv.grand_total_cents)}</td>
                          <td>
                            <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                          </td>
                          <td>
                            <div className="flex gap-2">
                              {inv.status !== 'paid' && (
                                <button 
                                  className="btn btn-success" 
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                  onClick={() => handleMarkAsPaid(inv.id)}
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={() => setSelectedInvoicePDF(inv.invoice_number)}
                              >
                                Preview PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CLIENTS */}
          {activeTab === 'clients' && (
            <div className="panel">
              <div className="table-wrapper">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Billing Email</th>
                      <th>Operational Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((cl, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{cl.name}</td>
                        <td>{cl.email}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{cl.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: QUOTES */}
          {activeTab === 'quotes' && (
            <div className="panel">
              <div className="table-wrapper">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Quote #</th>
                      <th>Client Name</th>
                      <th>Created Date</th>
                      <th>Subtotal</th>
                      <th>Tax</th>
                      <th>Total Estimate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q, i) => (
                      <tr key={i}>
                        <td className="mono">{q.quote_number}</td>
                        <td style={{ fontWeight: 500 }}>{q.client_name}</td>
                        <td>{formatDate(q.created_at)}</td>
                        <td className="mono text-right">{formatCurrency(q.subtotal_cents)}</td>
                        <td className="mono text-right">{formatCurrency(q.tax_cents)}</td>
                        <td className="mono text-right" style={{ fontWeight: 600 }}>{formatCurrency(q.grand_total_cents)}</td>
                        <td>
                          <span className={`badge badge-${q.status}`}>{q.status}</span>
                        </td>
                        <td>
                          {q.status === 'sent' && (
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '5px 10px', fontSize: '11px' }}
                              onClick={() => handleConvertQuote(q.id, q.quote_number)}
                            >
                              Convert to Invoice
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: INVOICES */}
          {activeTab === 'invoices' && (
            <div className="panel">
              <div className="table-wrapper">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Client Name</th>
                      <th>Due Date</th>
                      <th>Subtotal</th>
                      <th>Tax</th>
                      <th>Grand Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, i) => (
                      <tr key={i}>
                        <td className="mono">{inv.invoice_number}</td>
                        <td style={{ fontWeight: 500 }}>{inv.client_name}</td>
                        <td>{formatDate(inv.due_date)}</td>
                        <td className="mono text-right">{formatCurrency(inv.subtotal_cents)}</td>
                        <td className="mono text-right">{formatCurrency(inv.tax_cents)}</td>
                        <td className="mono text-right" style={{ fontWeight: 600 }}>{formatCurrency(inv.grand_total_cents)}</td>
                        <td>
                          <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            {inv.status !== 'paid' && (
                              <button 
                                className="btn btn-success" 
                                style={{ padding: '5px 10px', fontSize: '11px' }}
                                onClick={() => handleMarkAsPaid(inv.id)}
                              >
                                Mark Paid
                              </button>
                            )}
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '5px 10px', fontSize: '11px' }}
                              onClick={() => setSelectedInvoicePDF(inv.invoice_number)}
                            >
                              View Invoice PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: EXPENSES & BANK FEED */}
          {activeTab === 'expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* AI auto-categorization review queue */}
              {pendingTx.length > 0 && (
                <div className="panel review-panel">
                  <div className="panel-header" style={{ borderBottomColor: 'rgba(245, 158, 11, 0.15)' }}>
                    <h2 className="panel-title" style={{ color: 'var(--color-warning)' }}>
                      ⚡ AI Auto-Categorization Review Queue ({pendingTx.length})
                    </h2>
                  </div>
                  <div className="table-wrapper">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Payee / Description</th>
                          <th>Amount</th>
                          <th>Suggested Category</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTx.map((tx, idx) => (
                          <tr key={idx}>
                            <td className="mono">{tx.date}</td>
                            <td>
                              <strong>{tx.merchant_name}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tx.details}</div>
                            </td>
                            <td className="mono expense-color" style={{ fontWeight: 600 }}>{formatCurrency(tx.amount_cents)}</td>
                            <td>
                              <span className="badge badge-review">AI: {tx.suggested_category}</span>
                            </td>
                            <td>
                              <div className="flex gap-2">
                                <button 
                                  className="btn btn-success" 
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                  onClick={() => handleApproveAICategory(tx.id, tx.suggested_category)}
                                >
                                  Approve
                                </button>
                                <select 
                                  className="org-select-control"
                                  style={{ padding: '4px 6px', fontSize: '11px' }}
                                  value={tx.suggested_category}
                                  onChange={(e) => handleApproveAICategory(tx.id, e.target.value)}
                                >
                                  <option value="software">Software</option>
                                  <option value="rent">Rent</option>
                                  <option value="utilities">Utilities</option>
                                  <option value="materials">Materials</option>
                                  <option value="tax">Tax</option>
                                  <option value="travel">Travel</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Categorized Ledger */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Approved Expense Ledger</h2>
                </div>
                <div className="table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Transaction Description</th>
                        <th>Supplier / Merchant</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Expense Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.filter(e => e.status === 'approved').map((exp, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{exp.title}</td>
                          <td>{exp.supplier_name}</td>
                          <td>
                            <span style={{ textTransform: 'capitalize', fontSize: '12px' }}>{exp.category}</span>
                          </td>
                          <td className="mono text-right expense-color" style={{ fontWeight: 600 }}>{formatCurrency(exp.amount_cents)}</td>
                          <td>{formatDate(exp.expense_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Direct ACH Payment Configurations</h2>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); alert('Settings saved locally!'); }} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="form-group">
                  <label className="form-label">LLC Business Name (Beneficiary)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={activeOrg.businessName}
                    onChange={(e) => {
                      const updated = { ...activeOrg, businessName: e.target.value };
                      setActiveOrg(updated);
                      setOrgsList(orgsList.map(o => o.id === activeOrg.id ? updated : o));
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Notifications Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={activeOrg.email}
                    onChange={(e) => {
                      const updated = { ...activeOrg, email: e.target.value };
                      setActiveOrg(updated);
                      setOrgsList(orgsList.map(o => o.id === activeOrg.id ? updated : o));
                    }}
                  />
                </div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">Business Routing Number (9-digit ACH)</label>
                    <input 
                      type="text" 
                      className="form-control mono" 
                      value={activeOrg.routingNumber}
                      onChange={(e) => {
                        const updated = { ...activeOrg, routingNumber: e.target.value };
                        setActiveOrg(updated);
                        setOrgsList(orgsList.map(o => o.id === activeOrg.id ? updated : o));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Business Checking Account Number</label>
                    <input 
                      type="text" 
                      className="form-control mono" 
                      value={activeOrg.accountNumber}
                      onChange={(e) => {
                        const updated = { ...activeOrg, accountNumber: e.target.value };
                        setActiveOrg(updated);
                        setOrgsList(orgsList.map(o => o.id === activeOrg.id ? updated : o));
                      }}
                    />
                  </div>
                </div>
                <div>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '15px' }}>Save Banking Rules</button>
                </div>
              </form>
            </div>
          )}

        </main>
      </div>

      {/* ==========================================
      MODAL WINDOWS & PDF OVERLAYS
      ========================================== */}

      {/* MODAL: MOCK PLAID CONNECT LINK */}
      {showPlaidModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '400px', backgroundColor: '#0f172a', border: '1px solid var(--color-primary)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Link Bank via Plaid</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>Secure sandboxed B2B credential sync</p>
            </div>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Choose Financial Institution</label>
              <select 
                className="form-control"
                value={selectedBankName}
                onChange={(e) => setSelectedBankName(e.target.value)}
              >
                <option value="Chase Bank">JP Morgan Chase</option>
                <option value="Silicon Valley Bank">Silicon Valley Bank</option>
                <option value="Mercury Bank">Mercury Bank</option>
                <option value="Bank of America">Bank of America</option>
              </select>
            </div>

            <div className="flex gap-2" style={{ width: '100%' }}>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPlaidModal(false)}>Cancel Link</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submitPlaidMockConnection}>Connect Bank</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD CLIENT */}
      {showAddClient && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '450px' }}>
            <div className="panel-header">
              <h2 className="panel-title">Add Client Profile</h2>
            </div>
            <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newClient.name} 
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Billing Email Address</label>
                <input 
                  type="email" 
                  className="form-control" 
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Billing Address</label>
                <textarea 
                  className="form-control" 
                  rows={3} 
                  value={newClient.address}
                  onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                />
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddClient(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE ESTIMATE/QUOTE */}
      {showAddQuote && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '500px' }}>
            <div className="panel-header">
              <h2 className="panel-title">Initiate Sales Estimate (Quote)</h2>
            </div>
            <form onSubmit={handleCreateQuote} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label">Billing Client</label>
                <select 
                  className="form-control"
                  value={newQuote.clientName}
                  onChange={(e) => setNewQuote({ ...newQuote, clientName: e.target.value })}
                  required
                >
                  <option value="">Select a client...</option>
                  {clients.map((c, i) => (
                    <option key={i} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Tax Rate (Basis Points)</label>
                  <input 
                    type="number" 
                    className="form-control mono" 
                    placeholder="e.g. 8.25% is 825"
                    value={newQuote.taxRateBasis || ''}
                    onChange={(e) => setNewQuote({ ...newQuote, taxRateBasis: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Flat Rate Amount ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control mono" 
                    placeholder="0.00"
                    value={newQuote.amount || ''}
                    onChange={(e) => setNewQuote({ ...newQuote, amount: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Billing Line Item Title</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Systems Engineering Deliverables"
                  value={newQuote.title}
                  onChange={(e) => setNewQuote({ ...newQuote, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Line Item Description</label>
                <textarea 
                  className="form-control" 
                  rows={2}
                  placeholder="Describe scope, metrics, hours, or assets..."
                  value={newQuote.desc}
                  onChange={(e) => setNewQuote({ ...newQuote, desc: e.target.value })}
                />
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddQuote(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Publish Quote</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG EXPENSE */}
      {showAddExpense && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel" style={{ width: '450px' }}>
            <div className="panel-header">
              <h2 className="panel-title">Log Business Expense</h2>
            </div>
            <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label">Transaction Title</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Monthly cloud computing hosting"
                  value={newExpense.title}
                  onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select 
                    className="form-control"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  >
                    <option value="materials">Materials</option>
                    <option value="rent">Rent</option>
                    <option value="utilities">Utilities</option>
                    <option value="software">Software</option>
                    <option value="tax">Tax</option>
                    <option value="travel">Travel</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Expense Amount ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control mono" 
                    placeholder="0.00"
                    value={newExpense.amount || ''}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Supplier / Vendor Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Amazon Web Services"
                  value={newExpense.supplier}
                  onChange={(e) => setNewExpense({ ...newExpense, supplier: e.target.value })}
                />
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddExpense(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Log Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OVERLAY: FULLSCREEN PDF VIEWER */}
      {selectedInvoicePDF && (() => {
        const inv = invoices.find(item => item.invoice_number === selectedInvoicePDF);
        if (!inv) return null;

        const clientProf: ClientProfile = {
          name: inv.client_name,
          email: inv.client_email,
          address: inv.client_address
        };

        const ledgerRow: InvoiceLedgerRow = {
          invoice_number: inv.invoice_number,
          due_date: inv.due_date,
          subtotal_cents: inv.subtotal_cents,
          tax_cents: inv.tax_cents,
          grand_total_cents: inv.grand_total_cents
        };

        const pdfItems = itemsMap[selectedInvoicePDF] || [];

        return (
          <div className="pdf-viewer-overlay">
            <div className="pdf-viewer-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Invoice PDF Document Compiler</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                  Document: {selectedInvoicePDF} • Entity: {activeOrg.businessName}
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoicePDF(null)}>Close Viewer</button>
            </div>
            
            <div className="pdf-viewer-content">
              <PDFViewer style={{ width: '100%', height: '100%', border: 'none' }} showToolbar={true}>
                <InvoicePDFDocument 
                  profile={activeOrg}
                  client={clientProf}
                  invoice={ledgerRow}
                  items={pdfItems}
                />
              </PDFViewer>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export default App;
