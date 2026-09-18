/**
 * Decisiones PURAS del arranque del motor: qué Python usar, con qué argumentos,
 * en qué carpeta, y cómo se ve la URL resultante.
 *
 * POR QUÉ ESTÁ SEPARADO DE main.js
 * ================================
 * `main.js` solo corre dentro de Electron: para testearlo haría falta levantar
 * un browser entero. Todo lo que es DECISIÓN (y por lo tanto lo que se puede
 * romper en un refactor) vive acá, en funciones sin efectos secundarios, y se
 * testea con `node --test` — el mismo patrón `_pure` que ya usa el frontend.
 *
 * Nada de este archivo toca el disco ni spawnea procesos.
 */
'use strict';

const path = require('path');

/** Puerto por defecto del motor. Espejo de plotspace/cli.py. */
const PUERTO_DEFAULT = 3000;

/**
 * Candidatos de intérprete Python, EN ORDEN de preferencia.
 *
 * El venv va primero a propósito: si el usuario corrió install.sh, ahí están
 * las dependencias. Caer al python del sistema cuando existe un venv es la
 * receta para un "ModuleNotFoundError: fastapi" que nadie sabe explicar.
 *
 * @param {string} raiz  Carpeta que contiene `plotspace/`.
 * @param {string} plataforma  process.platform.
 * @returns {string[]} rutas/comandos a probar en orden.
 */
function candidatosPython(raiz, plataforma = process.platform) {
  const win = plataforma === 'win32';
  const binDir = win ? 'Scripts' : 'bin';
  const exe = win ? 'python.exe' : 'python3';
  return [
    path.join(raiz, 'venv', binDir, exe),
    path.join(raiz, '.venv', binDir, exe),
    win ? 'python' : 'python3',
    win ? 'py' : 'python',
  ];
}

/**
 * Argumentos del motor. `-m uvicorn ... --loop asyncio` y NO `-m plotspace`:
 * el flag del loop es obligatorio (uvloop traba el event loop ~0.4-1s de forma
 * periódica y corta el eco del tipeo de TODAS las terminales a la vez), y
 * pasarlo explícito lo deja a la vista de quien lea esto en un stack trace.
 */
function argsMotor({ puerto = PUERTO_DEFAULT, host = '127.0.0.1' } = {}) {
  return [
    '-m', 'uvicorn', 'plotspace.main:app',
    '--host', String(host),
    '--port', String(puerto),
    '--loop', 'asyncio',
  ];
}

/**
 * Entorno del proceso motor.
 *
 * PYTHONUNBUFFERED=1 es importante acá y no es cosmético: sin él, los prints
 * del arranque (incluido el preflight que dice "falta tmux") quedan atrapados
 * en el buffer y la ventana de error de la app se queda sin el motivo real.
 */
function envMotor(base, { puerto = PUERTO_DEFAULT, raiz } = {}) {
  const env = Object.assign({}, base, {
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    LAN_IDE_PORT: String(puerto),
    // Le dice al motor que su ventana es la app: el frontend puede ajustar el
    // chrome (no ofrecer "abrir en el browser", por ejemplo).
    LAN_IDE_DESKTOP: '1',
  });
  if (raiz) {
    // Sin esto, `-m uvicorn` no encuentra el paquete `plotspace` cuando el cwd
    // no es la raíz (pasa en el build empaquetado, donde el motor vive en
    // resources/engine).
    env.PYTHONPATH = raiz + (base.PYTHONPATH ? path.delimiter + base.PYTHONPATH : '');
  }
  return env;
}

/** URL local del motor. `0.0.0.0` es un bind, no una dirección navegable. */
function urlMotor(puerto = PUERTO_DEFAULT, host = '127.0.0.1') {
  const destino = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
  return `http://${destino}:${puerto}`;
}

/**
 * ¿Esta URL pertenece a la app?
 *
 * Es el guard de navegación de la ventana: cualquier link externo (docs de
 * GitHub, el dashboard de Spotify, lo que un agente imprima en una terminal)
 * tiene que abrirse en el BROWSER del sistema, nunca adentro del shell — una
 * ventana de Electron sin barra de direcciones navegando a un sitio ajeno es
 * una trampa de phishing perfecta.
 */
function esUrlInterna(url, puerto = PUERTO_DEFAULT) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const locales = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!locales.has(u.hostname)) return false;
  return u.port === String(puerto);
}

/**
 * Traduce la salida de un motor que no arrancó a algo accionable.
 * El usuario no tiene que leer un traceback para saber qué hacer.
 */
function diagnosticarFalla(salida = '', codigo = null) {
  const txt = String(salida);
  if (/No module named ['"]?uvicorn|No module named ['"]?fastapi/i.test(txt)) {
    return {
      titulo: 'Faltan las dependencias del motor',
      detalle: 'El intérprete de Python que encontré no tiene instaladas las '
        + 'dependencias de Lan Ide.',
      remedio: 'Corré ./install.sh en la carpeta del proyecto (o '
        + 'pip install -r packaging/requirements-base.txt).',
    };
  }
  if (/address already in use|EADDRINUSE/i.test(txt)) {
    return {
      titulo: 'El puerto ya está ocupado',
      detalle: 'Otro proceso está usando el puerto del motor — probablemente '
        + 'otra instancia de Lan Ide ya corriendo.',
      remedio: 'Cerrá la otra instancia, o arrancá con otro puerto '
        + '(LAN_IDE_PORT=3100).',
    };
  }
  if (/No such file or directory|ENOENT|not found/i.test(txt) && /python/i.test(txt)) {
    return {
      titulo: 'No encontré Python',
      detalle: 'Lan Ide necesita Python 3.11 o superior para correr el motor.',
      remedio: 'Instalá Python 3.11+ y volvé a abrir la app.',
    };
  }
  return {
    titulo: 'El motor no arrancó',
    detalle: codigo === null
      ? 'El proceso del motor terminó inesperadamente.'
      : `El proceso del motor terminó con código ${codigo}.`,
    remedio: 'Mirá el detalle de abajo; si no queda claro, abrí un issue con ese texto.',
  };
}

module.exports = {
  PUERTO_DEFAULT,
  candidatosPython,
  argsMotor,
  envMotor,
  urlMotor,
  esUrlInterna,
  diagnosticarFalla,
};
