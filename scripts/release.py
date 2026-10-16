"""Release gates and publication of the exact P2 archive tested by CI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from zipfile import ZipFile
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent
IU = 'org.example.dbeaver.echarts.feature.feature.group'
P2_FLAGS = ('installed', 'upgraded', 'uninstalled', 'reinstalled', 'registry',
            'dashboardFilesPreserved', 'reportFilesPreserved')


def version_tag(tag):
    number = r'(?:0|[1-9][0-9]*)'
    match = re.fullmatch(rf'v({number}\.{number}\.{number})(?:-(alpha|beta|rc)\.([1-9][0-9]*))?', tag)
    if not match or len(tag) > 80:
        raise ValueError('Use a version tag such as v0.6.7-beta.1 or v1.0.0')
    return match[1], match[2] is not None


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT, text=True).strip()


def github_api(endpoint, optional=False):
    repository = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid repository name')
    request = urllib.request.Request(f'https://api.github.com/repos/{repository}/{endpoint}', headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'BeaverCanvas-release',
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if optional and error.code == 404:
            return None
        raise RuntimeError(f'GitHub API request failed: HTTP {error.code}') from None


def require_unused_release(tag):
    if github_api(f'releases/tags/{tag}', optional=True) is not None:
        raise ValueError('This release already exists; published assets and drafts are never overwritten')


def plan():
    tag = os.environ['RELEASE_TAG']
    base, prerelease = version_tag(tag)
    dry_run = os.environ.get('RELEASE_DRY_RUN', 'false') == 'true'
    event = os.environ['GITHUB_EVENT_NAME']
    ref = os.environ['GITHUB_REF']
    if event not in ('push', 'workflow_dispatch'):
        raise ValueError('Release requires a tag push or manual workflow dispatch')
    if event == 'push' and ref != 'refs/tags/' + tag:
        raise ValueError('Push must refer to the requested version tag')
    if event == 'workflow_dispatch' and not dry_run and ref != 'refs/heads/main':
        raise ValueError('Run manual publication from main; other branches only support dry runs')
    commit = git('rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected a complete source commit SHA')
    if event == 'push' and commit != os.environ['GITHUB_SHA']:
        raise ValueError('Tag changed after the workflow started')
    subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'origin/main'], cwd=ROOT, check=True)
    manifest = git('show', f'{commit}:plugins/org.example.dbeaver.echarts/META-INF/MANIFEST.MF')
    if not re.search(rf'^Bundle-Version: {re.escape(base)}\.qualifier\s*$', manifest, re.MULTILINE):
        raise ValueError('Tag version differs from the plugin Bundle-Version')
    for file, element in [('features/org.example.dbeaver.echarts.feature/feature.xml', '.'),
                          ('sites/org.example.dbeaver.echarts.site/category.xml', 'feature')]:
        source = ElementTree.fromstring(git('show', f'{commit}:{file}'))
        if source.find(element).get('version') != base + '.qualifier':
            raise ValueError('Tag version differs from feature/site version')
    if not dry_run:
        require_unused_release(tag)
    result = {'tag': tag, 'commit': commit, 'prerelease': str(prerelease).lower(), 'dry_run': str(dry_run).lower()}
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write(''.join(f'{key}={value}\n' for key, value in result.items()))
    print(json.dumps(result, indent=2))


def verify_package(directory, tag, commit):
    base, prerelease = version_tag(tag)
    archives = list(directory.glob('beavercanvas-*.zip'))
    if len(archives) != 1:
        raise ValueError('Expected exactly one installer ZIP')
    archive = archives[0]
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum = Path(str(archive) + '.sha256')
    if checksum.read_text(encoding='utf-8').split() != [digest, archive.name]:
        raise ValueError('Installer checksum or checksum filename differs')
    with ZipFile(archive) as repository:
        metadata = json.loads(repository.read('build-info.json'))
        if (metadata.get('commit') != commit or metadata.get('workingTreeDirty') is not False
                or metadata.get('sourceRelease') != 21 or metadata.get('installIU') != IU
                or not metadata.get('version', '').startswith(base + '.')):
            raise ValueError('Build provenance differs from the requested clean source/version')
        if archive.name != f"beavercanvas-{metadata['version']}.zip":
            raise ValueError('Archive filename differs from build version')
        for file in ('content.jar', 'artifacts.jar'):
            repository.getinfo(file)
        if not any(name.startswith('plugins/org.example.dbeaver.echarts_') and name.endswith('.jar') for name in repository.namelist()):
            raise ValueError('Archive has no BeaverCanvas plugin')
    evidence = {}
    for file in ('p2-test-result.json', 'published-upgrade-test-result.json'):
        result = json.loads((directory / file).read_text(encoding='utf-8-sig'))
        if result.get('current') != metadata['version'] or not all(result.get(key) is True for key in P2_FLAGS):
            raise ValueError('Missing or mismatched successful P2 lifecycle evidence: ' + file)
        evidence[file] = result
    return archive, checksum, {'tag': tag, 'prerelease': prerelease, 'archive': archive.name,
                              'sha256': digest, 'build': metadata, 'p2': evidence}


def verify(directory):
    tag, commit = os.environ['RELEASE_TAG'], os.environ['RELEASE_COMMIT']
    archive, checksum, evidence = verify_package(directory, tag, commit)
    publish = directory / 'publish'
    publish.mkdir()
    for file in (archive, checksum):
        shutil.copyfile(file, publish / file.name)
    for name, result in evidence['p2'].items():
        (publish / name).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    server = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}"
    evidence['workflow'] = server + '/actions/runs/' + os.environ['GITHUB_RUN_ID']
    (publish / 'release-validation.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    notes = f"""## BeaverCanvas {tag[1:]}

