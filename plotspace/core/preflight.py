"""Chequeo de dependencias EXTERNAS del motor (binarios del sistema).

POR QUÉ EXISTE
==============
Lan Ide no es autosuficiente: delega en binarios del sistema. `tmux` ES el
motor de terminales — sin él no hay una sola terminal — y `git` sostiene el
review, el diff por agente y el STATE.md.

Hasta ahora nadie chequeaba que estuvieran. La falta se manifestaba tarde y
disfrazada: un `FileNotFoundError: 'tmux'` escapándose de un `subprocess.run`
hasta FastAPI, que lo devolvía como `500 Internal Server Error` sin una sola
pista de qué faltaba, y un traceback por segundo en cada poller de background.
El usuario veía "la app está rota", no "falta instalar tmux".

Este módulo responde una sola pregunta —¿qué falta y cómo se arregla?— y la
responde en dos lugares: en el arranque (log) y en `/api/system/preflight`
(para que la UI lo muestre). No instala nada ni cambia comportamiento: informa.
"""
import shutil
import sys

# Cada entrada: (binario, para_qué_sirve, crítico, {plataforma: cómo_instalarlo}).
# `crítico` = sin esto una función CENTRAL del producto no existe. Lo no-crítico
# degrada una función puntual y se reporta como aviso, no como error.
_REQUISITOS = (
    (
        'tmux',
        'motor de terminales (sesiones persistentes de los agentes)',
        True,
        {
            'linux':  'sudo apt install tmux   # o: dnf/pacman install tmux',
            'darwin': 'brew install tmux',
            'win32':  'el motor corre dentro de WSL2 — instalalo ahí '
                      '(ver docs/install/windows.md)',
        },
    ),
    (
        'git',
        'review por agente, diffs, branch del proyecto y STATE.md',
        True,
        {
            'linux':  'sudo apt install git',
            'darwin': 'brew install git   # o: xcode-select --install',
            'win32':  'https://git-scm.com/download/win',
        },
    ),
    (
        'ffmpeg',
        'dictado por voz (decodifica el audio del micrófono)',
        False,
        {
            'linux':  'sudo apt install ffmpeg',
            'darwin': 'brew install ffmpeg',
            'win32':  'https://ffmpeg.org/download.html',
        },
    ),
)


def _plataforma() -> str:
    """Clave de plataforma para elegir el comando de instalación."""
    p = sys.platform
    if p.startswith('linux'):
        return 'linux'
    if p == 'darwin':
        return 'darwin'
    if p.startswith('win'):
        return 'win32'
    return 'linux'


def estado_binarios() -> list:
    """Estado de cada dependencia externa, sin efectos secundarios.

    Devuelve una lista de dicts —`{nombre, presente, critico, para, arreglo,
    ruta}`— apta para serializar en la API y para formatear en el log.
    """
    plat = _plataforma()
    salida = []
    for nombre, para, critico, arreglos in _REQUISITOS:
        ruta = shutil.which(nombre)
        salida.append({
            'nombre':   nombre,
            'presente': ruta is not None,
            'ruta':     ruta,
            'critico':  critico,
            'para':     para,
            'arreglo':  arreglos.get(plat, arreglos['linux']),
        })
    return salida


def faltantes(solo_criticos: bool = False) -> list:
    """Los binarios que NO están. `solo_criticos` filtra los opcionales."""
    return [b for b in estado_binarios()
            if not b['presente'] and (b['critico'] or not solo_criticos)]


def preflight_binarios() -> list:
    """Líneas listas para imprimir en el arranque. Vacío = todo en orden.

    Devolver líneas en vez de imprimir hace la función testeable y deja que el
    llamador decida el destino (stdout hoy, un panel de la UI mañana).
    """
    ausentes = faltantes()
    if not ausentes:
        return []
    lineas = []
    for b in ausentes:
        marca = '⚠️  FALTA' if b['critico'] else '·  opcional, no está:'
        lineas.append(f"[preflight] {marca} {b['nombre']} — {b['para']}")
        lineas.append(f"[preflight]    instalalo con: {b['arreglo']}")
    if any(b['critico'] for b in ausentes):
        lineas.append('[preflight]    (sin los críticos, esas funciones '
                      'contestan 503 en vez de fallar en silencio)')
    return lineas
