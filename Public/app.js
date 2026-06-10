/**
 * PROYECTO: ASADO EL CARBONAZO PRO
 * FILE: app.js (Frontend Logic)
 */

// 1. CONFIGURACIÓN E INTERFAZ
const URL_SERVIDOR = window.location.origin; // Regla de Oro #1
const TOKEN_ACCESO = "carbonazo2024pro";     // Regla de Oro #2

// ELEMENTOS DEL DOM
const contenedorMenu = document.getElementById('contenedor-menu');
const listaCarrito = document.getElementById('items-carrito');
const totalMontoLabel = document.getElementById('total-monto');

// 2. ESTADO GLOBAL
let carrito = [];
let productos = []; // Se llena desde la Base de Datos
let meseroActivo = "Admin";

// 3. INICIALIZACIÓN
window.onload = () => {
    console.log("🚀 Sistema El Carbonazo Pro Iniciado");
    obtenerProductosDB();
    actualizarInterfazCarrito();
};

// 4. COMUNICACIÓN CON EL SERVIDOR (PRODUCTOS)
async function obtenerProductosDB() {
    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/productos`);
        productos = await respuesta.json();
        cargarMenu();
    } catch (error) {
        console.error("❌ Error cargando productos:", error);
        contenedorMenu.innerHTML = `<p style="color:red">Error de conexión con el servidor.</p>`;
    }
}

// 5. RENDERIZADO DEL MENÚ
function cargarMenu() {
    contenedorMenu.innerHTML = '';
    
    if (productos.length === 0) {
        contenedorMenu.innerHTML = '<p>No hay productos disponibles.</p>';
        return;
    }

    productos.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'tarjeta-producto';
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom:10px;">${prod.icono}</div>
            <h3 style="margin:5px 0;">${prod.nombre}</h3>
            <p style="color: var(--primario); font-weight:bold;">C$ ${prod.precio.toFixed(2)}</p>
        `;
        card.onclick = () => agregarProducto(prod.id);
        contenedorMenu.appendChild(card);
    });
}

// 6. LÓGICA DEL CARRITO (AGREGAR/ELIMINAR)
function agregarProducto(id) {
    reproducirSonido('click');
    const productoEncontrado = productos.find(p => p.id === id);
    const existe = carrito.find(item => item.id === id);

    if (existe) {
        existe.cantidad++;
    } else {
        carrito.push({ ...productoEncontrado, cantidad: 1 });
    }
    actualizarInterfazCarrito();
}

function eliminarUno(id) {
    const index = carrito.findIndex(item => item.id === id);
    if (index !== -1) {
        if (carrito[index].cantidad > 1) {
            carrito[index].cantidad--;
        } else {
            carrito.splice(index, 1);
        }
    }
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    listaCarrito.innerHTML = '';
    let totalAcumulado = 0;

    if (carrito.length === 0) {
        listaCarrito.innerHTML = '<p class="carrito-vacio">El carrito está vacío</p>';
        totalMontoLabel.innerText = `C$ 0.00`;
        return;
    }

    carrito.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        totalAcumulado += subtotal;

        const div = document.createElement('div');
        div.className = 'item-carrito-lista';
        div.innerHTML = `
            <div class="info-item">
                <strong>${item.nombre}</strong><br>
                <small>${item.cantidad} x C$ ${item.precio.toFixed(2)}</small>
            </div>
            <div class="controles-item">
                <span class="subtotal-item">C$ ${subtotal.toFixed(2)}</span>
                <button onclick="eliminarUno(${item.id})" class="btn-eliminar">
                    <i class="fas fa-minus-circle"></i>
                </button>
            </div>
        `;
        listaCarrito.appendChild(div);
    });

    totalMontoLabel.innerText = `C$ ${totalAcumulado.toFixed(2)}`;
}

