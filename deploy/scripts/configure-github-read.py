# Managed by Cenit: interactive setup of repository read credentials.
"""Validate permissions before atomically saving the token outside the checkout."""
import getpass
import os
import sys
import tempfile

from github_read import GitHubClient, GitHubReadError, TOKEN_PATH, inspect_repository


def main():
    if os.name != "posix" or os.getuid() == 0:
        print("Ejecuta en la VM Linux sin sudo, bajo adminc.", file=sys.stderr)
        return 1
    if not sys.stdin.isatty():
        print("Se necesita una sesión SSH interactiva.", file=sys.stderr)
        return 1
    temporary = None
    try:
        token = getpass.getpass("Token fine-grained de lectura de Cenit (entrada oculta): ")
        if not token or any(c.isspace() for c in token):
            raise GitHubReadError("Token vacío o con espacios.")
        inspect_repository(GitHubClient(token))
        if TOKEN_PATH.parent.is_symlink() or TOKEN_PATH.is_symlink():
            raise GitHubReadError("La ruta de secretos no puede ser un enlace.")
        os.umask(0o077)
        TOKEN_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        TOKEN_PATH.parent.chmod(0o700)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="ascii", dir=TOKEN_PATH.parent, delete=False
        ) as stream:
            temporary = stream.name
            os.chmod(temporary, 0o600)
            stream.write(token + "\n")
        os.replace(temporary, TOKEN_PATH)
        temporary = None
        print("Lectura de Contents, Actions y releases verificada para Menderin/Cenit.")
        print("Token privado guardado. No se desplegó una aplicación.")
        return 0
    except (GitHubReadError, OSError, UnicodeError, EOFError) as error:
        # Do not print response bodies, headers, token values or request reprs.
        print("No se pudo configurar la lectura: " + (
            str(error) if isinstance(error, GitHubReadError) else "revisar entrada y archivos privados."
        ), file=sys.stderr)
        return 1
    finally:
        if temporary:
            os.unlink(temporary)


if __name__ == "__main__":
    sys.exit(main())
