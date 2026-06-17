/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend v7.5 - ESTABLE Y SIN ERRORES
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// --- ESTADO GLOBAL ---
let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null;
let mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62, rolActual = 'mesero';
let chartPagos = null;

// ELEMENTOS DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    console.log("🚀 Sistema Iniciado...");
    try {
        // Ejecutamos cargas iniciales de forma segura
        await obtenerProductosDB();
        await cargarTasaCambio();
        await cargarUsuariosLista();
        await refrescarMesas();
        
        // Sincronización cada 7 segundos si no hay una cuenta abierta editándose
        setInterval(async () => { 
            if (!subCuentaActiva) await refrescarMesas(); 
        }, 7000);
    } catch (e) { console.error("Error en arranque:", e); }
};

// --- 2. LÓGICA DE ROLES Y PRIVACIDAD ---

function entrarComoMesero() {
    const selector = document.getElementById('select-mesero');
    usuarioLogueado = selector ? selector.value : 'Mesero';
    rolActual = 'mesero';
    
    const btnAdmin = document.getElementById('contenedor-botones-admin');
    const indRol = document.getElementById('indicador-rol');
    const pRol = document.getElementById('pantalla-inicio-rol');

    if (btnAdmin) btnAdmin.style.display = 'none';
    if (indRol) indRol.innerText = "MODO MESERO";
    if (pRol) pRol.style.display = 'none';
    
    reproducirSonido('click');
}

function mostrarLoginAdmin() {
    const pRol = document.getElementById('pantalla-inicio-rol');
    const pLogin = document.getElementById('pantalla-login-admin');
    if (pRol) pRol.style.display = 'none';
    if (pLogin) pLogin.style.display = 'flex';
}

function volverAlInicio() {
    const pRol = document.getElementById('pantalla-inicio-rol');
    const pLogin = document.getElementById('pantalla-login-admin');
    if (pLogin) pLogin.style.display = 'none';
    if (pRol) pRol.style.display = 'flex';
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
            rolActual = 'admin';
            usuarioLogueado = 'Admin';
            
            const selMesero = document.getElementById('select-mesero');
            const btnAdmin = document.getElementById('contenedor-botones-admin');
            const indRol = document.getElementById('indicador-rol');
            const pLogin = document.getElementById('pantalla-login-admin');

            if (selMesero) selMesero.value = 'Admin';
            if (btnAdmin) btnAdmin.style.display = 'flex';
            if (indRol) indRol.innerText = "👨‍✈️ ADMINISTRADOR";
            if (pLogin) pLogin.style.display = 'none';
            if (pinInput) pinInput.value = '';
            
            reproducirSonido('exito');
        } else {
            alert("PIN INCORRECTO ❌");
        }
    } catch(e) { alert("Error de conexión"); }
}

function cerrarSesionAdmin() { location.reload(); }

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

