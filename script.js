// Initialize the map variables
let map;
let satelliteLayer;
let osmLayer;
let currentLayer = 'osm';
let userLocation = null;
let searchAnchor = null; 
let providers = [];
let markers = [];
let searchRadiusCircle = null;
let isPickingLocation = false;
let tempMarker = null;
let routingControl = null;
let narratorEnabled = false;
let liveTrackingId = null; 
let currentRouteProfile = 'driving'; 

// --- API & GEOSERVER VARIABLES ---
let punjabLayer = null;
let newLayer = null; 
const DEFAULT_CENTER = { lat: 31.4880, lng: 74.3430 }; // Gulberg 3 Area
const CURRENT_USER_KEY = 'serviceCurrentUser';
let currentUser = null; 
const NGROK_HOST = "https://elusive-lashonda-unfountained.ngrok-free.dev";

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    initializeMobileSidebar(); 
    loadData(); 
    checkAuthSession(); 
    initChatbot(); 
    initDraggable(); 
    setInterval(checkNotifications, 10000);
});

// --- CLOUD FUNCTIONS ---
async function loadData() {
    try {
        const response = await fetch('/api/shops');
        const data = await response.json();
        if(Array.isArray(data)) {
            providers = data.map(p => ({...p, lat: parseFloat(p.lat), lng: parseFloat(p.lng)}));
        }
        renderInitialBest();
    } catch (error) { console.error("Error loading cloud data:", error); }
}

function renderInitialBest() {
    const container = document.getElementById('providersContainer');
    container.innerHTML = '';
    const grouped = {};
    providers.forEach(p => { if(!grouped[p.service]) grouped[p.service] = []; grouped[p.service].push(p); });
    let bestPicks = [];
    Object.keys(grouped).forEach(service => { grouped[service].sort((a,b) => b.rating - a.rating); bestPicks.push(grouped[service][0]); });
    bestPicks.sort((a,b) => b.rating - a.rating);
    const top4 = bestPicks.slice(0, 4);
    renderProvidersList(top4, true); 
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

async function login(username, password) {
    try {
        const response = await fetch(`/api/users?username=${username}&password=${password}`);
        const data = await response.json(); 
        if (response.ok) {
            currentUser = data;
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
            updateUIForUser();
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('loginForm').reset();
            alert(`Welcome back, ${data.role}!`);
            checkNotifications();
        } else { alert("Login Failed: " + (data.error || "Unknown Server Error")); }
    } catch (e) { console.error(e); alert("Network Error"); }
}

async function register(username, password, role, question, answer) {
    try {
        const userData = { username, password, role, securityQuestion: question, securityAnswer: answer };
        const response = await fetch('/api/users', { method: 'POST', body: JSON.stringify(userData) });
        const data = await response.json(); 
        if (response.ok) {
            currentUser = data;
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
            updateUIForUser();
            document.getElementById('registerModal').style.display = 'none';
            document.getElementById('registerForm').reset();
            alert("Account created successfully!");
        } else { alert("Registration Failed: " + (data.error || "Unknown Server Error")); }
    } catch (e) { console.error(e); alert("Network Error"); }
}

// --- INTERFACE LOGIC ---
function initializeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const handle = document.createElement('div');
    handle.className = 'mobile-sidebar-handle';
    handle.innerHTML = '<i class="fas fa-chevron-up"></i>';
    sidebar.insertBefore(handle, sidebar.firstChild);
    handle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
        const icon = handle.querySelector('i');
        if (sidebar.classList.contains('expanded')) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); } else { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    });
}

function initDraggable() {
    const headers = document.querySelectorAll('.draggable-header');
    headers.forEach(header => {
        const modalContent = header.closest('.modal-content') || header.closest('.chat-window');
        if(modalContent) dragElement(modalContent, header);
    });
}
function dragElement(element, handle) {
    let pos1=0,pos2=0,pos3=0,pos4=0;
    handle.onmousedown = dragMouseDown;
    function dragMouseDown(e) { e.preventDefault(); pos3=e.clientX; pos4=e.clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; }
    function elementDrag(e) { e.preventDefault(); pos1=pos3-e.clientX; pos2=pos4-e.clientY; pos3=e.clientX; pos4=e.clientY; element.style.top=(element.offsetTop-pos2)+"px"; element.style.left=(element.offsetLeft-pos1)+"px"; element.style.margin="0"; element.style.position="fixed"; element.style.transform="none"; }
    function closeDragElement() { document.onmouseup=null; document.onmousemove=null; }
}

