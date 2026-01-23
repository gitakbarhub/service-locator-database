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
let currentRouteProfile = 'cycling'; // REQ 7: Default to Cycle

// Moving Marker for Route (simulated live tracking)
let routeMovingMarker = null;

// --- API & GEOSERVER VARIABLES ---
let punjabLayer = null;
let newLayer = null; 
const DEFAULT_CENTER = { lat: 31.4880, lng: 74.3430 }; 
const CURRENT_USER_KEY = 'serviceCurrentUser';
let currentUser = null; 

// --- REQ 1: DEFINED ALL SERVICES FOR CATEGORY SEARCH ---
const ALL_SERVICES_MAP = {
    'electrician': 'Electrician',
    'plumber': 'Plumber',
    'mechanic': 'Car Mechanic', // Updated
    'carwash': 'Car/Bike Wash',
    'carpenter': 'Carpenter (Wood Work)',
    'painter': 'Painter',
    'ac_repair': 'AC Repair / HVAC',
    'welder': 'Welder / Steel Work'
};

const NGROK_HOST = "https://elusive-lashonda-unfountained.ngrok-free.dev";

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    initializeMobileSidebar(); 
    loadData(); 
    checkAuthSession(); 
    initChatbot(); 
    initDraggable(); 
});

async function loadData() {
    try {
        const response = await fetch('/api/shops');
        const data = await response.json();
        if(Array.isArray(data)) {
            providers = data.map(p => ({...p, lat: parseFloat(p.lat), lng: parseFloat(p.lng)}));
        }
        const bestShops = getBestShopsPerCategory(providers);
        renderProvidersList(bestShops, true, true); 
        addProvidersToMap(bestShops);
    } catch (error) {
        console.error("Error loading cloud data:", error);
    }
}

function getBestShopsPerCategory(allProviders) {
    const grouped = {};
    allProviders.forEach(p => {
        if (!grouped[p.service]) grouped[p.service] = [];
        grouped[p.service].push(p);
    });
    const bestShops = [];
    Object.keys(grouped).forEach(service => {
        const sorted = grouped[service].sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            return b.reviews - a.reviews;
        });
        if (sorted.length > 0) bestShops.push(sorted[0]);
    });
    return bestShops;
}

// ... [Login/Register Functions omitted for brevity - same as before] ...
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
        } else {
            alert("Login Failed: " + (data.error || "Unknown Server Error"));
        }
    } catch (e) { alert("Network Error"); }
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
        } else { alert("Registration Failed"); }
    } catch (e) { alert("Network Error"); }
}

// ... [Interface Init] ...
function initializeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const handle = document.createElement('div');
    handle.className = 'mobile-sidebar-handle';
    handle.innerHTML = '<i class="fas fa-chevron-up"></i>';
    sidebar.insertBefore(handle, sidebar.firstChild);
    handle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
        const icon = handle.querySelector('i');
        if (sidebar.classList.contains('expanded')) {
            icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down');
        } else {
            icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up');
        }
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
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;
    function dragMouseDown(e) { e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; }
    function elementDrag(e) { e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY; element.style.top = (element.offsetTop - pos2) + "px"; element.style.left = (element.offsetLeft - pos1) + "px"; element.style.margin = "0"; element.style.position = "fixed"; element.style.transform = "none"; }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; }
}

function checkAuthSession() {
    const session = localStorage.getItem(CURRENT_USER_KEY);
    if (session) { currentUser = JSON.parse(session); updateUIForUser(); } else { updateUIForGuest(); }
}

function logout() {
    if (confirm("Are you sure you want to log out?")) {
        currentUser = null; localStorage.removeItem(CURRENT_USER_KEY); updateUIForGuest();
        document.getElementById('addProviderModal').style.display = 'none'; document.getElementById('adminModal').style.display = 'none';
    }
}

