const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const moment = require('moment-timezone'); 
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const cloudinary = require('cloudinary').v2; 

dayjs.extend(utc);
dayjs.extend(timezone);


const app = express();
const port = 3000;
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
cloudinary.config({
<<<<<<< HEAD
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

=======
    cloud_name: 'dxeicifhs', // Reemplaza con tu Cloud Name
    api_key: '823929317122585',       // Reemplaza con tu API Key
    api_secret: '3JIHwAhGcJAeQWjeSM-RPHt-jKk'  // Reemplaza con tu API Secret
});
>>>>>>> bd1ef6f90837e12b27475c4d164b55112dd30869

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads'));

const pool = mysql.createPool({
    host: 'srv1247.hstgr.io',
    user: 'u475816193_Inventario',
    password: 'Basededatos1',
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

//  login
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


app.post('/api/materiales', upload.single('imagen'), async (req, res) => {
    const { nombre, metros_disponibles, precio } = req.body;
    let imagenUrl = null;

    try {
        // Subir la imagen a Cloudinary
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'materiales' // Carpeta en Cloudinary
            });
            imagenUrl = result.secure_url;
        }

        // Guardar el material en la base de datos
        const sql = 'INSERT INTO Materiales (nombre, metros_disponibles, precio, imagen, estado) VALUES (?, ?, ?, ?, 1)';
        pool.query(sql, [nombre, metros_disponibles, precio, imagenUrl], (err, results) => {
            if (err) {
                console.error('Error al insertar material:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            res.status(201).json({
                id_material: results.insertId,
                nombre,
                metros_disponibles,
                precio,
                imagen_url: imagenUrl
            });
        });
    } catch (error) {
        console.error('Error al subir imagen:', error);
        res.status(500).json({ error: 'Error al subir la imagen' });
    }
});

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

        const materiales = results.map(material => ({
            ...material,
            imagen_url: material.imagen_url ? `https://apim-dg8z.onrender.com${material.imagen_url}` : null
        }));
        res.json(materiales);
    });
});



app.put('/api/materiales/:id', upload.single('imagen'), (req, res) => {
    const { id } = req.params;
    const { nombre, metros_disponibles, precio } = req.body;
    const imagenPath = req.file ? `/uploads/${req.file.filename}` : null;
  
    if (!nombre || metros_disponibles == null || precio == null) {
      return res.status(400).json({ error: 'Nombre, metros disponibles y precio son obligatorios.' });
    }
  
    let sql = 'UPDATE Materiales SET nombre = ?, metros_disponibles = ?, precio = ?';
    const params = [nombre, metros_disponibles, precio];
  

    if (imagenPath) {
      sql += ', imagen = ?';
      params.push(imagenPath);
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
  
      res.json({
        message: 'Material actualizado correctamente',
        nombre,
        metros_disponibles,
        precio,
        ...(imagenPath && { imagen_url: `https://apim-dg8z.onrender.com${imagenPath}` }),
      });
    });
  });
  


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
            console.error('Error al obtener historial de movimientos:', err);
            return res.status(500).json({ error: 'Error en el servidor al obtener historial de movimientos', details: err.message });
        }

        const adjustedResults = results.map((movimiento) => ({
            ...movimiento,
            fecha_movimiento: movimiento.fecha_movimiento
                ? dayjs(movimiento.fecha_movimiento).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
                : 'Fecha no disponible'
        }));

        res.json(adjustedResults);
    });
});

app.post('/api/movimientos', async (req, res) => {
    console.log("Datos recibidos:", req.body);
    const { id_material, tipo_movimiento, cantidad, descripcion, id_Admin } = req.body;

    if (!id_material || !tipo_movimiento || !cantidad || !id_Admin) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const fechaMovimiento = dayjs().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    console.log('Fecha generada con dayjs:', fechaMovimiento);

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


app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto: ${port}`);
});


