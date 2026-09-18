'use strict';
/**
 * `esc()` tiene que escapar las COMILLAS, no solo & < >.
 *
 * EL BUG
 * ======
 * Había seis copias de `esc()` repartidas por el frontend y casi todas eran
 * `d.textContent = s; return d.innerHTML`, que escapa & < > pero NO " ni '.
 *
 * Y `esc()` se usa muchísimo DENTRO de atributos:
 *
 *     `title="${esc(p.nombre)}"`   `data-slug="${esc(m.slug)}"`
 *
 * Un valor con una comilla doble cierra el atributo e inyecta HTML. Y esos
 * valores no son constantes del código: son nombres de proyecto, títulos de
 * memoria, ramas de git, rutas de archivo y salida de agentes — texto que el
 * usuario o un CLI controlan. `README.md` de un repo clonado alcanza.
 *
 * Este test lee las implementaciones REALES del disco (no una copia) para que
 * no se puedan arreglar acá y quedar rotas allá.
 */
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');

/**
 * Saca la función `esc` de un archivo fuente y la evalúa aislada.
 *
 * Se lee del disco a propósito: una copia del helper pegada en el test pasa
 * siempre, aunque el código real esté roto.
 */
/**
 * `document` mínimo que reproduce el truco `textContent → innerHTML`.
 *
 * Es lo que hacían las implementaciones viejas. Sin este shim, esa versión
 * revienta en Node con "document is not defined" y el test pasa a rojo por el
 * motivo equivocado — parecería un problema del test y no el bug de comillas
 * que acá se quiere fijar. Con el shim, la versión vieja CORRE y falla en la
 * aserción exacta: deja pasar la comilla.
 */
global.document = {
  createElement() {
    let texto = '';
    return {
      set textContent(v) { texto = String(v); },
      get textContent() { return texto; },
      // El navegador serializa & < > y deja las comillas INTACTAS: ese era el
      // agujero exacto al interpolar dentro de un atributo.
      get innerHTML() {
        return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
    };
  },
};

function escDe(rel, nombre = 'esc') {
  const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');

  // `const esc = (s) => …;` — la expresión puede ocupar varias líneas, así que
  // se corta contando paréntesis/llaves hasta el `;` de cierre real.
  const mArrow = new RegExp(`(?:const|let|var)\\s+${nombre}\\s*=\\s*\\(\\s*s\\s*\\)\\s*=>`)
    .exec(src);
  if (mArrow) {
    let prof = 0;
    for (let k = mArrow.index + mArrow[0].length; k < src.length; k++) {
      const c = src[k];
      if ('([{'.includes(c)) prof++;
      else if (')]}'.includes(c)) prof--;
      else if (c === ';' && prof === 0) {
        return new Function('s', `return (${src.slice(mArrow.index + mArrow[0].length, k)});`);
      }
    }
  }

  // `function esc(s) { … }` — llaves balanceadas.
  const i = src.search(new RegExp(`function\\s+${nombre}\\s*\\(`));
  if (i === -1) throw new Error(`no encontré ${nombre}() en ${rel}`);
  let prof = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}' && --prof === 0) { fin = k + 1; break; }
  }
  return new Function(`${src.slice(i, fin)}; return ${nombre};`)();
}

// Todas las copias de esc() que interpolan en HTML.
const FUENTES = [
  'shell/workspace.js',
  'sections/home/home.js',
  'sections/memory/memory.js',
  'sections/review/review.js',
  'sections/settings/settings.js',
  'sections/tasks/tasks.js',
  'sections/editor-slide/editor-slide.js',
  'sections/terminals/swarm-overlay.js',
  'shared/md-mini.js',
];

// Payloads REALES: lo que hace falta para escapar de un atributo.
const ATAQUES = [
  'x" onerror="alert(1)',
  "x' onerror='alert(1)",
  '"><script>alert(1)</script>',
  "'><img src=x onerror=alert(1)>",
  '</textarea><script>alert(1)</script>',
];

let total = 0;
for (const rel of FUENTES) {
  const esc = escDe(rel);

  // Lo básico no se puede haber perdido.
  assert.strictEqual(esc('<b>'), '&lt;b&gt;', `${rel}: no escapa <>`);
  assert.strictEqual(esc('a & b'), 'a &amp; b', `${rel}: no escapa &`);

  // Lo que faltaba.
  assert.ok(!esc('"').includes('"'), `${rel}: deja pasar la comilla doble`);
  assert.ok(!esc("'").includes("'"), `${rel}: deja pasar la comilla simple`);

  for (const mal of ATAQUES) {
    const salida = esc(mal);
    assert.ok(!salida.includes('"'), `${rel}: comilla doble cruda con ${mal}`);
    assert.ok(!salida.includes("'"), `${rel}: comilla simple cruda con ${mal}`);
    assert.ok(!salida.includes('<'), `${rel}: < crudo con ${mal}`);

    // La prueba de verdad: interpolado en un atributo, el atributo NO se corta.
    // Sin el fix, `title="x" onerror="alert(1)"` son DOS atributos.
    const html = `<div title="${salida}" data-x='${salida}'>`;
    assert.strictEqual((html.match(/"/g) || []).length, 2,
      `${rel}: el valor rompió el atributo con comillas dobles → ${html}`);
    assert.strictEqual((html.match(/'/g) || []).length, 2,
      `${rel}: el valor rompió el atributo con comillas simples → ${html}`);
  }

  // El & se escapa PRIMERO: si no, `&lt;` sale como `&amp;lt;`… o peor, un
  // `&amp;` del input termina desescapándose al renderizar.
  assert.strictEqual(esc('&lt;'), '&amp;lt;', `${rel}: doble escape mal ordenado`);

  // Null/undefined no pueden romper el render de una card entera.
  assert.doesNotThrow(() => esc(null), `${rel}: revienta con null`);
  assert.doesNotThrow(() => esc(undefined), `${rel}: revienta con undefined`);

  total++;
}

// escAttr en editor.js quedó como alias de esc: no puede volver a escapar
// encima (daría `&amp;quot;` y el atributo mostraría la entidad cruda).
{
  const src = fs.readFileSync(path.join(RAIZ, 'sections/editor/editor.js'), 'utf8');
  assert.ok(/const\s+escAttr\s*=\s*esc\s*;/.test(src),
    'escAttr debe ser alias de esc, no un segundo reemplazo (doble escape)');
}

console.log(`ok — ${total} implementaciones de esc() escapan comillas`);
