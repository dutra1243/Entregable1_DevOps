"""Build, publish and deploy UCU from the host (Windows or Linux)."""
import argparse, datetime, importlib.util, json, os, re, shutil, subprocess, tempfile
from pathlib import Path
from utils.ucu_common import ROOT, config, kube, tool

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-login',action='store_true',help='Use existing Docker login')
    args=parser.parse_args()
    values=config()
    if len(values.get('GRAFANA_ADMIN_PASSWORD',''))<4 or values.get('GRAFANA_ADMIN_PASSWORD','').startswith('REPLACE_'):
        raise RuntimeError('Primero configura GRAFANA_ADMIN_PASSWORD en .env.local (4+ caracteres).')
    image=os.environ.get('IMAGE','joaquinballara/movies')
    if not re.fullmatch(r'[a-z0-9][a-z0-9./_-]*',image): raise RuntimeError('IMAGE invalida')
    docker=tool('docker');tool('kubectl')
    def run(*cmd): subprocess.run(cmd,cwd=ROOT,check=True)
    kube('get','serviceaccount','grupolegionarios')
    run(docker,'info','--format','{{.ServerVersion}}')
    if not args.skip_login: run(docker,'login','-u',image.split('/')[0])
    sha=subprocess.check_output(['git','rev-parse','--short=12','HEAD'],cwd=ROOT,text=True).strip()
    # Timestamp distinguishes uncommitted local changes too.
    tag=sha+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
    run(docker,'build','--load','-t',image+':blue-'+tag,'-t',image+':green-'+tag,'.')
    run(docker,'push',image+':blue-'+tag);run(docker,'push',image+':green-'+tag)
    run(__import__('sys').executable,'scripts/utils/bootstrap-secrets.py')
    active=kube('get','service','movies','--ignore-not-found','-o','jsonpath={.spec.selector.slot}').strip() or 'blue'
    if active not in ['blue','green']: raise RuntimeError('Slot desconocido')
    with tempfile.TemporaryDirectory() as tmp:
        folder=Path(tmp)/'ucu';shutil.copytree(ROOT/'k8s/ucu',folder)
        with (folder/'kustomization.yaml').open('a',encoding='utf-8') as f:
            f.write('\npatches:\n- target:\n    kind: Service\n    name: movies\n  patch: |-\n    - op: replace\n      path: /spec/selector/slot\n      value: '+active+'\n')
        manifest=kube('kustomize',str(folder)).replace('movies/app:blue',image+':blue-'+tag).replace('movies/app:green',image+':green-'+tag)
        # Set desired password before first start; sync the initialized database afterward.
        sync_password()
        kube('apply','--dry-run=server','-f','-',payload=manifest)
        print(kube('apply','-f','-',payload=manifest))
    for service in ['prometheus','grafana']:
        kube('rollout','restart','deployment/'+service)
        print(kube('rollout','status','deployment/'+service,'--timeout=600s'))
    for name in ['movies-blue','movies-green','pod-metrics','prometheus','grafana']:
        print(kube('rollout','status','deployment/'+name,'--timeout=600s'))
    sync_password()
    for filename in ['ingress.yaml','grafana-ingress.yaml']:
        print(kube('apply','-f',str(ROOT/'k8s/ucu'/filename)))
    print('Despliegue completo. Slot activo: '+active+'. Imagen: '+image+':blue-'+tag)
    print('Acceso local: kubectl -n obligatorio-grupolegionarios port-forward svc/grafana 3001:3000')

def sync_password():
    spec=importlib.util.spec_from_file_location('utils.grafana_password',ROOT/'scripts/utils/set-grafana-password.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.sync()
if __name__=='__main__':main()
