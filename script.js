// --- GLOBAL VARIABLES ---
let map;
let satelliteLayer, osmLayer;
let userLocation = null;
let providers = []; // All data
let markers = [];
let currentRequestStatusTimer = null; 
let currentUser = null; 
const CURRENT_USER_KEY = 'serviceCurrentUser';
let routingControl = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    initializeMobileSidebar(); 
    loadData(); 
    checkAuthSession(); 
    initChatbot(); 
    initDraggable();
});

// --- LOAD DATA & INITIAL STATE ---
async function loadData() {
    try {
        const response = await fetch('/api/shops');
        const data = await response.json();
        if(Array.isArray(data)) {
            providers = data.map(p => ({...p, lat: parseFloat(p.lat), lng: parseFloat(p.lng)}));
            // Initial view: Featured only, Map empty of shop markers
            renderFeaturedProviders();
        }
    } catch (error) { console.error("Error loading data:", error); }
}

// Render Initial "Best of" List (1 best per category, max 4)
function renderFeaturedProviders() {
    const container = document.getElementById('providersContainer');
    document.getElementById('listHeader').textContent = "Top Rated Services (Featured)";
    container.innerHTML = '';

    const categories = [...new Set(providers.map(p => p.service))];
    let featured = [];
    
    categories.forEach(cat => {
        const bestInCat = providers.filter(p => p.service === cat).sort((a,b) => b.rating - a.rating)[0];
        if(bestInCat) featured.push(bestInCat);
    });

    const initialShow = featured.slice(0, 4);
    initialShow.forEach(p => createProviderCard(p, container));

    const seeMoreBtn = document.getElementById('seeMoreBtn');
    if (featured.length > 4) {
        seeMoreBtn.style.display = 'block';
        seeMoreBtn.onclick = () => {
            featured.slice(4).forEach(p => createProviderCard(p, container));
            seeMoreBtn.style.display = 'none';
        };
    } else {
        seeMoreBtn.style.display = 'none';
    }
}

function createProviderCard(provider, container) {
    const card = document.createElement('div');
    card.className = 'provider-card';
    card.setAttribute('data-id', provider.id);
    const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
    const isOpen = isShopOpen(provider.openTime, provider.closeTime);
    
    card.innerHTML = `
        <div class="provider-header">
            <div><div class="provider-name">${provider.name}</div><span class="provider-service">${getServiceDisplayName(provider.service)}</span></div>
        </div>
        <div class="provider-rating">
            <span class="stars">${stars}</span><span>${provider.rating}</span><span class="status-badge ${isOpen ? 'status-open' : 'status-closed'}">${isOpen ? 'Open' : 'Closed'}</span>
        </div>
        <div class="provider-address"><i class="fas fa-map-marker-alt"></i> ${provider.address}</div>`;
    
    card.addEventListener('click', function() { 
        showSingleShopOnMap(provider.id);
        highlightProviderCard(provider.id); 
    });
    container.appendChild(card);
}

// --- MAP & LIST DISPLAY LOGIC ---
function showSingleShopOnMap(id) {
    clearMapMarkers();
    const p = providers.find(x => x.id === id);
    if(p) {
        addMarkerToMap(p);
        map.setView([p.lat, p.lng], 16);
        const m = markers.find(m => m.providerId === id);
        if(m) m.openPopup(); 
    }
}

