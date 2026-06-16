/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend PREMIUM v3.0 (Doble Rol + Sincronización + Mesas Fix)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartProds = null, chartPagos = null;

// ELEMENTOS DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    console.log("🚀 Iniciando Sistema...");
    // Cargamos lo básico que necesitan ambos roles
    await obtenerProductosDB();
    await cargarTasaCambio();
    await cargarUsuariosLista(); // Llena los selectores de meseros
    await refrescarMesas();
    
    // Intervalo de sincronización
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

// --- 2. LÓGICA DE ROLES ---
function entrarComoMesero() {
    usuarioLogueado = document.getElementById('select-mesero').value;
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

// --- 3. PRODUCTOS Y MENÚ ---
async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias();
    } catch(e) { console.error("Error productos"); }
}

function cargarMenu(lista) {
    if(!contenedorMenu) return;
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
    const barra = document.getElementById('barra-categorias');
    if(!barra) return;
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria || 'General'))];
    barra.innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
}

function filtrarPorCategoria(cat) {
    reproducirSonido('click');
    cargarMenu(cat === 'Todos' ? productos : productos.filter(p => p.categoria === cat));
}

function filtrarBusqueda() {
    const bus = document.getElementById('buscar-producto').value.toLowerCase();
    cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(bus)));
}

// --- 4. MESAS ---
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
        nuevas.forEach(m => {
            const antigua = mesasAbiertas.find(ma => ma.mesa === m.mesa);
            if (m.estado_cocina === 'Listo' && (!antigua || antigua.estado_cocina === 'Pendiente')) {
                alert(`🔔 ¡ORDEN LISTA EN ${m.mesa}!`);
                reproducirSonido('exito');
            }
        });
        mesasAbiertas = nuevas; dibujarMapaMesas();
    } catch(e) { console.error("Error sincronización"); }
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
    if(labelMesaActiva) labelMesaActiva.innerText = `Editando: ${nombre}`;
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
    if (!listaCarrito) return;
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

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total }) });
    reproducirSonido('exito'); limpiarPantallaPostAccion(); refrescarMesas();
}

// --- 6. COBRO Y MONEDA ---
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
    const d = parseFloat(document.getElementById('input-descuento').value) || 0;
    const tN = (totalVentaSinPropina - d) + p;
    document.getElementById('pago-total-final').innerText = `C$ ${tN.toFixed(2)}`;
    document.getElementById('pago-total-usd').innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(met) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const d = parseFloat(document.getElementById('input-descuento').value) || 0;
    const totalF = (totalVentaSinPropina - d) + p;
    let pe=0, pt=0, ptr=0;
    if(met==='Efectivo') pe=totalF; else if(met==='Tarjeta') pt=totalF; else if(met==='Transferencia') ptr=totalF;

    const datos = { total: totalF, propina: p, descuento: d, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", tel: document.getElementById('cliente-tel').value, metodo_pago: met, items: carrito, p_efectivo: pe, p_tarjeta: pt, p_transf: ptr };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito'); generarTicketPro(datos); limpiarPantallaPostAccion(); cerrarModal(); refrescarMesas(); obtenerProductosDB();
    }
}

// --- 7. UTILIDADES ---
async function cargarUsuariosLista() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const usuarios = await res.json();
    const ops = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    if(document.getElementById('select-mesero')) document.getElementById('select-mesero').innerHTML = ops;
    if(document.getElementById('login-usuario')) document.getElementById('login-usuario').innerHTML = ops;
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
}

function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function limpiarPantallaPostAccion() { carrito = []; mesaSeleccionada = null; subCuentaActiva = null; document.getElementById('id-mesa').value = ''; labelMesaActiva.innerText = "Ninguna mesa"; actualizarInterfazCarrito(); }
function prepararNuevaSubCuenta() { const n = prompt("Nombre cuenta:"); if (n) { cerrarModal(); seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); } }
function anularCuentaActual() { if (confirm("¿Anular?")) { fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' }).then(() => { limpiarPantallaPostAccion(); refrescarMesas(); }); } }

// --- ADMIN Y STATS (Faltantes) ---
function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'stats') cargarEstadisticas();
}

async function cargarEstadisticas() {
    const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const data = await res.json();
    const ctxP = document.getElementById('chartProductos').getContext('2d'), ctxM = document.getElementById('chartPagos').getContext('2d');
    if(chartProds) chartProds.destroy(); if(chartPagos) chartPagos.destroy();
    chartProds = new Chart(ctxP, { type: 'bar', data: { labels: ['Ventas'], datasets: [{ label: 'Total', data: [data.metodosPago.reduce((a,b)=>a+parseFloat(b.monto),0)], backgroundColor: '#e63946' }] } });
    chartPagos = new Chart(ctxM, { type: 'doughnut', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }] } });
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>`;
    setTimeout(() => window.print(), 300);
}

// Historial y Cierre (Simplificado)
async function abrirModalVentas() {
    document.getElementById('modal-ventas').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const v = await res.json();
    document.getElementById('cuerpo-tabla-ventas').innerHTML = v.map(x => `<tr><td>#${x.id}</td><td>${x.fecha}</td><td>${x.mesa}</td><td>${x.mesero}</td><td>C$ ${parseFloat(x.total).toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${x.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}
