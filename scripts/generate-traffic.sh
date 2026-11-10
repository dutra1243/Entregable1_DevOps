#!/usr/bin/env bash
# Se ejecuta en el equipo del usuario, no como un pod.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_PORT=${APP_PORT:-3000}
PROMETHEUS_PORT=${PROMETHEUS_PORT:-9090}
GRAFANA_PORT=${GRAFANA_PORT:-3001}
BASE_URL=${BASE_URL:-http://127.0.0.1:$APP_PORT}
BASE_URL=${BASE_URL%/}
DURATION=${DURATION:-300}
INTERVAL=${INTERVAL:-1}
[[ "$DURATION" =~ ^[1-9][0-9]*$ ]] || { echo 'DURATION debe ser un entero positivo' >&2; exit 1; }
[[ "$INTERVAL" =~ ^[1-9][0-9]*$ ]] || { echo 'INTERVAL debe ser un entero positivo' >&2; exit 1; }
command -v curl >/dev/null || { echo 'Falta instalar curl.' >&2; exit 1; }
# Probar el ejecutable: command -v tambien encuentra los alias de Microsoft Store.
python_cmd=()
for candidate in python3 python; do
 if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)' >/dev/null 2>&1; then
  python_cmd=("$candidate"); break
 fi
done
if ((${#python_cmd[@]} == 0)) && command -v py >/dev/null && py -3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)' >/dev/null 2>&1; then
 python_cmd=(py -3)
fi
((${#python_cmd[@]} > 0)) || { echo 'No se encontro Python 3.8+. Instala Python y agrega su ejecutable al PATH.' >&2; exit 1; }
umask 077
tmp=$(mktemp -d)
tunnel_pids=()
cleanup() {
 for pid in "${tunnel_pids[@]}"; do kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; done
 rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Use native kubectl in the same Bash environment as curl.
if command -v kubectl >/dev/null; then
 kubectl_cmd=$(command -v kubectl)
else
 kubectl_cmd=$("${python_cmd[@]}" -c 'import sys; sys.path.insert(0,sys.argv[1]); from ucu_common import tool; print(tool("kubectl"))' "$root/scripts/utils")
 if command -v cygpath >/dev/null; then kubectl_cmd=$(cygpath -u "$kubectl_cmd"); fi
fi
export KUBECONFIG=${KUBECONFIG:-$root/grupolegionarios.yaml}
# Windows kubectl needs a Windows path when launched from Git Bash.
if command -v cygpath >/dev/null; then export KUBECONFIG=$(cygpath -w "$KUBECONFIG"); fi
namespace=obligatorio-grupolegionarios
"$kubectl_cmd" -n "$namespace" get service movies prometheus grafana --request-timeout=20s >/dev/null
start_tunnel() {
 local service=$1 port=$2 remote=$3 endpoint=$4
 [[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1024 && port <= 65535)) || { echo "Invalid local port: $port" >&2; exit 1; }
 if curl --fail --silent --max-time 2 "http://127.0.0.1:$port$endpoint" >/dev/null; then
  echo "Reusing $service tunnel on localhost:$port"
  return
 fi
 "$kubectl_cmd" -n "$namespace" port-forward --address=127.0.0.1 "svc/$service" "$port:$remote" > "$tmp/$service-tunnel.log" 2>&1 &
 local pid=$!
 tunnel_pids+=("$pid")
 for ((attempt=0; attempt<45; attempt++)); do
  if ! kill -0 "$pid" 2>/dev/null; then echo "Could not start $service tunnel:" >&2; cat "$tmp/$service-tunnel.log" >&2; exit 1; fi
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$port$endpoint" >/dev/null; then
   echo "$service ready: http://localhost:$port"
   return
  fi
  sleep 1
 done
 echo "Timed out waiting for $service tunnel" >&2
 exit 1
}
[[ "$APP_PORT" != "$GRAFANA_PORT" && "$APP_PORT" != "$PROMETHEUS_PORT" && "$GRAFANA_PORT" != "$PROMETHEUS_PORT" ]] || { echo 'Choose three different local ports.' >&2; exit 1; }
start_tunnel movies "$APP_PORT" 3000 /
start_tunnel prometheus "$PROMETHEUS_PORT" 9090 /-/ready
start_tunnel grafana "$GRAFANA_PORT" 3000 /api/health

echo 'Tunnels created by this script will close when traffic generation finishes.'

"${python_cmd[@]}" - > "$tmp/user.json" <<'PY'
import json,secrets,sys
json.dump({'email':'traffic-'+secrets.token_hex(8)+'@example.com','password':secrets.token_urlsafe(24),'firstName':'Prueba','lastName':'Trafico'},sys.stdout)
PY
# Una cuenta por ejecución; no se modifica el usuario real.
curl --fail --silent --show-error --max-time 15 -H 'Content-Type: application/json' --data-binary @"$tmp/user.json" "$BASE_URL/api/auth/register" >/dev/null
curl --fail --silent --show-error --max-time 15 -H 'Content-Type: application/json' --data-binary @"$tmp/user.json" "$BASE_URL/api/auth/login" > "$tmp/login.json"
"${python_cmd[@]}" -c 'import json,sys; print("Authorization: Bearer "+json.load(sys.stdin)["token"])' < "$tmp/login.json" > "$tmp/auth"

end=$((SECONDS+DURATION))
ok=0; failed=0
request() {
 local expected=$1; shift
 local code
 code=$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "$@") || code=000
 if [[ "$code" == "$expected" ]]; then ok=$((ok+1)); else failed=$((failed+1)); fi
}
echo "Generando tráfico en $BASE_URL durante ${DURATION}s (incluye respuestas 401 esperadas)."
while ((SECONDS < end)); do
 request 200 "$BASE_URL/"
 request 200 -H @"$tmp/auth" "$BASE_URL/api/users/favorites"
 request 401 "$BASE_URL/api/users/favorites"
 if [[ "${INCLUDE_TMDB:-0}" == 1 ]]; then request 200 -H @"$tmp/auth" "$BASE_URL/api/movies"; fi
 sleep "$INTERVAL"
done
echo "Solicitudes con resultado esperado: $ok; fallas: $failed"
((failed == 0))
