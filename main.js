const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Asado El Carbonazo PRO",
        icon: path.join(__dirname, 'public/logo-carbonazo.png'), // Tu logo
        webPreferences: {
            nodeIntegration: true
        }
    });

    // IMPORTANTE: Aquí le decimos que abra tu sitio web oficial
    win.loadURL('https://carbonazo-pro.onrender.com/');

    // Quitar el menú superior de "File, Edit, etc" para que parezca un programa real
    win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});