async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const d = await res.json();
    document.getElementById('cuerpo-cierre').innerHTML = `<h2>Ventas: C$ ${parseFloat(d.gran_total || 0).toFixed(2)}</h2><h4>Efectivo: C$ ${parseFloat(d.efectivo || 0).toFixed(2)}</h4><h4>Tarjeta: C$ ${parseFloat(d.tarjeta || 0).toFixed(2)}</h4>`;
}

function abrirAdminProductos() { document.getElementById('modal-admin-productos').style.display='block'; cambiarTabAdmin('prods'); renderizarAdminProductos(); }
function renderizarAdminProductos() {
    document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}
async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) });
    await obtenerProductosDB(); renderizarAdminProductos();
}
async function borrarProducto(id) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); await obtenerProductosDB(); renderizarAdminProductos(); }
async function guardarTasaCambio() { const t = document.getElementById('input-tasa-cambio').value; await fetch(`${URL_SERVIDOR}/tasa-cambio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ tasa: t }) }); alert("Actualizado"); await cargarTasaCambio(); }
async function confirmarBorrarVenta(id) { if (confirm("¿Borrar venta?")) { await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); abrirModalVentas(); } }
async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    document.getElementById('tabla-admin-usuarios').innerHTML = users.map(u => `<tr><td>${u.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join('');
}
async function borrarUsuario(id) { if(confirm("¿Eliminar?")) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); } }
async function guardarNuevoUsuario() {
    const n = document.getElementById('nuevo-user-nombre').value, p = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre: n, pin: p }) });
    document.getElementById('nuevo-user-nombre').value = ''; document.getElementById('nuevo-user-pin').value = ''; renderizarAdminUsuarios();
}
async function buscarPuntos() {
    const tel = document.getElementById('cliente-tel').value; if (!tel) return;
    const res = await fetch(`${URL_SERVIDOR}/puntos-cliente/${tel}`);
    const data = await res.json();
    document.getElementById('cliente-puntos-aviso').innerText = `Puntos: ${data.puntos} ✨`;
}
function imprimirPreCuenta() {
    if (carrito.length === 0) return alert("Vacio");
    const t = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `<div class="ticket-header"><h3>PRE-CUENTA</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Subtotal:</span><span>C$ ${t.toFixed(2)}</span></div><div class="ticket-fila"><span>Total Sugerido (10%):</span><span>C$ ${(t * 1.1).toFixed(2)}</span></div>`;
    setTimeout(() => window.print(), 300);
}

// --- LÓGICA DE IMPORTACIÓN MASIVA ---

function abrirPegarMasivo() {
    document.getElementById('modal-pegar-masivo').style.display = 'flex';
    document.getElementById('texto-pegado').value = '';
    document.getElementById('estado-importacion').innerText = '';
}

async function procesarPegadoMasivo() {
    const texto = document.getElementById('texto-pegado').value;
    if (!texto.trim()) return alert("El área está vacía");

    const filas = texto.split('\n');
    const totalAProcesar = Math.min(filas.length, 70); // Límite de 70 filas
    let procesados = 0;

    document.getElementById('estado-importacion').innerHTML = `<i class="fas fa-spinner fa-spin"></i> Procesando ${totalAProcesar} productos...`;

    for (let i = 0; i < totalAProcesar; i++) {
        const columnas = filas[i].split('\t'); // Excel usa pestañas (tabs) entre columnas
        
        if (columnas.length >= 3) {
            const categoria = columnas[0].trim();
            const nombre = columnas[1].trim();
            // Limpiamos el precio por si trae "C$", comas o puntos
            const precio = parseFloat(columnas[2].replace(/[^\d.]/g, ''));

            if (nombre && !isNaN(precio)) {
                const datos = {
                    nombre: nombre,
                    precio: precio,
                    icono: '🍽️', // Icono por defecto
                    categoria: categoria || 'General',
                    stock: 999
                };

                try {
                    await fetch(`${URL_SERVIDOR}/agregar-producto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
                        body: JSON.stringify(datos)
                    });
                    procesados++;
                } catch (e) { console.error("Error en fila " + i); }
            }
        }
    }

    document.getElementById('estado-importacion').innerHTML = `<span style="color:green">✅ Se agregaron ${procesados} productos con éxito.</span>`;
    setTimeout(() => {
        cerrarModal();
        obtenerProductosDB(); // Refresca el menú principal
        renderizarAdminProductos(); // Refresca la tabla de admin
    }, 2000);
}