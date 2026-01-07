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
let liveTrackingId = null; // For tracking user movement
let currentRouteProfile = 'driving'; // Default: driving, walking, cycling

// --- CONFIGURATION ---
const DEFAULT_CENTER = { lat: 31.4880, lng: 74.3430 };
const CURRENT_USER_KEY = 'serviceCurrentUser';

// --- AUTH STATE ---
let currentUser = null; 

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    loadData(); // Fetches from Cloud
    checkAuthSession(); 
    initChatbot(); 
    initDraggable(); 
});

// --- CLOUD FUNCTIONS ---

async function loadData() {
    try {
        const response = await fetch('/api/shops');
        const data = await response.json();
        if(Array.isArray(data)) {
            providers = data.map(p => ({...p, lat: parseFloat(p.lat), lng: parseFloat(p.lng)}));
        }
        applyFilters(); 
    } catch (error) {
        console.error("Error loading cloud data:", error);
    }
}

function saveData() {
    console.log("Data is now managed by the database.");
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
        } else {
            alert("Login Failed: " + (data.error || "Unknown Server Error"));
        }
    } catch (e) {
        alert("Network Error: Check your internet connection.");
        console.error(e);
    }
}

async function register(username, password, role, question, answer) {
    try {
        const userData = { username, password, role, securityQuestion: question, securityAnswer: answer };
        const response = await fetch('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        const data = await response.json(); 

        if (response.ok) {
            currentUser = data;
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
            updateUIForUser();
            document.getElementById('registerModal').style.display = 'none';
            document.getElementById('registerForm').reset();
            alert("Account created successfully!");
        } else {
            alert("Registration Failed: " + (data.error || "Unknown Server Error"));
        }
    } catch (e) {
        alert("Network Error: Could not reach the server.");
        console.error(e);
    }
}

// --- INTERFACE LOGIC ---

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
    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.margin = "0"; 
        element.style.position = "fixed"; 
        element.style.transform = "none"; 
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
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

function recoverPassword(username, answer) {
    alert("Password recovery requires a specific API endpoint update. Contact Admin.");
}

function logout() {
    if (confirm("Are you sure you want to log out?")) {
        currentUser = null;
        localStorage.removeItem(CURRENT_USER_KEY);
        updateUIForGuest();
        document.getElementById('addProviderModal').style.display = 'none';
        document.getElementById('adminModal').style.display = 'none';
    }
}

function updateUIForUser() {
    document.getElementById('loggedOutView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username} (${currentUser.role})`;
    if (currentUser.role === 'admin' || currentUser.role === 'provider') {
        document.getElementById('addProviderBtn').style.display = 'inline-block';
    } else {
        document.getElementById('addProviderBtn').style.display = 'none';
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
    document.getElementById('adminPanelBtn').style.display = 'none';
}

const convertBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsDataURL(file);
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = (error) => reject(error);
    });
};

function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    searchAnchor = { ...DEFAULT_CENTER };
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri, Maxar', maxZoom: 19 });
    osmLayer.addTo(map);
    const initialRadius = parseFloat(document.getElementById('searchRadius').value);
    updateMapRadius(initialRadius);
    map.on('click', function(e) { if (isPickingLocation) confirmLocationPick(e.latlng); });
}

function initializeEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keypress', function(e) { if (e.key === 'Enter') performSearch(); });
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('searchRadius').addEventListener('change', applyFilters);
    document.getElementById('locateMe').addEventListener('click', locateUser);
    document.getElementById('resetMapBtn').addEventListener('click', resetMapView);
    document.getElementById('setOsmMap').addEventListener('click', () => setBasemap('osm'));
    document.getElementById('setSatelliteMap').addEventListener('click', () => setBasemap('satellite'));
    document.getElementById('toggleNarratorBtn').addEventListener('click', toggleNarrator);
    document.getElementById('toggleRouteInfoBtn').addEventListener('click', toggleRouteWindow);

    const radiusSlider = document.getElementById('searchRadius');
    if (radiusSlider) {
        radiusSlider.addEventListener('input', function() {
            document.getElementById('radiusValue').textContent = `${this.value} km`;
            updateMapRadius(parseFloat(this.value));
        });
    }

    document.getElementById('addProviderBtn').addEventListener('click', () => openAddProviderModal());
    document.getElementById('cancelAdd').addEventListener('click', closeAddProviderModal);
    document.getElementById('providerForm').addEventListener('submit', handleProviderSubmit);
    document.getElementById('pickLocationBtn').addEventListener('click', toggleLocationPicker);
    
    document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
    document.getElementById('deleteProviderBtn').addEventListener('click', deleteCurrentProvider);
    document.getElementById('editProviderBtn').addEventListener('click', editCurrentProvider);
    
    document.getElementById('getDirectionsBtn').addEventListener('click', function() { if(currentDetailId) routeToShop(currentDetailId); });
    document.getElementById('reverseRouteBtn').addEventListener('click', function() { if(currentDetailId) routeShopToUser(currentDetailId); });

    document.getElementById('loginBtnNav').addEventListener('click', () => document.getElementById('loginModal').style.display = 'block');
    document.getElementById('registerBtnNav').addEventListener('click', () => document.getElementById('registerModal').style.display = 'block');
    document.getElementById('forgotPasswordLink').addEventListener('click', () => {
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('forgotPasswordModal').style.display = 'block';
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('adminPanelBtn').addEventListener('click', openAdminPanel);
    document.getElementById('resetSystemBtn').addEventListener('click', resetSystemData);
    
    document.getElementById('statUsers').addEventListener('click', renderAdminUserList);
    document.getElementById('statShops').addEventListener('click', renderAdminShopList);

    document.getElementById('loginForm').addEventListener('submit', function(e) { 
        e.preventDefault(); 
        login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); 
    });
    document.getElementById('registerForm').addEventListener('submit', function(e) { 
        e.preventDefault(); 
        register(
            document.getElementById('regUsername').value, 
            document.getElementById('regPassword').value, 
            document.getElementById('regRole').value,
            document.getElementById('regSecurityQuestion').value,
            document.getElementById('regSecurityAnswer').value
        ); 
    });
    document.getElementById('forgotPasswordForm').addEventListener('submit', function(e) {
        e.preventDefault();
        recoverPassword(document.getElementById('recoverUsername').value, document.getElementById('recoverAnswer').value);
    });

    document.querySelectorAll('.close').forEach(closeBtn => { closeBtn.addEventListener('click', function() { document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none'); }); });
    window.addEventListener('click', function(event) { document.querySelectorAll('.modal').forEach(modal => { if (event.target === modal) modal.style.display = 'none'; }); });

    document.querySelectorAll('.rating-stars .star').forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            updateStarVisuals(rating);
            this.parentElement.setAttribute('data-selected-rating', rating);
        });
    });

    // --- PASSWORD TOGGLE LOGIC ---
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });
}

