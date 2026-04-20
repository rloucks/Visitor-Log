require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const visitorRoutes = require('./routes/visitor');
const adminRoutes   = require('./routes/admin');
const scheduler     = require('./lib/scheduler');

const app = express();

// Ensure uploads directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const photosDir = path.join(__dirname, 'uploads', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));


app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use('/api/visitor', visitorRoutes);
app.use('/api/admin', adminRoutes);

scheduler.start();

const PORT    = process.env.PORT || 3000;
const keyPath  = path.join(__dirname, 'certs', 'key.pem');
const certPath = path.join(__dirname, 'certs', 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  require('https').createServer({
    key:  fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }, app).listen(PORT, () => {
    console.log(`\x1b[32mServer running on https://0.0.0.0:${PORT}\x1b[0m`);
  });

  // HTTP server on port 80 — only used to deliver the .mobileconfig for iPad cert install.
  // Safari cannot load an untrusted HTTPS site to download the cert, so we serve it over
  // plain HTTP. Everything else redirects to HTTPS.
  const profilePath = path.join(__dirname, 'certs', 'cert.mobileconfig');
  const HTTP_PORT   = process.env.HTTP_PORT || 8080;

  require('http').createServer((req, res) => {
    if (req.url === '/cert') {
      if (fs.existsSync(profilePath)) {
        res.setHeader('Content-Type', 'application/x-apple-aspen-config');
        res.setHeader('Content-Disposition', 'attachment; filename="kiosk-cert.mobileconfig"');
        fs.createReadStream(profilePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Profile not found — delete the certs/ folder and restart the container.');
      }
    } else {
      const host = (req.headers.host || '').replace(/:80$/, '');
      res.writeHead(301, { Location: `https://${host}${req.url}` });
      res.end();
    }
  }).listen(HTTP_PORT, () => {
    console.log(`\x1b[32mHTTP on port ${HTTP_PORT} — iPad cert install: http://<server-ip>/cert\x1b[0m`);
  });

} else {
  app.listen(PORT, () => {
    console.log(`\x1b[32mServer running on http://localhost:${PORT}\x1b[0m`);
  });
}
