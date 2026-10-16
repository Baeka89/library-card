#!/usr/bin/env python3
"""Geprüftes Einzeldatei-Update mit fortsetzbarer GitHub-Veröffentlichung."""
from __future__ import annotations


import argparse


import base64


from contextlib import contextmanager


import hashlib


import importlib.util


import io


import json


import os


from pathlib import Path, PurePosixPath


import re


import shutil


import subprocess


import sys


import tempfile


import zipfile


REPO = 'Baeka89/library-card'
BASE = 'eadf38532c6680805e2efeec6163e85a641b8b09'
VERSION = '1.1.0'
TAG = 'v' + VERSION
MARKER = 'reviewed-release-' + TAG + '.json'
KNOWN_PREPARED_HASHES = {}
DIGEST = ''
PAYLOAD = ''

class UpdateError(RuntimeError):
    pass


def command(args, root=None, allow_failure=False):
    result = subprocess.run([str(arg) for arg in args], cwd=root, text=True,
        encoding='utf-8', capture_output=True, env=os.environ | {'GH_HOST':'github.com','PYTHONUTF8':'1'})
    if result.returncode and not allow_failure:
        raise UpdateError(f'{args[0]} {args[1]}:\n{result.stderr or result.stdout}')
    return result


def run(args, root=None):
    return command(args, root).stdout.strip()


def api(endpoint, *, missing=False, data=None):
    args = ['gh','api','--hostname','github.com',endpoint]
    method = 'GET' if data is None else 'POST' if endpoint.endswith('/releases') else 'PATCH'
    if data is None:
        response = command(args, allow_failure=True)
    else:
        with tempfile.TemporaryDirectory(prefix='library-card-api-') as directory:
            body = Path(directory)/'body.json'; body.write_text(json.dumps(data),encoding='utf-8')
            response = command([*args,'--method',method,'--input',body],allow_failure=True)
    if response.returncode:
        if missing and 'HTTP 404' in response.stderr:
            return None
        raise UpdateError(f'GitHub {method} {endpoint}: '+(response.stderr or response.stdout or 'Anfrage fehlgeschlagen.'))
    return json.loads(response.stdout)


def files():
    raw = base64.b64decode(PAYLOAD,validate=True)
    if hashlib.sha256(raw).hexdigest() != DIGEST:
        raise UpdateError('Beschädigtes Veröffentlichungspaket.')
    result = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        if bundle.testzip(): raise UpdateError('Beschädigtes ZIP.')
        for info in bundle.infolist():
            path = PurePosixPath(info.filename)
            if path.is_absolute() or len(path.parts)<2 or path.parts[0]!='library-card' or any(part in {'..','.git','.publication','.venv','dist','.storage'} for part in path.parts) or '\\' in info.filename:
                raise UpdateError('Ungültiger Paketpfad.')
            name = PurePosixPath(*path.parts[1:]).as_posix()
            if name in result or info.is_dir() or (info.external_attr >> 16) & 0o170000 not in (0,0o100000):
                raise UpdateError('Doppelter oder ungültiger Paketpfad.')
            result[name] = bundle.read(info)
    for name in ['package.json','custom_components/card_library/manifest.json']:
        if json.loads(result[name])['version']!=VERSION:raise UpdateError('Inkonsistente Paketversion.')
    return result


def assert_paths(root, payload):
    for name in payload:
        path = root/name
        for parent in [path,*path.parents]:
            if parent==root.parent:break
            if parent.is_symlink():raise UpdateError(f'Symlink wird nicht verändert: {name}')
        if path.exists() and not path.is_file():raise UpdateError(f'Kein Dateiziel: {name}')


def check_changes(root, payload):
    changed=set()
    for args in [['git','diff','--name-only','-z'],['git','diff','--cached','--name-only','-z'],['git','ls-files','--others','--exclude-standard','-z']]:
        changed.update(filter(None,run(args,root).split('\0')))
    for name in changed:
        path=root/name
        if name not in payload or not path.is_file() or path.is_symlink() or path.read_bytes()!=payload[name]:
            raise UpdateError(f'Andere lokale Änderung: {name}. Bitte zuerst sichern oder committen.')


def matches_prepared(root):
    tracked=set(filter(None,run(['git','ls-files','-z'],root).split('\0')))
    return any(tracked==known.keys() and all((root/name).is_file() and not (root/name).is_symlink() and hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in known.items()) for known in KNOWN_PREPARED_HASHES.values())