function openAdminPanel() {
    document.getElementById('adminTotalUsers').textContent = "Click to View";
    document.getElementById('adminTotalShops').textContent = providers.length;
    document.getElementById('adminListSection').style.display = 'none';
    document.getElementById('adminModal').style.display = 'block';
}

function resetSystemData() {
    alert("Admin reset not available in cloud mode via this button for safety.");
}

async function renderAdminUserList() {
    const listSection = document.getElementById('adminListSection');
    const container = document.getElementById('adminListContainer');
    const title = document.getElementById('adminListTitle');
    
    title.textContent = "Manage Users (Cloud)";
    listSection.style.display = 'block';
    container.innerHTML = '<div style="padding:10px; text-align:center;">Loading users...</div>';

    try {
        const response = await fetch('/api/users?action=list');
        if (!response.ok) throw new Error("Failed to fetch user list");
        
        const users = await response.json();
        
        document.getElementById('adminTotalUsers').textContent = users.length;
        
        container.innerHTML = '';
        if (users.length === 0) {
            container.innerHTML = '<div style="padding:15px; text-align:center;">No users found.</div>';
            return;
        }

        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'admin-list-item';
            const deleteBtn = (currentUser && user.id === currentUser.id) ? 
                `<span style="color:#cbd5e0;">(You)</span>` : 
                `<button class="btn-sm-danger" onclick="adminDeleteUser(${user.id})" title="Delete API not connected">Delete</button>`;

            item.innerHTML = `<div class="item-info"><strong>${user.username}</strong><small>${user.role}</small></div><div>${deleteBtn}</div>`;
            container.appendChild(item);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red; text-align:center; padding:10px;">Error loading users. Check console.</div>';
    }
}

function renderAdminShopList() {
    const listSection = document.getElementById('adminListSection');
    const container = document.getElementById('adminListContainer');
    const title = document.getElementById('adminListTitle');
    const currentProviders = providers; 
    title.textContent = "Manage Shops";
    listSection.style.display = 'block';
    container.innerHTML = '';
    if (currentProviders.length === 0) { container.innerHTML = '<div style="padding:15px; text-align:center;">No shops found.</div>'; return; }
    currentProviders.forEach(p => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `<div class="item-info"><strong>${p.name}</strong><small>${getServiceDisplayName(p.service)}</small></div><div><button class="btn-sm-danger" onclick="adminDeleteShop(${p.id})">Delete</button></div>`;
        container.appendChild(item);
    });
}

function adminDeleteUser(userId) {
    alert("Delete User feature requires a DELETE API endpoint (Coming Soon).");
}

function adminDeleteShop(shopId) {
    if(!confirm("Delete this shop?")) return;
    alert("Delete feature requires API DELETE endpoint.");
}

function updateMapRadius(radiusKm) {
    if (searchRadiusCircle) map.removeLayer(searchRadiusCircle);
    searchRadiusCircle = L.circle([searchAnchor.lat, searchAnchor.lng], { color: '#667eea', fillColor: '#667eea', fillOpacity: 0.15, radius: radiusKm * 1000 }).addTo(map);
}

// --- ROUTING SYSTEM ---

