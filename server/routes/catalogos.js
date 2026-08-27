// routes/catalogos.js
// Endpoints de la API para el formulario de direccion.
//
//   GET  /api/estados
//   GET  /api/municipios/:estado
//   GET  /api/localidades/:estado
//   GET  /api/codigo-postal/:cp
//   POST /api/validar-direccion

const express = require('express');
const pool = require('../db');

const router = express.Router();

const CP_REGEX = /^\d{5}$/;

// ---------------------------------------------------------------------------
// GET /api/estados
// Devuelve el catalogo completo de estados, ordenado alfabeticamente.
// ---------------------------------------------------------------------------
router.get('/estados', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT clave, nombre_estado FROM estado ORDER BY nombre_estado ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error /estados:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el catalogo de estados' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/municipios/:estado
// Devuelve los municipios que pertenecen a la clave de estado indicada.
// ---------------------------------------------------------------------------
router.get('/municipios/:estado', async (req, res) => {
  const { estado } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT clave, descripcion FROM municipio WHERE estado = $1 ORDER BY descripcion ASC',
      [estado]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error /municipios:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el catalogo de municipios' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/localidades/:estado
// Devuelve las localidades que pertenecen a la clave de estado indicada.
// ---------------------------------------------------------------------------
router.get('/localidades/:estado', async (req, res) => {
  const { estado } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT clave, descripcion FROM localidad WHERE estado = $1 ORDER BY descripcion ASC',
      [estado]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error /localidades:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el catalogo de localidades' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/codigo-postal/:cp
// Resuelve un codigo postal: estado, municipio, localidad y colonias
// disponibles. Responde 404 si el CP no existe en el catalogo.
// ---------------------------------------------------------------------------
router.get('/codigo-postal/:cp', async (req, res) => {
  const { cp } = req.params;

  if (!CP_REGEX.test(cp)) {
    return res.status(400).json({ error: 'El codigo postal debe tener 5 digitos' });
  }

  try {
    const cpQuery = await pool.query(
      `SELECT
         c.cp,
         c.estado,
         e.nombre_estado,
         c.municipio,
         m.descripcion AS municipio_descripcion,
         c.localidad,
         l.descripcion AS localidad_descripcion
       FROM codigo_postal c
       JOIN estado e ON e.clave = c.estado
       LEFT JOIN municipio m ON m.clave = c.municipio AND m.estado = c.estado
       LEFT JOIN localidad l ON l.clave = c.localidad AND l.estado = c.estado
       WHERE c.cp = $1`,
      [cp]
    );

    if (cpQuery.rows.length === 0) {
      return res.status(404).json({ error: 'El codigo postal no fue encontrado en el catalogo' });
    }

    const row = cpQuery.rows[0];

    const coloniasQuery = await pool.query(
      'SELECT clave, descripcion FROM colonia WHERE cp = $1 ORDER BY descripcion ASC',
      [cp]
    );

    res.json({
      cp: row.cp,
      estado: { clave: row.estado, nombre_estado: row.nombre_estado },
      // municipio/localidad pueden venir NULL en el catalogo fuente para
      // algunos CP; el front debe manejar ese caso dejando el campo libre.
      municipio: row.municipio
        ? { clave: row.municipio, descripcion: row.municipio_descripcion }
        : null,
      localidad: row.localidad
        ? { clave: row.localidad, descripcion: row.localidad_descripcion }
        : null,
      colonias: coloniasQuery.rows,
    });
  } catch (err) {
    console.error('Error /codigo-postal:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el codigo postal' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/validar-direccion
// Verifica que la combinacion cp / estado / municipio / localidad / colonia
// enviada por el cliente sea consistente con los catalogos.
// ---------------------------------------------------------------------------
router.post('/validar-direccion', async (req, res) => {
  const { cp, estado, municipio, localidad, colonia, calle } = req.body || {};
  const errores = [];

  if (!cp) errores.push('El codigo postal es requerido');
  if (!estado) errores.push('El estado es requerido');
  if (!municipio) errores.push('El municipio es requerido');
  if (!localidad) errores.push('La localidad es requerida');
  if (!colonia) errores.push('La colonia es requerida');
  if (!calle || !String(calle).trim()) errores.push('La calle y numero son requeridos');

  if (errores.length > 0) {
    return res.status(400).json({ valid: false, errors: errores });
  }

  if (!CP_REGEX.test(cp)) {
    return res.status(400).json({ valid: false, errors: ['El codigo postal debe tener 5 digitos'] });
  }

  try {
    const cpResult = await pool.query('SELECT * FROM codigo_postal WHERE cp = $1', [cp]);
    if (cpResult.rows.length === 0) {
      return res.status(400).json({ valid: false, errors: ['El codigo postal no existe en el catalogo'] });
    }
    const cpRow = cpResult.rows[0];

    if (cpRow.estado !== estado) {
      errores.push('El estado seleccionado no corresponde al codigo postal');
    }

    const municipioResult = await pool.query(
      'SELECT * FROM municipio WHERE clave = $1 AND estado = $2',
      [municipio, estado]
    );
    if (municipioResult.rows.length === 0) {
      errores.push('El municipio no es valido para el estado seleccionado');
    } else if (cpRow.municipio && cpRow.municipio !== municipio) {
      errores.push('El municipio no corresponde al codigo postal');
    }

    const localidadResult = await pool.query(
      'SELECT * FROM localidad WHERE clave = $1 AND estado = $2',
      [localidad, estado]
    );
    if (localidadResult.rows.length === 0) {
      errores.push('La localidad no es valida para el estado seleccionado');
    } else if (cpRow.localidad && cpRow.localidad !== localidad) {
      errores.push('La localidad no corresponde al codigo postal');
    }

    const coloniaResult = await pool.query(
      'SELECT * FROM colonia WHERE clave = $1 AND cp = $2',
      [colonia, cp]
    );
    if (coloniaResult.rows.length === 0) {
      errores.push('La colonia no corresponde al codigo postal');
    }

    if (errores.length > 0) {
      return res.status(400).json({ valid: false, errors: errores });
    }

    return res.json({ valid: true, message: 'La direccion es valida.' });
  } catch (err) {
    console.error('Error /validar-direccion:', err.message);
    return res.status(500).json({ valid: false, errors: ['Error interno al validar la direccion'] });
  }
});

module.exports = router;
