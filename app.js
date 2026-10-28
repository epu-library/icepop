// ============================================================
// DAILY RESET
// ============================================================
function performDailyReset() {
    const now = new Date();
    const businessDayStart = getCurrentBusinessDayStart();
    
    if (state.dailyResetTimestamp) {
        const lastResetDate = new Date(state.dailyResetTimestamp);
        const lastBusinessDay = getBusinessDayStart(lastResetDate);
        if (lastBusinessDay.getTime() === businessDayStart.getTime()) {
            return;
        }
    }
    
    const todayOrders = state.orders.filter(o => {
        return isSameBusinessDay(o.timestamp, now);
    });
    
    state.currentDayOrders = todayOrders;
    state.dailyResetDone = true;
    state.dailyResetTimestamp = now.toISOString();
    
    updateDoc(docRef, {
        dailyResetTimestamp: state.dailyResetTimestamp,
        lastUpdated: new Date().toISOString()
    }).catch(err => console.error('Error saving daily reset:', err));
    
    toast('🔄 سیستەم نوێ بویەوە (٢:٣٠ بەیانی) - داتاکان هەرگیز ناسڕدرێنەوە');
}

// ============================================================
// MONTHLY RESET
// ============================================================
async function performMonthlyReset() {
    const now = new Date();
    const businessDayStart = getBusinessDayStart(now);
    const currentMonth = businessDayStart.getMonth();
    const currentYear = businessDayStart.getFullYear();
    
    if (state.monthlyResetTimestamp) {
        const lastReset = new Date(state.monthlyResetTimestamp);
        const lastBusinessDay = getBusinessDayStart(lastReset);
        if (lastBusinessDay.getMonth() === currentMonth && 
            lastBusinessDay.getFullYear() === currentYear) {
            return;
        }
    }
    
    state.monthlyResetDone = true;
    state.monthlyResetTimestamp = now.toISOString();
    
    const ordersCount = state.orders.length;
    state.orders = [];
    state.currentDayOrders = [];
    state.currentMonthOrders = [];
    
    try {
        await updateDoc(docRef, {
            orders: [],
            monthlyResetTimestamp: state.monthlyResetTimestamp,
            lastUpdated: new Date().toISOString()
        });
        
        if (ordersCount > 0) {
            toast(`🔄 مانگی نوێ: ${ordersCount} ئۆردەر سڕایەوە — ڕەوتی مانگانە = 0`);
        } else {
            toast('📅 مانگی نوێ — ڕەوتی مانگانە = 0');
        }
    } catch (err) {
        console.error('Error clearing orders on monthly reset:', err);
        toast('⚠️ هەڵە لە پاککردنەوەی ئۆردەرەکان', true);
    }
    
    render();
}

function checkAndApplyResets() {
    const now = new Date();
    
    if (isResetWindow()) {
        performDailyReset();
    }
    
    const currentBusinessMonth = getBusinessDayStart(now);
    const currentMonth = currentBusinessMonth.getMonth();
    const currentYear = currentBusinessMonth.getFullYear();
    
    if (state.monthlyResetTimestamp) {
        const lastReset = new Date(state.monthlyResetTimestamp);
        const lastBusinessDay = getBusinessDayStart(lastReset);
        const lastMonth = lastBusinessDay.getMonth();
        const lastYear = lastBusinessDay.getFullYear();
        
        if (lastMonth !== currentMonth || lastYear !== currentYear) {
            performMonthlyReset();
        }
    } else {
        performMonthlyReset();
    }
    
    state.currentDayOrders = state.orders.filter(o => {
        return isSameBusinessDay(o.timestamp, now);
    });
    
    state.currentMonthOrders = state.orders;
}

function getTodayOrders() {
    const now = new Date();
    return state.orders.filter(o => isSameBusinessDay(o.timestamp, now));
}

function getThisMonthOrders() {
    return state.orders;
}

async function loadResetTimestamps() {
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.dailyResetTimestamp) {
                state.dailyResetTimestamp = data.dailyResetTimestamp;
            }
            if (data.monthlyResetTimestamp) {
                state.monthlyResetTimestamp = data.monthlyResetTimestamp;
            }
            
            const now = new Date();
            if (state.dailyResetTimestamp) {
                const lastReset = new Date(state.dailyResetTimestamp);
                if (!isSameBusinessDay(lastReset, now)) {
                    performDailyReset();
                }
            }
            
            const currentBusinessMonth = getBusinessDayStart(now);
            const currentMonth = currentBusinessMonth.getMonth();
            const currentYear = currentBusinessMonth.getFullYear();
            
            if (state.monthlyResetTimestamp) {
                const lastReset = new Date(state.monthlyResetTimestamp);
                const lastBusinessDay = getBusinessDayStart(lastReset);
                const lastMonth = lastBusinessDay.getMonth();
                const lastYear = lastBusinessDay.getFullYear();
                
                if (lastMonth !== currentMonth || lastYear !== currentYear) {
                    await performMonthlyReset();
                }
            } else {
                await performMonthlyReset();
            }
        }
    } catch (error) {
        console.error('Error loading reset timestamps:', error);
    }
}

