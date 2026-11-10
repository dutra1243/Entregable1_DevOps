# Entregable 1 Devops

Joaquín Ballara, Facundo Dutra, Mauro Machado

## Instrucciones

Creamos las imágenes de Docker green y blue para la aplicación y las cargamos en minikube.

```bash
minikube start

docker build -t movies/app:blue .
docker build -t movies/app:green .

minikube image load movies/app:blue
minikube image load movies/app:green

# El volumen hostPath debe permitir escritura al usuario no root de la imagen.
minikube ssh -- "sudo mkdir -p /mnt/movies && sudo chown -R 1000:1000 /mnt/movies"
```

Aplicamos el manifiesto de Kubernetes para crear los deployments y services.

```bash
kubectl apply -f k8s/configMap.yaml
kubectl apply -f k8s/blueDeployments.yaml
kubectl apply -f k8s/greenDeployments.yaml
kubectl apply -f k8s/service.yaml
```

Para cambiar el tráfico a la versión green hacemos un patch al service movies. Este comando debe ser corrido en una terminal bash para que funcione.

```bash
kubectl patch service movies -p '{"spec":{"selector":{"slot":"green"}}}'
```

Para cambiar el tráfico a la versión blue hacemos un patch al service movies. Este comando debe ser corrido en una terminal bash para que funcione.

```bash
kubectl patch service movies -p '{"spec":{"selector":{"slot":"blue"}}}'
```

Para verificar qué versión estamos usando podemos usar:

```bash
kubectl describe service movies | grep Selector
```

Para hacer el túnel y acceder a la aplicación usamos:

```bash
minikube service movies --url
```

## Prometheus y Grafana

La API expone metricas en `/metrics`. Para instalar Prometheus y Grafana en Minikube
usamos el chart `kube-prometheus-stack` de Helm:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

Aplicamos el `ServiceMonitor` despues de crear el Service de la aplicacion:

```powershell
kubectl apply -f k8s/serviceMonitor.yaml
kubectl get pods -n monitoring
```

En otra terminal, abrimos las interfaces:

```powershell
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

Prometheus queda disponible en `http://localhost:9090` y Grafana en
`http://localhost:3001`. El usuario de Grafana es `admin`; para obtener la
contrasena en PowerShell:

```powershell
$encoded = kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
```

En Prometheus, revisamos `Status > Targets` y confirmamos que `movies` este
en estado `UP`. Grafana ya incluye Prometheus como fuente de datos.

## Entregable 3: DevSecOps

Validado el 09/11/2026 con Minikube v1.38.1, driver Docker y Kubernetes 1.35.0:
Kyverno rechazo las tres infracciones, ambos deployments pasaron el dry-run del
servidor y Falco con `modern_ebpf` detecto `Executing binary not part of base image`
en `falco-test` con UID 1000. El perfil temporal `movies-verification` se elimina
despues de las pruebas. Esta validacion cubre Kyverno y Falco; no repite los escaneos.

Los reportes existentes
son evidencia historica del 28/10/2026 y deben regenerarse para validar este entorno.
Los siguientes comandos se ejecutan desde la raiz del proyecto en Bash,
con Docker, kubectl, Helm y un cluster disponible.

### Analisis de codigo e imagen

```bash
npm ci
npm audit > reports/npm-audit.txt 2>&1
docker run --rm -v "$PWD:/src" semgrep/semgrep:latest semgrep scan --config p/javascript --config p/nodejs --config p/dockerfile --json --output /src/reports/semgrep.txt /src/src /src/Dockerfile
docker build -t movies/app:entregable3 .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD/reports:/reports" aquasec/trivy:latest image --scanners vuln --format table --output /reports/trivyreport.txt movies/app:entregable3
docker run --rm -v "$PWD:/work" -w /work stackrox/kube-linter:latest lint k8s > reports/kubelinter.txt 2>&1
```

