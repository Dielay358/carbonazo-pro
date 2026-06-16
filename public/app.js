const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartProds = null, chartPagos = null;

window.onload = async () => {
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await cargarTasaCambio();
    await refrescarMesas();
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

// --- SEGURIDAD ---
async function cargarUsuariosLogin() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const usuarios = await res.json();
    const ops = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    document.getElementById('login-usuario').innerHTML = ops;
    document.getElementById('select-mesero').innerHTML = ops;
}

async function intentarLogin() {
    const nombre = document.getElementById('login-usuario').value, pin = document.getElementById('login-pin').value;
    const res = await fetch(`${URL_SERVIDOR}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, pin }) });
    if (res.ok) {
        usuarioLogueado = nombre;
        document.getElementById('select-mesero').value = nombre;
        document.getElementById('pantalla-login').style.display = 'none';
        reproducirSonido('exito');
    } else alert("PIN Incorrecto");
}

// --- MENÚ Y PRODUCTOS ---
async function obtenerProductosDB() {
    const res = await fetch(`${URL_SERVIDOR}/productos`);
    productos = await res.json();
    cargarMenu(productos);
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria || 'General'))];
    document.getElementById('barra-categorias').innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
}

function cargarMenu(lista) {
    document.getElementById('contenedor-menu').innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="p.stock > 0 && agregarProducto(${p.id})">
            <div style="font-size: 2.2rem;">${p.icono}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold;">C$ ${parseFloat(p.precio).toFixed(2)}</p>
            <small>Stock: ${p.stock ?? 'N/A'}</small>
        </div>
    `).join('');
}

function filtrarPorCategoria(cat) { cargarMenu(cat === 'Todos' ? productos : productos.filter(p => p.categoria === cat)); }
function filtrarBusqueda() { const bus = document.getElementById('buscar-producto').value.toLowerCase(); cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(bus))); }

// --- MESAS ---
function dibujarMapaMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const idBase = `Mesa ${i}`;
        const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
        const totalMesa = cuentas.reduce((acc, c) => acc + parseFloat(c.total_actual), 0);
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
    const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
    const nuevas = await res.json();
    nuevas.forEach(m => {
        const antigua = mesasAbiertas.find(ma => ma.mesa === m.mesa);
        if (m.estado_cocina === 'Listo' && (!antigua || antigua.estado_cocina === 'Pendiente')) {
            alert(`🔔 ¡ORDEN LISTA EN ${m.mesa}!`);
            reproducirSonido('exito');
        }
    });
    mesasAbiertas = nuevas; dibujarMapaMesas();
}

async function abrirSelectorDeCuenta(idBase) {
    const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
    mesaSeleccionada = idBase;
    if (cuentas.length === 0) seleccionarCuentaDirecta(idBase);
    else {
        document.getElementById('titulo-selector-mesa').innerText = idBase;
        document.getElementById('lista-cuentas-mesa').innerHTML = cuentas.map(c => `
            <div class="btn-cuenta-card" onclick="seleccionarCuentaDirecta('${c.mesa}')">
                <strong>${c.mesa.split(' - ')[1] || 'Principal'}</strong>
                <span>C$ ${parseFloat(c.total_actual).toFixed(2)}</span>
            </div>
        `).join('');
        document.getElementById('modal-selector-cuentas').style.display = 'block';
    }
}

function seleccionarCuentaDirecta(nombre) {
    subCuentaActiva = nombre;
    document.getElementById('id-mesa').value = nombre;
    document.getElementById('label-mesa-activa').innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
}

