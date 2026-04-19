require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const visitorRoutes = require('./routes/visitor');
const adminRoutes = require('./routes/admin');

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
} else {
  app.listen(PORT, () => {
    console.log(`\x1b[32mServer running on http://localhost:${PORT}\x1b[0m`);
  });
}
