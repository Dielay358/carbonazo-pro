/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend Unificada (Mesas + Categorías + Admin)
 */

// 1. CONFIGURACIÓN Y ESTADO GLOBAL
const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [];
let carrito = [];
let meseroActivo = "Admin";
let mesaSeleccionada = null;
let mesasAbiertas = [];

// ELEMENTOS DEL DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// 2. INICIALIZACIÓN AL CARGAR LA PÁGINA
window.onload = async () => {
    console.log("🚀 Sistema El Carbonazo Pro Online");
    await obtenerProductosDB();
    await cargarMeseros();
    await refrescarMesas();
    actualizarInterfazCarrito();
};

// 3. COMUNICACIÓN CON EL SERVIDOR
async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias();
    } catch (e) { console.error("Error al cargar productos", e); }
}

async function cargarMeseros() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const meseros = await res.json();
        const selector = document.getElementById('select-mesero');
        selector.innerHTML = meseros.map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
        meseroActivo = selector.value;
    } catch (e) { console.error("Error al cargar meseros"); }
}

async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        mesasAbiertas = await res.json();
        dibujarMapaMesas();
    } catch (e) { console.error("Error al refrescar mesas"); }
}

// 4. LÓGICA DE MENÚ Y FILTROS
function cargarMenu(lista) {
    contenedorMenu.innerHTML = '';
    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'tarjeta-producto';
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom:10px;">${prod.icono}</div>
            <h3 style="margin:5px 0;">${prod.nombre}</h3>
            <p style="color: var(--primario); font-weight:bold;">C$ ${prod.precio.toFixed(2)}</p>
            <small style="color: #666; font-style: italic;">${prod.categoria}</small>
        `;
        card.onclick = () => agregarProducto(prod.id);
        contenedorMenu.appendChild(card);
    });
}

function generarFiltrosCategorias() {
    const barra = document.getElementById('barra-categorias');
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria))];
    barra.innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
}

function filtrarPorCategoria(cat) {
    reproducirSonido('click');
    const filtrados = (cat === 'Todos') ? productos : productos.filter(p => p.categoria === cat);
    cargarMenu(filtrados);
}

function filtrarBusqueda() {
    const busqueda = document.getElementById('buscar-producto').value.toLowerCase();
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda));
    cargarMenu(filtrados);
}

// 5. MANEJO DE MESAS (CUENTAS ABIERTAS)
function dibujarMapaMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    contenedor.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const nombreMesa = `Mesa ${i}`;
        const pedido = mesasAbiertas.find(m => m.mesa === nombreMesa);
        const btn = document.createElement('button');
        btn.className = `mesa-btn ${pedido ? 'ocupada' : ''} ${mesaSeleccionada === nombreMesa ? 'seleccionada' : ''}`;
        btn.innerHTML = `<i class="fas fa-utensils"></i><br>${nombreMesa}`;
        btn.onclick = () => seleccionarMesa(nombreMesa);
        contenedor.appendChild(btn);
    }
}

async function seleccionarMesa(nombre) {
    reproducirSonido('click');
    mesaSeleccionada = nombre;
    labelMesaActiva.innerText = `Editando: ${nombre}`;
    document.getElementById('id-mesa').value = nombre;
    
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    
    actualizarInterfazCarrito();
    dibujarMapaMesas();
}

async function guardarPedidoTemporal() {
    if (!mesaSeleccionada) return alert("❌ Seleccione una mesa primero.");
    if (carrito.length === 0) return alert("🛒 El carrito está vacío.");

    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const datos = { mesa: mesaSeleccionada, items: carrito, mesero: meseroActivo, total_actual: total };

    try {
        await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify(datos)
        });
        reproducirSonido('exito');
        alert(`✅ Pedido guardado en ${mesaSeleccionada}`);
        await refrescarMesas();
    } catch (e) { alert("Error al guardar."); }
}

// 6. LÓGICA DEL CARRITO
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

// 7. FINALIZAR VENTA Y COBRAR
async function finalizarVenta() {
    if (carrito.length === 0) return alert("No hay productos.");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const mesa = document.getElementById('id-mesa').value || "Barra";

    const datosVenta = { 
        total, mesero: meseroActivo, tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa, cliente: mesa, metodo_pago: "Efectivo"
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
            if (mesaSeleccionada) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${mesaSeleccionada}`, { method: 'DELETE' });
            generarTicket(result.idVenta, datosVenta);
            carrito = [];
            mesaSeleccionada = null;
            document.getElementById('id-mesa').value = '';
            labelMesaActiva.innerText = "Ninguna mesa seleccionada";
            actualizarInterfazCarrito();
            await refrescarMesas();
        }
    } catch (e) { alert("Error al cobrar"); }
}
document.getElementById('btn-cobrar').onclick = finalizarVenta;

// 8. ADMINISTRACIÓN DE PRODUCTOS
function abrirAdminProductos() {
    reproducirSonido('click');
    document.getElementById('modal-admin-productos').style.display = 'block';
    renderizarAdminProductos();
}

function renderizarAdminProductos() {
    const tabla = document.getElementById('cuerpo-tabla-admin');
    tabla.innerHTML = productos.map(p => `
        <tr>
            <td>${p.icono}</td>
            <td>${p.nombre}</td>
            <td>C$ ${p.precio}</td>
            <td>
                <button onclick="prepararEdicion(${p.id})" style="color:blue;"><i class="fas fa-edit"></i></button>
                <button onclick="borrarProducto(${p.id})" style="color:red;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function guardarNuevoProducto() {
    const datos = {
        nombre: document.getElementById('nuevo-nombre').value,
        precio: parseFloat(document.getElementById('nuevo-precio').value),
        icono: document.getElementById('nuevo-icono').value || '🥩',
        categoria: document.getElementById('nuevo-categoria').value || 'General'
    };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify(datos)
    });
    await obtenerProductosDB();
    renderizarAdminProductos();
}

async function borrarProducto(id) {
    if (!confirm("¿Eliminar producto?")) return;
    await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
    });
    await obtenerProductosDB();
    renderizarAdminProductos();
}

// 9. REPORTE DE CIERRE
async function abrirCierreCaja() {
    reproducirSonido('click');
    document.getElementById('modal-cierre').style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const datos = await res.json();
    let totalDía = 0;
    let html = datos.map(f => {
        totalDía += f.totalvendido;
        return `<div class="ticket-fila"><span>${f.mesero}</span><span>C$ ${f.totalvendido.toFixed(2)}</span></div>`;
    }).join('');
    document.getElementById('cuerpo-cierre').innerHTML = `
        <h2 style="text-align:center;">Total: C$ ${totalDía.toFixed(2)}</h2>
        <div style="padding:10px;">${html}</div>
    `;
}

// 10. FUNCIONES EXTRA (TICKET Y SONIDO)
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

function cambiarMesero() {
    meseroActivo = document.getElementById('select-mesero').value;
    reproducirSonido('click');
}

function reproducirSonido(tipo) {
    const s = document.getElementById(`sonido-${tipo}`);
    if (s) { s.currentTime = 0; s.play().catch(() => {}); }
}

// Funciones de cierre de modales
function cerrarModal() { document.getElementById('modal-ventas').style.display = 'none'; }
function cerrarModalAdmin() { document.getElementById('modal-admin-productos').style.display = 'none'; }
function cerrarModalCierre() { document.getElementById('modal-cierre').style.display = 'none'; }
function cerrarModalEditor() { document.getElementById('modal-editar-producto').style.display = 'none'; }