// 7. FINALIZAR VENTA (ENVÍO A DB Y TICKET)
async function finalizarVenta() {
    if (carrito.length === 0) {
        alert("Agregue productos al carrito.");
        return;
    }

    const total = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const mesaCliente = document.getElementById('id-mesa').value || "Barra";
    const tipoPedido = document.getElementById('tipo-pedido').value;

    // DENTRO DE finalizarVenta(), cambia el objeto datosVenta:
const datosVenta = {
    total: total,
    mesero: meseroActivo, // <--- CAMBIA "Admin" por la variable
    tipo_pedido: tipoPedido,
    mesa: mesaCliente,
    cliente: mesaCliente,
    metodo_pago: "Efectivo"
};

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/nueva-venta`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN_ACCESO}`
            },
            body: JSON.stringify(datosVenta)
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            reproducirSonido('exito');
            generarTicket(resultado.idVenta, datosVenta); // Impresión 80mm
            
            carrito = [];
            document.getElementById('id-mesa').value = '';
            actualizarInterfazCarrito();
        } else {
            alert("Error al procesar la venta.");
        }
    } catch (error) {
        alert("Error de conexión con el servidor.");
    }
}

// Vincular botón principal
document.getElementById('btn-cobrar').onclick = finalizarVenta;

// 8. HISTORIAL DE VENTAS (MODAL)
function abrirModalVentas() {
    reproducirSonido('click');
    document.getElementById('modal-ventas').style.display = 'block';
    cargarHistorialVentas();
}

function cerrarModal() {
    document.getElementById('modal-ventas').style.display = 'none';
}