- `npm audit fix` actualizo el lockfile sin cambiar los rangos de `package.json`: de 15 vulnerabilidades (2 criticas, 9 altas y 4 moderadas) a 0.
- Semgrep: 75 reglas sobre 11 archivos de `src/` y el Dockerfile; 0 alertas finales. Se corrigio `missing-user` usando `USER node`.
- La imagen usa Node 24 LTS, instala solo dependencias de produccion y arranca directamente con Node. Se comprobaron UID 1000, bcrypt y respuestas HTTP de `/` y `/metrics`.
- KubeLinter 0.8.3: 0 errores. Ambos deployments mantienen sus requests/limits y ahora usan UID/GID 1000, raiz de solo lectura, sin escalamiento de privilegios y sin capabilities. `/app/data` sigue siendo escribible mediante el volumen existente.

**Vulnerabilidades de la imagen que se mantienen:** Trivy encontro 1 CRITICAL
y 63 HIGH (ademas de 97 MEDIUM, 84 LOW y 1 UNKNOWN). Todos los paquetes, versiones
y CVE estan en `reports/trivyreport.txt`. La imagen escaneada es
`movies/app:entregable3`, digest
`sha256:bf4cf8bb0542a87017cc419694a02f5922371bd3c521837890842a58c86f50b0`.

| Origen | Hallazgos HIGH/CRITICAL | Justificacion |
| --- | --- | --- |
| Debian: util-linux y bibliotecas asociadas | 48 HIGH: CVE-2026-53613, CVE-2026-53615, CVE-2026-76642, CVE-2026-78408, CVE-2026-78409 y CVE-2026-78410, repetidos en 8 paquetes | Trivy no informa version corregida para Debian 12. Se mantienen para esta practica. |
| Debian: gzip, libacl1, libsystemd0, libudev1, ncurses y perl-base | 8 HIGH: CVE-2026-41992, CVE-2026-54369, CVE-2026-16742, CVE-2025-69720 y CVE-2026-9538 | Sin version corregida informada; algunos figuran como `fix_deferred`. Se mantienen para esta practica. |
| Debian: zlib1g | 1 CRITICAL: CVE-2023-45853 | Figura como `will_not_fix`, sin version corregida informada. Se documenta y no se considera resuelta. |
| npm incluido en la imagen base: brace-expansion, http-cache-semantics y undici | 7 HIGH: CVE-2026-102276, CVE-2026-102278, CVE-2026-93748, CVE-2026-109383, CVE-2026-109869, CVE-2026-19534 y CVE-2026-87018 | Pertenecen a `/usr/local/lib/node_modules/npm`, no a las dependencias de la API. Se mantiene el npm de la imagen oficial; el proceso de la aplicacion arranca con `node`, no con npm. |

La ejecucion no root y la raiz de solo lectura reducen riesgos, pero no eliminan
estas vulnerabilidades. La aceptacion es solo para el laboratorio, no para produccion.

### Kyverno y Falco

```bash
# Solo si no hay un cluster disponible:
minikube start --driver=docker --kubernetes-version=v1.35.0
kubectl config use-context minikube

# Si se va a desplegar la imagen construida para Entregable 3:
minikube image load movies/app:entregable3

helm install kyverno kyverno --repo https://kyverno.github.io/kyverno/ --version 3.9.2 --namespace kyverno --create-namespace --wait
helm install falco falco --repo https://falcosecurity.github.io/charts --version 9.2.1 --namespace kube-system --set driver.kind=modern_ebpf --wait
kubectl apply -f security/kyverno.yaml
kubectl wait --for=condition=Ready clusterpolicy --all --timeout=60s

# Debe fallar: imagen latest, sin recursos y usuario root.
kubectl apply -f security/non-compliant.yaml > reports/kyverno.txt 2>&1

# Ambos deployments deben ser aceptados sin crearlos.
kubectl apply --dry-run=server -f k8s/blueDeployments.yaml -f k8s/greenDeployments.yaml

kubectl apply -f security/falco-test.yaml
kubectl wait --for=condition=Ready pod/falco-test --timeout=60s
# Accion sospechosa: ejecutar un binario que no pertenece a la capa base.
kubectl exec falco-test -- sh -c 'cp /bin/busybox /tmp/busybox; /tmp/busybox id'
kubectl logs -n kube-system -l app.kubernetes.io/name=falco -c falco --since=10m | grep 'k8s_pod_name=falco-test' > reports/falco-event.log
```

