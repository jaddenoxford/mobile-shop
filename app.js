// Database Schema & Supabase Setup
const supabaseUrl = 'https://qmuozgsapoivsvstqxzf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdW96Z3NhcG9pdnN2c3RxeHpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjQ0ODksImV4cCI6MjA5MTI0MDQ4OX0.a9k0_7F1wRNP5MSjtAdPF_W74d_C37b0U79sH9rV55M';
let supabaseClient = null;

try {
    // Detect supabase library safely
    const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (lib && supabaseKey.startsWith('eyJ')) {
        supabaseClient = lib.createClient(supabaseUrl, supabaseKey);
        console.log("Supabase Client initialized.");
        
        // Immediate Hash Check for OAuth Redirect
        if (window.location.hash.includes('access_token=')) {
            console.log("OAuth Redirect detected, waiting for session...");
        }
    } else {
        console.warn("Supabase library not found. Running offline mode.");
    }
} catch (e) {
    console.error("Supabase Init Error:", e);
}

const globalState = {
    categories: [],
    products: [],
    customers: [],
    bills: [],
    expenses: [],
    memos: [],
    platform_dealers: []
};

// App State
let currentBillItems = [];
let navItems = [];
let pages = [];
let pageTitleElement = null;

function updateStatus(text, color) {
    console.log(`Status: ${text}`);
    const pill = document.getElementById('connection-status-pill');
    const dot = pill?.querySelector('.status-dot');
    const statusText = document.getElementById('connection-status-text');
    
    if(statusText) statusText.innerText = text;
    if(dot) dot.style.background = color || '#86868b';
}

