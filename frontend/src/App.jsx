import { useEffect, useMemo, useState } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const SESSION_KEY = 'datacomInventoryUser';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'product-master', label: 'Product Master' },
  { id: 'stock-entry', label: 'Stock Entry' },
  { id: 'inventory-view', label: 'Inventory View' },
  { id: 'user-management', label: 'User Management' }
];

const ROLE_DEFAULT_PAGES = {
  admin: PAGES.map((page) => page.id),
  warehouse: ['dashboard', 'stock-entry', 'inventory-view'],
  sales: ['inventory-view']
};

const STOCK_STATUS_OPTIONS = [
  'Available',
  'Reserved',
  'Modify',
  'Sold',
  'Showroom Unit',
  'Warranty Replacement',
  'Returned Stock',
  'Damaged Stock'
];

const OPERATION_OPTIONS = ['Add Stock', 'Remove Stock', 'Adjustment'];
const POC_OPTIONS = ['June', 'Devi'];
const DEFAULT_PRODUCT_FORM = { part_number: '', description: '', category: '', status: 'Active' };
const DEFAULT_STOCK_FORM = {
  operation_type: '',
  stock_card_no: '',
  adjustment_reason: '',
  part_number: '',
  quantity: '',
  location: '',
  stock_status_type: '',
  shipment: '',
  poc_key_in: '',
  remark: ''
};

function normalizePartNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeStatus(value) {
  return value === 'Inactive' ? 'Inactive' : 'Active';
}

function normalizeSessionUser(user) {
  const role = String(user?.role || '').toLowerCase();
  const requestedPages = user?.allowedPages || user?.allowed_pages || [];
  const validPages = requestedPages.filter((page) => PAGES.some((item) => item.id === page));
  const allowedPages = validPages.length > 0 ? [...new Set(validPages)] : ROLE_DEFAULT_PAGES[role] || ['inventory-view'];
  if (!user?.username || !role) return null;
  return { id: user.id, username: user.username, role, allowedPages };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  rows.push(row);
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Alert({ message }) {
  if (!message?.text) return null;
  return <div className={`alert app-alert alert-${message.type === 'error' ? 'danger' : 'primary'}`}>{message.text}</div>;
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', newPassword: '' });
  const [message, setMessage] = useState(null);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage(null);
    try {
      if (mode === 'forgot') {
        await api('/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ username: form.username.trim(), newPassword: form.newPassword })
        });
        setMessage({ type: 'success', text: 'Password reset successfully. You can log in now.' });
        setMode('login');
        return;
      }
      if (mode === 'signup') {
        await api('/signup', {
          method: 'POST',
          body: JSON.stringify({ username: form.username.trim(), password: form.password })
        });
        setMessage({ type: 'success', text: 'Account created successfully. You can log in now.' });
        setMode('login');
        return;
      }
      const user = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.username.trim(), password: form.password })
      });
      onLogin(user);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  const title = mode === 'forgot' ? 'Reset Password' : mode === 'signup' ? 'Create Account' : 'Datacom Inventory System';

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <img src="/icon.jpeg" alt="Datacom Logo" className="logo" />
          <div>
            <h1>{title}</h1>
            <p className="subtitle">Internal Inventory Transaction System</p>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <Alert message={message} />
          <div className="mb-3">
            <label className="form-label" htmlFor="loginUsername">Username</label>
            <input id="loginUsername" className="form-control" value={form.username} onChange={(event) => update('username', event.target.value)} required autoComplete="username" />
          </div>
          {mode === 'forgot' ? (
            <div className="mb-3">
              <label className="form-label" htmlFor="newPassword">New Password</label>
              <input id="newPassword" className="form-control" type="password" value={form.newPassword} onChange={(event) => update('newPassword', event.target.value)} required autoComplete="new-password" />
            </div>
          ) : (
            <div className="mb-3">
              <label className="form-label" htmlFor="loginPassword">Password</label>
              <input id="loginPassword" className="form-control" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
          )}
          <button className="btn btn-primary w-100" type="submit">
            {mode === 'forgot' ? 'Reset Password' : mode === 'signup' ? 'Sign Up' : 'Login'}
          </button>
          <div className="login-links">
            <button type="button" className="link-button" onClick={() => setMode(mode === 'forgot' ? 'login' : 'forgot')}>{mode === 'forgot' ? 'Back to Login' : 'Forgot Password?'}</button>
            <button type="button" className="link-button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Back to Login' : 'Sign Up'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}

