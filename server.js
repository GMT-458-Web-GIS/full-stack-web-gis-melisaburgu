const express = require('express');
const Datastore = require('@seald-io/nedb');
const cors = require('cors');
const path = require('path');
const { performance } = require('perf_hooks'); // Kronometre için

// --- SWAGGER KÜTÜPHANESİ ---
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- VERİTABANLARI (NeDB) ---
const dbUsers = new Datastore({ filename: 'users.db', autoload: true });
const dbFeatures = new Datastore({ filename: 'features.db', autoload: true });
const dbLogs = new Datastore({ filename: 'activity_v2.db', autoload: true });

function logActivity(user, action, details = {}) {
    dbLogs.insert({ user, action, details, timestamp: new Date() });
}

// --- SWAGGER AYARLARI (JSON FORMATI - HATASIZ) ---
const swaggerDocument = {
    openapi: '3.0.0',
    info: { 
        title: 'GeoMaster API', 
        version: '1.0.0', 
        description: 'GeoMaster Projesi API Dokümantasyonu (Final Version)' 
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
        { name: 'Users', description: 'Kullanıcı İşlemleri' },
        { name: 'Features', description: 'Harita CRUD İşlemleri' },
        { name: 'Performance', description: 'Performans Testleri' },
        { name: 'GeoServer Integration', description: 'WFS & WMS Servis Simülasyonu' }
    ],
    paths: {
        // --- KULLANICI İŞLEMLERİ ---
        '/api/register': {
            post: {
                summary: 'Kullanıcı Kaydı',
                tags: ['Users'],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' }, role: { type: 'string' }, color: { type: 'string' } } } } } },
                responses: { 200: { description: 'Başarılı' } }
            }
        },
        '/api/login': {
            post: {
                summary: 'Giriş Yap',
                tags: ['Users'],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' } } } } } },
                responses: { 200: { description: 'Başarılı' } }
            }
        },
        // --- HARİTA İŞLEMLERİ (CRUD) ---
        '/api/features': {
            get: { 
                summary: 'Tüm çizimleri getir (Filtreleme Destekli)', 
                description: 'İsterseniz ?type=Point şeklinde filtreleyebilirsiniz.',
                tags: ['Features'], 
                parameters: [{ in: 'query', name: 'type', schema: { type: 'string' }, description: 'Point, LineString veya Polygon' }],
                responses: { 200: { description: 'Liste' } } 
            },
            post: { 
                summary: 'Yeni çizim ekle (Create)', 
                tags: ['Features'], 
                responses: { 200: { description: 'Eklendi' } } 
            }
        },
        '/api/features/{id}': {
            // YENİ EKLENEN UPDATE (PUT) METODU
            put: {
                summary: 'Çizimi Güncelle (Update)',
                tags: ['Features'],
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, userColor: { type: 'string' } } } } } },
                responses: { 200: { description: 'Güncellendi' } }
            },
            delete: {
                summary: 'Çizim sil (Delete)', 
                tags: ['Features'], 
                parameters: [{ in: 'path', name: 'id', schema: { type: 'string' } }], 
                responses: { 200: { description: 'Silindi' } } 
            }
        },
        '/api/logs': { get: { summary: 'Loglar', responses: { 200: { description: 'Loglar' } } } },
        
        // --- PERFORMANS TESTLERİ ---
        '/api/perf/seed': { post: { summary: '1. ADIM: 50.000 Veri Ekle', tags: ['Performance'], responses: { 200: { description: 'Veri basıldı' } } } },
        '/api/perf/no-index': { get: { summary: '2. ADIM: İndekssiz Arama Yap', tags: ['Performance'], responses: { 200: { description: 'Süre sonucu' } } } },
        '/api/perf/add-index': { post: { summary: '3. ADIM: İndeks Ekle', tags: ['Performance'], responses: { 200: { description: 'İndeks eklendi' } } } },
        '/api/perf/with-index': { get: { summary: '4. ADIM: İndeksli Arama Yap', tags: ['Performance'], responses: { 200: { description: 'Süre sonucu' } } } },

        // --- GEOSERVER INTEGRATION ---
        '/geoserver/wfs': { get: { summary: 'GeoServer WFS (GeoJSON)', tags: ['GeoServer Integration'], responses: { 200: { description: 'GeoJSON FeatureCollection' } } } },
        '/geoserver/wms': { get: { summary: 'GeoServer WMS (Capabilities XML)', tags: ['GeoServer Integration'], responses: { 200: { description: 'WMS XML Response' } } } }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- API KODLARI ---