function loadItemsFromFirestore() {
    if (state.unsubscribeItems) {
        state.unsubscribeItems();
        state.unsubscribeItems = null;
    }
    try {
        state.unsubscribeItems = onSnapshot(docRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const itemsData = data.items || [];
                state.items = itemsData.map(item => ({
                    id: item.id || genId(),
                    name: item.naw || 'بێ ناو',
                    price: item.nrx || 0,
                    group: item.grwp || 'گشتی',
                    image: item.link || '',
                    branch: item.branch || 'زانکۆ',
                    partnerPrices: {
                        talabat: item.nt || null,
                        zuu: item.nz || null,
                        wade: item.nw || null,
                        leezu: item.nl || null
                    }
                }));
                if (data.partnerImages) {
                    state.partnerImages = data.partnerImages;
                }
                if (data.lastResetDate) {
                    state.lastResetDate = data.lastResetDate;
                }
                if (data.lastMonthlyReset) {
                    state.lastMonthlyReset = data.lastMonthlyReset;
                }
                if (data.dailyResetTimestamp) {
                    state.dailyResetTimestamp = data.dailyResetTimestamp;
                }
                if (data.monthlyResetTimestamp) {
                    state.monthlyResetTimestamp = data.monthlyResetTimestamp;
                }
                state.isLoading = false;
                state.firebaseError = null;
                checkAndApplyResets();
                render();
            } else {
                createDefaultDocument();
            }
        }, (error) => {
            console.error('Error loading items from Firestore:', error);
            state.firebaseError = error.message;
            state.isLoading = false;
            render();
            toast('هەڵە لە بارکردنی داتا: ' + error.message, true);
        });
    } catch (error) {
        console.error('Error setting up listener:', error);
        state.firebaseError = error.message;
        state.isLoading = false;
        render();
        toast('هەڵە لە پەیوەندیکردن بە داتابەیس', true);
    }
}

async function createDefaultDocument() {
    try {
        const defaultItems = [
            { id: 'p1', naw: 'پیتزا مەرگ', nrx: 12000, grwp: 'پیتزا', link: '', branch: 'زانکۆ', nt: 14000, nz: 13000, nw: 12500, nl: 13500 },
            { id: 'p2', naw: 'پیتزا مەک', nrx: 10000, grwp: 'پیتزا', link: '', branch: 'زانکۆ', nt: 12000, nz: 11000, nw: 10500, nl: 11500 },
            { id: 'g1', naw: 'شاورما گەس', nrx: 8000, grwp: 'مریشک', link: '', branch: 'زانکۆ', nt: 10000, nz: 9000, nw: 8500, nl: 9500 },
            { id: 'g2', naw: 'گەس بریانی', nrx: 14000, grwp: 'مریشک', link: '', branch: 'زانکۆ', nt: 16000, nz: 15000, nw: 14500, nl: 15500 },
            { id: 'gr1', naw: 'شیش تاووک', nrx: 11000, grwp: 'بەرگر', link: '', branch: 'زانکۆ', nt: 13000, nz: 12000, nw: 11500, nl: 12500 },
            { id: 'gr2', naw: 'بەرگر پەتی', nrx: 9000, grwp: 'بەرگر', link: '', branch: 'زانکۆ', nt: 11000, nz: 10000, nw: 9500, nl: 10500 },
            { id: 'd1', naw: 'پەپسی', nrx: 2000, grwp: 'خواردنەوەکان', link: '', branch: 'زانکۆ', nt: 3000, nz: 2500, nw: 2000, nl: 2500 },
            { id: 'd2', naw: 'سپرایت', nrx: 2000, grwp: 'خواردنەوەکان', link: '', branch: 'زانکۆ', nt: 3000, nz: 2500, nw: 2000, nl: 2500 },
            { id: 'd3', naw: 'ئاو', nrx: 1000, grwp: 'خواردنەوەکان', link: '', branch: 'زانکۆ', nt: 1500, nz: 1200, nw: 1000, nl: 1200 },
        ];
        await setDoc(docRef, {
            items: defaultItems,
            partnerImages: { talabat: '', zuu: '', wade: '', leezu: '' },
            orders: [],
            lastUpdated: new Date().toISOString(),
            lastResetDate: new Date().toISOString(),
            lastMonthlyReset: new Date().toISOString(),
            dailyResetTimestamp: new Date().toISOString(),
            monthlyResetTimestamp: new Date().toISOString()
        });
        toast('📁 دۆکیومێنت دروست کرا');
        loadItemsFromFirestore();
    } catch (error) {
        console.error('Error creating document:', error);
        state.firebaseError = error.message;
        state.isLoading = false;
        render();
        toast('هەڵە لە دروستکردنی دۆکیۆمێنت', true);
    }
}