def is_payload_commit(root, head, payload):
    tracked=set(filter(None,run(['git','ls-files','-z'],root).split('\0')))
    if tracked!=payload.keys():return False
    # Compare committed bytes, not partially prepared working-tree files.
    for name,data in payload.items():
        result=subprocess.run(['git','show',head+':'+name],cwd=root,capture_output=True)
        if result.returncode or result.stdout!=data:return False
    return True


def local_plan(root, payload):
    head=run(['git','rev-parse','HEAD'],root)
    marker=root/'.publication'/MARKER
    if marker.is_symlink():raise UpdateError('Veröffentlichungsmarker darf kein Symlink sein.')
    if marker.exists():
        state=json.loads(marker.read_text(encoding='utf-8'))
        base=state.get('base')
        if state.get('digest')!=DIGEST or not isinstance(base,str) or not re.fullmatch('[0-9a-f]{40}',base):
            raise UpdateError('Andere oder beschädigte Veröffentlichungsvorbereitung.')
        run(['git','merge-base','--is-ancestor',base,head],root)
        for name in filter(None,run(['git','diff','--name-only','-z',base,head],root).split('\0')):
            if name not in payload or not (root/name).is_file() or (root/name).read_bytes()!=payload[name]:
                raise UpdateError(f'Commit außerhalb dieses Updates: {name}')
        return head,base
    if head==BASE:return head,head
    if matches_prepared(root):
        ancestor=command(['git','merge-base','--is-ancestor',BASE,head],root,True)
        return head,BASE if ancestor.returncode==0 else head
    if is_payload_commit(root,head,payload):return head,head
    raise UpdateError('Unbekannter Projektstand. Kein automatisches Überschreiben.')


def assert_identity(user):
    current=api('user')
    if current.get('id')!=user.get('id') or current.get('login','').lower()!='baeka89':
        raise UpdateError('GitHub-Konto gewechselt. Bitte mit Baeka89 anmelden.')


def assert_remotes(root):
    expected=('https://github.com/'+REPO+'.git').lower()
    for args in [['git','remote','get-url','origin'],['git','remote','get-url','--push','origin']]:
        if run(args,root).lower()!=expected:raise UpdateError('Unerwarteter Quell- oder Push-Remote.')


def positive_id(value, kind):
    if isinstance(value,bool) or not isinstance(value,int) or value<=0:
        raise UpdateError('Ungültige GitHub-ID: '+kind)
    return value


def validate_release(release, identifier=None):
    if not isinstance(release,dict) or release.get('tag_name')!=TAG:
        raise UpdateError('GitHub lieferte ein Release für einen anderen Tag.')
    actual=positive_id(release.get('id'),'Release')
    if identifier is not None and actual!=identifier:
        raise UpdateError('Die Release-ID wurde zwischenzeitlich geändert.')
    return actual


def find_release():
    # The tag endpoint is documented for published releases. An interrupted run
    # may leave a draft visible only in the authenticated release list/by ID.
    release=api(f'repos/{REPO}/releases/tags/{TAG}',missing=True)
    if release is not None:
        validate_release(release)
        return release
    matches=[];page=1
    while True:
        releases=api(f'repos/{REPO}/releases?per_page=100&page={page}')
        if not isinstance(releases,list) or any(not isinstance(item,dict) for item in releases):
            raise UpdateError('Ungültige GitHub-Release-Liste.')
        matches.extend(item for item in releases if item.get('tag_name')==TAG)
        if len(matches)>1:raise UpdateError('Mehrere Releases für denselben Tag gefunden. Kein automatisches Überschreiben.')
        if len(releases)<100:break
        page+=1
    if matches:validate_release(matches[0]);return matches[0]
    return None


def release_assets(identifier):
    result={};page=1
    while True:
        assets=api(f'repos/{REPO}/releases/{identifier}/assets?per_page=100&page={page}')
        if not isinstance(assets,list):raise UpdateError('Ungültige Release-Dateiliste.')
        for asset in assets:
            if not isinstance(asset,dict) or not isinstance(asset.get('name'),str):raise UpdateError('Ungültige Release-Datei.')
            if asset['name'] in result:raise UpdateError('Doppelte Release-Datei: '+asset['name'])
            result[asset['name']]=asset
        if len(assets)<100:return result
        page+=1


