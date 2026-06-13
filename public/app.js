/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend Pro (Login + Sincronización + Cuentas Separadas + Comandas)
 */

// 1. CONFIGURACIÓN Y ESTADO GLOBAL
const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [];
let carrito = [];
let usuarioLogueado = null;
let mesaSeleccionada = null; // Ej: "Mesa 1"
let subCuentaActiva = null;  // Ej: "Mesa 1 - Diego"
let mesasAbiertas = [];

// ELEMENTOS DEL DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// 2. INICIALIZACIÓN
window.onload = async () => {
    console.log("🚀 Sistema El Carbonazo Pro Iniciado");
    // Cargamos usuarios para el login primero
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await refrescarMesas();
    
    // Iniciar Sincronización Automática (Cada 7 segundos)
    setInterval(async () => {
        if (!mesaSeleccionada) await refrescarMesas();
    }, 7000);
};

// 3. SEGURIDAD Y LOGIN
async function cargarUsuariosLogin() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const usuarios = await res.json();
        const selectLogin = document.getElementById('login-usuario');
        const selectHeader = document.getElementById('select-mesero');
        
        const opciones = usuarios.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
        selectLogin.innerHTML = opciones;
        selectHeader.innerHTML = opciones;
    } catch (e) { console.error("Error cargando usuarios"); }
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
        const data = await res.json();

        if (data.success) {
            usuarioLogueado = data.usuario;
            document.getElementById('select-mesero').value = usuarioLogueado;
            document.getElementById('pantalla-login').style.display = 'none';
            reproducirSonido('exito');
        } else {
            alert("PIN Incorrecto ❌");
        }
    } catch (e) { alert("Error de conexión"); }
}

// 4. MANEJO DE MESAS Y CUENTAS SEPARADAS
function dibujarMapaMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    contenedor.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const idMesaBase = `Mesa ${i}`;
        // Buscamos si hay cuentas para esta mesa
        const cuentasEnMesa = mesasAbiertas.filter(m => m.mesa.startsWith(idMesaBase));
        
        const btn = document.createElement('button');
        btn.className = `mesa-btn ${cuentasEnMesa.length > 0 ? 'ocupada' : ''} ${mesaSeleccionada === idMesaBase ? 'seleccionada' : ''}`;
        
        // Si hay varias cuentas, mostramos el número
        const infoCuentas = cuentasEnMesa.length > 1 ? ` (${cuentasEnMesa.length})` : '';
        btn.innerHTML = `<i class="fas fa-utensils"></i><br>${idMesaBase}${infoCuentas}`;
        
        btn.onclick = () => abrirSelectorDeCuenta(idMesaBase);
        contenedor.appendChild(btn);
    }
}

async function abrirSelectorDeCuenta(idMesaBase) {
    reproducirSonido('click');
    const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idMesaBase));

    if (cuentas.length === 0) {
        // Mesa libre: Abrir cuenta normal
        seleccionarCuentaDirecta(idMesaBase);
    } else {
        // Mesa ocupada: Preguntar qué cuenta abrir o si crear una nueva
        let mensaje = `Mesa ${idMesaBase} tiene cuentas activas:\n\n`;
        cuentas.forEach((c, index) => mensaje += `${index + 1}. ${c.mesa}\n`);
        mensaje += `\nEscriba el NÚMERO para abrir, o deje VACÍO para crear CUENTA NUEVA separada.`;

        const opcion = prompt(mensaje);
        if (opcion === null) return; // Canceló

        if (opcion === "") {
            const nombreNuevo = prompt("Nombre para la nueva cuenta separada (Ej: Diego):");
            seleccionarCuentaDirecta(`${idMesaBase} - ${nombreNuevo || 'Extra'}`);
        } else {
            const index = parseInt(opcion) - 1;
            if (cuentas[index]) {
                seleccionarCuentaDirecta(cuentas[index].mesa);
            }
        }
    }
}

