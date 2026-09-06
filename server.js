// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const SECRET = "IXL_CHEAT_SECRET_2024";
const ADMIN_USER = "admin";
const ADMIN_PASS = "password123"; // change this

const DB_FILE = path.join(__dirname, 'keys.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));

function loadDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [user, pass] = token.split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
    return res.status(401).json({ error: 'Invalid credentials' });
}

// Generate key with Tempest- prefix
app.post('/api/generate-key', auth, (req, res) => {
    const { durationMs } = req.body;
    if (!durationMs || durationMs < 60000) return res.status(400).json({ error: 'Invalid duration' });

    const id = crypto.randomBytes(4).toString('hex');
    const payload = JSON.stringify({ id, duration: durationMs, checksum: checksum(id + '|' + durationMs) });
    let obfuscated = '';
    for (let i = 0; i < payload.length; i++) {
        obfuscated += String.fromCharCode(payload.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
    }
    const base64Part = Buffer.from(obfuscated).toString('base64').replace(/=+$/, '');
    const key = 'Tempest-' + base64Part;

    const db = loadDB();
    db.keys.push({ id, fullKey: key, created: Date.now(), duration: durationMs, revoked: false });
    saveDB(db);
    res.json({ key, expiresIn: durationMs });
});

// Validate key
app.get('/api/validate-key', (req, res) => {
    let { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    if (key.startsWith('Tempest-')) key = key.slice('Tempest-'.length);

    let decoded;
    try {
        const obfuscated = Buffer.from(key, 'base64').toString();
        let payload = '';
        for (let i = 0; i < obfuscated.length; i++)
            payload += String.fromCharCode(obfuscated.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
        decoded = JSON.parse(payload);
    } catch(e) { return res.json({ valid: false, reason: 'Invalid key' }); }

    const { id, duration, checksum: storedChecksum } = decoded;
    if (checksum(id + '|' + duration) !== storedChecksum) return res.json({ valid: false, reason: 'Invalid key' });

    const db = loadDB();
    const keyData = db.keys.find(k => k.id === id);
    if (!keyData) return res.json({ valid: false, reason: 'Key not found' });
    if (keyData.revoked) return res.json({ valid: false, reason: 'Key revoked' });

    if (!keyData.activatedAt) { keyData.activatedAt = Date.now(); saveDB(db); }
    const elapsed = Date.now() - keyData.activatedAt;
    if (elapsed > duration) return res.json({ valid: false, reason: 'Key expired' });

    res.json({ valid: true, remainingMs: duration - elapsed });
});

// Revoke key
app.post('/api/revoke-key', auth, (req, res) => {
    const { keyId } = req.body;
    const db = loadDB();
    const key = db.keys.find(k => k.id === keyId);
    if (!key) return res.status(404).json({ error: 'Key not found' });
    key.revoked = true;
    saveDB(db);
    res.json({ success: true });
});

// List keys
app.get('/api/keys', auth, (req, res) => {
    const db = loadDB();
    const keys = db.keys.map(k => ({
        id: k.id,
        fullKey: k.fullKey || null,
        created: k.created,
        duration: k.duration,
        revoked: k.revoked,
        activatedAt: k.activatedAt || null,
        status: k.revoked ? 'revoked' : (k.activatedAt && Date.now() - k.activatedAt > k.duration) ? 'expired' : 'active'
    }));
    res.json(keys);
});

// Clear all keys
app.get('/api/clear-keys', auth, (req, res) => {
    saveDB({ keys: [] });
    res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/script.user.js', (req, res) => {
    res.type('text/javascript');
    res.sendFile(path.join(__dirname, 'public', 'script.user.js'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function checksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash + str.charCodeAt(i) * (i + 1)) % 1000000007;
    return hash;
}