async function refrescarMesas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/mesas-abiertas`);
        const nuevas = await res.json();
        
        // Aviso si la cocina terminó algo
        nuevas.forEach(m => {
            const ant = mesasAbiertas.find(ma => ma.mesa === m.mesa);
            if (m.estado_cocina === 'Listo' && (!ant || ant.estado_cocina === 'Pendiente')) {
                alert(`🔔 ¡PEDIDO LISTO EN ${m.mesa}!`);
                reproducirSonido('exito');
            }
        });

        mesasAbiertas = nuevas; 
        dibujarMapaMesas();
    } catch(e) { console.error("Error sync mesas"); }
}

async function abrirSelectorDeCuenta(idBase) {
    reproducirSonido('click');
    const cuentas = mesasAbiertas.filter(m => m.mesa.startsWith(idBase));
    mesaSeleccionada = idBase;

    if (cuentas.length === 0) {
        seleccionarCuentaDirecta(idBase);
    } else {
        const modal = document.getElementById('modal-selector-cuentas');
        const titulo = document.getElementById('titulo-selector-mesa');
        const lista = document.getElementById('lista-cuentas-mesa');

        if (titulo) titulo.innerText = idBase;
        if (lista) {
            lista.innerHTML = cuentas.map(c => `
                <div class="btn-cuenta-card" onclick="seleccionarCuentaDirecta('${c.mesa}')">
                    <strong>${c.mesa.split(' - ')[1] || 'Principal'}</strong>
                    <span>C$ ${parseFloat(c.total_actual).toFixed(2)}</span>
                </div>
            `).join('');
        }
        if (modal) modal.style.display = 'block';
    }
}

function seleccionarCuentaDirecta(nombre) {
    subCuentaActiva = nombre;
    mesaSeleccionada = nombre.split(' - ')[0];
    
    const idMesaInput = document.getElementById('id-mesa');
    if (idMesaInput) idMesaInput.value = nombre;
    if (labelMesaActiva) labelMesaActiva.innerText = `Editando: ${nombre}`;
    
    const pedido = mesasAbiertas.find(m => m.mesa === nombre);
    carrito = pedido ? JSON.parse(pedido.items) : [];
    
    actualizarInterfazCarrito();
    cerrarModal();
    dibujarMapaMesas();
}

// --- 4. MENÚ E INVENTARIO ---

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
            <div style="font-size: 2.2rem;">${p.icono || '🍽️'}</div>
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
    const inputBusqueda = document.getElementById('buscar-producto');
    if (!inputBusqueda) return;
    const bus = inputBusqueda.value.toLowerCase();
    cargarMenu(productos.filter(p => p.nombre.toLowerCase().includes(bus)));
}

// --- 5. CARRITO Y NOTAS ---

function agregarProducto(id) {
    reproducirSonido('click');
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota); 
    if (ex) {
        if (ex.cantidad < p.stock) ex.cantidad++; else alert("Sin stock suficiente");
    } else {
        carrito.push({ ...p, cantidad: 1, nota: "" });
    }
    actualizarInterfazCarrito();
}

function agregarNota(idx) {
    const nota = prompt("Nota de cocina:", carrito[idx].nota || "");
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
    if (confirm(`⚠️ ¿Eliminar cuenta "${subCuentaActiva}"?`)) {
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
    
    const pSub = document.getElementById('pago-subtotal');
    const pProp = document.getElementById('input-propina');
    const pMod = document.getElementById('modal-metodo-pago');

    if (pSub) pSub.innerText = `C$ ${totalVentaSinPropina.toFixed(2)}`;
    if (pProp) pProp.value = (totalVentaSinPropina * 0.1).toFixed(2);
    
    actualizarTotalConPropina();
    if (pMod) pMod.style.display = 'block';
}

function actualizarTotalConPropina() {
    const pInput = document.getElementById('input-propina');
    const dInput = document.getElementById('input-descuento');
    const pTotal = document.getElementById('pago-total-final');
    const pUsd = document.getElementById('pago-total-usd');

    const p = pInput ? (parseFloat(pInput.value) || 0) : 0;
    const d = dInput ? (parseFloat(dInput.value) || 0) : 0;
    const tN = (totalVentaSinPropina - d) + p;
    
    if (pTotal) pTotal.innerText = `C$ ${tN.toFixed(2)}`;
    if (pUsd) pUsd.innerText = `$ ${(tN / tasaCambio).toFixed(2)}`;
}

async function confirmarVentaFinal(metodo) {
    const pInput = document.getElementById('input-propina');
    const dInput = document.getElementById('input-descuento');
    const p = pInput ? (parseFloat(pInput.value) || 0) : 0;
    const d = dInput ? (parseFloat(dInput.value) || 0) : 0;
    const totalF = (totalVentaSinPropina - d) + p;
    
    let pe=0, pt=0, ptr=0;
    if (metodo === 'Combinado') {
        pe = parseFloat(document.getElementById('split-efectivo').value) || 0;
        pt = parseFloat(document.getElementById('split-tarjeta').value) || 0;
        ptr = parseFloat(document.getElementById('split-transf').value) || 0;
    } else {
        if(metodo==='Efectivo') pe=totalF; else if(metodo==='Tarjeta') pt=totalF; else ptr=totalF;
    }

    const clienteNom = document.getElementById('cliente-nombre');
    const clienteTel = document.getElementById('cliente-tel');
    const tipoPed = document.getElementById('tipo-pedido');

    const datos = { 
        total: totalF, propina: p, descuento: d, mesero: usuarioLogueado, 
        tipo_pedido: tipoPed ? tipoPed.value : "Mesa",
        mesa: subCuentaActiva, cliente: clienteNom ? (clienteNom.value || "Gral") : "Gral", 
        tel: clienteTel ? clienteTel.value : "", metodo_pago: metodo, 
        items: carrito, p_efectivo: pe, p_tarjeta: pt, p_transf: ptr 
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

// --- 7. ADMINISTRACIÓN ---

function abrirAdminProductos() { 
    const modal = document.getElementById('modal-admin-productos');
    if (modal) {
        modal.style.display = 'block'; 
        cambiarTabAdmin('prods');
    }
}

function cambiarTabAdmin(tab) {
    reproducirSonido('click');
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    const target = document.getElementById('tab-' + tab);
    if(target) target.style.display = 'block';
    
    if(tab === 'users') renderizarAdminUsuarios();
    if(tab === 'config') cargarTasaCambio();
    if(tab === 'stats') cargarEstadisticas();
    if(tab === 'prods') renderizarAdminProductos();
}

async function cargarEstadisticas() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/dashboard-stats`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
        const data = await res.json();
        const canvas = document.getElementById('chartPagos');
        if(!canvas) return;
        const ctxM = canvas.getContext('2d');
        if(chartPagos) chartPagos.destroy();
        chartPagos = new Chart(ctxM, { type: 'doughnut', data: { labels: data.metodosPago.map(p => p.metodo), datasets: [{ data: data.metodosPago.map(p => p.monto), backgroundColor: ['#2a9d8f', '#457b9d', '#1d3557'] }] } });
    } catch(e) { console.error("Error stats"); }
}