// Busca esta función en app.js y reemplaza el bloque de la fila:
async function cargarHistorialVentas() {
    const tabla = document.getElementById('cuerpo-tabla-ventas');
    tabla.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/lista-ventas`, {
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` }
        });
        const ventas = await respuesta.json();

        tabla.innerHTML = '';
        ventas.forEach(v => {
            const fila = document.createElement('tr');
            // Formateamos la fecha para que sea legible
            fila.innerHTML = `
                <td>#${v.id}</td>
                <td style="font-size: 0.85rem;">${v.fecha}</td> 
                <td>${v.mesa}</td>
                <td>${v.mesero}</td>
                <td style="font-weight:bold">C$ ${v.total.toFixed(2)}</td>
                <td>
                    <button onclick="confirmarBorrarVenta(${v.id})" style="color: #e63946; border: none; background: none; cursor: pointer;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tabla.appendChild(fila);
        });
    } catch (error) {
        tabla.innerHTML = '<tr><td colspan="6">Error al cargar datos.</td></tr>';
    }
}

// Nueva función para borrar venta
async function confirmarBorrarVenta(id) {
    if (!confirm(`¿Estás seguro de eliminar la venta #${id}? Esta acción no se puede deshacer.`)) return;

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/borrar-venta/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` }
        });

        if (respuesta.ok) {
            reproducirSonido('click');
            cargarHistorialVentas(); // Recargar tabla
            if (typeof generarReporteCierre === "function") generarReporteCierre(); // Actualizar cierre si está abierto
        }
    } catch (e) { alert("Error al eliminar"); }
}

// 9. IMPRESIÓN TICKET TÉRMICO (REGLA TÉCNICA 80mm)
function generarTicket(idVenta, datosVenta) {
    const area = document.getElementById('area-impresion');
    const ahora = new Date();
    const fechaFormat = ahora.toLocaleDateString();
    const horaFormat = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let filasProductos = '';
    carrito.forEach(item => {
        filasProductos += `
            <div class="ticket-fila">
                <span>${item.cantidad} x ${item.nombre.substring(0, 18)}</span>
                <span>C$ ${(item.precio * item.cantidad).toFixed(2)}</span>
            </div>`;
    });

    area.innerHTML = `
        <div class="ticket-header">
            <h3>ASADO EL CARBONAZO</h3>
            <p>Ticket: #00${idVenta}</p>
            <p>${fechaFormat} - ${horaFormat}</p>
        </div>
        <div class="ticket-divisor"></div>
        <div class="ticket-fila"><strong>Mesa:</strong> <span>${datosVenta.mesa}</span></div>
        <div class="ticket-divisor"></div>
        ${filasProductos}
        <div class="ticket-divisor"></div>
        <div class="ticket-total">TOTAL: C$ ${datosVenta.total.toFixed(2)}</div>
        <div class="ticket-header" style="margin-top: 5mm;">
            <p>*** Gracias por su compra ***</p>
            <p>Atendido por: ${datosVenta.mesero}</p> <!-- CAMBIO AQUÍ -->
        </div>
    `;

    // Retraso para renderizado antes de disparar ventana de impresión
    setTimeout(() => { window.print(); }, 300);
}

// 10. UTILIDADES
function reproducirSonido(tipo) {
    const sonido = document.getElementById(`sonido-${tipo}`);
    if (sonido) {
        sonido.currentTime = 0;
        sonido.play().catch(() => {}); // Evita error de política de autoplays
    }
}

// --- LÓGICA DE ADMINISTRACIÓN DE PRODUCTOS ---

function abrirAdminProductos() {
    reproducirSonido('click');
    document.getElementById('modal-admin-productos').style.display = 'block';
    renderizarAdminProductos();
}

function cerrarModalAdmin() {
    document.getElementById('modal-admin-productos').style.display = 'none';
}

function renderizarAdminProductos() {
    const tabla = document.getElementById('cuerpo-tabla-admin');
    tabla.innerHTML = '';
    productos.forEach(p => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${p.icono}</td>
            <td>${p.nombre}</td>
            <td>C$ ${p.precio}</td>
            <td>
                <button onclick="prepararEdicion(${p.id})" style="color: blue; border: none; background: none; cursor: pointer;"><i class="fas fa-edit"></i></button>
                <button onclick="borrarProducto(${p.id})" style="color: red; border: none; background: none; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tabla.appendChild(fila);
    });
}

function prepararEdicion(id) {
    const p = productos.find(prod => prod.id === id);
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-nombre').value = p.nombre;
    document.getElementById('edit-precio').value = p.precio;
    document.getElementById('edit-icono').value = p.icono;
    document.getElementById('edit-categoria').value = p.categoria;
    document.getElementById('modal-editar-producto').style.display = 'block';
}

async function enviarActualizacion() {
    const id = document.getElementById('edit-id').value;
    const datos = {
        nombre: document.getElementById('edit-nombre').value,
        precio: parseFloat(document.getElementById('edit-precio').value),
        icono: document.getElementById('edit-icono').value,
        categoria: document.getElementById('edit-categoria').value
    };

    try {
        await fetch(`${URL_SERVIDOR}/actualizar-producto/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_ACCESO}` },
            body: JSON.stringify(datos)
        });
        cerrarModalEditor();
        await obtenerProductosDB(); // Recargar todo
        generarFiltrosCategorias(); // Actualizar botones
    } catch (e) { alert("Error al actualizar"); }
}

function cerrarModalEditor() { document.getElementById('modal-editar-producto').style.display = 'none'; }

async function guardarNuevoProducto() {
    const nombre = document.getElementById('nuevo-nombre').value;
    const precio = document.getElementById('nuevo-precio').value;
    const icono = document.getElementById('nuevo-icono').value;

    if (!nombre || !precio) return alert("Nombre y Precio son obligatorios");

    const nuevoProd = { nombre, precio: parseFloat(precio), icono: icono || '🍴' };

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/agregar-producto`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN_ACCESO}`
            },
            body: JSON.stringify(nuevoProd)
        });

        if (respuesta.ok) {
            reproducirSonido('exito');
            document.getElementById('nuevo-nombre').value = '';
            document.getElementById('nuevo-precio').value = '';
            document.getElementById('nuevo-icono').value = '';
            await obtenerProductosDB(); // Recargar de la DB
            renderizarAdminProductos(); // Actualizar tabla admin
        }
    } catch (e) { alert("Error al guardar"); }
}

async function borrarProducto(id) {
    if (!confirm("¿Seguro que quieres eliminar este producto?")) return;

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/borrar-producto/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` }
        });

        if (respuesta.ok) {
            await obtenerProductosDB();
            renderizarAdminProductos();
        }
    } catch (e) { alert("Error al borrar"); }
}

// --- SISTEMA DE MESEROS ---