function AppHeader({ currentUser, activePage, setActivePage, onLogout }) {
  const visiblePages = PAGES.filter((page) => currentUser.allowedPages.includes(page.id));
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <img src="/icon.jpeg" alt="Datacom Logo" className="logo" />
          <div>
            <h1>Datacom Inventory System</h1>
            <p className="subtitle">Internal Inventory Transaction System</p>
          </div>
        </div>
        <nav className="nav-shell" aria-label="Main navigation">
          {visiblePages.map((page) => (
            <button key={page.id} type="button" className={`nav-button ${activePage === page.id ? 'active' : ''}`} onClick={() => setActivePage(page.id)}>
              {page.label}
            </button>
          ))}
        </nav>
        <div className="user-area">
          <div className="user-chip">{currentUser.username} / {currentUser.role}</div>
          <button type="button" className="btn btn-soft" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}

function Dashboard({ products, movements }) {
  const lowStock = products.filter((product) => calculateQuantity(product.part_number, movements) <= 0).length;
  return (
    <Page title="Dashboard" subtitle="Quick overview for product records, stock movements, and sales-facing inventory.">
      <div className="dashboard-grid">
        <StatCard label="Product Masters" value={products.length} />
        <StatCard label="Stock Movements" value={movements.length} />
        <StatCard label="Total Quantity" value={products.reduce((total, product) => total + calculateQuantity(product.part_number, movements), 0)} />
        <StatCard label="Low / Zero Stock" value={lowStock} />
      </div>
    </Page>
  );
}

