/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Cerebro v12.0 Master Live (Sincronización Total + Doble Rol + Fix Categorías)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// --- ESTADO GLOBAL ---
let usuarioLogueado = "Mesero"; 
let productos = [], carrito = [], mesaSeleccionada = null, subCuentaActiva = null;
let mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62, rolActual = 'mesero';
let chartPagos = null, socket = null, idProductoEditando = null;

// ELEMENTOS DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    if (typeof io !== 'undefined') {
        socket = io();
        socket.on('actualizar_pantallas', async () => {
            if (!subCuentaActiva) {
                await refrescarMesas();
                await obtenerProductosDB();
            }
        });
    }

    try {
        await cargarUsuariosLista();
        await obtenerProductosDB();
        await cargarTasaCambio();
        await refrescarMesas();
    } catch (e) { console.error("Error inicialización:", e); }
};

// --- 2. LÓGICA DE ROLES Y LOGIN ---
function entrarComoMesero() {
    const sel = document.getElementById('select-mesero');
    usuarioLogueado = sel ? sel.value : 'Mesero';
    document.getElementById('contenedor-botones-admin').style.display = 'none';
    document.getElementById('indicador-rol').innerText = "MODO MESERO";
    document.getElementById('pantalla-inicio-rol').style.display = 'none';
    reproducirSonido('click');
}

function mostrarLoginAdmin() {
    document.getElementById('pantalla-inicio-rol').style.display = 'none';
    document.getElementById('pantalla-login-admin').style.display = 'flex';
}

async function intentarLoginAdmin() {
    const pin = document.getElementById('login-pin-admin').value;
    const res = await fetch(`${URL_SERVIDOR}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Admin', pin: pin }) });
    if (res.ok) {
        usuarioLogueado = 'Admin'; rolActual = 'admin';
        document.getElementById('contenedor-botones-admin').style.display = 'flex';
        document.getElementById('indicador-rol').innerText = "👨‍✈️ ADMINISTRADOR";
        document.getElementById('pantalla-login-admin').style.display = 'none';
        cerrarModal(); 
        reproducirSonido('exito');
    } else alert("PIN Incorrecto");
}

// --- 3. MAPA DE MESAS ---
function dibujarMapaMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const idBase = `Mesa ${i}`;
        const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
        const totalMesa = cuentas.reduce((acc, c) => acc + (parseFloat(c.total_actual) || 0), 0);
        const btn = document.createElement('button');
        btn.className = `mesa-btn ${cuentas.length > 0 ? 'ocupada' : ''} ${mesaSeleccionada === idBase ? 'seleccionada' : ''}`;
        btn.innerHTML = `<i class="fas fa-utensils"></i><br>${idBase}${cuentas.length > 1 ? ` (${cuentas.length})` : ''}`;
        if (cuentas.length > 0) {
            const popup = document.createElement('div');
            popup.className = 'mesa-info-flotante';
            popup.innerHTML = `Total: <span>C$ ${totalMesa.toFixed(2)}</span>`;
            btn.appendChild(popup);
        }
        btn.onclick = () => abrirSelectorDeCuenta(idBase);
        contenedor.appendChild(btn);
    }
}

async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        mesasAbiertas = await res.json();
        dibujarMapaMesas();
    } catch(e) { console.error("Error sync"); }
}

async function abrirSelectorDeCuenta(idBase) {
    reproducirSonido('click');
    const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
    mesaSeleccionada = idBase;
    if (cuentas.length === 0) activarCuentaDirecta(idBase);
    else {
        document.getElementById('titulo-selector-mesa').innerText = idBase;
        document.getElementById('lista-cuentas-mesa').innerHTML = cuentas.map(c => `
            <div class="btn-cuenta-card" onclick="activarCuentaDirecta('${c.mesa}')">
                <strong>${c.mesa.split(' - ')[1] || 'Principal'}</strong>
                <span>C$ ${parseFloat(c.total_actual).toFixed(2)}</span>
            </div>
        `).join('');
        document.getElementById('modal-selector-cuentas').style.display = 'block';
    }
}

function activarCuentaDirecta(nombre) {
    subCuentaActiva = nombre; mesaSeleccionada = nombre.split(' - ')[0];
    document.getElementById('id-mesa').value = nombre;
    labelMesaActiva.innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
}

// --- 4. MENÚ Y CLICS ---
async function obtenerProductosDB() {
    const res = await fetch(`${URL_SERVIDOR}/productos`);
    productos = await res.json();
    const cats = ['Todos', ...new Set(productos.map(p => (p.categoria || 'General').trim()))];
    document.getElementById('barra-categorias').innerHTML = cats.sort().map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
    cargarMenu(productos);
}

function cargarMenu(lista) {
    contenedorMenu.innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="intentarAgregar(${p.id}, ${p.stock})">
            <div style="font-size: 2.2rem;">${p.icono || '🍽️'}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold;">C$ ${parseFloat(p.precio).toFixed(2)}</p>
            <small>Stock: ${p.stock}</small>
        </div>
    `).join('');
}

function intentarAgregar(id, stock) { if (stock <= 0) return alert("Agotado"); agregarProducto(id); }

