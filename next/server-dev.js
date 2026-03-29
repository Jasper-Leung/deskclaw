/**
 * Simple HTTP server for serving Next.js static files with correct MIME types
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const PORT = 3000;
const NEXT_DIR = path.join(__dirname, '../.next');

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  let filePath;

  if (req.url.startsWith('/_next/static/')) {
    // Serve static assets
    filePath = path.join(NEXT_DIR, 'static', req.url.substring('/_next/static/'.length));
  } else if (req.url === '/' || req.url.startsWith('/app/') || req.url.startsWith('/_next/')) {
    // Serve app pages
    const pagePath =
      req.url === '/' || req.url.startsWith('/app/')
        ? req.url === '/'
          ? 'index.html'
          : req.url.replace('/app/', '')
        : req.url;
    filePath = path.join(NEXT_DIR, 'server', 'app', pagePath);

    // If it's a directory or not found, try adding index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!fs.existsSync(filePath)) {
      filePath = path.join(NEXT_DIR, 'server', 'app', req.url.replace(/^\//, ''), 'index.html');
    }
  } else {
    // Try other paths
    filePath = path.join(NEXT_DIR, 'server', req.url.replace(/^\//, ''));
  }

  // Add index.html if needed
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Default to index.html if not found
  if (!fs.existsSync(filePath)) {
    filePath = path.join(NEXT_DIR, 'server', 'app', 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('Error reading file:', filePath, err);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      const mimeType = getMimeType(filePath);
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Next.js static server running on http://localhost:${PORT}`);
});