function Page({ title, subtitle, children }) {
  return (
    <section className="page-view">
      <div className="page-title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProductMaster({ products, movements, refreshProducts, refreshMovements }) {
  const [form, setForm] = useState(DEFAULT_PRODUCT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const categories = useMemo(() => [...new Set(products.map((item) => item.category).filter(Boolean))].sort(), [products]);
  const filtered = products.filter((product) => [product.part_number, product.description, product.category, product.status].join(' ').toLowerCase().includes(search.toLowerCase()));

  function startEdit(product) {
    setEditingId(product.id);
    setForm({
      part_number: product.part_number,
      description: product.description,
      category: product.category || '',
      status: normalizeStatus(product.status)
    });
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULT_PRODUCT_FORM);
  }

  async function submit(event) {
    event.preventDefault();
    try {
      const payload = { ...form, part_number: normalizePartNumber(form.part_number), category: form.category.trim(), description: form.description.trim() };
      const path = editingId ? `/products/${editingId}` : '/products';
      await api(path, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      await refreshProducts();
      resetForm();
      setMessage({ type: 'success', text: editingId ? 'Product master updated.' : 'Product master saved.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function remove(product) {
    if (!window.confirm(`Delete product ${product.part_number}?`)) return;
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' });
      await refreshProducts();
      setMessage({ type: 'success', text: 'Product deleted.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function importCsv(file) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    const headers = rows.shift()?.map((item) => item.trim().toLowerCase()) || [];
    const pn = headers.indexOf('part number');
    const desc = headers.indexOf('product description');
    const cat = headers.indexOf('category');
    const status = headers.indexOf('status');
    let saved = 0;
    for (const row of rows) {
      if (pn < 0 || desc < 0 || cat < 0) break;
      const payload = {
        part_number: normalizePartNumber(row[pn]),
        description: row[desc]?.trim(),
        category: row[cat]?.trim(),
        status: status >= 0 ? normalizeStatus(row[status]) : 'Active'
      };
      if (payload.part_number && payload.description && payload.category) {
        await api('/products', { method: 'POST', body: JSON.stringify(payload) });
        saved += 1;
      }
    }
    await refreshProducts();
    setMessage({ type: 'success', text: `Import complete. Saved ${saved} product records.` });
  }

  function exportCsv() {
    downloadCsv('datacom-product-master.csv', [
      ['Part Number', 'Product Description', 'Category', 'Status'],
      ...products.map((product) => [product.part_number, product.description, product.category, normalizeStatus(product.status)])
    ]);
  }

  return (
    <Page title="Product Master" subtitle="Create, edit, import, and export product master records.">
      <Panel title={editingId ? 'Edit Product Master' : 'Create Product Master'}>
        <form onSubmit={submit}>
          <div className="row g-3">
            <Field label="Part Number" value={form.part_number} onChange={(value) => setForm({ ...form, part_number: value })} required />
            <Field label="Product Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
            <div className="col-md-4">
              <label className="form-label">Category</label>
              <input className="form-control" list="category-options" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
              <datalist id="category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist>
            </div>
            <div className="col-md-4">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>
          <div className="actions">
            {editingId && <button className="btn btn-outline-secondary" type="button" onClick={resetForm}>Cancel</button>}
            <button className="btn btn-primary" type="submit">{editingId ? 'Save Changes' : 'Save Product Master'}</button>
          </div>
        </form>
        <Alert message={message} />
      </Panel>
      <Panel title="Existing Products" tools={<TableTools search={search} setSearch={setSearch} onImport={importCsv} onExport={exportCsv} />}>
        <div className="table-responsive">
          <table className="table app-table">
            <thead><tr><th>Part Number</th><th>Description</th><th>Category</th><th>Status</th><th>Qty</th><th className="text-end">Action</th></tr></thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td>{product.part_number}</td>
                  <td>{product.description}</td>
                  <td>{product.category || '-'}</td>
                  <td><span className={`status-badge ${normalizeStatus(product.status).toLowerCase()}`}>{normalizeStatus(product.status)}</span></td>
                  <td className="qty">{calculateQuantity(product.part_number, movements)}</td>
                  <td className="action-cell">
                    <div className="action-buttons">
                      <button className="btn btn-sm btn-row" type="button" onClick={() => startEdit(product)}>Edit</button>
                      <button className="btn btn-sm btn-row-danger" type="button" onClick={() => remove(product)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <EmptyRow colSpan={6} text="No products found." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}

function StockEntry({ products, movements, refreshMovements, refreshProducts }) {
  const [form, setForm] = useState(DEFAULT_STOCK_FORM);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const selectedProduct = products.find((product) => product.part_number === normalizePartNumber(form.part_number));
  const filteredMovements = movements.filter((movement) => [movement.part_number, movement.stock_card_no, movement.operation_type, movement.stock_status_type, movement.remark].join(' ').toLowerCase().includes(search.toLowerCase()));

  async function submit(event) {
    event.preventDefault();
    try {
      if (!selectedProduct) throw new Error('Part number not found. Please create product master first.');
      const payload = {
        ...form,
        part_number: selectedProduct.part_number,
        quantity: Number(form.quantity) || 0,
        adjustment_reason: form.operation_type === 'Adjustment' ? form.adjustment_reason : null
      };
      await api('/stock-movements', { method: 'POST', body: JSON.stringify(payload) });
      setForm(DEFAULT_STOCK_FORM);
      await refreshMovements();
      await refreshProducts();
      setMessage({ type: 'success', text: 'Stock entry saved.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      await api(`/stock-movements/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          part_number: normalizePartNumber(editing.part_number),
          stock_status_type: editing.stock_status_type,
          remark: editing.remark
        })
      });
      setEditing(null);
      await refreshMovements();
      await refreshProducts();
      setMessage({ type: 'success', text: 'Stock movement updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function remove(movement) {
    if (!window.confirm('Delete this stock movement?')) return;
    await api(`/stock-movements/${movement.id}`, { method: 'DELETE' });
    await refreshMovements();
    await refreshProducts();
  }

  function exportCsv() {
    downloadCsv('datacom-stock-entry-history.csv', [
      ['Operation Type', 'Stock Card No.', 'Part Number', 'Quantity', 'Location', 'Stock Status Type', 'Shipment', 'POC Key In', 'Remark'],
      ...movements.map((movement) => [movement.operation_type, movement.stock_card_no, movement.part_number, movement.quantity, movement.location, movement.stock_status_type, movement.shipment, movement.poc_key_in, movement.remark])
    ]);
  }

  return (
    <Page title="Stock Entry" subtitle="Record stock movement transactions and manage stock history.">
      <Panel title="Create Stock Entry">
        <form onSubmit={submit}>
          <div className="row g-3">
            <SelectField label="Operation Type" value={form.operation_type} options={OPERATION_OPTIONS} onChange={(value) => setForm({ ...form, operation_type: value })} required />
            <Field label="Stock Card No." value={form.stock_card_no} onChange={(value) => setForm({ ...form, stock_card_no: value })} required={form.operation_type !== 'Adjustment'} />
            <Field label="Part Number" value={form.part_number} onChange={(value) => setForm({ ...form, part_number: normalizePartNumber(value) })} required />
            <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
            <Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} required />
            <SelectField label="Stock Status Type" value={form.stock_status_type} options={STOCK_STATUS_OPTIONS} onChange={(value) => setForm({ ...form, stock_status_type: value })} required />
            <Field label="Shipment" value={form.shipment} onChange={(value) => setForm({ ...form, shipment: value })} />
            <SelectField label="POC Key In" value={form.poc_key_in} options={POC_OPTIONS} onChange={(value) => setForm({ ...form, poc_key_in: value })} required />
            {form.operation_type === 'Adjustment' && <Field label="Adjustment Reason" value={form.adjustment_reason} onChange={(value) => setForm({ ...form, adjustment_reason: value })} required />}
            <div className="col-12">
              <label className="form-label">Remark</label>
              <textarea className="form-control" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} />
            </div>
          </div>
          {selectedProduct && (
            <div className="lookup-panel">
              <Lookup label="Description" value={selectedProduct.description} />
              <Lookup label="Category" value={selectedProduct.category || '-'} />
              <Lookup label="Current Qty" value={calculateQuantity(selectedProduct.part_number, movements)} />
            </div>
          )}
          <div className="actions"><button className="btn btn-primary" type="submit">Save Stock Entry</button></div>
        </form>
        <Alert message={message} />
      </Panel>
      <Panel title="Stock Entry History" tools={<TableTools search={search} setSearch={setSearch} onExport={exportCsv} />}>
        <div className="table-responsive">
          <table className="table app-table">
            <thead><tr><th>Date</th><th>Operation</th><th>Stock Card</th><th>Part Number</th><th>Qty</th><th>Status</th><th>POC</th><th>Remark</th><th className="text-end">Action</th></tr></thead>
            <tbody>
              {filteredMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.created_at)}</td><td>{movement.operation_type}</td><td>{movement.stock_card_no || '-'}</td><td>{movement.part_number}</td><td className="qty">{movement.quantity}</td><td>{movement.stock_status_type}</td><td>{movement.poc_key_in}</td><td>{movement.remark || '-'}</td>
                  <td className="action-cell">
                    <div className="action-buttons">
                      <button className="btn btn-sm btn-row" type="button" onClick={() => setEditing(movement)}>Edit</button>
                      <button className="btn btn-sm btn-row-danger" type="button" onClick={() => remove(movement)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMovements.length === 0 && <EmptyRow colSpan={9} text="No stock movements found." />}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <Modal title="Edit Stock Entry" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit}>
            <Field label="Part Number" value={editing.part_number} onChange={(value) => setEditing({ ...editing, part_number: value })} required />
            <SelectField label="Stock Status Type" value={editing.stock_status_type} options={STOCK_STATUS_OPTIONS} onChange={(value) => setEditing({ ...editing, stock_status_type: value })} required />
            <div className="col-12">
              <label className="form-label">Remark</label>
              <textarea className="form-control" value={editing.remark || ''} onChange={(event) => setEditing({ ...editing, remark: event.target.value })} />
            </div>
            <div className="actions"><button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" type="submit">Save Changes</button></div>
          </form>
        </Modal>
      )}
    </Page>
  );
}

function InventoryView({ products, movements, role }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showZero, setShowZero] = useState(false);
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  const rows = products
    .map((product) => ({ ...product, quantity: calculateQuantity(product.part_number, movements), statusText: inventoryStatus(product, movements) }))
    .filter((product) => category === 'all' || product.category === category)
    .filter((product) => showZero || product.quantity > 0 || role !== 'sales')
    .filter((product) => [product.part_number, product.description, product.category, product.statusText].join(' ').toLowerCase().includes(search.toLowerCase()));

  return (
    <Page title="Inventory View" subtitle="Read-only stock balance calculated from stock movements.">
      <Panel title="Inventory List" tools={<div className="inventory-tools"><input className="form-control" placeholder="Search inventory..." value={search} onChange={(event) => setSearch(event.target.value)} /><select className="form-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All Categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="form-check show-zero"><input className="form-check-input" type="checkbox" checked={showZero} onChange={(event) => setShowZero(event.target.checked)} /> Show zero</label></div>}>
        <div className="table-responsive">
          <table className="table app-table">
            <thead><tr><th>Part Number</th><th>Stock Card No.</th><th>Description</th><th>Category</th><th>Quantity</th><th>Status</th><th>POC</th><th>Remark</th></tr></thead>
            <tbody>
              {rows.map((product) => {
                const latest = [...movements].reverse().find((movement) => movement.part_number === product.part_number);
                return <tr key={product.id}><td>{product.part_number}</td><td>{latest?.stock_card_no || 'No card'}</td><td>{product.description}</td><td>{product.category || '-'}</td><td className="qty">{product.quantity}</td><td>{product.statusText}</td><td>{latest?.poc_key_in || '-'}</td><td>{latest?.remark || 'No remark'}</td></tr>;
              })}
              {rows.length === 0 && <EmptyRow colSpan={8} text="No inventory records found." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'admin', allowed_pages: ROLE_DEFAULT_PAGES.admin });
  const [editing, setEditing] = useState(null);

  async function loadUsers() {
    setUsers(await api('/users'));
  }

  useEffect(() => { loadUsers().catch((error) => setMessage({ type: 'error', text: error.message })); }, []);

  function setRole(role, target = 'form') {
    const update = (current) => ({ ...current, role, allowed_pages: current.allowed_pages?.length ? current.allowed_pages : ROLE_DEFAULT_PAGES[role] || ['inventory-view'] });
    if (target === 'editing') setEditing(update);
    else setForm(update);
  }

  function togglePage(pageId, target = 'form') {
    const update = (current) => {
      const pages = current.allowed_pages || [];
      return { ...current, allowed_pages: pages.includes(pageId) ? pages.filter((page) => page !== pageId) : [...pages, pageId] };
    };
    if (target === 'editing') setEditing(update);
    else setForm(update);
  }

  async function createUser(event) {
    event.preventDefault();
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ username: '', password: '', role: 'admin', allowed_pages: ROLE_DEFAULT_PAGES.admin });
      await loadUsers();
      setMessage({ type: 'success', text: 'User created successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  }

  async function updateUser(event) {
    event.preventDefault();
    await api(`/users/${editing.id}`, { method: 'PUT', body: JSON.stringify({ role: editing.role, allowed_pages: editing.allowed_pages }) });
    setEditing(null);
    await loadUsers();
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    await api(`/users/${user.id}`, { method: 'DELETE' });
    await loadUsers();
  }

  return (
    <Page title="User Management" subtitle="Create and manage user accounts for the inventory system.">
      <Panel title="Create New User">
        <form onSubmit={createUser}>
          <div className="row g-3">
            <Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} required />
            <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} required />
            <SelectField label="Role" value={form.role} options={['admin', 'warehouse', 'sales']} onChange={(value) => setRole(value)} required />
            <PageChecks selected={form.allowed_pages} onToggle={(page) => togglePage(page)} />
          </div>
          <div className="actions"><button className="btn btn-primary" type="submit">Create User</button></div>
        </form>
        <Alert message={message} />
      </Panel>
      <Panel title="Existing Users">
        <div className="table-responsive">
          <table className="table app-table">
            <thead><tr><th>Username</th><th>Role</th><th>Allowed Pages</th><th className="text-end">Action</th></tr></thead>
            <tbody>
              {users.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.role}</td><td>{(user.allowed_pages || []).join(', ')}</td><td className="action-cell"><div className="action-buttons"><button className="btn btn-sm btn-row" type="button" onClick={() => setEditing({ ...user, allowed_pages: user.allowed_pages || [] })}>Edit</button><button className="btn btn-sm btn-row-danger" type="button" onClick={() => deleteUser(user)}>Delete</button></div></td></tr>)}
              {users.length === 0 && <EmptyRow colSpan={4} text="No users found." />}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <Modal title="Edit User" onClose={() => setEditing(null)}>
          <form onSubmit={updateUser}>
            <Field label="Username" value={editing.username} onChange={() => {}} disabled />
            <SelectField label="Role" value={editing.role} options={['admin', 'warehouse', 'sales']} onChange={(value) => setRole(value, 'editing')} required />
            <PageChecks selected={editing.allowed_pages} onToggle={(page) => togglePage(page, 'editing')} />
            <div className="actions"><button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" type="submit">Save Changes</button></div>
          </form>
        </Modal>
      )}
    </Page>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, disabled = false }) {
  return (
    <div className="col-md-4">
      <label className="form-label">{label}</label>
      <input className="form-control" type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} onWheel={(event) => type === 'number' && event.currentTarget.blur()} />
    </div>
  );
}