// Mode Switching Logic
function setRouteProfile(profile) {
    currentRouteProfile = profile;
    // Update active button UI
    document.querySelectorAll('.route-mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${profile}`).classList.add('active');
    
    // Recalculate route if active
    if (routingControl) {
        const waypoints = routingControl.getWaypoints();
        routingControl.setWaypoints(waypoints);
    }
}

function toggleNarrator() {
    narratorEnabled = !narratorEnabled;
    const btn = document.getElementById('toggleNarratorBtn');
    if (narratorEnabled) {
        btn.classList.add('active');
        speakText("Voice navigation enabled. Proceed to route.");
    } else {
        btn.classList.remove('active');
        window.speechSynthesis.cancel();
    }
}

function toggleRouteWindow() {
    const container = document.querySelector('.leaflet-routing-container');
    const btn = document.getElementById('toggleRouteInfoBtn');
    if(container) {
        container.classList.toggle('hidden-instructions');
        if(container.classList.contains('hidden-instructions')) {
            btn.classList.remove('active');
        } else {
            btn.classList.add('active');
        }
    }
}

function speakText(text) {
    if (!narratorEnabled) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(msg);
}

function routeToShop(providerId) {
    if (!userLocation) {
        alert("We need your location first. Please allow access.");
        locateUser(function(success) { if(success) executeRouting(providerId, false); });
        return;
    }
    executeRouting(providerId, false);
}

function routeShopToUser(providerId) {
    if (!userLocation) {
        alert("We need your location first. Please allow access.");
        locateUser(function(success) { if(success) executeRouting(providerId, true); });
        return;
    }
    executeRouting(providerId, true);
}

function executeRouting(providerId, reverse) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    
    // Clear any existing tracking interval
    if (liveTrackingId) clearInterval(liveTrackingId);

    // Hide markers to declutter map
    hideAllMarkersExcept([provider.id]);

    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    document.getElementById('toggleNarratorBtn').style.display = 'block';
    document.getElementById('toggleRouteInfoBtn').style.display = 'block';
    document.getElementById('toggleRouteInfoBtn').classList.add('active');

    // Add Mode Switcher Controls to Map if not exists
    if (!document.getElementById('routeModeControls')) {
        const modeDiv = L.Control.extend({
            options: { position: 'topright' }, // Keep topright
            onAdd: function(map) {
                const div = L.DomUtil.create('div', 'route-mode-controls');
                div.id = 'routeModeControls';
                div.style.backgroundColor = 'white';
                div.style.padding = '5px';
                div.style.borderRadius = '5px';
                div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
                // Removed inline margins to let CSS handle responsiveness
                
                div.innerHTML = `
                    <button id="mode-walking" class="route-mode-btn" onclick="setRouteProfile('walking')" title="Walking"><i class="fas fa-walking"></i></button>
                    <button id="mode-cycling" class="route-mode-btn" onclick="setRouteProfile('cycling')" title="Cycling"><i class="fas fa-bicycle"></i></button>
                    <button id="mode-driving" class="route-mode-btn active" onclick="setRouteProfile('driving')" title="Driving"><i class="fas fa-car"></i></button>
                    <style>
                        .route-mode-btn { border:none; background:white; padding:5px 10px; cursor:pointer; font-size:16px; border-radius:3px; }
                        .route-mode-btn:hover { background:#f0f0f0; }
                        .route-mode-btn.active { background:#667eea; color:white; }
                    </style>
                `;
                return div;
            }
        });
        map.addControl(new modeDiv());
        // Make functions global for onclick
        window.setRouteProfile = setRouteProfile;
    }

    const p1 = reverse ? L.latLng(userLocation.lat, userLocation.lng) : L.latLng(userLocation.lat, userLocation.lng);
    const p2 = reverse ? L.latLng(provider.lat, provider.lng) : L.latLng(provider.lat, provider.lng);

    // OSRM Profile Selection
    routingControl = L.Routing.control({
        waypoints: [p1, p2],
        routeWhileDragging: true, 
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'driving' 
        }),
        lineOptions: { styles: [{color: '#667eea', opacity: 1, weight: 5}] },
        createMarker: function(i, wp, nWps) {
            let markerIcon;
            let popupContent;
            
            const meIcon = L.divIcon({ 
                className: 'user-marker', 
                html: '<i class="fas fa-dot-circle" style="color:#4285F4; font-size:24px; text-shadow:0 0 5px white;"></i><span style="position:absolute; top:-20px; left:-5px; background:white; padding:2px 5px; border-radius:4px; font-weight:bold; font-size:10px; border:1px solid #ccc;">Me</span>', 
                iconSize: [24, 24] 
            });

            const shopIcon = L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            });

            if (!reverse) { 
                if (i === 0) { markerIcon = meIcon; popupContent = "<b>I am Here</b>"; } 
                else { markerIcon = shopIcon; popupContent = createPopupContent(provider); }
            } else { 
                if (i === 0) { markerIcon = shopIcon; popupContent = createPopupContent(provider); } 
                else { 
                    markerIcon = meIcon;
                    popupContent = `
                        <div class="dest-popup-container">
                            <h4>Enter User Coordinates</h4>
                            <div class="dest-popup-inputs">
                                <input type="number" id="manualDestLat" step="any" value="${wp.latLng.lat.toFixed(6)}" placeholder="Latitude">
                                <input type="number" id="manualDestLng" step="any" value="${wp.latLng.lng.toFixed(6)}" placeholder="Longitude">
                                <button class="dest-popup-btn" onclick="updateRouteDestination()">Route to User</button>
                            </div>
                        </div>
                    `;
                }
            }

            const marker = L.marker(wp.latLng, { draggable: true, icon: markerIcon });
            if (popupContent) {
                marker.bindPopup(popupContent);
                if (reverse && i === 1) setTimeout(() => { marker.openPopup(); }, 500); 
            }
            return marker;
        },
        showAlternatives: false,
        addWaypoints: false,
        containerClassName: 'leaflet-routing-container'
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        const totalDistKm = (summary.totalDistance / 1000).toFixed(1);
        
        let timeMins = Math.round(summary.totalTime / 60);
        let modeText = "Driving";

        if (currentRouteProfile === 'walking') {
            timeMins = Math.round((summary.totalDistance / 1000) / 5 * 60); 
            modeText = "Walking";
        } else if (currentRouteProfile === 'cycling') {
            timeMins = Math.round((summary.totalDistance / 1000) / 20 * 60);
            modeText = "Cycling";
        }

        let msg = `${modeText} route. Distance ${totalDistKm} km. Time approx ${timeMins} minutes.`;
        if(reverse) msg += " Enter user coordinates in the popup.";
        speakText(msg);
        
        setTimeout(() => {
            const container = document.querySelector('.leaflet-routing-container');
            if(container) {
                container.style.display = 'block';
                container.classList.remove('hidden-instructions');
                const header = container.querySelector('h2') || container.querySelector('h3');
                if(header) header.textContent = `${timeMins} min (${totalDistKm} km) - ${modeText}`;
            }
        }, 500);
    });
    
    // --- LIVE TRACKING FEATURE ---
    if (!reverse) {
        liveTrackingId = setInterval(() => {
            navigator.geolocation.getCurrentPosition(pos => {
                const newLat = pos.coords.latitude;
                const newLng = pos.coords.longitude;
                const currentLatLng = L.latLng(userLocation.lat, userLocation.lng);
                const newLatLng = L.latLng(newLat, newLng);
                
                if (currentLatLng.distanceTo(newLatLng) > 20) {
                    userLocation = { lat: newLat, lng: newLng };
                    const waypoints = routingControl.getWaypoints();
                    waypoints[0].latLng = newLatLng;
                    routingControl.setWaypoints(waypoints);
                    console.log("Route updated live.");
                }
            }, err => console.warn("Live tracking error", err), { enableHighAccuracy: true });
        }, 5000);
    }

    if(reverse) {
        alert("Provider Mode: The route starts at your location.\n\nEnter the User's coordinates in the popup box on the Destination Marker.");
    }

    const bounds = L.latLngBounds([p1, p2]);
    map.fitBounds(bounds, { padding: [50, 50] });
}

