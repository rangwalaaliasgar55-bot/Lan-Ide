"""Qué pasa cuando el binario del MOTOR (tmux) no está en la máquina.

POR QUÉ ESTOS TESTS EXISTEN
===========================
Lan Ide delega en `tmux` para todo lo que es una terminal. En una máquina sin
tmux —Docker mínimo, macOS sin brew, el primer arranque antes de correr el
install— cada `subprocess.run(['tmux', ...])` suelto levantaba
`FileNotFoundError`. Eso producía tres síntomas, ninguno diagnosticable:

  1. `GET /api/terminals/{id}/snapshot` → **500 Internal Server Error** pelado.
  2. `POST .../terminals` → **201 Created** con una fila activa en la DB y una
     card en la UI atada a una sesión que nunca existió (terminal fantasma),
     que el reconcile del reboot se empeñaba en resucitar.
  3. Los pollers de background (agent_watch 1s, agent_live/dev_detect 2s)
     escupiendo un traceback por segundo por terminal.

La regla que fijan estos tests: **sin motor se degrada o se contesta 503 con el
remedio, nunca 500 ni un 201 mentiroso.**
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from plotspace.core import terminal_backend as tb
from plotspace.core.terminal_backend import EspecSesion, MotorNoDisponible, TmuxBackend

pytestmark = pytest.mark.usefixtures('motor_tmux')


def _sin_binario(monkeypatch):
    """Simula 'tmux no está instalado' como lo hace el SO: el exec falla."""
    def _boom(*a, **k):
        raise FileNotFoundError(2, 'No such file or directory', 'tmux')
    monkeypatch.setattr(tb.subprocess, 'run', _boom)
    monkeypatch.setattr(tb.shutil, 'which', lambda *a, **k: None)


# ─── El runner central traduce el fallo a None, no lo propaga ────────────────

def test_correr_tmux_devuelve_none_sin_binario(monkeypatch):
    _sin_binario(monkeypatch)
    assert tb._correr_tmux(['tmux', 'has-session']) is None


def test_correr_tmux_devuelve_none_en_timeout(monkeypatch):
    import subprocess as sp

    def _timeout(*a, **k):
        raise sp.TimeoutExpired(cmd='tmux', timeout=5)
    monkeypatch.setattr(tb.subprocess, 'run', _timeout)
    assert tb._correr_tmux(['tmux', 'has-session']) is None


def test_correr_tmux_no_traga_otros_errores(monkeypatch):
    """Un bug de programación (argv mal armado) NO se disfraza de 'no hay tmux'."""
    def _valueerror(*a, **k):
        raise ValueError('argv inválido')
    monkeypatch.setattr(tb.subprocess, 'run', _valueerror)
    with pytest.raises(ValueError):
        tb._correr_tmux(['tmux', 'has-session'])


# ─── Cada lectura degrada a su "no sé" en vez de reventar ────────────────────

def test_lecturas_degradan_sin_binario(monkeypatch):
    _sin_binario(monkeypatch)
    m = TmuxBackend()
    assert m.existe(1) is False          # 'no existe' es la respuesta segura
    assert m.capturar(1) is None
    assert m.listar_sesiones() == set()
    assert m.titulos_vivos() == {}
    assert m.estado_pane(1, '#{pane_pid}') is None
    # comandos_vivos: None significa "NO SE PUDO LEER" y es distinto de {} —
    # un dict vacío marcaría muerto a todo el enjambre (ver su docstring).
    assert m.comandos_vivos() is None


def test_escrituras_no_revientan_sin_binario(monkeypatch):
    """send-keys / kill / estilos: no hay nada que hacer, pero no tiran error."""
    _sin_binario(monkeypatch)
    m = TmuxBackend()
    m.enviar_texto(1, 'hola')
    m.enviar_tecla(1, 'Enter')
    m.matar_sesion_por_nombre('lanide_1')
    m.sanear_sesion('lanide_1')


def test_capturar_async_devuelve_vacio_sin_binario(monkeypatch):
    """El camino de los POLLERS. Antes: FileNotFoundError por tick por terminal."""
    import asyncio

    async def _boom(*a, **k):
        raise FileNotFoundError(2, 'No such file or directory', 'tmux')
    monkeypatch.setattr(asyncio, 'create_subprocess_exec', _boom)
    assert asyncio.run(TmuxBackend().capturar_async(1)) == ''


# ─── Crear: el ÚNICO que grita (y tiene que gritar) ──────────────────────────

def test_crear_levanta_motor_no_disponible(monkeypatch):
    """Crear sin motor NO puede devolver False en silencio: el router necesita
    distinguirlo para revertir la fila y contestar 503 en vez de 201."""
    _sin_binario(monkeypatch)
    with pytest.raises(MotorNoDisponible) as exc:
        TmuxBackend().crear(EspecSesion(terminal_id=1, cwd='/tmp'))
    # El mensaje lleva el remedio, no solo el síntoma.
    assert 'tmux' in str(exc.value)
    assert 'install' in str(exc.value)


def test_crear_devuelve_false_si_tmux_esta_pero_falla(monkeypatch):
    """Con binario presente y un error real de tmux, sigue siendo False (no
    una excepción): es un fallo operativo, no una dependencia que falta."""
    import subprocess as sp

    llamadas = []

    def _fake(argv, **kw):
        llamadas.append(list(argv))
        if 'has-session' in argv:
            return sp.CompletedProcess(argv, 1, '', '')
        return sp.CompletedProcess(argv, 1, '', 'no server running')
    monkeypatch.setattr(tb.subprocess, 'run', _fake)
    monkeypatch.setattr(tb.shutil, 'which', lambda *a, **k: '/usr/bin/tmux')
    assert TmuxBackend().crear(EspecSesion(terminal_id=1, cwd='/tmp')) is False


# ─── Contrato HTTP: 503 accionable y CERO filas fantasma ─────────────────────

def _cliente(monkeypatch):
    from fastapi.testclient import TestClient
    from plotspace.main import app
    _sin_binario(monkeypatch)
    return TestClient(app)


def _proyecto(tmp_path) -> int:
    from plotspace.core.database import get_db
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO projects (nombre, ruta, fecha_creacion, ultimo_acceso) '
            "VALUES ('p', ?, '2026-01-01', '2026-01-01')", (str(tmp_path),))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _terminales_en_db(pid: int) -> int:
    from plotspace.core.database import get_db
    conn = get_db()
    try:
        return conn.execute(
            'SELECT COUNT(*) c FROM terminals WHERE project_id = ?', (pid,)
        ).fetchone()['c']
    finally:
        conn.close()


def test_crear_terminal_contesta_503_y_no_deja_fantasma(monkeypatch, tmp_path):
    """El bug original: 201 + fila activa + card rota. Ahora 503 + DB limpia."""
    cli = _cliente(monkeypatch)
    pid = _proyecto(tmp_path)
    r = cli.post(f'/api/projects/{pid}/terminals', json={'nombre': 't1', 'tipo_ia': 'manual'})
    assert r.status_code == 503
    assert 'tmux' in r.json()['detail']
    assert _terminales_en_db(pid) == 0, 'quedó una terminal fantasma en la DB'


def test_batch_no_deja_el_lote_a_medias(monkeypatch, tmp_path):
    """Un lote sin motor revierte TODAS: un grid entero de cards fantasma era
    el caso peor."""
    cli = _cliente(monkeypatch)
    pid = _proyecto(tmp_path)
    r = cli.post(f'/api/projects/{pid}/terminals/batch',
                 json={'terminales': [{'nombre': f't{i}', 'tipo_ia': 'manual'}
                                      for i in range(3)]})
    assert r.status_code == 503
    assert _terminales_en_db(pid) == 0


def test_snapshot_contesta_404_no_500(monkeypatch, tmp_path):
    """Era 500 Internal Server Error. Sin sesión, la respuesta correcta es 404."""
    cli = _cliente(monkeypatch)
    _proyecto(tmp_path)
    r = cli.get('/api/terminals/1/snapshot')
    assert r.status_code == 404


def test_endpoints_de_lectura_no_tiran_500(monkeypatch, tmp_path):
    """Barrido: sin tmux, ninguna ruta GET de terminales puede contestar 5xx."""
    cli = _cliente(monkeypatch)
    pid = _proyecto(tmp_path)
    for url in (f'/api/projects/{pid}/terminals',
                f'/api/projects/{pid}/terminal-titles',
                '/api/terminals/1/status',
                '/api/terminals/1/snapshot'):
        assert cli.get(url).status_code < 500, f'{url} contestó 5xx sin tmux'