function checkAuthSession() { const session = localStorage.getItem(CURRENT_USER_KEY); if (session) { currentUser = JSON.parse(session); updateUIForUser(); } else { updateUIForGuest(); } }
function logout() { if (confirm("Are you sure you want to log out?")) { currentUser = null; localStorage.removeItem(CURRENT_USER_KEY); updateUIForGuest(); document.getElementById('addProviderModal').style.display = 'none'; document.getElementById('adminModal').style.display = 'none'; } }

function updateUIForUser() {
    document.getElementById('loggedOutView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username}`;
    document.getElementById('addProviderBtn').style.display = 'none';
    document.getElementById('adminPanelBtn').style.display = 'none';
    document.getElementById('adminNotifBtn').style.display = 'none';
    document.getElementById('providerPanelBtn').style.display = 'none';

    if (currentUser.role === 'admin' || currentUser.role === 'provider') { document.getElementById('addProviderBtn').style.display = 'inline-block'; }
    if (currentUser.role === 'admin') { document.getElementById('adminPanelBtn').style.display = 'inline-block'; document.getElementById('adminNotifBtn').style.display = 'inline-block'; if(document.getElementById('adminGeoPanel')) document.getElementById('adminGeoPanel').style.display = 'block'; } else { if(document.getElementById('adminGeoPanel')) document.getElementById('adminGeoPanel').style.display = 'none'; }
    if (currentUser.role === 'provider') { document.getElementById('providerPanelBtn').style.display = 'inline-block'; }
}

function updateUIForGuest() {
    document.getElementById('loggedOutView').style.display = 'block';
    document.getElementById('loggedInView').style.display = 'none';
    document.getElementById('addProviderBtn').style.display = 'none';
    document.getElementById('adminPanelBtn').style.display = 'none';
    document.getElementById('adminNotifBtn').style.display = 'none';
    document.getElementById('providerPanelBtn').style.display = 'none';
    if(document.getElementById('adminGeoPanel')) document.getElementById('adminGeoPanel').style.display = 'none';
}

window.copyToClipboard = function(text) { navigator.clipboard.writeText(text).then(() => alert("Coordinates copied: " + text)); };

function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    searchAnchor = { ...DEFAULT_CENTER };
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri, Maxar', maxZoom: 19 });
    osmLayer.addTo(map);
    map.on('click', function(e) { if (isPickingLocation) confirmLocationPick(e.latlng); });
}

function initializeEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') performSearch(); });
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('seeMoreBtn').addEventListener('click', showAllFilteredShops);
    document.getElementById('searchRadius').addEventListener('change', applyFilters);
    document.getElementById('locateMe').addEventListener('click', () => locateUser());
    document.getElementById('resetMapBtn').addEventListener('click', resetMapView);
    document.getElementById('setOsmMap').addEventListener('click', () => setBasemap('osm'));
    document.getElementById('setSatelliteMap').addEventListener('click', () => setBasemap('satellite'));
    document.getElementById('toggleNarratorBtn').addEventListener('click', toggleNarrator);
    document.getElementById('toggleRouteInfoBtn').addEventListener('click', toggleRouteWindow);
    document.getElementById('togglePunjabBtn').addEventListener('click', togglePunjabLayer);
    const newLayerBtn = document.getElementById('toggleNewLayerBtn');
    if (newLayerBtn) newLayerBtn.addEventListener('click', toggleNewLayer);
    const radiusSlider = document.getElementById('searchRadius');
    if (radiusSlider) { radiusSlider.addEventListener('input', function() { document.getElementById('radiusValue').textContent = `${this.value} km`; updateMapRadius(parseFloat(this.value)); }); }

    document.getElementById('addProviderBtn').addEventListener('click', () => openAddProviderModal());
    document.getElementById('cancelAdd').addEventListener('click', closeAddProviderModal);
    document.getElementById('providerForm').addEventListener('submit', handleProviderSubmit);
    document.getElementById('pickLocationBtn').addEventListener('click', toggleLocationPicker);
    
    // REQUEST & ROUTING
    document.getElementById('sendRequestBtn').addEventListener('click', openServiceRequestModal);
    document.getElementById('serviceRequestForm').addEventListener('submit', submitServiceRequest);
    document.getElementById('getDirectionsBtn').addEventListener('click', function() { if(currentDetailId) routeToShop(currentDetailId); });
    
    // MODIFY/DELETE PROVIDER
    document.getElementById('deleteProviderBtn').addEventListener('click', deleteCurrentProvider);
    document.getElementById('editProviderBtn').addEventListener('click', editCurrentProvider);

    document.getElementById('helpBtnNav').addEventListener('click', () => { document.getElementById('helpModal').style.display = 'block'; document.getElementById('helpRole').value = 'new'; });
    document.getElementById('helpBtnUser').addEventListener('click', () => { document.getElementById('helpModal').style.display = 'block'; document.getElementById('helpRole').value = 'user'; });
    document.getElementById('helpForm').addEventListener('submit', submitHelpForm);
    
    document.getElementById('loginBtnNav').addEventListener('click', () => document.getElementById('loginModal').style.display = 'block');
    document.getElementById('registerBtnNav').addEventListener('click', () => document.getElementById('registerModal').style.display = 'block');
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    document.getElementById('adminPanelBtn').addEventListener('click', openAdminPanel);
    document.getElementById('adminNotifBtn').addEventListener('click', openAdminNotifications);
    document.getElementById('statUsers').addEventListener('click', renderAdminUserList);
    document.getElementById('statShops').addEventListener('click', renderAdminShopList);
    document.getElementById('providerPanelBtn').addEventListener('click', openProviderRequests);
    
    document.getElementById('loginForm').addEventListener('submit', function(e) { e.preventDefault(); login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); });
    document.getElementById('registerForm').addEventListener('submit', function(e) { e.preventDefault(); register(document.getElementById('regUsername').value, document.getElementById('regPassword').value, document.getElementById('regRole').value, document.getElementById('regSecurityQuestion').value, document.getElementById('regSecurityAnswer').value); });
    
    document.querySelectorAll('.close').forEach(closeBtn => { closeBtn.addEventListener('click', function() { document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none'); }); });
    window.addEventListener('click', function(event) { document.querySelectorAll('.modal').forEach(modal => { if (event.target === modal) modal.style.display = 'none'; }); });
}

function handleSearchInput(e) {
    const val = e.target.value.toLowerCase();
    const suggestions = document.getElementById('searchSuggestions');
    suggestions.innerHTML = ''; suggestions.style.display = 'none';
    if (!val) return;
    const keywords = [{ key: 'e', match: 'Electrician' }, { key: 'c', match: 'Carpenter' }, { key: 'c', match: 'Mechanic' }, { key: 'p', match: 'Plumber' }, { key: 'w', match: 'Welder' }];
    const keywordMatches = keywords.filter(k => k.key.startsWith(val) || val.startsWith(k.key)).map(m => m.match);
    const nameMatches = providers.filter(p => p.name.toLowerCase().includes(val)).map(p => p.name);
    const unique = [...new Set([...keywordMatches, ...nameMatches])];
    if (unique.length > 0) {
        suggestions.style.display = 'block';
        unique.forEach(svc => {
            const div = document.createElement('div'); div.className = 'suggestion-item'; div.textContent = svc;
            div.onclick = () => { document.getElementById('searchInput').value = svc; suggestions.style.display = 'none'; performSearch(); };
            suggestions.appendChild(div);
        });
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    document.getElementById('searchSuggestions').style.display = 'none';
    if (!query) return;
    const filtered = providers.filter(provider => provider.name.toLowerCase().includes(query) || provider.service.toLowerCase().includes(query) || getServiceDisplayName(provider.service).toLowerCase().includes(query));
    if (filtered.length > 0) {
        currentFilteredProviders = filtered;
        renderProvidersList(filtered, filtered.length > 4);
        addProvidersToMap(filtered);
        const best = filtered[0]; map.setView([best.lat, best.lng], 16); highlightProviderCard(best.id);
        const mapSvc = { 'electrician':'electrician', 'plumber':'plumber', 'mechanic':'mechanic', 'carpenter':'carpenter', 'painter':'painter', 'ac repair':'ac_repair', 'welder':'welder', 'car/bike wash':'carwash' };
        for(let key in mapSvc) { if(query.includes(key)) document.getElementById('serviceType').value = mapSvc[key]; }
    } else { alert("No shops found matching '" + query + "'"); }
}

async function submitHelpForm(e) {
    e.preventDefault();
    const name = document.getElementById('helpName').value;
    const role = document.getElementById('helpRole').value;
    const prob = document.getElementById('helpProblem').value;
    try {
        const res = await fetch('/api/requests', { method: 'POST', body: JSON.stringify({ type: 'help', userName: name, userAddress: role, userLat: 0, userLng: 0, providerId: 0, userPhone: prob }) });
        if(res.ok) { alert("Message sent to Admin!"); document.getElementById('helpModal').style.display='none'; document.getElementById('helpForm').reset(); }
    } catch(err) { console.error(err); alert("Failed to send."); }
}

function openAdminPanel() {
    document.getElementById('adminTotalUsers').textContent = "Click to View";
    document.getElementById('adminTotalShops').textContent = providers.length;
    document.getElementById('adminListSection').style.display = 'none'; 
    document.getElementById('adminModal').style.display = 'block';
}

async function openAdminNotifications() {
    document.getElementById('adminNotifModal').style.display = 'block';
    const container = document.getElementById('adminNotifListContainer');
    container.innerHTML = '<div style="padding:10px;text-align:center;">Loading...</div>';
    try {
        const res = await fetch('/api/requests?providerId=0');
        const msgs = await res.json();
        container.innerHTML = '';
        if(msgs.length === 0) { container.innerHTML = '<div style="padding:15px; text-align:center;">No notifications.</div>'; return; }
        msgs.forEach(m => {
            const div = document.createElement('div'); div.className = 'admin-list-item';
            div.innerHTML = `<div><strong>${m.user_name}</strong> <span class="badge" style="position:static; background:#667eea;">${m.user_address}</span><br><small>${m.user_phone}</small></div>`;
            container.appendChild(div);
        });
    } catch(e) { container.innerHTML = 'Error loading notifications.'; }
}

async function renderAdminUserList() {
    const listSection = document.getElementById('adminListSection');
    const container = document.getElementById('adminListContainer');
    document.getElementById('adminListTitle').textContent = "All Users";
    listSection.style.display = 'block'; container.innerHTML = 'Loading...';
    try {
        const response = await fetch('/api/users?action=list');
        const users = await response.json();
        document.getElementById('adminTotalUsers').textContent = users.length;
        container.innerHTML = '';
        if (users.length === 0) container.innerHTML = 'No users found.';
        users.forEach(user => {
            const item = document.createElement('div'); item.className = 'admin-list-item';
            item.innerHTML = `<div class="item-info"><strong>${user.username}</strong><small>${user.role}</small></div><div><button class="btn-sm-danger" onclick="adminDeleteUser(${user.id})">Delete</button></div>`;
            container.appendChild(item);
        });
    } catch (error) { container.innerHTML = 'Error fetching users.'; }
}

function renderAdminShopList() {
    const listSection = document.getElementById('adminListSection');
    const container = document.getElementById('adminListContainer');
    document.getElementById('adminListTitle').textContent = "All Shops";
    listSection.style.display = 'block'; container.innerHTML = '';
    if (providers.length === 0) { container.innerHTML = 'No shops found.'; return; }
    providers.forEach(p => {
        const item = document.createElement('div'); item.className = 'admin-list-item';
        item.innerHTML = `<div class="item-info"><strong>${p.name}</strong><small>${getServiceDisplayName(p.service)}</small></div><div><button class="btn-sm-danger" onclick="adminDeleteShop(${p.id})">Delete</button></div>`;
        container.appendChild(item);
    });
}

// RESTORED: Admin Delete Functions
function adminDeleteUser(id) { alert("Delete User functionality (ID: " + id + ") requires DELETE API endpoint."); }
function adminDeleteShop(id) { alert("Delete Shop functionality (ID: " + id + ") requires DELETE API endpoint."); }

function openServiceRequestModal() {
    if(!currentUser) { alert("Please login to send a request."); return; }
    if(!currentDetailId) return;
    document.getElementById('reqProviderId').value = currentDetailId;
    document.getElementById('providerDetailsModal').style.display = 'none';
    document.getElementById('serviceRequestModal').style.display = 'block';
    document.getElementById('reqName').value = currentUser.username;
}

async function submitServiceRequest(e) {
    e.preventDefault();
    if(!userLocation) { alert("We need your location."); locateUser(() => submitServiceRequest(e)); return; }
    const data = { providerId: document.getElementById('reqProviderId').value, userId: currentUser.id, userName: document.getElementById('reqName').value, userPhone: document.getElementById('reqPhone').value, userAddress: document.getElementById('reqAddress').value, userLat: userLocation.lat, userLng: userLocation.lng };
    try {
        const res = await fetch('/api/requests', { method: 'POST', body: JSON.stringify(data) });
        if(res.ok) { alert("Request Sent!"); document.getElementById('serviceRequestModal').style.display = 'none'; }
    } catch(err) { alert("Error sending request."); }
}

async function checkNotifications() {
    if(!currentUser) return;
    if(currentUser.role === 'admin') { try { const res = await fetch('/api/requests?providerId=0'); const msgs = await res.json(); document.getElementById('adminNotifBadge').textContent = msgs.length; if(msgs.length > 0) document.getElementById('adminNotifBadge').style.display = 'block'; } catch(e) {} }
    if(currentUser.role === 'provider') { try { const res = await fetch(`/api/requests?providerId=${currentUser.id}`); const reqs = await res.json(); const pending = reqs.filter(r => r.status === 'sent'); document.getElementById('reqBadge').textContent = pending.length; } catch(e) {} }
}

async function openProviderRequests() {
    const modal = document.getElementById('providerRequestsModal');
    const container = document.getElementById('requestsListContainer');
    modal.style.display = 'block'; container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`/api/requests?providerId=${currentUser.id}`);
        const list = await res.json();
        container.innerHTML = '';
        if(list.length === 0) container.innerHTML = 'No requests.';
        list.forEach(req => {
            const item = document.createElement('div'); item.className = 'admin-list-item';
            item.innerHTML = `<div><strong>${req.user_name}</strong> (${req.user_phone})<br>${req.user_address||''}<br><small>Status: ${req.status}</small></div><div><button class="btn-primary" onclick="acceptRequest(${req.id}, ${req.user_lat}, ${req.user_lng})" style="padding:5px;">Route</button></div>`;
            container.appendChild(item);
        });
    } catch(e) { container.innerHTML = 'Error.'; }
}

window.acceptRequest = async function(reqId, lat, lng) {
    await fetch('/api/requests', { method: 'PATCH', body: JSON.stringify({ requestId: reqId, status: 'seen' }) });
    document.getElementById('providerRequestsModal').style.display = 'none';
    const myShop = providers.find(p => p.ownerId === currentUser.id);
    if(myShop) {
        if (routingControl) map.removeControl(routingControl);
        routingControl = L.Routing.control({ waypoints: [ L.latLng(myShop.lat, myShop.lng), L.latLng(lat, lng) ], router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }), lineOptions: { styles: [{color: '#667eea', opacity: 1, weight: 5}] } }).addTo(map);
        map.closePopup(); alert("Routing to Customer Location...");
    }
};

