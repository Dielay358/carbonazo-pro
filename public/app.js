/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend Premium - 100% Sincronizada
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;

const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    console.log("🚀 Sistema Iniciado");
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await cargarTasaCambio();
    await refrescarMesas(); // Esta función dibuja las mesas
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

async function cargarUsuariosLogin() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const usuarios = await res.json();
        const ops = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
        document.getElementById('login-usuario').innerHTML = ops;
        document.getElementById('select-mesero').innerHTML = ops;
    } catch(e) { console.error("Error usuarios"); }
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

// --- 2. MENÚ Y CATEGORÍAS ---
async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias(); // <--- Aquí estaba el error, ahora la función existe abajo
    } catch(e) { console.error("Error productos"); }
}

function generarFiltrosCategorias() {
    const barra = document.getElementById('barra-categorias');
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

function cargarMenu(lista) {
    contenedorMenu.innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="p.stock > 0 && agregarProducto(${p.id})">
            <div style="font-size: 2.2rem;">${p.icono}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold;">C$ ${p.precio.toFixed(2)}</p>
            <small>Stock: ${p.stock ?? 'N/A'}</small>
        </div>
    `).join('');
}

// --- 3. MAPA DE MESAS ---
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
    document.getElementById('id-mesa').value = nombre;
    labelMesaActiva.innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
    dibujarMapaMesas();
}

// --- 4. ACCIONES CARRITO ---
function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id);
    if (ex) ex.cantidad++; else carrito.push({ ...p, cantidad: 1 });
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function eliminarUno(id) {
    const idx = carrito.findIndex(i => i.id === id);
    if (idx !== -1) { if (carrito[idx].cantidad > 1) carrito[idx].cantidad--; else carrito.splice(idx, 1); }
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    let total = 0;
    listaCarrito.innerHTML = carrito.map(i => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div><strong>${i.nombre}</strong><br><small>${i.cantidad} x ${i.precio}</small></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUno(${i.id})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total })
    });
    reproducirSonido('exito');
    limpiarPantallaPostAccion(); await refrescarMesas();
}

function anularCuentaActual() {
    if (!subCuentaActiva) return;
    if (confirm("¿Borrar cuenta?")) {
        fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } })
        .then(() => { limpiarPantallaPostAccion(); refrescarMesas(); });
    }
}

// --- 5. COBRO Y PAGO ---
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
    const tN = totalVentaSinPropina + p;
    document.getElementById('pago-total-final').innerText = `C$ ${tN.toFixed(2)}`;
    document.getElementById('pago-total-usd').innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(metodo) {
    const p = parseFloat(document.getElementById('input-propina').value) || 0;
    const datos = { total: totalVentaSinPropina + p, propina: p, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value, mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", metodo_pago: metodo, items: carrito };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
        reproducirSonido('exito');
        generarTicketPro(datos); limpiarPantallaPostAccion();
        cerrarModal(); await obtenerProductosDB(); await refrescarMesas();
    }
}

// --- UTILIDADES ---
async function refrescarMesas() {
    const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
    mesasAbiertas = await res.json(); 
    dibujarMapaMesas();
}

function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function prepararNuevaSubCuenta() { const n = prompt("Nombre cuenta:"); if (n) { seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); } }

function limpiarPantallaPostAccion() {
    carrito = []; mesaSeleccionada = null; subCuentaActiva = null;
    document.getElementById('id-mesa').value = '';
    labelMesaActiva.innerText = "Ninguna mesa";
    actualizarInterfazCarrito();
}

// --- ADMIN Y OTROS ---
async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
}

function cambiarTabAdmin(tab) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
}

async function guardarTasaCambio() {
    const t = document.getElementById('input-tasa-cambio').value;
    await fetch(`${URL_SERVIDOR}/tasa-cambio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ tasa: t }) });
    alert("Tasa actualizada"); await cargarTasaCambio();
}

function abrirAdminProductos() { document.getElementById('modal-admin-productos').style.display='block'; cambiarTabAdmin('prods'); renderizarAdminProductos(); }
function renderizarAdminProductos() {
    document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}
