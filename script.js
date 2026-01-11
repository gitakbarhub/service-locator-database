// Global Variables
let map;
let providers = [];
let currentUser = null;
let currentDetailId = null;

// Map & Layer Variables
let osmLayer, satelliteLayer;
let userLocation = null;
let routingControl = null;
let markers = [];
let tempMarker = null; // For picking location
let isPickingLocation = false;
let punjabLayer = null;

// Config
const DEFAULT_CENTER = { lat: 31.4880, lng: 74.3430 };
const CURRENT_USER_KEY = 'serviceCurrentUser';

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    initializeMobileSidebar(); // New function for sliding window
    loadData(); 
    checkAuthSession(); 
    initChatbot(); 
    initDraggable(); 
});

// --- MOBILE SIDEBAR LOGIC ---
function initializeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    // Default state: Minimized (peeking)
    sidebar.classList.add('minimized');

    // Create a click zone at the top of the sidebar
    const handleZone = document.createElement('div');
    handleZone.style.position = 'absolute';
    handleZone.style.top = '0';
    handleZone.style.left = '0';
    handleZone.style.width = '100%';
    handleZone.style.height = '40px';
    handleZone.style.zIndex = '2001';
    handleZone.style.cursor = 'pointer';
    
    sidebar.appendChild(handleZone);

    handleZone.addEventListener('click', () => {
        sidebar.classList.toggle('minimized');
    });
}

// --- DATA & AUTH ---
async function loadData() {
    try {
        const response = await fetch('/api/shops');
        const data = await response.json();
        if(Array.isArray(data)) {
            providers = data.map(p => ({...p, lat: parseFloat(p.lat), lng: parseFloat(p.lng)}));
        }
        applyFilters(); 
    } catch (error) { console.error("Error loading data", error); }
}

function checkAuthSession() {
    const session = localStorage.getItem(CURRENT_USER_KEY);
    if (session) {
        currentUser = JSON.parse(session);
        updateUIForUser();
    } else {
        updateUIForGuest();
    }
}

// ** CRITICAL: AUTH UI LOGIC **
function updateUIForUser() {
    document.getElementById('loggedOutView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username}`;
    
    const role = currentUser.role;
    const adminBtn = document.getElementById('adminPanelBtn');
    const addShopBtn = document.getElementById('addProviderBtn');

    // Reset buttons
    adminBtn.style.display = 'none';
    addShopBtn.style.display = 'none';

    if (role === 'admin') {
        adminBtn.style.display = 'block';
        addShopBtn.style.display = 'block'; // Admin can add shop
    } else if (role === 'provider') {
        addShopBtn.style.display = 'block'; // Provider can add shop
    } 
    // User role gets neither, just Logout (which is always there in loggedInView)
}

function updateUIForGuest() {
    document.getElementById('loggedOutView').style.display = 'flex';
    document.getElementById('loggedInView').style.display = 'none';
}

function logout() {
    if (confirm("Logout?")) {
        currentUser = null;
        localStorage.removeItem(CURRENT_USER_KEY);
        updateUIForGuest();
        document.getElementById('adminModal').style.display = 'none';
        document.getElementById('addProviderModal').style.display = 'none';
    }
}

async function login(username, password) {
    // Simulated Login for Demo (Replace with your API fetch)
    try {
        const response = await fetch(`/api/users?username=${username}&password=${password}`);
        const data = await response.json(); 
        if (response.ok) {
            currentUser = data;
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
            updateUIForUser();
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('loginForm').reset();
        } else { alert("Login Failed"); }
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
        } else { alert("Registration Failed"); }
    } catch (e) { alert("Network Error"); }
}

// --- MAP FUNCTIONS ---
function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    osmLayer.addTo(map);

    map.on('click', function(e) { 
        if (isPickingLocation) {
            document.getElementById('newLat').value = e.latlng.lat.toFixed(6);
            document.getElementById('newLng').value = e.latlng.lng.toFixed(6);
            document.getElementById('locationStatus').style.display = 'inline';
            if (tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker(e.latlng).addTo(map);
            isPickingLocation = false;
            document.getElementById('locationPickerMessage').style.display = 'none';
            document.getElementById('addProviderModal').style.display = 'block';
        }
    });
}

// --- UI INTERACTIONS ---
function initializeEventListeners() {
    document.getElementById('loginBtnNav').onclick = () => document.getElementById('loginModal').style.display = 'block';
    document.getElementById('registerBtnNav').onclick = () => document.getElementById('registerModal').style.display = 'block';
    document.getElementById('logoutBtn').onclick = logout;
    document.getElementById('addProviderBtn').onclick = () => openAddProviderModal();
    document.getElementById('adminPanelBtn').onclick = () => document.getElementById('adminModal').style.display = 'block';
    
    document.getElementById('applyFilters').onclick = applyFilters;
    document.getElementById('searchBtn').onclick = performSearch;
    document.getElementById('togglePunjabBtn').onclick = toggleGeoServerLayer;

    // Forms
    document.getElementById('loginForm').onsubmit = (e) => { e.preventDefault(); login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); };
    document.getElementById('registerForm').onsubmit = (e) => { e.preventDefault(); register(document.getElementById('regUsername').value, document.getElementById('regPassword').value, document.getElementById('regRole').value, document.getElementById('regSecurityQuestion').value, document.getElementById('regSecurityAnswer').value); };
    
    // Add Shop Logic
    document.getElementById('pickLocationBtn').onclick = () => {
        isPickingLocation = true;
        document.getElementById('addProviderModal').style.display = 'none';
        document.getElementById('locationPickerMessage').style.display = 'block';
    };
    document.getElementById('cancelAdd').onclick = () => {
        document.getElementById('addProviderModal').style.display = 'none';
        if(tempMarker) map.removeLayer(tempMarker);
    };
    
    // Routing
    document.getElementById('getDirectionsBtn').onclick = () => routeToShop(currentDetailId, false);
    document.getElementById('reverseRouteBtn').onclick = () => routeToShop(currentDetailId, true);

    // Map Layers
    document.getElementById('setOsmMap').onclick = () => { map.addLayer(osmLayer); map.removeLayer(satelliteLayer); };
    document.getElementById('setSatelliteMap').onclick = () => { map.addLayer(satelliteLayer); map.removeLayer(osmLayer); };
    document.getElementById('locateMe').onclick = locateUser;
    document.getElementById('resetMapBtn').onclick = () => { 
        map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16); 
        if(routingControl) map.removeControl(routingControl);
        applyFilters();
    };

    // Close Modals
    document.querySelectorAll('.close').forEach(btn => btn.onclick = function() { this.closest('.modal').style.display = 'none'; });
}

