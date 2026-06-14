const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null, mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;

window.onload = async () => {
    await cargarUsuariosLogin();
    await obtenerProductosDB();
    await refrescarMesas();
    await cargarTasaCambio();
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
        document.getElementById('pantalla-login').style.display = 'none';
        reproducirSonido('exito');
    } else alert("PIN Incorrecto");
}

// --- PRODUCTOS E INVENTARIO ---
async function obtenerProductosDB() {
    const res = await fetch(`${URL_SERVIDOR}/productos`);
    productos = await res.json();
    cargarMenu(productos);
    generarFiltrosCategorias();
}

function cargarMenu(lista) {
    document.getElementById('contenedor-menu').innerHTML = lista.map(p => `
        <div class="tarjeta-producto ${p.stock <= 0 ? 'agotado' : ''}" onclick="p.stock > 0 && agregarProducto(${p.id})">
            <div style="font-size: 2.2rem;">${p.icono}</div>
            <h3 style="margin:5px 0;">${p.nombre}</h3>
            <p style="color:var(--primario); font-weight:bold; margin:0;">C$ ${p.precio.toFixed(2)}</p>
            <small class="${p.stock < 5 ? 'low-stock' : ''}">Stock: ${p.stock}</small>
        </div>
    `).join('');
}

// --- MESAS Y CUENTAS ---
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

// --- CARRITO ---
function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id);
    if (ex) {
        if (ex.cantidad < p.stock) ex.cantidad++; else alert("Sin stock suficiente");
    } else {
        carrito.push({ ...p, cantidad: 1 });
    }
    actualizarInterfazCarrito();
    reproducirSonido('click');
}

function actualizarInterfazCarrito() {
    let total = 0;
    if (carrito.length === 0) {
        document.getElementById('items-carrito').innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        document.getElementById('total-monto').innerText = "C$ 0.00";
        return;
    }
    document.getElementById('items-carrito').innerHTML = carrito.map(i => {
        const sub = i.precio * i.cantidad; total += sub;
        return `<div class="item-carrito-lista">
            <div><strong>${i.nombre}</strong><br><small>${i.cantidad} x ${i.precio}</small></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span>C$ ${sub.toFixed(2)}</span>
                <button onclick="eliminarUno(${i.id})" class="btn-eliminar"><i class="fas fa-minus-circle"></i></button>
            </div>
        </div>`;
    }).join('');
    document.getElementById('total-monto').innerText = `C$ ${total.toFixed(2)}`;
}

// --- COBRO Y CRM ---
function finalizarVenta() {
    if (carrito.length === 0) return alert("Carrito vacío");
    totalVentaSinPropina = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    document.getElementById('pago-subtotal').innerText = `C$ ${totalVentaSinPropina.toFixed(2)}`;
    document.getElementById('input-propina').value = (totalVentaSinPropina * 0.1).toFixed(2);
    actualizarTotalConPropina();
    document.getElementById('modal-metodo-pago').style.display = 'block';
}

async function confirmarVentaFinal(metodo) {
    const propina = parseFloat(document.getElementById('input-propina').value) || 0;
    const clienteNombre = document.getElementById('cliente-nombre').value || "General";
    const clienteTel = document.getElementById('cliente-tel').value || "";

    const datos = { 
        total: totalVentaSinPropina + propina, propina, mesero: usuarioLogueado, 
        tipo_pedido: document.getElementById('tipo-pedido').value,
        mesa: subCuentaActiva, cliente: clienteNombre, metodo_pago: metodo,
        items: carrito // Enviamos items para restar stock
    };

    const res = await fetch(`${URL_SERVIDOR}/nueva-venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify(datos)
    });

    if (res.ok) {
        if (clienteTel) await fetch(`${URL_SERVIDOR}/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: clienteNombre, telefono: clienteTel }) });
        if (subCuentaActiva) await fetch(`${URL_SERVIDOR}/limpiar-mesa/${subCuentaActiva}`, { method: 'DELETE' });
        
        reproducirSonido('exito');
        generarTicketPro(datos);
        limpiarPantallaPostAccion();
        cerrarModal();
        await obtenerProductosDB(); // Refrescar stock en el menú
        await refrescarMesas();
    }
}

// --- UTILIDADES ---
function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }

async function refrescarMesas() {
    const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
    mesasAbiertas = await res.json(); dibujarMapaMesas();
}

async function guardarPedidoTemporal() {
    if (!subCuentaActiva) return alert("Seleccione mesa");
    const total = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    await fetch(`${URL_SERVIDOR}/guardar-mesa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify({ mesa: subCuentaActiva, items: carrito, mesero: usuarioLogueado, total_actual: total })
    });
    alert("Enviado a Monitor de Cocina 🔥");
    limpiarPantallaPostAccion(); await refrescarMesas();
}

function limpiarPantallaPostAccion() {
    carrito = []; mesaSeleccionada = null; subCuentaActiva = null;
    document.getElementById('id-mesa').value = '';
    document.getElementById('label-mesa-activa').innerText = "Ninguna mesa";
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-tel').value = '';
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