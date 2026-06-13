require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); 
const bodyParser = require('body-parser');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_ACCESO = process.env.TOKEN_ACCESO || "carbonazo2024pro";

// --- CONFIGURACIÓN ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- CONFIGURACIÓN DE BASE DE DATOS HÍBRIDA ---
let db;
const usesCloud = process.env.DATABASE_URL;

if (usesCloud) {
    // CONEXIÓN NUBE (PostgreSQL) - Aquí NO cargamos sqlite3
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log("☁️ MODO NUBE: Conectado a Supabase");
} else {
    // CONEXIÓN LOCAL (SQLite) - Solo aquí cargamos sqlite3
    const sqlite3 = require('sqlite3').verbose(); 
    const localDB = new sqlite3.Database('./carbonazo.db');
    db = {
        query: (text, params = []) => new Promise((resolve, reject) => {
            const sql = text.replace(/\$\d+/g, '?'); 
            if (text.trim().startsWith("SELECT")) {
                localDB.all(sql, params, (err, rows) => {
                    if (err) reject(err); else resolve({ rows });
                });
            } else {
                localDB.run(sql, params, function(err) {
                    if (err) reject(err); else resolve({ rows: [], lastID: this.lastID });
                });
            }
        })
    };
    console.log("🏠 MODO LOCAL: Conectado a SQLite");
}


// --- INICIALIZACIÓN DE TABLAS ---
const initDB = async () => {
    // Definimos el tipo de ID según la base de datos
    const idType = usesCloud ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
    
    try {
        // --- 1. En initDB, asegúrate que Ventas tenga propina ---
await db.query(`CREATE TABLE IF NOT EXISTS Ventas (
    id ${idType}, fecha TEXT, total REAL, propina REAL, mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT
)`);

        // 2. Productos
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (
            id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT
        )`);

        // 3. Usuarios
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (
            id ${idType}, nombre TEXT UNIQUE, pin TEXT
        )`);

        // --- DENTRO DE initDB(), después de la tabla Usuarios ---
await db.query(`CREATE TABLE IF NOT EXISTS Mesas_Abiertas (
    id ${idType},
    mesa TEXT UNIQUE,
    items TEXT, 
    mesero TEXT,
    total_actual REAL,
    fecha_apertura TEXT
)`);

        // Carga inicial de datos (solo si están vacías)
        const prodCheck = await db.query("SELECT COUNT(*) as count FROM Productos");
        if (parseInt(usesCloud ? prodCheck.rows[0].count : prodCheck.rows[0].count) === 0) {
            console.log("📦 Cargando productos iniciales...");
            const p = [
                ["Asado Familiar", 450, "🍖", "Carnes"],
                ["Medio Pollo", 180, "🍗", "Carnes"],
                ["Gaseosa Litro", 45, "🥤", "Bebidas"]
            ];
            for (let item of p) {
                await db.query("INSERT INTO Productos (nombre, precio, icono, categoria) VALUES ($1, $2, $3, $4)", item);
            }
        }

        const userCheck = await db.query("SELECT COUNT(*) as count FROM Usuarios");
        if (parseInt(usesCloud ? userCheck.rows[0].count : userCheck.rows[0].count) === 0) {
            await db.query("INSERT INTO Usuarios (nombre, pin) VALUES ($1, $2)", ["Admin", "1234"]);
            console.log("👥 Usuario Admin creado.");
        }

        console.log("✅ Sistema de Base de Datos listo.");
    } catch (err) {
        console.error("❌ Error inicializando tablas:", err.message);
    }
};
initDB();

// --- RUTAS DE LA API ---

