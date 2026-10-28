import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDpMvqqiMJF_bcoAOEC4gC9CJrvdDlJVMA",
    authDomain: "icepop-3ed45.firebaseapp.com",
    projectId: "icepop-3ed45",
    storageBucket: "icepop-3ed45.firebasestorage.app",
    messagingSenderId: "635220816671",
    appId: "1:635220816671:web:71a452ec17bacd3ee0b62a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

const COLLECTION_NAME = 'sis';
const DOCUMENT_ID = 'LW1DtX6N4s0o97o1vaz';
const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
const PARTNER_ORDERS_COLLECTION = 'partner_orders';

const GROUP_OPTIONS = ['پیتزا','بەرگر','سپاگێتی','فینگەر','لەفە','مریشک','ماسی','خواردنەوەکان'];

const PARTNER_LOGOS = {
    talabat: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTGRS3jOlaVmLGzt8mBEaq37ajNGfES2-0S-eR6fzyJv1wIndRH19hr0mw&s=10',
    zuu: 'https://i.ibb.co/gMT6mBmc/unnamed.webp',
    wade: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTA8Jee5KhObkaRCr1jdElCvp6ZoSSCw2K9Eok9bqmAKfi97qLX_7Xu4I9u&s=10',
    leezu: 'https://www.lezzoo.com/icon.png'
};

// ============ UTILS ============
function getBusinessDayStart(ts) {
    const d = new Date(ts);
    if (d.getHours() < 2 || (d.getHours()===2 && d.getMinutes()<30)) {
        const p = new Date(d); p.setDate(p.getDate()-1);
        return new Date(p.getFullYear(), p.getMonth(), p.getDate(), 0,0,0,0);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
}
function isSameBusinessDay(a,b) { return getBusinessDayStart(a).getTime() === getBusinessDayStart(b).getTime(); }

function formatPrice(p) {
    if (!p && p !== 0) return '0 د.ع';
    return Math.round(p).toLocaleString('en-US') + ' د.ع';
}
function now() {
    return new Date().toLocaleString('ku', { hour:'2-digit', minute:'2-digit', hour12:true });
}
function getShift() {
    const h = new Date().getHours();
    return (h>=9 && h<17.5) ? 'morning' : 'night';
}
function genId() { return 'id_'+Date.now()+'_'+Math.random().toString(36).substr(2,4); }
function generateUniqueOrderId() { return 'ord_'+Date.now()+'_'+Math.random().toString(36).substr(2,6); }
function toast(msg, isErr=false) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr?' error':'');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 3000);
}
function getPrice(item, partner) {
    if (partner && item.partnerPrices && item.partnerPrices[partner] != null) return item.partnerPrices[partner];
    return item.price || 0;
}

// ============ STATE ============
const state = {
    currentPage: 'login',
    currentRole: null,
    currentUser: null,
    items: [],
    orders: [],
    partnerOrders: [],
    cart: [],
    orderType: 'dine',
    partner: null,
    partnerCode: '',
    discount: 0,
    discountAmount: 0,
    originalTotal: 0,
    selectedGroup: 'هەموو',
    isLoading: true,
    firebaseError: null,
    unsubscribeItems: null,
    unsubscribeOrders: null,
    unsubscribePartnerOrders: null,
    partnerImages: { talabat:'', zuu:'', wade:'', leezu:'' },
    showPartnerCodeModal: false,
    pendingPartner: null,
    itemsPanelScrollTop: 0,
    showReceipt: false,
    receiptOrder: null
};

// ============ FIRESTORE ============
function loadItemsFromFirestore() {
    if (state.unsubscribeItems) state.unsubscribeItems();
    state.unsubscribeItems = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            state.items = (data.items || []).map(item => ({
                id: item.id || genId(),
                name: item.naw || 'بێ ناو',
                price: item.nrx || 0,
                group: item.grwp || 'گشتی',
                image: item.link || '',
                branch: item.branch || 'زانکۆ',
                partnerPrices: {
                    talabat: item.nt ?? null,
                    zuu: item.nz ?? null,
                    wade: item.nw ?? null,
                    leezu: item.nl ?? null
                }
            }));
            if (data.partnerImages) state.partnerImages = data.partnerImages;
            state.isLoading = false;
            render();
        } else {
            state.isLoading = false;
            render();
        }
    }, (err) => {
        state.firebaseError = err.message;
        state.isLoading = false;
        render();
    });
}

