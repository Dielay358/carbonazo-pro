/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend Premium - CORRECCIÓN TOTAL DE LOGIN Y MESAS
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// --- ESTADO GLOBAL ---
let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartProds = null, chartPagos = null;

const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN (EL ORDEN IMPORTA) ---
window.onload = async () => {
    console.log("🚀 Iniciando El Carbonazo Pro...");
    try {
        await cargarUsuariosLogin();
        await obtenerProductosDB();
        await cargarTasaCambio();
        await refrescarMesas();
        
        // Sincronización cada 7 segundos si no estamos editando
        setInterval(async () => { 
            if (!subCuentaActiva) await refrescarMesas(); 
        }, 7000);
    } catch (e) {
        console.error("Error en inicialización:", e);
    }
};

// --- 2. SEGURIDAD Y LOGIN (FUNCIONES PRIORITARIAS) ---

async function cargarUsuariosLogin() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const usuarios = await res.json();
        const ops = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
        document.getElementById('login-usuario').innerHTML = ops;
        document.getElementById('select-mesero').innerHTML = ops;
    } catch(e) { console.error("Error cargando usuarios"); }
}

async function intentarLogin() {
    const nombre = document.getElementById('login-usuario').value;
    const pin = document.getElementById('login-pin').value;
    
    try {
        const res = await fetch(`${URL_SERVIDOR}/login`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ nombre, pin }) 
        });
        
        if (res.ok) {
            const data = await res.json();
            usuarioLogueado = data.usuario;
            document.getElementById('select-mesero').value = usuarioLogueado;
            document.getElementById('pantalla-login').style.display = 'none';
            reproducirSonido('exito');
        } else {
            alert("PIN Incorrecto ❌");
        }
    } catch (e) {
        alert("Error de conexión con el servidor");
    }
}

// --- 3. MENÚ Y PRODUCTOS ---

async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias();
    } catch(e) { console.error("Error productos"); }
}

function cargarMenu(lista) {
    if (!contenedorMenu) return;
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
    if (!barra) return;
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

// --- 4. MAPA DE MESAS ---

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
        mesasAbiertas = await res.json(); 
        dibujarMapaMesas();
    } catch(e) { console.error("Error sincronización mesas"); }
}

async function abrirSelectorDeCuenta(idBase) {
    reproducirSonido('click');
    const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
    mesaSeleccionada = idBase;

    if (cuentas.length === 0) {
        seleccionarCuentaDirecta(idBase);
    } else {
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

// --- 5. LÓGICA DEL CARRITO ---

function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota); 
    if (ex) {
        if (ex.cantidad < p.stock) ex.cantidad++; else alert("Sin stock suficiente");
    } else {
        carrito.push({ ...p, cantidad: 1, nota: "" });
    }
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(index) {
    const nota = prompt("Nota de cocina:", carrito[index].nota || "");
    if (nota !== null) {
        carrito[index].nota = nota;
        actualizarInterfazCarrito();
    }
}

function actualizarInterfazCarrito() {
    if (!listaCarrito) return;
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
                <strong>${i.nombre}</strong><br>
                <small>${i.cantidad} x ${i.precio}</small>
                ${i.nota ? `<br><span style="color:var(--primario); font-size:0.75rem;">📝 ${i.nota}</span>` : `<br><span style="color:#aaa; font-size:0.7rem;">+ Agregar nota</span>`}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUnoCarrito(${idx})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

function eliminarUnoCarrito(index) {
    if (carrito[index].cantidad > 1) carrito[index].cantidad--;
    else carrito.splice(index, 1);
    actualizarInterfazCarrito();
}

// --- 6. ACCIONES (GUARDAR, ANULAR, COBRAR) ---

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione una mesa primero");
    if (carrito.length === 0) return alert("Carrito vacío");
    
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    try {
        await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total })
        });
        reproducirSonido('exito');
        alert("Enviado a Cocina 🔥");
        limpiarPantallaPostAccion(); 
        await refrescarMesas();
    } catch(e) { alert("Error al guardar"); }
}

async function anularCuentaActual() {
    if (!subCuentaActiva) return;
    if (confirm(`⚠️ ¿Desea ELIMINAR permanentemente la cuenta "${subCuentaActiva}"?`)) {
        await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { 
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
        });
        limpiarPantallaPostAccion(); 
        await refrescarMesas();
    }
}

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
    const totalFinal = (totalVentaSinPropina - desc) + p;
    const cliente = document.getElementById('cliente-nombre').value || "Gral";

    const datos = { 
        total: totalFinal, 
        propina: p, 
        descuento: desc,
        mesero: usuarioLogueado, 
        tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva || "Barra", 
        cliente: cliente, 
        metodo_pago: metodo, 
        items: carrito 
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
        await obtenerProductosDB(); 
        await refrescarMesas();
    }
}

// --- 7. ADMIN Y DASHBOARD ---

async function cargarEstadisticas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
        const data = await res.json();
        const ctxP = document.getElementById('chartProductos').getContext('2d');
        const ctxM = document.getElementById('chartPagos').getContext('2d');

        if(chartProds) chartProds.destroy();
        if(chartPagos) chartPagos.destroy();

        chartProds = new Chart(ctxP, {
            type: 'bar',
            data: {
                labels: data.topProductos.map(p => p.nombre.substring(0,10)),
                datasets: [{ label: 'Ventas', data: data.topProductos.map(p => p.cantidad), backgroundColor: '#e63946' }]
            }
        });

        chartPagos = new Chart(ctxM, {
            type: 'doughnut',
            data: {
                labels: data.metodosPago.map(p => p.metodo),
                datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }]
            }
        });
    } catch(e) { console.error("Error stats"); }
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
}

// --- 8. UTILIDADES ---