def upload_asset(identifier, path):
    from urllib.parse import quote
    # gh applies its configured GitHub credentials; no token is read or stored.
    endpoint=f'https://uploads.github.com/repos/{REPO}/releases/{identifier}/assets?name='+quote(path.name,safe='')
    run(['gh','api','--hostname','github.com',endpoint,'--method','POST','--header','Content-Type: application/octet-stream','--input',path])


def download_asset(identifier, path):
    endpoint=f'repos/{REPO}/releases/assets/{identifier}'
    args=['gh','api','--hostname','github.com',endpoint,'--header','Accept: application/octet-stream']
    with path.open('wb') as target:
        response=subprocess.run(args,stdout=target,stderr=subprocess.PIPE,
            env=os.environ | {'GH_HOST':'github.com','PYTHONUTF8':'1'})
    if response.returncode:
        raise UpdateError(f'GitHub GET {endpoint}: '+response.stderr.decode('utf-8',errors='replace'))


def target_commit():
    value=api(f'repos/{REPO}/git/ref/tags/{TAG}',missing=True)
    if value is None:return None
    obj=value['object']
    for _ in range(10):
        if obj['type']=='commit':return obj['sha']
        if obj['type']!='tag':break
        obj=api(f'repos/{REPO}/git/tags/{obj["sha"]}')['object']
    raise UpdateError('Ungültiger Ziel-Tag.')


def check_target(root, head, payload):
    tagged=target_commit()
    local=command(['git','rev-parse','--verify',TAG+'^{commit}'],root,True)
    local_sha=local.stdout.strip() if local.returncode==0 else None
    release=find_release()
    if tagged or local_sha or release:
        if not is_payload_commit(root,head,payload) or tagged not in (None,head) or local_sha not in (None,head):
            raise UpdateError(f'{TAG} ist bereits für anderen Code vorgesehen/veröffentlicht. Kein Überschreiben.')
        if release and (release.get('prerelease') or not tagged):
            raise UpdateError('Vorhandenes Release ist nicht der passende stabile Zielstand.')
    return release


