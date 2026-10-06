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
