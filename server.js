const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads'));

const pool = mysql.createPool({
    host: 'srv1247.hstgr.io',
    user: 'u475816193_Inventario',
    password: 'Materiales123@',
    database: 'u475816193_Inventario',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Endpoint de login
app.post('/login', (req, res) => {
    const { Usuario, contraseña } = req.body;

    if (!Usuario || !contraseña) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const sql = 'SELECT * FROM Administrador WHERE Usuario = ? AND contraseña = ?';
    pool.query(sql, [Usuario, contraseña], (err, results) => {
        if (err) {
            console.error('Error al verificar el usuario:', err.message);
            return res.status(500).json({ error: 'Error en el servidor', details: err.message });
        }

        if (results.length > 0) {
            res.json({ message: 'Login exitoso', user: results[0] });
        } else {
            res.status(401).json({ error: 'Credenciales incorrectas' });
        }
    });
});

// Para agregar materiales con imagen
app.post('/api/materiales', upload.single('imagen'), (req, res) => {
    const { nombre, metros_disponibles, precio } = req.body;
    const imagenPath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nombre || metros_disponibles == null || precio == null) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const sql = 'INSERT INTO Materiales (nombre, metros_disponibles, precio, imagen) VALUES (?, ?, ?, ?)';
    pool.query(sql, [nombre, metros_disponibles, precio, imagenPath], (err, results) => {
        if (err) {
            console.error('Error al insertar Material:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.status(201).json({
            id_material: results.insertId,
            nombre,
            metros_disponibles,
            precio,
            imagen_url: `http://localhost:3000${imagenPath}`
        });
    });
});

// Obtener materiales con imagen
app.get('/api/materiales', (req, res) => {
    const sql = 'SELECT id_material, nombre, metros_disponibles, precio, imagen AS imagen_url FROM Materiales';
    pool.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener materiales:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const materiales = results.map(material => ({
            ...material,
            imagen_url: material.imagen_url ? `http://localhost:3000${material.imagen_url}` : null
        }));
        res.json(materiales);
    });
});

// Editar un material
app.put('/api/materiales/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, metros_disponibles, precio } = req.body;

    const sql = 'UPDATE Materiales SET nombre = ?, metros_disponibles = ?, precio = ? WHERE id_material = ?';
    pool.query(sql, [nombre, metros_disponibles, precio, id], (err, results) => {
        if (err) {
            console.error('Error al actualizar material:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Material no encontrado" });
        }

        res.json({ message: 'Material actualizado correctamente' });
    });
});

// Eliminar material con eliminación de movimientos asociados
app.delete('/api/materiales/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    try {
        const deleteMovimientosSql = 'DELETE FROM MovimientosInventario WHERE id_material = ?';
        await connection.query(deleteMovimientosSql, [id]);

        const deleteMaterialSql = 'DELETE FROM Materiales WHERE id_material = ?';
        const [result] = await connection.query(deleteMaterialSql, [id]);

        if (result.affectedRows === 0) {
            throw new Error("Material no encontrado");
        }

        await connection.commit();
        res.json({ message: 'Material y movimientos asociados eliminados correctamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar material:', error.message);
        res.status(500).json({ error: 'Error en el servidor', details: error.message });
    } finally {
        connection.release();
    }
});


// Endpoint para obtener movimientos con el nombre del administrador

// Endpoint para obtener movimientos con ajuste de zona horaria
const moment = require('moment-timezone');
app.get('/api/movimientos', (req, res) => {
    const { timeZone } = req.query; // Recibe la zona horaria del usuario desde el frontend
    const sql = `
      SELECT 
        MovimientosInventario.*, 
        Materiales.nombre AS nombre_material,
        Administrador.Usuario AS nombre_admin 
      FROM 
        MovimientosInventario 
      LEFT JOIN 
        Materiales ON MovimientosInventario.id_material = Materiales.id_material
      LEFT JOIN 
        Administrador ON MovimientosInventario.id_Admin = Administrador.id_Admin 
      ORDER BY 
        MovimientosInventario.fecha_movimiento DESC
    `;
    
    pool.query(sql, (err, results) => {
      if (err) {
        console.error('Error al obtener historial de movimientos:', err);
        return res.status(500).json({ error: 'Error en el servidor al obtener historial de movimientos', details: err.message });
      }
  
      // Ajustar la fecha de cada movimiento a la zona horaria del usuario
      const adjustedResults = results.map((movimiento) => ({
        ...movimiento,
        fecha_movimiento: movimiento.fecha_movimiento 
          ? moment(movimiento.fecha_movimiento).tz(timeZone || 'America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
          : 'Fecha no disponible'
      }));
  
      res.json(adjustedResults);
    });
  });
  



// Agregar un nuevo movimiento
app.post('/api/movimientos', async (req, res) => {
    const { id_material, tipo_movimiento, cantidad, fecha_movimiento, descripcion, id_Admin } = req.body;

    // Validación de campos
    if (!id_material || !tipo_movimiento || !cantidad || !fecha_movimiento || !descripcion || !id_Admin) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios, incluyendo id_Admin.' });
    }

    const connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    try {
        // Primero, obtenemos el stock actual del material
        const [material] = await connection.query('SELECT metros_disponibles FROM Materiales WHERE id_material = ?', [id_material]);
        
        if (!material.length) {
            throw new Error('Material no encontrado');
        }

        const metrosDisponibles = material[0].metros_disponibles;

        // Si es un movimiento de salida, comprobamos el stock
        if (tipo_movimiento === 'salida') {
            if (metrosDisponibles === 0) {
                return res.status(400).json({ error: 'No hay stock disponible.' });
            } else if (metrosDisponibles < cantidad) {
                return res.status(400).json({ error: 'Productos insuficientes en stock.' });
            }
        }

        // Procesa el movimiento
        const sqlInsert = 'INSERT INTO MovimientosInventario (id_material, tipo_movimiento, cantidad, fecha_movimiento, descripcion, id_Admin) VALUES (?, ?, ?, ?, ?, ?)';
        await connection.query(sqlInsert, [id_material, tipo_movimiento, cantidad, fecha_movimiento, descripcion, id_Admin]);

        const sqlUpdate = tipo_movimiento === 'entrada' 
            ? 'UPDATE Materiales SET metros_disponibles = metros_disponibles + ? WHERE id_material = ?'
            : 'UPDATE Materiales SET metros_disponibles = metros_disponibles - ? WHERE id_material = ?';

        await connection.query(sqlUpdate, [cantidad, id_material]);

        await connection.commit();
        res.status(201).json({ message: 'Movimiento registrado exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar movimiento:', error);
        res.status(500).json({ error: 'Error en el servidor al registrar movimiento', details: error.message });
    } finally {
        connection.release();
    }
});


// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto: ${port}`);
});
