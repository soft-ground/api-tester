// Local upload/echo API server for testing.
// A tool for actually exercising the API tester multipart file upload, etc.
// Receives and stores files with no external dependencies, and returns a summary of what it got.
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Preserve the original filename (with extension) on save → so on download the Content-Type
// can be inferred correctly from the extension (image/png, etc.) and preview works.
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}_${safe || 'file'}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// A local test tool, so CORS is opened to make it easy to poke directly from the browser
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() }),
);

// File upload (any field name) — stores files and returns a field/file summary
app.post('/upload', upload.any(), (req, res) => {
  const files = (req.files || []).map((f) => {
    let sha256 = null;
    try {
      sha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(f.path))
        .digest('hex');
    } catch {
      /* ignore */
    }
    return {
      field: f.fieldname,
      originalName: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      sha256,
      downloadUrl: `/files/${f.filename}`,
    };
  });
  res.json({
    ok: true,
    receivedAt: new Date().toISOString(),
    fields: req.body || {},
    fileCount: files.length,
    files,
  });
});

// Return the uploaded file back as the response with its original Content-Type.
// (If you upload an image, the response IS that image → viewable via the API tester preview)
app.post('/mirror', upload.any(), (req, res) => {
  const f = (req.files || [])[0];
  if (!f) return res.status(400).json({ error: 'no file part' });
  res.set('Content-Type', f.mimetype || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${f.originalname}"`);
  res.send(fs.readFileSync(path.join(UPLOAD_DIR, f.filename)));
});

// List stored files
app.get('/files', (_req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR).map((name) => {
    const st = fs.statSync(path.join(UPLOAD_DIR, name));
    return { name, size: st.size, uploadedAt: st.mtime };
  });
  res.json({ count: files.length, files });
});

// Download/inline view a stored file. res.sendFile sets the Content-Type from the extension
// (image/png, etc.), so it can be viewed in the API tester preview.
app.get('/files/:name', (req, res) => {
  const p = path.join(UPLOAD_DIR, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  res.sendFile(p);
});

// Delete all stored files
app.delete('/files', (_req, res) => {
  let cleared = 0;
  for (const n of fs.readdirSync(UPLOAD_DIR)) {
    fs.unlinkSync(path.join(UPLOAD_DIR, n));
    cleared++;
  }
  res.json({ ok: true, cleared });
});

// Echo any request (to check method/headers/query/body)
app.all('/echo', (req, res) => {
  res.json({
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body,
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () =>
  // eslint-disable-next-line no-console
  console.log(`test-api listening on :${port} (uploads → ${UPLOAD_DIR})`),
);
