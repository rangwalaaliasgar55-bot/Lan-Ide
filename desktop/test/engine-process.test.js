/**
 * Ciclo de vida del motor, contra el motor DE VERDAD.
 *
 * POR QUÉ NO SE MOCKEA EL PROCESO
 * ===============================
 * El bug que estos tests tienen que atrapar es "quedó un uvicorn huérfano con
 * el puerto tomado": un mock del spawn no lo ve nunca, porque el problema es
 * justamente lo que hace el proceso real cuando le llega la señal. Así que acá
 * se levanta el motor Python posta, se lo mata y se verifica que el puerto
 * quedó LIBRE.
 *
 * Si no hay un venv con las dependencias, los tests se saltean (no fallan):
 * la suite tiene que poder correr en un checkout limpio.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const net = require('net');
const path = require('path');

const { Motor, resolverPython, sondear } = require('../src/engine-process');

const RAIZ = path.resolve(__dirname, '..', '..');
const PYTHON = path.join(RAIZ, 'venv', 'bin', 'python3');
// Sin venv no hay dependencias: saltear en vez de romper la suite.
const HAY_MOTOR = fs.existsSync(PYTHON)
  && fs.existsSync(path.join(RAIZ, 'plotspace', 'main.py'));

/** Un puerto libre de verdad, para no chocar con el 3000 del dev. */
function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** ¿Hay algo escuchando? Es la prueba de que el puerto quedó libre (o no). */
function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port: puerto, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 1500);
  });
}

// ─── Elección de intérprete (sin tocar disco) ────────────────────────────────

test('resolverPython prefiere el venv cuando existe', () => {
  const venv = path.join('/app', 'venv', 'bin', 'python3');
  assert.strictEqual(resolverPython('/app', (p) => p === venv, 'linux'), venv);
});

test('resolverPython cae al PATH cuando no hay venv', () => {
  assert.strictEqual(resolverPython('/app', () => false, 'linux'), 'python3');
});

// ─── Sonda ───────────────────────────────────────────────────────────────────

test('sondear devuelve false si no hay nadie escuchando', async () => {
  const p = await puertoLibre();
  assert.strictEqual(await sondear(`http://127.0.0.1:${p}`, 800), false);
});

// ─── Contra el motor real ────────────────────────────────────────────────────

test('arranca el motor, contesta y se baja dejando el puerto libre',
  { skip: !HAY_MOTOR ? 'sin venv del motor' : false, timeout: 120_000 },
  async () => {
    const puerto = await puertoLibre();
    const m = new Motor({ raiz: RAIZ, puerto, python: PYTHON });

    const { adoptado } = await m.arrancar();
    assert.strictEqual(adoptado, false, 'el puerto estaba libre: debe arrancar uno propio');

    assert.ok(await m.esperarListo(90_000), `el motor no respondió:\n${m.salida.slice(-800)}`);
    assert.ok(m.vivo);
    assert.ok(await sondear(m.url), '/api/health tiene que contestar 200');

    assert.ok(await m.detener());
    assert.ok(!m.vivo, 'el proceso tiene que estar muerto');

    // LO IMPORTANTE: sin esto queda un uvicorn huérfano y el próximo arranque
    // muere con EADDRINUSE.
    assert.strictEqual(await puertoOcupado(puerto), false,
      'el puerto quedó tomado tras cerrar');
  });

test('un motor ya vivo se ADOPTA, y cerrar la app no lo mata',
  { skip: !HAY_MOTOR ? 'sin venv del motor' : false, timeout: 120_000 },
  async () => {
    const puerto = await puertoLibre();
    // El "motor del usuario", levantado a mano con `lanide`.
    const suyo = new Motor({ raiz: RAIZ, puerto, python: PYTHON });
    await suyo.arrancar();
    assert.ok(await suyo.esperarListo(90_000), 'el motor de referencia no arrancó');

    try {
      const app = new Motor({ raiz: RAIZ, puerto, python: PYTHON });
      const { adoptado } = await app.arrancar();
      assert.strictEqual(adoptado, true, 'debe engancharse en vez de pelear el puerto');

      await app.detener();
      // Matar un motor que no es nuestro le cerraría las terminales al usuario.
      assert.ok(await sondear(suyo.url), 'la app mató un motor que no era suyo');
    } finally {
      await suyo.detener();
    }
  });

test('un motor que no arranca se diagnostica en vez de colgarse',
  { timeout: 60_000 },
  async () => {
    const puerto = await puertoLibre();
    // Un intérprete que existe pero no tiene las dependencias.
    const m = new Motor({ raiz: '/tmp', puerto, python: 'python3' });
    await m.arrancar();

    // esperarListo tiene que CORTAR al morir el proceso, no agotar el límite.
    const t0 = Date.now();
    assert.strictEqual(await m.esperarListo(30_000), false);
    assert.ok(Date.now() - t0 < 25_000, 'no cortó al morir el proceso');

    const d = m.diagnostico();
    assert.match(d.titulo, /dependencias|motor/i);
    assert.ok(d.remedio);
  });
