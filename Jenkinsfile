pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds() }
  parameters {
    string(name: 'KUBECONFIG_CREDENTIAL_ID', defaultValue: '', description: 'Existing kubeconfig credential ID; blank uses agent Kubernetes identity')
    string(name: 'INGRESS_HOST', defaultValue: 'obligatorio-legionarios.reto-ucu.net')
    string(name: 'GRAFANA_INGRESS_HOST', defaultValue: 'grafana-obligatorio-legionarios.reto-ucu.net')
    choice(name: 'SWITCH_TO', choices: ['unchanged', 'blue', 'green'])
  }
  environment { NAMESPACE = 'obligatorio-grupolegionarios'; IMAGE = 'joaquinballara/movies' }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Prepare security reports') {
      steps {
        sh 'node -e "require(\'node:fs\').rmSync(\'security-results\', {recursive:true, force:true})"'
      }
    }
    stage('npm audit') {
      steps {
        script {
          def status = sh(script: 'node scripts/security-scan.cjs audit', returnStatus: true)
          if (status == 10) {
            unstable('npm audit findings: see archived security-results reports')
          } else if (status != 0) {
            error('npm audit failed to execute correctly; release stopped')
          }
        }
      }
    }
    stage('Semgrep') {
      steps {
        script {
          def status = sh(script: 'node scripts/security-scan.cjs semgrep', returnStatus: true)
          if (status == 10) {
            unstable('Semgrep findings: see archived security-results reports')
          } else if (status != 0) {
            error('Semgrep failed to execute correctly; release stopped')
          }
        }
      }
    }
    stage('Build and push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh '''set -eu
set +x
command -v docker
command -v kubectl
export DOCKER_CONFIG="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
TAG=$(git rev-parse HEAD)
docker build -t "$IMAGE:blue-$TAG" -t "$IMAGE:green-$TAG" .
docker push "$IMAGE:blue-$TAG"
docker push "$IMAGE:green-$TAG"
'''
        }
      }
    }
    stage('Deploy and verify') {
      steps {
        script {
          if (params.KUBECONFIG_CREDENTIAL_ID?.trim()) {
            withCredentials([file(credentialsId: params.KUBECONFIG_CREDENTIAL_ID, variable: 'KUBECONFIG')]) {
              sh 'bash scripts/deploy-ucu.sh'
            }
          } else {
            sh 'bash scripts/deploy-ucu.sh'
          }
        }
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'security-results/**', allowEmptyArchive: true
    }
  }
}