function SelectField({ label, value, options, onChange, required = false }) {
  return (
    <div className="col-md-4">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value || ''} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">Select</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function PageChecks({ selected, onToggle }) {
  return (
    <div className="col-12">
      <label className="form-label">Allowed Pages</label>
      <div className="page-checks">
        {PAGES.map((page) => <label key={page.id} className="form-check"><input className="form-check-input" type="checkbox" checked={(selected || []).includes(page.id)} onChange={() => onToggle(page.id)} /> {page.label}</label>)}
      </div>
    </div>
  );
}

function Panel({ title, tools, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {tools && <div className="panel-tools">{tools}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function TableTools({ search, setSearch, onImport, onExport }) {
  return (
    <>
      <input className="form-control table-search" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
      {onImport && <label className="btn btn-light mb-0">Import CSV<input className="d-none" type="file" accept=".csv" onChange={(event) => onImport(event.target.files?.[0])} /></label>}
      {onExport && <button className="btn btn-light" type="button" onClick={onExport}>Export CSV</button>}
    </>
  );
}

function Lookup({ label, value }) {
  return <div className="lookup-item"><span>{label}</span><strong>{value}</strong></div>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop-custom" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title-row"><h2>{title}</h2><button className="btn-close" type="button" aria-label="Close" onClick={onClose} /></div>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return <tr><td colSpan={colSpan} className="empty-row">{text}</td></tr>;
}

function calculateQuantity(partNumber, movements) {
  return movements.filter((movement) => movement.part_number === partNumber).reduce((total, movement) => {
    const quantity = Number(movement.quantity) || 0;
    if (movement.operation_type === 'Add Stock') return total + quantity;
    if (movement.operation_type === 'Remove Stock') return total - quantity;
    if (movement.operation_type === 'Adjustment') return total + quantity;
    return total;
  }, 0);
}

function inventoryStatus(product, movements) {
  const quantity = calculateQuantity(product.part_number, movements);
  if (quantity <= 0) return 'Out of Stock';
  const latest = [...movements].reverse().find((movement) => movement.part_number === product.part_number);
  return latest?.stock_status_type || 'Available';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => normalizeSessionUser(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')));
  const [activePage, setActivePage] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadError, setLoadError] = useState(null);

  async function refreshProducts() {
    const roleQuery = currentUser?.role === 'sales' ? '?role=sales' : '';
    setProducts(await api(`/products${roleQuery}`));
  }

  async function refreshMovements() {
    setMovements(await api('/stock-movements'));
  }

  useEffect(() => {
    if (!currentUser) return;
    setActivePage(currentUser.allowedPages[0] || 'inventory-view');
    Promise.all([refreshProducts(), refreshMovements()]).catch((error) => setLoadError({ type: 'error', text: error.message }));
  }, [currentUser?.id]);

  function login(user) {
    const normalized = normalizeSessionUser(user);
    if (!normalized) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    setCurrentUser(normalized);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setProducts([]);
    setMovements([]);
  }

  if (!currentUser) return <LoginPage onLogin={login} />;

  return (
    <>
      <AppHeader currentUser={currentUser} activePage={activePage} setActivePage={setActivePage} onLogout={logout} />
      <main className="app-shell">
        <Alert message={loadError} />
        {activePage === 'dashboard' && <Dashboard products={products} movements={movements} />}
        {activePage === 'product-master' && <ProductMaster products={products} movements={movements} refreshProducts={refreshProducts} refreshMovements={refreshMovements} />}
        {activePage === 'stock-entry' && <StockEntry products={products} movements={movements} refreshMovements={refreshMovements} refreshProducts={refreshProducts} />}
        {activePage === 'inventory-view' && <InventoryView products={products} movements={movements} role={currentUser.role} />}
        {activePage === 'user-management' && <UserManagement />}
      </main>
    </>
  );
}
