"""Shared local UCU helpers. Never print secret values."""
import os, shutil, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = 'obligatorio-grupolegionarios'
def tool(name):
    found = shutil.which(name)
    if found: return found
    if name == 'kubectl':
        candidates = sorted((Path.home()/'.minikube/cache').glob('windows/amd64/*/kubectl.exe'))
        if candidates: return str(candidates[-1])
    if name == 'docker':
        p=Path.home()/'AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
        if p.exists(): return str(p)
    raise RuntimeError('Falta instalar '+name)
def config():
    values={}
    for filename in ['.env','.env.local']:
        p=ROOT/filename
        if p.exists():
            for line in p.read_text(encoding='utf-8-sig').splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    k,v=line.split('=',1); values[k.strip()]=v.strip().strip('"').strip("'")
    return values

def kube(*args, payload=None, private=False):
    env=os.environ.copy();env.setdefault('KUBECONFIG',str(ROOT/'grupolegionarios.yaml'))
    r=subprocess.run([tool('kubectl'),'-n',NAMESPACE,*args],input=payload,text=True,capture_output=True,env=env,cwd=ROOT)
    if r.returncode:
        if not private: print(r.stderr)
        raise RuntimeError('Fallo kubectl; revisa acceso, permisos o estado del recurso (credenciales ocultas).')
    return r.stdout