function loadOrdersFromFirestore() {
    if (state.unsubscribeOrders) state.unsubscribeOrders();
    state.unsubscribeOrders = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            state.orders = data.orders || [];
            render();
        }
    });
}

function loadPartnerOrdersFromFirestore() {
    if (state.unsubscribePartnerOrders) state.unsubscribePartnerOrders();
    state.unsubscribePartnerOrders = onSnapshot(collection(db, PARTNER_ORDERS_COLLECTION), (snap) => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        state.partnerOrders = arr;
    });
}

async function saveOrdersToFirestore() {
    try {
        const ordersToSave = state.orders.map(o => ({ ...o, itemStatuses: o.itemStatuses || {} }));
        await updateDoc(docRef, { orders: ordersToSave, lastUpdated: new Date().toISOString() });
    } catch(e) { toast('هەڵە لە سەیڤکردن', true); }
}

async function savePartnerOrderToFirestore(order) {
    try {
        await addDoc(collection(db, PARTNER_ORDERS_COLLECTION), order);
    } catch(e) { toast('هەڵە لە سەیڤکردنی ئۆردەری شەریکە', true); }
}

// ============ RECEIPT HTML BUILDER ============
function buildReceiptHTML(order) {
    const branchName = 'زانکۆ';
    const restName = 'چێشتخانەی ئایس پۆپ';
    const restPhone = '0750 826 03 08';
    const restAddress = 'شەقامی زانکۆ، هەولێر';
    const logo = 'https://i.ibb.co/5g9D2kBt/file-0000000075187246ad73011f5eda1ff3.png';

    const orderTypeLabel = order.orderType === 'dine' ? 'ساڵە' : 'سەفەری';
    const receiptNo = 'ZN' + String(Date.now()).slice(-6);

    const dateObj = new Date(order.timestamp);
    const dateStr = dateObj.toLocaleDateString('ku');
    const timeStr = order.time || dateObj.toLocaleTimeString('ku', { hour: '2-digit', minute: '2-digit' });

    const itemsHtml = order.items.map(item => `
        <tr>
            <td class="item-name">${item.name}</td>
            <td class="item-qty">${item.qty}</td>
            <td class="item-price">${formatPrice(item.price * item.qty)}</td>
        </tr>
    `).join('');

    const discountHtml = order.discount > 0 ? `
        <div class="row discount-row">
            <span>داشکان (${order.discount}%)</span>
            <span>- ${formatPrice(order.discountAmount)}</span>
        </div>
    ` : '';

    const paymentMethod = order.partner ? `شەریکە (${order.partner.toUpperCase()})` : 'نەقد';

    return `
        <div class="receipt-content zanco-receipt">
            <div class="header">
                <img src="${logo}" class="logo-receipt" onerror="this.style.display='none'" />
                <div class="rest-name">${restName}</div>
                <div class="branch-name">${branchName}</div>
                <div class="rest-info">
                    <div class="phone-line"><span class="phone-icon">📞</span><span class="phone">${restPhone}</span></div>
                    <div class="address-line">📍 ${restAddress}</div>
                </div>
            </div>

            <div class="row">
                <span class="label">Receipt No:</span>
                <span class="value">#${receiptNo}</span>
            </div>
            <div class="row">
                <span class="label">ڕێکەوت:</span>
                <span class="value">${dateStr}</span>
            </div>
            <div class="row">
                <span class="label">کات:</span>
                <span class="value">${timeStr}</span>
            </div>
            <div class="row">
                <span class="label">کاشێر:</span>
                <span class="value">${order.cashier || '-'}</span>
            </div>
            <div class="row">
                <span class="label">جۆری ئۆردەر:</span>
                <span class="value">${orderTypeLabel}</span>
            </div>

            <div class="divider"></div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>ناو</th>
                        <th>ژمارە</th>
                        <th>نرخ</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="divider"></div>

            ${discountHtml}

            <div class="row total-row">
                <span>کۆی گشتی</span>
                <span class="total-amount">${formatPrice(order.total)}</span>
            </div>

            <div class="payment-method">
                💳 شێوەی پارەدان: ${paymentMethod}
            </div>

            <div class="footer">
                <div class="thanks">❤️ Thank You For Visiting Us ❤️</div>
                <div style="font-size:13px;color:#64748b;margin-top:3px;">${restName} - ${branchName}</div>
            </div>
        </div>
    `;
}

