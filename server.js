require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); 
const bodyParser = require('body-parser');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_ACCESO = process.env.TOKEN_ACCESO || "carbonazo2024pro";

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;
const usesCloud = process.env.DATABASE_URL;

if (usesCloud) {
    db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
} else {
    const sqlite3 = require('sqlite3').verbose(); 
    const localDB = new sqlite3.Database('./carbonazo.db');
    db = {
        query: (text, params = []) => new Promise((resolve, reject) => {
            const sql = text.replace(/\$\d+/g, '?'); 
            if (text.trim().startsWith("SELECT")) {
                localDB.all(sql, params, (err, rows) => { if (err) reject(err); else resolve({ rows }); });
            } else {
                localDB.run(sql, params, function(err) { if (err) reject(err); else resolve({ rows: [], lastID: this.lastID }); });
            }
        })
    };
}

const initDB = async () => {
    const idType = usesCloud ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
    try {
        // 1. Tabla de Ventas (Agregamos cliente y estado)
        await db.query(`CREATE TABLE IF NOT EXISTS Ventas (id ${idType}, fecha TEXT, total REAL, propina REAL, mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT, estado_cocina TEXT DEFAULT 'Entregado')`);
        
        // 2. Tabla de Productos (Agregamos stock)
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT, stock INTEGER DEFAULT 999)`);
        
        // 3. Tabla de Usuarios
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (id ${idType}, nombre TEXT UNIQUE, pin TEXT)`);
        
        // 4. Tabla de Mesas Abiertas
        await db.query(`CREATE TABLE IF NOT EXISTS Mesas_Abiertas (id ${idType}, mesa TEXT UNIQUE, items TEXT, mesero TEXT, total_actual REAL, fecha_apertura TEXT)`);
        
        // 5. Tabla de Configuración
        await db.query(`CREATE TABLE IF NOT EXISTS Configuracion (llave TEXT PRIMARY KEY, valor TEXT)`);

        // 6. NUEVA: Tabla de Clientes (Loyalty)
        await db.query(`CREATE TABLE IF NOT EXISTS Clientes (id ${idType}, nombre TEXT, telefono TEXT UNIQUE, puntos INTEGER DEFAULT 0)`);

        console.log("✅ Ecosistema de Base de Datos Global listo.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
};
initDB();

// --- RUTAS NUEVAS: INVENTARIO Y CLIENTES ---

app.get('/clientes', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Clientes ORDER BY nombre ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/clientes', async (req, res) => {
    const { nombre, telefono } = req.body;
    try {
        await db.query("INSERT INTO Clientes (nombre, telefono) VALUES ($1, $2) ON CONFLICT (telefono) DO NOTHING", [nombre, telefono]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// Ruta para el KDS (Monitor de Cocina)
app.get('/cocina-pendientes', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Mesas_Abiertas ORDER BY id ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

// Registrar Venta y Restar Stock
app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { total, propina, mesero, tipo_pedido, mesa, cliente, metodo_pago, items } = req.body;
    const fecha = new Date().toLocaleString();
    try {
        // 1. Guardar Venta
        const q = `INSERT INTO Ventas (fecha, total, propina, mesero, tipo_pedido, mesa, cliente, metodo_pago) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        await db.query(q, [fecha, total, propina || 0, mesero, tipo_pedido, mesa, sanitizeHtml(cliente), metodo_pago]);
        
        // 2. Restar Stock (Solo si vienen los items)
        if (items && Array.isArray(items)) {
            for (let item of items) {
                await db.query("UPDATE Productos SET stock = stock - $1 WHERE id = $2", [item.cantidad, item.id]);
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// Login, Productos, etc. (Mantener rutas anteriores igual...)
app.post('/login', async (req, res) => {
    const { nombre, pin } = req.body;
    try {
        const result = await db.query("SELECT * FROM Usuarios WHERE nombre = $1 AND pin = $2", [nombre, pin]);
        if (result.rows.length > 0) res.json({ success: true, usuario: result.rows[0].nombre });
        else res.status(401).json({ success: false });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/productos', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Productos ORDER BY categoria, nombre");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/agregar-producto', async (req, res) => {
    const { nombre, precio, icono, categoria, stock } = req.body;
    try {
        await db.query("INSERT INTO Productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)", [nombre, precio, icono, categoria, stock || 999]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/borrar-producto/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM Productos WHERE id=$1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/reporte-cierre', async (req, res) => {
    const hoy = `%${new Date().toLocaleDateString()}%`;
    try {
        const q = `SELECT metodo_pago, SUM(total) as totalvendido, SUM(propina) as totalpropina FROM Ventas WHERE fecha LIKE $1 GROUP BY metodo_pago`;
        const result = await db.query(q, [hoy]);
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/tasa-cambio', async (req, res) => {
    try {
        const result = await db.query("SELECT valor FROM Configuracion WHERE llave = 'tasa_cambio'");
        res.json({ tasa: result.rows[0]?.valor || 36.62 });
    } catch (e) { res.json({ tasa: 36.62 }); }
});

app.post('/tasa-cambio', async (req, res) => {
    const { tasa } = req.body;
    try {
        await db.query("INSERT INTO Configuracion (llave, valor) VALUES ('tasa_cambio', $1) ON CONFLICT (llave) DO UPDATE SET valor = EXCLUDED.valor", [tasa]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/guardar-mesa', async (req, res) => {
    const { mesa, items, mesero, total_actual } = req.body;
    try {
        const q = `INSERT INTO Mesas_Abiertas (mesa, items, mesero, total_actual, fecha_apertura) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (mesa) DO UPDATE SET items=EXCLUDED.items, total_actual=EXCLUDED.total_actual, mesero=EXCLUDED.mesero`;
        await db.query(q, [mesa, JSON.stringify(items), mesero, total_actual, new Date().toLocaleString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/mesas-abiertas', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Mesas_Abiertas");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/limpiar-mesa/:mesa', async (req, res) => {
    try {
        await db.query("DELETE FROM Mesas_Abiertas WHERE mesa = $1", [req.params.mesa]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/lista-ventas', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Ventas ORDER BY id DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/usuarios-admin', async (req, res) => {
    const { nombre, pin } = req.body;
    try {
        await db.query("INSERT INTO Usuarios (nombre, pin) VALUES ($1, $2)", [nombre, pin]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/usuarios-admin/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM Usuarios WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/usuarios', async (req, res) => {
    try {
        const result = await db.query("SELECT id, nombre FROM Usuarios");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.listen(PORT, () => console.log(`🚀 Servidor Carbonazo Pro Activo en ${PORT}`));