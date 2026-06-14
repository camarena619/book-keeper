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
// SEED MOCK DATA FOR INSTANT OFFLINE RUNNING
// ==========================================
const MOCK_PROFILE: CompanyProfile = {
  businessName: 'Apex Operational Systems LLC',
  email: 'finance@apex-ops.io',
  routingNumber: '121000248',
  accountNumber: '998877665544'
};

const MOCK_CLIENTS: ClientProfile[] = [
  { name: 'Quantum Core Technologies', email: 'billing@quantum-core.com', address: '100 Research Way, Suite B, Austin, TX 78701' },
  { name: 'Helix BioLabs Inc', email: 'accountspayable@helixbio.com', address: '450 Innovation Blvd, Cambridge, MA 02139' },
  { name: 'Sovereign Logistics LLC', email: 'invoices@sovereign-log.net', address: '788 Interstate Hwy, Dallas, TX 75201' }
];

const MOCK_QUOTES = [
  { id: 'q1', quote_number: 'QT-2026-001', client_name: 'Quantum Core Technologies', status: 'converted', tax_rate_basis_points: 825, created_at: '2026-05-10T12:00:00Z', subtotal_cents: 1250000, tax_cents: 103125, grand_total_cents: 1353125 },
  { id: 'q2', quote_number: 'QT-2026-002', client_name: 'Helix BioLabs Inc', status: 'sent', tax_rate_basis_points: 625, created_at: '2026-06-01T09:30:00Z', subtotal_cents: 480000, tax_cents: 30000, grand_total_cents: 510000 },
  { id: 'q3', quote_number: 'QT-2026-003', client_name: 'Sovereign Logistics LLC', status: 'draft', tax_rate_basis_points: 0, created_at: '2026-06-12T15:45:00Z', subtotal_cents: 1850000, tax_cents: 0, grand_total_cents: 1850000 }
];

const MOCK_INVOICES: (InvoiceLedgerRow & { id: string; client_name: string; client_email: string; client_address: string; status: string })[] = [
  { id: 'inv1', invoice_number: 'INV-QT-2026-001', client_name: 'Quantum Core Technologies', client_email: 'billing@quantum-core.com', client_address: '100 Research Way, Suite B, Austin, TX 78701', status: 'paid', due_date: '2026-06-09T00:00:00Z', subtotal_cents: 1250000, tax_cents: 103125, grand_total_cents: 1353125 },
  { id: 'inv2', invoice_number: 'INV-2026-002', client_name: 'Helix BioLabs Inc', client_email: 'accountspayable@helixbio.com', client_address: '450 Innovation Blvd, Cambridge, MA 02139', status: 'sent', due_date: '2026-07-05T00:00:00Z', subtotal_cents: 840000, tax_cents: 52500, grand_total_cents: 892500 },
  { id: 'inv3', invoice_number: 'INV-2026-003', client_name: 'Sovereign Logistics LLC', client_email: 'invoices@sovereign-log.net', client_address: '788 Interstate Hwy, Dallas, TX 75201', status: 'overdue', due_date: '2026-06-01T00:00:00Z', subtotal_cents: 650000, tax_cents: 53625, grand_total_cents: 703625 }
];

const MOCK_EXPENSES = [
  { id: 'e1', title: 'AWS Cloud Compute', category: 'software', amount_cents: 48900, expense_date: '2026-05-15T00:00:00Z', supplier_name: 'Amazon Web Services' },
  { id: 'e2', title: 'Facility Rent', category: 'rent', amount_cents: 350000, expense_date: '2026-06-01T00:00:00Z', supplier_name: 'Prime Real Estate LLC' },
  { id: 'e3', title: 'Operational Dev Kits', category: 'materials', amount_cents: 124550, expense_date: '2026-06-05T00:00:00Z', supplier_name: 'DigiKey Components' }
];

