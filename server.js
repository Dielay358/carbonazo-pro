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
    try {
        const idType = usesCloud ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
        // Tablas base
        await db.query(`CREATE TABLE IF NOT EXISTS Ventas (id ${idType}, fecha TEXT, total REAL, propina REAL, descuento REAL, mesero TEXT, tipo_pedido TEXT, mesa TEXT, cliente TEXT, metodo_pago TEXT, pago_efectivo REAL, pago_tarjeta REAL, pago_transferencia REAL, items TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (id ${idType}, nombre TEXT, precio REAL, icono TEXT, categoria TEXT, stock INTEGER DEFAULT 999)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (id ${idType}, nombre TEXT UNIQUE, pin TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Mesas_Abiertas (id ${idType}, mesa TEXT UNIQUE, items TEXT, mesero TEXT, total_actual REAL, fecha_apertura TEXT, estado_cocina TEXT DEFAULT 'Pendiente')`);
        await db.query(`CREATE TABLE IF NOT EXISTS Configuracion (llave TEXT PRIMARY KEY, valor TEXT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Clientes (id ${idType}, nombre TEXT, telefono TEXT UNIQUE, puntos INTEGER DEFAULT 0)`);

        // AUTO-PARCHE: Columna para alerta de cocina
        try { await db.query(`ALTER TABLE Mesas_Abiertas ADD COLUMN estado_cocina TEXT DEFAULT 'Pendiente'`); } catch(e){}
        
        console.log("✅ Motor de Auditoría y Fidelidad Sincronizado.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
};
initDB();

// --- NUEVAS RUTAS INTELIGENTES ---

// 1. Auditoría: Historial Filtrado por Fecha
app.get('/lista-ventas-auditoria', async (req, res) => {
    const { inicio, fin } = req.query; // Formato: MM/DD/YYYY
    try {
        const q = `SELECT * FROM Ventas WHERE fecha >= $1 AND fecha <= $2 ORDER BY id DESC`;
        const result = await db.query(q, [inicio, fin]);
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

// 2. Cocina: Marcar pedido como listo
app.post('/cocina-listo', async (req, res) => {
    const { mesa } = req.body;
    try {
        await db.query("UPDATE Mesas_Abiertas SET estado_cocina = 'Listo' WHERE mesa = $1", [mesa]);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 3. CRM: Buscar puntos del cliente
app.get('/puntos-cliente/:tel', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM Clientes WHERE telefono = $1", [req.params.tel]);
        res.json(result.rows[0] || { puntos: 0 });
    } catch (e) { res.json({ puntos: 0 }); }
});

// 4. Venta: Actualización con Puntos (Loyalty)
app.post('/nueva-venta', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${TOKEN_ACCESO}`) return res.status(401).send("No autorizado");
    const { total, propina, descuento, mesero, tipo_pedido, mesa, cliente, tel, metodo_pago, items, p_efectivo, p_tarjeta, p_transf } = req.body;
    const fecha = new Date().toLocaleString();
    const soloFecha = new Date().toLocaleDateString();

    try {
        // Guardar Venta
        const qVenta = `INSERT INTO Ventas (fecha, total, propina, descuento, mesero, tipo_pedido, mesa, cliente, metodo_pago, pago_efectivo, pago_tarjeta, pago_transferencia, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
        await db.query(qVenta, [fecha, total, propina || 0, descuento || 0, mesero, tipo_pedido, mesa, cliente, metodo_pago, p_efectivo || 0, p_tarjeta || 0, p_transf || 0, JSON.stringify(items)]);

        // Si hay teléfono, actualizar puntos (C$ 100 = 1 Punto)
        if (tel) {
            const nuevosPuntos = Math.floor(total / 100);
            await db.query(`
                INSERT INTO Clientes (nombre, telefono, puntos) 
                VALUES ($1, $2, $3) 
                ON CONFLICT (telefono) 
                DO UPDATE SET puntos = Clientes.puntos + $3`, [cliente, tel, nuevosPuntos]);
        }

        // Restar Stock
        if (items && Array.isArray(items)) {
            for (let i of items) { await db.query("UPDATE Productos SET stock = stock - $1 WHERE id = $2", [i.cantidad, i.id]); }
        }
        res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).send(err.message); }
});

// Rutas base mantenidas igual...
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
app.get('/tasa-cambio', async (req, res) => {
    const result = await db.query("SELECT valor FROM Configuracion WHERE llave = 'tasa_cambio'");
    res.json({ tasa: result.rows[0]?.valor || 36.62 });
});
app.get('/usuarios', async (req, res) => {
    const result = await db.query("SELECT id, nombre FROM Usuarios");
    res.json(result.rows);
});
app.get('/reporte-cierre', async (req, res) => {
    const hoy = `%${new Date().toLocaleDateString()}%`;
    const q = `SELECT SUM(pago_efectivo) as efectivo, SUM(pago_tarjeta) as tarjeta, SUM(pago_transferencia) as transferencia, SUM(total) as gran_total FROM Ventas WHERE fecha LIKE $1`;
    const result = await db.query(q, [hoy]);
    res.json(result.rows[0]);
});
app.get('/dashboard-stats', async (req, res) => {
    const hoy = `%${new Date().toLocaleDateString()}%`;
    const qPagos = `SELECT metodo_pago as metodo, SUM(total) as monto FROM Ventas WHERE fecha LIKE $1 GROUP BY metodo_pago`;
    const resPagos = await db.query(qPagos, [hoy]);
    res.json({ topProductos: [], metodosPago: resPagos.rows });
});

app.listen(PORT, () => console.log(`🚀 Carbonazo Pro Inteligente en puerto ${PORT}`));