// ============ RENDER ============
function render() {
    const app = document.getElementById('app');
    if (!app) return;

    if (state.isLoading) {
        app.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><div>⏳ چاوەڕێ بکە...</div></div>`;
        return;
    }
    if (state.firebaseError && state.items.length === 0) {
        app.innerHTML = `<div class="loading-overlay" style="background:#fff;"><h2 style="color:#ff6b6b;">⚠️ هەڵە</h2><p style="color:#64748b;">${state.firebaseError}</p><button class="btn" style="width:auto;padding:10px 24px;" onclick="location.reload()">🔄 هەوڵدانەوە</button></div>`;
        return;
    }

    let html = '';
    if (state.currentPage === 'login') html = renderLogin();
    else if (state.currentPage === 'cashier') html = renderCashier();

    if (state.showPartnerCodeModal && state.pendingPartner) html += renderPartnerCodeModal();

    app.innerHTML = html;

    if (state.currentPage === 'cashier') {
        const panel = document.querySelector('.items-panel');
        if (panel) requestAnimationFrame(() => { panel.scrollTop = state.itemsPanelScrollTop; });
    }

    attachEvents();
}

function renderLogin() {
    return `
        <div class="login-page">
            <div class="login-box">
                <div class="logo-text">🏫 <span>زانکۆ</span></div>
                <p class="subtitle">چێشتخانەی ئایس پۆپ</p>
                <h2>چوونە ژوورەوە</h2>
                <input type="text" id="username" placeholder="ناوی بەکارهێنەر" />
                <input type="password" id="password" placeholder="تێپەڕەوشە" />
                <button class="btn" data-action="login-cashier">چوونە ژوور</button>
            </div>
        </div>
    `;
}

function renderCashier() {
    let filtered = state.items.filter(item => item.branch === 'زانکۆ');
    if (state.selectedGroup !== 'هەموو') filtered = filtered.filter(item => item.group === state.selectedGroup);

    const itemsHtml = filtered.map(item => {
        let displayPrice = item.price;
        if (state.orderType === 'partner' && state.partner && item.partnerPrices && item.partnerPrices[state.partner] != null) {
            displayPrice = item.partnerPrices[state.partner];
        }
        return `
            <div class="item-card" data-id="${item.id}">
                <div class="item-image-wrapper">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>` : ''}
                    <span class="emoji-placeholder" style="${item.image?'display:none;':''}">🍽️</span>
                </div>
                <div class="name">${item.name}</div>
                <div class="price">${formatPrice(displayPrice)}</div>
                ${item.branch?`<div class="item-branch-info">📌 ${item.branch}</div>`:''}
            </div>`;
    }).join('');

    const groupButtons = ['هەموو', ...GROUP_OPTIONS].map(g =>
        `<button class="${state.selectedGroup===g?'active':''}" data-action="filter-group" data-group="${g}">${g}</button>`
    ).join('');

    const cartHtml = state.cart.map((item, idx) => `
        <div class="order-item">
            <span>${item.name}</span>
            <span>${formatPrice(item.price * item.qty)}</span>
            <div style="display:flex;gap:4px;align-items:center;">
                <button class="btn btn-sm btn-warning" data-action="cart-qty" data-idx="${idx}" data-dir="-">-</button>
                <span class="qty">${item.qty}</span>
                <button class="btn btn-sm btn-warning" data-action="cart-qty" data-idx="${idx}" data-dir="+">+</button>
                <button class="btn btn-sm btn-danger" data-action="cart-remove" data-idx="${idx}">✕</button>
            </div>
        </div>`).join('');

    const originalTotal = state.cart.reduce((s,i)=>s+i.price*i.qty, 0);
    const discountedTotal = state.discount > 0 ? originalTotal - (originalTotal*state.discount)/100 : originalTotal;
    const discountAmount = state.discount > 0 ? (originalTotal*state.discount)/100 : 0;

    let totalDisplay = '';
    if (state.discount > 0 && state.orderType !== 'partner') {
        totalDisplay = `
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;width:100%;">
                <div style="display:flex;justify-content:space-between;width:100%;"><span>نرخی بنەڕەت:</span><span style="text-decoration:line-through;color:#94a3b8;">${formatPrice(originalTotal)}</span></div>
                <div style="display:flex;justify-content:space-between;width:100%;color:#e17055;"><span>داشکان (${state.discount}%):</span><span>- ${formatPrice(discountAmount)}</span></div>
                <div style="display:flex;justify-content:space-between;width:100%;font-size:20px;border-top:2px solid #e2e8f0;padding-top:4px;"><span>کۆی گشتی:</span><span style="color:#00b894;">${formatPrice(discountedTotal)}</span></div>
            </div>`;
    } else {
        totalDisplay = `<div style="display:flex;justify-content:space-between;width:100%;"><span>کۆی گشتی:</span><span>${formatPrice(originalTotal)}</span></div>`;
    }

    const deliveryBtns = ['dine','takeaway','partner'].map(t => {
        const labels = { dine:'🍽️ ساڵە', takeaway:'🛍️ سەفەری', partner:'🤝 شەریکە' };
        return `<button class="${state.orderType===t?'active':''}" data-action="set-type" data-type="${t}">${labels[t]}</button>`;
    }).join('');

    const partnerBtns = ['talabat','zuu','wade','leezu'].map(p => {
        const img = state.partnerImages[p] || PARTNER_LOGOS[p] || '';
        const display = img ? `<img src="${img}" onerror="this.style.display='none';"/>` : '';
        const label = p.charAt(0).toUpperCase() + p.slice(1);
        return `<button class="${state.partner===p?'active':''}" data-action="open-partner-code" data-partner="${p}">${display}<span class="partner-label">${label}</span></button>`;
    }).join('');

    const partnerInfo = state.partner ? `
        <span class="partner-info-badge">
            <img src="${PARTNER_LOGOS[state.partner]||''}" onerror="this.style.display='none';"/>
            ${state.partner.toUpperCase()} ${state.partnerCode?'- '+state.partnerCode:''}
        </span>` : '';

    let discountButtons = '';
    if (state.orderType === 'dine' || state.orderType === 'takeaway') {
        discountButtons = `
            <div class="discount-buttons">
                <span class="label">🏷️ داشکان:</span>
                <button class="btn-discount ${state.discount===30?'active':''}" data-action="set-discount" data-percent="30">%30</button>
                <button class="btn-discount ${state.discount===50?'active':''}" data-action="set-discount" data-percent="50">%50</button>
                ${state.discount>0?`<button class="btn-discount" data-action="set-discount" data-percent="0" style="background:#e2e8f0;color:#1a1a2e;box-shadow:none;">✕ لابردن</button>`:''}
            </div>`;
    }

    return `
        <div>
            <div class="header-bar">
                <div class="title">💰 کاشێر - زانکۆ</div>
                <div class="user-info">${state.currentUser || 'کاشێر'} | ${now()}</div>
                <button class="back-btn" data-action="logout">🚪 دەرچوون</button>
            </div>

            <div class="cashier-layout">
                <div class="items-panel" id="items-panel">
                    <h3>🛒 ئایتمەکان</h3>
                    <div class="group-filter-buttons">${groupButtons}</div>
                    <div class="item-grid">${itemsHtml || '<p style="color:#94a3b8;text-align:center;padding:20px;grid-column:1/-1;">هیچ ئایتمێک نییە</p>'}</div>
                </div>

                <div class="order-panel">
                    <h3>📋 ئۆردەر</h3>
                    <div class="delivery-options">${deliveryBtns}</div>
                    <div class="cashier-partner-buttons">${partnerBtns}${partnerInfo}</div>
                    ${discountButtons}
                    <div class="order-list">${cartHtml || '<p style="color:#94a3b8;text-align:center;padding:20px;">تا ئێستا هیچ شتێک زیاد نەکراوە</p>'}</div>
                    <div class="order-total">${totalDisplay}</div>
                    <div class="order-actions">
                        <button class="btn btn-danger" data-action="clear-cart">🧹 خاڵی کردن</button>
                        <button class="btn btn-success" data-action="save-order">💾 سەیڤ کردن</button>
                    </div>
                </div>
            </div>
            <div style="text-align:center;padding:14px 0 6px;font-size:13px;color:#a0a8b8;opacity:.75;">Powered by Zhyar</div>
        </div>`;
}