// Manual Token Handler (Fallback)
async function checkManualHash() {
    const hashStr = window.location.hash.replace(/^#/, '');
    if (!hashStr.includes('access_token=')) return;
    
    console.log("Manual extraction from hash:", hashStr.substring(0, 20) + "...");
    const params = new URLSearchParams(hashStr);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (access_token && refresh_token && supabaseClient) {
        try {
            updateStatus('Resolving Login...', '#007aff');
            const { data, error } = await supabaseClient.auth.setSession({
                access_token,
                refresh_token
            });
            if (error) throw error;
            if (data.session) console.log("Manual sync completed.");
        } catch (e) {
            console.error("Manual Auth Error:", e);
        }
    }
}

const DB_ACTIONS = {
    get: (key) => globalState[key] || [],
    
    set: async (key, data) => {
        const dealerId = localStorage.getItem('dealerId');
        globalState[key] = data;
        localStorage.setItem(key, JSON.stringify(data));
        
        if (!supabaseClient) return;
        try {
            // For categories, products, etc. ensure we include dealerId
            if (key !== 'platform_dealers') {
                const dataWithId = data.map(item => ({ 
                    ...item, 
                    dealerId: dealerId || 'system',
                    updatedAt: new Date().toISOString()
                }));
                // We attempt upsert but don't let it crash the app if columns are missing
                supabaseClient.from(key).upsert(dataWithId).then(({error}) => {
                    if(error) console.warn("Supabase Sync Error (likely missing dealerId column):", error);
                });
            } else {
                await supabaseClient.from(key).upsert(data);
            }
        } catch(e) {}
    },
    
    init: async () => {
        const dealerId = localStorage.getItem('dealerId');
        if (supabaseClient) {
            updateStatus('Syncing Cloud...', '#007aff');
            try {
                const tables = ['categories', 'products', 'customers', 'bills', 'expenses', 'memos', 'platform_dealers'];
                await Promise.all(tables.map(async (table) => {
                    let query = supabaseClient.from(table).select('*');
                    // Filter by dealerId if it's not the platform_dealers table
                    if (dealerId && table !== 'platform_dealers') {
                        query = query.eq('dealerId', dealerId);
                    }
                    const { data, error } = await query;
                    if(!error && data) globalState[table] = data;
                }));
                updateStatus('Cloud Sync Active', '#34c759');
            } catch(e) {
                updateStatus('Offline Mode', '#ff9500');
            }
        } else {
            updateStatus('Offline Mode', '#86868b');
            const tables = ['categories', 'products', 'customers', 'bills', 'expenses', 'memos', 'platform_dealers'];
            tables.forEach(t => {
                const local = localStorage.getItem(t);
                if (local) globalState[t] = JSON.parse(local);
            });

            // Add demo dealer only if no dealers exist
            if (globalState.platform_dealers.length === 0) {
                globalState.platform_dealers = [{ 
                    id: 'DLR_DEMO', 
                    username: 'mobile', 
                    pin: '123456', 
                    shopName: 'Mobile Hero Shop', 
                    status: 'Active', 
                    date: new Date().toISOString() 
                }];
                globalState.categories = [{ id: 1, name: 'Smartphones', dealerId: 'DLR_DEMO' }, { id: 2, name: 'Accessories', dealerId: 'DLR_DEMO' }];
            }
        }

        // --- FIX: Ensure Demo Dealer always exists in globalState ---
        const demoExists = globalState.platform_dealers.find(d => d.username === 'mobile');
        if (!demoExists) {
            globalState.platform_dealers.push({
                id: 'DLR_DEMO', 
                username: 'mobile', 
                pin: '123456', 
                shopName: 'Demo Mobile Shop', 
                status: 'Active', 
                date: new Date().toISOString()
            });
            // Add sample categories for demo
            if (globalState.categories.length === 0) {
                globalState.categories.push(
                    { id: 101, name: 'Smartphones', dealerId: 'DLR_DEMO' },
                    { id: 102, name: 'Accessories', dealerId: 'DLR_DEMO' }
                );
            }
        }
        
        // Refresh UI if logged in
        const type = localStorage.getItem('isLoggedIn');
        if(type === 'admin') {
            if(window.renderSuperAdmin) renderSuperAdmin();
        } else if(type === 'dealer') {
            if(window.loadDashboard) {
                loadDashboard();
                updateForms();
                populateMemoProducts();
                renderMemos();
            }
        }
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup UI References
    navItems = document.querySelectorAll('.nav-item');
    pages = document.querySelectorAll('.page');
    pageTitleElement = document.getElementById('page-title');

    // 2. Immediate UI Launch
    const loggedType = localStorage.getItem('isLoggedIn');
    const isReturningFromAuth = window.location.hash.includes('access_token=');

    if(loggedType === 'admin') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('superadmin-app').style.display = 'flex';
        renderSuperAdmin();
    } else if(loggedType === 'dealer' || loggedType === 'true') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        setupNavigation();
        loadDashboard();
        updateForms();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        if (isReturningFromAuth) {
            updateStatus('Authenticating...', '#007aff');
            document.querySelector('.login-wrapper').innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <i class="fas fa-circle-notch fa-spin" style="font-size: 40px; color: var(--accent-blue); margin-bottom: 20px;"></i>
                    <h2 style="font-weight: 700; color: var(--text-primary);">Verifying Account</h2>
                    <p style="color: var(--text-secondary); margin-top: 10px;">Completing your secure login...</p>
                </div>
            `;
        }
    }

    // 2.5 Init Global Settings & Themes
    initGlobalSettings();

    // 3. Robust Auth State Management
    if (supabaseClient) {
        // Run manual check first as fallback
        checkManualHash();

        // Immediate check for existing session
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) handleAuthSession(session, 'INITIAL');
        });

        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log("Supabase Auth Event:", event);
            if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
                handleAuthSession(session, event);
            }
        });
    }

    async function handleAuthSession(session, event) {
        if (!session) return;
        
        const user = session.user;
        const metadata = user.user_metadata || {};
        const isCurrentlyLoggedIn = localStorage.getItem('isLoggedIn') === 'dealer';
        const isDashboardVisible = document.getElementById('main-app').style.display === 'flex';

        // STOP THE LOOP: If already logged in and showing dashboard, don't reload
        if (isCurrentlyLoggedIn && isDashboardVisible && event !== 'SIGNED_OUT') {
            console.log("Session already active, skipping reload.");
            return;
        }
        
        console.log("Auth Session processing started for event:", event);
        
        // Mark as logged in immediately
        localStorage.setItem('isLoggedIn', 'dealer');
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('dealerId', user.id || 'DLR' + Date.now());

        // Update name in menu if available
        const menuShop = document.getElementById('menu-shop-name');
        const menuId = document.getElementById('menu-user-id');
        if(menuShop) menuShop.innerText = metadata.full_name || metadata.name || user.email.split('@')[0];
        if(menuId) menuId.innerText = "ID: " + (user.id ? user.id.slice(0,8).toUpperCase() : 'DEMO');
        
        // Remove hash from URL
        if (window.location.hash) {
            window.history.replaceState(null, null, window.location.pathname);
        }

        // Auto-register dealer
        try {
            const dealers = DB_ACTIONS.get('platform_dealers');
            const exists = dealers.find(d => d.email === user.email);
            
            if (!exists) {
                const newDealer = {
                    id: user.id || Date.now(),
                    name: metadata.full_name || metadata.name || user.email.split('@')[0],
                    email: user.email,
                    phone: user.phone || 'Google Auth',
                    shopName: metadata.full_name ? `${metadata.full_name}'s Shop` : 'New Business',
                    status: 'Active',
                    date: new Date().toISOString()
                };
                dealers.push(newDealer);
                await DB_ACTIONS.set('platform_dealers', dealers);
            }

            // Flag for auto-restore check if data is empty
            const products = DB_ACTIONS.get('products');
            if (products.length === 0) {
                localStorage.setItem('checkDriveBackup', 'true');
            }
        } catch (e) {
            console.error("Registration Error:", e);
        }

        // Final UI refresh ONLY if we were on the login screen
        if (document.getElementById('login-screen').style.display !== 'none') {
            setTimeout(() => {
                location.reload();
            }, 300);
        }
    }

    // 4. Database Initialization (Background)
    DB_ACTIONS.init().then(() => {
        // Auto-restore trigger
        if (localStorage.getItem('checkDriveBackup') === 'true' && localStorage.getItem('isLoggedIn') === 'dealer') {
            localStorage.removeItem('checkDriveBackup');
            setTimeout(() => {
                if (confirm("Welcome back! Would you like to restore your shop data from your Google Drive backup?")) {
                    restoreFromGoogleDrive();
                }
            }, 1000);
        }
    }).catch(err => {
        console.error("Init Background Fail", err);
        updateStatus('Database Error', '#ff3b30');
    });
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
    
    const formId = tab === 'admin' ? 'form-admin-login' : 'form-dealer-login';
    const form = document.getElementById(formId);
    if(form) {
        form.classList.add('active');
        form.style.display = 'block';
    }
}