function showCategoryOnMap(category) {
    clearMapMarkers();
    const filtered = providers.filter(p => p.service === category);
    filtered.forEach(addMarkerToMap);
    
    const container = document.getElementById('providersContainer');
    container.innerHTML = '';
    document.getElementById('listHeader').textContent = `All ${getServiceDisplayName(category)}s`;
    document.getElementById('seeMoreBtn').style.display = 'none';
    filtered.forEach(p => createProviderCard(p, container));

    if(filtered.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

function clearMapMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

function addMarkerToMap(provider) {
    const marker = L.marker([provider.lat, provider.lng]).addTo(map);
    marker.providerId = provider.id;
    marker.bindPopup(`<b>${provider.name}</b><br>${getServiceDisplayName(provider.service)}<br><button onclick="showProviderDetails(${provider.id})">View Details</button>`);
    marker.on('click', () => highlightProviderCard(provider.id));
    markers.push(marker);
}

// --- SEARCH & FILTER LOGIC ---
function initializeEventListeners() {
    const input = document.getElementById('searchInput');
    const suggestionBox = document.getElementById('searchSuggestions');
    
    input.addEventListener('input', function(e) {
        const val = e.target.value.toLowerCase().trim();
        suggestionBox.innerHTML = '';
        if(val.length < 1) { suggestionBox.style.display = 'none'; return; }
        
        // Match Categories (e -> Electrician)
        const allServices = [...new Set(providers.map(p => p.service))];
        const matchedServices = allServices.filter(s => s.toLowerCase().startsWith(val) || s.toLowerCase().includes(val));
        
        // Match Shops
        const matchedShops = providers.filter(p => p.name.toLowerCase().includes(val));

        let html = '';
        if(matchedServices.length > 0) {
            html += `<div class="suggestion-header">Categories</div>`;
            matchedServices.forEach(s => html += `<div class="suggestion-item" onclick="selectSearchCategory('${s}')">${getServiceDisplayName(s)}</div>`);
        }
        if(matchedShops.length > 0) {
            html += `<div class="suggestion-header">Shops</div>`;
            matchedShops.forEach(p => html += `<div class="suggestion-item" onclick="selectSearchShop(${p.id})"><span>${p.name}</span><small>${getServiceDisplayName(p.service)}</small></div>`);
        }
        
        if(html) { suggestionBox.innerHTML = html; suggestionBox.style.display = 'block'; }
        else { suggestionBox.style.display = 'none'; }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestionBox.contains(e.target)) suggestionBox.style.display = 'none';
    });

    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('locateMe').addEventListener('click', () => locateUser());
    document.getElementById('resetMapBtn').addEventListener('click', resetMapView);
    
    // Auth & Modals
    document.getElementById('loginBtnNav').onclick = () => document.getElementById('loginModal').style.display = 'block';
    document.getElementById('registerBtnNav').onclick = () => document.getElementById('registerModal').style.display = 'block';
    document.getElementById('logoutBtn').onclick = logout;
    document.getElementById('adminPanelBtn').onclick = openAdminPanel;
    document.getElementById('notificationWrapper').onclick = toggleNotifications;

    document.getElementById('loginForm').onsubmit = handleLogin;
    document.getElementById('registerForm').onsubmit = handleRegister;
    document.getElementById('requestForm').onsubmit = handleSubmitRequest;
    document.getElementById('sendRequestBtn').onclick = openRequestModal;
    document.getElementById('getDirectionsBtn').onclick = () => routeMeToShop(currentDetailId);

    document.querySelectorAll('.close').forEach(b => b.onclick = () => document.querySelectorAll('.modal').forEach(m => m.style.display='none'));
}

window.selectSearchCategory = function(service) {
    document.getElementById('searchInput').value = getServiceDisplayName(service);
    document.getElementById('searchSuggestions').style.display = 'none';
    showCategoryOnMap(service);
    if(window.innerWidth <= 768) document.querySelector('.sidebar').classList.add('expanded');
};

window.selectSearchShop = function(id) {
    document.getElementById('searchSuggestions').style.display = 'none';
    showSingleShopOnMap(id);
    showProviderDetails(id);
    if(window.innerWidth <= 768) document.querySelector('.sidebar').classList.remove('expanded');
};

function applyFilters() {
    const serviceType = document.getElementById('serviceType').value;
    if (serviceType !== 'all') {
        showCategoryOnMap(serviceType);
    } else {
        clearMapMarkers();
        providers.forEach(addMarkerToMap);
        const container = document.getElementById('providersContainer');
        container.innerHTML = '';
        providers.forEach(p => createProviderCard(p, container));
    }
}

// --- REQUEST SYSTEM ---
function openRequestModal() {
    if (!currentUser) { alert("Please Login to send a request."); return; }
    document.getElementById('providerDetailsModal').style.display = 'none';
    document.getElementById('requestModal').style.display = 'block';
    document.getElementById('reqProviderId').value = currentDetailId;
    document.getElementById('reqName').value = currentUser.username; 
}

async function handleSubmitRequest(e) {
    e.preventDefault();
    if(!userLocation) {
        alert("Locating you...");
        locateUser((success) => { if(success) handleSubmitRequest(e); });
        return;
    }

    const data = {
        providerId: document.getElementById('reqProviderId').value,
        userId: currentUser.id,
        userName: document.getElementById('reqName').value,
        userPhone: document.getElementById('reqPhone').value,
        userAddress: document.getElementById('reqAddress').value,
        userLat: userLocation.lat,
        userLng: userLocation.lng
    };

    try {
        const res = await fetch('/api/requests', { method: 'POST', body: JSON.stringify(data) });
        const result = await res.json();
        if(result.success) {
            document.getElementById('requestModal').style.display = 'none';
            alert("Request Sent! Wait for provider response.");
            trackRequestStatus(result.requestId);
        }
    } catch(err) { console.error(err); }
}

function trackRequestStatus(reqId) {
    const display = document.getElementById('requestStatusDisplay');
    const text = document.getElementById('reqStatusText');
    const icon = document.getElementById('reqStatusIcon');
    if(currentRequestStatusTimer) clearInterval(currentRequestStatusTimer);

    document.getElementById('providerDetailsModal').style.display = 'block';
    display.style.display = 'block';
    
    currentRequestStatusTimer = setInterval(async () => {
        const res = await fetch(`/api/requests?requestId=${reqId}`);
        const data = await res.json();
        
        let iconHtml = '';
        if(data.status === 'sent') iconHtml = '<i class="fas fa-check tick-gray"></i>';
        if(data.status === 'delivered') iconHtml = '<i class="fas fa-check-double tick-delivered"></i>';
        if(data.status === 'seen') iconHtml = '<i class="fas fa-check-double tick-blue"></i>'; 
        if(data.status === 'accepted') {
            iconHtml = '<i class="fas fa-check-double tick-blue"></i> (Accepted)';
            alert("Provider Accepted! Viewing Route...");
            clearInterval(currentRequestStatusTimer);
        }
        text.textContent = data.status.toUpperCase();
        icon.innerHTML = iconHtml;
    }, 3000);
}

async function checkNotifications() {
    if(!currentUser || currentUser.role !== 'provider') return;
    const res = await fetch(`/api/requests?providerId=${currentUser.id}`);
    const requests = await res.json();
    const badge = document.getElementById('notifBadge');
    if(requests.length > 0) {
        badge.textContent = requests.length;
        badge.style.display = 'block';
        const list = document.getElementById('notifList');
        list.innerHTML = '';
        requests.forEach(r => {
            const div = document.createElement('div');
            div.className = 'notif-item';
            div.innerHTML = `<strong>${r.user_name}</strong> - ${r.status}<br><small>${r.user_address}</small>`;
            div.onclick = () => openProviderRequestView(r);
            list.appendChild(div);
        });
    }
}

function openProviderRequestView(reqData) {
    fetch('/api/requests', { method: 'PATCH', body: JSON.stringify({ requestId: reqData.id, status: 'seen' }) });
    const choice = confirm(`Request from ${reqData.user_name}\nPhone: ${reqData.user_phone}\n\nShow Route to User?`);
    if(choice) {
        const myShop = providers.find(p => p.ownerId === currentUser.id);
        if(myShop) executeRouting({ lat: myShop.lat, lng: myShop.lng }, { lat: reqData.user_lat, lng: reqData.user_lng });
    }
}

function toggleNotifications() {
    const d = document.getElementById('notificationDropdown');
    d.style.display = d.style.display === 'block' ? 'none' : 'block';
}

// --- CHATBOT ---
function initChatbot() {
    const input = document.getElementById('chatInput');
    document.getElementById('sendChatBtn').onclick = () => handleChat(input.value);
    document.getElementById('chatbotToggle').onclick = () => document.getElementById('chatWindow').classList.toggle('open');
    document.getElementById('closeChatBtn').onclick = () => document.getElementById('chatWindow').classList.remove('open');
}

function handleChat(msg) {
    if(!msg) return;
    const div = document.createElement('div');
    div.className = 'message-bubble user-msg';
    div.innerHTML = msg;
    document.getElementById('chatMessages').appendChild(div);
    document.getElementById('chatInput').value = '';
    
    const lower = msg.toLowerCase();
    let reply = "", recommendedService = "";

    if(lower.includes('leak') || lower.includes('pipe') || lower.includes('water')) recommendedService = 'plumber';
    else if(lower.includes('light') || lower.includes('wire') || lower.includes('fan')) recommendedService = 'electrician';
    else if(lower.includes('wood') || lower.includes('door')) recommendedService = 'carpenter';
    else if(lower.includes('car') || lower.includes('start')) recommendedService = 'mechanic';
    else if(lower.includes('ac') || lower.includes('hot')) recommendedService = 'ac_repair';

    if(recommendedService) {
        const best = providers.filter(p => p.service === recommendedService).sort((a,b) => b.rating - a.rating)[0];
        if(best) reply = `I recommend <b>${best.name}</b> (${best.rating} stars) for ${recommendedService}. <button class="btn-secondary" onclick="selectSearchShop(${best.id})">View Shop</button>`;
        else reply = `You need a ${recommendedService}, but no shops are listed.`;
    } else {
        reply = "Try asking about 'leaks', 'wiring', 'woodwork' or 'car issues'.";
    }
    
    setTimeout(() => {
        const bDiv = document.createElement('div');
        bDiv.className = 'message-bubble bot-msg';
        bDiv.innerHTML = reply;
        document.getElementById('chatMessages').appendChild(bDiv);
    }, 500);
}

// --- MAP UTILS ---
function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([31.4880, 74.3430], 15);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
}