function seleccionarCuentaDirecta(nombreCompleto) {
    subCuentaActiva = nombreCompleto;
    mesaSeleccionada = nombreCompleto.split(' - ')[0]; // Extrae "Mesa X"
    
    document.getElementById('id-mesa').value = subCuentaActiva;
    labelMesaActiva.innerText = `Editando: ${subCuentaActiva}`;
    
    const pedido = mesasAbiertas.find(m => m.mesa === subCuentaActiva);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    
    actualizarInterfazCarrito();
    dibujarMapaMesas();
}

// 5. COMANDAS Y GUARDADO
async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("❌ Seleccione una mesa primero.");
    if (carrito.length === 0) return alert("🛒 El carrito está vacío.");

    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const datos = { mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total };

    try {
        await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify(datos)
        });
        
        reproducirSonido('exito');
        if (confirm("✅ Guardado. ¿Imprimir COMANDA para cocina?")) {
            imprimirComanda(subCuentaActiva, carrito);
        }
        
        limpiarPantallaPostAccion();
        await refrescarMesas();
    } catch (e) { alert("Error al guardar pedido"); }
}

function imprimirComanda(mesa, items) {
    const area = document.getElementById('area-impresion');
    let itemsHtml = items.map(i => `<div class="ticket-fila"><span>[ ] ${i.cantidad} x ${i.nombre}</span></div>`).join('');
    
    area.innerHTML = `
        <div class="ticket-header">
            <h2 style="border:2px solid black; padding:5px;">COMANDA</h2>
            <p>MESA: ${mesa}</p>
            <p>${new Date().toLocaleTimeString()}</p>
        </div>
        <div class="ticket-divisor"></div>
        ${itemsHtml}
        <div class="ticket-divisor"></div>
        <p style="text-align:center;">Atiende: ${usuarioLogueado}</p>
    `;
    setTimeout(() => { window.print(); }, 300);
}

// 6. COBRO Y CIERRE
async function finalizarVenta() {
    if (carrito.length === 0) return alert("Carrito vacío");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);

    const datosVenta = { 
        total, mesero: usuarioLogueado, tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva, cliente: subCuentaActiva, metodo_pago: "Efectivo"
    };

    try {
        const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify(datosVenta)
        });
        const result = await res.json();
        
        if (result.success) {
            reproducirSonido('exito');
            // Borrar de mesas abiertas
            await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
            generarTicket(result.idVenta, datosVenta);
            
            limpiarPantallaPostAccion();
            await refrescarMesas();
        }
    } catch (e) { alert("Error al procesar pago"); }
}

// 7. UTILIDADES GENERALES
function limpiarPantallaPostAccion() {
    carrito = [];
    mesaSeleccionada = null;
    subCuentaActiva = null;
    document.getElementById('id-mesa').value = '';
    labelMesaActiva.innerText = "Ninguna mesa seleccionada";
    actualizarInterfazCarrito();
}

async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        mesasAbiertas = await res.json();
        dibujarMapaMesas();
    } catch (e) { console.error("Error de sincronización"); }
}

function filtrarBusqueda() {
    const busqueda = document.getElementById('buscar-producto').value.toLowerCase();
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda));
    cargarMenu(filtrados);
}

function filtrarPorCategoria(cat) {
    reproducirSonido('click');
    const filtrados = (cat === 'Todos') ? productos : productos.filter(p => p.categoria === cat);
    cargarMenu(filtrados);
}

