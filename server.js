const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { sequelize, User, Feature } = require('./database');
const jwt = require('jsonwebtoken');
const Datastore = require('@seald-io/nedb');

// Sadece UI kütüphanesini kullanacağız, jsdoc riskini attık
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Önbellek Önleyici
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const SECRET_KEY = "gizli_anahtar_123"; 

// --- NoSQL KURULUMU ---
const logsDb = new Datastore({ filename: 'activity_v2.db', autoload: true });

function logActivity(action, username, details = {}) {
    const doc = { action, user: username, timestamp: new Date(), details };
    logsDb.insert(doc, (err) => {
        if(err) console.error("❌ LOG ERROR:", err);
        else console.log(`📝 Log Saved: ${action}`);
    });
}

// --- SWAGGER AYARLARI (JSON FORMATI - BOZULMAZ) ---
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'GeoMaster API',
        version: '1.0.0',
        description: 'Spatial & Non-Spatial Data Management API'
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
        { name: 'Users', description: 'User management' },
        { name: 'Features', description: 'Spatial data operations' }
    ],
    paths: {
        '/api/register': {
            post: {
                summary: 'Create a new user',
                tags: ['Users'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' },
                                    role: { type: 'string' },
                                    color: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'User created successfully' }
                }
            }
        },
        '/api/login': {
            post: {
                summary: 'Login to system',
                tags: ['Users'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Login successful' }
                }
            }
        },
        '/api/features': {
            get: {
                summary: 'Get all spatial features',
                tags: ['Features'],
                responses: {
                    200: { description: 'List of all map features' }
                }
            },
            post: {
                summary: 'Create a new spatial feature',
                tags: ['Features'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    type: { type: 'string' },
                                    coordinates: { type: 'array', items: { type: 'number' } },
                                    createdBy: { type: 'string' },
                                    userColor: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Feature created' }
                }
            }
        },
        '/api/features/{id}': {
            put: {
                summary: 'Update a feature',
                tags: ['Features'],
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    userColor: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Feature updated' }
                }
            },
            delete: {
                summary: 'Delete a feature',
                tags: ['Features'],
                parameters: [
                    { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
                ],
                responses: {
                    200: { description: 'Feature deleted' }
                }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role, color } = req.body;
        await User.create({ username, password, role, color });
        logActivity("REGISTER", username, { role });
        res.json({ success: true, message: "Created!" });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username, password } });
    if (user) {
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
        logActivity("LOGIN", user.username, { success: true });
        res.json({ success: true, token, role: user.role, username: user.username, color: user.color });
    } else {
        logActivity("LOGIN_FAILED", username, { success: false });
        res.status(401).json({ success: false, message: "Hatalı giriş!" });
    }
});

app.get('/api/features', async (req, res) => {
    try {
        const features = await Feature.findAll();
        const parsedFeatures = features.map(f => ({ ...f.dataValues, coordinates: JSON.parse(f.coordinates) }));
        res.json(parsedFeatures);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/features', async (req, res) => {
    try {
        const { name, type, coordinates, createdBy, userColor } = req.body;
        const newFeature = await Feature.create({ name, type, coordinates: JSON.stringify(coordinates), createdBy, userColor });
        logActivity("ADD_FEATURE", createdBy, { featureName: name, type: type });
        res.json(newFeature);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/features/:id', async (req, res) => {
    try {
        const { name, userColor } = req.body;
        await Feature.update({ name, userColor }, { where: { id: req.params.id } });
        logActivity("UPDATE_FEATURE", "System", { featureId: req.params.id, newName: name });
        res.json({ success: true, message: "Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/features/:id', async (req, res) => {
    try {
        await Feature.destroy({ where: { id: req.params.id } });
        logActivity("DELETE_FEATURE", "System", { featureId: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// LOG API
app.get('/api/logs', (req, res) => {
    logsDb.find({}).sort({ timestamp: -1 }).limit(100).exec((err, docs) => {
        if (err) res.status(500).json({ error: err });
        else {
            console.log(`👀 Log Request. Count: ${docs.length}`);
            res.json(docs);
        }
    });
});

sequelize.sync().then(() => {
    app.listen(3000, () => {
        console.log("🚀 Server running on http://localhost:3000");
        console.log("📄 Swagger Docs: http://localhost:3000/api-docs");
        logActivity("SYSTEM_START", "Server", { info: "Swagger JSON Mode" });
    });
});