`security/kyverno.yaml` contiene tres politicas en modo `Enforce`: prohibir
`latest` (y exigir etiqueta explicita), exigir requests/limits de CPU y memoria,
y exigir ejecucion no root. Incluyen contenedores de inicializacion; los controles
de imagen y usuario tambien cubren contenedores efimeros, que no admiten recursos.
Kyverno genero ademas las reglas para controladores como Deployment.
`reports/kyverno.txt` registra el rechazo real por las tres politicas.

Se conservan las exclusiones de infraestructura predeterminadas de Kyverno
(incluidos `kube-system` y `kyverno`); las politicas se aplican a los pods de
aplicacion. Falco se instala en `kube-system` porque su sensor requiere privilegios
del host. No se agregaron excepciones a las politicas del proyecto.

En la verificacion historica, Falco 0.45.1 funciono con `modern_ebpf` sobre el kernel WSL2 de Docker Desktop.
`reports/falco-event.log` contiene la alerta real `Executing binary not part of
base image`, con el pod `falco-test`, namespace `default` y UID 1000.

Para eliminar el cluster de laboratorio al terminar (borra todos sus recursos):

```bash
minikube delete
```

## UCU deployment (Jenkins)

Use `k8s/ucu` for namespace `obligatorio-grupolegionarios`; local Minikube manifests remain separate.
Create Jenkins credentials: `dockerhub-credentials` (username/password), `kubeconfig-ucu` (Secret file containing the supplied namespace-limited kubeconfig), `movies-tmdb-api-key`, `movies-jwt-secret` and `movies-grafana-password` (Secret text). Restrict job/credential access. Never print or archive credentials. A token stored in Jenkins remains sensitive; rotate it through university administrators if exposed.

Configure a Pipeline from SCM using `Jenkinsfile`. The agent requires Bash, Docker daemon/build access, kubectl with Kustomize, curl, and registry/API connectivity. Running Jenkins inside Kubernetes does not automatically provide Docker daemon access: the university must supply an appropriate build agent.
Images are published to public `joaquinballara/movies` with commit-specific slot tags. `SWITCH_TO=unchanged` preserves traffic; choose blue/green explicitly after verification. Set `INGRESS_HOST` only to a university-approved application hostname, never the Kubernetes API hostname.

Copy `.env.example` to `.env` for local application settings; replace placeholders. `.env.local.example` documents optional local deployment inputs. The kubeconfig templates `grupolegionarios.yaml.example` and `kubeconfig-ucu.example` contain placeholders only: obtain the actual endpoint, CA and token from the university, and upload the completed file to Jenkins Secret file credentials. Preserve the university's supplied TLS settings unless its administrators provide a trusted CA. Never commit completed files. `.rendered/` is reserved for temporary generated manifests; do not store secrets there permanently. Jenkins uses a restricted temporary directory instead.

The PVC uses the default storage class. If it stays Pending, ask the university for its storage class; do not substitute hostPath. Application pods share one node and persistent data. Monitoring is ephemeral. The file-based application does not support safe concurrent writers; keep traffic on one slot.

For local access with the supplied kubeconfig:
```bash
export KUBECONFIG="$PWD/grupolegionarios.yaml"
kubectl -n obligatorio-grupolegionarios port-forward svc/movies 3000:3000
# Separate terminals:
kubectl -n obligatorio-grupolegionarios port-forward svc/prometheus 9090:9090
kubectl -n obligatorio-grupolegionarios port-forward svc/grafana 3001:3000
```
Check Prometheus Targets and Grafana's provisioned Prometheus source. The existing Entregable2 dashboard is provisioned automatically; verify its panels against the available metrics. Validate registration/login, persistence after pod replacement and blue/green switching before accepting deployment. Roll back an image with `kubectl rollout undo deployment/movies-blue -n obligatorio-grupolegionarios` (or green); switch the Service back if needed. Do not delete the PVC during rollback.

University rollout has not yet been executed: Jenkins credentials and image publishing are prerequisites.

### Alternative when Jenkins credential management is unavailable

