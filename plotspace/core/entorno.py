"""Lectura tolerante de variables de entorno.

POR QUÉ EXISTE
==============
El repo tenía una docena de `int(os.environ.get('X', '20'))` sueltos, varios a
NIVEL DE MÓDULO. Eso convierte un typo en una variable de entorno en un crash
de import: con `WATCHDOG_INTERVALO_S=fast` el módulo no importa, y como
`plotspace.main` lo importa en cadena, el server entero no arranca — con un
`ValueError: invalid literal for int()` como única pista, sin decir QUÉ variable
ni qué se esperaba.

Y el caso más común ni siquiera es un typo: es la variable VACÍA. Un
`export LAN_IDE_PORT=` o un docker-compose con `LAN_IDE_PORT: ${PUERTO}` sin
`PUERTO` definido dejan `''`, que `int()` rechaza igual.

La regla acá: **una variable mal puesta degrada al default y lo dice; nunca
voltea el proceso.** Config inválida no es motivo para no arrancar.
"""
import os

__all__ = ['entero', 'decimal', 'booleano', 'texto']


def _avisar(nombre: str, crudo: str, defecto, motivo: str) -> None:
    # print y no logging: varios de estos se evalúan a nivel de módulo, antes
    # de que se configure el logging. En stdout siempre se ve.
    print(f'[entorno] {nombre}={crudo!r} {motivo} — uso {defecto!r}')


def entero(nombre: str, defecto: int, minimo=None, maximo=None) -> int:
    """Entero desde el entorno, con rango opcional. Nunca levanta."""
    crudo = (os.environ.get(nombre) or '').strip()
    if not crudo:
        return defecto
    try:
        valor = int(crudo)
    except ValueError:
        _avisar(nombre, crudo, defecto, 'no es un número entero')
        return defecto
    if minimo is not None and valor < minimo:
        _avisar(nombre, crudo, defecto, f'es menor que el mínimo ({minimo})')
        return defecto
    if maximo is not None and valor > maximo:
        _avisar(nombre, crudo, defecto, f'supera el máximo ({maximo})')
        return defecto
    return valor


def decimal(nombre: str, defecto: float, minimo=None, maximo=None) -> float:
    """Float desde el entorno (intervalos, timeouts). Nunca levanta."""
    crudo = (os.environ.get(nombre) or '').strip()
    if not crudo:
        return defecto
    try:
        valor = float(crudo)
    except ValueError:
        _avisar(nombre, crudo, defecto, 'no es un número')
        return defecto
    # NaN != NaN: se cuela por cualquier comparación de rango, así que se
    # descarta explícito. `float('nan')` es una entrada perfectamente válida.
    if valor != valor:
        _avisar(nombre, crudo, defecto, 'es NaN')
        return defecto
    if minimo is not None and valor < minimo:
        _avisar(nombre, crudo, defecto, f'es menor que el mínimo ({minimo})')
        return defecto
    if maximo is not None and valor > maximo:
        _avisar(nombre, crudo, defecto, f'supera el máximo ({maximo})')
        return defecto
    return valor


# Un flag se prende con lo que la gente REALMENTE escribe. 'on' y 'si'/'sí'
# incluidos: el repo es en español y alguien va a escribir SI.
_VERDADEROS = {'1', 'true', 'yes', 'y', 'on', 'si', 'sí'}
_FALSOS = {'0', 'false', 'no', 'n', 'off'}


def booleano(nombre: str, defecto: bool = False) -> bool:
    """Flag desde el entorno. Ojo: `X=0` y `X=false` son FALSE.

    El patrón ingenuo `bool(os.environ.get('X'))` da True con 'false' y con
    '0', que es justo lo que el usuario quiso apagar.
    """
    crudo = (os.environ.get(nombre) or '').strip().lower()
    if not crudo:
        return defecto
    if crudo in _VERDADEROS:
        return True
    if crudo in _FALSOS:
        return False
    _avisar(nombre, crudo, defecto, 'no es un booleano reconocible')
    return defecto


def texto(nombre: str, defecto: str = '', opciones=None) -> str:
    """String desde el entorno, opcionalmente restringido a un set válido."""
    crudo = (os.environ.get(nombre) or '').strip()
    if not crudo:
        return defecto
    if opciones and crudo not in opciones:
        _avisar(nombre, crudo, defecto, f'no está entre {sorted(opciones)}')
        return defecto
    return crudo