function updateRouteDestination() {
    const lat = parseFloat(document.getElementById('manualDestLat').value);
    const lng = parseFloat(document.getElementById('manualDestLng').value);
    if(isNaN(lat) || isNaN(lng)) { alert("Please enter valid Latitude and Longitude"); return; }
    if(routingControl) {
        const waypoints = routingControl.getWaypoints();
        const newWaypoints = [ waypoints[0], L.Routing.waypoint(L.latLng(lat, lng)) ];
        routingControl.setWaypoints(newWaypoints);
        map.closePopup(); 
    }
}

function hideAllMarkersExcept(visibleIds) {
    markers.forEach(marker => {
        if(visibleIds.includes(marker.providerId)) {
            if(!map.hasLayer(marker)) map.addLayer(marker);
        } else {
            if(map.hasLayer(marker)) map.removeLayer(marker);
        }
    });
}

function locateUser(callback) {
    if (!navigator.geolocation) { alert('Geolocation not supported'); if(callback) callback(false); return; }
    navigator.geolocation.getCurrentPosition(
        function(position) {
            userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            searchAnchor = userLocation; 
            map.setView([userLocation.lat, userLocation.lng], 16);
            if(window.userMarker) map.removeLayer(window.userMarker);
            window.userMarker = L.marker([userLocation.lat, userLocation.lng], {
                icon: L.divIcon({ className: 'user-marker', html: '<i class="fas fa-dot-circle" style="color:#4285F4; font-size:24px; text-shadow:0 0 5px white;"></i>', iconSize: [24, 24] })
            }).addTo(map).bindPopup('<b>You are here</b>');
            updateMapRadius(parseFloat(document.getElementById('searchRadius').value));
            applyFilters();
            if(callback) callback(true);
        },
        function() { alert('Unable to get location'); if(callback) callback(false); }
    );
}

function applyFilters() {
    const serviceType = document.getElementById('serviceType').value;
    const minRating = parseFloat(document.getElementById('ratingFilter').value);
    const radiusKm = parseFloat(document.getElementById('searchRadius').value);
    const centerPoint = L.latLng(searchAnchor.lat, searchAnchor.lng);

    const filtered = providers.filter(p => {
        const matchService = (serviceType === 'all') || (p.service === serviceType);
        const matchRating = (p.rating >= minRating);
        const providerPoint = L.latLng(p.lat, p.lng);
        const distanceMeters = centerPoint.distanceTo(providerPoint);
        const matchDistance = distanceMeters <= (radiusKm * 1000);
        return matchService && matchRating && matchDistance;
    });
    renderProvidersList(filtered);
    addProvidersToMap(filtered);
}

function renderProvidersList(listToRender) {
    const container = document.getElementById('providersContainer');
    container.innerHTML = '';
    if(listToRender.length === 0) { container.innerHTML = "<p style='text-align:center; color:#666;'>No shops found.</p>"; return; }
    listToRender.forEach(provider => {
         const card = document.createElement('div');
         card.className = 'provider-card';
         card.setAttribute('data-id', provider.id);
         const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
         
         const isOpen = isShopOpen(provider.openTime, provider.closeTime);
         const statusClass = isOpen ? 'status-open' : 'status-closed';
         const statusText = isOpen ? 'Open' : 'Closed';
         
         card.innerHTML = `
            <div class="provider-header"><div><div class="provider-name">${provider.name}</div><span class="provider-service">${getServiceDisplayName(provider.service)}</span></div></div>
            <div class="provider-rating"><span class="stars">${stars}</span><span>${provider.rating}</span><span class="status-badge ${statusClass}">${statusText}</span></div>
            <div class="provider-address"><i class="fas fa-map-marker-alt"></i> ${provider.address}</div>`;
         card.addEventListener('click', function() { showProviderOnMap(provider.id); highlightProviderCard(provider.id); });
         container.appendChild(card);
    });
}

