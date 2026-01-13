const API_URL = "http://localhost:3000/api";
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
const userColor = localStorage.getItem('userColor') || '#2563eb';
const userRole = localStorage.getItem('role') || 'viewer';

if (!token) window.location.href = "login.html";

// --- KULLANICI BİLGİSİ ---
const userDisplay = document.getElementById('userDisplay');
userDisplay.innerHTML = `${username} <small>(${userRole})</small>`;
userDisplay.style.color = userColor;
userDisplay.style.textShadow = `0 0 10px ${userColor}`;

// Viewer Modu Kontrolü
if (userRole === 'viewer') {
    window.onload = function() {
         const drawPanel = document.querySelector('.draw-buttons'); // HTML'deki class ile eşleşmeli
         if(drawPanel) drawPanel.style.display = 'none';
         // Alternatif olarak id ile bulup gizle
         const panelSection = document.querySelector('.panel-section');
         if(panelSection && panelSection.innerHTML.includes('DRAWING')) panelSection.style.display = 'none';
    };
}

// --- HARİTA ---
const map = L.map('map', { zoomControl: false }).setView([39.93, 32.85], 6);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, attribution: 'GeoMaster'
}).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);

// Katmanlar
const drawnItems = new L.FeatureGroup().addTo(map); // Yeni çizilen
const dbLayer = new L.FeatureGroup().addTo(map);    // Veritabanından gelen
let allFeaturesData = []; // Arama için verileri burada tutacağız

// --- ÇİZİM ---
let currentDrawer = null;

function startCustomDraw(type) {
    if (userRole === 'viewer') { alert("View Only Mode"); return; }
    if (currentDrawer) currentDrawer.disable();

    if (type === 'marker') currentDrawer = new L.Draw.Marker(map);
    else if (type === 'polyline') currentDrawer = new L.Draw.Polyline(map, { shapeOptions: { color: userColor } });
    else if (type === 'polygon') currentDrawer = new L.Draw.Polygon(map, { shapeOptions: { color: userColor } });

    if (currentDrawer) {
        currentDrawer.enable();
        document.getElementById('cancelDrawBtn').style.display = 'block';
    }
}

function cancelDrawing() {
    if (currentDrawer) currentDrawer.disable();
    document.getElementById('cancelDrawBtn').style.display = 'none';
}

// Çizim bitince
let tempLayer = null;
let tempType = null;

map.on(L.Draw.Event.CREATED, function (e) {
    if (userRole === 'viewer') return;

    tempLayer = e.layer;
    tempType = e.layerType;
    
    drawnItems.addLayer(tempLayer);
    document.getElementById('cancelDrawBtn').style.display = 'none';
    
    // Modal Aç
    document.getElementById('saveModal').style.display = 'flex';
    document.getElementById('featureNameInput').focus();
});