function renderPartnerCodeModal() {
    const partner = state.pendingPartner;
    const logo = PARTNER_LOGOS[partner] || '';
    const label = partner.charAt(0).toUpperCase() + partner.slice(1);
    const code = state.partnerCode || '';
    const display = code + '_'.repeat(4 - code.length);

    const numpad = `
        <div class="numpad-grid">
            ${[1,2,3].map(n=>`<button data-numpad="${n}">${n}</button>`).join('')}
            ${[4,5,6].map(n=>`<button data-numpad="${n}">${n}</button>`).join('')}
            ${[7,8,9].map(n=>`<button data-numpad="${n}">${n}</button>`).join('')}
            <button class="clear-btn" data-numpad="clear">✕</button>
            <button data-numpad="0">0</button>
            <button class="backspace-btn" data-numpad="backspace">⌫</button>
        </div>`;

    return `
        <div class="modal-overlay partner-code-modal" id="partner-code-modal-overlay">
            <div class="modal">
                <button class="close-btn" id="close-partner-code-modal">✕</button>
                <img src="${logo}" class="partner-logo-big" alt="${label}"/>
                <h3>📦 کۆدی ${label}</h3>
                <p class="hint">تکایە ٤ ژمارەی کۆتای پسولە داخل بکە</p>
                <div class="code-display" id="partner-code-display">${display}</div>
                <div id="partner-code-error" class="code-error"></div>
                ${numpad}
            </div>
        </div>`;
}

