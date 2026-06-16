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
app.use(bodyParser.json({ limit: '50mb' })); // Permitir listas largas
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
        await db.query(`CREATE TABLE IF NOT EXISTS Ventas (id ${idType}, fecha TEXT, total REAL, propina REAL, descuento REAL, mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT, pago_efectivo REAL, pago_tarjeta REAL, pago_transferencia REAL, items TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT, stock INTEGER DEFAULT 999)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (id ${idType}, nombre TEXT UNIQUE, pin TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Mesas_Abiertas (id ${idType}, mesa TEXT UNIQUE, items TEXT, mesero TEXT, total_actual REAL, fecha_apertura TEXT, estado_cocina TEXT DEFAULT 'Pendiente')`);
        await db.query(`CREATE TABLE IF NOT EXISTS Configuracion (llave TEXT PRIMARY KEY, valor TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Clientes (id ${idType}, nombre TEXT, telefono TEXT UNIQUE, puntos INTEGER DEFAULT 0)`);
        console.log("✅ Motor Carbonazo Pro v5.1 Sincronizado.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
};
initDB();

// --- RUTAS API ---

app.post('/login', async (req, res) => {
    const { nombre, pin } = req.body;
    const result = await db.query("SELECT * FROM Usuarios WHERE nombre = $1 AND pin = $2", [nombre, pin]);
    if (result.rows.length > 0) res.json({ success: true, usuario: result.rows[0].nombre });
    else res.status(401).json({ success: false });
});

app.get('/productos', async (req, res) => {
    const result = await db.query("SELECT * FROM Productos ORDER BY categoria, nombre");
    res.json(result.rows);
});

// NUEVA RUTA DE IMPORTACIÓN MASIVA
app.post('/importar-masivo', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { productosLista } = req.body;
    try {
        for (let p of productosLista) {
            await db.query("INSERT INTO Productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)", [p.nombre, p.precio, p.icono, p.categoria, p.stock]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/agregar-producto', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria, stock } = req.body;
    await db.query("INSERT INTO Productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)", [nombre, precio, icono, categoria, stock || 999]);
    res.json({ success: true });
});

app.delete('/borrar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("DELETE FROM Productos WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

app.get('/mesas-abiertas', async (req, res) => {
    const result = await db.query("SELECT * FROM Mesas_Abiertas ORDER BY id ASC");
    res.json(result.rows);
});

app.post('/guardar-mesa', async (req, res) => {
    const { mesa, items, mesero, total_actual } = req.body;
    const q = `INSERT INTO Mesas_Abiertas (mesa, items, mesero, total_actual, fecha_apertura) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (mesa) DO UPDATE SET items=EXCLUDED.items, total_actual=EXCLUDED.total_actual, mesero=EXCLUDED.mesero, estado_cocina='Pendiente'`;
    await db.query(q, [mesa, JSON.stringify(items), mesero, total_actual, new Date().toLocaleString()]);
    res.json({ success: true });
});

app.delete('/limpiar-mesa/:mesa', async (req, res) => {
    await db.query("DELETE FROM Mesas_Abiertas WHERE mesa = $1", [req.params.mesa]);
    res.json({ success: true });
});

app.get('/cocina-pendientes', async (req, res) => {
    const result = await db.query("SELECT * FROM Mesas_Abiertas ORDER BY id ASC");
    res.json(result.rows);
});

app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { total, propina, descuento, mesero, tipo_pedido, mesa, cliente, tel, metodo_pago, items, p_efectivo, p_tarjeta, p_transf } = req.body;
    const fecha = new Date().toLocaleString();
    try {
        await db.query(`INSERT INTO Ventas (fecha, total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, pago_efectivo, pago_tarjeta, pago_transferencia, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [fecha, total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, p_efectivo, p_tarjeta, p_transf, JSON.stringify(items)]);
        if (items) {
            for (let i of items) { await db.query("UPDATE Productos SET stock = stock - $1 WHERE id = $2", [i.cantidad, i.id]); }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/reporte-cierre', async (req, res) => {
    const hoy = `%${new Date().toLocaleDateString()}%`;
    const q = `SELECT SUM(pago_efectivo) as efectivo, SUM(pago_tarjeta) as tarjeta, SUM(total) as gran_total FROM Ventas WHERE fecha LIKE $1`;
    const result = await db.query(q, [hoy]);
    res.json(result.rows[0]);
});

app.get('/tasa-cambio', async (req, res) => {
    const result = await db.query("SELECT valor FROM Configuracion WHERE llave = 'tasa_cambio'");
    res.json({ tasa: result.rows[0]?.valor || 36.62 });
});

app.post('/tasa-cambio', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("INSERT INTO Configuracion (llave, valor) VALUES ('tasa_cambio', $1) ON CONFLICT (llave) DO UPDATE SET valor = EXCLUDED.valor", [req.body.tasa]);
    res.json({ success: true });
});

app.get('/usuarios', async (req, res) => {
    const result = await db.query("SELECT id, nombre FROM Usuarios");
    res.json(result.rows);
});

app.post('/usuarios-admin', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("INSERT INTO Usuarios (nombre, pin) VALUES ($1, $2)", [req.body.nombre, req.body.pin]);
    res.json({ success: true });
});

app.delete('/usuarios-admin/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("DELETE FROM Usuarios WHERE id = $1", [req.params.id]);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));