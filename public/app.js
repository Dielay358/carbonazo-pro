/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Cerebro v11.5 Final Live (Sincronización Total + Doble Rol + Finanzas)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// --- 1. ESTADO GLOBAL ---
let usuarioLogueado = "Mesero"; 
let productos = [], carrito = [], mesaSeleccionada = null, subCuentaActiva = null;
let mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62, rolActual = 'mesero';
let chartPagos = null;
let socket = null;

// ELEMENTOS DEL DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 2. INICIALIZACIÓN Y LIVE SYNC ---
window.onload = async () => {
    console.log("🚀 El Carbonazo Pro LIVE: Motor Iniciado");
    
    // Conectar Socket.io de forma segura
    if (typeof io !== 'undefined') {
        socket = io();
        socket.on('actualizar_pantallas', async () => {
            if (!subCuentaActiva) {
                console.log("🔄 Sync Live: Actualizando datos...");
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
    } catch (e) { console.error("Error en arranque:", e); }
};

// --- 3. LÓGICA DE ROLES Y PRIVACIDAD ---

function entrarComoMesero() {
    const sel = document.getElementById('select-mesero');
    usuarioLogueado = sel ? sel.value : 'Mesero';
    rolActual = 'mesero';
    document.getElementById('contenedor-botones-admin').style.display = 'none';
    document.getElementById('indicador-rol').innerText = "MODO MESERO";
    document.getElementById('pantalla-inicio-rol').style.display = 'none';
    reproducirSonido('click');
}

function mostrarLoginAdmin() {
    document.getElementById('pantalla-inicio-rol').style.display = 'none';
    document.getElementById('pantalla-login-admin').style.display = 'flex';
}

function volverAlInicio() {
    document.getElementById('pantalla-login-admin').style.display = 'none';
    document.getElementById('pantalla-inicio-rol').style.display = 'flex';
}

async function intentarLoginAdmin() {
    const pinInput = document.getElementById('login-pin-admin');
    const pin = pinInput ? pinInput.value : "";
    try {
        const res = await fetch(`${URL_SERVIDOR}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: 'Admin', pin: pin })
        });
        if (res.ok) {
            usuarioLogueado = 'Admin';
            rolActual = 'admin';
            document.getElementById('select-mesero').value = 'Admin';
            document.getElementById('contenedor-botones-admin').style.display = 'flex';
            document.getElementById('indicador-rol').innerText = "👨‍✈️ ADMINISTRADOR";
            document.getElementById('pantalla-login-admin').style.display = 'none';
            reproducirSonido('exito');
        } else { alert("PIN INCORRECTO ❌"); }
    } catch(e) { alert("Error de conexión"); }
}

function cerrarSesionAdmin() { location.reload(); }

// --- 4. MAPA DE MESAS Y CUENTAS SEPARADAS ---

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
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        const nuevas = await res.json();
        // Notificación de cocina lista
        nuevas.forEach(m => {
            const ant = mesasAbiertas.find(ma => ma.mesa === m.mesa);
            if (m.estado_cocina === 'Listo' && (!ant || ant.estado_cocina === 'Pendiente')) {
                alert(`🔔 ¡ORDEN LISTA EN ${m.mesa}!`);
                reproducirSonido('exito');
            }
        });
        mesasAbiertas = nuevas; dibujarMapaMesas();
    } catch(e) { console.error("Error sync mesas"); }
}

async function abrirSelectorDeCuenta(idBase) {
    reproducirSonido('click');
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
    mesaSeleccionada = nombre.split(' - ')[0];
    document.getElementById('id-mesa').value = nombre;
    if (labelMesaActiva) labelMesaActiva.innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
}

function prepararNuevaSubCuenta() {
    const n = prompt("Nombre para la cuenta nueva (Ej: Familia Perez):");
    if (n) { seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); }
}

// --- 5. MENÚ E INVENTARIO ---

function cargarMenu(lista) {
    if (!contenedorMenu) return;
    contenedorMenu.innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="intentarAgregar(${p.id}, ${p.stock})">
            <div style="font-size: 2.2rem;">${p.icono || '🍽️'}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold; margin:0;">C$ ${parseFloat(p.precio).toFixed(2)}</p>
            <small>Stock: ${p.stock}</small>
        </div>
    `).join('');
}

function intentarAgregar(id, stock) {
    if (stock <= 0) return alert("Producto agotado 🚫");
    agregarProducto(id);
}

function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota);
    if (ex) {
        if (ex.cantidad < p.stock) ex.cantidad++; else return alert("Sin stock suficiente");
    } else {
        carrito.push({ ...p, cantidad: 1, nota: "" });
    }
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(idx) {
    const nota = prompt("Nota de cocina (Ej: Sin cebolla, Bien cocido):", carrito[idx].nota || "");
    if (nota !== null) { carrito[idx].nota = nota; actualizarInterfazCarrito(); }
}

function actualizarInterfazCarrito() {
    if (!listaCarrito) return;
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        if (totalMontoLabel) totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    let total = 0;
    listaCarrito.innerHTML = carrito.map((i, idx) => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div onclick="agregarNota(${idx})" style="cursor:pointer; flex:1;">
                <strong>${i.nombre}</strong><br>
                ${i.nota ? `<span style="color:var(--primario); font-size:0.7rem;">📝 ${i.nota}</span>` : `<small>${i.cantidad} x ${i.precio}</small>`}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUnoCarrito(${idx})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    if (totalMontoLabel) totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

function eliminarUnoCarrito(idx) {
    if (carrito[idx].cantidad > 1) carrito[idx].cantidad--; else carrito.splice(idx, 1);
    actualizarInterfazCarrito();
}

// --- 6. COBRO Y MONEDA ---

function finalizarVenta() {
    if (carrito.length === 0) return alert("Carrito vacío");
    totalVentaSinPropina = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    document.getElementById('pago-subtotal').innerText = `C$ ${totalVentaSinPropina.toFixed(2)}`;
    document.getElementById('input-propina').value = (totalVentaSinPropina * 0.1).toFixed(2);
    actualizarTotalConPropina();
    document.getElementById('modal-metodo-pago').style.display = 'block';
}

function actualizarTotalConPropina() {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const d = parseFloat(document.getElementById('input-descuento')?.value || 0);
    const tN = (totalVentaSinPropina - d) + p;
    document.getElementById('pago-total-final').innerText = `C$ ${tN.toFixed(2)}`;
    document.getElementById('pago-total-usd').innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(metodo) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const d = parseFloat(document.getElementById('input-descuento')?.value || 0);
    const totalF = (totalVentaSinPropina - d) + p;
    
    let pe=0, pt=0, ptr=0;
    if (metodo === 'Combinado') {
        pe = parseFloat(document.getElementById('split-efectivo').value) || 0;
        pt = parseFloat(document.getElementById('split-tarjeta').value) || 0;
        ptr = parseFloat(document.getElementById('split-transf').value) || 0;
    } else {
        if(metodo==='Efectivo') pe=totalF; else if(metodo==='Tarjeta') pt=totalF; else ptr=totalF;
    }

    const datos = { total: totalF, propina: p, descuento: d, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", tel: document.getElementById('cliente-tel').value, metodo_pago: metodo, items: carrito, p_efectivo: pe, p_tarjeta: pt, p_transf: ptr };
    
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito'); generarTicketPro(datos); limpiarPantallaPostAccion(); cerrarModal();
        if(socket) socket.emit('notificar_cambio'); // ⚡ AVISO LIVE
    }
}

// --- 7. ACCIONES LIVE ---

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const res = await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total })
    });
    if (res.ok) {
        reproducirSonido('exito');
        if (socket) socket.emit('notificar_cambio'); // ⚡ AVISO LIVE
        limpiarPantallaPostAccion();
        alert("Enviado a Cocina 🔥");
    }
}