SQL Dashboards & Report Designer para DBeaver Desktop Community.

### Instalar o actualizar

1. Descarga **{archive.name}**, sin descomprimir.
2. En DBeaver: **Help → Install New Software → Add → Archive**.
3. Selecciona **BeaverCanvas Plugin for DBeaver Desktop**, instala y reinicia.

Se conservan los IDs del plugin, preferencias y archivos de dashboards/reportes.
El paquete no tiene firma digital. macOS y los clientes de correo aún no están certificados.

### Comprobaciones automáticas

Este es el mismo ZIP probado en Windows y Linux, sin recompilar para publicarlo.
Incluye SHA-256, procedencia del build y evidencia de instalación/actualización P2.
Las suites de navegador y registro no sustituyen la certificación completa de SWT y drivers JDBC.

- Commit: `{commit}`.
- Target: `{evidence['build']['dbeaver']}`.
- [Ejecución y pruebas]({evidence['workflow']}).
- [Cambios de esta versión]({server}/blob/{tag}/CHANGELOG.md).
- [Documentación y capturas]({server}/blob/{tag}/README.md).

Proyecto independiente, sin afiliación oficial con DBeaver ni Apache ECharts.
"""
    (publish / 'release-notes.md').write_text(notes, encoding='utf-8')
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
        summary.write(f'## Release verificado: {tag}\n\nArchivo: `{archive.name}`\n\nSHA-256: `{evidence["sha256"]}`\n\n{evidence["workflow"]}\n')
    print(json.dumps({'tag': tag, 'archive': archive.name, 'sha256': evidence['sha256']}, indent=2))


def publish(directory):
    tag, commit = os.environ['RELEASE_TAG'], os.environ['RELEASE_COMMIT']
    archive, checksum, evidence = verify_package(directory, tag, commit)
    validation = json.loads((directory / 'release-validation.json').read_text(encoding='utf-8'))
    if any(validation.get(key) != evidence[key] for key in ('tag', 'prerelease', 'archive', 'sha256', 'build', 'p2')):
        raise ValueError('Release verification record differs from the downloaded archive')
    target = github_api('git/ref/tags/' + tag)['object']
    for _ in range(8):
        if target['type'] == 'commit':
            break
        if target['type'] != 'tag':
            raise ValueError('Unsupported Git tag target')
        target = github_api('git/tags/' + target['sha'])['object']
    if target['type'] != 'commit' or target['sha'] != commit:
        raise ValueError('Tag moved since the build was selected')
    require_unused_release(tag)
    assets = [str(archive), str(checksum), str(directory / 'release-validation.json'),
              *(str(directory / file) for file in evidence['p2'])]
    arguments = ['gh', 'release', 'create', tag, '--repo', os.environ['GITHUB_REPOSITORY'],
                 '--verify-tag', '--draft', '--title', 'BeaverCanvas ' + tag[1:],
                 '--notes-file', str(directory / 'release-notes.md'), *assets]
    if evidence['prerelease']:
        arguments.append('--prerelease')
    subprocess.run(arguments, check=True)
    # Only make it visible once every attachment has uploaded successfully.
    subprocess.run(['gh', 'release', 'edit', tag, '--repo', os.environ['GITHUB_REPOSITORY'], '--draft=false'], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('plan', 'verify', 'publish'))
    parser.add_argument('directory', type=Path, nargs='?')
    args = parser.parse_args()
    if args.operation == 'plan':
        plan()
    elif args.directory is None:
        parser.error('verify and publish require the downloaded artifact directory')
    else:
        {'verify': verify, 'publish': publish}[args.operation](args.directory)
