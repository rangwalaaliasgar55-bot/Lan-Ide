"""Preflight de binarios externos (`core/preflight.py` + `/api/system/preflight`).

POR QUÉ ESTE TEST EXISTE
========================
El motor depende de binarios del sistema (tmux, git, ffmpeg) y hasta ahora no
los chequeaba en ningún momento: la ausencia se descubría tarde y disfrazada de
500. El contrato que se fija acá es que el chequeo diga las DOS cosas que
importan —qué falta y cómo se arregla— y que nunca se convierta en un arranque
que falla (un preflight que tumba el server es peor que el problema).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from plotspace.core import preflight as pf


def test_estado_reporta_los_criticos():
    nombres = {b['nombre']: b for b in pf.estado_binarios()}
    # tmux ES el motor de terminales y git sostiene review/diff/STATE.md.
    assert nombres['tmux']['critico'] is True
    assert nombres['git']['critico'] is True
    # ffmpeg solo afecta al dictado: su ausencia no puede marcarse como crítica.
    assert nombres['ffmpeg']['critico'] is False


def test_todo_presente_no_imprime_nada(monkeypatch):
    """Sin faltantes, el arranque no gana una sola línea de ruido."""
    monkeypatch.setattr(pf.shutil, 'which', lambda n: f'/usr/bin/{n}')
    assert pf.preflight_binarios() == []
    assert pf.faltantes() == []


def test_faltante_dice_que_falta_y_como_arreglarlo(monkeypatch):
    monkeypatch.setattr(pf.shutil, 'which',
                        lambda n: None if n == 'tmux' else f'/usr/bin/{n}')
    texto = '\n'.join(pf.preflight_binarios())
    assert 'tmux' in texto
    # El remedio concreto, no solo el diagnóstico: es la diferencia entre un
    # usuario trabado y un usuario que resuelve en 10 segundos.
    assert 'install' in texto
    assert [b['nombre'] for b in pf.faltantes()] == ['tmux']


def test_solo_criticos_filtra_los_opcionales(monkeypatch):
    monkeypatch.setattr(pf.shutil, 'which',
                        lambda n: None if n == 'ffmpeg' else f'/usr/bin/{n}')
    assert pf.faltantes(solo_criticos=True) == []
    assert [b['nombre'] for b in pf.faltantes()] == ['ffmpeg']


def test_instalacion_por_plataforma(monkeypatch):
    """El comando sugerido tiene que ser el de la plataforma real: mandar a un
    usuario de macOS a correr `apt install` es no ayudarlo."""
    monkeypatch.setattr(pf.shutil, 'which', lambda n: None)
    monkeypatch.setattr(pf.sys, 'platform', 'darwin')
    arreglo = {b['nombre']: b['arreglo'] for b in pf.estado_binarios()}
    assert 'brew' in arreglo['tmux']
    monkeypatch.setattr(pf.sys, 'platform', 'linux')
    arreglo = {b['nombre']: b['arreglo'] for b in pf.estado_binarios()}
    assert 'apt' in arreglo['tmux']


def test_endpoint_expone_el_estado(monkeypatch):
    from fastapi.testclient import TestClient
    from plotspace.main import app
    monkeypatch.setattr(pf.shutil, 'which',
                        lambda n: None if n == 'tmux' else f'/usr/bin/{n}')
    r = TestClient(app).get('/api/system/preflight')
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo['ok'] is False
    assert cuerpo['faltan_criticos'] == ['tmux']


def test_endpoint_ok_con_todo_instalado(monkeypatch):
    from fastapi.testclient import TestClient
    from plotspace.main import app
    monkeypatch.setattr(pf.shutil, 'which', lambda n: f'/usr/bin/{n}')
    cuerpo = TestClient(app).get('/api/system/preflight').json()
    assert cuerpo['ok'] is True
    assert cuerpo['faltan_criticos'] == []
