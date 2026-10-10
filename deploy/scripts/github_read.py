# Managed by Cenit: GitHub read-only client for VM preparation.
"""Bounded requests to the fixed Cenit repository, without credential redirects."""
import json
import os
from pathlib import Path
import stat
import urllib.error
import urllib.request

REPOSITORY = "Menderin/Cenit"
API_ROOT = "https://api.github.com/repos/" + REPOSITORY
TOKEN_PATH = Path.home() / ".local/share/cenit/secrets/github-read-token"
MAX_RESPONSE_BYTES = 1024 * 1024


class GitHubReadError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_token(path=TOKEN_PATH):
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 4096:
            raise GitHubReadError("El archivo de token debe ser regular y privado.")
        if os.name == "posix":
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
                raise GitHubReadError("El token debe pertenecer al usuario y tener permisos 600.")
        token = path.read_text(encoding="ascii").strip()
        if not token or any(c.isspace() for c in token):
            raise GitHubReadError("Formato de token inválido.")
        return token
    except (OSError, UnicodeError) as error:
        raise GitHubReadError("No se puede leer el token privado de GitHub.") from error


class GitHubClient:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, suffix=""):
        # Callers use constant paths; do not accept absolute URLs from release data.
        if suffix and (not suffix.startswith("/") or suffix.startswith("//")):
            raise GitHubReadError("Ruta de API inválida.")
        request = urllib.request.Request(API_ROOT + suffix, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Cenit-VM-read-monitor",
        })
        try:
            with self.opener.open(request, timeout=20) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise GitHubReadError("Respuesta de GitHub demasiado grande.")
            return json.loads(body)
        except urllib.error.HTTPError as error:
            raise GitHubReadError(
                f"GitHub HTTP {error.code}: revisar permisos, expiración y acceso a Cenit."
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise GitHubReadError("No se pudo conectar a GitHub con TLS válido.") from error
        except (ValueError, UnicodeError) as error:
            raise GitHubReadError("Respuesta JSON de GitHub inválida.") from error


def inspect_repository(client):
    repository = client.get()
    if repository.get("full_name", "").lower() != REPOSITORY.lower():
        raise GitHubReadError("La respuesta no corresponde a Menderin/Cenit.")
    workflow = client.get("/contents/.github/workflows/ci.yml?ref=main")
    if workflow.get("type") != "file":
        raise GitHubReadError("No se encontró el workflow CI publicado.")
    runs = client.get("/actions/runs?per_page=1")
    releases = client.get("/releases?per_page=5")
    if not isinstance(runs.get("workflow_runs"), list) or not isinstance(releases, list):
        raise GitHubReadError("Respuesta de Actions/releases inválida.")
    if any(not isinstance(item, dict) for item in releases):
        raise GitHubReadError("Listado de releases inválido.")
    return releases
