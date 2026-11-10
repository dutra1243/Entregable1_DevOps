#!/usr/bin/env bash
set -euo pipefail
set +x
# Authenticate with KUBECONFIG or an already-authorized in-cluster service account.
NAMESPACE=obligatorio-grupolegionarios
IMAGE=${IMAGE:-joaquinballara/movies}
TAG=$(git rev-parse HEAD)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"
umask 077
for tool in kubectl curl sed; do command -v "$tool" >/dev/null; done
case "${SWITCH_TO:-unchanged}" in unchanged|blue|green) ;; *) exit 1;; esac
case "$IMAGE" in *[!a-zA-Z0-9./_-]*) echo "Invalid IMAGE" >&2; exit 1;; esac
k() { kubectl --namespace "$NAMESPACE" "$@"; }
# Read current slot before apply, so an ordinary build never resets traffic.
active=$(k get service movies --ignore-not-found -o jsonpath='{.spec.selector.slot}')
active=${active:-blue}
case "$active" in blue|green) ;; *) echo "Unexpected active slot" >&2; exit 1;; esac
# Secrets are bootstrapped separately; Jenkins never needs their values.
for secret in movies-secrets grafana-secrets; do
 k get secret "$secret" -o name >/dev/null
done
cp -R k8s/ucu "$tmp/manifests"
# Kustomize patch changes the Service selector only.
cat >> "$tmp/manifests/kustomization.yaml" <<EOF
patches:
- target:
    kind: Service
    name: movies
  patch: |-
    - op: replace
      path: /spec/selector/slot
      value: $active
EOF
kubectl kustomize "$tmp/manifests" | sed -e "s|movies/app:blue|$IMAGE:blue-$TAG|g" -e "s|movies/app:green|$IMAGE:green-$TAG|g" > "$tmp/deploy.yaml"
if [ -n "${INGRESS_HOST:-}" ]; then
 [[ "$INGRESS_HOST" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || exit 1
 cat > "$tmp/ingress.yaml" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: movies
  namespace: $NAMESPACE
spec:
  ingressClassName: apisix
  rules:
  - host: $INGRESS_HOST
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: movies
            port:
              number: 3000
EOF
 k apply --dry-run=server -f "$tmp/ingress.yaml"
 k apply -f "$tmp/ingress.yaml"
fi
if [ -n "${GRAFANA_INGRESS_HOST:-}" ]; then
 [[ "$GRAFANA_INGRESS_HOST" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || exit 1
 cat > "$tmp/grafana-ingress.yaml" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana
  namespace: $NAMESPACE
spec:
  ingressClassName: apisix
  rules:
  - host: $GRAFANA_INGRESS_HOST
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: grafana
            port:
              number: 3000
EOF
 k apply --dry-run=server -f "$tmp/grafana-ingress.yaml"
 k apply -f "$tmp/grafana-ingress.yaml"
fi
k apply --dry-run=server -f "$tmp/deploy.yaml"
k apply -f "$tmp/deploy.yaml"
k wait --for=jsonpath='{.status.phase}'=Bound pvc/movies-data --timeout=120s
for d in movies-blue movies-green prometheus grafana; do
 k rollout status deployment/"$d" --timeout=600s
done
k port-forward service/movies 13000:3000 > "$tmp/forward.log" 2>&1 &
pf=$!
trap 'kill "$pf" 2>/dev/null || true; rm -rf "$tmp"' EXIT
for i in $(seq 1 20); do curl -fsS http://localhost:13000/ && break; sleep 1; done
curl -fsS http://localhost:13000/metrics >/dev/null
case "${SWITCH_TO:-unchanged}" in
 blue|green) k patch service movies --type merge -p "{\"spec\":{\"selector\":{\"slot\":\"$SWITCH_TO\"}}}" ;;
 unchanged) ;;
 *) echo 'Invalid SWITCH_TO' >&2; exit 1 ;;
esac
