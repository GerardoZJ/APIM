const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const cloudinary = require('cloudinary').v2;

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const port = 3000;

// Configurar Cloudinary
try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log("Cloudinary configurado correctamente");
} catch (error) {
    console.error("Error al configurar Cloudinary:", error);
}

// Configuración de middleware
app.use(express.json());
app.use(cors());

// Configuración de conexión a MySQL
const pool = mysql.createPool({
    host: 'srv1247.hstgr.io',
    user: 'u475816193_Inventario',
    password: 'Basededatos1',
    database: 'u475816193_Inventario',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Configuración de Multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

// *** Endpoints ***

// Login
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

// Crear material
app.post('/api/materiales', upload.single('imagen'), async (req, res) => {
    const { nombre, metros_disponibles, precio } = req.body;
    let imagenUrl = null;

    try {
        console.log("Datos recibidos:", { nombre, metros_disponibles, precio });

        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'materiales' },
                    (err, result) => {
                        if (err) reject(err);
                        resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imagenUrl = result.secure_url;
        }

        const sql = 'INSERT INTO Materiales (nombre, metros_disponibles, precio, imagen, estado) VALUES (?, ?, ?, ?, 1)';
        pool.query(sql, [nombre, metros_disponibles, precio, imagenUrl], (err, results) => {
            if (err) {
                console.error('Error al insertar material en la base de datos:', err);
                return res.status(500).json({ error: 'Error al guardar el material en la base de datos' });
            }
            res.status(201).json({
                id_material: results.insertId,
                nombre,
                metros_disponibles,
                precio,
                imagen_url: imagenUrl,
            });
        });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

// Obtener materiales
app.get('/api/materiales', (req, res) => {
    const { activos } = req.query;
    let sql = 'SELECT id_material, nombre, metros_disponibles, precio, imagen AS imagen_url, estado FROM Materiales';

    if (activos === 'true') {
        sql += ' WHERE estado = 1';
    }

    pool.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener materiales:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const materiales = results.map((material) => ({
            ...material,
            imagen_url: material.imagen_url || 'https://via.placeholder.com/150', // Imagen por defecto
        }));
        res.json(materiales);
    });
});

// Actualizar material
app.put('/api/materiales/:id', upload.single('imagen'), async (req, res) => {
    const { id } = req.params;
    const { nombre, metros_disponibles, precio } = req.body;
    let imagenUrl = null;

    try {
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'materiales' },
                    (err, result) => {
                        if (err) reject(err);
                        resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imagenUrl = result.secure_url;
        }

        let sql = 'UPDATE Materiales SET nombre = ?, metros_disponibles = ?, precio = ?';
        const params = [nombre, metros_disponibles, precio];

        if (imagenUrl) {
            sql += ', imagen = ?';
            params.push(imagenUrl);
        }

        sql += ' WHERE id_material = ?';
        params.push(id);

        pool.query(sql, params, (err, results) => {
            if (err) {
                console.error('Error al actualizar material:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Material no encontrado' });
            }

            res.json({ message: 'Material actualizado correctamente' });
        });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

// Cambiar estado de material
app.put('/api/materiales/:id/estado', (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    const sql = 'UPDATE Materiales SET estado = ? WHERE id_material = ?';
    pool.query(sql, [estado, id], (err, result) => {
        if (err) {
            console.error('Error al actualizar estado del material:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ message: 'Estado del material actualizado correctamente' });
    });
});

// Eliminar material
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

// Obtener movimientos
app.get('/api/movimientos', (req, res) => {
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
            console.error('Error al obtener movimientos:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const movimientos = results.map((movimiento) => ({
            ...movimiento,
            fecha_movimiento: dayjs(movimiento.fecha_movimiento).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        }));
        res.json(movimientos);
    });
});

// Crear movimiento
app.post('/api/movimientos', async (req, res) => {
    const { id_material, tipo_movimiento, cantidad, descripcion, id_Admin } = req.body;

    if (!id_material || !tipo_movimiento || !cantidad || !id_Admin) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    try {
        const [material] = await connection.query(
            'SELECT metros_disponibles FROM Materiales WHERE id_material = ?',
            [id_material]
        );

        if (!material.length) {
            throw new Error('Material no encontrado');
        }

        const metrosDisponibles = parseFloat(material[0].metros_disponibles); 
        const cantidadMovimiento = parseFloat(cantidad);

        if (tipo_movimiento === 'salida' && metrosDisponibles < cantidadMovimiento) {
            throw new Error(`Stock insuficiente. Disponible: ${metrosDisponibles} metros.`);
        }

        const sqlInsert = `
            INSERT INTO MovimientosInventario 
            (id_material, tipo_movimiento, cantidad, fecha_movimiento, descripcion, id_Admin) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const fechaMovimiento = dayjs().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
        await connection.query(sqlInsert, [
            id_material,
            tipo_movimiento,
            cantidadMovimiento,
            fechaMovimiento,
            descripcion,
            id_Admin,
        ]);

        const sqlUpdate =
            tipo_movimiento === 'entrada'
                ? 'UPDATE Materiales SET metros_disponibles = metros_disponibles + ? WHERE id_material = ?'
                : 'UPDATE Materiales SET metros_disponibles = metros_disponibles - ? WHERE id_material = ?';

        await connection.query(sqlUpdate, [cantidadMovimiento, id_material]);

        await connection.commit();
        res.status(201).json({ message: 'Movimiento registrado correctamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar movimiento:', error.message);
        res.status(500).json({ error: 'Error en el servidor', details: error.message });
    } finally {
        connection.release();
    }
});

// Servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto: ${port}`);
});
