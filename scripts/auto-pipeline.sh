#!/bin/bash
# auto-pipeline.sh — Pipeline autónomo: atribui tasks de backlog não atribuídas à Iris (pm)
# Instalar em: /usr/local/bin/auto-pipeline.sh
# Executar via systemd timer a cada 60s

set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://172.18.0.3:3000}"

# 1. Buscar tasks em backlog
RESPONSE=$(curl -s "${DASHBOARD_URL}/api/tasks?status=backlog" 2>/dev/null || echo "[]")

if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "[]" ]; then
  exit 0
fi

# 2. Processar cada task sem parentId e sem assignedAgent
echo "$RESPONSE" | python3 -c "
import json, sys, urllib.request, urllib.error, os

data = json.load(sys.stdin)
tasks = data if isinstance(data, list) else data.get('tasks', [])
dashboard_url = os.environ.get('DASHBOARD_URL', 'http://172.18.0.3:3000')

for task in tasks:
    # Filtrar: sem parentId e sem assignedAgent
    if task.get('parentId') or task.get('assignedAgent'):
        continue

    task_id = task['id']
    title = task.get('title', 'sem título')

    # PATCH: status → in_progress, assignedAgent → pm
    patch_data = json.dumps({
        'status': 'in_progress',
        'assignedAgent': 'pm'
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            f'{dashboard_url}/api/tasks/{task_id}',
            data=patch_data,
            method='PATCH',
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f'WARN: falha ao actualizar task {task_id}: {e}', file=sys.stderr)
        continue

    # POST log
    log_data = json.dumps({
        'agentId': 'main',
        'level': 'info',
        'message': f'Pipeline auto-trigger: task \"{title}\" atribuída à Iris'
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            f'{dashboard_url}/api/logs',
            data=log_data,
            method='POST',
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f'WARN: falha ao logar task {task_id}: {e}', file=sys.stderr)

    # Notificar Atlas via openclaw
    try:
        import subprocess
        subprocess.run(
            ['openclaw', 'system', 'event', '--text', f'Nova task no pipeline: {title}', '--mode', 'now'],
            timeout=10,
            capture_output=True
        )
    except Exception as e:
        print(f'WARN: falha ao notificar openclaw para task {task_id}: {e}', file=sys.stderr)

    print(f'OK: task \"{title}\" ({task_id}) → in_progress / pm')
"
