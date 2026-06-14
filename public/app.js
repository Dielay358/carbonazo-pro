/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend Premium (Sincronizada con Nube)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// ESTADO GLOBAL
let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;

// ELEMENTOS DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    console.log("🚀 Iniciando El Carbonazo Pro...");
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await refrescarMesas();
    await cargarTasaCambio();
    
    // Sincronización cada 7 segundos (solo si no hay una mesa abierta editándose)
    setInterval(async () => { if (!subCuentaActiva) await refrescarMesas(); }, 7000);
};

// --- 2. SEGURIDAD Y MODALES ---

function cerrarModal() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

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
    const res = await fetch(`${URL_SERVIDOR}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, pin })
    });
    if (res.ok) {
        usuarioLogueado = nombre;
        document.getElementById('select-mesero').value = nombre;
        document.getElementById('pantalla-login').style.display = 'none';
        reproducirSonido('exito');
    } else alert("PIN Incorrecto ❌");
}

// --- 3. MENÚ Y CATEGORÍAS ---

async function obtenerProductosDB() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await res.json();
        cargarMenu(productos);
        generarFiltrosCategorias();
    } catch(e) { console.error("Error productos"); }
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

function cargarMenu(lista) {
    contenedorMenu.innerHTML = lista.map(p => `
        <div class="tarjeta-producto" onclick="agregarProducto(${p.id})">
            <div style="font-size: 2.5rem;">${p.icono}</div>
            <h3>${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold;">C$ ${p.precio.toFixed(2)}</p>
        </div>
    `).join('');
}

// --- 4. MAPA DE MESAS Y SUB-CUENTAS ---

function dibujarMapaMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
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

function prepararNuevaSubCuenta() {
    const nombre = prompt("Nombre para la nueva cuenta (Ej: Diego):");
    if (nombre) {
        cerrarModal();
        seleccionarCuentaDirecta(`${mesaSeleccionada} - ${nombre}`);
    }
}

function seleccionarCuentaDirecta(nombre) {
    subCuentaActiva = nombre;
    mesaSeleccionada = nombre.split(' - ')[0];
    document.getElementById('id-mesa').value = nombre;
    labelMesaActiva.innerText = `Editando: ${nombre}`;
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    actualizarInterfazCarrito();
    cerrarModal();
    dibujarMapaMesas();
}

// --- 5. CARRITO Y ACCIONES ---

function agregarProducto(id) {
    reproducirSonido('click');
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id);
    if (ex) ex.cantidad++; else carrito.push({ ...p, cantidad: 1 });
    actualizarInterfazCarrito();
}

function eliminarUno(id) {
    const idx = carrito.findIndex(i => i.id === id);
    if (idx !== -1) { if (carrito[idx].cantidad > 1) carrito[idx].cantidad--; else carrito.splice(idx, 1); }
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    let total = 0;
    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        totalMontoLabel.innerText = "C$ 0.00";
        return;
    }
    listaCarrito.innerHTML = carrito.map(i => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div><strong>${i.nombre}</strong><br><small>${i.cantidad} x C$ ${i.precio.toFixed(2)}</small></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUno(${i.id})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    totalMontoLabel.innerText = `C$ ${total.toFixed(2)}`;
}

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("❌ Seleccione una mesa primero.");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    try {
        await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total })
        });
        reproducirSonido('exito');
        if (confirm("✅ Guardado. ¿Imprimir comanda para cocina?")) imprimirComanda(subCuentaActiva, carrito);
        limpiarPantallaPostAccion();
        await refrescarMesas();
    } catch(e) { alert("Error al guardar pedido"); }
}

async function anularCuentaActual() {
    if (!subCuentaActiva) return;
    if (confirm(`⚠️ ¿Desea ELIMINAR permanentemente la cuenta "${subCuentaActiva}"?`)) {
        await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        limpiarPantallaPostAccion();
        await refrescarMesas();
    }
}

// --- 6. COBRO Y MONEDA ---

function finalizarVenta() {
    if (carrito.length === 0) return alert("El carrito está vacío.");
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
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const datos = { 
        total: totalVentaSinPropina + propina, propina, mesero: usuarioLogueado, 
        tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva, cliente: subCuentaActiva, metodo_pago: metodo 
    };
    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify(datos)
    });
    if (res.ok) {
        reproducirSonido('exito');
        await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        generarTicketPro(datos);
        limpiarPantallaPostAccion();
        cerrarModal();
        await refrescarMesas();
    }
}

// --- 7. HISTORIAL DE VENTAS (MODERNO) ---

async function abrirModalVentas() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-ventas');
    const tabla = document.getElementById('cuerpo-tabla-ventas');
    
    tabla.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Cargando historial...</td></tr>';
    modal.style.display = 'block';

    try {
        const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { 
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
        });
        const ventas = await res.json();

        if (ventas.length === 0) {
            tabla.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No hay ventas.</td></tr>';
            return;
        }

        tabla.innerHTML = ventas.map(v => {
            const [fecha, hora] = v.fecha.split(', ');
            return `
                <tr>
                    <td><span class="badge-id">#${v.id}</span></td>
                    <td>
                        <div style="font-weight:600;">${hora || ''}</div>
                        <div style="font-size:0.75rem; color:#666;">${fecha}</div>
                    </td>
                    <td><i class="fas fa-chair" style="color:#6c757d;"></i> ${v.mesa}</td>
                    <td><i class="fas fa-user-circle" style="color:#457b9d;"></i> ${v.mesero}</td>
                    <td><span class="monto-historial">C$ ${parseFloat(v.total).toFixed(2)}</span></td>
                    <td style="text-align:center;">
                        <button onclick="confirmarBorrarVenta(${v.id})" class="btn-borrar-v">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) { tabla.innerHTML = '<tr><td colspan="6">Error al cargar.</td></tr>'; }
}

