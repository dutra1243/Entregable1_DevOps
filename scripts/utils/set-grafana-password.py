"""Apply the password in ignored .env.local to both Secret and Grafana database."""
import argparse, base64, json, os
if __package__:
    from .ucu_common import ROOT, NAMESPACE, config, kube
else:
    from ucu_common import ROOT, NAMESPACE, config, kube

def sync():
    password=config().get('GRAFANA_ADMIN_PASSWORD','')
    if len(password)<4 or password.startswith('REPLACE_'):
        raise RuntimeError('Configura GRAFANA_ADMIN_PASSWORD (4+ caracteres) en .env.local.')
    data=base64.b64encode(password.encode()).decode()
    # Update Secret without putting credentials in command arguments or console logs.
    resource={'apiVersion':'v1','kind':'Secret','metadata':{'name':'grafana-secrets','namespace':NAMESPACE},'type':'Opaque','data':{'password':data}}
    existing=kube('get','secret','grafana-secrets','--ignore-not-found','-o','name').strip()
    if existing:
        current=json.loads(kube('get','secret','grafana-secrets','-o','json',private=True))
        current.setdefault('data',{})['password']=data
        kube('replace','-f','-',payload=json.dumps(current),private=True)
    else:
        kube('create','-f','-',payload=json.dumps(resource),private=True)
    deployment=kube('get','deployment','grafana','--ignore-not-found','-o','name').strip()
    if deployment:
        kube('rollout','status','deployment/grafana','--timeout=600s')
        kube('exec','-i','deployment/grafana','--','grafana','cli','--homepath','/usr/share/grafana','--config','/etc/grafana/grafana.ini','admin','reset-admin-password','--password-from-stdin',payload=password+'\n',private=True)
        print('Grafana actualizado. Usuario: admin; password: la configurada en .env.local.')
    else:
        print('Secret preparado; Grafana usara la password al iniciar.')

if __name__=='__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    sync()