async function handleDealerAction(e, type) {
    e.preventDefault();
    const dealers = DB_ACTIONS.get('platform_dealers');
    
    if (type === 'register') {
        const username = document.getElementById('reg-user').value.toLowerCase().trim();
        const pin = document.getElementById('reg-pin').value;
        const shop = document.getElementById('reg-shop').value;
        
        if (pin.length !== 6) return alert("PIN must be 6 digits");
        if (dealers.find(d => d.username === username)) return alert("Username already taken!");
        
        const newDealer = {
            id: 'DLR' + Date.now(),
            username,
            pin,
            shopName: shop,
            status: 'Active',
            date: new Date().toISOString()
        };
        
        dealers.push(newDealer);
        await DB_ACTIONS.set('platform_dealers', dealers);
        loginDealer(newDealer);
        closeModal('register-dealer-modal');
    } else {
        const user = document.getElementById('login-username').value.toLowerCase().trim();
        const pin = document.getElementById('login-pin').value;
        
        const found = dealers.find(d => d.username === user && d.pin === pin);
        if (!found) return alert("Invalid Username or PIN!");
        if (found.status === 'Blocked') return alert("Your account is blocked. Contact admin.");
        
        loginDealer(found);
    }
}

function loginDealer(dealer) {
    localStorage.setItem('isLoggedIn', 'dealer');
    localStorage.setItem('dealerId', dealer.id);
    localStorage.setItem('shopName', dealer.shopName);
    
    location.reload(); // Refresh to apply dealerId filtering
}

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('admin-user').value;
    const pass = document.getElementById('admin-pass').value;
    
    if (user === 'admin' && pass === '1234') {
        localStorage.setItem('isLoggedIn', 'admin');
        location.reload();
    } else {
        alert("Invalid Admin Credentials");
    }
}

