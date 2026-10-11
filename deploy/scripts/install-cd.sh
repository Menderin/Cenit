#!/usr/bin/env bash
# Managed by Cenit automatic deployment
set -Eeuo pipefail
umask 077
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -ne 0 ]] || fail 'Ejecuta sin sudo, bajo adminc.'
for command_name in python3 podman systemctl loginctl install head; do
  command -v "$command_name" >/dev/null || fail "Falta $command_name."
done
[[ -x /usr/bin/python3 ]] || fail 'Falta /usr/bin/python3.'
[[ $(loginctl show-user "$(id -un)" --property=Linger --value) == yes ]] || fail 'Linger debe estar habilitado.'
systemctl --user show-environment >/dev/null || fail 'No está disponible systemd de usuario.'
deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
state_dir="$HOME/.local/share/cenit"
bin_dir="$state_dir/bin"
unit_dir="$HOME/.config/systemd/user"
cd_dir="$state_dir/cd"
for destination_dir in "$state_dir" "$bin_dir" "$unit_dir" "$cd_dir"; do
  [[ ! -L $destination_dir ]] || fail 'Un directorio destino es un enlace; revisar antes de instalar.'
done
sources=(
  "$deploy_dir/scripts/github_read.py"
  "$deploy_dir/scripts/cd_release.py"
  "$deploy_dir/scripts/cd_runtime.py"
  "$deploy_dir/scripts/deploy-approved-release.py"
  "$deploy_dir/quadlet/cenit-app.container.in"
  "$deploy_dir/nginx/cenit.conf"
  "$deploy_dir/systemd/cenit-cd.service"
  "$deploy_dir/systemd/cenit-cd.timer"
)
destinations=(
  "$bin_dir/github_read.py"
  "$bin_dir/cd_release.py"
  "$bin_dir/cd_runtime.py"
  "$bin_dir/deploy-approved-release.py"
  "$cd_dir/cenit-app.container.in"
  "$cd_dir/cenit.conf"
  "$unit_dir/cenit-cd.service"
  "$unit_dir/cenit-cd.timer"
)
for index in "${!sources[@]}"; do
  [[ -f ${sources[$index]} ]] || fail "Falta ${sources[$index]}."
  target=${destinations[$index]}
  [[ ! -L $target ]] || fail 'Un destino es un enlace.'
  if [[ -e $target ]]; then
    [[ $(head -n 1 "$target") == "$(head -n 1 "${sources[$index]}")" ]] || fail "Destino no gestionado: $target"
  fi
done
# Verify existing credentials/bootstrap before creating database roles or installing units.
python3 "$deploy_dir/scripts/check-github-releases.py"
python3 "$deploy_dir/scripts/cd_runtime.py" --validate-quadlet "$deploy_dir/quadlet/cenit-app.container.in"
if [[ -f $unit_dir/cenit-cd.service ]]; then
  systemctl --user stop cenit-cd.timer
  if systemctl --user is-active --quiet cenit-cd.service; then
    fail 'Hay una operación CD en curso. Espera a que termine y repite el instalador; su timer quedó detenido.'
  fi
fi
python3 "$deploy_dir/scripts/cd_runtime.py"
install -d -m 700 "$bin_dir" "$unit_dir" "$cd_dir"
for index in "${!sources[@]}"; do
  install -m 600 "${sources[$index]}" "${destinations[$index]}"
done
systemctl --user daemon-reload
systemctl --user start cenit-cd.service
systemctl --user enable --now cenit-cd.timer
# The verified executor replaces the redundant, read-only observation timer.
if [[ -f $unit_dir/cenit-github-monitor.timer ]]; then
  [[ $(head -n 1 "$unit_dir/cenit-github-monitor.timer") == '# Managed by Cenit install-github-monitor.sh' ]] || fail 'Timer de observación sin marcador Cenit.'
  systemctl --user disable --now cenit-github-monitor.timer
fi
printf 'Ejecutor Cenit instalado. Sin release aprobada conserva el bootstrap.\n'
printf 'Estado privado: %s/status.json\n' "$cd_dir"
systemctl --user list-timers cenit-cd.timer --all --no-pager