function addProvidersToMap(listToRender) {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    listToRender.forEach(provider => {
        const marker = L.marker([provider.lat, provider.lng]).addTo(map).bindPopup(createPopupContent(provider));
        marker.providerId = provider.id;
        marker.on('click', function() { highlightProviderCard(provider.id); });
        markers.push(marker);
    });
}

function isShopOpen(open, close) {
    if(!open || !close) return false;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    const [openH, openM] = open.split(':').map(Number);
    const [closeH, closeM] = close.split(':').map(Number);
    
    const startMins = openH * 60 + openM;
    const endMins = closeH * 60 + closeM;
    
    return currentMins >= startMins && currentMins <= endMins;
}

function openAddProviderModal(editMode = false, provider = null) {
    const modal = document.getElementById('addProviderModal');
    const form = document.getElementById('providerForm');
    const title = document.getElementById('modalTitleProvider');
    const btn = document.getElementById('saveProviderBtn');
    
    modal.style.display = 'block';
    form.reset();
    
    if (editMode && provider) {
        title.textContent = "Modify Shop";
        btn.textContent = "Update Shop";
        document.getElementById('editProviderId').value = provider.id;
        document.getElementById('providerName').value = provider.name;
        document.getElementById('providerService').value = provider.service;
        document.getElementById('providerPhone').value = provider.phone;
        document.getElementById('providerAddress').value = provider.address;
        document.getElementById('providerDescription').value = provider.description || '';
        document.getElementById('providerOpenTime').value = provider.openTime || '';
        document.getElementById('providerCloseTime').value = provider.closeTime || '';
        document.getElementById('newLat').value = provider.lat;
        document.getElementById('newLng').value = provider.lng;
        document.getElementById('locationStatus').textContent = `${provider.lat.toFixed(4)}, ${provider.lng.toFixed(4)}`;
        document.getElementById('locationStatus').style.color = 'green';
    } else {
        title.textContent = "Add Service Provider";
        btn.textContent = "Save Shop";
        document.getElementById('editProviderId').value = "";
        document.getElementById('locationStatus').textContent = "Not set";
        document.getElementById('locationStatus').style.color = '#666';
        document.getElementById('newLat').value = "";
        document.getElementById('newLng').value = "";
    }
}

async function handleProviderSubmit(e) {
    e.preventDefault();
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'provider')) { alert("Permission denied."); return; }
    
    const latInput = document.getElementById('newLat').value;
    const lngInput = document.getElementById('newLng').value;
    
    if (!latInput || !lngInput) { alert("Please pick a location or enter coordinates!"); return; }

    const editId = document.getElementById('editProviderId').value;
    const fileInput = document.getElementById('providerImage');
    
    let imageBase64 = ""; 
    if (editId) {
        const existing = providers.find(p => p.id == editId);
        imageBase64 = existing.image;
    }

    if (fileInput.files.length > 0) {
        try { imageBase64 = await convertBase64(fileInput.files[0]); } catch (error) { console.error(error); return; }
    }

    const providerData = {
        id: editId || null,
        ownerId: currentUser.id,
        name: document.getElementById('providerName').value,
        service: document.getElementById('providerService').value,
        phone: document.getElementById('providerPhone').value,
        address: document.getElementById('providerAddress').value,
        description: document.getElementById('providerDescription').value,
        openTime: document.getElementById('providerOpenTime').value,
        closeTime: document.getElementById('providerCloseTime').value,
        lat: parseFloat(latInput),
        lng: parseFloat(lngInput),
        rating: 0, 
        reviews: 0,
        userReviews: [],
        image: imageBase64
    };

    // --- UPLOAD TO CLOUD ---
    try {
        const response = await fetch('/api/shops', {
            method: 'POST',
            body: JSON.stringify(providerData)
        });
        
        if (response.ok) {
            alert("Shop Saved to Cloud!");
            closeAddProviderModal();
            loadData(); // Reload map to show new data
        } else {
            alert("Error saving shop.");
        }
    } catch (e) {
        console.error(e);
        alert("Network error.");
    }
}

function editCurrentProvider() {
    if (!currentDetailId) return;
    const provider = providers.find(p => p.id === currentDetailId);
    if(provider) {
        document.getElementById('providerDetailsModal').style.display = 'none';
        openAddProviderModal(true, provider);
    }
}

