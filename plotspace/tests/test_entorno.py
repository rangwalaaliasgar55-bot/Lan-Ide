"""Una variable de entorno mal puesta NO puede voltear el proceso.

POR QUÉ ESTOS TESTS EXISTEN
===========================
El repo estaba lleno de `int(os.environ.get('X', '20'))` a nivel de MÓDULO.
Con `WATCHDOG_INTERVALO_S=fast` el import de `swarm_watchdog` moría, y como
`plotspace.main` lo importa en cadena, el server entero no arrancaba — con un
`ValueError: invalid literal for int()` como toda pista, sin nombrar la
variable culpable.

Y el caso más frecuente ni siquiera es un typo: es la variable VACÍA. Un
`export LAN_IDE_PORT=` o un `docker-compose` con `LAN_IDE_PORT: ${PUERTO}` y
`PUERTO` sin definir dejan `''`, que `int('')` rechaza igual.

La regla que fijan estos tests: **config inválida degrada al default y lo
avisa; nunca levanta.**
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from plotspace.core import entorno


@pytest.fixture(autouse=True)
def _limpiar(monkeypatch):
    for k in ('X_TEST', 'LAN_IDE_PORT'):
        monkeypatch.delenv(k, raising=False)


def _poner(monkeypatch, valor):
    monkeypatch.setenv('X_TEST', valor)


# ─── entero ──────────────────────────────────────────────────────────────────

def test_entero_lee_el_valor(monkeypatch):
    _poner(monkeypatch, '8080')
    assert entorno.entero('X_TEST', 3000) == 8080


def test_entero_sin_variable_usa_el_default():
    assert entorno.entero('X_TEST', 3000) == 3000


@pytest.mark.parametrize('basura', ['', '   ', 'abc', '3000.5', '8o80', 'null'])
def test_entero_con_basura_cae_al_default(monkeypatch, basura):
    """`''` es el caso REAL: `export LAN_IDE_PORT=` o un compose sin la var."""
    _poner(monkeypatch, basura)
    assert entorno.entero('X_TEST', 3000) == 3000


def test_entero_respeta_el_rango(monkeypatch):
    _poner(monkeypatch, '99999')
    assert entorno.entero('X_TEST', 3000, minimo=1, maximo=65535) == 3000
    _poner(monkeypatch, '0')
    assert entorno.entero('X_TEST', 3000, minimo=1, maximo=65535) == 3000
    _poner(monkeypatch, '65535')
    assert entorno.entero('X_TEST', 3000, minimo=1, maximo=65535) == 65535


def test_entero_avisa_cual_variable_esta_mal(monkeypatch, capsys):
    """Sin el nombre en el mensaje, encontrar la variable culpable entre las
    doce del docker-compose es adivinar."""
    _poner(monkeypatch, 'abc')
    entorno.entero('X_TEST', 3000)
    salida = capsys.readouterr().out
    assert 'X_TEST' in salida
    assert '3000' in salida


def test_entero_acepta_negativos_si_no_hay_minimo(monkeypatch):
    _poner(monkeypatch, '-5')
    assert entorno.entero('X_TEST', 1) == -5


# ─── decimal ─────────────────────────────────────────────────────────────────

def test_decimal_lee_el_valor(monkeypatch):
    _poner(monkeypatch, '2.5')
    assert entorno.decimal('X_TEST', 1.0) == 2.5


@pytest.mark.parametrize('basura', ['', 'rapido', '1,5'])
def test_decimal_con_basura_cae_al_default(monkeypatch, basura):
    _poner(monkeypatch, basura)
    assert entorno.decimal('X_TEST', 240.0) == 240.0


def test_decimal_rechaza_nan(monkeypatch):
    """NaN pasa CUALQUIER comparación de rango sin fallar, así que un
    `min=1.0` no lo frena: hay que descartarlo explícito. Un timeout NaN
    deja la espera colgada para siempre."""
    _poner(monkeypatch, 'nan')
    assert entorno.decimal('X_TEST', 240.0, minimo=1.0) == 240.0


def test_decimal_acepta_infinito_solo_sin_techo(monkeypatch):
    _poner(monkeypatch, 'inf')
    assert entorno.decimal('X_TEST', 1.0) == float('inf')
    assert entorno.decimal('X_TEST', 1.0, maximo=600.0) == 1.0


# ─── booleano ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('v', ['1', 'true', 'TRUE', 'yes', 'y', 'on', 'si', 'sí', ' True '])
def test_booleano_verdaderos(monkeypatch, v):
    _poner(monkeypatch, v)
    assert entorno.booleano('X_TEST') is True


@pytest.mark.parametrize('v', ['0', 'false', 'FALSE', 'no', 'n', 'off'])
def test_booleano_falsos(monkeypatch, v):
    """El patrón ingenuo `bool(os.environ.get('X'))` da True con 'false' y con
    '0' — justo lo que el usuario quiso APAGAR."""
    _poner(monkeypatch, v)
    assert entorno.booleano('X_TEST', defecto=True) is False


def test_booleano_desconocido_conserva_el_default(monkeypatch):
    _poner(monkeypatch, 'quizas')
    assert entorno.booleano('X_TEST', defecto=True) is True
    assert entorno.booleano('X_TEST', defecto=False) is False


# ─── texto ───────────────────────────────────────────────────────────────────

def test_texto_restringido_a_opciones(monkeypatch):
    _poner(monkeypatch, 'control')
    assert entorno.texto('X_TEST', 'classic', opciones={'classic', 'control'}) == 'control'
    _poner(monkeypatch, 'turbo')
    assert entorno.texto('X_TEST', 'classic', opciones={'classic', 'control'}) == 'classic'


def test_texto_recorta_espacios(monkeypatch):
    """Un `LAN_IDE_HOST=" 0.0.0.0 "` pegado de un README no debe romper el bind."""
    _poner(monkeypatch, '  0.0.0.0  ')
    assert entorno.texto('X_TEST', '127.0.0.1') == '0.0.0.0'


# ─── El contrato de verdad: los módulos importan igual ───────────────────────

def test_los_modulos_importan_con_el_entorno_roto(monkeypatch):
    """EL test que importa. Antes, cualquiera de estas variables mal escritas
    dejaba el server sin arrancar, porque el `int()` explotaba en el import."""
    import importlib

    for var, valor in (('LAN_IDE_PORT', 'abc'),
                       ('WATCHDOG_INTERVALO_S', 'fast'),
                       ('WATCHDOG_UMBRAL_S', ''),
                       ('ORQ_CLI_TIMEOUT', 'slow'),
                       ('MEMORIA_LECCIONES_UMBRAL', 'muchas'),
                       ('LAN_IDE_MAX_BODY_MB', 'big')):
        monkeypatch.setenv(var, valor)

    for modulo in ('plotspace.core.dev_detect', 'plotspace.core.swarm_watchdog',
                   'plotspace.core.orq_cli', 'plotspace.core.memoria_lecciones'):
        importlib.reload(importlib.import_module(modulo))

    from plotspace.core import dev_detect, orq_cli, swarm_watchdog
    assert dev_detect.PUERTO_LAN_IDE == 3000
    assert swarm_watchdog.INTERVALO_S == 20
    assert swarm_watchdog.UMBRAL_S == 180
    assert orq_cli.TIMEOUT_S == 240.0


def test_cli_arranca_con_puerto_invalido(monkeypatch):
    """`lanide` moría con un traceback ANTES de poder imprimir el --help."""
    monkeypatch.setenv('LAN_IDE_PORT', 'abc')
    from plotspace.cli import construir_parser
    assert construir_parser().parse_args([]).puerto == 3000