// --- CARRITO Y NOTAS ---
function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota);
    if (ex) ex.cantidad++; else carrito.push({ ...p, cantidad: 1, nota: "" });
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(idx) {
    const nota = prompt("Nota de cocina:", carrito[idx].nota || "");
    if (nota !== null) { carrito[idx].nota = nota; actualizarInterfazCarrito(); }
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">Vacío</p>';
        totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    let total = 0;
    listaCarrito.innerHTML = carrito.map((i, idx) => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div onclick="agregarNota(${idx})" style="cursor:pointer; flex:1;">
                <strong>${i.nombre}</strong><br><small>${i.cantidad} x ${i.precio}</small>
                ${i.nota ? `<br><span style="color:var(--primario); font-size:0.7rem;">📝 ${i.nota}</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUnoCarrito(${idx})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

function eliminarUnoCarrito(idx) {
    if (carrito[idx].cantidad > 1) carrito[idx].cantidad--; else carrito.splice(idx, 1);
    actualizarInterfazCarrito();
}

// --- ACCIONES (GUARDAR, ANULAR, COBRAR) ---
async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total }) });
    reproducirSonido('exito'); limpiarPantallaPostAccion(); refrescarMesas();
}

function finalizarVenta() {
    if (carrito.length === 0) return;
    totalVentaSinPropina = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    document.getElementById('pago-subtotal').innerText = `C$ ${totalVentaSinPropina.toFixed(2)}`;
    document.getElementById('input-propina').value = (totalVentaSinPropina * 0.1).toFixed(2);
    actualizarTotalConPropina();
    document.getElementById('modal-metodo-pago').style.display = 'block';
}

function actualizarTotalConPropina() {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const tN = totalVentaSinPropina + p;
    document.getElementById('pago-total-final').innerText = `C$ ${tN.toFixed(2)}`;
    document.getElementById('pago-total-usd').innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(met) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const datos = { total: totalVentaSinPropina + p, propina: p, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva || "Barra", cliente: document.getElementById('cliente-nombre').value || "Gral", metodo_pago: met, items: carrito };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        generarTicketPro(datos); limpiarPantallaPostAccion(); cerrarModal(); refrescarMesas(); obtenerProductosDB();
    }
}

// --- ADMINISTRACIÓN Y CONFIG ---
function abrirAdminProductos() { 
    document.getElementById('modal-admin-productos').style.display = 'block'; 
    cambiarTabAdmin('prods'); 
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
    if(document.getElementById('input-tasa-cambio')) document.getElementById('input-tasa-cambio').value = tasaCambio;
}

async function guardarTasaCambio() {
    const t = document.getElementById('input-tasa-cambio').value;
    await fetch(`${URL_SERVIDOR}/tasa-cambio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ tasa: t }) });
    alert("Tasa actualizada"); await cargarTasaCambio();
}

async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    document.getElementById('tabla-admin-usuarios').innerHTML = users.map(u => `<tr><td>${u.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join('');
}

async function guardarNuevoUsuario() {
    const n = document.getElementById('nuevo-user-nombre').value, p = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre: n, pin: p }) });
    renderizarAdminUsuarios();
}

async function borrarUsuario(id) { if(confirm("¿Eliminar?")) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); } }

async function cargarEstadisticas() {
    const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const data = await res.json();
    const ctxP = document.getElementById('chartProductos').getContext('2d'), ctxM = document.getElementById('chartPagos').getContext('2d');
    if(chartProds) chartProds.destroy(); if(chartPagos) chartPagos.destroy();
    chartProds = new Chart(ctxP, { type: 'bar', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ label: 'Ventas', data: data.metodosPago.map(p => p.monto), backgroundColor: '#e63946' }] } });
    chartPagos = new Chart(ctxM, { type: 'doughnut', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }] } });
}

// --- UTILIDADES ---
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function limpiarPantallaPostAccion() { carrito = []; mesaSeleccionada = null; subCuentaActiva = null; document.getElementById('id-mesa').value = ''; labelMesaActiva.innerText = "Ninguna mesa"; actualizarInterfazCarrito(); }
function prepararNuevaSubCuenta() { const n = prompt("Nombre cuenta:"); if (n) { seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); } }
function anularCuentaActual() { if (confirm("¿Anular?")) { fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' }).then(() => { limpiarPantallaPostAccion(); refrescarMesas(); }); } }

async function abrirModalVentas() {
    document.getElementById('modal-ventas').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const ventas = await res.json();
    document.getElementById('cuerpo-tabla-ventas').innerHTML = ventas.map(v => `<tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${parseFloat(v.total).toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${v.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

async function confirmarBorrarVenta(id) { if (confirm("¿Borrar?")) { await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); abrirModalVentas(); } }

async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const d = await res.json();
    document.getElementById('cuerpo-cierre').innerHTML = `<h2>Ventas: C$ ${parseFloat(d.gran_total || 0).toFixed(2)}</h2><h4>Efectivo: C$ ${parseFloat(d.efectivo || 0).toFixed(2)}</h4><h4>Tarjeta: C$ ${parseFloat(d.tarjeta || 0).toFixed(2)}</h4>`;
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Total:</span><span>C$ ${d.total.toFixed(2)}</span></div>`;
    setTimeout(() => window.print(), 300);
}

function renderizarAdminProductos() {
    document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}
async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    await obtenerProductosDB(); renderizarAdminProductos();
}
async function borrarProducto(id) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE' }); await obtenerProductosDB(); renderizarAdminProductos(); }