/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend PREMIUM v2.0 (Doble Rol + Sincronización + Mesas Fix)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartProds = null, chartPagos = null;

// ELEMENTOS DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await cargarTasaCambio();
    await refrescarMesas();
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

// --- 2. LÓGICA DE PRIVACIDAD Y LOGIN ---
function entrarComoMesero() {
    usuarioLogueado = document.getElementById('select-mesero').value || 'Mesero';
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
    const pin = document.getElementById('login-pin-admin').value;
    const res = await fetch(`${URL_SERVIDOR}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Admin', pin: pin })
    });
    if (res.ok) {
        usuarioLogueado = 'Admin';
        document.getElementById('select-mesero').value = 'Admin';
        document.getElementById('contenedor-botones-admin').style.display = 'flex';
        document.getElementById('indicador-rol').innerText = "👨‍✈️ ADMINISTRADOR";
        document.getElementById('pantalla-login-admin').style.display = 'none';
        reproducirSonido('exito');
    } else {
        alert("PIN Incorrecto ❌");
    }
}

function cerrarSesionAdmin() { location.reload(); }

// --- 3. MENÚ Y PRODUCTOS ---
async function obtenerProductosDB() {
    const res = await fetch(`${URL_SERVIDOR}/productos`);
    productos = await res.json();
    cargarMenu(productos);
    generarFiltrosCategorias();
}

function cargarMenu(lista) {
    contenedorMenu.innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="p.stock > 0 && agregarProducto(${p.id})">
            <div style="font-size: 2.2rem;">${p.icono}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold;">C$ ${parseFloat(p.precio).toFixed(2)}</p>
            <small>Stock: ${p.stock ?? 'N/A'}</small>
        </div>
    `).join('');
}

function generarFiltrosCategorias() {
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria || 'General'))];
    document.getElementById('barra-categorias').innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
}

function filtrarPorCategoria(cat) {
    reproducirSonido('click');
    cargarMenu(cat === 'Todos' ? productos : productos.filter(p => p.categoria === cat));
}

function filtrarBusqueda() {
    const bus = document.getElementById('buscar-producto').value.toLowerCase();
    cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(bus)));
}

// --- 4. MESAS Y NOTAS ---
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
    document.getElementById('label-mesa-activa').innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
    dibujarMapaMesas();
}

// --- 5. CARRITO Y ACCIONES ---
function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota);
    if (ex) ex.cantidad++; else carrito.push({ ...p, cantidad: 1, nota: "" });
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(idx) {
    const nota = prompt("Nota:", carrito[idx].nota || "");
    if (nota !== null) { carrito[idx].nota = nota; actualizarInterfazCarrito(); }
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
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
    const desc = parseFloat(document.getElementById('input-descuento')?.value || 0);
    const tN = (totalVentaSinPropina - desc) + p;
    document.getElementById('pago-total-final').innerText = `C$ ${tN.toFixed(2)}`;
    document.getElementById('pago-total-usd').innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(metodo) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const desc = parseFloat(document.getElementById('input-descuento')?.value || 0);
    const totalF = (totalVentaSinPropina - desc) + p;
    
    let p_efec = 0, p_tarj = 0, p_trans = 0;
    if (metodo === 'Combinado') {
        p_efec = parseFloat(document.getElementById('split-efectivo').value) || 0;
        p_tarj = parseFloat(document.getElementById('split-tarjeta').value) || 0;
        p_trans = parseFloat(document.getElementById('split-transf').value) || 0;
    } else {
        if(metodo==='Efectivo') p_efec=totalF; else if(metodo==='Tarjeta') p_tarj=totalF; else p_trans=totalF;
    }

    const datos = { total: totalF, propina: p, descuento: desc, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", tel: document.getElementById('cliente-tel').value, metodo_pago: metodo, items: carrito, p_efectivo: p_efec, p_tarjeta: p_tarj, p_transf: p_trans };
    
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito'); generarTicketPro(datos); limpiarPantallaPostAccion(); cerrarModal(); refrescarMesas(); obtenerProductosDB();
    }
}

// --- 7. ADMIN Y DASHBOARD ---
async function cargarEstadisticas() {
    const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const data = await res.json();
    const ctxP = document.getElementById('chartProductos').getContext('2d'), ctxM = document.getElementById('chartPagos').getContext('2d');
    if(chartProds) chartProds.destroy(); if(chartPagos) chartPagos.destroy();
    chartProds = new Chart(ctxP, { type: 'bar', data: { labels: ['Ventas'], datasets: [{ label: 'Efectivo vs Tarjeta', data: [data.metodosPago[0]?.monto || 0, data.metodosPago[1]?.monto || 0], backgroundColor: ['#2a9d8f', '#457b9d'] }] } });
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
}

// --- UTILIDADES (Carga, Sonidos, Cierres) ---
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function limpiarPantallaPostAccion() { carrito = []; mesaSeleccionada = null; subCuentaActiva = null; document.getElementById('id-mesa').value = ''; labelMesaActiva.innerText = "Ninguna mesa"; actualizarInterfazCarrito(); }
function prepararNuevaSubCuenta() { const n = prompt("Nombre cuenta:"); if (n) { cerrarModal(); seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); } }

async function cargarUsuariosLogin() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const usuarios = await res.json();
    const ops = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    document.getElementById('login-usuario').innerHTML = ops;
    document.getElementById('select-mesero').innerHTML = ops;
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
}

// Re-vincular botones y funciones manuales
async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total }) });
    reproducirSonido('exito'); alert("Enviado a Cocina 🔥");
    limpiarPantallaPostAccion(); await refrescarMesas();
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>`;
    setTimeout(() => window.print(), 300);
}

// Funciones Pago Combinado
function activarPagoCombinado() { document.getElementById('seccion-pago-simple').style.display = 'none'; document.getElementById('seccion-pago-combinado').style.display = 'block'; }
function validarSumaCombinada() {
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const totalOb = totalVentaSinPropina + propina;
    const suma = (parseFloat(document.getElementById('split-efectivo').value)||0) + (parseFloat(document.getElementById('split-tarjeta').value)||0) + (parseFloat(document.getElementById('split-transf').value)||0);
    const aviso = document.getElementById('combinado-aviso');
    const btn = document.getElementById('btn-confirmar-combinado');
    if (Math.abs(totalOb - suma) < 0.1) { aviso.innerText = "✅ OK"; aviso.style.color="green"; btn.disabled = false; }
    else { aviso.innerText = `Faltan: C$ ${(totalOb - suma).toFixed(2)}`; aviso.style.color="red"; btn.disabled = true; }
}