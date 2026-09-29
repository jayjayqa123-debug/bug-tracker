// Attachments for a ticket: links, images and videos.
// Mounted at /api/tickets/:id/attachments  (see routes/tickets.js)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authRequired, qaRequired } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_IMAGE = 10 * 1024 * 1024;   // 10 MB
const MAX_VIDEO = 100 * 1024 * 1024;  // 100 MB

// Allowed upload types: mime -> [attachment type, file extension]
const FILE_TYPES = {
  'image/jpeg': ['image', '.jpg'],
  'image/png': ['image', '.png'],
  'image/gif': ['image', '.gif'],
  'image/webp': ['image', '.webp'],
  'video/mp4': ['video', '.mp4'],
  'video/webm': ['video', '.webm'],
  'video/quicktime': ['video', '.mov'],
  'video/ogg': ['video', '.ogv']
};

async function attachmentsFor(ticketIds) {
  const map = {};
  if (!ticketIds.length) return map;
  ticketIds.forEach(id => { map[id] = []; });
  const [rows] = await pool.query(
    'SELECT id, ticket_id, type, url, name, created_at FROM attachments WHERE ticket_id IN (?) ORDER BY created_at',
    [ticketIds]
  );
  rows.forEach(r => map[r.ticket_id].push(r));
  return map;
}

// Remove the stored file for an uploaded attachment (links have no file)
function removeFile(att) {
  if (att.type === 'link') return;
  const file = path.join(UPLOAD_DIR, path.basename(att.url));
  fs.unlink(file, () => {});
}

async function ticketExists(id) {
  const [rows] = await pool.execute('SELECT id FROM tickets WHERE id = ?', [id]);
  return !!rows[0];
}

// Add a link
router.post('/link', authRequired, qaRequired, async (req, res) => {
  try {
    if (!(await ticketExists(req.params.id))) return res.status(404).json({ error: 'Ticket not found' });
    const raw = (req.body.url || '').trim();
    let parsed;
    try { parsed = new URL(raw); } catch (e) { return res.status(400).json({ error: 'Please enter a valid URL' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http:// and https:// links are allowed' });
    }
    if (raw.length > 1000) return res.status(400).json({ error: 'Link is too long' });
    const id = uuidv4();
    const name = (req.body.name || parsed.hostname).toString().slice(0, 255);
    await pool.execute(
      'INSERT INTO attachments (id, ticket_id, type, url, name) VALUES (?, ?, ?, ?, ?)',
      [id, req.params.id, 'link', raw, name]
    );
    const [rows] = await pool.execute('SELECT * FROM attachments WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding link' });
  }
});

// Upload an image or video. The browser sends the raw file as the request
// body, with its mime type as Content-Type and the file name in X-Filename.
router.post('/file', authRequired, qaRequired, express.raw({ type: () => true, limit: '100mb' }), async (req, res) => {
  try {
    if (!(await ticketExists(req.params.id))) return res.status(404).json({ error: 'Ticket not found' });
    const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const kind = FILE_TYPES[mime];
    if (!kind) return res.status(400).json({ error: 'Unsupported file type. Use JPG, PNG, GIF, WEBP, MP4, WEBM, MOV or OGV.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Empty file' });
    const [type, ext] = kind;
    if (type === 'image' && req.body.length > MAX_IMAGE) return res.status(413).json({ error: 'Image is too large (max 10 MB)' });
    if (type === 'video' && req.body.length > MAX_VIDEO) return res.status(413).json({ error: 'Video is too large (max 100 MB)' });

    let name = 'attachment' + ext;
    try { name = decodeURIComponent(req.headers['x-filename'] || name); } catch (e) {}
    name = path.basename(name).slice(0, 255);

    const id = uuidv4();
    const stored = uuidv4() + ext;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), req.body);
    await pool.execute(
      'INSERT INTO attachments (id, ticket_id, type, url, name) VALUES (?, ?, ?, ?, ?)',
      [id, req.params.id, type, '/uploads/' + stored, name]
    );
    const [rows] = await pool.execute('SELECT * FROM attachments WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error uploading file' });
  }
});

router.delete('/:attId', authRequired, qaRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM attachments WHERE id = ? AND ticket_id = ?', [req.params.attId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Attachment not found' });
    await pool.execute('DELETE FROM attachments WHERE id = ?', [req.params.attId]);
    removeFile(rows[0]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting attachment' });
  }
});

// JSON errors (e.g. body too large) instead of Express's default HTML page
router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large (max 100 MB)' });
  console.error(err);
  res.status(err.status || 500).json({ error: 'Upload failed' });
});

module.exports = { router, attachmentsFor, removeFile };
