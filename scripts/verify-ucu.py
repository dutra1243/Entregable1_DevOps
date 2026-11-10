"""Live UCU smoke test. Creates one uniquely named test user; leaves blue active."""
import json, os, secrets, subprocess, time, urllib.request, shutil
from pathlib import Path
k = shutil.which('kubectl') or str(next((Path.home()/'.minikube/cache').glob('windows/amd64/*/kubectl.exe')))
os.environ.setdefault('KUBECONFIG', str(Path('grupolegionarios.yaml').resolve()))
base=[k,'-n','obligatorio-grupolegionarios']
def cmd(*args):
 return subprocess.check_output(base+list(args),text=True)
def forward(svc,local,remote):
 p=subprocess.Popen(base+['port-forward','svc/'+svc,f'{local}:{remote}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 return p
def req(port,path,data=None,token=None):
 headers={}
 if data is not None: headers['Content-Type']='application/json'
 if token: headers['Authorization']='Bearer '+token
 r=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
 with urllib.request.urlopen(r,timeout=20) as res:return res.read().decode()
def wait(port,path):
 for _ in range(45):
  try:return req(port,path)
  except Exception:time.sleep(1)
 raise RuntimeError('port-forward or endpoint did not become ready')
procs=[]
try:
 for svc,local,remote in [('movies',13000,3000),('prometheus',19090,9090),('grafana',13001,3000)]:procs.append(forward(svc,local,remote))
 assert 'blue' in wait(13000,'/')
 assert 'process_' in req(13000,'/metrics')
 user={'email':f'ucu-smoke-{secrets.token_hex(5)}@example.com','password':secrets.token_urlsafe(24),'firstName':'UCU','lastName':'Smoke'}
 req(13000,'/api/auth/register',user)
 token=json.loads(req(13000,'/api/auth/login',user))['token']
 req(13000,'/api/users/favorites',token=token)
 print('PASS: blue, metrics, registration, login, authenticated favorites')
 # Service port-forward pins one pod: restart it after switching.
 cmd('patch','service','movies','--type=merge','-p',json.dumps({'spec':{'selector':{'slot':'green'}}}))
 procs[0].terminate();procs[0].wait();procs[0]=forward('movies',13000,3000)
 assert 'green' in wait(13000,'/')
 req(13000,'/api/auth/login',user)
 req(13000,'/api/users/favorites',token=token)
 print('PASS: green switch, shared data and JWT')
 cmd('rollout','restart','deployment/movies-blue')
 cmd('rollout','status','deployment/movies-blue','--timeout=180s')
 cmd('patch','service','movies','--type=merge','-p',json.dumps({'spec':{'selector':{'slot':'blue'}}}))
 procs[0].terminate();procs[0].wait();procs[0]=forward('movies',13000,3000)
 assert 'blue' in wait(13000,'/')
 req(13000,'/api/auth/login',user)
 print('PASS: blue restored, persistent data after pod replacement')
 wait(19090,'/-/ready');wait(13001,'/api/health')
 for _ in range(15):
  targets=json.loads(req(19090,'/api/v1/targets'))['data']['activeTargets']
  if any(t['health']=='up' for t in targets):break
  time.sleep(2)
 assert any(t['health']=='up' for t in targets)
 print('PASS: Prometheus target UP and Grafana healthy')
finally:
 for p in procs:p.terminate();p.wait()
 ready=cmd('get','deployment/movies-blue','-o','jsonpath={.status.readyReplicas}').strip()
 if ready and int(ready)>0:
  cmd('patch','service','movies','--type=merge','-p',json.dumps({'spec':{'selector':{'slot':'blue'}}}))