let currentDetailId = null;
function showProviderDetails(providerId) {
    currentDetailId = providerId;
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    document.getElementById('detailName').textContent = provider.name;
    document.getElementById('detailService').textContent = getServiceDisplayName(provider.service);
    document.getElementById('detailPhone').textContent = provider.phone;
    document.getElementById('detailAddress').textContent = provider.address;
    
    const isOpen = isShopOpen(provider.openTime, provider.closeTime);
    const timingText = (provider.openTime && provider.closeTime) ? `${provider.openTime} - ${provider.closeTime}` : "No timings";
    document.getElementById('detailTiming').textContent = timingText;
    const badge = document.getElementById('detailStatusBadge');
    badge.textContent = isOpen ? "Open Now" : "Closed";
    badge.className = `status-badge ${isOpen ? 'status-open' : 'status-closed'}`;

    const imgContainer = document.getElementById('detailImageContainer');
    if (provider.image) { document.getElementById('detailImage').src = provider.image; imgContainer.style.display = 'block'; } else { imgContainer.style.display = 'none'; }
    const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
    document.getElementById('detailRating').innerHTML = stars;
    document.getElementById('detailRatingValue').textContent = `(${provider.rating} / 5)`;
    renderReviews(provider.userReviews);
    
    const reviewSection = document.getElementById('reviewSection');
    const loginMsg = document.getElementById('loginToReviewMsg');
    
    if (currentUser && (currentUser.role === 'user' || currentUser.role === 'admin')) { reviewSection.style.display = 'block'; loginMsg.style.display = 'none'; }
    else if (currentUser && currentUser.role === 'provider') { reviewSection.style.display = 'none'; loginMsg.style.display = 'none'; }
    else { reviewSection.style.display = 'none'; loginMsg.style.display = 'block'; }

    const ownerActions = document.getElementById('ownerActions');
    
    const isOwner = currentUser && (provider.ownerId == currentUser.id);
    const isAdmin = currentUser && (currentUser.role === 'admin');
    
    if (isOwner || isAdmin) { 
        ownerActions.style.display = 'flex'; 
    } else { 
        ownerActions.style.display = 'none'; 
    }

    document.getElementById('reviewText').value = "";
    updateStarVisuals(0);
    document.getElementById('providerDetailsModal').style.display = 'block';
}

function submitReview() {
    alert("Review submission logic needs API update. Feature pending.");
}

function deleteCurrentProvider() {
    if (!currentDetailId) return;
    adminDeleteShop(currentDetailId);
}

function resetMapView() {
    searchAnchor = { ...DEFAULT_CENTER };
    userLocation = null;
    if (routingControl) map.removeControl(routingControl);
    if (window.userMarker) map.removeLayer(window.userMarker);
    if (liveTrackingId) clearInterval(liveTrackingId); // Stop tracking on reset
    
    // Remove mode buttons if they exist
    const modeDiv = document.getElementById('routeModeControls');
    if (modeDiv) modeDiv.remove();

    map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    document.getElementById('searchRadius').value = 1;
    document.getElementById('radiusValue').textContent = "1 km";
    document.getElementById('serviceType').value = "all";
    document.getElementById('ratingFilter').value = "0";
    document.getElementById('toggleNarratorBtn').style.display = 'none';
    document.getElementById('toggleRouteInfoBtn').style.display = 'none';
    updateMapRadius(1);
    applyFilters();
}

function createPopupContent(provider) {
    const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
    const imgHtml = (provider.image) ? `<div class="popup-image"><img src="${provider.image}"></div>` : '';
    return `<div class="popup-content">${imgHtml}<h3>${provider.name}</h3><div class="popup-rating">${stars} (${provider.rating})</div><div class="popup-service"><i class="fas fa-tools"></i> ${getServiceDisplayName(provider.service)}</div><div class="popup-actions"><button class="popup-btn primary" onclick="showProviderDetails(${provider.id})">View Details</button><button class="popup-btn secondary" onclick="routeToShop(${provider.id})"><i class="fas fa-directions"></i> Route</button></div></div>`;
}

function getServiceDisplayName(serviceType) {
    const serviceNames = { 'electrician': 'Electrician', 'plumber': 'Plumber', 'mechanic': 'Mechanic', 'carwash': 'Car/Bike Wash' };
    return serviceNames[serviceType] || serviceType;
}

function showProviderOnMap(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
        map.setView([provider.lat, provider.lng], 16);
        markers.forEach(marker => { if (marker.providerId === providerId) marker.openPopup(); });
    }
}

