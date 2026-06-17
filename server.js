/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Motor del Servidor v8.0 - VERSIÓN FINAL ESTABLE Y SINCRONIZADA
 */

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

// --- 1. CONFIGURACIÓN DE SEGURIDAD Y LÍMITES ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Para soportar el pegado de muchos platos de Excel
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. CONEXIÓN HÍBRIDA (NUBE / LOCAL) ---
let db;
const usesCloud = process.env.DATABASE_URL;

if (usesCloud) {
    db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    console.log("☁️ MODO NUBE: Conectado a Supabase (PostgreSQL)");
} else {
    const sqlite3 = require('sqlite3').verbose(); 
    const localDB = new sqlite3.Database('./carbonazo.db');
    // Puente de compatibilidad para usar la misma sintaxis en SQLite y Postgres ($1, $2...)
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
    console.log("🏠 MODO LOCAL: Conectado a SQLite");
}

// --- 3. INICIALIZACIÓN Y AUTO-PARCHE DE TABLAS ---
const initDB = async () => {
    const idType = usesCloud ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
    try {
        // Ventas Completo
        await db.query(`CREATE TABLE IF NOT EXISTS Ventas (
            id ${idType}, fecha TEXT, total REAL, propina REAL, descuento REAL, 
            mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT, 
            pago_efectivo REAL, pago_tarjeta REAL, pago_transferencia REAL, items TEXT
        )`);

        // Productos
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (
            id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT, stock INTEGER DEFAULT 999
        )`);

        // Usuarios
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (
            id ${idType}, nombre TEXT UNIQUE, pin TEXT
        )`);

        // Mesas Abiertas
        await db.query(`CREATE TABLE IF NOT EXISTS Mesas_Abiertas (
            id ${idType}, mesa TEXT UNIQUE, items TEXT, mesero TEXT, 
            total_actual REAL, fecha_apertura TEXT, estado_cocina TEXT DEFAULT 'Pendiente'
        )`);

        // Configuración y Clientes
        await db.query(`CREATE TABLE IF NOT EXISTS Configuracion (llave TEXT PRIMARY KEY, valor TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Clientes (id ${idType}, nombre TEXT, telefono TEXT UNIQUE, puntos INTEGER DEFAULT 0)`);

        // 🔥 PARCHE DE COLUMNAS (Por si acaso faltan en la nube)
        const checkColumns = async () => {
            if (usesCloud) {
                try { await db.query(`ALTER TABLE Productos ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 999`); } catch(e){}
                try { await db.query(`ALTER TABLE Mesas_Abiertas ADD COLUMN IF NOT EXISTS estado_cocina TEXT DEFAULT 'Pendiente'`); } catch(e){}
                try { await db.query(`ALTER TABLE Ventas ADD COLUMN IF NOT EXISTS pago_efectivo REAL DEFAULT 0`); } catch(e){}
                try { await db.query(`ALTER TABLE Ventas ADD COLUMN IF NOT EXISTS pago_tarjeta REAL DEFAULT 0`); } catch(e){}
                try { await db.query(`ALTER TABLE Ventas ADD COLUMN IF NOT EXISTS pago_transferencia REAL DEFAULT 0`); } catch(e){}
            }
        };
        await checkColumns();

        // Crear Admin inicial si no existe
        const userCheck = await db.query("SELECT COUNT(*) as count FROM Usuarios");
        if (parseInt(userCheck.rows[0].count) === 0) {
            await db.query("INSERT INTO Usuarios (nombre, pin) VALUES ($1, $2)", ["Admin", "3589"]);
        }

        console.log("✅ Base de Datos sincronizada y protegida.");
    } catch (err) { console.error("❌ Error inicializando DB:", err.message); }
};
initDB();

// --- 4. RUTAS DE SEGURIDAD ---

app.post('/login', async (req, res) => {
    const { nombre, pin } = req.body;
    try {
        const result = await db.query("SELECT * FROM Usuarios WHERE nombre = $1 AND pin = $2", [nombre, pin]);
        if (result.rows.length > 0) res.json({ success: true, usuario: result.rows[0].nombre });
        else res.status(401).json({ success: false });
    } catch (err) { res.status(500).send(err.message); }
});

// --- 5. RUTAS DE PRODUCTOS E IMPORTACIÓN ---