async function cargarMeseros() {
    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/usuarios`);
        const meseros = await respuesta.json();
        const selector = document.getElementById('select-mesero');
        
        selector.innerHTML = meseros.map(m => 
            `<option value="${m.nombre}">${m.nombre}</option>`
        ).join('');
        
        meseroActivo = selector.value;
    } catch (e) { console.error("Error cargando meseros"); }
}

function cambiarMesero() {
    meseroActivo = document.getElementById('select-mesero').value;
    reproducirSonido('click');
    console.log("Mesero actual:", meseroActivo);
}

// ACTUALIZA TU WINDOW.ONLOAD PARA INCLUIR CARGAR MESEROS
window.onload = () => {
    console.log("🚀 Sistema El Carbonazo Pro Iniciado");
    obtenerProductosDB();
    cargarMeseros(); // <--- NUEVO
    actualizarInterfazCarrito();
};

// --- LÓGICA DE CIERRE DE CAJA ---

function abrirCierreCaja() {
    reproducirSonido('click');
    document.getElementById('modal-cierre').style.display = 'block';
    generarReporteCierre();
}

function cerrarModalCierre() {
    document.getElementById('modal-cierre').style.display = 'none';
}

async function generarReporteCierre() {
    const contenedor = document.getElementById('cuerpo-cierre');
    contenedor.innerHTML = "<p>Generando reporte...</p>";

    try {
        const respuesta = await fetch(`${URL_SERVIDOR}/reporte-cierre`, {
            headers: { 'Authorization': `Bearer ${TOKEN_ACCESO}` }
        });
        const datos = await respuesta.json();

        if (datos.length === 0) {
            contenedor.innerHTML = "<h3>No hay ventas registradas hoy.</h3>";
            return;
        }

        let granTotal = 0;
        let htmlVentas = '';

        datos.forEach(fila => {
            granTotal += fila.totalVendido;
            htmlVentas += `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                    <span><strong>${fila.mesero}</strong> (${fila.cantidadVentas} ventas)</span>
                    <span>C$ ${fila.totalVendido.toFixed(2)}</span>
                </div>
            `;
        });

        // Actualizar el área de impresión para que el reporte también se pueda imprimir en 80mm
        document.getElementById('area-impresion').innerHTML = `
            <div class="ticket-header">
                <h3>REPORTE DE CIERRE</h3>
                <p>Fecha: ${new Date().toLocaleDateString()}</p>
            </div>
            <div class="ticket-divisor"></div>
            ${htmlVentas}
            <div class="ticket-divisor"></div>
            <div class="ticket-total">TOTAL DÍA: C$ ${granTotal.toFixed(2)}</div>
        `;

        contenedor.innerHTML = `
            <h1 style="text-align: center; color: var(--exito); font-size: 2.5rem;">C$ ${granTotal.toFixed(2)}</h1>
            <p style="text-align: center; color: #666; margin-bottom: 20px;">Total recaudado hoy</p>
            <div class="desglose-meseros">
                <h4>Ventas por Mesero:</h4>
                ${htmlVentas}
            </div>
        `;

    } catch (e) {
        contenedor.innerHTML = "<p>Error al conectar con el servidor.</p>";
    }
}

function generarFiltrosCategorias() {
    const barra = document.getElementById('barra-categorias');
    // Obtener categorías únicas de los productos
    const categorias = ['Todos', ...new Set(productos.map(p => p.categoria))];
    
    barra.innerHTML = categorias.map(cat => `
        <button class="btn-filtro" onclick="filtrarPorCategoria('${cat}')">${cat}</button>
    `).join('');
}

function filtrarPorCategoria(cat) {
    if (cat === 'Todos') {
        cargarMenu(productos);
    } else {
        const filtrados = productos.filter(p => p.categoria === cat);
        cargarMenu(filtrados);
    }
}

// Modifica tu cargarMenu para que acepte una lista
function cargarMenu(lista = productos) {
    contenedorMenu.innerHTML = '';
    lista.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'tarjeta-producto';
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom:10px;">${prod.icono}</div>
            <h3 style="margin:5px 0;">${prod.nombre}</h3>
            <p style="color: var(--primario); font-weight:bold;">C$ ${prod.precio.toFixed(2)}</p>
            <small style="color: #999;">${prod.categoria}</small>
        `;
        card.onclick = () => agregarProducto(prod.id);
        contenedorMenu.appendChild(card);
    });
}