/**
 * Ciclo de vida del MOTOR (el proceso Python), sin una sola línea de Electron.
 *
 * POR QUÉ ESTÁ SEPARADO
 * =====================
 * Levantar el motor, esperar a que conteste y —sobre todo— BAJARLO bien es la
 * parte del shell que más duele cuando falla: un uvicorn huérfano se queda con
 * el puerto 3000 y la próxima apertura muere con EADDRINUSE. Dentro de
 * `main.js` eso sólo se puede probar arrancando Electron entero.
 *
 * Acá vive esa lógica como un módulo Node común, así se testea DE VERDAD
 * (levantando el motor real, matándolo y verificando que el puerto quedó
 * libre) en cualquier entorno, incluido CI sin display.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const cfg = require('./engine-config');

/** Cuánto guardamos de la salida del motor para diagnosticar (bytes). */
const MAX_LOG = 8000;

/** Resuelve el primer intérprete que exista; los sueltos los valida el spawn. */
function resolverPython(raiz, existe = fs.existsSync, plataforma = process.platform) {
  for (const cand of cfg.candidatosPython(raiz, plataforma)) {
    if (cand.includes(path.sep)) {
      if (existe(cand)) return cand;
    } else {
      return cand;
    }
  }
  return plataforma === 'win32' ? 'python' : 'python3';
}

/** ¿Contesta algo en /api/health? Usado para no pelearle el puerto a un motor ajeno. */
function sondear(url, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/health`, { timeout }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

class Motor {
  /**
   * @param {object} opts
   * @param {string} opts.raiz     carpeta que contiene `plotspace/`
   * @param {number} opts.puerto
   * @param {string} [opts.python] override del intérprete (tests)
   */
  constructor({ raiz, puerto = cfg.PUERTO_DEFAULT, python = null } = {}) {
    this.raiz = raiz;
    this.puerto = puerto;
    this.url = cfg.urlMotor(puerto);
    this.python = python || resolverPython(raiz);
    this.proc = null;
    this.salida = '';
    this.propio = false;       // ¿lo arrancamos nosotros? (si no, no se mata)
    this.cerrando = false;
  }

  /** Arranca el motor. Si ya hay uno vivo en el puerto, se engancha a ese. */
  async arrancar() {
    if (await sondear(this.url)) {
      // El usuario ya lo levantó a mano (`lanide`). Engancharse en vez de
      // pelear el puerto — y NO matarlo al cerrar: no es nuestro.
      this.propio = false;
      return { adoptado: true };
    }
    const args = cfg.argsMotor({ puerto: this.puerto });
    this.proc = spawn(this.python, args, {
      cwd: this.raiz,
      env: cfg.envMotor(process.env, { puerto: this.puerto, raiz: this.raiz }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.propio = true;

    const recordar = (buf) => {
      this.salida = (this.salida + buf.toString()).slice(-MAX_LOG);
    };
    this.proc.stdout.on('data', recordar);
    this.proc.stderr.on('data', recordar);
    this.proc.on('error', (e) => { this.salida += `\n${e.message}`; });
    return { adoptado: false };
  }

  /**
   * Espera a que el motor conteste. Corta antes si el proceso murió: esperar
   * 90s a un cadáver es la diferencia entre "falló y te digo por qué" y una
   * pantalla de carga eterna.
   */
  async esperarListo(limiteMs = 90_000, intervalo = 300) {
    const hasta = Date.now() + limiteMs;
    for (;;) {
      if (this.cerrando) return false;
      if (await sondear(this.url, 2000)) return true;
      if (this.proc && this.proc.exitCode !== null) return false;
      if (Date.now() > hasta) return false;
      await new Promise((r) => setTimeout(r, intervalo));
    }
  }

  /** ¿Está vivo el proceso que arrancamos? */
  get vivo() {
    return !!(this.proc && this.proc.exitCode === null && !this.proc.killed);
  }

  /**
   * Baja el motor: SIGTERM (uvicorn cierra WS y libera el puerto) y SIGKILL si
   * no se fue en `graciaMs`. No toca un motor adoptado.
   */
  async detener(graciaMs = 5000) {
    this.cerrando = true;
    if (!this.proc || !this.propio) return false;
    const proc = this.proc;
    this.proc = null;
    if (proc.exitCode !== null) return false;

    const muerto = new Promise((resolve) => proc.once('exit', () => resolve(true)));
    try { proc.kill('SIGTERM'); } catch { return false; }

    const aTiempo = await Promise.race([
      muerto,
      new Promise((r) => setTimeout(() => r(false), graciaMs)),
    ]);
    if (!aTiempo) {
      // No se fue por las buenas: sin esto queda un uvicorn huérfano con el
      // puerto tomado y el próximo arranque muere con EADDRINUSE.
      try { proc.kill('SIGKILL'); } catch { /* ya no está */ }
      await muerto;
    }
    return true;
  }

  /** Diagnóstico listo para mostrar cuando el arranque falló. */
  diagnostico() {
    const codigo = this.proc ? this.proc.exitCode : null;
    return cfg.diagnosticarFalla(this.salida, codigo);
  }
}

module.exports = { Motor, resolverPython, sondear };
