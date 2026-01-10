let map, featureGroup; 
let currentUser = null, currentRole = null, userColor = '#3498db'; 
let allFeatures = [], drawMode = null, tempLatLngs = [], tempLayer = null; 
let layers = {}, currentLayerType = 'street';

const API_URL = "http://localhost:3000/api";

function toggleAuth() {
    const l = document.getElementById('login-form'), r = document.getElementById('register-form');
    l.style.display = l.style.display === 'none' ? 'block' : 'none';
    r.style.display = r.style.display === 'none' ? 'block' : 'none';
}

async function register() {
    const username = document.getElementById('r-username').value;
    const password = document.getElementById('r-password').value;
    const role = document.getElementById('r-role').value;
    const color = document.getElementById('r-color').value;
    const res = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, role, color }) });
    const data = await res.json();
    if(data.success) { alert("Success! Please Login."); toggleAuth(); } else { alert(data.error); }
}

async function login() {
    const username = document.getElementById('l-username').value;
    const password = document.getElementById('l-password').value;
    const res = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (data.success) {
        currentUser = data.username; currentRole = data.role; userColor = data.color;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        document.getElementById('display-user').innerText = currentUser;
        document.getElementById('display-role').innerText = currentRole;
        document.getElementById('user-avatar').style.background = userColor;
        document.getElementById('user-avatar').innerText = currentUser[0].toUpperCase();
        initMap();
    } else { alert(data.message); }
}
function logout() { location.reload(); }

function initMap() {
    map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([39.92, 32.85], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    layers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    layers.street.addTo(map);
    featureGroup = L.layerGroup().addTo(map);
    loadFeatures();

    map.on('mousemove', (e) => {
        document.getElementById('mouse-lat').innerText = e.latlng.lat.toFixed(4);
        document.getElementById('mouse-lng').innerText = e.latlng.lng.toFixed(4);
    });

    map.on('click', (e) => {
        if (!drawMode) return;
        if (currentRole === 'viewer') { alert("Viewers cannot edit!"); return; }
        if (drawMode === 'point') { saveFeature('point', [e.latlng.lat, e.latlng.lng]); } 
        else if (drawMode === 'line' || drawMode === 'polygon') {
            tempLatLngs.push([e.latlng.lat, e.latlng.lng]);
            if (tempLayer) map.removeLayer(tempLayer);
            if (drawMode === 'line') tempLayer = L.polyline(tempLatLngs, { color: userColor, weight: 4 }).addTo(map);
            else tempLayer = L.polygon(tempLatLngs, { color: userColor, fillColor: userColor, fillOpacity: 0.2 }).addTo(map);
            updateFinishButton(true);
        }
    });
    map.on('dblclick', (e) => { if (drawMode === 'line' || drawMode === 'polygon') { L.DomEvent.stopPropagation(e); finishDrawing(); } });
}

// --- LOG FONKSİYONU (ZORLA YENİLEME EKLENDİ) ---
async function showLogs() {
    const modal = document.getElementById('log-modal');
    const content = document.getElementById('log-content');
    
    modal.style.display = 'flex';
    content.innerHTML = '<div style="padding:20px; color:#f1c40f;">Loading data...</div>';

    try {
        // TRICK: URL'in sonuna rastgele sayı ekliyoruz (?t=...) 
        // Böylece tarayıcı "Bu yeni bir istek" diyip sunucuya gitmek ZORUNDA kalıyor.
        const res = await fetch(`${API_URL}/logs?t=${new Date().getTime()}`);
        
        if(!res.ok) throw new Error("Server connection failed");
        
        const logs = await res.json();
        
        if (logs.length === 0) {
            content.innerHTML = '<div style="padding:20px; color:#aaa; text-align:center;">📭 <b>Database is empty.</b><br>Create an account, Login, or Add Features to generate logs.</div>';
            return;
        }

        let html = '<ul style="list-style:none; padding:0;">';
        logs.forEach(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            let color = '#ccc';
            if(log.action === 'LOGIN') color = '#2ecc71';
            if(log.action === 'SYSTEM_START') color = '#9b59b6'; // Mor renk
            if(log.action === 'REGISTER') color = '#f1c40f';
            if(log.action === 'ADD_FEATURE') color = '#3498db';
            if(log.action === 'DELETE_FEATURE') color = '#e74c3c';

            html += `
                <li style="border-bottom:1px solid #444; padding:10px; font-family:monospace;">
                    <span style="color:#666;">[${time}]</span> 
                    <strong style="color:${color}">${log.action}</strong>
                    <div style="font-size:11px; color:#999; margin-left:10px;">
                        User: ${log.user} <br> 
                        Info: ${JSON.stringify(log.details)}
                    </div>
                </li>`;
        });
        html += '</ul>';
        content.innerHTML = html;

    } catch (err) {
        content.innerHTML = `<div style="padding:20px; color:red;">❌ Error: ${err.message}</div>`;
    }
}