let currentFilteredProviders = [];
function applyFilters() {
    const serviceType = document.getElementById('serviceType').value;
    const minRating = parseFloat(document.getElementById('ratingFilter').value);
    const radiusKm = parseFloat(document.getElementById('searchRadius').value);
    const centerPoint = L.latLng(searchAnchor.lat, searchAnchor.lng);
    currentFilteredProviders = providers.filter(p => {
        const matchService = (serviceType === 'all') || (p.service === serviceType);
        const matchRating = (p.rating >= minRating);
        const providerPoint = L.latLng(p.lat, p.lng);
        const distanceMeters = centerPoint.distanceTo(providerPoint);
        const matchDistance = distanceMeters <= (radiusKm * 1000);
        return matchService && matchRating && matchDistance;
    });
    if(serviceType !== 'all') { renderProvidersList(currentFilteredProviders, false); addProvidersToMap(currentFilteredProviders); } else { renderInitialBest(); }
}

function showAllFilteredShops() { renderProvidersList(currentFilteredProviders, false); addProvidersToMap(currentFilteredProviders); }

function renderProvidersList(listToRender, showSeeMore = false) {
    const container = document.getElementById('providersContainer'); container.innerHTML = '';
    const seeMoreBtn = document.getElementById('seeMoreBtn');
    if(listToRender.length === 0) { container.innerHTML = "<p style='text-align:center; color:#666;'>No shops found.</p>"; seeMoreBtn.style.display='none'; return; }
    listToRender.forEach(provider => {
         const card = document.createElement('div'); card.className = 'provider-card'; card.setAttribute('data-id', provider.id);
         const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
         const isOpen = isShopOpen(provider.openTime, provider.closeTime);
         card.innerHTML = `<div class="provider-header"><div><div class="provider-name">${provider.name}</div><span class="provider-service">${getServiceDisplayName(provider.service)}</span></div></div><div class="provider-rating"><span class="stars">${stars}</span><span>${provider.rating}</span><span class="status-badge ${isOpen?'status-open':'status-closed'}">${isOpen?'Open':'Closed'}</span></div><div class="provider-address"><i class="fas fa-map-marker-alt"></i> ${provider.address}</div>`;
         card.addEventListener('click', function() { showSingleProviderOnMap(provider); highlightProviderCard(provider.id); });
         container.appendChild(card);
    });
    seeMoreBtn.style.display = showSeeMore ? 'block' : 'none';
}