async function saveItemsToFirestore() {
    try {
        const itemsData = state.items.map(item => ({
            id: item.id,
            naw: item.name,
            nrx: item.price,
            grwp: item.group || 'گشتی',
            link: item.image || '',
            branch: item.branch || 'زانکۆ',
            nt: item.partnerPrices?.talabat || null,
            nz: item.partnerPrices?.zuu || null,
            nw: item.partnerPrices?.wade || null,
            nl: item.partnerPrices?.leezu || null
        }));
        await updateDoc(docRef, {
            items: itemsData,
            lastUpdated: new Date().toISOString()
        });
        toast('✅ داتا سەیڤ کرا');
    } catch (error) {
        console.error('Error saving items:', error);
        toast('هەڵە لە سەیڤکردن: ' + error.message, true);
    }
}

async function savePartnerImagesToFirestore() {
    try {
        await updateDoc(docRef, {
            partnerImages: state.partnerImages,
            lastUpdated: new Date().toISOString()
        });
        toast('✅ وێنەکانی شەریکە سەیڤ کران');
    } catch (error) {
        console.error('Error saving partner images:', error);
        toast('هەڵە لە سەیڤکردنی وێنەکان', true);
    }
}

// ============================================================
// ORDERS FUNCTIONS
// ============================================================

function loadOrdersFromFirestore() {
    if (state.unsubscribeOrders) {
        state.unsubscribeOrders();
        state.unsubscribeOrders = null;
    }
    try {
        state.unsubscribeOrders = onSnapshot(docRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const ordersData = data.orders || [];
                
                const processedOrders = ordersData.map(o => {
                    if (!o.uniqueId) {
                        o.uniqueId = generateUniqueOrderId();
                    }
                    if (!o.itemStatuses) {
                        o.itemStatuses = {};
                        o.items.forEach(item => {
                            o.itemStatuses[item.id] = 'ready';
                        });
                    }
                    return o;
                });

                state.orders = processedOrders;
                state.previousOrderIds = new Set(processedOrders.map(o => o.uniqueId));
                
                if (data.dailyResetTimestamp) {
                    state.dailyResetTimestamp = data.dailyResetTimestamp;
                }
                if (data.monthlyResetTimestamp) {
                    state.monthlyResetTimestamp = data.monthlyResetTimestamp;
                }
                
                checkAndApplyResets();
                render();
            }
        }, (error) => {
            console.error('Error loading orders:', error);
        });
    } catch (error) {
        console.error('Error setting up orders listener:', error);
    }
}

function loadPartnerOrdersFromFirestore() {
    if (state.unsubscribePartnerOrders) {
        state.unsubscribePartnerOrders();
        state.unsubscribePartnerOrders = null;
    }
    try {
        state.unsubscribePartnerOrders = onSnapshot(
            collection(db, PARTNER_ORDERS_COLLECTION),
            (snapshot) => {
                const orders = [];
                snapshot.forEach((doc) => {
                    orders.push({ id: doc.id, ...doc.data() });
                });
                state.partnerOrders = orders;
                render();
            },
            (error) => {
                console.error('Error loading partner orders:', error);
            }
        );
    } catch (error) {
        console.error('Error setting up partner orders listener:', error);
    }
}

async function savePartnerOrderToFirestore(order) {
    try {
        await addDoc(collection(db, PARTNER_ORDERS_COLLECTION), order);
        toast('✅ ئۆردەری شەریکە سەیڤ کرا!');
    } catch (error) {
        console.error('Error saving partner order:', error);
        toast('هەڵە لە سەیڤکردنی ئۆردەری شەریکە', true);
    }
}

async function saveOrdersToFirestore() {
    try {
        const ordersToSave = state.orders.map(o => ({
            ...o,
            itemStatuses: o.itemStatuses || {}
        }));
        
        await updateDoc(docRef, {
            orders: ordersToSave,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error saving orders:', error);
        toast('هەڵە لە سەیڤکردنی ئۆردەرەکان', true);
    }
}
