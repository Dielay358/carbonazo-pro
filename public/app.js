/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * DNA: Lógica Frontend PREMIUM v6.1 (Corrección de botones Admin)
 */

const URL_SERVIDOR = window.location.origin;
const TOKEN_ACCESO = "carbonazo2024pro";

// --- ESTADO GLOBAL ---
let productos = [], carrito = [], usuarioLogueado = null, mesaSeleccionada = null, subCuentaActiva = null;
let mesasAbiertas = [], totalVentaSinPropina = 0, tasaCambio = 36.62;
let chartPagos = null;

const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');
const labelMesaActiva = document.getElementById('label-mesa-activa');

// --- 1. INICIALIZACIÓN ---
window.onload = async () => {
    console.log("🚀 Iniciando Motor Visual...");
    try {
        await cargarUsuariosLista();
        await obtenerProductosDB();
        await cargarTasaCambio();
        await refrescarMesas();
        
        setInterval(async () => { 
            if (!subCuentaActiva) await refrescarMesas(); 
        }, 7000);
    } catch (e) { console.error("Error en arranque:", e); }
};

// --- 2. FUNCIONES DE APERTURA DE PANELES (GLOBALES) ---

// ESTA ES LA FUNCIÓN QUE TE DABA ERROR:
function abrirAdminProductos() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-admin-productos');
    if (modal) {
        modal.style.display = 'block';
        cambiarTabAdmin('prods'); // Abre por defecto en la pestaña de productos
    } else {
        console.error("No se encontró el modal-admin-productos");
    }
}

function abrirModalVentas() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-ventas');
    if (modal) {
        modal.style.display = 'block';
        filtrarHistorialAuditoria();
    }
}

async function abrirCierreCaja() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-cierre');
    if (modal) {
        modal.style.display = 'block';
        const res = await fetch(`${URL_SERVIDOR}/reporte-cierre`, { headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` } });
        const d = await res.json();
        document.getElementById('cuerpo-cierre').innerHTML = `
            <div style="text-align:center; padding:10px;">
                <h2 style="margin:0;">Total Hoy: C$ ${parseFloat(d.gran_total || 0).toFixed(2)}</h2>
                <hr>
                <p>💵 Efectivo: C$ ${parseFloat(d.efectivo || 0).toFixed(2)}</p>
                <p>💳 Tarjeta: C$ ${parseFloat(d.tarjeta || 0).toFixed(2)}</p>
            </div>
        `;
    }
}

function cerrarModal() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

// --- 3. LÓGICA DE ROLES Y LOGIN ---

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

async function intentarLoginAdmin() {
    const pin = document.getElementById('login-pin-admin').value;
    const res = await fetch(`${URL_SERVIDOR}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Admin', pin: pin })
    });
    if (res.ok) {
        usuarioLogueado = 'Admin';
        document.getElementById('contenedor-botones-admin').style.display = 'flex';
        document.getElementById('indicador-rol').innerText = "👨‍✈️ ADMINISTRADOR";
        document.getElementById('pantalla-login-admin').style.display = 'none';
        reproducirSonido('exito');
    } else {
        alert("PIN Incorrecto");
    }
}

// --- 4. GESTIÓN DE PESTAÑAS ADMIN ---

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

// --- 5. MAPA DE MESAS ---

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
    } catch(e) { console.error("Error sync mesas"); }
}

// --- 6. IMPORTACIÓN MASIVA ---

function abrirPegarMasivo() {
    reproducirSonido('click');
    const modal = document.getElementById('modal-pegar-masivo');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('texto-pegado').value = '';
    }
}

async function procesarPegadoMasivo() {
    const texto = document.getElementById('texto-pegado').value;
    const filas = texto.split(/\r?\n/);
    const lista = [];
    for (let f of filas) {
        const cols = f.split('\t');
        if (cols.length >= 3) {
            lista.push({ categoria: cols[0].trim(), nombre: cols[1].trim(), precio: parseFloat(cols[2].replace(/[^0-9.]/g, '')), icono: '🍽️', stock: 999 });
        }
    }
    if (lista.length === 0) return alert("No hay datos");
    
    await fetch(`${URL_SERVIDOR}/importar-masivo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
        body: JSON.stringify({ productosLista: lista })
    });
    alert("Importación exitosa 🥂");
    cerrarModal();
    obtenerProductosDB();
}

// --- 7. LÓGICA DE VENTA ---

function agregarProducto(id) {
    const p = productos.find(x => x.id === id);
    const ex = carrito.find(i => i.id === id && !i.nota);
    if (ex) ex.cantidad++; else carrito.push({ ...p, cantidad: 1, nota: "" });
    actualizarInterfazCarrito();
    reproducirSonido('click');
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
            <div style="flex:1;">
                <strong>${i.nombre}</strong><br><small>${i.cantidad} x ${i.precio}</small>
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

// --- UTILIDADES EXTRAS ---
function volverAlInicio() { document.getElementById('pantalla-login-admin').style.display='none'; document.getElementById('pantalla-inicio-rol').style.display='flex'; }
function cerrarSesionAdmin() { location.reload(); }
function cambiarMesero() { usuarioLogueado = document.getElementById('select-mesero').value; }
function reproducirSonido(t) { const s = document.getElementById(`sonido-${t}`); if (s) { s.currentTime=0; s.play().catch(()=>{}); } }

async function obtenerProductosDB() {
    const res = await fetch(`${URL_SERVIDOR}/productos`);
    productos = await res.json();
    renderizarAdminProductos();
    const cats = ['Todos', ...new Set(productos.map(p => p.categoria || 'General'))];
    document.getElementById('barra-categorias').innerHTML = cats.map(c => `<button class="btn-filtro" onclick="filtrarPorCategoria('${c}')">${c}</button>`).join('');
    filtrarPorCategoria('Todos');
}

function renderizarAdminProductos() {
    const cuerpo = document.getElementById('cuerpo-tabla-admin');
    if(cuerpo) cuerpo.innerHTML = productos.map(p => `<tr><td>${p.icono}</td><td>${p.nombre}</td><td>C$ ${p.precio}</td><td>${p.stock}</td><td><button onclick="borrarProducto(${p.id})" style="color:red; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

async function cargarUsuariosLista() {
    const res = await fetch(`${URL_SERVIDOR}/usuarios`);
    const u = await res.json();
    const ops = u.map(x => `<option value="${x.nombre}">${x.nombre}</option>`).join('');
    document.getElementById('select-mesero').innerHTML = ops;
    document.getElementById('login-usuario').innerHTML = ops;
}

async function cargarTasaCambio() {
    const res = await fetch(`${URL_SERVIDOR}/tasa-cambio`);
    const data = await res.json();
    tasaCambio = parseFloat(data.tasa);
    document.getElementById('header-tasa').innerText = tasaCambio.toFixed(2);
}