// ============ EVENTS ============
function attachEvents() {
    document.querySelectorAll('[data-action="login-cashier"]').forEach(el => {
        el.onclick = () => {
            const u = document.getElementById('username')?.value.trim();
            const p = document.getElementById('password')?.value.trim();
            if ((u==='fayaq'&&p==='f00') || (u==='blnd'&&p==='a00')) {
                state.currentUser = u;
                state.currentRole = 'cashier';
                state.currentPage = 'cashier';
                toast('بەخێربێیت ' + u);
                render();
            } else toast('ناو یان تێپەڕەوشە هەڵەیە', true);
        };
    });

    document.querySelectorAll('[data-action="logout"]').forEach(el => {
        el.onclick = () => {
            state.currentPage = 'login';
            state.currentUser = null;
            state.currentRole = null;
            state.cart = [];
            state.partner = null;
            state.partnerCode = '';
            state.discount = 0;
            state.discountAmount = 0;
            state.showPartnerCodeModal = false;
            state.pendingPartner = null;
            render();
        };
    });

    document.querySelectorAll('[data-action="filter-group"]').forEach(el => {
        el.onclick = () => { state.selectedGroup = el.dataset.group; render(); };
    });

    document.querySelectorAll('.item-card').forEach(el => {
        el.onclick = () => {
            const panel = document.querySelector('.items-panel');
            if (panel) state.itemsPanelScrollTop = panel.scrollTop;
            const id = el.dataset.id;
            const item = state.items.find(i => i.id === id);
            if (item) {
                const existing = state.cart.find(i => i.id === id);
                let priceToUse = item.price;
                if (state.orderType==='partner' && state.partner && item.partnerPrices && item.partnerPrices[state.partner] != null) {
                    priceToUse = item.partnerPrices[state.partner];
                }
                if (existing) { existing.qty++; existing.price = priceToUse; }
                else state.cart.push({ ...item, price: priceToUse, qty: 1 });
                state.discount = 0; state.discountAmount = 0;
                render();
                setTimeout(() => {
                    const np = document.querySelector('.items-panel');
                    if (np) np.scrollTop = state.itemsPanelScrollTop;
                }, 10);
            }
        };
    });

    document.querySelectorAll('[data-action="cart-qty"]').forEach(el => {
        el.onclick = () => {
            const idx = parseInt(el.dataset.idx);
            const dir = el.dataset.dir;
            if (state.cart[idx]) {
                if (dir==='+') state.cart[idx].qty++;
                else { state.cart[idx].qty--; if (state.cart[idx].qty<=0) state.cart.splice(idx,1); }
                state.discount = 0; state.discountAmount = 0;
                render();
            }
        };
    });

    document.querySelectorAll('[data-action="cart-remove"]').forEach(el => {
        el.onclick = () => {
            state.cart.splice(parseInt(el.dataset.idx), 1);
            state.discount = 0; state.discountAmount = 0;
            render();
        };
    });

    document.querySelectorAll('[data-action="clear-cart"]').forEach(el => {
        el.onclick = () => { state.cart = []; state.discount = 0; state.discountAmount = 0; render(); };
    });

    document.querySelectorAll('[data-action="set-discount"]').forEach(el => {
        el.onclick = () => {
            const p = parseInt(el.dataset.percent);
            if (p === 0) { state.discount = 0; state.discountAmount = 0; }
            else {
                if (state.cart.length === 0) { toast('تکایە یەکەم ئایتم زیاد بکە', true); return; }
                if (state.orderType === 'partner') { toast('داشکان بۆ شەریکە نییە!', true); return; }
                if (state.discount === p) { state.discount = 0; state.discountAmount = 0; }
                else {
                    state.discount = p;
                    const orig = state.cart.reduce((s,i)=>s+i.price*i.qty, 0);
                    state.discountAmount = (orig*p)/100;
                }
            }
            render();
        };
    });

    document.querySelectorAll('[data-action="set-type"]').forEach(el => {
        el.onclick = () => {
            const prev = state.orderType;
            const nw = el.dataset.type;
            state.orderType = nw;
            if (nw==='partner' && state.partner) updatePricesForPartner(state.partner);
            else if (nw!=='partner' && prev==='partner') { resetPricesToDefault(); state.partner = null; state.partnerCode = ''; }
            else if (nw!=='partner') resetPricesToDefault();
            if (nw!=='partner') { state.discount = 0; state.discountAmount = 0; }
            render();
        };
    });

    document.querySelectorAll('[data-action="open-partner-code"]').forEach(el => {
        el.onclick = () => {
            state.partnerCode = '';
            openPartnerCodeModal(el.dataset.partner);
        };
    });

    document.querySelectorAll('[data-action="save-order"]').forEach(el => {
        el.onclick = async (e) => {
            e.preventDefault();
            if (!state.cart.length) { toast('تکایە لاپەڕەکە پڕ بکە', true); return; }
            if (state.orderType==='partner' && !state.partner) { toast('تکایە شەریکە دیاری بکە', true); return; }
            if (state.orderType==='partner' && !state.partnerCode) { toast('تکایە کۆدی شەریکە داخل بکە', true); return; }

            const uniqueId = generateUniqueOrderId();
            const originalTotal = state.cart.reduce((s,i)=>s+i.price*i.qty, 0);
            const discountedTotal = state.discount>0 ? originalTotal-(originalTotal*state.discount)/100 : originalTotal;
            const discountAmount = state.discount>0 ? (originalTotal*state.discount)/100 : 0;

            const orderData = {
                items: state.cart.map(i => ({ id:i.id, name:i.name, qty:i.qty, price:i.price, group:i.group, image:i.image })),
                total: discountedTotal,
                originalTotal, discount: state.discount, discountAmount,
                orderType: state.orderType, partner: state.partner, partnerCode: state.partnerCode,
                time: now(), shift: getShift(), cashier: state.currentUser, branch: 'زانکۆ',
                timestamp: Date.now(), image: state.cart[0]?.image || ''
            };

            const order = { uniqueId, ...orderData, status:'completed', itemStatuses: {} };
            order.items.forEach(it => { order.itemStatuses[it.id] = 'ready'; });

            state.orders.push(order);
            if (state.orderType==='partner' && state.partner) await savePartnerOrderToFirestore(orderData);

            const receiptOrder = { ...order };
            state.cart = [];
            state.partnerCode = '';
            state.discount = 0; state.discountAmount = 0;
            toast('✅ ئۆردەر سەیڤ کرا!');
            await saveOrdersToFirestore();

            const isDine = state.orderType==='dine' || state.orderType==='takeaway';
            if (isDine) {
                const printContainer = document.getElementById('print-receipt-container');
                if (printContainer) {
                    printContainer.innerHTML = buildReceiptHTML(receiptOrder);
                    setTimeout(() => {
                        window.print();
                        setTimeout(() => { printContainer.innerHTML = ''; }, 1000);
                    }, 200);
                }
            }
            render();
        };
    });

    // Partner code numpad
    document.querySelectorAll('[data-numpad]').forEach(el => {
        el.onclick = () => {
            const v = el.dataset.numpad;
            if (v==='clear') { state.partnerCode=''; }
            else if (v==='backspace') { state.partnerCode = state.partnerCode.slice(0,-1); }
            else if (state.partnerCode.length < 4) { state.partnerCode += v; }
            updatePartnerDisplay();
            const err = document.getElementById('partner-code-error');
            if (err) err.classList.remove('show');
            if (state.partnerCode.length === 4) setTimeout(confirmPartnerCode, 350);
        };
    });

    const closeP = document.getElementById('close-partner-code-modal');
    if (closeP) closeP.onclick = closePartnerCodeModal;
    const pOverlay = document.getElementById('partner-code-modal-overlay');
    if (pOverlay) pOverlay.onclick = (e) => { if (e.target===pOverlay) closePartnerCodeModal(); };
}