function locateUser(cb) {
    if(!navigator.geolocation) { alert("Geo not supported"); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if(window.userMarker) map.removeLayer(window.userMarker);
        window.userMarker = L.marker([userLocation.lat, userLocation.lng], {
            icon: L.divIcon({className: 'user-marker', html: '<i class="fas fa-dot-circle" style="color:blue; font-size:20px;"></i>'})
        }).addTo(map).bindPopup("You are Here");
        map.setView([userLocation.lat, userLocation.lng], 16);
        if(cb) cb(true);
    }, () => { alert("Location access denied"); if(cb) cb(false); });
}

function executeRouting(start, end) {
    if(routingControl) map.removeControl(routingControl);
    routingControl = L.Routing.control({
        waypoints: [L.latLng(start.lat, start.lng), L.latLng(end.lat, end.lng)],
        routeWhileDragging: false
    }).addTo(map);
}

function routeMeToShop(shopId) {
    if(!userLocation) { locateUser(() => routeMeToShop(shopId)); return; }
    const shop = providers.find(p => p.id === shopId);
    executeRouting(userLocation, shop);
}

// --- AUTH MOCK ---
async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value;
    const p = document.getElementById('loginPassword').value;
    const res = await fetch(`/api/users?username=${u}&password=${p}`);
    const data = await res.json();
    if(res.ok) {
        currentUser = data;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
        checkAuthSession();
        document.getElementById('loginModal').style.display = 'none';
        if(data.role === 'provider') setInterval(checkNotifications, 5000); 
    } else alert("Login Failed");
}