async function anularCuentaActual() {
    if (!subCuentaActiva) return;
    if (confirm(`⚠️ ¿Anular mesa "${subCuentaActiva}"?`)) {
        const res = await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        if (res.ok) {
            limpiarPantallaPostAccion();
            if (socket) socket.emit('notificar_cambio'); // ⚡ AVISO LIVE
        }
    }
}

// --- 8. ADMINISTRACIÓN ---

function abrirAdminProductos() { 
    document.getElementById('modal-admin-productos').style.display='block'; 
    cambiarTabAdmin('prods'); 
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    const t = document.getElementById('tab-' + tab);
    if (t) t.style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
    if(tab === 'prods') renderizarAdminProductos();
}

async function cargarEstadisticas() {
    const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const data = await res.json();
    const ctxM = document.getElementById('chartPagos').getContext('2d');
    if(chartPagos) chartPagos.destroy();
    chartPagos = new Chart(ctxM, { type: 'doughnut', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }] } });
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
    if(socket) socket.emit('notificar_cambio');
    alert("✅ Importado con éxito");
    cerrarModal();
}

// --- 9. UTILIDADES Y CARGAS ---

function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function limpiarPantallaPostAccion() { 
    carrito = []; mesaSeleccionada = null; subCuentaActiva = null; 
    document.getElementById('id-mesa').value = ''; 
    if (labelMesaActiva) labelMesaActiva.innerText = "Ninguna mesa"; 
    actualizarInterfazCarrito(); 
}

async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        
        cargarMenu(productos);
        generarFiltrosCategorias(); // Llamada crítica
    } catch(e) { console.error("Error productos"); }
}

