// server.js
// Sirve la API REST (/api/*) y los archivos estaticos del frontend (/public)
// desde un solo proceso Node.js, para simplificar el despliegue.

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const catalogosRouter = require('./routes/catalogos');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API
app.use('/api', catalogosRouter);

// Frontend estatico (HTML / CSS / JS)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Cualquier ruta no reconocida por la API regresa el index (SPA simple)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Manejador de errores de la API (por si algo no capturado llega hasta aqui)
app.use('/api', (err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