function abrirPegarMasivo() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-pegar-masivo');
    if (modal) {
        modal.style.display = 'flex';
        const area = document.getElementById('texto-pegado');
        if (area) area.value = '';
    }
}

// --- REESCRIBIR FUNCIÓN PROCESAR PEGADO ---
async function procesarPegadoMasivo() {
    const area = document.getElementById('texto-pegado');
    const indicador = document.getElementById('estado-importacion');
    const texto = area ? area.value.trim() : "";

    if (!texto) {
        alert("⚠️ El cuadro está vacío. Pega tus columnas de Excel.");
        return;
    }

    // 1. Convertir texto a lista de objetos
    const filas = texto.split(/\r?\n/);
    const listaParaEnviar = [];

    indicador.style.color = "blue";
    indicador.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analizando datos...`;

    for (let f of filas) {
        // Detectar si el separador es TAB (Excel) o espacios múltiples
        const columnas = f.split(/\t/); 
        
        if (columnas.length >= 3) {
            const cat = columnas[0].trim();
            const nom = columnas[1].trim();
            // Limpiar precio de símbolos C$, comas o puntos extra
            const precioLimpio = columnas[2].replace(/[^0-9.]/g, '');
            const precio = parseFloat(precioLimpio);

            if (nom && !isNaN(precio)) {
                listaParaEnviar.push({
                    categoria: cat || 'General',
                    nombre: nom,
                    precio: precio,
                    icono: '🍴',
                    stock: 999
                });
            }
        }
    }

    if (listaParaEnviar.length === 0) {
        indicador.style.color = "red";
        indicador.innerHTML = "❌ Formato incorrecto. Use 3 columnas: Cat, Nombre, Precio.";
        return;
    }

    // 2. Enviar al servidor
    try {
        indicador.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Subiendo ${listaParaEnviar.length} productos...`;
        
        const respuesta = await fetch(`${URL_SERVIDOR}/importar-masivo`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN_ACCESO}` 
            },
            body: JSON.stringify({ productosLista: listaParaEnviar })
        });

        if (respuesta.ok) {
            const final = await respuesta.json();
            reproducirSonido('exito');
            indicador.style.color = "green";
            indicador.innerHTML = `✅ ¡Éxito! ${listaParaEnviar.length} productos agregados.`;
            
            // Limpiar y refrescar
            setTimeout(async () => {
                cerrarModal();
                await obtenerProductosDB(); // Actualiza el menú visual
                if (typeof renderizarAdminProductos === 'function') renderizarAdminProductos();
            }, 1500);
        } else {
            const errData = await respuesta.json();
            throw new Error(errData.error || "Error en el servidor");
        }
    } catch (e) {
        console.error(e);
        indicador.style.color = "red";
        indicador.innerHTML = `❌ Error: ${e.message}`;
        alert("Hubo un problema al guardar en la base de datos. Revisa la consola.");
    }
}

// --- 8. REPORTES Y HISTORIAL ---

async function abrirModalVentas() {
    const modal = document.getElementById('modal-ventas');
    if (!modal) return;
    modal.style.display = 'block';
    await filtrarHistorialAuditoria();
}

async function filtrarHistorialAuditoria() {
    const iInput = document.getElementById('filtro-inicio');
    const fInput = document.getElementById('filtro-fin');
    const res = await fetch(`${URL_SERVIDOR}/lista-ventas`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const ventas = await res.json();
    const cuerpo = document.getElementById('cuerpo-tabla-ventas');
    if(cuerpo) {
        cuerpo.innerHTML = ventas.map(v => `<tr><td>#${v.id}</td><td>${v.fecha}</td><td>${v.mesa}</td><td>${v.mesero}</td><td>C$ ${parseFloat(v.total).toFixed(2)}</td><td><button onclick="confirmarBorrarVenta(${v.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    }
}

