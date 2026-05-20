const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const topicDir = path.join(UPLOADS_ROOT, 'topics', req.params.topic_id);
    fs.mkdirSync(topicDir, { recursive: true });
    cb(null, topicDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-.]/g, '');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

module.exports = upload;