function highlightProviderCard(providerId) {
    document.querySelectorAll('.provider-card').forEach(card => card.classList.remove('active'));
    const activeCard = document.querySelector(`.provider-card[data-id="${providerId}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function setBasemap(layerName) {
    if (currentLayer === layerName) return; 
    if (layerName === 'osm') {
        if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
        map.addLayer(osmLayer);
        currentLayer = 'osm';
        document.getElementById('setOsmMap').classList.add('active');
        document.getElementById('setSatelliteMap').classList.remove('active');
    } else {
        if (map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
        map.addLayer(satelliteLayer);
        currentLayer = 'satellite';
        document.getElementById('setOsmMap').classList.remove('active');
        document.getElementById('setSatelliteMap').classList.add('active');
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (query) {
        const filtered = providers.filter(provider => provider.name.toLowerCase().includes(query) || provider.service.toLowerCase().includes(query));
        renderProvidersList(filtered);
        addProvidersToMap(filtered);
        if (filtered.length > 0) {
            map.setView([filtered[0].lat, filtered[0].lng], 16);
            highlightProviderCard(filtered[0].id);
        }
    }
}

function toggleLocationPicker() {
    isPickingLocation = true;
    document.getElementById('addProviderModal').style.display = 'none';
    document.getElementById('locationPickerMessage').style.display = 'block';
    document.body.style.cursor = 'crosshair';
}

function confirmLocationPick(latlng) {
    document.getElementById('newLat').value = latlng.lat.toFixed(6);
    document.getElementById('newLng').value = latlng.lng.toFixed(6);
    document.getElementById('locationStatus').textContent = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    document.getElementById('locationStatus').style.color = "green";
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(latlng).addTo(map).bindPopup("New Shop Location").openPopup();
    isPickingLocation = false;
    document.body.style.cursor = 'default';
    document.getElementById('locationPickerMessage').style.display = 'none';
    document.getElementById('addProviderModal').style.display = 'block';
}

function closeAddProviderModal() {
    document.getElementById('addProviderModal').style.display = 'none';
    document.getElementById('providerForm').reset();
    document.getElementById('locationStatus').textContent = "Not set";
    document.getElementById('locationStatus').style.color = "#666";
    if (tempMarker) map.removeLayer(tempMarker);
}

function renderReviews(reviewsArr) {
    const list = document.getElementById('reviewsList');
    list.innerHTML = "";
    if(!reviewsArr || reviewsArr.length === 0) { list.innerHTML = "<p style='color:#777; font-style:italic;'>No reviews yet.</p>"; return; }
    reviewsArr.forEach(r => {
        const item = document.createElement('div');
        item.className = 'review-item';
        item.innerHTML = `<div class="review-header"><strong>${r.user}</strong><span style="color:#fbbf24;">${'★'.repeat(r.rating)}</span></div><div class="review-text">${r.text}</div>`;
        list.appendChild(item);
    });
}

function updateStarVisuals(rating) {
    document.querySelectorAll('.rating-stars .star').forEach(star => {
        const starRating = parseInt(star.getAttribute('data-rating'));
        if (starRating <= rating) star.classList.add('active');
        else star.classList.remove('active');
    });
}

// --- 10x BETTER CHATBOT TRAINING ---
function initChatbot() {
    const toggleBtn = document.getElementById('chatbotToggle');
    const chatWindow = document.getElementById('chatWindow');
    const closeBtn = document.getElementById('closeChatBtn');
    const sendBtn = document.getElementById('sendChatBtn');
    const input = document.getElementById('chatInput');

    toggleBtn.addEventListener('click', () => {
        chatWindow.classList.toggle('open');
        if (chatWindow.classList.contains('open')) {
            if (document.getElementById('chatMessages').children.length === 0) {
                appendBotMessage("Hi! I'm ServiceBot. I can help with finding shops, routing, or account issues. Ask me anything!");
            }
        }
    });

    closeBtn.addEventListener('click', () => chatWindow.classList.remove('open'));
    sendBtn.addEventListener('click', handleUserSend);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserSend(); });

    function handleUserSend() {
        const text = input.value.trim();
        if (!text) return;
        appendUserMessage(text);
        input.value = '';
        setTimeout(() => {
            const response = processChatCommand(text.toLowerCase());
            appendBotMessage(response);
        }, 500);
    }
}

function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message-bubble user-msg';
    div.textContent = text;
    const container = document.getElementById('chatMessages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'message-bubble bot-msg';
    div.textContent = text;
    const container = document.getElementById('chatMessages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function processChatCommand(cmd) {
    // --- GREETINGS ---
    if (cmd === 'hi' || cmd === 'hello' || cmd === 'hey') {
        return "Hello! Welcome to the Local Service Locator. How can I assist you today? You can ask about registering, finding a mechanic, or using the map.";
    }

    // --- 1. REGISTRATION, LOGIN & ROLES ---
    if (cmd.includes('register') || cmd.includes('sign up') || cmd.includes('create account') || cmd.includes('make account')) {
        return "To Register: Click the 'Register' button in the top-right corner. Fill in your Username, Password, and a Security Question (for password recovery). Choose 'Service Provider' if you own a shop, or 'Regular User' if you just want to find services.";
    }
    if (cmd.includes('login') || cmd.includes('sign in') || cmd.includes('log in')) {
        return "To Login: Click 'Login' at the top-right. Enter your username and password. If you forgot your password, click the 'Forgot Password?' link in the login window.";
    }
    if (cmd.includes('forget') || cmd.includes('recover') || cmd.includes('reset password') || cmd.includes('lost password')) {
        return "Forgot Password? No problem. In the Login window, click 'Forgot Password?'. You will need to enter your username and answer the Security Question you set during registration.";
    }
    if (cmd.includes('role') || cmd.includes('provider') || cmd.includes('user account') || cmd.includes('difference')) {
        return "There are two account types: \n1) **Regular User**: Can search for shops, get directions, and write reviews. \n2) **Service Provider**: Can add their own shop to the map, edit its details, and attract customers.";
    }

    // --- 2. ADD, EDIT & DELETE SHOPS ---
    if (cmd.includes('add shop') || cmd.includes('add service') || cmd.includes('create shop') || cmd.includes('list my shop')) {
        return "To Add a Shop: \n1. Login as a 'Service Provider'. \n2. Click the 'Add Shop' button in the top header. \n3. Fill in the form (Name, Type, Contact). \n4. Click 'Pick on Map' to set your precise location. \n5. Click 'Save Shop'.";
    }
    if (cmd.includes('edit shop') || cmd.includes('modify') || cmd.includes('update shop') || cmd.includes('change detail')) {
        return "To Edit Your Shop: \n1. Find your shop on the map and click it. \n2. Click 'View Details'. \n3. If you are the owner (and logged in), you will see a 'Modify Shop' button at the bottom. Click it to update info.";
    }
    if (cmd.includes('delete shop') || cmd.includes('remove shop') || cmd.includes('erase shop')) {
        return "To Delete a Shop: Open the shop details window. If you are the owner, a red 'Delete' button will appear at the bottom. Click it to permanently remove your shop from the system.";
    }

    // --- 3. SEARCH & FILTERS ---
    if (cmd.includes('search') || cmd.includes('find') || cmd.includes('looking for')) {
        return "Using Search: Type a shop name (e.g., 'Ali Auto') or a service type (e.g., 'plumber') in the top search bar and press Enter. The map will automatically highlight matching shops.";
    }
    if (cmd.includes('filter') || cmd.includes('sort') || cmd.includes('category')) {
        return "Using Filters: Look at the left sidebar. You can filter shops by **Service Type** (Electrician, Plumber, etc.) or **Rating** (e.g., 4+ Stars). Click 'Apply Filters' to update the map.";
    }
    if (cmd.includes('radius') || cmd.includes('range') || cmd.includes('distance')) {
        return "Search Radius: Use the slider in the left sidebar to set a search range (from 0.5km to 5km). The map shows a blue circle indicating the area being searched around your location.";
    }

    // --- 4. ROUTING & NAVIGATION (ENHANCED) ---
    if (cmd.includes('route') || cmd.includes('direction') || cmd.includes('navigate') || cmd.includes('go to')) {
        return "Routing: Click on a shop -> 'View Details'. \n- **Me -> Shop**: Draws a path from your GPS location to the shop. \n- **Shop -> Me**: Draws a path from the shop to you (useful for home service). \n\n*New:* You can now switch between Walk 🚶, Bike 🚴, and Car 🚗 modes!";
    }
    if (cmd.includes('mode') || cmd.includes('walk') || cmd.includes('bike') || cmd.includes('car')) {
        return "Travel Modes: When a route is active, buttons appear at the top-right of the map. Click 'Walking', 'Cycling', or 'Driving' to get accurate time estimates for your travel method.";
    }
    if (cmd.includes('track') || cmd.includes('live') || cmd.includes('gps')) {
        return "Live Tracking: If you are using this on a mobile phone while moving, the 'Me' marker will automatically update its position every 5 seconds to keep your route accurate.";
    }
    if (cmd.includes('narrator') || cmd.includes('voice') || cmd.includes('speak')) {
        return "Voice Navigation: Click the 'Speaker' icon in the map controls (top-right). The app will read out the route instructions to you.";
    }

    // --- 5. REVIEWS & RATINGS ---
    if (cmd.includes('review') || cmd.includes('rating') || cmd.includes('star') || cmd.includes('comment')) {
        return "Reviews: Open a shop's details and scroll down. If you are logged in as a User, you can click the stars (1-5) and write a comment to share your experience.";
    }
    if (cmd.includes('best shop') || cmd.includes('top rated') || cmd.includes('good')) {
        return "Find Top Shops: In the sidebar, change the 'Rating' filter to '5 Stars' or '4+ Stars' and click Apply. Only the highly-rated shops will remain on the map.";
    }

    // --- 6. SPECIFIC SERVICE QUERIES ---
    if (cmd.includes('plumber') || cmd.includes('pipe') || cmd.includes('leak')) {
        document.getElementById('serviceType').value = 'plumber';
        applyFilters();
        return "Plumbers: They fix pipes, leaks, and water systems. I have filtered the map to show only Plumbers near you.";
    }
    if (cmd.includes('electrician') || cmd.includes('wire') || cmd.includes('light')) {
        document.getElementById('serviceType').value = 'electrician';
        applyFilters();
        return "Electricians: They handle wiring, fans, and electrical faults. The map now shows Electricians.";
    }
    if (cmd.includes('mechanic') || cmd.includes('repair') || cmd.includes('car fix')) {
        document.getElementById('serviceType').value = 'mechanic';
        applyFilters();
        return "Mechanics: Experts in car and bike repair. I've highlighted all Mechanic shops on the map.";
    }
    if (cmd.includes('car wash') || cmd.includes('cleaning') || cmd.includes('wash')) {
        document.getElementById('serviceType').value = 'carwash';
        applyFilters();
        return "Car Wash: Need a clean vehicle? I've filtered the map to show Car/Bike Wash stations.";
    }

    // --- 7. BENEFITS & PURPOSE ---
    if (cmd.includes('benefit') || cmd.includes('why') || cmd.includes('advantage')) {
        return "Why use this App? \n1. **Convenience**: Find help instantly near your location. \n2. **Trust**: See real ratings before calling. \n3. **Navigation**: Get exact directions without asking people. \n4. **Business**: Shop owners get free digital exposure.";
    }
    
    // --- DEFAULT FALLBACK ---
    return "I am not sure about that. I can help with Registration, Adding Shops, Routing (Walk/Bike/Car), Filters, or finding specific services like Plumbers or Mechanics. Try asking 'How do I route?'";
}

// Global Exports
window.showProviderDetails = showProviderDetails;
window.routeToShop = routeToShop;
window.adminDeleteUser = adminDeleteUser;
window.adminDeleteShop = adminDeleteShop;
window.renderAdminUserList = renderAdminUserList;
window.renderAdminShopList = renderAdminShopList;
window.openAddProviderModal = openAddProviderModal;
window.updateRouteDestination = updateRouteDestination;
window.setRouteProfile = setRouteProfile;
