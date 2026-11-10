"""Create namespace secrets from local .env without printing values (Python 3)."""
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
kubectl = shutil.which('kubectl')
if not kubectl:
    candidates = list((Path.home() / '.minikube/cache').glob('windows/amd64/*/kubectl.exe'))
    if not candidates:
        raise SystemExit('Install kubectl first')
    kubectl = str(sorted(candidates)[-1])
env = os.environ.copy()
env.setdefault('KUBECONFIG', str(root / 'grupolegionarios.yaml'))
namespace = 'obligatorio-grupolegionarios'
values = {}
for line in (root / '.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
if not values.get('TMDB_API_KEY'):
    raise SystemExit('Set TMDB_API_KEY in local .env first')

def run(args, payload=None):
    result = subprocess.run([kubectl, '-n', namespace, *args, '--request-timeout=20s'],
                            input=payload, text=True, capture_output=True, env=env)
    if result.returncode:
        raise SystemExit('Kubernetes request failed; check connection and namespace permissions. No secrets printed.')
    return result.stdout

for name, data in [
    ('movies-secrets', {'TMDB_API_KEY': values['TMDB_API_KEY'],
                        'JWT_SECRET_KEY': values.get('JWT_SECRET_KEY') or secrets.token_urlsafe(48)}),
    ('grafana-secrets', {'password': secrets.token_urlsafe(32)})
]:
    if run(['get', 'secret', name, '--ignore-not-found', '-o', 'name']).strip():
        print(name + ': already exists; preserved')
        continue
    resource = {'apiVersion': 'v1', 'kind': 'Secret',
                'metadata': {'name': name, 'namespace': namespace},
                'type': 'Opaque', 'data': {k: base64.b64encode(v.encode()).decode() for k,v in data.items()}}
    run(['create', '-f', '-'], json.dumps(resource))
    print(name + ': created (values hidden)')
