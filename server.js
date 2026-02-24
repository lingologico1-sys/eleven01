const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIG — set these as environment variables
// ============================================================
const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || '';
const APP_PASSWORD = process.env.APP_PASSWORD || 'changeme';
const TOKEN_EXPIRY_DAYS = 30;

// ============================================================
// AUTH HELPERS
// ============================================================
function createToken() {
    const expiresAt = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const payload = String(expiresAt);
    const sig = crypto.createHmac('sha256', APP_PASSWORD).update(payload).digest('hex');
    return Buffer.from(payload).toString('base64') + '.' + sig;
}

function verifyToken(token) {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [payloadB64, sig] = parts;
    let payload;
    try {
        payload = Buffer.from(payloadB64, 'base64').toString();
    } catch {
        return false;
    }

    const expected = crypto.createHmac('sha256', APP_PASSWORD).update(payload).digest('hex');
    if (sig !== expected) return false;

    const expiresAt = parseInt(payload, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    return true;
}

function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verifyToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ============================================================
// ROUTES
// ============================================================

// Login
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (!password || password !== APP_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    res.json({ token: createToken() });
});

// Verify token
app.get('/api/auth/verify', (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (verifyToken(token)) {
        res.json({ ok: true });
    } else {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// Generate audio (auth required)
app.post('/api/generate', requireAuth, async (req, res) => {
    try {
        const { voiceId, text, stability, similarity_boost, style, use_speaker_boost } = req.body;

        if (!voiceId || !text) {
            return res.status(400).json({ error: 'voiceId and text are required' });
        }

        if (!ELEVEN_API_KEY) {
            return res.status(500).json({ error: 'ELEVEN_API_KEY not set in environment variables' });
        }

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

        const apiResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVEN_API_KEY
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_v3',
                voice_settings: {
                    stability: stability ?? 0.5,
                    similarity_boost: similarity_boost ?? 0.75,
                    style: style ?? 0.0,
                    use_speaker_boost: use_speaker_boost !== false
                }
            })
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return res.status(apiResponse.status).json({
                error: `ElevenLabs API Error: ${apiResponse.status} - ${errText}`
            });
        }

        const data = await apiResponse.json();
        res.json(data);

    } catch (err) {
        console.error('Generate error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!ELEVEN_API_KEY) {
        console.warn('⚠️  ELEVEN_API_KEY is not set! Add it to your environment variables.');
    }
    console.log(`Password: ${APP_PASSWORD === 'changeme' ? '⚠️  Using default "changeme" — set APP_PASSWORD env var!' : '✓ Custom password set'}`);
});
