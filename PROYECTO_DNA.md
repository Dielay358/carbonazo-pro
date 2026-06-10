# 📑 DNA TÉCNICO: ASADO EL CARBONAZO PRO

## 🌐 Ecosistema de Desarrollo
- **Lenguaje:** Node.js (Servidor) + JS Vanilla (Frontend).
- **Base de Datos:** SQLite3 (Archivo: carbonazo.db).
- **Servidor Local:** Puerto 3000.
- **Túnel de Acceso:** Ngrok (Habilitado para dispositivos móviles).

## 🛠️ Reglas de Oro (No negociables)
1. **URL Dinámica:** Se usa `window.location.origin` en el frontend para evitar errores de conexión entre Localhost y Ngrok.
2. **Seguridad:** Todas las rutas API requieren el Header `Authorization: Bearer carbonazo2024pro`.
3. **Impresión:** Formato estricto de 80mm para térmicas. Prohibido usar márgenes estándar de navegador.
4. **Limpieza:** Uso obligatorio de `sanitize-html` en cada entrada de datos hacia la DB.

## 🧠 Instrucción para la IA (Prompt Maestro)
"Usa este contexto para ayudarme: Estoy en el proyecto Asado El Carbonazo Pro. Arquitectura Node.js + SQLite. Frontend en /public con JS puro. El sistema imprime en 80mm y usa Ngrok. No sugieras librerías obsoletas; mantente en el estándar definido en mi server.js."