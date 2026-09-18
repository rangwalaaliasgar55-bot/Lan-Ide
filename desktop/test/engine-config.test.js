/**
 * Suite del shell de escritorio — la parte que SE PUEDE romper en silencio.
 *
 * Todo lo de acá es decisión pura (qué Python, qué args, qué URL es interna,
 * cómo se traduce una falla). Es exactamente lo que un refactor rompe sin que
 * nadie se entere hasta que un usuario abre la app y ve una ventana en blanco.
 *
 *   node --test desktop/test/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const cfg = require('../src/engine-config');

// ─── Elección de intérprete ──────────────────────────────────────────────────

test('el venv del proyecto va ANTES que el python del sistema', () => {
  const c = cfg.candidatosPython('/app', 'linux');
  assert.strictEqual(c[0], path.join('/app', 'venv', 'bin', 'python3'));
  // Si el del sistema ganara, un usuario con venv instalado se comería un
  // "ModuleNotFoundError: fastapi" imposible de relacionar con la causa.
  assert.ok(c.indexOf(path.join('/app', 'venv', 'bin', 'python3'))
            < c.indexOf('python3'));
});

test('en Windows busca Scripts/python.exe, no bin/python3', () => {
  const c = cfg.candidatosPython('C:\\app', 'win32');
  assert.ok(c[0].includes('Scripts'));
  assert.ok(c[0].endsWith('python.exe'));
  assert.ok(c.includes('py'));      // el launcher oficial, cuando no hay PATH
});

test('siempre queda un fallback del sistema', () => {
  const c = cfg.candidatosPython('/app', 'linux');
  assert.ok(c.includes('python3'));
  assert.ok(c.length >= 3);
});

// ─── Argumentos del motor ────────────────────────────────────────────────────

test('el motor arranca SIEMPRE con --loop asyncio', () => {
  const a = cfg.argsMotor({ puerto: 3000 });
  const i = a.indexOf('--loop');
  assert.notStrictEqual(i, -1, 'sin --loop uvicorn elige uvloop');
  // uvloop traba el event loop ~0.4-1s de forma periódica bajo el workload
  // subprocess/PTY → corta el eco del tipeo de TODAS las terminales a la vez.
  assert.strictEqual(a[i + 1], 'asyncio');
});

test('el puerto pedido llega al argv', () => {
  assert.ok(cfg.argsMotor({ puerto: 3100 }).includes('3100'));
});

test('el host por defecto es loopback, no 0.0.0.0', () => {
  const a = cfg.argsMotor({});
  // La app ejecuta comandos arbitrarios: el default NO puede exponerla a la LAN.
  assert.strictEqual(a[a.indexOf('--host') + 1], '127.0.0.1');
});

// ─── Entorno ─────────────────────────────────────────────────────────────────

test('PYTHONUNBUFFERED va prendido', () => {
  // Sin esto los prints del arranque (incluido "falta tmux") quedan en el
  // buffer y la pantalla de error aparece sin el motivo real.
  assert.strictEqual(cfg.envMotor({}, {}).PYTHONUNBUFFERED, '1');
});

test('PYTHONPATH apunta a la raíz del motor y respeta el que ya había', () => {
  const env = cfg.envMotor({ PYTHONPATH: '/otro' }, { raiz: '/app' });
  assert.ok(env.PYTHONPATH.startsWith('/app'));
  assert.ok(env.PYTHONPATH.includes('/otro'));
});

test('el entorno no pierde las variables del sistema', () => {
  const env = cfg.envMotor({ HOME: '/home/u', PATH: '/usr/bin' }, {});
  assert.strictEqual(env.HOME, '/home/u');
  assert.strictEqual(env.PATH, '/usr/bin');
});

test('marca LAN_IDE_DESKTOP para que el frontend sepa dónde corre', () => {
  assert.strictEqual(cfg.envMotor({}, {}).LAN_IDE_DESKTOP, '1');
});

// ─── URL ─────────────────────────────────────────────────────────────────────

test('0.0.0.0 se navega como 127.0.0.1', () => {
  // 0.0.0.0 es un bind, no una dirección navegable.
  assert.strictEqual(cfg.urlMotor(3000, '0.0.0.0'), 'http://127.0.0.1:3000');
});

// ─── Guard de navegación (seguridad) ─────────────────────────────────────────

test('la app es interna; cualquier sitio externo NO lo es', () => {
  assert.ok(cfg.esUrlInterna('http://127.0.0.1:3000/workspace?id=1', 3000));
  assert.ok(cfg.esUrlInterna('http://localhost:3000/editor', 3000));
  // Una ventana sin barra de direcciones navegando a un sitio ajeno es una
  // trampa de phishing con la cara de la app: va al browser del sistema.
  assert.ok(!cfg.esUrlInterna('https://evil.example.com/', 3000));
  assert.ok(!cfg.esUrlInterna('https://github.com/login', 3000));
});

test('otro puerto de la misma máquina tampoco es interno', () => {
  // El dev server del usuario (5173, 8081) se abre afuera: adentro se comería
  // los atajos del workspace y confundiría qué es Lan Ide y qué es su app.
  assert.ok(!cfg.esUrlInterna('http://127.0.0.1:5173/', 3000));
});

test('esquemas peligrosos quedan afuera', () => {
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)',
                   'data:text/html,<script>alert(1)</script>']) {
    assert.ok(!cfg.esUrlInterna(u, 3000), `${u} no puede ser interna`);
  }
});

test('una URL basura no rompe el guard', () => {
  assert.strictEqual(cfg.esUrlInterna('no-es-una-url', 3000), false);
  assert.strictEqual(cfg.esUrlInterna('', 3000), false);
  assert.strictEqual(cfg.esUrlInterna(undefined, 3000), false);
});

// ─── Diagnóstico de fallas ───────────────────────────────────────────────────

test('deps faltantes: lo manda a install.sh, no a un traceback', () => {
  const d = cfg.diagnosticarFalla("ModuleNotFoundError: No module named 'uvicorn'", 1);
  assert.match(d.titulo, /dependencias/i);
  assert.match(d.remedio, /install\.sh|pip install/);
});

test('puerto ocupado se reconoce como tal', () => {
  const d = cfg.diagnosticarFalla('OSError: [Errno 98] Address already in use', 1);
  assert.match(d.titulo, /puerto/i);
  assert.match(d.remedio, /LAN_IDE_PORT|instancia/i);
});

test('falta Python: se dice cuál, con versión', () => {
  const d = cfg.diagnosticarFalla('spawn python3 ENOENT', null);
  assert.match(d.titulo, /Python/i);
  assert.match(d.detalle, /3\.11/);
});

test('una falla desconocida igual devuelve algo accionable', () => {
  const d = cfg.diagnosticarFalla('vaya uno a saber', 3);
  assert.ok(d.titulo && d.detalle && d.remedio);
  assert.match(d.detalle, /3/);       // el código de salida, que es la pista
});
