const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { generateJSON } = require('../lib/ai');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const id = crypto.randomBytes(12).toString('hex');
        cb(null, `${req.userId}-${id}.pdf`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok =
            file.mimetype === 'application/pdf' ||
            file.originalname.toLowerCase().endsWith('.pdf');
        cb(ok ? null : new Error('Only PDF files are accepted'), ok);
    },
});

const REPORT_TYPES = ['blood', 'urine'];

router.get('/', (req, res) => {
    const rows = db
        .prepare(
            `SELECT id, original_name, size, parsed, report_type, summary, uploaded_at, analyzed_at
             FROM blood_work WHERE user_id = ? ORDER BY uploaded_at DESC`
        )
        .all(req.userId);
    res.json({ files: rows });
});

router.get('/:id', (req, res) => {
    const row = db
        .prepare('SELECT * FROM blood_work WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.userId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    let markers = [];
    try {
        markers = row.markers_json ? JSON.parse(row.markers_json) : [];
    } catch {
        markers = [];
    }
    res.json({
        id: row.id,
        original_name: row.original_name,
        report_type: row.report_type,
        parsed: Boolean(row.parsed),
        summary: row.summary,
        nutrition_notes: row.nutrition_notes,
        markers,
        uploaded_at: row.uploaded_at,
        analyzed_at: row.analyzed_at,
    });
});

router.post('/', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const reportType = REPORT_TYPES.includes(req.body.report_type) ? req.body.report_type : 'blood';

        const info = db
            .prepare(
                `INSERT INTO blood_work (user_id, filename, original_name, size, parsed, report_type)
                 VALUES (?, ?, ?, ?, 0, ?)`
            )
            .run(req.userId, req.file.filename, req.file.originalname, req.file.size, reportType);
        const id = info.lastInsertRowid;

        res.json({
            status: 'stored',
            parsed: false,
            file: {
                id,
                original_name: req.file.originalname,
                size: req.file.size,
                report_type: reportType,
            },
            message: 'Uploaded — analyzing now. This can take a couple of minutes on a local AI model; the page updates on its own.',
        });

        // Fire-and-forget: don't make the upload wait on AI latency.
        analyzeReport(id, path.join(UPLOAD_DIR, req.file.filename), reportType).catch((e) => {
            console.error('[bloodwork] analysis failed:', e.message);
        });
    });
});

router.delete('/:id', (req, res) => {
    const row = db
        .prepare('SELECT * FROM blood_work WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.userId);
    if (row) {
        fs.rm(path.join(UPLOAD_DIR, row.filename), { force: true }, () => {});
        db.prepare('DELETE FROM blood_work WHERE id = ?').run(row.id);
    }
    res.json({ ok: true });
});

async function analyzeReport(id, filePath, reportType) {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    let text;
    try {
        const result = await parser.getText();
        text = result.text || '';
    } finally {
        await parser.destroy().catch(() => {});
    }

    const truncated = text.slice(0, 12000);

    const prompt = `You are reading a ${reportType === 'urine' ? 'urinalysis' : 'blood work'} lab report that was
extracted from a PDF as raw text below. It may be messy (columns run together, OCR artifacts) and may be in
English or Macedonian.

RAW REPORT TEXT:
"""
${truncated}
"""

TASK:
- If this text does not look like a lab report at all, return an empty markers array and say so plainly in "summary".
- Extract every lab marker you can find with its value, unit, and reference range if present.
- For each marker, flag "low" / "normal" / "high" based on the reference range (or your general medical knowledge
  if no range is printed). If you can't tell, use "normal".
- Write a 2-4 sentence plain-language summary of the overall picture, in the tone of a health-literate friend,
  not a diagnosis.
- Write 1-3 sentences of nutrition_notes: practical, food-focused suggestions tied to any flagged markers (e.g.
  "iron looks low — lean into red meat, spinach, and legumes"). If everything is normal, say so and skip advice.
- This is informational only, not medical advice — do not diagnose conditions or suggest medication changes.

Reply with ONLY valid JSON, no prose, in exactly this shape:
{
  "markers": [
    { "name": "string", "value": "string", "unit": "string or null", "refRange": "string or null", "flag": "low|normal|high" }
  ],
  "summary": "string",
  "nutrition_notes": "string"
}`;

    const parsed = await generateJSON({
        system: 'You are a careful assistant that reads lab reports and extracts structured data. You only ever reply with a single valid JSON object. You never diagnose conditions.',
        prompt,
    });

    db.prepare(
        `UPDATE blood_work SET parsed = 1, raw_text = ?, summary = ?, markers_json = ?, nutrition_notes = ?, analyzed_at = datetime('now')
         WHERE id = ?`
    ).run(
        truncated,
        parsed.summary || null,
        JSON.stringify(parsed.markers || []),
        parsed.nutrition_notes || null,
        id
    );
}

module.exports = router;