function closeLogs() {
    document.getElementById('log-modal').style.display = 'none';
}

function changeLayer(type) {
    currentLayerType = type;
    document.getElementById('btn-street').classList.toggle('active', type === 'street');
    document.getElementById('btn-sat').classList.toggle('active', type === 'satellite');
    map.removeLayer(layers.street); map.removeLayer(layers.satellite);
    if(type === 'street') layers.street.addTo(map); else layers.satellite.addTo(map);
}
function locateMe() {
    if(!navigator.geolocation) return alert("No GPS");
    navigator.geolocation.getCurrentPosition(pos => { map.flyTo([pos.coords.latitude, pos.coords.longitude], 14); L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(map).bindPopup("Here!").openPopup(); });
}
function zoomToHome() { map.flyTo([39.92, 32.85], 6); }
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const icon = document.getElementById('theme-icon');
    icon.classList.toggle('fa-sun'); icon.classList.toggle('fa-moon');
    icon.style.color = document.body.classList.contains('light-mode') ? 'orange' : 'white';
}
function setDrawMode(mode) {
    if(currentRole === 'viewer') { alert("Denied"); return; }
    drawMode = mode; document.getElementById('current-mode').innerText = mode ? mode.toUpperCase() : 'READY';
    tempLatLngs = []; if(tempLayer) map.removeLayer(tempLayer); updateFinishButton(false);
    if (mode) { map.doubleClickZoom.disable(); map.getContainer().style.cursor = 'crosshair'; } 
    else { map.doubleClickZoom.enable(); map.getContainer().style.cursor = ''; }
}
function updateFinishButton(show) {
    let btn = document.getElementById('finish-btn');
    if (!btn) {
        const dock = document.querySelector('.dock-buttons');
        btn = document.createElement('button'); btn.id = 'finish-btn'; btn.className = 'tool-btn';
        btn.innerHTML = '<i class="fa-solid fa-check"></i>'; btn.style.background = '#2ecc71';
        btn.onclick = finishDrawing; dock.appendChild(btn);
    }
    btn.style.display = show ? 'block' : 'none';
}
function finishDrawing() { if (tempLatLngs.length > 1) { saveFeature(drawMode, tempLatLngs); } else { alert("Points needed!"); } }
async function saveFeature(type, coords) {
    if(tempLayer) map.removeLayer(tempLayer);
    setTimeout(async () => {
        const name = prompt(`Name for ${type}:`);
        if(!name) { tempLatLngs = []; setDrawMode(null); loadFeatures(); return; }
        await fetch(`${API_URL}/features`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type, coordinates: coords, createdBy: currentUser, userColor: userColor }) });
        setDrawMode(null); loadFeatures();
    }, 50);
}
async function loadFeatures() {
    featureGroup.clearLayers();
    const res = await fetch(`${API_URL}/features`);
    const data = await res.json();
    allFeatures = data; renderData(data);
}
function renderData(features) {
    featureGroup.clearLayers();
    document.getElementById('feature-count').innerText = features.length;
    features.forEach(f => {
        let layer; const color = f.userColor || '#3498db';
        if (f.type === 'point') layer = L.circleMarker(f.coordinates, { radius: 8, color: color, fillColor: color, fillOpacity: 0.8 });
        else if (f.type === 'line') layer = L.polyline(f.coordinates, { color: color, weight: 5 });
        else if (f.type === 'polygon') layer = L.polygon(f.coordinates, { color: color, fillColor: color, fillOpacity: 0.4 });
        if(layer) {
            let popup = `<b>${f.name}</b> (${f.type})<br>User: ${f.createdBy}`;
            if(currentRole !== 'viewer') popup += `<br><button onclick="deleteFeature(${f.id})" style="color:red">DELETE</button>`;
            layer.bindPopup(popup).addTo(featureGroup);
        }
    });
}
function filterFeatures() { const searchText = document.getElementById('search-input').value.toLowerCase(); renderData(allFeatures.filter(f => f.name.toLowerCase().includes(searchText))); }
async function deleteFeature(id) { if(confirm("Delete?")) { await fetch(`${API_URL}/features/${id}`, { method: 'DELETE' }); loadFeatures(); } }