// Tests de la lógica pura de LanIdeNotify (notify.js): título flash + gating.
'use strict';
const assert = require('assert');
require('../notify.js');
const { tituloFlash, debeAvisar, debeOsNotif } = globalThis.LanIdeNotify._pure;

// ── tituloFlash ──
assert.strictEqual(tituloFlash('LanIde', 0, true), 'LanIde', 'sin pendientes: título base');
assert.strictEqual(tituloFlash('LanIde', 2, false), 'LanIde', 'fase no-alterna: título base');
assert.strictEqual(tituloFlash('LanIde', 2, true), '🔔 (2) LanIde', 'pendientes + alterno: con badge');
assert.strictEqual(tituloFlash('LanIde', -1, true), 'LanIde', 'n negativo: base');

// ── debeAvisar: solo si oculta y sonido no silenciado ──
assert.strictEqual(debeAvisar({ hidden: true, sonidoOn: true }), true);
assert.strictEqual(debeAvisar({ hidden: true, sonidoOn: undefined }), true, 'default no silenciado');
assert.strictEqual(debeAvisar({ hidden: false, sonidoOn: true }), false, 'pestaña visible: no');
assert.strictEqual(debeAvisar({ hidden: true, sonidoOn: false }), false, 'silenciado: no');

// ── debeOsNotif: permiso concedido + opt-in ──
assert.strictEqual(debeOsNotif({ permiso: 'granted', osOptIn: true }), true);
assert.strictEqual(debeOsNotif({ permiso: 'granted', osOptIn: false }), false, 'sin opt-in: no');
assert.strictEqual(debeOsNotif({ permiso: 'default', osOptIn: true }), false, 'sin permiso: no');
assert.strictEqual(debeOsNotif({ permiso: 'denied', osOptIn: true }), false);

console.log('notify: OK');