// --- CORE LOGIC (Filters, Map Markers) ---
function applyFilters() {
    const type = document.getElementById('serviceType').value;
    const minRating = parseFloat(document.getElementById('ratingFilter').value);
    const radius = parseFloat(document.getElementById('searchRadius').value);
    
    // Mock filtering logic
    const filtered = providers.filter(p => {
        return (type === 'all' || p.service === type) && (p.rating >= minRating);
    });
    
    renderList(filtered);
    renderMarkers(filtered);
}

function renderList(list) {
    const container = document.getElementById('providersContainer');
    container.innerHTML = '';
    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'provider-card';
        div.innerHTML = `<div class="provider-name">${p.name}</div><div class="provider-service">${p.service}</div><div class="stars">★ ${p.rating}</div>`;
        div.onclick = () => {
            showProviderDetails(p.id);
            map.setView([p.lat, p.lng], 16);
            // On mobile, minimize sidebar when clicked
            document.querySelector('.sidebar').classList.add('minimized');
        };
        container.appendChild(div);
    });
}

function renderMarkers(list) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    list.forEach(p => {
        const m = L.marker([p.lat, p.lng]).addTo(map).bindPopup(p.name);
        m.on('click', () => showProviderDetails(p.id));
        markers.push(m);
    });
}

function showProviderDetails(id) {
    currentDetailId = id;
    const p = providers.find(x => x.id == id);
    if(!p) return;
    
    document.getElementById('detailName').textContent = p.name;
    document.getElementById('detailService').textContent = p.service;
    document.getElementById('detailAddress').textContent = p.address;
    document.getElementById('detailPhone').textContent = p.phone;
    document.getElementById('detailRating').textContent = "★".repeat(Math.floor(p.rating));
    
    // Owner Actions visibility
    const ownerDiv = document.getElementById('ownerActions');
    if (currentUser && (currentUser.role === 'admin' || currentUser.id == p.ownerId)) {
        ownerDiv.style.display = 'flex';
    } else {
        ownerDiv.style.display = 'none';
    }
    
    document.getElementById('providerDetailsModal').style.display = 'block';
}

function openAddProviderModal() {
    document.getElementById('providerForm').reset();
    document.getElementById('addProviderModal').style.display = 'block';
}

function routeToShop(id, reverse) {
    const p = providers.find(x => x.id == id);
    if(!p || !userLocation) { alert("Need user location first"); locateUser(); return; }
    
    if(routingControl) map.removeControl(routingControl);
    document.getElementById('providerDetailsModal').style.display = 'none';
    
    const waypoints = reverse 
        ? [L.latLng(p.lat, p.lng), L.latLng(userLocation.lat, userLocation.lng)]
        : [L.latLng(userLocation.lat, userLocation.lng), L.latLng(p.lat, p.lng)];

    routingControl = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: true,
        createMarker: function(i, wp) {
            return L.marker(wp.latLng, { draggable: (reverse && i===1) }); // Allow dragging destination in reverse
        }
    }).addTo(map);
    
    const container = document.querySelector('.leaflet-routing-container');
    if(container) container.style.display = 'block';
}

function locateUser() {
    if (!navigator.geolocation) { alert("Geo not supported"); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        L.marker([userLocation.lat, userLocation.lng], {icon: L.divIcon({className: 'user-marker', html: '<div style="background:blue;width:10px;height:10px;border-radius:50%;"></div>'})}).addTo(map);
        map.setView([userLocation.lat, userLocation.lng], 16);
    });
}

function performSearch() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const found = providers.find(p => p.name.toLowerCase().includes(q));
    if(found) {
        map.setView([found.lat, found.lng], 18);
        showProviderDetails(found.id);
    } else { alert("Not found"); }
}

function toggleGeoServerLayer() {
    // GeoServer logic (same as previous)
    const url = document.getElementById('ngrokUrl').value;
    if(!url) return alert("Enter URL");
    if(punjabLayer) { map.removeLayer(punjabLayer); punjabLayer=null; return; }
    punjabLayer = L.tileLayer.wms(`${url}/geoserver/wms`, { layers: 'myprojectwebgis:punjab_boundary', format: 'image/png', transparent: true }).addTo(map);
}

// Helpers
const convertBase64 = (file) => new Promise((r, j) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => r(reader.result); reader.onerror = e => j(e); });
function initChatbot() { /* Standard Chatbot logic from previous step */ }
function initDraggable() { /* Standard Drag logic */ }
