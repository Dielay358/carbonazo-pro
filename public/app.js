/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Premium con Gráficos, Notas y Logo
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartProds = null, chartPagos = null;

const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await refrescarMesas();
    await cargarTasaCambio();
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

// --- 2. SEGURIDAD ---
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

// --- 3. MENÚ Y NOTAS DE COCINA ---
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
            <p style="color:var(--primario); font-weight:bold;">C$ ${p.precio.toFixed(2)}</p>
            <small>Stock: ${p.stock ?? 'N/A'}</small>
        </div>
    `).join('');
}

function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota); // Solo sumar si no tiene nota (para no mezclar)
    if (ex) {
        if (ex.cantidad < p.stock) ex.cantidad++; else alert("Sin stock");
    } else {
        carrito.push({ ...p, cantidad: 1, nota: "" });
    }
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function agregarNota(index) {
    const nota = prompt("Nota de cocina (Ej: Bien cocido, Sin ensalada):", carrito[index].nota || "");
    if (nota !== null) {
        carrito[index].nota = nota;
        actualizarInterfazCarrito();
    }
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    let total = 0;
    listaCarrito.innerHTML = carrito.map((i, index) => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div onclick="agregarNota(${index})" style="cursor:pointer; flex:1;">
                <strong>${i.nombre}</strong><br>
                <small>${i.cantidad} x ${i.precio}</small>
                ${i.nota ? `<br><span style="color:var(--primario); font-size:0.75rem;">📝 ${i.nota}</span>` : `<br><span style="color:#aaa; font-size:0.7rem;">+ Agregar nota</span>`}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUnoCarrito(${index})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
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

// --- 4. DASHBOARD E INTELIGENCIA ---
async function cargarEstadisticas() {
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
            datasets: [{ label: 'Ventas (Unid)', data: data.topProductos.map(p => p.cantidad), backgroundColor: '#e63946' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    chartPagos = new Chart(ctxM, {
        type: 'doughnut',
        data: {
            labels: data.metodosPago.map(p => p.metodo),
            datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }]
        }
    });
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
}

// --- 5. TICKET CON LOGO ---
function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const itemsHtml = carrito.map(i => `
        <div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>
        ${i.nota ? `<div style="font-size:0.75rem; margin-bottom:5px;">>> OBS: ${i.nota}</div>` : ''}
    `).join('');
    
    area.innerHTML = `
        <div class="ticket-header">
            <img src="logo-carbonazo.png" style="width:130px; filter: grayscale(1); margin-bottom:5px;">
            <h3>EL CARBONAZO</h3>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="ticket-divisor"></div>
        <p>Mesa: ${d.mesa}</p>
        <div class="ticket-divisor"></div>
        ${itemsHtml}
        <div class="ticket-divisor"></div>
        <div class="ticket-fila"><span>Subtotal:</span><span>C$ ${(d.total - d.propina).toFixed(2)}</span></div>
        <div class="ticket-fila"><span>Propina (10%):</span><span>C$ ${d.propina.toFixed(2)}</span></div>
        <div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>
        <p style="text-align:center;">Atendió: ${usuarioLogueado}</p>
    `;
    setTimeout(() => window.print(), 300);
}

// --- UTILIDADES RESTANTES (Sincronizadas) ---
async function confirmarVentaFinal(metodo) {
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const datos = { 
        total: totalVentaSinPropina + propina, propina, mesero: usuarioLogueado, 
        tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva, cliente: document.getElementById('cliente-nombre').value || "Gral", 
        metodo_pago: metodo, items: carrito 
    };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(datos) });
    if (res.ok) {
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        reproducirSonido('exito');
        generarTicketPro(datos);
        limpiarPantallaPostAccion();
        cerrarModal();
        await obtenerProductosDB(); await refrescarMesas();
    }
}

async function refrescarMesas() {
    const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
    mesasAbiertas = await res.json(); 
    dibujarMapaMesas();
}

function seleccionarCuentaDirecta(nombre) {
    subCuentaActiva = nombre; mesaSeleccionada = nombre.split(' - ')[0];
    document.getElementById('id-mesa').value = nombre;
    labelMesaActiva.innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
    dibujarMapaMesas();
}

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total }) });
    reproducirSonido('exito');
    limpiarPantallaPostAccion(); await refrescarMesas();
}

function filtrarPorCategoria(cat) { cargarMenu(cat === 'Todos' ? productos : productos.filter(p => p.categoria === cat)); }
function generarFiltrosCategorias() { const barra = document.getElementById('barra-categorias'); const cats = ['Todos', ...new Set(productos.map(p => p.categoria || 'General'))]; barra.innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join(''); }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function abrirAdminProductos() { document.getElementById('modal-admin-productos').style.display='block'; cambiarTabAdmin('prods'); }
function abrirModalVentas() { document.getElementById('modal-ventas').style.display = 'block'; } // (Implementar fetch historial si necesario)
async function abrirCierreCaja() { document.getElementById('modal-cierre').style.display = 'block'; } // (Implementar fetch cierre si necesario)
async function cargarTasaCambio() { const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`); const data = await res.json(); tasaCambio = parseFloat(data.tasa); document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2); }