async function confirmarBorrarVenta(id) {
    if (confirm(`¿Estás seguro de eliminar la venta #${id}?`)) {
        await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { 
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
        });
        abrirModalVentas();
    }
}

// --- 8. ADMINISTRACIÓN ---

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
}

async function guardarNuevoUsuario() {
    const nombre = document.getElementById('nuevo-user-nombre').value;
    const pin = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, 
        body: JSON.stringify({ nombre, pin }) 
    });
    document.getElementById('nuevo-user-nombre').value = '';
    document.getElementById('nuevo-user-pin').value = '';
    renderizarAdminUsuarios();
}

async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    document.getElementById('tabla-admin-usuarios').innerHTML = users.map(u => `
        <tr>
            <td><i class="fas fa-user"></i> ${u.nombre}</td>
            <td style="text-align:right;">
                <button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button>
            </td>
        </tr>
    `).join('');
}

async function borrarUsuario(id) {
    if(confirm("¿Eliminar mesero?")) { 
        await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { 
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
        }); 
        renderizarAdminUsuarios(); 
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
    alert("Tasa actualizada 🇳🇮"); 
    await cargarTasaCambio();
}

// --- 9. UTILIDADES ---

async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        mesasAbiertas = await res.json(); 
        dibujarMapaMesas();
    } catch(e) { console.error("Error sincronización"); }
}

function limpiarPantallaPostAccion() {
    carrito = []; mesaSeleccionada = null; subCuentaActiva = null;
    document.getElementById('id-mesa').value = '';
    labelMesaActiva.innerText = "Ninguna mesa";
    actualizarInterfazCarrito();
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `
        <div class="ticket-header"><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div>
        <div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>
        ${items}<div class="ticket-divisor"></div>
        <div class="ticket-fila"><span>Subtotal:</span><span>C$ ${(d.total - d.propina).toFixed(2)}</span></div>
        <div class="ticket-fila"><span>Propina:</span><span>C$ ${d.propina.toFixed(2)}</span></div>
        <div class="ticket-total">TOTAL: C$ ${d.total.toFixed(2)}</div>
        <p style="text-align:center;">Pago: ${d.metodo_pago} | Atendió: ${usuarioLogueado}</p>`;
    setTimeout(() => window.print(), 300);
}

