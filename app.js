// Database Schema & LocalStorage setup
const DB_ACTIONS = {
    get: (key) => JSON.parse(localStorage.getItem(key)) || [],
    set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
    init: () => {
        if (!localStorage.getItem('categories')) {
            DB_ACTIONS.set('categories', [{ id: 1, name: 'Smartphones' }, { id: 2, name: 'Accessories' }]);
        }
        if (!localStorage.getItem('products')) DB_ACTIONS.set('products', []);
        if (!localStorage.getItem('customers')) DB_ACTIONS.set('customers', []);
        if (!localStorage.getItem('bills')) DB_ACTIONS.set('bills', []);
        if (!localStorage.getItem('expenses')) DB_ACTIONS.set('expenses', []);
        if (!localStorage.getItem('memos')) DB_ACTIONS.set('memos', []);
        if (!localStorage.getItem('platform_dealers')) DB_ACTIONS.set('platform_dealers', []);
    }
};

DB_ACTIONS.init();

// App State
let currentBillItems = [];

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check auth
    const loggedType = localStorage.getItem('isLoggedIn');
    if(loggedType === 'admin') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'none';
        if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'flex';
        renderSuperAdmin();
    } else if(loggedType === 'dealer' || loggedType === 'true') {
        document.getElementById('login-screen').style.display = 'none';
        if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        setupNavigation();
        loadDashboard();
        updateForms();
        populateMemoProducts();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
        if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'none';
    }
});

// Login Functions
function switchLoginTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => {
        t.classList.remove('active');
        t.style.background = 'transparent';
        t.style.color = 'var(--text-secondary)';
    });
    document.querySelectorAll('.login-form').forEach(f => {
        f.classList.remove('active');
        f.style.display = 'none';
    });
    
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`tab-${tab}`).style.background = '#eaf2ff';
    document.getElementById(`tab-${tab}`).style.color = 'var(--accent-blue)';
    
    const form = document.getElementById(`form-${tab === 'admin' ? 'admin-login' : 'dealer-signup'}`);
    form.classList.add('active');
    form.style.display = 'block';
}

function handleLogin(e) {
    e.preventDefault();
    const formId = e.target.id;
    
    if (formId === 'form-admin-login') {
        localStorage.setItem('isLoggedIn', 'admin');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('superadmin-app').style.display = 'flex';
        renderSuperAdmin();
    } else {
        // Save the new dealer to Super Admin DB
        const inputs = e.target.querySelectorAll('input');
        const dName = inputs[0].value;
        const phone = inputs[1].value;
        const shopName = inputs[2].value;
        
        const dealers = DB_ACTIONS.get('platform_dealers');
        dealers.push({ id: Date.now(), name: dName, phone, shopName, status: 'Active', date: new Date().toISOString() });
        DB_ACTIONS.set('platform_dealers', dealers);
        
        localStorage.setItem('isLoggedIn', 'dealer');
        document.getElementById('login-screen').style.display = 'none';
        if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        setupNavigation();
        loadDashboard();
        updateForms();
        populateMemoProducts();
    }
}

