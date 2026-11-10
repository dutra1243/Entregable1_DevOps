#!/usr/bin/env bash
set -euo pipefail
namespace=obligatorio-grupolegionarios
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export KUBECONFIG=${KUBECONFIG:-$root/grupolegionarios.yaml}
mode=${1:-}
case "$mode" in --yes|--delete-data|--dry-run) ;; *) echo 'Uso: bash scripts/cleanup-ucu.sh --dry-run|--yes|--delete-data'; exit 1;; esac
k() { kubectl --namespace "$namespace" "$@"; }
echo "Contexto: $(kubectl config current-context); namespace: $namespace"
# Nunca se elimina el namespace ni se usa delete all: hay recursos ajenos.
args=(--ignore-not-found=true)
if [[ "$mode" == --dry-run ]]; then args+=(--dry-run=server); fi
k delete ingress movies grafana "${args[@]}"
k delete deployment movies-blue movies-green prometheus grafana pod-metrics "${args[@]}"
k delete service movies prometheus grafana pod-metrics movies-blue-metrics movies-green-metrics "${args[@]}"
k delete configmap app-config prometheus-config grafana-config grafana-dashboard grafana-providers pod-metrics-code "${args[@]}"
if [[ "$mode" == --delete-data ]]; then
 k wait --for=delete pod -l app=movies --timeout=120s
 k delete pvc movies-data --ignore-not-found=true
 k delete secret movies-secrets grafana-secrets --ignore-not-found=true
else
 echo 'Se conservan movies-data y los Secrets. --delete-data tambiÃ©n elimina datos y credenciales de la aplicaciÃ³n.'
fi