const MOCK_ITEMS: Record<string, InvoiceItem[]> = {
  'QT-2026-001': [
    { title: 'Custom Systems Architecture consulting', description: '45 hours at contract rate of $150.00/hr', total_cents: 675000 },
    { title: 'Raw Material Dev Board Prototypes', description: '5 experimental units with 15% markup', total_cents: 575000 }
  ],
  'QT-2026-002': [
    { title: 'Operational Pipeline Engineering', description: 'Flat-rate infrastructure deployment', total_cents: 480000 }
  ],
  'QT-2026-003': [
    { title: 'Distributed Database Setup', description: 'Multi-region PostgreSQL configuration', total_cents: 1850000 }
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

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'quotes' | 'invoices' | 'expenses' | 'settings'>('dashboard');
  const [isDbConnected, setIsDbConnected] = useState(false);

  // Core database tables states
  const [profile, setProfile] = useState<CompanyProfile>(MOCK_PROFILE);
  const [clients, setClients] = useState<ClientProfile[]>(MOCK_CLIENTS);
  const [quotes, setQuotes] = useState<any[]>(MOCK_QUOTES);
  const [invoices, setInvoices] = useState<any[]>(MOCK_INVOICES);
  const [expenses, setExpenses] = useState<any[]>(MOCK_EXPENSES);
  const [itemsMap, setItemsMap] = useState<Record<string, InvoiceItem[]>>(MOCK_ITEMS);

  // Command metrics totals
  const [metrics, setMetrics] = useState({
    totalSales: 1353125, // $13,531.25 in cents
    outstanding: 1596125, // $15,961.25 in cents
    totalExpenses: 523450, // $5,234.50 in cents
    netProfit: 829675 // $8,296.75 in cents
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

  // Test connection to Supabase
  useEffect(() => {
    async function checkConnection() {
      try {
        const { data, error } = await supabase.from('profiles').select('*').limit(1);
        if (!error) {
          setIsDbConnected(true);
          // If profiles contains data, load it into state
          if (data && data.length > 0) {
            const prof = data[0];
            setProfile({
              businessName: prof.business_name,
              email: prof.email,
              routingNumber: prof.routing_number || '',
              accountNumber: prof.account_number || ''
            });
          }
          await fetchRealData();
        }
      } catch {
        setIsDbConnected(false);
      }
    }
    checkConnection();
  }, []);

  const fetchRealData = async () => {
    // 1. Fetch clients
    const { data: clientList } = await supabase.from('clients').select('*');
    if (clientList) setClients(clientList);

    // 2. Fetch quotes view
    const { data: quoteList } = await supabase.from('quote_ledger').select('*');
    if (quoteList) setQuotes(quoteList);

    // 3. Fetch invoices view
    const { data: invoiceList } = await supabase.from('invoice_ledger').select('*');
    if (invoiceList) setInvoices(invoiceList);

    // 4. Fetch expenses
    const { data: expenseList } = await supabase.from('expenses').select('*');
    if (expenseList) setExpenses(expenseList);

    // 5. Fetch operational metrics
    const { data: metricsList } = await supabase.from('operational_ledger').select('*');
    if (metricsList && metricsList.length > 0) {
      const met = metricsList[0];
      setMetrics({
        totalSales: met.total_sales_cents,
        outstanding: met.outstanding_receivables_cents,
        totalExpenses: met.total_expenses_cents,
        netProfit: met.net_profit_cents
      });
    }
  };

  // ==========================================
  // CLICK ACTIONS & CONVERSIONS
  // ==========================================

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return;

    if (isDbConnected) {
      const { data: sessionData } = await supabase.auth.getSession();
      const user_id = sessionData.session?.user.id;
      if (user_id) {
        await supabase.from('clients').insert({
          user_id,
          name: newClient.name,
          email: newClient.email,
          address: newClient.address
        });
        await fetchRealData();
      }
    } else {
      // Add local mock state
      const updatedClients = [...clients, { ...newClient }];
      setClients(updatedClients);
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
      const { data: sessionData } = await supabase.auth.getSession();
      const user_id = sessionData.session?.user.id;
      if (user_id) {
        // Fetch client id matching clientName
        const { data: clData } = await supabase.from('clients').select('id').eq('name', newQuote.clientName).single();
        if (clData) {
          const { data: qData } = await supabase.from('quotes').insert({
            user_id,
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
              description: newQuote.desc || 'Operational billing item',
              total_cents: amountCents
            });
            await fetchRealData();
          }
        }
      }
    } else {
      // Mock local update
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

      setQuotes([qItem, ...quotes]);
      setItemsMap({
        ...itemsMap,
        [quoteNum]: [{ title: newQuote.title, description: newQuote.desc, total_cents: amountCents }]
      });
    }
    setShowAddQuote(false);
    setNewQuote({ clientName: '', taxRateBasis: 0, title: '', desc: '', amount: 0 });
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) return;

    const amountCents = Math.round(newExpense.amount * 100);

    if (isDbConnected) {
      const { data: sessionData } = await supabase.auth.getSession();
      const user_id = sessionData.session?.user.id;
      if (user_id) {
        await supabase.from('expenses').insert({
          user_id,
          title: newExpense.title,
          category: newExpense.category,
          amount_cents: amountCents,
          expense_date: new Date().toISOString()
        });
        await fetchRealData();
      }
    } else {
      // Mock update
      const updatedExpenses = [
        {
          id: `e-${expenses.length + 1}`,
          title: newExpense.title,
          category: newExpense.category,
          amount_cents: amountCents,
          expense_date: new Date().toISOString(),
          supplier_name: newExpense.supplier || 'General Supplier'
        },
        ...expenses
      ];
      setExpenses(updatedExpenses);

      // Recalculate metrics
      const totalExp = metrics.totalExpenses + amountCents;
      setMetrics({
        ...metrics,
        totalExpenses: totalExp,
        netProfit: metrics.totalSales - totalExp
      });
    }
    setShowAddExpense(false);
    setNewExpense({ title: '', category: 'materials', amount: 0, supplier: '' });
  };

  const handleConvertQuote = async (quoteId: string, quoteNumber: string) => {
    if (isDbConnected) {
      const { data, error } = await supabase.rpc('convert_quote_to_invoice', { target_quote_id: quoteId });
      if (!error) {
        await fetchRealData();
        alert(`Quote converted to Invoice ID: ${data}`);
      } else {
        alert(`Error converting quote: ${error.message}`);
      }
    } else {
      // Mock conversion
      const q = quotes.find(item => item.id === quoteId);
      if (q) {
        q.status = 'converted';
        setQuotes([...quotes]);

        const newInvoiceNum = `INV-${quoteNumber}`;
        const matchedClient = clients.find(c => c.name === q.client_name) || MOCK_CLIENTS[0];

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

        setInvoices([newInv, ...invoices]);
        
        // Copy items map
        setItemsMap({
          ...itemsMap,
          [newInvoiceNum]: itemsMap[quoteNumber] || []
        });

        // Recalculate metrics
        const outstandingAmt = metrics.outstanding + q.grand_total_cents;
        setMetrics({
          ...metrics,
          outstanding: outstandingAmt
        });

        alert(`Quote successfully converted to invoice ${newInvoiceNum} locally!`);
      }
    }
  };

  const handleMarkAsPaid = async (invoiceId: string, amountCents: number) => {
    if (isDbConnected) {
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
      await fetchRealData();
    } else {
      // Mock update
      setInvoices(invoices.map(inv => {
        if (inv.id === invoiceId) {
          return { ...inv, status: 'paid' };
        }
        return inv;
      }));

      // Update metrics
      const newSales = metrics.totalSales + amountCents;
      const newOutstanding = Math.max(0, metrics.outstanding - amountCents);
      setMetrics({
        ...metrics,
        totalSales: newSales,
        outstanding: newOutstanding,
        netProfit: newSales - metrics.totalExpenses
      });
    }
  };

  // Formatting helpers
  const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      <div className="dashboard-grid-bg"></div>
      <div className="app-container">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-accent">Book</span>Keeper
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

          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#4b5563' }}>
            Database Mode: <span style={{ color: isDbConnected ? '#10b981' : '#f59e0b' }}>
              {isDbConnected ? 'Supabase Connected' : 'Offline / Demo'}
            </span>
          </div>
        </aside>

        {/* WORKSPACE CONTENT AREA */}
        <main className="workspace">
          
          <header className="workspace-header">
            <div>
              <h1 className="workspace-title">
                {activeTab === 'dashboard' && 'Operational Command Center'}
                {activeTab === 'clients' && 'Client Profiles'}
                {activeTab === 'quotes' && 'Sales Estimates & Quotes'}
                {activeTab === 'invoices' && 'Receivables & Invoices'}
                {activeTab === 'expenses' && 'Vendor & Expense Ledger'}
                {activeTab === 'settings' && 'Business Profile Configuration'}
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {profile.businessName} • LLC Ledger Management System
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
                <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>+ Log Expense</button>
              )}
            </div>
          </header>

          {/* 1. SCORECARD METRICS GRID */}
          <section className="metrics-grid">
            <div className="metric-card">
              <div className="metric-title">Total Sales (Collected)</div>
              <div className="metric-value sales-color">{formatCurrency(metrics.totalSales)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Receivables (Outstanding)</div>
              <div className="metric-value receivable-color">{formatCurrency(metrics.outstanding)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Total Expenses (Tax Deductible)</div>
              <div className="metric-value expense-color">{formatCurrency(metrics.totalExpenses)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-title">Net Profit (Operating Cash)</div>
              <div className="metric-value profit-color">{formatCurrency(metrics.netProfit)}</div>
            </div>
          </section>

          {/* 2. DYNAMIC WORKSPACE TABS */}

          {/* TAB: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="panel" style={{ marginBottom: '30px' }}>
              <div className="panel-header">
                <h2 className="panel-title">Recent Receivables & Action Checklist</h2>
              </div>
              <div className="table-wrapper">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Client Name</th>
                      <th>Due Date</th>
                      <th>Total Balance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 3).map((inv, index) => (
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
                                onClick={() => handleMarkAsPaid(inv.id, inv.grand_total_cents)}
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
          )}

          {/* TAB: CLIENTS LIST */}
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

          {/* TAB: QUOTES PIPELINE */}
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

          {/* TAB: INVOICES LEDGER */}
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
                                onClick={() => handleMarkAsPaid(inv.id, inv.grand_total_cents)}
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

          {/* TAB: EXPENSE LEDGER */}
          {activeTab === 'expenses' && (
            <div className="panel">
              <div className="table-wrapper">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Transaction Title</th>
                      <th>Supplier</th>
                      <th>Category</th>
                      <th>Deduction Amount</th>
                      <th>Expense Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp, i) => (
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
          )}

          {/* TAB: LLC SETTINGS */}
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
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Notifications Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group">
                    <label className="form-label">Business Routing Number (9-digit ACH)</label>
                    <input 
                      type="text" 
                      className="form-control mono" 
                      value={profile.routingNumber}
                      onChange={(e) => setProfile({ ...profile, routingNumber: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Business Checking Account Number</label>
                    <input 
                      type="text" 
                      className="form-control mono" 
                      value={profile.accountNumber}
                      onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
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
        // Find invoice record
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
                  Document: {selectedInvoicePDF} • Beneficiary: {profile.businessName}
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoicePDF(null)}>Close Viewer</button>
            </div>
            
            <div className="pdf-viewer-content">
              <PDFViewer style={{ width: '100%', height: '100%', border: 'none' }} showToolbar={true}>
                <InvoicePDFDocument 
                  profile={profile}
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