async function guardarNuevoProducto() {
    const datos = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    await obtenerProductosDB(); renderizarAdminProductos();
}
async function borrarProducto(id) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); await obtenerProductosDB(); renderizarAdminProductos(); }
async function guardarNuevoUsuario() {
    const nombre = document.getElementById('nuevo-user-nombre').value, pin = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre, pin }) });
    renderizarAdminUsuarios();
}
async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    document.getElementById('tabla-admin-usuarios').innerHTML = users.map(u => `<tr><td>${u.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join('');
}
async function borrarUsuario(id) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); }

async function abrirModalVentas() {
    document.getElementById('modal-ventas').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const ventas = await res.json();
    document.getElementById('cuerpo-tabla-ventas').innerHTML = ventas.map(v => `<tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${v.total.toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${v.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const datos = await res.json();
    let tV = 0, tP = 0;
    let html = datos.map(f => { tV += parseFloat(f.totalvendido); tP += parseFloat(f.totalpropina); return `<div style="display:flex; justify-content:space-between; padding:5px 0;"><span>${f.metodo_pago}</span><span>C$ ${parseFloat(f.totalvendido).toFixed(2)}</span></div>`; }).join('');
    document.getElementById('cuerpo-cierre').innerHTML = `<h2 style="text-align:center;">Ventas: C$ ${tV.toFixed(2)}</h2><h4 style="text-align:center; color:var(--exito);">Propinas: C$ ${tP.toFixed(2)}</h4><div style="padding:10px;">${html}</div>`;
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `<div class="ticket-header"><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Subtotal:</span><span>${(d.total - d.propina).toFixed(2)}</span></div><div class="ticket-fila"><span>Propina:</span><span>${d.propina.toFixed(2)}</span></div><div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div><p style="text-align:center;">Pago: ${d.metodo_pago}</p>`;
    setTimeout(() => window.print(), 300);
}

// --- PRE-CUENTA (Imprimir para el cliente sin cerrar mesa) ---
function imprimirPreCuenta() {
    if (carrito.length === 0) return alert("Carrito vacío");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const propina = total * 0.10;
    
    const area = document.getElementById('area-impresion');
    let itemsHtml = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>C$ ${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    
    area.innerHTML = `
        <div class="ticket-header">
            <h3>EL CARBONAZO</h3>
            <p>*** PRE-CUENTA ***</p>
            <p>(No es un comprobante de pago)</p>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="ticket-divisor"></div>
        <p>Mesa: ${subCuentaActiva || "Barra"}</p>
        <div class="ticket-divisor"></div>
        ${itemsHtml}
        <div class="ticket-divisor"></div>
        <div class="ticket-fila"><span>Subtotal:</span><span>C$ ${total.toFixed(2)}</span></div>
        <div class="ticket-fila"><span>Propina (10%):</span><span>C$ ${propina.toFixed(2)}</span></div>
        <div class="ticket-total">TOTAL A PAGAR: C$ ${(total + propina).toFixed(2)}</div>
    `;
    setTimeout(() => window.print(), 300);
}

// --- PAGOS COMBINADOS ---
function activarPagoCombinado() {
    document.getElementById('seccion-pago-simple').style.display = 'none';
    document.getElementById('seccion-pago-combinado').style.display = 'block';
    validarSumaCombinada();
}

function validarSumaCombinada() {
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const totalObjetivo = totalVentaSinPropina + propina;
    
    const efec = parseFloat(document.getElementById('split-efectivo').value) || 0;
    const tarj = parseFloat(document.getElementById('split-tarjeta').value) || 0;
    const trans = parseFloat(document.getElementById('split-transf').value) || 0;
    
    const sumaActual = efec + tarj + trans;
    const faltante = totalObjetivo - sumaActual;
    
    const aviso = document.getElementById('combinado-aviso');
    const btn = document.getElementById('btn-confirmar-combinado');
    
    if (Math.abs(faltante) < 0.01) {
        aviso.innerText = "✅ Total exacto";
        aviso.style.color = "green";
        btn.disabled = false;
    } else {
        aviso.innerText = faltante > 0 ? `Faltan: C$ ${faltante.toFixed(2)}` : `Sobra: C$ ${Math.abs(faltante).toFixed(2)}`;
        aviso.style.color = "red";
        btn.disabled = true;
    }
}

// --- ACTUALIZAR CONFIRMAR VENTA FINAL ---
async function confirmarVentaFinal(metodo) {
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const totalFinal = totalVentaSinPropina + propina;
    
    // Valores para el desglose
    let p_efectivo = 0, p_tarjeta = 0, p_transf = 0;
    
    if (metodo === 'Combinado') {
        p_efectivo = parseFloat(document.getElementById('split-efectivo').value) || 0;
        p_tarjeta = parseFloat(document.getElementById('split-tarjeta').value) || 0;
        p_transf = parseFloat(document.getElementById('split-transf').value) || 0;
    } else if (metodo === 'Efectivo') p_efectivo = totalFinal;
    else if (metodo === 'Tarjeta') p_tarjeta = totalFinal;
    else if (metodo === 'Transferencia') p_transf = totalFinal;

    const datos = { 
        total: totalFinal, propina, mesero: usuarioLogueado, 
        tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", 
        metodo_pago: metodo, items: carrito,
        p_efectivo, p_tarjeta, p_transf
    };

    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify(datos)
    });

    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito');
        generarTicketPro(datos);
        limpiarPantallaPostAccion();
        cerrarModal();
        document.getElementById('seccion-pago-simple').style.display = 'block';
        document.getElementById('seccion-pago-combinado').style.display = 'none';
        await obtenerProductosDB(); await refrescarMesas();
    }
}