// Backup Logic
function exportDataToJSON() {
    const data = {
        meta: { dealerId: localStorage.getItem('dealerId'), exportDate: new Date().toISOString() },
        categories: DB_ACTIONS.get('categories'),
        products: DB_ACTIONS.get('products'),
        customers: DB_ACTIONS.get('customers'),
        bills: DB_ACTIONS.get('bills'),
        expenses: DB_ACTIONS.get('expenses')
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MobiStore_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

// --- Google Drive Real Implementation ---
const DRIVE_FILE_NAME = 'MobiStore_Data_Backup.json';

async function getGoogleAccessToken() {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.provider_token || null;
}

async function openDriveBackup() {
    let token = await getGoogleAccessToken();
    console.log("Drive Sync: Attempting backup with token:", token ? "Exist (starts with " + token.substring(0,5) + "...) " : "Null");
    
    if (!token) {
        if(confirm("To backup to Google Drive, you should sign in with Google and grant 'drive.file' permission. Continue?")) {
            handleGoogleLogin();
        }
        return;
    }

    try {
        updateStatus('Syncing to Drive...', '#007aff');
        const data = {
            meta: { 
                dealerId: localStorage.getItem('dealerId'), 
                exportDate: new Date().toISOString(),
                shopName: localStorage.getItem('shopName')
            },
            categories: DB_ACTIONS.get('categories'),
            products: DB_ACTIONS.get('products'),
            customers: DB_ACTIONS.get('customers'),
            bills: DB_ACTIONS.get('bills'),
            expenses: DB_ACTIONS.get('expenses'),
            memos: DB_ACTIONS.get('memos')
        };

        // 1. Search for existing file
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}' and trashed=false&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchData = await searchRes.json();
        
        if (searchData.error) {
            console.error("Drive Search Error:", searchData.error);
            const code = searchData.error.code;
            if (code === 401 || code === 403) {
                alert("Session expired or permissions missing. Re-authenticating with Google...");
                handleGoogleLogin();
                return;
            }
            throw new Error(searchData.error.message);
        }

        const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;
        console.log("Drive Sync: Existing file ID found:", existingFileId);

        let res;
        if (existingFileId) {
            // Update existing
            res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            // Create new
            const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

            res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: form
            });
        }

        if (res.ok) {
            alert("✅ Shop data successfully backed up to your Google Drive!");
            updateStatus('Cloud Sync Active', '#34c759');
        } else {
            const errData = await res.json();
            console.error("Drive Save Error:", errData);
            if (errData.error?.code === 401) {
                alert("Session expired. Re-authenticating...");
                handleGoogleLogin();
                return;
            }
            throw new Error(errData.error?.message || "Failed to save to Drive");
        }
    } catch (e) {
        console.error("Drive Backup Exception:", e);
        alert("Drive Backup Failed: " + e.message + "\n\nPlease try again or re-login to refresh permissions.");
        updateStatus('Drive Failed', '#ff3b30');
    }
}

async function restoreFromGoogleDrive() {
    let token = await getGoogleAccessToken();
    if (!token) {
        alert("Please login with Google first to access your Drive.");
        handleGoogleLogin();
        return;
    }

    try {
        updateStatus('Restoring from Drive...', '#007aff');
        
        // 1. Search for file
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}' and trashed=false&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchData = await searchRes.json();
        
        if (searchData.error) {
            console.error("Drive Search Restore Error:", searchData.error);
            if (searchData.error.code === 401) { 
                 handleGoogleLogin(); 
                 return; 
            }
            throw new Error(searchData.error.message);
        }

        const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

        if (!existingFileId) {
            alert("No MobiStore backup file found on your Google Drive.");
            updateStatus('Cloud Sync Active', '#34c759');
            return;
        }


        // 2. Download content
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            const dateStr = data.meta?.exportDate ? new Date(data.meta.exportDate).toLocaleString() : 'Unknown Date';
            
            if (confirm(`Found backup for "${data.meta?.shopName || 'Unknown Shop'}" from ${dateStr}. \n\nThis will REPLACE your current local data. Continue?`)) {
                const tables = ['categories', 'products', 'customers', 'bills', 'expenses', 'memos'];
                for (const t of tables) {
                    if (data[t]) {
                        // Set in global state and localStorage
                        globalState[t] = data[t];
                        localStorage.setItem(t, JSON.stringify(data[t]));
                    }
                }
                alert("✅ Restoration Successful! The app will now reload.");
                location.reload();
            }
        } else {
            throw new Error("Failed to download backup file from Drive.");
        }
    } catch (e) {
        console.error("Drive Restore Error:", e);
        alert("Drive Restore Failed: " + e.message);
        updateStatus('Restore Failed', '#ff3b30');
    }
}

async function handleGoogleLogin() {
    if (!supabaseClient) return alert("System is offline. Google login not available.");
    
    try {
        updateStatus('Connecting Google...', '#007aff');
        const redirectUrl = window.location.origin.replace(/\/$/, "");
        
        // Use proper scopes property and select_account to avoid repetitive consent screens
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account'
                }
            }
        });
        
        if (error) throw error;
    } catch (e) {
        alert("Google Error: " + e.message);
        updateStatus('Google Failed', '#ff3b30');
    }
}

function handleForgotPassword() {
    openModal('modal-forgot-password');
}

async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    if (!email) return;
    
    if (!supabaseClient) return alert("System is offline. Reset not available.");

    try {
        const btn = e.target.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = "Sending...";
        btn.disabled = true;

        updateStatus('Sending Reset Link...', '#007aff');
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password',
        });
        
        if (error) throw error;
        
        alert("Success! Password reset link sent to " + email);
        closeModal('modal-forgot-password');
        updateStatus('Reset Email Sent', '#34c759');
    } catch (e) {
        alert("Error: " + e.message);
        updateStatus('Reset Failed', '#ff3b30');
    } finally {
        const btn = e.target.querySelector('button');
        btn.innerText = "Send Reset Link";
        btn.disabled = false;
    }
}

