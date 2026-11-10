# Entregable DevOps

Joaquín Ballara, Facundo Dutra y Mauro Machado.
API de películas con despliegue blue/green, Prometheus y Grafana.

## Requisitos y configuración

Docker, Git, kubectl, Bash, curl y Python 3. Para la POC local: Minikube y Helm.
Ejecutá los comandos desde la raíz del proyecto. En Windows usá una terminal Bash con estas herramientas disponibles.

```bash
cp .env.example .env
export KUBECONFIG="$PWD/grupolegionarios.yaml"
```

Completá `.env`: `TMDB_API_KEY` debe ser un **token de acceso Bearer de TMDB**, y `JWT_SECRET_KEY` una clave aleatoria. El kubeconfig lo entrega la universidad. Los archivos `.example` muestran la estructura; nunca subas credenciales a Git.

## Construir y desplegar en UCU

Namespace: `obligatorio-grupolegionarios`. La password de Grafana se configura en `.env.local` (ignorado por Git):

```dotenv
GRAFANA_ADMIN_PASSWORD=TU_PASSWORD_ELEGIDA
```

El archivo local actual conserva la password anterior para poder consultarla y editarla. No se generan nuevas passwords de Grafana automaticamente. Para cambiarla en el Secret y en la base de Grafana, sin borrar datos:

```bash
python3 scripts/utils/set-grafana-password.py
```

Para construir, publicar y desplegar todo con un solo comando desde tu equipo:

```bash
python3 scripts/build-deploy-ucu.py
# Si Docker ya tiene tu sesion iniciada:
python3 scripts/build-deploy-ucu.py --skip-login
```

En PowerShell usa `python` en lugar de `python3`. Requiere Docker activo, Git, kubectl, `.env`, `.env.local` y el kubeconfig. El script pide login en Docker Hub, construye tags nuevos, publica las imagenes, prepara Secrets, despliega app/monitoreo/Ingress y sincroniza la password de Grafana. Conserva el PVC y el slot activo. No instala Jenkins ni ejecuta las POC locales. Al reemplazar Grafana se reinicia su almacenamiento temporal, pero se recuperan el dashboard y la fuente provisionados.

El despliegue usa Kustomize, incluido en kubectl. Para cambiar slots usando las imagenes ya publicadas del commit actual, podes usar `scripts/deploy-ucu.sh` con `SWITCH_TO=green` o `SWITCH_TO=blue`; ese script espera tags del commit, distintos de los tags con fecha del despliegue local completo.

Para aplicar los hosts públicos:

```bash
kubectl apply -f k8s/ucu/ingress.yaml -f k8s/ucu/grafana-ingress.yaml
```

Hosts: `obligatorio-legionarios.reto-ucu.net` y `grafana-obligatorio-legionarios.reto-ucu.net`. La última prueba pública devolvió una redirección ajena desde el gateway universitario; usá los túneles hasta resolverlo.

## Acceso y tráfico para los dashboards

Dejá cada túnel abierto en una terminal distinta, con el kubeconfig configurado. En WSL, iniciá el túnel con kubectl dentro de WSL: su localhost puede ser distinto al de PowerShell. Usá el generador en el mismo entorno que el túnel:

```bash
kubectl -n obligatorio-grupolegionarios port-forward svc/movies 3000:3000
kubectl -n obligatorio-grupolegionarios port-forward svc/prometheus 9090:9090
kubectl -n obligatorio-grupolegionarios port-forward svc/grafana 3001:3000
```

Aplicación: http://localhost:3000, Prometheus: http://localhost:9090, Grafana: http://localhost:3001.
Grafana usa el usuario `admin` y la password de `.env.local`. Luego de editarla, ejecuta `python3 scripts/utils/set-grafana-password.py` para aplicarla. Usa el tunel local para iniciar sesion mientras no haya HTTPS en el gateway.

Desde tu equipo generá tráfico durante cinco minutos. El script abre los túneles de la aplicación, Prometheus y Grafana antes de enviar solicitudes; reutiliza los que ya responden y al terminar cierra solamente los que inició. Requiere kubectl en el mismo entorno Bash (en Windows, usá Git Bash). Podés cambiar los puertos con `APP_PORT`, `PROMETHEUS_PORT` y `GRAFANA_PORT`:

```bash
bash scripts/generate-traffic.sh
# Opcional: otro destino, duración e intervalo en segundos.
BASE_URL=http://localhost:3000 DURATION=120 INTERVAL=2 bash scripts/generate-traffic.sh
```

El script crea una cuenta de prueba por ejecución y consulta inicio y favoritos, con y sin autenticación. Incluye respuestas 401 esperadas para ver distintos códigos HTTP. No requiere TMDB; activá `INCLUDE_TMDB=1` solamente con un token válido. Las cuentas de prueba quedan guardadas.