app.get('/productos', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Productos ORDER BY categoria, nombre");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/importar-masivo', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).json({error: "No autorizado"});
    const { productosLista } = req.body;
    if (!productosLista || !Array.isArray(productosLista)) return res.status(400).json({error: "Lista inválida"});

    try {
        for (let p of productosLista) {
            await db.query(
                "INSERT INTO Productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)",
                [p.nombre, p.precio, p.icono, p.categoria, p.stock]
            );
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/agregar-producto', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { nombre, precio, icono, categoria, stock } = req.body;
    try {
        await db.query("INSERT INTO Productos (nombre, precio, icono, categoria, stock) VALUES ($1, $2, $3, $4, $5)", [nombre, precio, icono, categoria, stock || 999]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/borrar-producto/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("DELETE FROM Productos WHERE id=$1", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// --- 6. RUTAS DE MESAS Y COCINA ---

app.get('/mesas-abiertas', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Mesas_Abiertas ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/guardar-mesa', async (req, res) => {
    const { mesa, items, mesero, total_actual } = req.body;
    try {
        const q = `INSERT INTO Mesas_Abiertas (mesa, items, mesero, total_actual, fecha_apertura) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (mesa) DO UPDATE SET items=EXCLUDED.items, total_actual=EXCLUDED.total_actual, mesero=EXCLUDED.mesero, estado_cocina='Pendiente'`;
        await db.query(q, [mesa, JSON.stringify(items), mesero, total_actual, new Date().toLocaleString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/limpiar-mesa/:mesa', async (req, res) => {
    try {
        await db.query("DELETE FROM Mesas_Abiertas WHERE mesa = $1", [req.params.mesa]);
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/cocina-pendientes', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Mesas_Abiertas ORDER BY id ASC");
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/cocina-listo', async (req, res) => {
    try {
        await db.query("UPDATE Mesas_Abiertas SET estado_cocina = 'Listo' WHERE mesa = $1", [req.body.mesa]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// --- 7. RUTAS DE VENTAS Y FINANZAS ---

app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).json({error: "No autorizado"});
    const { total, propina, descuento, mesero, tipo_pedido, mesa, cliente, tel, metodo_pago, items, p_efectivo, p_tarjeta, p_transf } = req.body;
    const fecha = new Date().toLocaleString();
    try {
        const q = `INSERT INTO Ventas (fecha, total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, pago_efectivo, pago_tarjeta, pago_transferencia, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
        await db.query(q, [fecha, total, propina, descuento, mesero, tipo_pedido, mesa, sanitizeHtml(cliente), metodo_pago, p_efectivo, p_tarjeta, p_transf, JSON.stringify(items)]);
        
        if (tel) {
            await db.query(`INSERT INTO Clientes (nombre, telefono, puntos) VALUES ($1, $2, $3) ON CONFLICT (telefono) DO UPDATE SET puntos = Clientes.puntos + $3`, [cliente, tel, Math.floor(total/100)]);
        }

        if (items && Array.isArray(items)) {
            for (let i of items) { await db.query("UPDATE Productos SET stock = stock - $1 WHERE id = $2", [i.cantidad, i.id]); }
        }
        res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({error: err.message}); }
});

app.get('/reporte-cierre', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const hoy = `%${new Date().toLocaleDateString()}%`;
    try {
        const q = `SELECT SUM(pago_efectivo) as efectivo, SUM(pago_tarjeta) as tarjeta, SUM(pago_transferencia) as transferencia, SUM(total) as gran_total FROM Ventas WHERE fecha LIKE $1`;
        const result = await db.query(q, [hoy]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/dashboard-stats', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const hoy = `%${new Date().toLocaleDateString()}%`;
    try {
        const qPagos = `SELECT metodo_pago as metodo, SUM(total) as monto FROM Ventas WHERE fecha LIKE $1 GROUP BY metodo_pago`;
        const resPagos = await db.query(qPagos, [hoy]);
        res.json({ metodosPago: resPagos.rows });
    } catch (e) { res.status(500).json({ metodosPago: [] }); }
});

// --- 8. CONFIGURACIÓN Y TASA ---

app.get('/tasa-cambio', async (req, res) => {
    try {
        const result = await db.query("SELECT valor FROM Configuracion WHERE llave = 'tasa_cambio'");
        res.json({ tasa: result.rows[0]?.valor || 36.62 });
    } catch (e) { res.json({ tasa: 36.62 }); }
});

app.post('/tasa-cambio', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("INSERT INTO Configuracion (llave, valor) VALUES ('tasa_cambio', $1) ON CONFLICT (llave) DO UPDATE SET valor = EXCLUDED.valor", [req.body.tasa]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/usuarios', async (req, res) => {
    try {
        const result = await db.query("SELECT id, nombre FROM Usuarios");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/usuarios-admin', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("INSERT INTO Usuarios (nombre, pin) VALUES ($1, $2)", [req.body.nombre, req.body.pin]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/usuarios-admin/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("DELETE FROM Usuarios WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/lista-ventas', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        const result = await db.query("SELECT * FROM Ventas ORDER BY id DESC LIMIT 50");
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/borrar-venta/:id', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    try {
        await db.query("DELETE FROM Ventas WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/puntos-cliente/:tel', async (req, res) => {
    try {
        const result = await db.query("SELECT puntos FROM Clientes WHERE telefono = $1", [req.params.tel]);
        res.json(result.rows[0] || { puntos: 0 });
    } catch (e) { res.json({ puntos: 0 }); }
});

app.get('/exportar-excel', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Ventas");
        let csv = "ID,Fecha,Total,Propina,Mesero,Mesa,Metodo\n";
        result.rows.forEach(v => { csv += `${v.id},"${v.fecha}",${v.total},${v.propina},"${v.mesero}","${v.mesa}","${v.metodo_pago}"\n`; });
        res.setHeader('Content-Type', 'text/csv').send(csv);
    } catch (err) { res.status(500).send(err.message); }
});

app.listen(PORT, () => {
    console.log(`-------------------------------------------------`);
    console.log(`🚀 SERVIDOR CARBONAZO PRO v8.0 ACTIVO EN ${PORT}`);
    console.log(`-------------------------------------------------`);
});