function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota);
    if (ex) { if (ex.cantidad < p.stock) ex.cantidad++; else return alert("Sin stock"); }
    else { carrito.push({ ...p, cantidad: 1, nota: "" }); }
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(idx) {
    const nota = prompt("Nota:", carrito[idx].nota || "");
    if (nota !== null) { carrito[idx].nota = nota; actualizarInterfazCarrito(); }
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) { listaCarrito.innerHTML = '<p class="carrito-vacio">Vacío</p>'; totalMontoLabel.innerText = "C$ 0.00"; return; }
    let total = 0;
    listaCarrito.innerHTML = carrito.map((i, idx) => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista"><div onclick="agregarNota(${idx})" style="cursor:pointer; flex:1;"><strong>${i.nombre}</strong><br>${i.nota ? `<span style="color:var(--primario); font-size:0.7rem;">📝 ${i.nota}</span>` : `<small>${i.cantidad} x ${i.precio}</small>`}</div><div style="display:flex; align-items:center; gap:10px;"><span>C$ ${sub.toFixed(2)}</span><button onclick="eliminarUnoCarrito(${idx})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button></div></div>`;
    }).join('');
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

function eliminarUnoCarrito(idx) { if (carrito[idx].cantidad > 1) carrito[idx].cantidad--; else carrito.splice(idx, 1); actualizarInterfazCarrito(); }

// --- 5. COBRO Y ACCIONES LIVE ---
async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Mesa?");
    const t = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: t }) });
    reproducirSonido('exito'); socket.emit('notificar_cambio'); limpiarPantallaPostAccion();
}

async function confirmarVentaFinal(met) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const d = parseFloat(document.getElementById('input-descuento')?.value || 0);
    const tF = (carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0) - d) + p;
    let pe=0, pt=0, ptr=0;
    if(met==='Efectivo') pe=tF; else if(met==='Tarjeta') pt=tF; else ptr=tF;

    const datos = { total: tF, propina: p, descuento: d, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", tel: document.getElementById('cliente-tel').value, metodo_pago: met, items: carrito, p_efectivo: pe, p_tarjeta: pt, p_transf: ptr };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito'); generarTicketPro(datos); limpiarPantallaPostAccion(); cerrarModal(); socket.emit('notificar_cambio');
    }
}

// --- 6. ADMIN Y UTILIDADES ---
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function limpiarPantallaPostAccion() { carrito = []; mesaSeleccionada = null; subCuentaActiva = null; document.getElementById('id-mesa').value = ''; labelMesaActiva.innerText = "Ninguna mesa"; actualizarInterfazCarrito(); }
function cerrarSesionAdmin() { location.reload(); }
function volverAlInicio() { document.getElementById('pantalla-login-admin').style.display='none'; document.getElementById('pantalla-inicio-rol').style.display='flex'; }
function cambiarMesero() { usuarioLogueado = document.getElementById('select-mesero').value; }
function filtrarPorCategoria(cat) { if (cat === 'Todos') cargarMenu(productos); else cargarMenu(productos.filter(p => (p.categoria || 'General').trim() === cat)); }
function filtrarBusqueda() { const b = document.getElementById('buscar-producto').value.toLowerCase(); cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(b))); }

async function cargarUsuariosLista() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const u = await res.json();
    const ops = u.map(x => `<option value="${x.nombre}">${x.nombre}</option>`).join('');
    document.getElementById('select-mesero').innerHTML = ops;
    document.getElementById('login-usuario').innerHTML = ops;
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
    if(document.getElementById('input-tasa-cambio')) document.getElementById('input-tasa-cambio').value = tasaCambio;
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Total:</span><span>C$ ${d.total.toFixed(2)}</span></div>`;
    setTimeout(() => window.print(), 300);
}

// RESTO DE FUNCIONES ADMIN (CRUD, STATS, MASIVO)
function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'stats') cargarEstadisticas();
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'prods') renderizarAdminProductos();
}

async function cargarEstadisticas() {
    const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const data = await res.json();
    const ctx = document.getElementById('chartPagos').getContext('2d');
    if(chartPagos) chartPagos.destroy();
    chartPagos = new Chart(ctx, { type: 'doughnut', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }] } });
}

function renderizarAdminProductos() { document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${parseFloat(p.precio).toFixed(2)}</td><td>${p.stock}</td><td><button onclick="prepararEdicion(${p.id})" style="color:blue;"><i class="fas fa-edit"></i></button><button onclick="borrarProducto(${p.id})" style="color:red;"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }

function prepararEdicion(id) {
    const p = productos.find(x => x.id === id);
    idProductoEditando = id;
    document.getElementById('nuevo-nombre').value = p.nombre;
    document.getElementById('nuevo-precio').value = p.precio;
    document.getElementById('nuevo-icono').value = p.icono;
    document.getElementById('nuevo-categoria').value = p.categoria;
    document.getElementById('nuevo-stock').value = p.stock;
    const btn = document.querySelector("button[onclick='guardarNuevoProducto()']");
    btn.innerText = "ACTUALIZAR"; btn.style.background = "orange";
}

async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    if (idProductoEditando) { await fetch(`${URL_SERVIDOR}/actualizar-producto/${idProductoEditando}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) }); idProductoEditando = null; }
    else { await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) }); }
    socket.emit('notificar_cambio');
}

async function procesarPegadoMasivo() {
    const texto = document.getElementById('texto-pegado').value;
    const filas = texto.split(/\r?\n/);
    const lista = [];
    for (let f of filas) {
        const cols = f.split('\t');
        if (cols.length >= 3) {
            lista.push({ categoria: cols[0].trim(), nombre: cols[1].trim(), precio: parseFloat(cols[2].replace(/[^0-9.]/g, '')), icono: '🍽️', stock: 999 });
        }
    }
    await fetch(`${URL_SERVIDOR}/importar-masivo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ productosLista: lista }) });
    socket.emit('notificar_cambio'); cerrarModal();
}