function imprimirComanda(m, items) {
    const area = document.getElementById('area-impresion');
    const html = items.map(i => `<div class="ticket-fila"><span>[ ] ${i.cantidad} x ${i.nombre}</span></div>`).join('');
    area.innerHTML = `<div class="ticket-header"><h2>COMANDA</h2><h3>${m}</h3></div><div class="ticket-divisor"></div>${html}`;
    setTimeout(() => window.print(), 300);
}

function reproducirSonido(t) { 
    const s = document.getElementById(`sonido-${t}`); 
    if (s) { s.currentTime=0; s.play().catch(()=>{}); } 
}

// Cierres específicos requeridos por el HTML
function cerrarSelectorCuentas() { cerrarModal(); }
function cerrarModalAdmin() { cerrarModal(); }
function cerrarModalCierre() { cerrarModal(); }
function cerrarModalPago() { cerrarModal(); }
function cerrarModalEditor() { cerrarModal(); }

// REPORTES
async function abrirCierreCaja() {
    reproducirSonido('click');
    
    const modal = document.getElementById('modal-cierre');
    const contenedor = document.getElementById('cuerpo-cierre');

    // Verificación de seguridad para evitar el error de "null"
    if (!modal || !contenedor) {
        console.error("❌ Error: El modal de cierre no existe en el HTML.");
        alert("Error técnico: No se encontró el componente de cierre.");
        return;
    }

    contenedor.innerHTML = "<p style='text-align:center;'>Generando reporte...</p>";
    modal.style.display = 'block';

    try {
        const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { 
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
        });
        
        if (!res.ok) throw new Error("Error en servidor");
        
        const datos = await res.json();
        
        let tVentas = 0;
        let tPropinas = 0;

        let html = datos.map(f => {
            const venta = parseFloat(f.totalvendido) || 0;
            const propina = parseFloat(f.totalpropina) || 0;
            tVentas += venta;
            tPropinas += propina;
            
            return `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
                    <span><i class="fas fa-wallet"></i> ${f.metodo_pago}</span>
                    <div style="text-align:right;">
                        <div style="font-weight:bold;">C$ ${venta.toFixed(2)}</div>
                        <div style="font-size:0.7rem; color:var(--exito);">Propina: C$ ${propina.toFixed(2)}</div>
                    </div>
                </div>`;
        }).join('');

        contenedor.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h1 style="color:var(--oscuro); margin:0;">C$ ${tVentas.toFixed(2)}</h1>
                <small style="color:#666;">VENTAS TOTALES DEL DÍA</small>
                <div style="color:var(--exito); font-weight:bold; margin-top:5px;">
                    Total Propinas: C$ ${tPropinas.toFixed(2)}
                </div>
            </div>
            <div style="background:#f8f9fa; padding:15px; border-radius:10px;">
                <h4 style="margin-top:0; border-bottom:2px solid #ddd; padding-bottom:5px;">Desglose:</h4>
                ${html || '<p style="text-align:center;">No hay ventas hoy</p>'}
            </div>
        `;

    } catch (error) {
        console.error(error);
        contenedor.innerHTML = "<p style='color:red; text-align:center;'>Error al conectar con la base de datos.</p>";
    }
}

// ADMIN PRODUCTOS
function renderizarAdminProductos() {
    document.getElementById('cuerpo-tabla-admin').innerHTML = productos.map(p => `
        <tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio.toFixed(2)}</td>
        <td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

async function guardarNuevoProducto() {
    const datos = { 
        nombre: document.getElementById('nuevo-nombre').value, 
        precio: parseFloat(document.getElementById('nuevo-precio').value), 
        icono: document.getElementById('nuevo-icono').value, 
        categoria: document.getElementById('nuevo-categoria').value 
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
    if(!confirm("¿Eliminar producto?")) return;
    await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } 
    });
    await obtenerProductosDB(); 
    renderizarAdminProductos();
}