// 1. Obtener Productos
app.get('/productos', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Productos ORDER BY categoria, nombre");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Agregar Producto
app.post('/agregar-producto', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria } = req.body;
    try {
        await db.query("INSERT INTO Productos (nombre, precio, icono, categoria) VALUES ($1, $2, $3, $4)", [nombre, precio, icono, categoria]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// 3. Actualizar Producto
app.put('/actualizar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria } = req.body;
    try {
        await db.query("UPDATE Productos SET nombre=$1, precio=$2, icono=$3, categoria=$4 WHERE id=$5", [nombre, precio, icono, categoria, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// 4. Borrar Producto
app.delete('/borrar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("DELETE FROM Productos WHERE id=$1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// --- 2. Actualiza la ruta /nueva-venta ---
app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { total, propina, mesero, tipo_pedido, mesa, cliente, metodo_pago } = req.body;
    const fecha = new Date().toLocaleString();
    try {
        const q = `INSERT INTO Ventas (fecha, total, propina, mesero, tipo_pedido, mesa, cliente, metodo_pago) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const result = await db.query(q, [fecha, total, propina, mesero, tipo_pedido, mesa, sanitizeHtml(cliente), metodo_pago]);
        res.json({ success: true, idVenta: usesCloud ? "Nube" : result.lastID });
    } catch (err) { res.status(500).send(err.message); }
});

// 6. Lista de Ventas
app.get('/lista-ventas', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        const result = await db.query("SELECT * FROM Ventas ORDER BY id DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// 7. Usuarios
app.get('/usuarios', async (req, res) => {
    try {
        const result = await db.query("SELECT id, nombre FROM Usuarios");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// --- 3. Actualiza el Reporte de Cierre (Agrupado por Método de Pago) ---
app.get('/reporte-cierre', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const hoy = `%${new Date().toLocaleDateString()}%`;
    try {
        const q = `SELECT metodo_pago, SUM(total) as totalVendido, SUM(propina) as totalPropina FROM Ventas WHERE fecha LIKE $1 GROUP BY metodo_pago`;
        const result = await db.query(q, [hoy]);
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// 9. Exportar Excel
app.get('/exportar-excel', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Ventas");
        let csv = "ID,Fecha,Total,Mesero,Mesa,TipoPedido\n";
        result.rows.forEach(v => {
            csv += `${v.id},"${v.fecha}",${v.total},"${v.mesero}","${v.mesa}","${v.tipo_pedido}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv').send(csv);
    } catch (err) { res.status(500).send(err.message); }
});

// --- RUTA: GUARDAR/ACTUALIZAR MESA ABIERTA ---
app.post('/guardar-mesa', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { mesa, items, mesero, total_actual } = req.body;
    const fecha = new Date().toLocaleString();
    
    try {
        // Usamos ON CONFLICT para actualizar si la mesa ya existe o insertar si es nueva
        const q = `
            INSERT INTO Mesas_Abiertas (mesa, items, mesero, total_actual, fecha_apertura)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (mesa) 
            DO UPDATE SET items = EXCLUDED.items, total_actual = EXCLUDED.total_actual, mesero = EXCLUDED.mesero;
        `;
        await db.query(q, [mesa, JSON.stringify(items), mesero, total_actual, fecha]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// --- RUTA: OBTENER TODAS LAS MESAS ABIERTAS ---
app.get('/mesas-abiertas', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Mesas_Abiertas");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// --- RUTA: ELIMINAR MESA (AL COBRAR) ---
app.delete('/limpiar-mesa/:mesa', async (req, res) => {
    try {
        await db.query("DELETE FROM Mesas_Abiertas WHERE mesa = $1", [req.params.mesa]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// --- RUTA: VALIDACIÓN DE PIN (LOGIN) ---
app.post('/login', async (req, res) => {
    const { nombre, pin } = req.body;
    try {
        // Buscamos al usuario por nombre y pin
        const result = await db.query("SELECT * FROM Usuarios WHERE nombre = $1 AND pin = $2", [nombre, pin]);
        
        if (result.rows.length > 0) {
            // Login exitoso
            res.json({ success: true, usuario: result.rows[0].nombre });
        } else {
            // PIN incorrecto
            res.status(401).json({ success: false, message: "PIN incorrecto" });
        }
    } catch (err) {
        console.error("Error en login:", err.message);
        res.status(500).send("Error en el servidor");
    }
});

// --- INICIO ---
app.listen(PORT, () => {
    console.log(`-------------------------------------------------`);
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO ${PORT}`);
    console.log(`🌍 MODO: ${usesCloud ? "NUBE (Supabase)" : "LOCAL (SQLite)"}`);
    console.log(`-------------------------------------------------`);
});