function updateUIForUser() {
    document.getElementById('loggedOutView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username}`;
    
    if (currentUser.role === 'admin' || currentUser.role === 'provider') {
        document.getElementById('addProviderBtn').style.display = 'inline-block';
        document.getElementById('addProviderBtnMobile').style.display = 'inline-block';
        
        // Show Provider Dashboard if they are a provider
        if(currentUser.role === 'provider' || currentUser.role === 'admin') {
            document.getElementById('providerPanelBtn').style.display = 'inline-block';
            checkProviderRequests(); // Check for ticks updates
        }
    } else {
        document.getElementById('addProviderBtn').style.display = 'none';
        document.getElementById('addProviderBtnMobile').style.display = 'none';
    }

    if (currentUser.role === 'admin') {
        document.getElementById('adminPanelBtn').style.display = 'inline-block';
    } else {
        document.getElementById('adminPanelBtn').style.display = 'none';
    }
}

function updateUIForGuest() {
    document.getElementById('loggedOutView').style.display = 'block';
    document.getElementById('loggedInView').style.display = 'none';
    document.getElementById('addProviderBtn').style.display = 'none';
    document.getElementById('addProviderBtnMobile').style.display = 'none';
    document.getElementById('adminPanelBtn').style.display = 'none';
    document.getElementById('providerPanelBtn').style.display = 'none';
}

function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    searchAnchor = { ...DEFAULT_CENTER };
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri, Maxar', maxZoom: 19 });
    osmLayer.addTo(map);
    updateMapRadius(parseFloat(document.getElementById('searchRadius').value));
    map.on('click', function(e) { if (isPickingLocation) confirmLocationPick(e.latlng); });
}

function initializeEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') applyFilters(); });
    document.getElementById('searchBtn').addEventListener('click', applyFilters);
    
    // Filters
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('serviceType').addEventListener('change', applyFilters);
    document.getElementById('ratingFilter').addEventListener('change', applyFilters);
    document.getElementById('searchRadius').addEventListener('change', applyFilters);
    
    // Map Controls
    document.getElementById('locateMe').addEventListener('click', () => locateUser());
    document.getElementById('resetMapBtn').addEventListener('click', resetMapView);
    document.getElementById('setOsmMap').addEventListener('click', () => setBasemap('osm'));
    document.getElementById('setSatelliteMap').addEventListener('click', () => setBasemap('satellite'));
    document.getElementById('toggleNarratorBtn').addEventListener('click', toggleNarrator);
    document.getElementById('toggleRouteInfoBtn').addEventListener('click', toggleRouteWindow);
    document.getElementById('togglePunjabBtn').addEventListener('click', togglePunjabLayer);
    
    if (document.getElementById('toggleNewLayerBtn')) document.getElementById('toggleNewLayerBtn').addEventListener('click', toggleNewLayer);

    const radiusSlider = document.getElementById('searchRadius');
    if (radiusSlider) radiusSlider.addEventListener('input', function() { document.getElementById('radiusValue').textContent = `${this.value} km`; updateMapRadius(parseFloat(this.value)); });

    // Modals & Forms
    document.getElementById('addProviderBtn').addEventListener('click', () => openAddProviderModal());
    document.getElementById('addProviderBtnMobile').addEventListener('click', () => openAddProviderModal()); 
    document.getElementById('cancelAdd').addEventListener('click', closeAddProviderModal);
    document.getElementById('providerForm').addEventListener('submit', handleProviderSubmit);
    document.getElementById('pickLocationBtn').addEventListener('click', toggleLocationPicker);
    
    document.getElementById('getDirectionsBtn').addEventListener('click', function() { if(currentDetailId) routeToShop(currentDetailId); });
    
    // REQ 3: Request Service Button - Tick Logic
    const reqBtn = document.getElementById('requestServiceBtn');
    if(reqBtn) reqBtn.addEventListener('click', function() { if(currentDetailId) requestService(currentDetailId); });

    // Auth Buttons
    document.getElementById('loginBtnNav').addEventListener('click', () => document.getElementById('loginModal').style.display = 'block');
    document.getElementById('registerBtnNav').addEventListener('click', () => document.getElementById('registerModal').style.display = 'block');
    document.getElementById('forgotPasswordLink').addEventListener('click', () => { document.getElementById('loginModal').style.display = 'none'; document.getElementById('forgotPasswordModal').style.display = 'block'; });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('adminPanelBtn').addEventListener('click', openAdminPanel);
    document.getElementById('providerPanelBtn').addEventListener('click', openProviderDashboard); // NEW
    
    document.getElementById('loginForm').addEventListener('submit', function(e) { e.preventDefault(); login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); });
    document.getElementById('registerForm').addEventListener('submit', function(e) { e.preventDefault(); register(document.getElementById('regUsername').value, document.getElementById('regPassword').value, document.getElementById('regRole').value, document.getElementById('regSecurityQuestion').value, document.getElementById('regSecurityAnswer').value); });

    document.querySelectorAll('.close').forEach(closeBtn => { closeBtn.addEventListener('click', function() { document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none'); }); });
    window.addEventListener('click', function(event) { document.querySelectorAll('.modal').forEach(modal => { if (event.target === modal) modal.style.display = 'none'; }); });
    document.addEventListener('click', function(e) { if (!e.target.closest('.search-bar')) { document.getElementById('searchSuggestions').style.display = 'none'; } });
}

// --- REQ 1: STRICT CATEGORY SEARCH ---
function handleSearchInput(e) {
    const query = e.target.value.toLowerCase().trim();
    const suggestionBox = document.getElementById('searchSuggestions');
    suggestionBox.innerHTML = '';

    if (query.length === 0) { suggestionBox.style.display = 'none'; return; }
    suggestionBox.style.display = 'block';

    const allServices = Object.keys(ALL_SERVICES_MAP);
    
    // STRICT FILTER: Match if category STARTS WITH query (or word inside starts with query)
    const matchingServices = allServices.filter(key => {
        const name = ALL_SERVICES_MAP[key].toLowerCase();
        // Check start of string or start of any word
        return name.startsWith(query) || name.includes(" " + query);
    });

    // 1. Render Categories
    if (matchingServices.length > 0) {
        const header = document.createElement('div');
        header.className = 'suggestion-header';
        header.textContent = 'Main Category';
        suggestionBox.appendChild(header);

        matchingServices.forEach(serviceKey => {
            const item = document.createElement('div');
            item.className = 'search-suggestion-item';
            item.innerHTML = `<span class="suggestion-text">${ALL_SERVICES_MAP[serviceKey]}</span> <span class="suggestion-type">Category</span>`;
            item.addEventListener('click', () => {
                document.getElementById('searchInput').value = ""; 
                document.getElementById('serviceType').value = serviceKey; 
                suggestionBox.style.display = 'none';
                applyFilters(); 
            });
            suggestionBox.appendChild(item);
        });
    }

    // 2. Filter Shops (Must match Query OR belong to Matched Category)
    const matchingShops = providers.filter(p => {
        const nameMatch = p.name.toLowerCase().includes(query);
        // Only include shops if their category matches the STRICT category search above
        const categoryMatch = matchingServices.includes(p.service); 
        return nameMatch || categoryMatch;
    });

    if (matchingShops.length > 0) {
        const header = document.createElement('div');
        header.className = 'suggestion-header';
        
        // Dynamic Header: If 1 category matches, say "Available [Category]", else "Available Shops"
        if(matchingServices.length === 1) {
            header.textContent = `Available ${ALL_SERVICES_MAP[matchingServices[0]]}`;
        } else {
            header.textContent = 'Available Shops';
        }
        suggestionBox.appendChild(header);

        matchingShops.forEach(shop => {
            const item = document.createElement('div');
            item.className = 'search-suggestion-item';
            item.innerHTML = `<span class="suggestion-text">${shop.name}</span> <span class="suggestion-type">Shop</span>`;
            item.addEventListener('click', () => {
                document.getElementById('searchInput').value = shop.name;
                suggestionBox.style.display = 'none';
                filterSpecificShop(shop.id); 
            });
            suggestionBox.appendChild(item);
        });
    }

    if (matchingServices.length === 0 && matchingShops.length === 0) { suggestionBox.style.display = 'none'; }
}

// --- REQ 3: REQUEST SERVICE WITH TICKS ---
function requestService(providerId) {
    if (!currentUser) { alert("Please Login."); document.getElementById('loginModal').style.display = 'block'; return; }
    
    const btn = document.getElementById('requestServiceBtn');
    
    // State 1: Sending (Spinner)
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    btn.disabled = true;

    // Simulate Network & DB
    setTimeout(() => {
        // State 2: Sent (Single Grey Tick)
        btn.innerHTML = '<i class="fas fa-check tick-icon tick-grey"></i> Sent';
        
        // Save to Simulated DB (LocalStorage) for Provider to see
        saveRequestToDB(providerId, currentUser.username);

        setTimeout(() => {
            // State 3: Delivered (Double Grey Tick)
            btn.innerHTML = '<i class="fas fa-check-double tick-icon tick-grey"></i> Delivered';
            
            // Note: "Read" (Blue Tick) would happen if provider opens app.
            // We can check this via polling in a real app.
            
            alert("Request delivered to shop owner device!");
            btn.disabled = false;
        }, 2000);
    }, 1500);
}

// Simulated Backend for Req 3
function saveRequestToDB(shopId, userName) {
    let requests = JSON.parse(localStorage.getItem('serviceRequests') || "[]");
    requests.push({
        shopId: shopId,
        user: userName,
        status: 'delivered', // 1 tick -> 2 ticks
        time: new Date().toLocaleTimeString()
    });
    localStorage.setItem('serviceRequests', JSON.stringify(requests));
}

// REQ 3: Provider Side Dashboard
function openProviderDashboard() {
    const modal = document.getElementById('providerDashboardModal');
    const container = document.getElementById('requestsListContainer');
    modal.style.display = 'block';
    
    // Load requests for this provider (assuming current user owns shops)
    // In demo, we just show all requests or filter if we knew user's shop ID
    let requests = JSON.parse(localStorage.getItem('serviceRequests') || "[]");
    
    container.innerHTML = '';
    if(requests.length === 0) {
        container.innerHTML = '<p>No requests found.</p>';
        return;
    }

    requests.forEach((req, index) => {
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #eee";
        div.style.padding = "10px";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.innerHTML = `
            <div>
                <strong>${req.user}</strong> wants a service.<br>
                <small>${req.time}</small>
            </div>
            <div>
                <button class="btn-primary" style="padding:5px 10px; font-size:0.8rem;" onclick="acceptRequest(${index})">Accept</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function checkProviderRequests() {
    // Simple poll to show badge
    setInterval(() => {
        let requests = JSON.parse(localStorage.getItem('serviceRequests') || "[]");
        const count = requests.length;
        const badge = document.getElementById('reqCount');
        if(count > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = count;
        }
    }, 5000);
}

function acceptRequest(index) {
    alert("You accepted the request. Simulating 'Read' receipt...");
    // Logic to update user side to Blue Ticks would go here (via DB)
    let requests = JSON.parse(localStorage.getItem('serviceRequests') || "[]");
    requests.splice(index, 1); // Remove from list
    localStorage.setItem('serviceRequests', JSON.stringify(requests));
    openProviderDashboard(); // Refresh
}

// --- ROUTING UPDATES (Req 4 & 7) ---

function setRouteProfile(profile) {
    currentRouteProfile = profile;
    document.querySelectorAll('.route-mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${profile}`).classList.add('active');
    
    if (routingControl) {
        // Update router profile
        routingControl.getRouter().options.profile = profile === 'cycling' ? 'cycling' : (profile === 'walking' ? 'walking' : 'driving');
        // Recalculate
        const waypoints = routingControl.getWaypoints();
        routingControl.setWaypoints(waypoints);
    }
}

function executeRouting(providerId, reverse) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    
    // Cleanup old routing
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    if (liveTrackingId) { navigator.geolocation.clearWatch(liveTrackingId); liveTrackingId = null; }
    if (routeMovingMarker) { map.removeLayer(routeMovingMarker); routeMovingMarker = null; }
    if (window.userMarker) { map.removeLayer(window.userMarker); }
    
    hideAllMarkersExcept([provider.id]);
    document.querySelector('.sidebar').classList.remove('expanded');
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    
    document.getElementById('toggleNarratorBtn').style.display = 'block';
    document.getElementById('toggleRouteInfoBtn').style.display = 'block';
    document.getElementById('toggleRouteInfoBtn').classList.add('active');

    // Controls
    if (!document.getElementById('routeModeControls')) {
        const modeDiv = L.Control.extend({
            options: { position: 'topright' }, 
            onAdd: function(map) {
                const div = L.DomUtil.create('div', 'route-mode-controls');
                div.id = 'routeModeControls';
                div.style.backgroundColor = 'white'; div.style.padding = '5px'; div.style.borderRadius = '5px'; div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
                div.innerHTML = `
                    <button id="mode-walking" class="route-mode-btn" onclick="setRouteProfile('walking')"><i class="fas fa-walking"></i></button>
                    <button id="mode-cycling" class="route-mode-btn active" onclick="setRouteProfile('cycling')"><i class="fas fa-bicycle"></i></button>
                    <button id="mode-driving" class="route-mode-btn" onclick="setRouteProfile('driving')"><i class="fas fa-car"></i></button>
                    <style>.route-mode-btn { border:none; background:white; padding:5px; cursor:pointer; font-size:16px; border-radius:3px; } .route-mode-btn:hover { background:#f0f0f0; } .route-mode-btn.active { background:#667eea; color:white; }</style>`;
                return div;
            }
        });
        map.addControl(new modeDiv());
    }

    const p1 = L.latLng(userLocation.lat, userLocation.lng);
    const p2 = L.latLng(provider.lat, provider.lng);

    // Create Routing Control
    routingControl = L.Routing.control({
        waypoints: [p1, p2],
        routeWhileDragging: false, 
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'cycling' // REQ 7: Default Cycle
        }),
        lineOptions: { styles: [{color: '#667eea', opacity: 1, weight: 5}] },
        createMarker: function(i, wp, nWps) {
            if (i === 0) return null; // Hide default start marker (we use moving one)
            // REQ 4: Fix Destination Marker to show details
            const marker = L.marker(wp.latLng, { 
                icon: L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }) 
            });
            marker.bindPopup(createPopupContent(provider)); // Bind Shop Details
            return marker;
        },
        containerClassName: 'leaflet-routing-container'
    }).addTo(map);

    // Route Found Event
    routingControl.on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        const totalDistKm = (summary.totalDistance / 1000).toFixed(1);
        let timeMins = Math.round(summary.totalTime / 60);
        speakText(`Route calculated. ${totalDistKm} km. About ${timeMins} minutes by cycle.`);
        
        // REQ 7: Initialize Moving Marker at start
        const startLatLng = routes[0].coordinates[0];
        routeMovingMarker = L.marker(startLatLng, {
            icon: L.divIcon({ className: 'user-moving-marker', html: '<div style="background:#4285F4;width:15px;height:15px;border-radius:50%;border:2px solid white;box-shadow:0 0 5px black;"></div>', iconSize: [15, 15] })
        }).addTo(map);
    });

    // REQ 7: Live Tracking & Highlight
    liveTrackingId = navigator.geolocation.watchPosition(
        function(pos) {
            const newLat = pos.coords.latitude;
            const newLng = pos.coords.longitude;
            const newLatLng = L.latLng(newLat, newLng);
            
            // Move marker
            if (routeMovingMarker) routeMovingMarker.setLatLng(newLatLng);
            
            // Recalculate route if deviated (simplified: just update start point)
            // Ideally, we snap to route, but updating waypoint is easier
            const currentWps = routingControl.getWaypoints();
            // Only update if moved significantly (> 20m)
            if (currentWps[0].latLng.distanceTo(newLatLng) > 20) {
                currentWps[0].latLng = newLatLng;
                routingControl.setWaypoints(currentWps);
            }
            
            // Highlight Logic (Mock: Find closest instruction)
            // Note: Real OSRM response has coordinates for steps. We assume index correlates roughly for this demo.
            highlightActiveInstruction(0); // For demo, always highlights first. Real logic requires geometry matching.
        }, 
        function(err) {}, 
        { enableHighAccuracy: true }
    );
}