async function abrirCierreCaja() {
    const modal = document.getElementById('modal-cierre');
    const cuerpo = document.getElementById('cuerpo-cierre');
    if (!modal || !cuerpo) return;
    
    modal.style.display = 'block';
    const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
    const d = await res.json();
    cuerpo.innerHTML = `
        <h2 style="text-align:center;">Ventas: C$ ${parseFloat(d.gran_total||0).toFixed(2)}</h2>
        <div style="background:#f8f9fa; padding:15px; border-radius:10px;">
            <p>💵 Efectivo: C$ ${parseFloat(d.efectivo||0).toFixed(2)}</p>
            <p>💳 Tarjeta: C$ ${parseFloat(d.tarjeta||0).toFixed(2)}</p>
        </div>`;
}

// --- 9. UTILIDADES EXTRAS ---

function cerrarModal() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }

function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }

async function cargarUsuariosLista() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/usuarios`);
        const u = await res.json();
        const ops = u.map(x => `<option value="${x.nombre}">${x.nombre}</option>`).join('');
        const sM = document.getElementById('select-mesero'), lU = document.getElementById('login-usuario');
        if (sM) sM.innerHTML = ops; if (lU) lU.innerHTML = ops;
    } catch (e) { console.error("Error usuarios"); }
}

async function cargarTasaCambio() {
    try {
        const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
        const data = await res.json();
        tasaCambio = parseFloat(data.tasa);
        const hT = document.getElementById('header-tasa');
        const iT = document.getElementById('input-tasa-cambio');
        if (hT) hT.innerText = tasaCambio.toFixed(2);
        if (iT) iT.value = tasaCambio;
    } catch(e) {}
}

async function guardarTasaCambio() {
    const val = document.getElementById('input-tasa-cambio').value;
    await fetch(`${URL_SERVIDOR}/tasa-cambio`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ tasa: val }) });
    alert("Actualizado"); await cargarTasaCambio();
}

function generarTicketPro(d) {
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>${i.nota ? `<div style="font-size:0.7rem;">>> ${i.nota}</div>` : ''}`).join('');
    area.innerHTML = `<div class="ticket-header"><img src="logo-carbonazo.png" style="width:120px; filter:grayscale(1);"><br><h3>EL CARBONAZO</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div><p>Mesa: ${d.mesa}</p><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Total:</span><span>C$ ${d.total.toFixed(2)}</span></div>`;
    setTimeout(() => window.print(), 300);
}

