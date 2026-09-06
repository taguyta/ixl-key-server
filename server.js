const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const SECRET = "IXL_CHEAT_SECRET_2024"; // not used for key obfuscation now
const ADMIN_USER = "tempest";
const ADMIN_PASS = "20Rudd09"; // change this

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

// Generate short random key with prefix
app.post('/api/generate-key', auth, (req, res) => {
    const { durationMs } = req.body;
    if (!durationMs || durationMs < 60000) return res.status(400).json({ error: 'Invalid duration' });

    const randomPart = crypto.randomBytes(6).toString('base64url'); // 8 chars
    const key = 'Tempest-' + randomPart;

    const db = loadDB();
    db.keys.push({
        id: randomPart,
        fullKey: key,
        created: Date.now(),
        duration: durationMs,
        revoked: false,
        activatedAt: null
    });
    saveDB(db);

    res.json({ key, expiresIn: durationMs });
});

// Validate key (lookup exact key)
app.get('/api/validate-key', (req, res) => {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing key' });

    const db = loadDB();
    const keyData = db.keys.find(k => k.fullKey === key);
    if (!keyData) return res.json({ valid: false, reason: 'Invalid key' });
    if (keyData.revoked) return res.json({ valid: false, reason: 'Key revoked' });

    if (!keyData.activatedAt) {
        keyData.activatedAt = Date.now();
        saveDB(db);
    }
    const elapsed = Date.now() - keyData.activatedAt;
    if (elapsed > keyData.duration) return res.json({ valid: false, reason: 'Key expired' });

    res.json({ valid: true, remainingMs: keyData.duration - elapsed });
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
        fullKey: k.fullKey,
        created: k.created,
        duration: k.duration,
        revoked: k.revoked,
        activatedAt: k.activatedAt,
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
