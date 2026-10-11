#!/usr/bin/env bash
# Install only the read-only monitor; do not touch containers or application state.
set -Eeuo pipefail
umask 077
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -ne 0 ]] || fail 'Ejecuta sin sudo, bajo adminc.'
for command_name in python3 systemctl loginctl install grep; do
  command -v "$command_name" >/dev/null || fail "Falta $command_name."
done
[[ -x /usr/bin/python3 ]] || fail 'Se requiere /usr/bin/python3 para la unidad.'
[[ $(loginctl show-user "$(id -un)" --property=Linger --value) == yes ]] || fail 'Linger debe estar habilitado para adminc.'
systemctl --user show-environment >/dev/null || fail 'No está disponible systemd de usuario.'
deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
bin_dir="$HOME/.local/share/cenit/bin"
unit_dir="$HOME/.config/systemd/user"
[[ ! -L $bin_dir && ! -L $unit_dir ]] || fail 'Revisar los directorios destino: no pueden ser enlaces.'

# Check authentication before writing units. This does not use registry credentials.
python3 "$deploy_dir/scripts/check-github-releases.py"
for file_name in github_read.py check-github-releases.py; do
  target="$bin_dir/$file_name"
  [[ ! -L $target ]] || fail "Destino $file_name es un enlace."
  if [[ -e $target ]]; then
    grep -q '^# Managed by Cenit:' "$target" || fail "Archivo $file_name no gestionado por Cenit."
  fi
done
for unit_name in cenit-github-monitor.service cenit-github-monitor.timer; do
  target="$unit_dir/$unit_name"
  [[ ! -L $target ]] || fail "Destino $unit_name es un enlace."
  if [[ -e $target ]]; then
    grep -Fxq '# Managed by Cenit install-github-monitor.sh' "$target" || fail "Unidad $unit_name ajena a Cenit."
  fi
done
install -d -m 700 -- "$bin_dir" "$unit_dir"
for file_name in github_read.py check-github-releases.py; do
  install -m 600 -- "$deploy_dir/scripts/$file_name" "$bin_dir/$file_name"
done
for unit_name in cenit-github-monitor.service cenit-github-monitor.timer; do
  install -m 600 -- "$deploy_dir/systemd/$unit_name" "$unit_dir/$unit_name"
done
systemctl --user daemon-reload
systemctl --user start cenit-github-monitor.service
systemctl --user enable --now cenit-github-monitor.timer
printf 'Consulta periódica de GitHub activa en modo observación. No se despliega ninguna aplicación.\n'