function imprimirPreCuenta() {
    if (carrito.length === 0) return alert("Vacío");
    const t = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
    const area = document.getElementById('area-impresion');
    const items = carrito.map(i => `<div class="ticket-fila"><span>${i.cantidad} x ${i.nombre}</span><span>${(i.precio * i.cantidad).toFixed(2)}</span></div>`).join('');
    area.innerHTML = `<div class="ticket-header"><h3>PRE-CUENTA</h3><p>${new Date().toLocaleString()}</p></div><div class="ticket-divisor"></div>${items}<div class="ticket-divisor"></div><div class="ticket-fila"><span>Subtotal:</span><span>C$ ${t.toFixed(2)}</span></div><div class="ticket-fila"><span>Total Sugerido (10%):</span><span>C$ ${(t * 1.1).toFixed(2)}</span></div>`;
    setTimeout(() => window.print(), 300);
}

async function renderizarAdminUsuarios() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const users = await res.json();
    const t = document.getElementById('tabla-admin-usuarios');
    if(t) t.innerHTML = users.map(u => `<tr><td>${u.nombre}</td><td style="text-align:right;"><button onclick="borrarUsuario(${u.id})" style="color:red; background:none; border:none;"><i class="fas fa-user-minus"></i></button></td></tr>`).join('');
}

async function renderizarAdminProductos() {
    const c = document.getElementById('cuerpo-tabla-admin');
    if(c) c.innerHTML = productos.map(p => `<tr><td>${p.icono || '🍽️'}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

async function guardarNuevoProducto() {
    const d = { nombre: document.getElementById('nuevo-nombre').value, precio: parseFloat(document.getElementById('nuevo-precio').value), icono: document.getElementById('nuevo-icono').value, categoria: document.getElementById('nuevo-categoria').value, stock: parseInt(document.getElementById('nuevo-stock').value) };
    await fetch(`${URL_SERVIDOR}/agregar-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify(d) });
    await obtenerProductosDB(); renderizarAdminProductos();
}

async function borrarProducto(id) { if(confirm("¿Borrar?")) { await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); await obtenerProductosDB(); renderizarAdminProductos(); } }
async function borrarUsuario(id) { if(confirm("¿Eliminar?")) { await fetch(`${URL_SERVIDOR}/usuarios-admin/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); renderizarAdminUsuarios(); } }
async function guardarNuevoUsuario() {
    const n = document.getElementById('nuevo-user-nombre').value, p = document.getElementById('nuevo-user-pin').value;
    await fetch(`${URL_SERVIDOR}/usuarios-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` }, body: JSON.stringify({ nombre: n, pin: p }) });
    renderizarAdminUsuarios();
}
async function buscarPuntos() {
    const tInput = document.getElementById('cliente-tel');
    const tel = tInput ? tInput.value : ""; if (!tel) return;
    const res = await fetch(`${URL_SERVIDOR}/puntos-cliente/${tel}`);
    const data = await res.json();
    const aviso = document.getElementById('cliente-puntos-aviso');
    if (aviso) aviso.innerText = `Puntos acumulados: ${data.puntos || 0} ✨`;
}

function cambiarMesero() {
    const s = document.getElementById('select-mesero');
    if (s) usuarioLogueado = s.value;
}

async function confirmarBorrarVenta(id) { if (confirm("¿Borrar venta?")) { await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } }); abrirModalVentas(); } }