function cargarMenu(lista) {
    contenedorMenu.innerHTML = '';
    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'tarjeta-producto';
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom:10px;">${prod.icono}</div>
            <h3>${prod.nombre}</h3>
            <p style="color: var(--primario); font-weight:bold;">C$ ${prod.precio.toFixed(2)}</p>
        `;
        card.onclick = () => agregarProducto(prod.id);
        contenedorMenu.appendChild(card);
    });
}

function agregarProducto(id) {
    reproducirSonido('click');
    const prod = productos.find(p => p.id === id);
    const existe = carrito.find(item => item.id === id);
    if (existe) existe.cantidad++; else carrito.push({ ...prod, cantidad: 1 });
    actualizarInterfazCarrito();
}

function eliminarUno(id) {
    const index = carrito.findIndex(i => i.id === id);
    if (index !== -1) {
        if (carrito[index].cantidad > 1) carrito[index].cantidad--; else carrito.splice(index, 1);
    }
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    listaCarrito.innerHTML = '';
    let total = 0;
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    carrito.forEach(item => {
        const sub = item.precio * item.cantidad;
        total += sub;
        const div = document.createElement('div');
        div.className = 'item-carrito-lista';
        div.innerHTML = `
            <div><strong>${item.nombre}</strong><br><small>${item.cantidad} x C$ ${item.precio.toFixed(2)}</small></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUno(${item.id})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        `;
        listaCarrito.appendChild(div);
    });
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias();
    } catch (e) { console.error("Error cargando productos"); }
}

function generarFiltrosCategorias() {
    const barra = document.getElementById('barra-categorias');
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria))];
    barra.innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
}

function generarTicket(id, datos) {
    const area = document.getElementById('area-impresion');
    let itemsHtml = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>C$ ${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `
        <div class="ticket-header"><h3>EL CARBONAZO</h3><p>Ticket #${id}</p><p>${new Date().toLocaleString()}</p></div>
        <div class="ticket-divisor"></div>
        <div class="ticket-fila"><strong>Mesa:</strong><span>${datos.mesa}</span></div>
        <div class="ticket-divisor"></div>
        ${itemsHtml}
        <div class="ticket-divisor"></div>
        <div class="ticket-total">TOTAL: C$ ${datos.total.toFixed(2)}</div>
        <div class="ticket-header"><p>Atendido por: ${datos.mesero}</p></div>
    `;
    setTimeout(() => { window.print(); }, 300);
}

function reproducirSonido(tipo) {
    const s = document.getElementById(`sonido-${tipo}`);
    if (s) { s.currentTime = 0; s.play().catch(() => {}); }
}

// Vincular botones
document.getElementById('btn-cobrar').onclick = finalizarVenta;

// MODALES ADMIN
function abrirAdminProductos() {
    document.getElementById('modal-admin-productos').style.display = 'block';
    renderizarAdminProductos();
}
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function cerrarModalAdmin() { cerrarModal(); }
function cerrarModalCierre() { cerrarModal(); }
function cerrarModalEditor() { cerrarModal(); }

// Historial y Cierre (Reutilizando lógica anterior simplificada)
async function abrirModalVentas() {
    document.getElementById('modal-ventas').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const ventas = await res.json();
    document.getElementById('cuerpo-tabla-ventas').innerHTML = ventas.map(v => `
        <tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${v.total.toFixed(2)}</td>
        <td><button onclick="confirmarBorrarVenta(${v.id})" style="color:red;"><i class="fas fa-trash"></i></button></td></tr>
    `).join('');
}

async function abrirCierreCaja() {
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const datos = await res.json();
    let totalDía = 0;
    let html = datos.map(f => { totalDía += parseFloat(f.totalvendido); return `<div class="ticket-fila"><span>${f.mesero}</span><span>C$ ${parseFloat(f.totalvendido).toFixed(2)}</span></div>`; }).join('');
    document.getElementById('cuerpo-cierre').innerHTML = `<h2 style="text-align:center;">Total: C$ ${totalDía.toFixed(2)}</h2><div style="padding:10px;">${html}</div>`;
}

function renderizarAdminProductos() {
    document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `
        <tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td>
        <td><button onclick="borrarProducto(${p.id})" style="color:red;"><i class="fas fa-trash"></i></button></td></tr>
    `).join('');
}