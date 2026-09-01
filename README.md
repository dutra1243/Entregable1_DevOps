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