function handleLogout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('dealerId');
    localStorage.removeItem('shopName');
    
    // Clear global state to prevent data leaking to next login
    Object.keys(globalState).forEach(key => {
        if(Array.isArray(globalState[key])) globalState[key] = [];
    });

    document.getElementById('main-app').style.display = 'none';
    if(document.getElementById('superadmin-app')) document.getElementById('superadmin-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    location.reload(); // Hard refresh to ensure clean slate
}

function renderSuperAdmin() {
    const search = document.getElementById('sa-search-dealer')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('sa-filter-status')?.value || 'all';
    
    let dealers = DB_ACTIONS.get('platform_dealers');
    const tbody = document.getElementById('sa-dealers-list');
    if(!tbody) return;
    
    // Apply Filters
    dealers = dealers.filter(d => {
        const matchesSearch = d.shopName.toLowerCase().includes(search) || d.phone.includes(search) || d.name.toLowerCase().includes(search);
        const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    document.getElementById('sa-total-dealers').innerText = dealers.filter(d => d.status === 'Active').length;
    
    tbody.innerHTML = '';
    if(dealers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No dealers found matching criteria.</td></tr>';
        return;
    }
    
    dealers.forEach(d => {
        const isBlocked = d.status === 'Blocked';
        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:700;">${d.shopName}</div>
                    <div style="font-size:11px; color:#86868b;">${d.name} • ${new Date(d.date).toLocaleDateString()}</div>
                </td>
                <td>${d.phone}</td>
                <td>
                    <span style="color:${isBlocked ? '#ff3b30' : '#34c759'}; font-weight:600; font-size:12px;">
                        ${isBlocked ? '<i class="fa-solid fa-ban"></i> Blocked' : '<i class="fa-solid fa-check-circle"></i> Active'}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:4px;">
                        <button class="sa-action-btn ${isBlocked ? 'sa-btn-approve' : 'sa-btn-block'}" onclick="toggleDealerStatus(${d.id})">
                            ${isBlocked ? 'Approve' : 'Block'}
                        </button>
                        <button class="sa-action-btn" style="background:#f1f1f3;" onclick="deleteDealer(${d.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function switchAdminPage(pageId) {
    document.querySelectorAll('.sa-page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`sa-page-${pageId}`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

async function toggleDealerStatus(id) {
    const dealers = DB_ACTIONS.get('platform_dealers');
    const index = dealers.findIndex(d => d.id == id);
    if (index === -1) return;
    
    dealers[index].status = dealers[index].status === 'Active' ? 'Blocked' : 'Active';
    await DB_ACTIONS.set('platform_dealers', dealers);
    renderSuperAdmin();
}

async function deleteDealer(id) {
    if(!confirm("Are you sure you want to remove this dealer?")) return;
    const dealers = DB_ACTIONS.get('platform_dealers');
    const filtered = dealers.filter(d => d.id != id);
    await DB_ACTIONS.set('platform_dealers', filtered);
    renderSuperAdmin();
}

async function sendBroadcast() {
    const msg = document.getElementById('sa-broadcast-msg').value;
    if(!msg) return alert("Please enter a message");
    
    await DB_ACTIONS.set('system_announcement', { msg, date: new Date().toISOString() });
    alert("Broadcast sent successfully!");
    document.getElementById('sa-broadcast-msg').value = '';
}

function renderAnnouncement(msg) {
    const existing = document.getElementById('system-announcement-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'system-announcement-bar';
    bar.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, #fff 0%, #fff9e6 100%); border-left: 5px solid #ff9500; display:flex; align-items:center; gap:12px; margin-bottom:16px; padding:12px 16px;">
            <i class="fa-solid fa-bullhorn" style="color:#ff9500; font-size:18px;"></i>
            <div style="flex:1; font-size:13px; font-weight:600; color:#444;">${msg}</div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent; border:none; color:#999; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
        </div>
    `;
    const container = document.querySelector('.content-pages');
    if (container) container.prepend(bar);
}

// Navigation Handling
function setupNavigation() {
    // Check for announcements on every page navigation
    const announcement = DB_ACTIONS.get('system_announcement');
    if (announcement && announcement.msg) {
        renderAnnouncement(announcement.msg);
    }

    // Load dealer info into the More menu
    const shopName = localStorage.getItem('shopName');
    const dealerId = localStorage.getItem('dealerId');
    const menuShop = document.getElementById('menu-shop-name');
    const menuId = document.getElementById('menu-user-id');
    if (menuShop && shopName) menuShop.innerText = shopName;
    if (menuId && dealerId) menuId.innerText = 'ID: ' + String(dealerId).slice(-8).toUpperCase();

    // All nav buttons (visible + hidden for More menu)
    const allNavButtons = document.querySelectorAll('[data-target]');
    allNavButtons.forEach(item => {
        item.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (!target) return;

            // Highlight only the main bottom-nav items
            const mainNavItems = document.querySelectorAll('.sidebar-nav .nav-item');
            mainNavItems.forEach(nav => nav.classList.remove('active'));
            // Only set active if it's a main nav button (not a hidden one)
            if (e.currentTarget.closest('.sidebar-nav')) {
                e.currentTarget.classList.add('active');
            }

            // Switch page
            pages.forEach(page => page.classList.remove('active'));
            const targetPage = document.getElementById(target);
            if (targetPage) targetPage.classList.add('active');

            // Update title
            const shopName = localStorage.getItem('shopName') || 'Your Shop';
            const titleSpan = e.currentTarget.querySelector('span');
            const titles = {
                dashboard: shopName, 
                billing: 'New Invoice', inventory: 'Stock',
                customers: 'Clients', expenses: 'Expenses', reports: 'Reports',
                'dealer-memo': 'Dealer Memo', categories: 'Categories'
            };
            if (pageTitleElement) pageTitleElement.innerText = titleSpan ? titleSpan.innerText : (titles[target] || shopName);

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
    
    // Pre-fill My Account Modal
    if (id === 'my-account-modal') {
        const dealerId = localStorage.getItem('dealerId');
        const dealers = DB_ACTIONS.get('platform_dealers');
        const dealer = dealers.find(d => d.id == dealerId) || {};
        
        document.getElementById('acc-shop-name').value = dealer.shopName || localStorage.getItem('shopName') || '';
        document.getElementById('acc-username').value = dealer.username || '';
        document.getElementById('acc-phone').value = dealer.phone || '';
        document.getElementById('acc-email').value = dealer.email || localStorage.getItem('userEmail') || '';
        document.getElementById('acc-pin').value = dealer.pin || '';
    }
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

async function handleAccountUpdate(e) {
    e.preventDefault();
    const dealerId = localStorage.getItem('dealerId');
    const dealers = DB_ACTIONS.get('platform_dealers');
    const index = dealers.findIndex(d => d.id == dealerId);
    
    if (index === -1) return alert("Security Error: User not found");
    
    const updatedDealer = {
        ...dealers[index],
        shopName: document.getElementById('acc-shop-name').value,
        username: document.getElementById('acc-username').value,
        phone: document.getElementById('acc-phone').value,
        email: document.getElementById('acc-email').value,
        pin: document.getElementById('acc-pin').value || dealers[index].pin
    };
    
    dealers[index] = updatedDealer;
    
    try {
        updateStatus('Updating Account...', '#007aff');
        await DB_ACTIONS.set('platform_dealers', dealers);
        
        // Sync to local storage for immediate UI reflect
        localStorage.setItem('shopName', updatedDealer.shopName);
        localStorage.setItem('userEmail', updatedDealer.email);
        
        alert("✅ Account Details Updated Successfully!");
        closeModal('my-account-modal');
        location.reload(); // Refresh to update all UI headers
    } catch(err) {
        alert("Update Failed: " + err.message);
    }
}

// Notification Helpers
function markAllNotificationsRead() {
    const badge = document.getElementById('bell-badge');
    if (badge) badge.style.display = 'none';
    
    document.getElementById('notification-body').innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
            <div style="width:64px; height:64px; background:#f1f1f3; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; color:#c7c7cc; font-size:24px;">
                <i class="fa-solid fa-check-double" style="color:var(--success);"></i>
            </div>
            <h4 style="color:var(--text-primary);">All Read</h4>
            <p style="color:var(--text-secondary); font-size:13px; margin-top:8px;">Everything is up to date.</p>
        </div>
    `;
    setTimeout(() => closeModal('notification-drawer'), 1500);
}

// --- Global Settings & Theme Engine ---
let activeAppTheme = localStorage.getItem('app_active_theme') || 'theme-default';

async function initGlobalSettings() {
    try {
        const settingsStr = localStorage.getItem('app_global_settings');
        if(settingsStr) {
            const settings = JSON.parse(settingsStr);
            applyAppTheme(settings.theme);
            applyFeatureToggles(settings.features);
        } else {
            applyAppTheme(activeAppTheme);
        }
        
        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('app_global_settings').select('data').limit(1).single();
            if (data && data.data) {
                const cloudSettings = data.data;
                applyAppTheme(cloudSettings.theme);
                applyFeatureToggles(cloudSettings.features);
                localStorage.setItem('app_global_settings', JSON.stringify(cloudSettings));
                localStorage.setItem('app_active_theme', cloudSettings.theme);
            }
        }
    } catch(e) { console.log("Global Settings Init skip:", e); }
}

function selectAppTheme(themeName) {
    activeAppTheme = themeName;
    document.querySelectorAll('.theme-option').forEach(opt => {
        const matches = opt.getAttribute('data-theme') === themeName;
        opt.style.border = matches ? '2px solid #007aff' : '1px solid #ddd';
        opt.classList.toggle('active', matches);
    });
}

function toggleAppFeature(feature) {
    console.log(`Feature ${feature} toggled locally.`);
}

async function saveGlobalSettings() {
    const settings = {
        theme: activeAppTheme,
        features: {
            memo: document.getElementById('ctrl-memo').checked,
            expense: document.getElementById('ctrl-expense').checked,
            cloud: document.getElementById('ctrl-cloud').checked
        },
        updatedAt: new Date().toISOString()
    };
    
    try {
        updateStatus('Applying Global Changes...', '#007aff');
        localStorage.setItem('app_active_theme', activeAppTheme);
        localStorage.setItem('app_global_settings', JSON.stringify(settings));
        
        applyAppTheme(activeAppTheme);
        applyFeatureToggles(settings.features);

        if (supabaseClient) {
            // We assume a table named app_global_settings exists with 'id' and 'data' (JSONB)
            await supabaseClient.from('app_global_settings').upsert({ id: 1, data: settings });
        }
        
        alert("🎉 Global App Customization Applied Successfully!");
    } catch(err) {
        alert("Global Save (Cloud) issue: " + err.message + "\n(Saved locally instead)");
    }
}

function applyAppTheme(theme) {
    document.body.className = '';
    document.body.classList.add(theme);
}

function applyFeatureToggles(features) {
    if (!features) return;
    const memoOptions = document.querySelectorAll('[data-target="dealer-memo"], [onclick*="dealer-memo"]');
    memoOptions.forEach(opt => opt.style.display = features.memo ? '' : 'none');
    
    const expenseOptions = document.querySelectorAll('[data-target="expenses"], [onclick*="expenses"]');
    expenseOptions.forEach(opt => opt.style.display = features.expense ? '' : 'none');
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
document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isTracked = document.getElementById('prod-tracked').checked;
    const imeiText = document.getElementById('prod-imeis').value || '';
    const imeis = imeiText.split('\n').map(i => i.trim()).filter(i => i.length > 0);

    const prods = DB_ACTIONS.get('products');
    
    // Check for duplicate IMEIs across all products
    if (isTracked) {
        const allExistingImeis = prods.flatMap(p => p.imeis || []);
        for (const imei of imeis) {
            if (allExistingImeis.includes(imei)) {
                return alert(`IMEI ${imei} already exists in inventory!`);
            }
        }
    }

    const prod = {
        id: Date.now(),
        name: document.getElementById('prod-name').value,
        catId: document.getElementById('prod-category').value,
        stock: isTracked ? imeis.length : parseInt(document.getElementById('prod-stock').value),
        cp: parseFloat(document.getElementById('prod-cp').value),
        sp: parseFloat(document.getElementById('prod-sp').value),
        isTracked: isTracked,
        imeis: imeis
    };

    prods.push(prod);
    await DB_ACTIONS.set('products', prods);
    
    document.getElementById('add-product-form').reset();
    document.getElementById('imei-entry-section').style.display = 'none';
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

// --- IMEI & Scanner Module ---
let html5QrcodeScanner = null;

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(e => console.error(e));
        html5QrcodeScanner = null;
    }
    closeModal('scanner-modal');
}

function startScanner(onSuccess) {
    if (html5QrcodeScanner) stopScanner();
    openModal('scanner-modal');
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
        fps: 15, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0
    });
    
    html5QrcodeScanner.render((decodedText) => {
        // Haptic feedback if available
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(100);
        onSuccess(decodedText);
        stopScanner();
    }, (err) => {
        // silent error for frame noise
    });
}

// Toggle IMEI section in Add Product modal
document.getElementById('prod-tracked')?.addEventListener('change', (e) => {
    document.getElementById('imei-entry-section').style.display = e.target.checked ? 'block' : 'none';
    if(e.target.checked) document.getElementById('prod-stock').value = 0;
});

function startImeiScan() {
    startScanner((code) => {
        const textarea = document.getElementById('prod-imeis');
        const existing = textarea.value.trim();
        textarea.value = existing ? existing + '\n' + code : code;
        // Update stock count automatically based on lines
        const lines = textarea.value.split('\n').filter(l => l.trim().length > 0);
        document.getElementById('prod-stock').value = lines.length;
    });
}

// Quick Scan in Billing
document.getElementById('btn-open-scanner')?.addEventListener('click', () => {
    startScanner((code) => {
        const products = DB_ACTIONS.get('products');
        // Find product that has this IMEI in its list
        const product = products.find(p => p.imeis && p.imeis.includes(code.trim()));
        
        if (!product) return alert(`IMEI ${code} not found in stock!`);
        if (product.stock < 1) return alert(`Product ${product.name} is out of stock!`);

        // Add to bill
        const existingItem = currentBillItems.find(i => i.id == product.id && i.scannedImei === code);
        if (existingItem) return alert("This specific unit is already in the bill.");

        currentBillItems.push({
            ...product,
            qty: 1,
            scannedImei: code
        });
        
        renderBillItems();
    });
});


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
                <td>
                    <strong>${item.name}</strong>
                    ${item.scannedImei ? `<br><small style="color:#0066cc;">IMEI: ${item.scannedImei}</small>` : ''}
                </td>
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
    const custPhone = document.getElementById('bill-customer-phone').value || 'Not provided';
    
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
        subtotal,
        discount: (subtotal * discount / 100),
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
        if (pIndex > -1) {
            prods[pIndex].stock -= item.qty;
            if (item.scannedImei && prods[pIndex].imeis) {
                prods[pIndex].imeis = prods[pIndex].imeis.filter(i => i !== item.scannedImei);
            }
        }
    });
    DB_ACTIONS.set('products', prods);
    
    // Update Customers
    const customers = DB_ACTIONS.get('customers');
    let custInfo = customers.find(c => c.phone === custPhone);
    if(custInfo && custPhone !== 'Not provided') {
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
    
    // Show Premium Invoice
    showInvoice(newBill);
    
    // Reset Bill
    currentBillItems = [];
    document.getElementById('bill-customer-name').value = '';
    document.getElementById('bill-customer-phone').value = '';
    document.getElementById('bill-discount').value = '0';
    initBilling();
});