function showSingleProviderOnMap(provider) {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    const marker = L.marker([provider.lat, provider.lng]).addTo(map).bindPopup(createPopupContent(provider)).openPopup();
    marker.providerId = provider.id; markers.push(marker);
    map.setView([provider.lat, provider.lng], 16);
}

function addProvidersToMap(listToRender) {
    markers.forEach(marker => map.removeLayer(marker)); markers = [];
    listToRender.forEach(provider => {
        const marker = L.marker([provider.lat, provider.lng]).addTo(map).bindPopup(createPopupContent(provider));
        marker.providerId = provider.id;
        marker.on('click', function() { marker.openPopup(); highlightProviderCard(provider.id); });
        markers.push(marker);
    });
}

function openAddProviderModal(editMode=false, provider=null) { document.getElementById('addProviderModal').style.display='block'; }
function closeAddProviderModal() { document.getElementById('addProviderModal').style.display='none'; }
function handleProviderSubmit(e) { /* existing logic */ }
function toggleLocationPicker() { isPickingLocation = true; document.getElementById('addProviderModal').style.display='none'; document.getElementById('locationPickerMessage').style.display='block'; document.body.style.cursor='crosshair'; }
function confirmLocationPick(latlng) { document.getElementById('newLat').value=latlng.lat.toFixed(6); document.getElementById('newLng').value=latlng.lng.toFixed(6); document.getElementById('locationStatus').textContent="Location Picked"; isPickingLocation=false; document.body.style.cursor='default'; document.getElementById('locationPickerMessage').style.display='none'; document.getElementById('addProviderModal').style.display='block'; }
function isShopOpen(open, close) { return true; }
function getServiceDisplayName(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function updateMapRadius(r) { if(searchRadiusCircle) map.removeLayer(searchRadiusCircle); searchRadiusCircle = L.circle([searchAnchor.lat, searchAnchor.lng], { color: '#667eea', fillColor: '#667eea', fillOpacity: 0.15, radius: r*1000 }).addTo(map); }
function setBasemap(l) { if(l==='osm'){ map.addLayer(osmLayer); map.removeLayer(satelliteLayer); } else { map.addLayer(satelliteLayer); map.removeLayer(osmLayer); } }
function toggleNarrator() { narratorEnabled=!narratorEnabled; }
function toggleRouteWindow() { document.querySelector('.leaflet-routing-container').classList.toggle('hidden-instructions'); }
function togglePunjabLayer() { /* ... */ }
function toggleNewLayer() { /* ... */ }
function initChatbot() { /* ... */ }

// MODIFIED: createPopupContent TO MATCH SCREENSHOT
function createPopupContent(provider) {
    const stars = '☆'.repeat(5); // Default 0 for demo or provider.rating logic
    // Structure matching screenshot: Title, Stars, Service (Icon + Text), View Details (Blue), Request (Grey)
    return `
    <div class="popup-content">
        <h3>${provider.name}</h3>
        <div class="popup-rating">${stars} (${provider.rating})</div>
        <div class="popup-service"><i class="fas fa-tools"></i> ${getServiceDisplayName(provider.service)}</div>
        <button class="popup-btn btn-blue" onclick="showProviderDetails(${provider.id})">View Details</button>
        <button class="popup-btn btn-grey" onclick="currentDetailId=${provider.id}; openServiceRequestModal();"><i class="fas fa-ticket-alt"></i> Request</button>
    </div>`;
}

function highlightProviderCard(id) { 
    currentDetailId = id; 
    document.querySelectorAll('.provider-card').forEach(card => card.classList.remove('active'));
    const activeCard = document.querySelector(`.provider-card[data-id="${id}"]`);
    if (activeCard) { activeCard.classList.add('active'); activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

let currentDetailId = null;
function showProviderDetails(id) {
    currentDetailId = id;
    const p = providers.find(x => x.id == id);
    if(!p) return;
    document.getElementById('detailName').textContent = p.name;
    document.getElementById('detailService').textContent = getServiceDisplayName(p.service);
    document.getElementById('detailAddress').textContent = p.address;
    document.getElementById('detailRating').textContent = p.rating;
    
    // RESTORED: Image Display
    const imgContainer = document.getElementById('detailImageContainer');
    if (p.image) { document.getElementById('detailImage').src = p.image; imgContainer.style.display = 'block'; } else { imgContainer.style.display = 'none'; }
    
    // RESTORED: Modify/Delete Shop Buttons logic
    const ownerActions = document.getElementById('ownerActions');
    if (currentUser && (p.ownerId == currentUser.id)) { ownerActions.style.display = 'flex'; } else { ownerActions.style.display = 'none'; }
    
    document.getElementById('providerDetailsModal').style.display = 'block';
}

function deleteCurrentProvider() {
    if(!currentDetailId) return;
    if(confirm("Are you sure you want to delete this shop?")) adminDeleteShop(currentDetailId);
}
function editCurrentProvider() {
    if(!currentDetailId) return;
    const p = providers.find(x => x.id == currentDetailId);
    if(p) { document.getElementById('providerDetailsModal').style.display='none'; openAddProviderModal(true, p); }
}

// RESTORED: Route Function
function routeToShop(providerId) {
    if (!userLocation) { alert("We need your location first. Please allow access."); locateUser(function() { routeToShop(providerId); }); return; }
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    if (routingControl) map.removeControl(routingControl);
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    routingControl = L.Routing.control({
        waypoints: [L.latLng(userLocation.lat, userLocation.lng), L.latLng(provider.lat, provider.lng)],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
        lineOptions: { styles: [{color: '#667eea', opacity: 1, weight: 5}] }
    }).addTo(map);
}

function locateUser(cb) {
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => {
        userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
        searchAnchor = userLocation;
        if(window.userMarker) map.removeLayer(window.userMarker);
        const content = `<div style="text-align:center;"><b>You are here</b><br>${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}<br><button onclick="window.copyToClipboard('${userLocation.lat}, ${userLocation.lng}')" style="margin-top:5px; padding:2px 8px; font-size:0.8rem; cursor:pointer; border:1px solid #ccc; background:#f0f0f0; border-radius:4px;"><i class="fas fa-copy"></i> Copy</button></div>`;
        window.userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup(content).openPopup();
        map.setView([userLocation.lat, userLocation.lng], 16);
        if(cb) cb();
    });
}
function resetMapView() { renderInitialBest(); map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16); }