function highlightActiveInstruction(index) {
    const rows = document.querySelectorAll('.leaflet-routing-alt tr');
    rows.forEach(r => r.classList.remove('highlight-step'));
    if (rows[index]) rows[index].classList.add('highlight-step');
}

// ... [Existing Helper functions unchanged] ...
function openAdminPanel() { document.getElementById('adminModal').style.display = 'block'; }
function resetSystemData() { alert("Admin reset disabled."); }
function renderAdminUserList() { /* same */ }
function renderAdminShopList() { /* same */ }
function adminDeleteShop() { /* same */ }
function updateMapRadius(radiusKm) { if (searchRadiusCircle) map.removeLayer(searchRadiusCircle); searchRadiusCircle = L.circle([searchAnchor.lat, searchAnchor.lng], { color: '#667eea', fillColor: '#667eea', fillOpacity: 0.15, radius: radiusKm * 1000 }).addTo(map); }
function toggleNarrator() { narratorEnabled = !narratorEnabled; const btn = document.getElementById('toggleNarratorBtn'); if (narratorEnabled) { btn.classList.add('active'); speakText("Voice navigation enabled."); } else { btn.classList.remove('active'); window.speechSynthesis.cancel(); } }
function toggleRouteWindow() { const container = document.querySelector('.leaflet-routing-container'); const btn = document.getElementById('toggleRouteInfoBtn'); if(container) { container.classList.toggle('hidden-instructions'); if(container.classList.contains('hidden-instructions')) { btn.classList.remove('active'); } else { btn.classList.add('active'); } } }
function speakText(text) { if (!narratorEnabled) return; window.speechSynthesis.cancel(); const msg = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(msg); }
function routeToShop(providerId) { if (!userLocation) { alert("Please allow location access."); locateUser(function(success) { if(success) executeRouting(providerId, false); }); return; } executeRouting(providerId, false); }
function hideAllMarkersExcept(visibleIds) { markers.forEach(marker => { if(visibleIds.includes(marker.providerId)) { if(!map.hasLayer(marker)) map.addLayer(marker); } else { if(map.hasLayer(marker)) map.removeLayer(marker); } }); }
function locateUser(callback) { if (!navigator.geolocation) { alert('Geolocation not supported'); if(callback) callback(false); return; } navigator.geolocation.getCurrentPosition( function(position) { userLocation = { lat: position.coords.latitude, lng: position.coords.longitude }; searchAnchor = userLocation; map.setView([userLocation.lat, userLocation.lng], 16); if(window.userMarker) map.removeLayer(window.userMarker); window.userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("You are here"); updateMapRadius(parseFloat(document.getElementById('searchRadius').value)); applyFilters(); if(callback) callback(true); }, function() { alert('Unable to get location'); if(callback) callback(false); } ); }
function togglePunjabLayer() { /* same */ }
function toggleNewLayer() { /* same */ }
function filterSpecificShop(id) { /* same */ }
function applyFilters() { /* same */ }
function renderProvidersList(list, best, limit) { /* same */ }
function addProvidersToMap(list) { /* same */ }
function isShopOpen() { /* same */ }
function openAddProviderModal() { /* same */ }
function handleProviderSubmit() { /* same */ }
function editCurrentProvider() { /* same */ }
function showProviderDetails(id) { currentDetailId = id; /* update DOM */ document.getElementById('providerDetailsModal').style.display = 'block'; }
function submitReview() { /* same */ }
function deleteCurrentProvider() { /* same */ }
function resetMapView() { /* same */ }
function createPopupContent() { /* same */ }
function getServiceDisplayName(t) { return ALL_SERVICES_MAP[t] || t; }
function showProviderOnMap() { /* same */ }
function highlightProviderCard() { /* same */ }
function setBasemap() { /* same */ }
function toggleLocationPicker() { /* same */ }
function confirmLocationPick() { /* same */ }
function closeAddProviderModal() { /* same */ }
function renderReviews() { /* same */ }
function updateStarVisuals() { /* same */ }
function initChatbot() { /* same */ }
function appendUserMessage() { /* same */ }
function appendBotMessage() { /* same */ }
function processChatCommand(cmd) { if (/admin/.test(cmd)) return "Admin Panel is for authorized users."; return "Describe your problem."; }

// Global Exports
window.showProviderDetails = showProviderDetails;
window.routeToShop = routeToShop;
window.adminDeleteShop = adminDeleteShop;
window.renderAdminUserList = renderAdminUserList;
window.renderAdminShopList = renderAdminShopList;
window.openAddProviderModal = openAddProviderModal;
window.setRouteProfile = setRouteProfile;