Application secrets can be bootstrapped directly into the university namespace:
```bash
python scripts/bootstrap-secrets.py
```
This uses the local ignored `.env` and `grupolegionarios.yaml` (or KUBECONFIG), creates `movies-secrets` and `grafana-secrets`, and preserves existing Secrets. It generates a Grafana password and generates a JWT secret if missing locally. No values are printed. Jenkins no longer needs the three Secret text credentials described above; application pods reference Kubernetes Secrets directly. Kubernetes Secrets still require restricted access and are not inherently encrypted just because their API representation uses base64.

The pipeline retains the existing `dockerhub-credentials`. Leave `KUBECONFIG_CREDENTIAL_ID` blank only if the Jenkins agent already has an authorized in-cluster identity or kubeconfig. Otherwise enter an existing file credential ID. Running Jenkins inside the cluster alone does not grant namespace access. Your supplied account cannot create role bindings; university administrators must authorize the Jenkins identity if it lacks access. Never put a kubeconfig token in the Jenkinsfile to bypass that requirement.

### University deployment verification ? 10 November 2026

Deployed directly using the supplied namespace kubeconfig (not through Jenkins).
Published image: `joaquinballara/movies:ucu-20261110`, digest `sha256:114b54539503032017cbd0a4ab5b7829e14db71ee6fb8092b7eb588e1cc7c4d7`.
All four application/monitoring deployments became Ready; the 1Gi local-path PVC bound successfully. Live checks passed registration/login, authenticated favorites, blue/green switching, shared JWT/data, data persistence after replacing the blue pod, Prometheus target UP, and Grafana health. The checked-in live smoke test is `python scripts/verify-ucu.py`; it creates a unique test account and performs a blue pod replacement, so run it deliberately.

A transient disk-pressure taint delayed the replacement pod on the university node, then cleared. Application data uses node-local provisioned storage and does not provide node-failure redundancy. The TMDB credential currently supplied in `.env` was rejected by TMDB (401); movie lookup remains blocked until a valid TMDB bearer access token is provided. Update only `TMDB_API_KEY` in `movies-secrets` and restart both application deployments after correcting it. The bootstrap script intentionally preserves existing Secrets.
No public Ingress was created. Jenkins agent authentication and Docker access remain unverified; this successful manual deployment does not verify Jenkins execution.

### Requested public hostname

Created APISIX Ingress `movies` for `obligatorio-legionarios.reto-ucu.net` using `k8s/ucu/ingress.yaml`. The pipeline defaults to this hostname. DNS resolves to `186.48.255.236`, but public HTTP port 80 currently serves an Apache choir-site redirect instead of this application (also observed for the older example hostname). Public application access is not verified: confirm the university APISIX external port/forwarding configuration. Local port-forward access remains available. The optional Ingress file is applied separately from the base overlay.

Grafana also has an optional APISIX Ingress: `grafana-obligatorio-legionarios.reto-ucu.net`, configured in `k8s/ucu/grafana-ingress.yaml` and Jenkins parameter `GRAFANA_INGRESS_HOST`. It routes to `grafana:3000` and uses Grafana login (admin password in `grafana-secrets`). Public reachability has the same university gateway dependency as the application hostname. The Ingress does not configure TLS; use the existing local tunnel for credential entry until HTTPS is available at the gateway.

### Jenkins security scans

Before building/publishing, Jenkins runs npm audit and Semgrep. The Linux agent requires Node.js 24/npm and Semgrep 1.181.1 (`python3 -m pip install semgrep==1.181.1` in the agent image/environment), plus access to the npm registry and Semgrep rules registry. No Semgrep account or token is needed for these community rules. npm ci includes development dependencies but skips lifecycle scripts for the audit; the application Docker build still performs its normal dependency installation.

Fresh reports and diagnostic logs are archived from `security-results/` under Jenkins build artifacts, including on failures. Dependency vulnerabilities and Semgrep findings mark the build UNSTABLE, while image publication and deployment continue. Missing tools, scan/registry failures, malformed reports or Semgrep scan errors stop the release. No automatic dependency fixes run. Historical `reports/` remain unchanged. Kyverno and Falco remain local proofs of concept; they are not added to Jenkins.

The Jenkins job itself has not been executed or validated against the university Jenkins installation.
