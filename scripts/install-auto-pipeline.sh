#!/bin/bash
# Instala o auto-pipeline como systemd timer no host
# Executar como root: sudo bash scripts/install-auto-pipeline.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "→ Instalando /usr/local/bin/auto-pipeline.sh..."
cp "$SCRIPT_DIR/auto-pipeline.sh" /usr/local/bin/auto-pipeline.sh
chmod +x /usr/local/bin/auto-pipeline.sh

echo "→ Instalando units systemd..."
cp "$SCRIPT_DIR/auto-pipeline.service" /etc/systemd/system/auto-pipeline.service
cp "$SCRIPT_DIR/auto-pipeline.timer" /etc/systemd/system/auto-pipeline.timer

echo "→ Activando timer..."
systemctl daemon-reload
systemctl enable --now auto-pipeline.timer

echo "✓ auto-pipeline.timer activo. Status:"
systemctl status auto-pipeline.timer --no-pager
