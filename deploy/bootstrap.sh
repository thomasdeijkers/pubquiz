#!/usr/bin/env bash
set -euo pipefail
stage=/root/pubquiz-setup
id pubquiz >/dev/null 2>&1 || useradd --system --home-dir /var/lib/pubquiz --shell /usr/sbin/nologin pubquiz
install -d -o pubquiz -g pubquiz -m 700 /var/lib/pubquiz
install -d -m 755 /opt/pubquiz/releases/bootstrap/backend /opt/pubquiz/verify/backend /opt/pubquiz/verify/tests
if ! sudo -u postgres psql -X -Atqc "SELECT 1 FROM pg_roles WHERE rolname='pubquiz'" | grep -qx 1; then
    sudo -u postgres createuser pubquiz
fi
if ! sudo -u postgres psql -X -Atqc "SELECT 1 FROM pg_database WHERE datname='pubquiz'" | grep -qx 1; then
    sudo -u postgres createdb -O pubquiz pubquiz
fi
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -c 'REVOKE ALL ON DATABASE pubquiz FROM PUBLIC; GRANT CONNECT ON DATABASE pubquiz TO pubquiz;'
install -m 644 "$stage/app.py" /opt/pubquiz/releases/bootstrap/backend/app.py
install -o pubquiz -g pubquiz -m 600 "$stage/seed.json" /var/lib/pubquiz/seed.json
sudo -u pubquiz python3 /opt/pubquiz/releases/bootstrap/backend/app.py --init /var/lib/pubquiz/seed.json
if [ ! -L /opt/pubquiz/current ]; then
    ln -s /opt/pubquiz/releases/bootstrap /opt/pubquiz/current
fi
install -m 644 "$stage/app.py" /opt/pubquiz/verify/backend/app.py
install -m 644 "$stage/test_backend.py" /opt/pubquiz/verify/tests/test_backend.py
if ! sudo -u postgres psql -X -Atqc "SELECT 1 FROM pg_database WHERE datname='pubquiz_test'" | grep -qx 1; then
    sudo -u postgres createdb -O pubquiz pubquiz_test
fi
sudo -u pubquiz env 'PUBQUIZ_DSN=dbname=pubquiz_test user=pubquiz host=/var/run/postgresql' python3 /opt/pubquiz/verify/tests/test_backend.py
sudo -u postgres dropdb pubquiz_test
install -m 644 "$stage/pubquiz-api.service" /etc/systemd/system/pubquiz-api.service
install -m 644 "$stage/nginx-pubquiz.conf" /etc/nginx/snippets/pubquiz-api.conf
python3 - <<'PY'
from pathlib import Path
import shutil,time
config=Path('/etc/nginx/sites-available/vps.opticore-insights.nl')
source=config.read_text()
line='    include /etc/nginx/snippets/pubquiz-api.conf;'
if line not in source:
    marker='    server_name vps.opticore-insights.nl;'
    assert source.count(marker)==2, 'Onverwachte nginx-indeling; wijziging gestopt.'
    backup=Path('/root/pubquiz-setup') / ('nginx-before-'+str(int(time.time())))
    shutil.copyfile(config,backup)
    config.write_text(source.replace(marker,marker+'\n'+line,1))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now pubquiz-api
systemctl reload nginx
curl --fail --silent --retry 10 --retry-all-errors --retry-delay 1 http://127.0.0.1:8077/pubquiz-api/v1/health
install -m 755 "$stage/deploy-backend.py" /usr/local/sbin/pubquiz-deploy
echo 'Pubquiz API en PostgreSQL gereed.'