function showInvoice(bill) {
    document.getElementById('inv-view-customer').innerText = bill.customer;
    document.getElementById('inv-view-phone').innerText = bill.phone;
    document.getElementById('inv-view-id').innerText = bill.id;
    document.getElementById('inv-view-date').innerText = new Date(bill.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    
    const tbody = document.getElementById('inv-view-items');
    tbody.innerHTML = '';
    
    bill.items.forEach(item => {
        tbody.innerHTML += `
            <tr style="border-bottom: 0.5px solid #f2f2f2;">
                <td style="padding: 12px 0;">
                    <div style="font-weight: 600;">${item.name}</div>
                    ${item.scannedImei ? `<div style="font-size: 11px; color: #0066cc;">IMEI: ${item.scannedImei}</div>` : ''}
                    <div style="font-size: 11px; color: #86868b;">Qty: ${item.qty} × ₹${item.sp}</div>
                </td>
                <td style="text-align: right; padding: 12px 0; font-weight: 600;">₹${(item.qty * item.sp).toFixed(2)}</td>
            </tr>
        `;
    });
    
    document.getElementById('inv-view-subtotal').innerText = `₹${bill.subtotal.toFixed(2)}`;
    document.getElementById('inv-view-discount').innerText = `-₹${bill.discount.toFixed(2)}`;
    document.getElementById('inv-view-total').innerText = `₹${bill.total.toFixed(2)}`;
    
    openModal('invoice-view-modal');
}

async function shareInvoiceAsImage() {
    const invoiceEl = document.getElementById('printable-invoice');
    const invId = document.getElementById('inv-view-id').innerText;
    
    try {
        updateStatus('Generating Image...', '#007aff');
        const canvas = await html2canvas(invoiceEl, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true
        });
        
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `Invoice_${invId}.png`, { type: 'image/png' });

            if (navigator.share) {
                try {
                    await navigator.share({
                        files: [file],
                        title: `Invoice ${invId}`,
                        text: 'Shared from MobiStore'
                    });
                } catch (err) {
                    downloadCanvas(canvas, invId);
                }
            } else {
                downloadCanvas(canvas, invId);
            }
            updateStatus('Cloud Sync Active', '#34c759');
        }, 'image/png');
    } catch (e) {
        console.error("Image Share Error:", e);
        alert("Failed to generate image.");
    }
}

function downloadCanvas(canvas, id) {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${id}.png`;
    a.click();
    alert("Invoice saved to your downloads.");
}

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
