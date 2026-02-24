const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || '';

app.post('/api/generate', async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!ELEVEN_API_KEY) {
        console.warn('⚠️  ELEVEN_API_KEY is not set!');
    }
});