function cerrarModal() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
}

function limpiarPantallaPostAccion() {
    carrito = []; mesaSeleccionada = null; subCuentaActiva = null;
    document.getElementById('id-mesa').value = '';
    if(labelMesaActiva) labelMesaActiva.innerText = "Ninguna mesa seleccionada";
    actualizarInterfazCarrito();
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const itemsHtml = carrito.map(i => `
        <div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>
        ${i.nota ? `<div style="font-size:0.75rem;">>> ${i.nota}</div>` : ''}
    `).join('');
    area.innerHTML = `
        <div class="ticket-header">
            <img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br>
            <h3>EL CARBONAZO</h3>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>
        ${itemsHtml}<div class="ticket-divisor"></div>
        <div class="ticket-fila"><span>Subtotal:</span><span>C$ ${(d.total - d.propina).toFixed(2)}</span></div>
        <div class="ticket-fila"><span>Propina:</span><span>C$ ${d.propina.toFixed(2)}</span></div>
        <div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>
        <p style="text-align:center;">Pago: ${d.metodo_pago}</p>`;
    setTimeout(() => window.print(), 300);
}

function prepararNuevaSubCuenta() { 
    const n = prompt("Nombre para la cuenta:"); 
    if (n) { 
        cerrarModal();
        seleccionarCuentaDirecta(`${mesaSeleccionada} - ${n}`); 
    } 
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
    document.getElementById('input-tasa-cambio').value = tasaCambio;
}

async function guardarTasaCambio() {
    const t = document.getElementById('input-tasa-cambio').value;
    await fetch(`${URL_SERVIDOR}/tasa-cambio`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, 
        body: JSON.stringify({ tasa: t }) 
    });
    alert("Tasa actualizada"); await cargarTasaCambio();
}

function reproducirSonido(t) { 
    const s = document.getElementById(`sonido-${t}`); 
    if (s) { s.currentTime=0; s.play().catch(()=>{}); } 
}

// Estas funciones deben estar presentes para evitar errores de ReferenceError
async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    document.getElementById('tabla-admin-usuarios').innerHTML = users.map(u => `<tr><td>${u.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join('');
}
async function borrarUsuario(id) { if(confirm("¿Eliminar?")) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); } }
async function guardarNuevoUsuario() {
    const nombre = document.getElementById('nuevo-user-nombre').value, pin = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre, pin }) });
    document.getElementById('nuevo-user-nombre').value = ''; document.getElementById('nuevo-user-pin').value = ''; renderizarAdminUsuarios();
}
async function abrirModalVentas() {
    document.getElementById('modal-ventas').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const ventas = await res.json();
    document.getElementById('cuerpo-tabla-ventas').innerHTML = ventas.map(v => `<tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${parseFloat(v.total).toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${v.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}
async function confirmarBorrarVenta(id) { if (confirm("¿Borrar venta?")) { await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); abrirModalVentas(); } }
async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const d = await res.json();
    document.getElementById('cuerpo-cierre').innerHTML = `
        <h2 style="text-align:center;">Ventas: C$ ${parseFloat(d.gran_total || 0).toFixed(2)}</h2>
        <h4 style="text-align:center; color:var(--exito);">Efectivo: C$ ${parseFloat(d.efectivo || 0).toFixed(2)}</h4>
        <h4 style="text-align:center; color:#457b9d;">Tarjeta: C$ ${parseFloat(d.tarjeta || 0).toFixed(2)}</h4>
    `;
}
async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) });
    await obtenerProductosDB(); renderizarAdminProductos();
}
function renderizarAdminProductos() { document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join(''); }
async function borrarProducto(id) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); await obtenerProductosDB(); renderizarAdminProductos(); }

// --- 1. AUDITORÍA INTELIGENTE ---
async function filtrarHistorialAuditoria() {
    const inicio = new Date(document.getElementById('filtro-inicio').value).toLocaleDateString();
    const fin = new Date(document.getElementById('filtro-fin').value).toLocaleDateString();
    
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas-auditoria?inicio=${inicio}&fin=${fin}`);
    const ventas = await res.json();
    
    let suma = 0;
    document.getElementById('cuerpo-tabla-ventas').innerHTML = ventas.map(v => {
        suma += parseFloat(v.total);
        return `<tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${parseFloat(v.total).toFixed(2)}</td><td>...</td></tr>`;
    }).join('');
    
    document.getElementById('total-auditoria').innerText = `TOTAL FILTRADO: C$ ${suma.toFixed(2)}`;
}

// --- 2. NOTIFICACIÓN DE COCINA ---
// Dentro de refrescarMesas(), añadimos la alerta
async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        const nuevasMesas = await res.json();
        
        // Comparar con el estado anterior para ver si hay algún pedido 'Listo' nuevo
        nuevasMesas.forEach(m => {
            const antigua = mesasAbiertas.find(ma => ma.mesa === m.mesa);
            if (m.estado_cocina === 'Listo' && (!antigua || antigua.estado_cocina === 'Pendiente')) {
                // ALERTA VISUAL Y SONORA
                alert(`🔔 ¡PEDIDO LISTO EN ${m.mesa}!`);
                reproducirSonido('exito');
            }
        });

        mesasAbiertas = nuevasMesas;
        dibujarMapaMesas();
    } catch(e) { console.error("Error sincronización"); }
}

// --- 3. SISTEMA DE FIDELIZACIÓN (PUNTOS) ---
async function buscarPuntos() {
    const tel = document.getElementById('cliente-tel').value;
    if (!tel) return;
    const res = await fetch(`${URL_SERVIDOR}/puntos-cliente/${tel}`);
    const data = await res.json();
    document.getElementById('cliente-puntos-aviso').innerText = `Puntos acumulados: ${data.puntos} ✨`;
}