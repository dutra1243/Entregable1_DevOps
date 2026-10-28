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

Verificado el 28/10/2026 en un cluster local Kind (`entregable3`, Kubernetes
1.35.0). Los siguientes comandos se ejecutan desde la raiz del proyecto en Bash,
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
kind create cluster --name entregable3 --image kindest/node:v1.35.0 --wait 120s

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

Falco 0.45.1 funciono con `modern_ebpf` sobre el kernel WSL2 de Docker Desktop.
`reports/falco-event.log` contiene la alerta real `Executing binary not part of
base image`, con el pod `falco-test`, namespace `default` y UID 1000.