def atomic_write(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as handle:
            temporary=Path(handle.name);handle.write(data);handle.flush();os.fsync(handle.fileno())
        os.chmod(temporary,path.stat().st_mode & 0o777 if path.is_file() else 0o644)
        os.replace(temporary,path)
    finally:
        if temporary is not None:temporary.unlink(missing_ok=True)


def checkpoint(root, base, **extra):
    atomic_write(root/'.publication'/MARKER,json.dumps({'base':base,'digest':DIGEST,'version':VERSION,**extra},indent=2).encode())


def apply_files(root, payload):
    assert_paths(root,payload)
    for name,data in payload.items():
        path=root/name
        if not path.is_file() or path.read_bytes()!=data:atomic_write(path,data)


def load_publisher(root):
    spec=importlib.util.spec_from_file_location('reviewed_library_publisher',root/'publish.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def prepare_venv(root):
    environment=root/'.venv'
    if environment.is_symlink():raise UpdateError('.venv darf kein Symlink sein.')
    python=environment/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    if python.is_file():
        version=command([python,'-c','import sys;print(sys.version_info.major,sys.version_info.minor)'],root,True)
        if version.returncode==0 and tuple(map(int,version.stdout.split()))>=(3,12) and command([python,'-m','pip','--version'],root,True).returncode==0:return
    result=command([sys.executable,'-m','venv',environment],root,True)
    if result.returncode:
        package=f'python{sys.version_info.major}.{sys.version_info.minor}-venv'
        raise UpdateError(f'Testumgebung konnte nicht eingerichtet werden. Auf Ubuntu das passende Paket installieren: sudo apt install {package}\nDanach dasselbe Skript erneut starten.\n'+(result.stderr or result.stdout))


@contextmanager
def project_lock(root):
    path=root/'.publication'/('publish-'+TAG+'.lock');path.parent.mkdir(exist_ok=True)
    if path.is_symlink():raise UpdateError('Ungültige Sperrdatei.')
    with path.open('a+b') as handle:
        try:
            if os.name=='posix':
                import fcntl
                fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            else:
                import msvcrt
                if handle.tell()==0:handle.write(b'0');handle.flush()
                handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
        except OSError as error:raise UpdateError('Für dieses Projekt läuft bereits eine Veröffentlichung.') from error
        yield


def verify_asset(root, asset, name):
    local=root/'dist'/name
    if asset.get('state')!='uploaded' or asset.get('size')!=local.stat().st_size:
        raise UpdateError('Unvollständige vorhandene Release-Datei: '+name)
    digest='sha256:'+hashlib.sha256(local.read_bytes()).hexdigest()
    if asset.get('digest'):
        if asset['digest']!=digest:raise UpdateError('Abweichende Release-Datei: '+name)
    else:
        identifier=positive_id(asset.get('id'),'Release-Datei')
        with tempfile.TemporaryDirectory(prefix='library-card-asset-') as directory:
            downloaded=Path(directory)/name
            download_asset(identifier,downloaded)
            if hashlib.sha256(downloaded.read_bytes()).hexdigest()!=digest[7:]:
                raise UpdateError('Abweichende Release-Datei: '+name)


def publish_release(root, sha, user):
    assert_identity(user);assert_remotes(root)
    remote=target_commit()
    if remote not in (None,sha):raise UpdateError('Ziel-Tag wurde inzwischen geändert.')
    if remote is None:
        local=command(['git','rev-parse','--verify',TAG+'^{commit}'],root,True)
        if local.returncode:run(['git','tag','-a',TAG,'-m',TAG,sha],root)
        elif local.stdout.strip()!=sha:raise UpdateError('Lokaler Tag zeigt auf anderen Code.')
        run(['git','push','origin',TAG],root)
    if target_commit()!=sha:raise UpdateError('GitHub-Tag entspricht nicht dem geprüften Commit.')
    release=find_release()
    if release is None:
        release=api(f'repos/{REPO}/releases',data={'tag_name':TAG,'target_commitish':sha,'name':TAG+' – Vorhandene Button Cards übernehmen','body':(root/'RELEASE-NOTES.md').read_text(encoding='utf-8'),'draft':True,'prerelease':False})
    identifier=validate_release(release)
    expected_body=(root/'RELEASE-NOTES.md').read_text(encoding='utf-8')
    if 'body' in release and release['body']!=expected_body:raise UpdateError('Der vorhandene Release-Text weicht vom geprüften Changelog ab. Kein automatisches Überschreiben.')
    if release.get('prerelease'):raise UpdateError('Vorhandenes Release ist eine Vorabversion.')
    print(f'Release {TAG}: ID {identifier} ('+('Entwurf' if release.get('draft') else 'veröffentlicht')+').',flush=True)
    names=[f'library-card-{TAG}.zip','SHA256SUMS.txt']
    assets=release_assets(identifier)
    for name in names:
        if name in assets:verify_asset(root,assets[name],name)
    for name in names:
        if name not in assets:
            assert_identity(user)
            upload_asset(identifier,root/'dist'/name)
    complete=api(f'repos/{REPO}/releases/{identifier}')
    validate_release(complete,identifier)
    assets=release_assets(identifier)
    for name in names:
        if name not in assets:raise UpdateError('Release-Datei fehlt nach Upload: '+name)
        verify_asset(root,assets[name],name)
    if target_commit()!=sha:raise UpdateError('Release-Tag wurde inzwischen geändert.')
    assert_identity(user)
    if complete.get('draft'):
        complete=api(f'repos/{REPO}/releases/{identifier}',data={'draft':False,'prerelease':False,'make_latest':'true'})
    validate_release(complete,identifier)
    if complete.get('draft') or complete.get('prerelease'):raise UpdateError('Das Release ist nicht öffentlich und stabil.')
    if target_commit()!=sha:raise UpdateError('Release-Tag wurde nach Veröffentlichung geändert.')
    checked=api(f'repos/{REPO}/releases/{identifier}')
    validate_release(checked,identifier)
    if checked.get('draft') or checked.get('prerelease') or ('body' in checked and checked['body']!=expected_body):raise UpdateError('Release-Nachprüfung fehlgeschlagen.')
    final_assets=release_assets(identifier)
    for name in names:
        if name not in final_assets:raise UpdateError('Release-Datei fehlt bei der Nachprüfung: '+name)
        verify_asset(root,final_assets[name],name)
    return checked


def preserve_release_outputs(root):
    output = root / 'dist'
    if output.is_symlink():
        raise UpdateError('dist darf kein Symlink sein.')
    checksums = output / 'SHA256SUMS.txt'
    if checksums.exists():
        if checksums.is_symlink() or not checksums.is_file():
            raise UpdateError('Ungültige vorhandene Prüfsummendatei.')
        data = checksums.read_bytes()
        destination = output / ('SHA256SUMS-before-' + TAG + '-' + hashlib.sha256(data).hexdigest()[:16] + '.txt')
        if destination.exists():
            if destination.is_symlink() or destination.read_bytes() != data:
                raise UpdateError('Abweichende ältere Prüfsummensicherung.')
        else:
            with destination.open('xb') as handle:
                handle.write(data)
    archive = output / ('library-card-' + TAG + '.zip')
    if archive.exists():
        if archive.is_symlink() or not archive.is_file():
            raise UpdateError('Ungültiges vorhandenes Zielarchiv.')
        expected = {name: data for name, data in files().items() if name.startswith('custom_components/card_library/')}
        try:
            with zipfile.ZipFile(archive) as bundle:
                if bundle.testzip() or len(bundle.namelist()) != len(expected) or set(bundle.namelist()) != expected.keys() or any(bundle.read(name) != data for name, data in expected.items()):
                    raise UpdateError('Abweichendes vorhandenes Zielarchiv. Kein Überschreiben.')
        except zipfile.BadZipFile as error:
            raise UpdateError('Beschädigtes vorhandenes Zielarchiv. Kein Überschreiben.') from error



def validate_remote_versions():
    baseline = (1, 0, 0)
    page = 1
    while True:
        releases = api(f'repos/{REPO}/releases?per_page=100&page={page}')
        if not isinstance(releases, list):
            raise UpdateError('Ungültige GitHub-Versionsliste.')
        for release in releases:
            match = re.fullmatch(r'v([0-9]+)\.([0-9]+)\.([0-9]+)', release.get('tag_name', ''))
            if not release.get('draft') and match and tuple(map(int, match.groups())) > baseline and release['tag_name'] != TAG:
                raise UpdateError('Weitere Veröffentlichung gefunden: ' + release['tag_name'] + '. Projekt zuerst neu abgleichen.')
        if len(releases) < 100:
            return
        page += 1


def main(argv=None):
    default=Path.home()/'Projekte/Projekt Library-Card'
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-dir',type=Path,default=default)
    parser.add_argument('--timeout',type=int,default=1800)
    parser.add_argument('--check-only',action='store_true',help='Nur lesen und Voraussetzungen prüfen; nichts ändern/hochladen.')
    args=parser.parse_args(argv)
    try:
        if sys.version_info<(3,12):raise UpdateError('Python 3.12 oder neuer wird benötigt.')
        if args.timeout<=0:raise UpdateError('Zeitlimit muss positiv sein.')
        for tool in ['git','gh','node']:
            if not shutil.which(tool):raise UpdateError(tool+' fehlt.')
        node=run(['node','--version'])
        if not re.match(r'v?(\d+)\.',node) or int(re.match(r'v?(\d+)\.',node)[1])<22:raise UpdateError('Node.js 22 oder neuer wird benötigt.')
        payload=files();root=args.project_dir.expanduser().resolve()
        if not (root/'.git').exists():raise UpdateError(f'Git-Projekt fehlt: {root}')
        if Path(run(['git','rev-parse','--show-toplevel'],root)).resolve()!=root:raise UpdateError('Obersten Projektordner angeben.')
        if run(['git','branch','--show-current'],root)!='main':raise UpdateError('Bitte zum Zweig main wechseln.')
        if (root/'.publication').is_symlink():raise UpdateError('.publication darf kein Symlink sein.')
        assert_remotes(root);assert_paths(root,payload);check_changes(root,payload)
        run(['gh','auth','status','--hostname','github.com']);user=api('user')
        if user.get('login','').lower()!='baeka89':raise UpdateError('Bitte mit Baeka89 anmelden.')
        metadata=api(f'repos/{REPO}')
        validate_remote_versions()
        latest=api(f'repos/{REPO}/releases/latest',missing=True)
        if latest and latest.get('tag_name') not in ('v1.0.0',TAG):raise UpdateError('Das aktuelle öffentliche Release ist '+str(latest.get('tag_name'))+'. Version vor Veröffentlichung neu abgleichen.')
        if metadata.get('private') or metadata.get('archived') or metadata.get('default_branch')!='main':raise UpdateError('Repository muss öffentlich, aktiv und auf main eingestellt sein.')
        head,base=local_plan(root,payload)
        remote_head=api(f'repos/{REPO}/commits/main')['sha']
        if remote_head not in (base,head):raise UpdateError('GitHub enthält weitere Änderungen. Zuerst den Stand abgleichen.')
        check_target(root,head,payload)
        if args.check_only:
            print(f'Paket, Projektstand, GitHub und Werkzeuge OK. Ziel: {TAG}. Keine Änderungen vorgenommen.')
            return 0
        if (root/'.publication').is_symlink():raise UpdateError('.publication darf kein Symlink sein.')
        with project_lock(root):
            # Another process may have changed the project before the lock.
            check_changes(root,payload);head,base=local_plan(root,payload)
            checkpoint(root,base)
            run(['git','fetch','origin','main'],root)
            origin=run(['git','rev-parse','origin/main'],root)
            if origin not in (base,head):raise UpdateError('Remote-Branch wurde inzwischen geändert.')
            checkpoint(root,base)
            print(f'Geprüfte Aktualisierung für {TAG} übernehmen …',flush=True)
            preserve_release_outputs(root)
            apply_files(root,payload);prepare_venv(root)
            publisher=load_publisher(root);runner=publisher.Runner()
            publisher.run_local_checks(runner,root)
            check_changes(root,payload)
            if any((root/name).read_bytes()!=data for name,data in payload.items()):raise UpdateError('Quellen wurden während der Prüfungen verändert.')
            for key in ['user.name','user.email']:
                if command(['git','config',key],root,True).returncode:
                    run(['git','config',key,user.get('name') or user['login'] if key=='user.name' else f'{user["id"]}+{user["login"]}@users.noreply.github.com'],root)
            run(['git','add','--',*payload],root)
            if run(['git','diff','--cached','--name-only'],root):run(['git','commit','-m',f'Release {TAG}: existing Button Card conversion in the native editor'],root)
            sha=run(['git','rev-parse','HEAD'],root);checkpoint(root,base,commit=sha)
            assert_identity(user);assert_remotes(root);check_target(root,sha,payload)
            current_remote=api(f'repos/{REPO}/commits/main')['sha']
            if current_remote not in (origin,sha):raise UpdateError('GitHub-Branch wurde zwischenzeitlich geändert.')
            if not is_payload_commit(root,sha,payload):raise UpdateError('Commit entspricht nicht mehr dem geprüften Paket.')
            run(['git','push','origin',sha+':refs/heads/main'],root)
            print(f'Commit: https://github.com/{REPO}/commit/{sha}',flush=True)
            print('HACS, Hassfest und Tests für genau diesen Commit abwarten …',flush=True)
            checks={}
            for key,name in [('hacs','hacs.yml'),('hassfest','hassfest.yml'),('tests','tests.yml')]:
                checks[key]=publisher.wait_workflow(runner,REPO,name,sha,args.timeout)
                print(f'OK: {checks[key]["url"]}',flush=True)
            checkpoint(root,base,commit=sha,checks=checks)
            release=publish_release(root,sha,user)
            checkpoint(root,base,commit=sha,checks=checks,release=release['html_url'],complete=True)
            previous=root/'.publication/project.json'
            if previous.is_file():
                state=json.loads(previous.read_text(encoding='utf-8'))
                if state.get('project')=='library-card':
                    state.update(version=VERSION,commit=sha,published=True);atomic_write(previous,json.dumps(state,indent=2).encode())
            print('Fertig: '+release['html_url'])
            print('Projektordner: '+str(root))
            print('Vorhandener HACS-Antrag bleibt erhalten: https://github.com/hacs/default/pull/11851')
            print('Kein zweiter HACS-Antrag. Archive außerhalb des Projekts bleiben erhalten.')
            print(f'In HA: über HACS aktualisieren, HA neu starten, Ressource /card_library/card-library.js?v={VERSION} setzen und Browser neu laden.')
        return 0
    except (Exception,) as error:
        print('STOP: '+str(error),file=sys.stderr)
        print('Ursache beheben und dasselbe Skript erneut starten. Es werden keine Tags oder fremden Dateien überschrieben.',file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Abgebrochen. Dasselbe Skript setzt den geprüften Ablauf fort.',file=sys.stderr);return 130


if __name__=='__main__':raise SystemExit(main())