function handleRegister(e) {
    e.preventDefault();
    alert("Use API implementation from previous steps for real registration.");
}

function checkAuthSession() {
    const s = localStorage.getItem(CURRENT_USER_KEY);
    if(s) {
        currentUser = JSON.parse(s);
        document.getElementById('loggedOutView').style.display = 'none';
        document.getElementById('loggedInView').style.display = 'flex';
        document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username}`;
        if(currentUser.role === 'admin') document.getElementById('adminPanelBtn').style.display = 'block';
        if(currentUser.role === 'provider') {
            document.getElementById('notificationWrapper').style.display = 'block';
            checkNotifications();
        }
    }
}

function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    location.reload();
}

function initializeMobileSidebar() {
    const sb = document.querySelector('.sidebar');
    const h = document.createElement('div');
    h.className = 'mobile-sidebar-handle';
    h.innerHTML = '<i class="fas fa-chevron-up"></i>';
    h.onclick = () => sb.classList.toggle('expanded');
    sb.appendChild(h);
}

function initDraggable() { /* Logic abbreviated, assume previous implementation */ }
function getServiceDisplayName(s) { const map = { 'electrician': 'Electrician', 'plumber': 'Plumber', 'carpenter': 'Carpenter', 'mechanic': 'Mechanic' }; return map[s] || s.charAt(0).toUpperCase() + s.slice(1); }
function isShopOpen() { return true; }
function highlightProviderCard(id) { 
    document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.provider-card[data-id="${id}"]`);
    if(card) { card.classList.add('active'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
let currentDetailId = null;
window.showProviderDetails = function(id) {
    currentDetailId = id;
    const p = providers.find(x => x.id === id);
    document.getElementById('detailName').textContent = p.name;
    document.getElementById('providerDetailsModal').style.display = 'block';
    document.getElementById('requestStatusDisplay').style.display = 'none';
}
window.resetMapView = function() {
    clearMapMarkers();
    renderFeaturedProviders();
    map.setView([31.4880, 74.3430], 15);
}
window.openAdminPanel = function() { document.getElementById('adminModal').style.display = 'block'; }
