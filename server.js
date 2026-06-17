require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); 
const bodyParser = require('body-parser');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const path = require('path');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const TOKEN_ACCESO = process.env.TOKEN_ACCESO || "carbonazo2024pro";

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
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
            if (text.trim().toUpperCase().startsWith("SELECT")) {
                localDB.all(sql, params, (err, rows) => { if (err) reject(err); else resolve({ rows }); });
            } else {
                localDB.run(sql, params, function(err) { if (err) reject(err); else resolve({ rows: [], lastID: this.lastID }); });
            }
        })
    };
}

io.on('connection', (socket) => {
    socket.on('notificar_cambio', () => { io.emit('actualizar_pantallas'); });
});

const initDB = async () => {
    const idType = usesCloud ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS ventas (id ${idType}, fecha TEXT, total REAL, propina REAL, descuento REAL, mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT, pago_efectivo REAL, pago_tarjeta REAL, pago_transferencia REAL, items TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS productos (id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT, stock INTEGER DEFAULT 999)`);
        await db.query(`CREATE TABLE IF NOT EXISTS usuarios (id ${idType}, nombre TEXT UNIQUE, pin TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS mesas_abiertas (id ${idType}, mesa TEXT UNIQUE, items TEXT, mesero TEXT, total_actual REAL, fecha_apertura TEXT, estado_cocina TEXT DEFAULT 'Pendiente')`);
        await db.query(`CREATE TABLE IF NOT EXISTS configuracion (llave TEXT PRIMARY KEY, valor TEXT)`);
        
        const userCheck = await db.query("SELECT COUNT(*) as count FROM usuarios");
        if (parseInt(userCheck.rows[0].count) === 0) {
            await db.query("INSERT INTO usuarios (nombre, pin) VALUES ($1, $2)", ["Admin", "3589"]);
        }
    } catch (err) { console.error("Error DB:", err); }
};
initDB();

// --- RUTAS API ---

app.post('/login', async (req, res) => {
    const { nombre, pin } = req.body;
    const result = await db.query("SELECT * FROM usuarios WHERE nombre = $1 AND pin = $2", [nombre, pin]);
    if (result.rows.length > 0) res.json({ success: true, usuario: result.rows[0].nombre });
    else res.status(401).json({ success: false });
});

app.get('/productos', async (req, res) => {
    const result = await db.query("SELECT * FROM productos ORDER BY categoria, nombre");
    res.json(result.rows);
});

// AGREGAR PRODUCTO (POST)
app.post('/agregar-producto', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria, stock } = req.body;
    try {
        await db.query("INSERT INTO productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)", [nombre, precio, icono, categoria, stock]);
        io.emit('actualizar_pantallas');
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// ACTUALIZAR PRODUCTO (PUT)
app.put('/actualizar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria, stock } = req.body;
    try {
        await db.query("UPDATE productos SET nombre=$1, precio=$2, icono=$3, categoria=$4, stock=$5 WHERE id=$6", [nombre, precio, icono, categoria, stock, req.params.id]);
        io.emit('actualizar_pantallas');
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/borrar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("DELETE FROM productos WHERE id=$1", [req.params.id]);
    io.emit('actualizar_pantallas');
    res.json({ success: true });
});

app.get('/mesas-abiertas', async (req, res) => {
    const result = await db.query("SELECT * FROM mesas_abiertas ORDER BY id ASC");
    res.json(result.rows);
});

app.post('/guardar-mesa', async (req, res) => {
    const { mesa, items, mesero, total_actual } = req.body;
    const q = `INSERT INTO mesas_abiertas (mesa, items, mesero, total_actual, fecha_apertura) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (mesa) DO UPDATE SET items=EXCLUDED.items, total_actual=EXCLUDED.total_actual, mesero=EXCLUDED.mesero`;
    await db.query(q, [mesa, JSON.stringify(items), mesero, total_actual, new Date().toLocaleString()]);
    io.emit('actualizar_pantallas');
    res.json({ success: true });
});

app.delete('/limpiar-mesa/:mesa', async (req, res) => {
    await db.query("DELETE FROM mesas_abiertas WHERE mesa = $1", [req.params.mesa]);
    io.emit('actualizar_pantallas');
    res.json({ success: true });
});

app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, items, p_efectivo, p_tarjeta, p_transf } = req.body;
    try {
        const q = `INSERT INTO ventas (fecha, total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, pago_efectivo, pago_tarjeta, pago_transferencia, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
        await db.query(q, [new Date().toLocaleString(), total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, p_efectivo, p_tarjeta, p_transf, JSON.stringify(items)]);
        if (items) for (let i of items) { await db.query("UPDATE productos SET stock = stock - $1 WHERE id = $2", [i.cantidad, i.id]); }
        io.emit('actualizar_pantallas');
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/reporte-cierre', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const hoy = `%${new Date().toLocaleDateString()}%`;
    const q = `SELECT SUM(pago_efectivo) as efectivo, SUM(pago_tarjeta) as tarjeta, SUM(pago_transferencia) as transferencia, SUM(total) as gran_total FROM ventas WHERE fecha LIKE $1`;
    const result = await db.query(q, [hoy]);
    res.json(result.rows[0]);
});

app.get('/lista-ventas', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const result = await db.query("SELECT * FROM ventas ORDER BY id DESC LIMIT 50");
    res.json(result.rows);
});

app.get('/tasa-cambio', async (req, res) => {
    const result = await db.query("SELECT valor FROM configuracion WHERE llave = 'tasa_cambio'");
    res.json({ tasa: result.rows[0]?.valor || 36.62 });
});

app.post('/tasa-cambio', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    await db.query("INSERT INTO configuracion (llave, valor) VALUES ('tasa_cambio', $1) ON CONFLICT (llave) DO UPDATE SET valor = EXCLUDED.valor", [req.body.tasa]);
    io.emit('actualizar_pantallas');
    res.json({ success: true });
});

app.get('/usuarios', async (req, res) => {
    const result = await db.query("SELECT id, nombre FROM usuarios");
    res.json(result.rows);
});

http.listen(PORT, () => console.log(`🚀 Carbonazo Live v12.1 activo`));