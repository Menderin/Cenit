#!/usr/bin/env bash
# Run interactively on the VM, without sudo; never pass the token as an argument.
set +x
set -Eeuo pipefail
umask 077

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -ne 0 ]] || fail 'Ejecuta sin sudo, bajo el usuario que administra Cenit.'
[[ -t 0 ]] || fail 'Ejecuta desde una sesión SSH interactiva para introducir el token.'
command -v podman >/dev/null || fail 'Falta Podman.'

registry_user=${1:-Menderin}
[[ $registry_user =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ ]] || fail 'Usuario GitHub inválido.'
registry_dir="$HOME/.local/share/cenit/registry"
registry_auth="$registry_dir/auth.json"
[[ ! -L $registry_dir && ! -L $registry_auth ]] || fail 'El directorio o archivo de autenticación es un enlace; revisar antes de continuar.'
install -d -m 700 -- "$registry_dir"
if [[ -e $registry_auth ]]; then
  [[ -f $registry_auth && -O $registry_auth ]] || fail 'El archivo de autenticación no es un archivo propio.'
  chmod 600 -- "$registry_auth"
fi

printf 'En Password, introduce el PAT classic con read:packages. No se mostrará al escribir.\n'
podman login --tls-verify=true --authfile "$registry_auth" --username "$registry_user" ghcr.io
chmod 600 -- "$registry_auth"
printf 'Autenticación GHCR guardada para Cenit. No se descargó ni desplegó una imagen.\n'
printf 'Los pulls de Cenit deben usar --authfile %s\n' "$registry_auth"