function handleLogout() {
    localStorage.setItem('isLoggedIn', 'false');
    document.getElementById('main-app').style.display = 'none';
    if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

function renderSuperAdmin() {
    const dealers = DB_ACTIONS.get('platform_dealers');
    const tbody = document.getElementById('sa-dealers-list');
    if(!tbody) return;
    
    document.getElementById('sa-total-dealers').innerText = dealers.length;
    
    tbody.innerHTML = '';
    if(dealers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No licensed dealers yet.</td></tr>';
        return;
    }
    
    dealers.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${new Date(d.date).toLocaleDateString()}</td>
                <td><strong>${d.shopName}</strong></td>
                <td>${d.phone}</td>
                <td><span style="color:#34c759; font-weight:600;"><i class="fa-solid fa-check-circle"></i> ${d.status}</span></td>
            </tr>
        `;
    });
}

// Navigation Handling
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            
            // Update Active Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Update Active Page
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(target).classList.add('active');
            
            // Update Title
            pageTitle.innerText = e.currentTarget.querySelector('span').innerText;
            
            // Render respective page
            if (target === 'dashboard') loadDashboard();
            if (target === 'inventory') renderInventory();
            if (target === 'categories') renderCategories();
            if (target === 'customers') renderCustomers();
            if (target === 'billing') initBilling();
            if (target === 'reports') renderReports();
            if (target === 'expenses') renderExpenses();
            if (target === 'dealer-memo') { populateMemoProducts(); renderMemos(); }
        });
    });
}

// Modals Handling
function openModal(id) {
    document.getElementById(id).classList.add('show');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// --- Categories Module ---
document.getElementById('add-category-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const cats = DB_ACTIONS.get('categories');
    cats.push({ id: Date.now(), name });
    DB_ACTIONS.set('categories', cats);
    document.getElementById('add-category-form').reset();
    closeModal('add-category-modal');
    renderCategories();
    updateForms();
});

function renderCategories() {
    const cats = DB_ACTIONS.get('categories');
    const list = document.getElementById('categories-list');
    list.innerHTML = '';
    cats.forEach(cat => {
        list.innerHTML += `
            <div class="category-card">
                <h3>${cat.name}</h3>
                <p style="color:#86868b; margin-top:8px; font-size:14px;">View Products</p>
            </div>
        `;
    });
}

// --- Inventory Module ---
document.getElementById('add-product-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const prod = {
        id: Date.now(),
        name: document.getElementById('prod-name').value,
        catId: document.getElementById('prod-category').value,
        stock: parseInt(document.getElementById('prod-stock').value),
        cp: parseFloat(document.getElementById('prod-cp').value),
        sp: parseFloat(document.getElementById('prod-sp').value),
    };
    const prods = DB_ACTIONS.get('products');
    prods.push(prod);
    DB_ACTIONS.set('products', prods);
    document.getElementById('add-product-form').reset();
    closeModal('add-product-modal');
    renderInventory();
});

function renderInventory() {
    const prods = DB_ACTIONS.get('products');
    const cats = DB_ACTIONS.get('categories');
    const tbody = document.getElementById('inventory-list');
    tbody.innerHTML = '';
    
    prods.forEach(p => {
        const cat = cats.find(c => c.id == p.catId)?.name || 'Unknown';
        const margin = (((p.sp - p.cp) / p.cp) * 100).toFixed(1);
        tbody.innerHTML += `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${cat}</td>
                <td><span style="background:${p.stock > 5 ? '#e8fdf2' : '#fef0f0'}; color:${p.stock > 5 ? '#00c853' : '#ff3b30'}; padding: 4px 8px; border-radius: 12px; font-weight:600;">${p.stock}</span></td>
                <td>₹${p.cp}</td>
                <td>₹${p.sp}</td>
                <td style="color:#0066cc;">${margin}%</td>
                <td>
                    <button class="btn secondary-btn" style="padding: 6px 12px;"><i class="fa-solid fa-edit"></i></button>
                </td>
            </tr>
        `;
    });
}

// --- Billing Module ---
function initBilling() {
    updateForms();
    currentBillItems = [];
    renderBillItems();
}

function updateForms() {
    // Populate Categories in Product Add Form
    const cats = DB_ACTIONS.get('categories');
    const catSelect = document.getElementById('prod-category');
    if (catSelect) {
        catSelect.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Populate Products in Billing
    const prods = DB_ACTIONS.get('products');
    const prodSelect = document.getElementById('bill-product-select');
    if (prodSelect) {
        prodSelect.innerHTML = '<option value="">-- Choose Product --</option>' + 
            prods.filter(p => p.stock > 0).map(p => `<option value="${p.id}">${p.name} - ₹${p.sp} (${p.stock} in stock)</option>`).join('');
    }
}

document.getElementById('btn-add-to-bill').addEventListener('click', () => {
    const prodId = document.getElementById('bill-product-select').value;
    const qty = parseInt(document.getElementById('bill-product-qty').value);
    
    if (!prodId || qty < 1) return alert("Select product and valid quantity");
    
    const product = DB_ACTIONS.get('products').find(p => p.id == prodId);
    if (product.stock < qty) return alert("Not enough stock!");
    
    const existingItem = currentBillItems.find(i => i.id == prodId);
    if (existingItem) {
        if(existingItem.qty + qty > product.stock) return alert("Not enough stock!");
        existingItem.qty += qty;
    } else {
        currentBillItems.push({
            ...product,
            qty
        });
    }
    
    renderBillItems();
});

function renderBillItems() {
    const tbody = document.getElementById('bill-items');
    tbody.innerHTML = '';
    
    let subtotal = 0;
    
    currentBillItems.forEach((item, index) => {
        const total = item.qty * item.sp;
        subtotal += total;
        tbody.innerHTML += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.qty}</td>
                <td>₹${item.sp}</td>
                <td>₹${total}</td>
                <td><button class="btn danger-btn" onclick="removeBillItem(${index})" style="padding: 6px 12px;"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    });
    
    document.getElementById('bill-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
    calculateTotal(subtotal);
}

function removeBillItem(index) {
    currentBillItems.splice(index, 1);
    renderBillItems();
}

document.getElementById('bill-discount').addEventListener('input', () => {
    const subtotalText = document.getElementById('bill-subtotal').innerText.replace('₹', '');
    calculateTotal(parseFloat(subtotalText) || 0);
});

function calculateTotal(subtotal) {
    const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
    const afterDiscount = subtotal - (subtotal * discount / 100);
    // Assuming prices are inclusive of GST for simplicity, or we can add GST.
    // Let's keep it simple: Grand Total is after discount
    document.getElementById('bill-total').innerText = `₹${afterDiscount.toFixed(2)}`;
}

document.getElementById('btn-generate-bill').addEventListener('click', () => {
    if (currentBillItems.length === 0) return alert("Add items to bill");
    
    const custName = document.getElementById('bill-customer-name').value;
    const custPhone = document.getElementById('bill-customer-phone').value;
    
    if(!custName) return alert("Customer name is required");
    
    const subtotal = parseFloat(document.getElementById('bill-subtotal').innerText.replace('₹', ''));
    const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
    const total = parseFloat(document.getElementById('bill-total').innerText.replace('₹', ''));
    
    // Calculate Profit
    let totalCost = 0;
    currentBillItems.forEach(i => {
        totalCost += (i.cp * i.qty);
    });
    const profit = total - totalCost;

    const newBill = {
        id: "INV" + Date.now().toString().slice(-6),
        date: new Date().toISOString(),
        customer: custName,
        phone: custPhone,
        items: [...currentBillItems],
        total,
        profit
    };

    // Save Bill
    const bills = DB_ACTIONS.get('bills');
    bills.push(newBill);
    DB_ACTIONS.set('bills', bills);
    
    // Update Stock
    const prods = DB_ACTIONS.get('products');
    currentBillItems.forEach(item => {
        const pIndex = prods.findIndex(p => p.id == item.id);
        prods[pIndex].stock -= item.qty;
    });
    DB_ACTIONS.set('products', prods);
    
    // Update Customers
    const customers = DB_ACTIONS.get('customers');
    let custInfo = customers.find(c => c.phone === custPhone);
    if(custInfo) {
        custInfo.totalPurchases += total;
        custInfo.lastVisit = newBill.date;
    } else {
        customers.push({
            name: custName,
            phone: custPhone,
            totalPurchases: total,
            lastVisit: newBill.date
        });
    }
    DB_ACTIONS.set('customers', customers);
    
    alert(`Invoice ${newBill.id} generated successfully!`);
    
    // Reset Bill
    currentBillItems = [];
    document.getElementById('bill-customer-name').value = '';
    document.getElementById('bill-customer-phone').value = '';
    document.getElementById('bill-discount').value = '0';
    initBilling();
});

// --- Dashboard & Reports ---
function loadDashboard() {
    const bills = DB_ACTIONS.get('bills');
    const today = new Date().toISOString().split('T')[0];
    
    const todayBills = bills.filter(b => b.date.startsWith(today));
    
    const sales = todayBills.reduce((acc, b) => acc + b.total, 0);
    const profit = todayBills.reduce((acc, b) => acc + b.profit, 0);
    const itemsSold = todayBills.reduce((acc, b) => acc + b.items.reduce((s, i) => s + i.qty, 0), 0);
    
    document.getElementById('dash-today-sales').innerText = `₹${sales.toFixed(2)}`;
    document.getElementById('dash-today-profit').innerText = `₹${profit.toFixed(2)}`;
    document.getElementById('dash-items-sold').innerText = itemsSold;
    
    // Recent Tx
    const txTbody = document.getElementById('dash-recent-tx');
    txTbody.innerHTML = '';
    if(bills.length === 0) {
        txTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No transactions yet</td></tr>';
    } else {
        bills.slice(-5).reverse().forEach(b => {
            txTbody.innerHTML += `
                <tr>
                    <td><strong>${b.id}</strong></td>
                    <td>${b.customer}</td>
                    <td>₹${b.total.toFixed(2)}</td>
                    <td><span style="color:#34c759; font-weight:600;"><i class="fa-solid fa-check-circle"></i> Paid</span></td>
                </tr>
            `;
        });
    }
}

function renderCustomers() {
    const customers = DB_ACTIONS.get('customers');
    const tbody = document.getElementById('customers-list');
    tbody.innerHTML = '';
    customers.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone}</td>
                <td>₹${c.totalPurchases.toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderReports() {
    const bills = DB_ACTIONS.get('bills');
    
    let totalRev = 0;
    let totalProf = 0;
    let totalItems = 0;
    
    const tbody = document.getElementById('sales-log');
    tbody.innerHTML = '';
    
    bills.slice().reverse().forEach(b => {
        totalRev += b.total;
        totalProf += b.profit;
        const itms = b.items.reduce((s,i) => s + i.qty, 0);
        totalItems += itms;
        
        tbody.innerHTML += `
            <tr>
                <td>${new Date(b.date).toLocaleDateString()}</td>
                <td><strong>${b.id}</strong></td>
                <td>${itms}</td>
                <td>₹${b.total.toFixed(2)}</td>
                <td style="color:#00c853;"><strong>₹${b.profit.toFixed(2)}</strong></td>
            </tr>
        `;
    });
    
    document.getElementById('report-revenue').innerText = `₹${totalRev.toFixed(2)}`;
    document.getElementById('report-cogs').innerText = `₹${(totalRev - totalProf).toFixed(2)}`;
    document.getElementById('report-net-profit').innerText = `₹${totalProf.toFixed(2)}`;
}

// --- Expenses Module ---
document.getElementById('add-expense-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const exp = {
        id: Date.now(),
        date: new Date().toISOString(),
        category: document.getElementById('exp-category').value,
        desc: document.getElementById('exp-desc').value,
        amount: parseFloat(document.getElementById('exp-amount').value)
    };
    
    const expenses = DB_ACTIONS.get('expenses');
    expenses.push(exp);
    DB_ACTIONS.set('expenses', expenses);
    
    document.getElementById('add-expense-form').reset();
    closeModal('add-expense-modal');
    renderExpenses();
});

function renderExpenses() {
    const expenses = DB_ACTIONS.get('expenses');
    const tbody = document.getElementById('expenses-list');
    tbody.innerHTML = '';
    
    let totalExp = 0;
    
    expenses.slice().reverse().forEach(exp => {
        totalExp += exp.amount;
        tbody.innerHTML += `
            <tr>
                <td>${new Date(exp.date).toLocaleDateString()}</td>
                <td><strong style="color:var(--text-primary);">${exp.category}</strong></td>
                <td style="color:#e53935; font-weight:600;">₹${exp.amount.toFixed(2)}</td>
                <td>${exp.desc || '-'}</td>
            </tr>
        `;
    });
    
    document.getElementById('exp-total').innerText = `₹${totalExp.toFixed(2)}`;
}

// --- Dealer Memo Module ---
function populateMemoProducts() {
    const prods = DB_ACTIONS.get('products');
    const prodSelect = document.getElementById('memo-product');
    if (prodSelect) {
        prodSelect.innerHTML = prods.filter(p => p.stock > 0).map(p => `<option value="${p.id}">${p.name} (${p.stock} stk)</option>`).join('');
    }
}

document.getElementById('add-memo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const prodId = document.getElementById('memo-product').value;
    const qty = parseInt(document.getElementById('memo-qty').value);
    
    const products = DB_ACTIONS.get('products');
    const prodIndex = products.findIndex(p => p.id == prodId);
    
    if(products[prodIndex].stock < qty) return alert("Not enough stock!");
    
    const memo = {
        id: Date.now(),
        date: new Date().toISOString(),
        dealer: document.getElementById('memo-dealer').value,
        prodId: prodId,
        prodName: products[prodIndex].name,
        qty: qty,
        status: document.getElementById('memo-status').value // Pending, Sold, Returned
    };
    
    // Deduct stock immediately when given to dealer
    products[prodIndex].stock -= qty;
    DB_ACTIONS.set('products', products);
    
    const memos = DB_ACTIONS.get('memos');
    memos.push(memo);
    DB_ACTIONS.set('memos', memos);
    
    document.getElementById('add-memo-form').reset();
    closeModal('add-memo-modal');
    renderMemos();
});

function renderMemos() {
    const memos = DB_ACTIONS.get('memos');
    const tbody = document.getElementById('memo-list');
    tbody.innerHTML = '';
    
    memos.slice().reverse().forEach(m => {
        let statusColor = '#ff9800'; // Pending
        if(m.status === 'Sold') statusColor = '#00c853';
        if(m.status === 'Returned') statusColor = '#0b57d0';
        
        tbody.innerHTML += `
            <tr>
                <td>${new Date(m.date).toLocaleDateString()}</td>
                <td><strong>${m.dealer}</strong></td>
                <td>${m.prodName} (x${m.qty})</td>
                <td><span style="color:${statusColor}; font-weight:600;">${m.status}</span></td>
                <td>
                    <button class="btn secondary-btn" style="padding: 4px 8px; font-size:12px;" onclick="openStatusModal(${m.id})">Edit</button>
                </td>
            </tr>
        `;
    });
}

function openStatusModal(id) {
    document.getElementById('update-memo-id').value = id;
    const memos = DB_ACTIONS.get('memos');
    const memo = memos.find(m => m.id == id);
    document.getElementById('update-memo-status').value = memo.status;
    openModal('status-memo-modal');
}

function saveMemoStatus() {
    const id = document.getElementById('update-memo-id').value;
    const newStatus = document.getElementById('update-memo-status').value;
    
    const memos = DB_ACTIONS.get('memos');
    const mIndex = memos.findIndex(m => m.id == id);
    const oldStatus = memos[mIndex].status;
    
    memos[mIndex].status = newStatus;
    DB_ACTIONS.set('memos', memos);
    
    // If returned, add stock back
    if(newStatus === 'Returned' && oldStatus !== 'Returned') {
        const prods = DB_ACTIONS.get('products');
        const pIndex = prods.findIndex(p => p.id == memos[mIndex].prodId);
        if(pIndex > -1) {
            prods[pIndex].stock += memos[mIndex].qty;
            DB_ACTIONS.set('products', prods);
        }
    }
    // Note: If changed from Returned to Sold/Pending, should deduct again, but keeping it simple for now.

    closeModal('status-memo-modal');
    renderMemos();
}