function updatePartnerDisplay() {
    const el = document.getElementById('partner-code-display');
    if (el) {
        const c = state.partnerCode || '';
        el.textContent = c + '_'.repeat(4 - c.length);
    }
}

function openPartnerCodeModal(partner) {
    state.pendingPartner = partner;
    state.showPartnerCodeModal = true;
    state.partnerCode = '';
    render();
}
function closePartnerCodeModal() {
    state.showPartnerCodeModal = false;
    state.pendingPartner = null;
    state.partnerCode = '';
    render();
}
function confirmPartnerCode() {
    if (state.partnerCode.length === 4 && /^\d{4}$/.test(state.partnerCode)) {
        state.partner = state.pendingPartner;
        state.orderType = 'partner';
        state.showPartnerCodeModal = false;
        state.pendingPartner = null;
        updatePricesForPartner(state.partner);
        toast('✅ کۆد پشتڕاست کرایەوە!');
        render();
    }
}
function updatePricesForPartner(partner) {
    if (!partner || !state.cart.length) return;
    let changed = false;
    state.cart = state.cart.map(item => {
        if (item.partnerPrices && item.partnerPrices[partner] != null) {
            if (item.price !== item.partnerPrices[partner]) {
                changed = true;
                return { ...item, price: item.partnerPrices[partner] };
            }
        }
        return item;
    });
    if (changed) { toast(`🔄 نرخ گۆڕدرا بۆ ${partner.toUpperCase()}`); render(); }
}
function resetPricesToDefault() {
    if (!state.cart.length) return;
    let changed = false;
    state.cart = state.cart.map(item => {
        const def = state.items.find(i=>i.id===item.id)?.price || item.price;
        if (item.price !== def) { changed = true; return { ...item, price: def }; }
        return item;
    });
    if (changed) render();
}

// ============ INIT ============
async function init() {
    state.isLoading = true;
    render();
    try {
        try { await signInAnonymously(auth); } catch(e) {}
        loadItemsFromFirestore();
        loadOrdersFromFirestore();
        loadPartnerOrdersFromFirestore();
    } catch(e) {
        state.firebaseError = e.message;
        state.isLoading = false;
        render();
    }
}

init();