// --- KAYDET (DÜNKÜ YÖNTEM: MANUEL KOORDİNAT) ---
async function confirmSave() {
    const name = document.getElementById('featureNameInput').value;
    if (!name) { alert("Name required!"); return; }

    let coords;
    // GeoJSON kullanmıyoruz! Direkt Leaflet koordinatlarını alıyoruz [Lat, Lng]
    if (tempType === 'marker') {
        const ll = tempLayer.getLatLng();
        coords = [ll.lat, ll.lng]; 
    } else {
        // Çizgi ve Poligon için
        const latlngs = tempLayer.getLatLngs();
        // Poligon bazen iç içe array döndürür, düzeltelim
        if (tempType === 'polygon') coords = latlngs[0]; 
        else coords = latlngs;
    }

    const payload = {
        name: name,
        type: tempType, // 'marker', 'polyline', 'polygon' olarak kaydediyoruz
        coordinates: coords, 
        createdBy: username,
        userColor: userColor
    };

    try {
        const res = await fetch(`${API_URL}/features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal();
            drawnItems.clearLayers();
            loadFeatures(); // Listeyi yenile
        } else { alert("Save Failed"); }
    } catch (e) { alert("Error"); }
}

function closeModal() {
    document.getElementById('saveModal').style.display = 'none';
    document.getElementById('featureNameInput').value = "";
    if (tempLayer) drawnItems.removeLayer(tempLayer);
}

// --- YÜKLE (MANUEL RENDER) ---
async function loadFeatures() {
    dbLayer.clearLayers();
    try {
        const res = await fetch(`${API_URL}/features`);
        const data = await res.json();
        allFeaturesData = data; // Arama için sakla

        data.forEach(item => {
            let layer;
            // Kaydettiğimiz tiplere göre elle oluşturuyoruz (GeoJSON yok)
            if (item.type === 'marker') {
                layer = L.marker(item.coordinates);
            } else if (item.type === 'polyline') {
                layer = L.polyline(item.coordinates, { color: item.userColor, weight: 4 });
            } else if (item.type === 'polygon') {
                layer = L.polygon(item.coordinates, { color: item.userColor });
            }

            if (layer) {
                // Silme butonu (Sadece sahibi veya admin)
                let delBtn = '';
                if (userRole === 'admin' || item.createdBy === username) {
                    delBtn = `<button onclick="deleteFeature('${item._id}')" style="background:red; color:white; width:100%; border:none; margin-top:5px; cursor:pointer;">DELETE</button>`;
                }

                layer.bindPopup(`
                    <div style="text-align:center;">
                        <b style="color:${item.userColor}">${item.name}</b><br>
                        <small>User: ${item.createdBy}</small><br>
                        ${delBtn}
                    </div>
                `);
                
                // Layer'a veriyi iliştir (Arama için lazım olacak)
                layer.featureData = item;
                dbLayer.addLayer(layer);
            }
        });

    } catch (e) { console.error(e); }
}

async function deleteFeature(id) {
    if(!confirm("Delete this feature?")) return;
    await fetch(`${API_URL}/features/${id}`, { method: 'DELETE' });
    loadFeatures();
}

// --- ARAMA (DÜZELTİLDİ: LİSTE FİLTRELEME) ---
function searchFeature() {
    const txt = document.getElementById('searchInput').value.toLowerCase();
    if (!txt) return;

    let found = false;
    
    // dbLayer içindeki her bir layer'ı kontrol et
    dbLayer.eachLayer(layer => {
        if (layer.featureData && layer.featureData.name.toLowerCase().includes(txt)) {
            // Bulundu!
            if (layer.getBounds) map.fitBounds(layer.getBounds());
            else if (layer.getLatLng) { map.setView(layer.getLatLng(), 16); }
            
            layer.openPopup();
            found = true;
        }
    });

    if(!found) alert("Not found: " + txt);
}

// --- DİĞERLERİ ---
function locateUser() {
    map.locate({setView: true, maxZoom: 16});
}
map.on('locationfound', e => L.circle(e.latlng, {radius: e.accuracy/2}).addTo(map).bindPopup("You are here").openPopup());
map.on('locationerror', e => alert("Location denied"));

map.on('mousemove', e => document.getElementById('coordsBox').innerText = `Lat: ${e.latlng.lat.toFixed(5)} | Lng: ${e.latlng.lng.toFixed(5)}`);

function toggleLogs() {
    const d = document.getElementById('logArea');
    const b = document.getElementById('logToggleBtn');
    if(d.style.display === 'none' || !d.style.display) {
        d.style.display = 'block'; b.innerText = "Hide Logs"; fetchLogs();
    } else {
        d.style.display = 'none'; b.innerText = "Show Logs";
    }
}
async function fetchLogs() {
    const d = document.getElementById('logArea'); d.innerHTML = "Loading...";
    try {
        const res = await fetch(`${API_URL}/logs`);
        const logs = await res.json();
        d.innerHTML = "";
        logs.forEach(l => {
            let det = l.details && l.details.featureName ? `(${l.details.featureName})` : "";
            d.innerHTML += `<div class="log-item"><b>${l.action}</b>: ${l.user} ${det}</div>`;
        });
    } catch(e) {}
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    document.getElementById('themeBtn').innerText = document.body.classList.contains('dark-mode') ? "🌙" : "☀️";
}

function logout() { localStorage.clear(); window.location.href = "login.html"; }

// BAŞLAT
loadFeatures();