En Prometheus verificá que el target `movies` está UP. En Grafana abrí el dashboard provisionado y seleccioná los últimos 15 minutos con actualización automática. Esperá al menos dos scrapes (unos 30 segundos).

## Jenkins y análisis de seguridad

El `Jenkinsfile` ejecuta npm audit y Semgrep antes de publicar imágenes. Los hallazgos dejan el build UNSTABLE y permiten continuar; un error del analizador detiene el release. Los informes quedan en los artefactos `security-results/`.

El agente Linux requiere Node.js 24/npm, Semgrep 1.181.1, Docker, kubectl, Bash y curl. Usa `dockerhub-credentials` para publicar. Para Kubernetes usá una identidad autorizada del agente o el parámetro `KUBECONFIG_CREDENTIAL_ID` con una credencial de archivo existente. Los Secrets de la aplicación están en Kubernetes. El pipeline todavía no se verificó en Jenkins universitario.

Ejecución manual de los analizadores (0: limpio, 10: hallazgos, 2: error):

```bash
node scripts/security-scan.cjs audit
node scripts/security-scan.cjs semgrep
```

Otros análisis manuales, con Docker:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --scanners vuln joaquinballara/movies:TAG_PUBLICADO
docker run --rm -v "$PWD:/work" -w /work stackrox/kube-linter:latest lint k8s/ucu
```

Los archivos de `reports/` son evidencia histórica, no resultados del despliegue actual. Para comparar ejecuciones, fijá las versiones de los analizadores.

## Kyverno y Falco: POC local

Ejecutá solamente contra Minikube, nunca con el kubeconfig de UCU:

```bash
unset KUBECONFIG
minikube start --driver=docker --kubernetes-version=v1.35.0
kubectl config use-context minikube
helm install kyverno kyverno --repo https://kyverno.github.io/kyverno/ --version 3.9.2 -n kyverno --create-namespace --wait
helm install falco falco --repo https://falcosecurity.github.io/charts --version 9.2.1 -n kube-system --set driver.kind=modern_ebpf --wait
kubectl apply -f security/kyverno.yaml
kubectl wait --for=condition=Ready clusterpolicy --all --timeout=60s
kubectl apply --dry-run=server -f security/non-compliant.yaml
kubectl apply -f security/falco-test.yaml
kubectl wait --for=condition=Ready pod/falco-test --timeout=120s
kubectl exec falco-test -- sh -c 'cp /bin/busybox /tmp/busybox; /tmp/busybox id'
kubectl logs -n kube-system -l app.kubernetes.io/name=falco -c falco --since=10m | grep falco-test
```

Kyverno debe rechazar el pod por root, `latest` y falta de recursos. Falco debe emitir `Executing binary not part of base image`; detecta la actividad, no la bloquea. Esta POC pasó en Minikube el 09/11/2026. En UCU no se verificó esa protección: el dry-run no fue rechazado y no tenemos acceso a los logs del sensor.

## Verificación y limpieza

La prueba en UCU del 10/11/2026 verificó los cuatro deployments Ready, registro/login, favoritos autenticados, cambio blue/green, persistencia tras reemplazar un pod y Prometheus/Grafana saludables. TMDB rechazó el token configurado; falta corregirlo. El almacenamiento local-path no ofrece redundancia ante pérdida del nodo y la aplicación escribe archivos sin control de concurrencia.

```bash
# Prueba completa: crea un usuario, cambia slots y reemplaza el pod blue.
python3 scripts/verify-ucu.py
# Revisar la limpieza sin borrar recursos:
bash scripts/cleanup-ucu.sh --dry-run
# Borrar el despliegue, conservando PVC y Secrets:
bash scripts/cleanup-ucu.sh --yes
# Borrar también los datos y Secrets de la aplicación, sin recuperación:
bash scripts/cleanup-ucu.sh --delete-data
# Borrar únicamente el clúster local de la POC:
minikube delete
```

La limpieza UCU elimina recursos por nombre; no borra el namespace, los operadores ni recursos de otros equipos. No elimina imágenes de Docker Hub ni detiene túneles iniciados por separado.

## Dashboard de monitoreo

En Grafana abri **Dashboards > Movies - UCU** (`/d/movies-ucu`). Incluye peticiones por segundo (RPS), latencia promedio en segundos, CPU en cores y memoria en bytes por pod, y usuarios registrados como metrica de negocio. RPS/latencia usan una ventana de dos minutos y excluyen probes de Kubernetes. El total de usuarios usa el maximo entre slots para no duplicar los datos compartidos. CPU/memoria provienen de metrics-server mediante un exporter limitado al namespace; no son valores inventados ni solo memoria del proceso Node. El exporter usa la cuenta autorizada `grupolegionarios`. Genera trafico por al menos un minuto y usa los ultimos 15 minutos.