function generarFiltrosCategorias() {
    const barra = document.getElementById('barra-categorias');
    if (!barra) return;

    // Extraer y limpiar
    const catsRaw = productos.map(p => (p.categoria || 'General').trim());
    const catsUnicas = ['Todos', ...new Set(catsRaw)].sort();

    barra.innerHTML = catsUnicas.map(cat => `
        <button class="btn-filtro ${cat === 'Todos' ? 'activo' : ''}" 
                onclick="cambiarFiltro(this, '${cat}')">
            ${cat}
        </button>
    `).join('');
}

function cambiarFiltro(elemento, cat) {
    reproducirSonido('click');
    
    // UI: Cambiar botón activo
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('activo'));
    elemento.classList.add('activo');

    // Filtrar
    if (cat === 'Todos') {
        cargarMenu(productos);
    } else {
        const filtrados = productos.filter(p => (p.categoria || 'General').trim() === cat);
        cargarMenu(filtrados);
    }
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
    if(document.getElementById('input-tasa-cambio')) document.getElementById('input-tasa-cambio').value = tasaCambio;
}

async function guardarTasaCambio() {
    const val = document.getElementById('input-tasa-cambio').value;
    await fetch(`${URL_SERVIDOR}/tasa-cambio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ tasa: val }) });
    if(socket) socket.emit('notificar_cambio');
    alert("Tasa actualizada");
}

async function cargarUsuariosLista() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const u = await res.json();
        const ops = u.map(x => `<option value="${x.nombre}">${x.nombre}</option>`).join('');
        const sM = document.getElementById('select-mesero'), lU = document.getElementById('login-usuario');
        if (sM) sM.innerHTML = ops; if (lU) lU.innerHTML = ops;
    } catch (e) { console.error("Error usuarios"); }
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>`;
    setTimeout(() => window.print(), 300);
}

function imprimirPreCuenta() {
    if (carrito.length === 0) return alert("Vacío");
    const t = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `<div class="ticket-header"><h3>PRE-CUENTA</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-total">TOTAL: C$ ${(t*1.1).toFixed(2)}</div>`;
    setTimeout(() => window.print(), 300);
}

// RESTO DE FUNCIONES ADMIN (AUDITORIA, CIERRE, CRUD MESEROS)
async function abrirModalVentas() { document.getElementById('modal-ventas').style.display = 'block'; filtrarHistorialAuditoria(); }
async function filtrarHistorialAuditoria() { const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); const v = await res.json(); document.getElementById('cuerpo-tabla-ventas').innerHTML = v.map(x => `<tr><td>#${x.id}</td><td>${x.fecha}</td><td>${x.mesa}</td><td>${x.mesero}</td><td>C$ ${parseFloat(x.total).toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${x.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }
async function confirmarBorrarVenta(id) { if (confirm("¿Borrar?")) { await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); if(socket) socket.emit('notificar_cambio'); abrirModalVentas(); } }
async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display='block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const d = await res.json();
    document.getElementById('cuerpo-cierre').innerHTML = `<h2>Total: C$ ${parseFloat(d.gran_total||0).toFixed(2)}</h2><h4>Efectivo: C$ ${parseFloat(d.efectivo||0).toFixed(2)}</h4><h4>Tarjeta: C$ ${parseFloat(d.tarjeta || 0).toFixed(2)}</h4>`;
}
function renderizarAdminProductos() { document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }
async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) });
    if(socket) socket.emit('notificar_cambio');
}
async function borrarProducto(id) { if(confirm("¿Borrar?")) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); if(socket) socket.emit('notificar_cambio'); } }
async function renderizarAdminUsuarios() { const res = await fetch(`${URL_SERVIDOR}/usuarios`); const u = await res.json(); document.getElementById('tabla-admin-usuarios').innerHTML = u.map(x => `<tr><td>${x.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${x.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join(''); }
async function borrarUsuario(id) { if(confirm("¿Borrar?")) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); } }
async function guardarNuevoUsuario() {
    const n = document.getElementById('nuevo-user-nombre').value, p = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre: n, pin: p }) });
    renderizarAdminUsuarios();
}
function filtrarPorCategoria(cat) { if (cat === 'Todos') cargarMenu(productos); else cargarMenu(productos.filter(p => (p.categoria || 'General').trim() === cat)); }
function filtrarBusqueda() { const b = document.getElementById('buscar-producto').value.toLowerCase(); cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(b))); }
async function buscarPuntos() { const tel = document.getElementById('cliente-tel').value; if (!tel) return; const res = await fetch(`${URL_SERVIDOR}/puntos-cliente/${tel}`); const data = await res.json(); document.getElementById('cliente-puntos-aviso').innerText = `Puntos acumulados: ${data.puntos || 0} ✨`; }
function cambiarMesero() { usuarioLogueado = document.getElementById('select-mesero').value; }