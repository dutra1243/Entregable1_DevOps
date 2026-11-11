"""Verify Grafana provisioning and live metrics; generates 75 seconds of traffic."""
import base64,json,os,secrets,subprocess,time,urllib.parse,urllib.request
from utils.ucu_common import ROOT,NAMESPACE,config,tool
os.environ.setdefault('KUBECONFIG',str(ROOT/'grupolegionarios.yaml'))
processes=[]
def get(port,path,data=None,auth=None):
 headers={}
 if data is not None:headers['Content-Type']='application/json'
 if auth:headers['Authorization']=auth
 request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
 with urllib.request.urlopen(request,timeout=15) as response:return response.read().decode()
def wait(port,path):
 for _ in range(40):
  try:return get(port,path)
  except Exception:time.sleep(1)
 raise RuntimeError('Endpoint not ready')
try:
 for svc,port,remote in [('movies',13005,3000),('grafana',13006,3000),('prometheus',13007,9090)]:
  processes.append(subprocess.Popen([tool('kubectl'),'-n',NAMESPACE,'port-forward','svc/'+svc,f'{port}:{remote}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
 wait(13005,'/');wait(13006,'/api/health');wait(13007,'/-/ready')
 auth='Basic '+base64.b64encode(('admin:'+config()['GRAFANA_ADMIN_PASSWORD']).encode()).decode()
 dashboard=json.loads(get(13006,'/api/dashboards/uid/movies-ucu',auth=auth))['dashboard']
 assert len(dashboard['panels'])==5
 print('PASS: Grafana dashboard provisioned with all five panels',flush=True)
 user={'email':'dashboard-'+secrets.token_hex(6)+'@example.com','password':secrets.token_urlsafe(20),'firstName':'Dashboard','lastName':'Test'}
 get(13005,'/api/auth/register',user)
 token=json.loads(get(13005,'/api/auth/login',user))['token']
 for _ in range(75):
  get(13005,'/');get(13005,'/api/users/favorites',auth='Bearer '+token);time.sleep(1)
 for panel in dashboard['panels']:
  expr=panel['targets'][0]['expr']
  result=json.loads(get(13007,'/api/v1/query?'+urllib.parse.urlencode({'query':expr})))
  assert result['status']=='success' and result['data']['result'],panel['title']
  values=result['data']['result']
  assert all(v['value'][1] not in ['NaN','+Inf','-Inf'] for v in values),panel['title']
  print('PASS: '+panel['title']+' ('+str(len(values))+' time series)',flush=True)
 print('PASS: Grafana Prometheus datasource health: '+str(json.loads(get(13006,'/api/datasources/uid/prometheus/health',auth=auth))['status']),flush=True)
finally:
 for process in processes:process.terminate();process.wait()
