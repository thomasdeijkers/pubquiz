#!/usr/bin/python3
"""Forced-command SSH deployment. Accepts one full Git SHA, deploys only app.py."""
import io
import os
import re
import subprocess
import tarfile
import time
import urllib.request
from pathlib import Path

revision = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if not re.fullmatch(r'[0-9a-f]{40}', revision):
    raise SystemExit('Verwacht één volledige Git-commit SHA.')
url = f'https://codeload.github.com/thomasdeijkers/pubquiz/tar.gz/{revision}'
with urllib.request.urlopen(url, timeout=60) as response:
    archive = response.read(15_000_000)
    # Source archive includes large quiz images; stream only the backend member below.
    remainder = response.read(100_000_000)
    if len(remainder) == 100_000_000:
        raise SystemExit('Bronarchief te groot.')
    archive += remainder
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
    candidates = [member for member in bundle.getmembers() if member.name.endswith('/backend/app.py') and member.isfile()]
    if len(candidates) != 1 or candidates[0].size > 250_000:
        raise SystemExit('Backendbestand ontbreekt of is ongeldig.')
    content = bundle.extractfile(candidates[0]).read()
compile(content, 'app.py', 'exec')
release = Path('/opt/pubquiz/releases') / revision
(release / 'backend').mkdir(parents=True, exist_ok=True)
(release / 'backend/app.py').write_bytes(content)
backup_dir = Path('/var/backups/pubquiz')
backup_dir.mkdir(mode=0o700, exist_ok=True)
backup = backup_dir / f'pre-deploy-{int(time.time())}.dump'
with backup.open('wb') as file:
    os.chmod(backup, 0o600)
    subprocess.run(['sudo','-u','pubquiz','pg_dump','-Fc','pubquiz'], stdout=file, check=True)
current = Path('/opt/pubquiz/current')
previous = current.resolve() if current.is_symlink() else None
temporary = Path('/opt/pubquiz/next')
if temporary.is_symlink():
    temporary.unlink()
temporary.symlink_to(release, target_is_directory=True)
temporary.replace(current)
subprocess.run(['systemctl','restart','pubquiz-api'], check=True)
healthy = False
for attempt in range(15):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8077/pubquiz-api/v1/health', timeout=3) as response:
            if response.status == 200:
                healthy = True
                break
    except OSError:
        time.sleep(1)
if not healthy:
    if previous:
        temporary.symlink_to(previous, target_is_directory=True)
        temporary.replace(current)
        subprocess.run(['systemctl','restart','pubquiz-api'], check=True)
    raise SystemExit('Nieuwe API is niet gezond; vorige versie teruggezet.')
print(f'Pubquiz API gepubliceerd: {revision}')