app.post('/api/register', (req, res) => {
    const { username, password, role, color } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    if (!/[A-Z]/.test(password)) return res.status(400).json({ error: 'Password needs Uppercase' });
    
    dbUsers.findOne({ username }, (err, doc) => {
        if (doc) return res.status(400).json({ error: 'Username taken' });
        dbUsers.insert({ username, password, role: role || 'viewer', color: color || '#00f3ff' }, (err) => {
            logActivity(username, 'REGISTER', { success: true });
            res.json({ success: true });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    dbUsers.findOne({ username, password }, (err, user) => {
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        logActivity(username, 'LOGIN', { success: true });
        res.json({ success: true, token: 'valid', username: user.username, role: user.role, color: user.color });
    });
});

// --- CRUD OPERASYONLARI ---

// 1. READ (GET) & FILTERING
app.get('/api/features', (req, res) => { 
    const query = {};
    // Eğer adres çubuğunda ?type=Point yazarsa filtre uygula
    if (req.query.type) {
        query.type = req.query.type;
    }
    dbFeatures.find(query, (err, docs) => res.json(docs)); 
});

// 2. CREATE (POST)
app.post('/api/features', (req, res) => {
    dbFeatures.insert(req.body, (err, doc) => {
        logActivity(req.body.createdBy, 'ADD_FEATURE', { featureName: req.body.name });
        res.json(doc);
    });
});

// 3. UPDATE (PUT) - YENİ EKLENDİ
app.put('/api/features/:id', (req, res) => {
    dbFeatures.update({ _id: req.params.id }, { $set: req.body }, {}, (err, numReplaced) => {
        if (err) return res.status(500).json({ error: 'Update failed' });
        logActivity('System', 'UPDATE_FEATURE', { id: req.params.id });
        res.json({ success: true, message: 'Feature updated' });
    });
});

// 4. DELETE (DELETE)
app.delete('/api/features/:id', (req, res) => {
    dbFeatures.remove({ _id: req.params.id }, {}, () => res.json({ success: true }));
});

app.get('/api/logs', (req, res) => dbLogs.find({}).sort({ timestamp: -1 }).exec((err, docs) => res.json(docs)));


// --- PERFORMANS TESTİ KODLARI ---
app.post('/api/perf/seed', (req, res) => {
    const dummyData = [];
    dummyData.push({ name: 'TARGET_DATA', type: 'Point', coordinates: [30, 40], createdBy: 'System', userColor: '#ff0000' });
    for (let i = 0; i < 49999; i++) {
        dummyData.push({ name: `Junk_${i}`, type: 'Point', coordinates: [Math.random() * 90, Math.random() * 180], createdBy: 'Bot', userColor: '#000000' });
    }
    dbFeatures.insert(dummyData, (err) => {
        if (err) return res.status(500).json({ error: 'Seed failed' });
        console.log("✅ 50.000 veri veritabanına eklendi!");
        res.json({ message: '50.000 Data Generated Successfully!' });
    });
});

app.get('/api/perf/no-index', (req, res) => {
    dbFeatures.removeIndex('name', (err) => {
        const start = performance.now();
        dbFeatures.find({ name: 'TARGET_DATA' }, (err, docs) => {
            const end = performance.now();
            const duration = (end - start).toFixed(4);
            console.log(`🐢 İndekssiz Arama Süresi: ${duration} ms`);
            res.json({ mode: 'WITHOUT INDEX', time_ms: duration, resultCount: docs.length });
        });
    });
});

app.post('/api/perf/add-index', (req, res) => {
    dbFeatures.ensureIndex({ fieldName: 'name' }, (err) => {
        console.log("🚀 İndeks (B-Tree) oluşturuldu!");
        res.json({ message: 'Index Created on field "name"' });
    });
});

app.get('/api/perf/with-index', (req, res) => {
    const start = performance.now();
    dbFeatures.find({ name: 'TARGET_DATA' }, (err, docs) => {
        const end = performance.now();
        const duration = (end - start).toFixed(4);
        console.log(`🐇 İndeksli Arama Süresi: ${duration} ms`);
        res.json({ mode: 'WITH INDEX', time_ms: duration, resultCount: docs.length });
    });
});


// ==========================================
// 🌍 GEOSERVER INTEGRATION (WFS & WMS SIMULATION) 🌍
// ==========================================

// 1. WFS Service (Web Feature Service)
app.get('/geoserver/wfs', (req, res) => {
    dbFeatures.find({}, (err, docs) => {
        if (err) return res.status(500).send("Error");

        const geoJSON = {
            type: "FeatureCollection",
            totalFeatures: docs.length,
            features: docs.map(doc => ({
                type: "Feature",
                id: doc._id,
                geometry: {
                    type: doc.type,
                    coordinates: doc.coordinates
                },
                properties: {
                    name: doc.name,
                    createdBy: doc.createdBy,
                    color: doc.userColor,
                    timestamp: new Date().toISOString()
                }
            }))
        };
        
        console.log("🌍 WFS Request: GeoJSON served.");
        res.json(geoJSON);
    });
});

// 2. WMS Service (Web Map Service) - DÜZELTİLMİŞ FİNAL HALİ
app.get('/geoserver/wms', (req, res) => {
    const wmsCapabilities = `
    <?xml version="1.0" encoding="UTF-8"?>
    <WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
        <Service>
            <Name>GeoMaster_Node_WMS</Name>
            <Title>GeoMaster Custom Map Service</Title>
            <Abstract>Lightweight Node.js based WMS for Student Project</Abstract>
        </Service>
        <Capability>
            <Request>
                <GetCapabilities>
                    <Format>text/xml</Format>
                    <DCPType><HTTP><Get><OnlineResource xlink:href="http://localhost:3000/geoserver/wms"/></Get></HTTP></DCPType>
                </GetCapabilities>
            </Request>
            <Layer>
                <Title>GeoMaster Features</Title>
                <CRS>EPSG:4326</CRS>
                <EX_GeographicBoundingBox>
                    <westBoundLongitude>-180</westBoundLongitude>
                    <eastBoundLongitude>180</eastBoundLongitude>
                    <southBoundLatitude>-90</southBoundLatitude>
                    <northBoundLatitude>90</northBoundLatitude>
                </EX_GeographicBoundingBox>
            </Layer>
        </Capability>
    </WMS_Capabilities>
    `;
    
    console.log("🗺️ WMS Request: Capabilities served.");
    res.set('Content-Type', 'text/xml');
    res.send(wmsCapabilities.trim());
});

// --- BAŞLAT ---
app.listen(3000, () => {
    console.log('--------------------------------------------------');
    console.log('✅ Server running on http://localhost:3000');
    console.log('📄 Swagger Docs:     http://localhost:3000/api-docs');
    console.log('--------------------------------------------------');
});