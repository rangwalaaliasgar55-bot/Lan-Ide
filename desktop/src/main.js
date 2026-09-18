/**
 * Lan Ide — shell de escritorio (Electron).
 *
 * QUÉ HACE Y QUÉ NO
 * =================
 * Esto NO es una reescritura de la app: el producto sigue siendo el motor
 * Python + el frontend vanilla que ya existen. El shell aporta lo que un
 * browser no puede dar:
 *
 *   · Ciclo de vida: levanta el motor al abrir y lo BAJA al cerrar (nada de
 *     uvicorns huérfanos comiendo el puerto 3000 hasta el próximo reboot).
 *   · Una pantalla de arranque honesta: "levantando el motor…" y, si falla,
 *     el motivo con el remedio — en vez del ERR_CONNECTION_REFUSED del browser.
 *   · Menú y atajos nativos, y un guard que manda los links externos al
 *     browser del sistema.
 *
 * Este archivo se queda SOLO con lo que necesita Electron (ventana, menú,
 * eventos de app). Las decisiones puras viven en `engine-config.js` y el ciclo
 * de vida del proceso en `engine-process.js` — ambos testeados sin Electron,
 * que es lo que permite que CI verifique de verdad que el motor levanta y que
 * al cerrar el puerto queda libre.
 */
'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const cfg = require('./engine-config');
const { Motor } = require('./engine-process');

const PUERTO = parseInt(process.env.LAN_IDE_PORT || '', 10) || cfg.PUERTO_DEFAULT;
const URL_APP = cfg.urlMotor(PUERTO);
// El arranque en frío hace DB, reconcile de sesiones y arranca los pollers;
// 90s es holgado y evita el falso "no arrancó" en una máquina lenta.
const ARRANQUE_TIMEOUT_MS = 90_000;

/** @type {Motor | null} */
let motor = null;
/** @type {BrowserWindow | null} */
let ventana = null;
let cerrando = false;

/**
 * Raíz del árbol que contiene `plotspace/`. En desarrollo es el repo (un nivel
 * arriba de desktop/); empaquetado, es resources/engine (ver extraResources).
 */
function raizMotor() {
  const empaquetado = path.join(process.resourcesPath || '', 'engine');
  if (fs.existsSync(path.join(empaquetado, 'plotspace', 'main.py'))) return empaquetado;
  return path.resolve(__dirname, '..', '..');
}

// ─── Ventana ─────────────────────────────────────────────────────────────────

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0b10',      // el fondo del design system: sin flash blanco
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      // El frontend es local y no necesita nada de Node: sin nodeIntegration y
      // con aislamiento de contexto, una inyección en la página no alcanza al
      // sistema de archivos.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  ventana.once('ready-to-show', () => ventana.show());
  ventana.on('closed', () => { ventana = null; });

  // Links externos → browser del sistema. Una ventana de Electron sin barra de
  // direcciones navegando a un sitio ajeno es phishing con la cara de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (cfg.esUrlInterna(url, PUERTO)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!cfg.esUrlInterna(url, PUERTO)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  return ventana;
}

