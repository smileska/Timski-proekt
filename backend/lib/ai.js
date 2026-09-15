// AI provider abstraction. Give the app one job — "turn this prompt into JSON" —
// and let it run against either a local Ollama model (free, default) or the
// Anthropic API (better, paid). Flip providers with AI_PROVIDER or just by
// setting ANTHROPIC_API_KEY.
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const PROVIDER = (
    process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'ollama')
).toLowerCase();

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

class AIError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AIError';
        this.userMessage = message;
    }
}

function aiStatus() {
    if (PROVIDER === 'anthropic') {
        return { provider: 'anthropic', model: ANTHROPIC_MODEL, ready: Boolean(anthropic) };
    }
    return { provider: 'ollama', model: OLLAMA_MODEL, ready: true };
}

function parseLoose(text) {
    if (!text) throw new AIError('The AI returned an empty response.');
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new AIError('The AI response was not valid JSON.');
        return JSON.parse(text.slice(start, end + 1));
    }
}

async function generateJSON({ system, prompt }) {
    if (PROVIDER === 'anthropic') {
        if (!anthropic) {
            throw new AIError('AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.');
        }
        const res = await anthropic.messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 4000,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            system,
            messages: [{ role: 'user', content: prompt }],
        });
        const text = res.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
        return parseLoose(text);
    }

    // Ollama (local)
    try {
        const { data } = await axios.post(
            `${OLLAMA_URL}/api/generate`,
            {
                model: OLLAMA_MODEL,
                prompt: `${system}\n\n${prompt}`,
                stream: false,
                format: 'json',
                options: { temperature: 0.4 },
            },
            { timeout: 240000 } // big local models can be slow on the first call
        );
        return parseLoose(data.response);
    } catch (err) {
        if (err instanceof AIError) throw err;
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
            throw new AIError(
                `Can't reach Ollama at ${OLLAMA_URL}. Install it, run "ollama serve", and "ollama pull ${OLLAMA_MODEL}".`
            );
        }
        if (err.response?.status === 404) {
            throw new AIError(`Ollama model "${OLLAMA_MODEL}" isn't pulled. Run: ollama pull ${OLLAMA_MODEL}`);
        }
        throw new AIError('The local AI model failed to respond. Check the Ollama server.');
    }
}

module.exports = { generateJSON, aiStatus, AIError };
