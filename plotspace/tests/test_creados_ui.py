"""El registro de "creado desde el editor" no puede depender de CÓMO se
escribió el path.

EL BUG
======
Dentro del árbol protegido (el caso real: el propio repo de Lan Ide registrado
como proyecto, que es lo normal cuando usás Lan Ide para trabajar en Lan Ide)
solo se puede borrar lo que se creó desde el editor. Ese permiso vivía en un
`set` cuya clave era el string CRUDO del request.

Pero `/nota.txt`, `nota.txt` y `./nota.txt` son el MISMO archivo para
`_safe_join` y tres claves distintas para el set. Entonces: creabas un archivo
desde el editor, le dabas borrar, y te comía un 403 "solo se pueden borrar
archivos creados desde el editor" — sobre un archivo que acababas de crear ahí
mismo, y sin ninguna forma de sacarlo desde la UI.

La regla: la clave se NORMALIZA, así que el permiso sobrevive a cualquier
forma de escribir el mismo path.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from plotspace.routers import projects_files as pf


@pytest.fixture(autouse=True)
def _registro_limpio():
    pf._CREADOS_UI.clear()
    yield
    pf._CREADOS_UI.clear()


# Todas estas formas apuntan al mismo archivo del proyecto.
EQUIVALENTES = ['nota.txt', '/nota.txt', './nota.txt', '\\nota.txt']


@pytest.mark.parametrize('al_crear', EQUIVALENTES)
@pytest.mark.parametrize('al_borrar', EQUIVALENTES)
def test_el_permiso_sobrevive_a_la_forma_del_path(al_crear, al_borrar):
    pf._marcar_creado(1, al_crear)
    assert pf._fue_creado_ui(1, al_borrar) is True, (
        f'creado como {al_crear!r} pero no reconocido como {al_borrar!r}')


def test_subcarpetas_tambien_se_normalizan():
    pf._marcar_creado(1, '/sub/dir/x.txt')
    assert pf._fue_creado_ui(1, 'sub/dir/x.txt') is True
    assert pf._fue_creado_ui(1, './sub/dir/x.txt') is True


def test_olvidar_funciona_con_otra_forma():
    """Si `_olvidar_creado` no normaliza igual, el permiso queda colgado para
    siempre y un archivo nuevo con ese nombre hereda el derecho a ser borrado."""
    pf._marcar_creado(1, '/nota.txt')
    pf._olvidar_creado(1, 'nota.txt')
    assert pf._fue_creado_ui(1, '/nota.txt') is False


def test_no_confunde_archivos_distintos():
    pf._marcar_creado(1, 'nota.txt')
    assert pf._fue_creado_ui(1, 'otra.txt') is False
    assert pf._fue_creado_ui(1, 'sub/nota.txt') is False


def test_el_permiso_es_por_proyecto():
    pf._marcar_creado(1, 'nota.txt')
    assert pf._fue_creado_ui(2, 'nota.txt') is False


@pytest.mark.parametrize('fuera', ['../../etc/passwd', '/../../etc/passwd',
                                   'a/../../b', '..', '../', ''])
def test_no_otorga_permiso_fuera_del_proyecto(fuera):
    """`../` no puede producir una clave que otorgue permiso. El borrado real
    igual lo frena `_safe_join`, pero el registro ES la capa que autoriza a
    borrar dentro del árbol protegido: no puede confiar en que otro validó."""
    assert pf._clave_creado(fuera) == ''
    pf._marcar_creado(1, fuera)
    assert pf._fue_creado_ui(1, fuera) is False


# ─── El contrato de punta a punta ────────────────────────────────────────────

def test_crear_y_borrar_en_el_arbol_protegido(tmp_path, monkeypatch):
    """El caso que rompía: el proyecto ES el repo de Lan Ide."""
    from fastapi.testclient import TestClient

    from plotspace.core.database import get_db
    from plotspace.main import app

    # El proyecto apunta al repo real → _es_ruta_protegida() == True.
    from plotspace.routers.projects import _REPO_ROOT
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO projects (nombre, ruta, fecha_creacion, ultimo_acceso) '
            "VALUES ('lanide', ?, '2026-01-01', '2026-01-01')", (_REPO_ROOT,))
        conn.commit()
        pid = cur.lastrowid
    finally:
        conn.close()

    cli = TestClient(app)
    destino = os.path.join(_REPO_ROOT, 'tmp_test_creados_ui.txt')
    try:
        # Se crea con slash inicial…
        r = cli.post(f'/api/projects/{pid}/files/save',
                     json={'path': '/tmp_test_creados_ui.txt', 'content': 'hola'})
        assert r.status_code == 200
        assert os.path.isfile(destino)

        # …y se borra SIN slash, que es como lo manda el árbol del editor.
        r = cli.request('DELETE', f'/api/projects/{pid}/files',
                        params={'path': 'tmp_test_creados_ui.txt'})
        assert r.status_code == 200, f'403 sobre un archivo recién creado: {r.text}'
        assert not os.path.exists(destino)
    finally:
        if os.path.exists(destino):
            os.remove(destino)


def test_un_archivo_real_del_repo_sigue_protegido(tmp_path):
    """El blindaje anti-autodestrucción NO se puede haber aflojado: la
    normalización da permiso sobre lo CREADO, no sobre todo."""
    from fastapi.testclient import TestClient

    from plotspace.core.database import get_db
    from plotspace.main import app
    from plotspace.routers.projects import _REPO_ROOT

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO projects (nombre, ruta, fecha_creacion, ultimo_acceso) '
            "VALUES ('lanide', ?, '2026-01-01', '2026-01-01')", (_REPO_ROOT,))
        conn.commit()
        pid = cur.lastrowid
    finally:
        conn.close()

    cli = TestClient(app)
    r = cli.request('DELETE', f'/api/projects/{pid}/files', params={'path': 'VERSION'})
    assert r.status_code == 403
    assert os.path.isfile(os.path.join(_REPO_ROOT, 'VERSION')), 'se borró VERSION del repo'