function pantallaCarga() {
  const html = `<!doctype html><meta charset="utf-8">
<title>Lan Ide</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; height:100vh; display:grid; place-items:center;
         background:#0b0b10; color:#e6e6f0;
         font:14px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter,sans-serif; }
  .caja { text-align:center; }
  .marca { font-size:26px; letter-spacing:.14em; text-transform:uppercase;
           color:#a78bfa; margin-bottom:26px; }
  .barra { width:220px; height:2px; background:#2a2a36; border-radius:2px;
           overflow:hidden; margin:0 auto 18px; }
  .barra i { display:block; width:40%; height:100%; background:#a78bfa;
             animation:desliza 1.1s ease-in-out infinite; }
  @keyframes desliza { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }
  p { color:#75768a; margin:0; }
</style>
<div class="caja">
  <div class="marca">Lan Ide</div>
  <div class="barra"><i></i></div>
  <p>Levantando el motor…</p>
</div>`;
  ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function mostrarFalla({ titulo, detalle, remedio }, log) {
  if (!ventana || ventana.isDestroyed()) return;
  const cuerpo = (log || '').slice(-2500) || '(el motor no imprimió nada)';
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!doctype html><meta charset="utf-8">
<title>Lan Ide — ${esc(titulo)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; box-sizing:border-box; padding:48px 40px;
         background:#0b0b10; color:#e6e6f0;
         font:14px/1.65 ui-sans-serif,system-ui,-apple-system,Segoe UI,Inter,sans-serif; }
  h1 { font-size:19px; margin:0 0 6px; color:#f87171; font-weight:600; }
  p  { margin:0 0 14px; color:#b9bacb; max-width:70ch; }
  .remedio { border-left:2px solid #a78bfa; padding:10px 16px; margin:0 0 22px;
             background:#15151d; color:#e6e6f0; max-width:70ch; }
  pre { background:#15151d; border:1px solid #2a2a36; border-radius:8px;
        padding:14px; overflow:auto; max-height:44vh; color:#9b9cb0;
        font:12px/1.55 ui-monospace,JetBrains Mono,Menlo,monospace;
        white-space:pre-wrap; }
</style>
<h1>${esc(titulo)}</h1>
<p>${esc(detalle)}</p>
<div class="remedio">${esc(remedio)}</div>
<pre>${esc(cuerpo)}</pre>`;
  ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function construirMenu() {
  const esMac = process.platform === 'darwin';
  const plantilla = [
    ...(esMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Abrir en el navegador',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => shell.openExternal(URL_APP),
        },
        { type: 'separator' },
        esMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentación',
          click: () => shell.openExternal(
            'https://github.com/rangwalaaliasgar55-bot/Lan-Ide#readme'),
        },
        {
          label: 'Reportar un problema',
          click: () => shell.openExternal(
            'https://github.com/rangwalaaliasgar55-bot/Lan-Ide/issues/new/choose'),
        },
        { type: 'separator' },
        {
          label: 'Acerca de Lan Ide',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: 'Lan Ide',
            message: `Lan Ide ${app.getVersion()}`,
            detail: 'Tu flota de agentes de código, en una app.\n'
              + 'Fundador: Aliasgar Rangwala\n\n'
              + `Motor: ${URL_APP}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ─── Arranque ────────────────────────────────────────────────────────────────

// Una sola instancia: dos shells peleando por el puerto terminan en un
// EADDRINUSE y una ventana en blanco. La segunda le da el foco a la primera.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    }
  });

  app.whenReady().then(async () => {
    construirMenu();
    crearVentana();
    pantallaCarga();

    motor = new Motor({ raiz: raizMotor(), puerto: PUERTO });
    const { adoptado } = await motor.arrancar();
    console.log(adoptado
      ? `[desktop] motor ya vivo en ${URL_APP} — me engancho`
      : `[desktop] motor propio: ${motor.python}`);

    // Caída del motor con la app abierta: mostrarlo, no dejar una ventana
    // congelada que parece viva.
    if (motor.proc) {
      motor.proc.on('exit', (codigo) => {
        if (cerrando || !ventana || ventana.isDestroyed()) return;
        mostrarFalla(cfg.diagnosticarFalla(motor.salida, codigo), motor.salida);
      });
    }

    const listo = await motor.esperarListo(ARRANQUE_TIMEOUT_MS);
    if (!ventana || ventana.isDestroyed()) return;
    if (listo) ventana.loadURL(URL_APP);
    else mostrarFalla(motor.diagnostico(), motor.salida);
  });

  app.on('window-all-closed', () => {
    // En macOS lo normal es que la app siga viva sin ventanas; en el resto,
    // cerrar la ventana es cerrar la app (y bajar el motor con ella).
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      crearVentana();
      ventana.loadURL(URL_APP);
    }
  });

  // El motor se baja SIEMPRE, por cualquiera de las vías de salida. `detener()`
  // no toca un motor adoptado: cerrarle las terminales a un usuario que lo
  // levantó a mano sería peor que dejarlo corriendo.
  const bajar = () => { cerrando = true; if (motor) motor.detener(); };
  app.on('before-quit', bajar);
  process.on('exit', bajar);
  process.on('SIGINT', () => { bajar(); app.quit(); });
  process.on('SIGTERM', () => { bajar(); app.quit(); });
}
