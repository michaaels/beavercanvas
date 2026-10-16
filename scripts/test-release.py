"""Protect release version, provenance, checksum and non-overwrite contracts."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile
import hashlib

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.tag = 'v0.6.7-beta.1'
        self.commit = 'a' * 40
        self.metadata = {'version': '0.6.7.v20261015000000_aaaaaaaa', 'commit': self.commit,
                         'workingTreeDirty': False, 'sourceRelease': 21, 'installIU': release.IU,
                         'dbeaver': 'org.jkiss.dbeaver.core_26.2.2.jar', 'signed': False}
        self.archive = self.directory / f"beavercanvas-{self.metadata['version']}.zip"
        self.write_archive()
        for file in ('p2-test-result.json', 'published-upgrade-test-result.json'):
            (self.directory / file).write_text(json.dumps({'current': self.metadata['version'],
                                                         **dict.fromkeys(release.P2_FLAGS, True)}))

    def write_archive(self):
        with ZipFile(self.archive, 'w') as archive:
            archive.writestr('build-info.json', json.dumps(self.metadata))
            archive.writestr('content.jar', b'p2')
            archive.writestr('artifacts.jar', b'p2')
            archive.writestr('plugins/org.example.dbeaver.echarts_test.jar', b'plugin')
        self.checksum = Path(str(self.archive) + '.sha256')
        self.checksum.write_text(hashlib.sha256(self.archive.read_bytes()).hexdigest() + '  ' + self.archive.name + '\n')

    def test_version_tags(self):
        for tag, expected in [('v1.0.0', False), ('v0.6.7-beta.1', True), ('v1.0.0-alpha.3', True), ('v1.0.0-rc.2', True)]:
            self.assertEqual(release.version_tag(tag)[1], expected)
        for tag in ('main', 'v01.0.0', 'v1.0.0-beta', 'v1.0.0-beta.0', 'v1.0.0-beta.01', 'v1.0.0\n', 'v1.0.0;echo bad', 'v1.0.0+build'):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                release.version_tag(tag)

    def test_exact_archive_provenance(self):
        archive, checksum, evidence = release.verify_package(self.directory, self.tag, self.commit)
        self.assertEqual(archive, self.archive)
        self.assertEqual(checksum, self.checksum)
        self.assertTrue(evidence['prerelease'])
        for key, bad in [('commit', 'b' * 40), ('workingTreeDirty', True), ('sourceRelease', 26), ('installIU', 'other'), ('version', '0.6.8.wrong')]:
            original = self.metadata[key]
            self.metadata[key] = bad
            self.write_archive()
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.verify_package(self.directory, self.tag, self.commit)
            self.metadata[key] = original
        self.write_archive()

    def test_corrupt_archive_and_lifecycle_are_rejected(self):
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            release.verify_package(self.directory, self.tag, self.commit)
        self.write_archive()
        self.checksum.write_text(hashlib.sha256(self.archive.read_bytes()).hexdigest() + '  other.zip')
        with self.assertRaisesRegex(ValueError, 'filename'):
            release.verify_package(self.directory, self.tag, self.commit)
        self.write_archive()
        evidence_file = self.directory / 'published-upgrade-test-result.json'
        evidence = json.loads(evidence_file.read_text())
        for key in release.P2_FLAGS:
            evidence[key] = False
            evidence_file.write_text(json.dumps(evidence))
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'lifecycle'):
                release.verify_package(self.directory, self.tag, self.commit)
            evidence[key] = True

    def test_existing_release_or_draft_never_overwritten(self):
        for draft in (False, True):
            with patch.object(release, 'github_api', return_value={'draft': draft}), self.assertRaisesRegex(ValueError, 'already exists'):
                release.require_unused_release(self.tag)

    def mock_git(self, *arguments):
        if arguments[0] == 'rev-parse':
            return self.commit
        if 'MANIFEST.MF' in arguments[1]:
            return 'Bundle-Version: 0.6.7.qualifier\n'
        if 'feature.xml' in arguments[1]:
            return '<feature version="0.6.7.qualifier" />'
        return '<site><feature version="0.6.7.qualifier" /></site>'

    def test_plan_resolves_tag_and_checks_main_ancestry(self):
        env = {'RELEASE_TAG': self.tag, 'RELEASE_DRY_RUN': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
               'GITHUB_REF': 'refs/heads/main', 'GITHUB_OUTPUT': str(self.directory / 'outputs')}
        with patch.dict(os.environ, env), patch.object(release, 'git', side_effect=self.mock_git), \
                patch.object(release.subprocess, 'run') as run, patch.object(release, 'require_unused_release') as unused:
            release.plan()
            run.assert_called_once_with(['git', 'merge-base', '--is-ancestor', self.commit, 'origin/main'], cwd=release.ROOT, check=True)
            unused.assert_not_called()
        self.assertIn('dry_run=true', (self.directory / 'outputs').read_text())
        env.update(RELEASE_DRY_RUN='false', GITHUB_REF='refs/heads/feature')
        with patch.dict(os.environ, env), self.assertRaisesRegex(ValueError, 'from main'):
            release.plan()
        env.update(GITHUB_EVENT_NAME='push', GITHUB_REF='refs/tags/' + self.tag, GITHUB_SHA='b' * 40)
        with patch.dict(os.environ, env), patch.object(release, 'git', side_effect=self.mock_git), self.assertRaisesRegex(ValueError, 'Tag changed'):
            release.plan()

    def prepare_publication(self):
        env = {'RELEASE_TAG': self.tag, 'RELEASE_COMMIT': self.commit, 'GITHUB_REPOSITORY': 'michaaels/beavercanvas',
               'GITHUB_RUN_ID': '123', 'GITHUB_STEP_SUMMARY': str(self.directory / 'summary')}
        with patch.dict(os.environ, env):
            release.verify(self.directory)
        return env, self.directory / 'publish'

    def test_plan_rejects_version_mismatch_and_unmerged_commit(self):
        env = {'RELEASE_TAG': 'v0.6.8-beta.1', 'RELEASE_DRY_RUN': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
               'GITHUB_REF': 'refs/heads/main', 'GITHUB_OUTPUT': str(self.directory / 'outputs')}
        with patch.dict(os.environ, env), patch.object(release, 'git', side_effect=self.mock_git), \
                patch.object(release.subprocess, 'run'), self.assertRaisesRegex(ValueError, 'Bundle-Version'):
            release.plan()
        env['RELEASE_TAG'] = self.tag
        with patch.dict(os.environ, env), patch.object(release, 'git', side_effect=self.mock_git), \
                patch.object(release.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'git')), \
                self.assertRaises(subprocess.CalledProcessError):
            release.plan()

    def test_draft_upload_precedes_publication_and_does_not_clobber(self):
        env, directory = self.prepare_publication()
        with patch.dict(os.environ, env), patch.object(release, 'github_api', side_effect=[{'object': {'type': 'commit', 'sha': self.commit}}, None]), \
                patch.object(release.subprocess, 'run') as run:
            release.publish(directory)
        create, publish = [call.args[0] for call in run.call_args_list]
        self.assertIn('--draft', create)
        self.assertIn('--prerelease', create)
        self.assertIn('--verify-tag', create)
        self.assertNotIn('--clobber', create)
        self.assertIn('--draft=false', publish)

    def test_failed_upload_never_publishes_and_moved_tag_is_rejected(self):
        env, directory = self.prepare_publication()
        with patch.dict(os.environ, env), patch.object(release, 'github_api', side_effect=[{'object': {'type': 'commit', 'sha': self.commit}}, None]), \
                patch.object(release.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'gh')) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                release.publish(directory)
            self.assertEqual(run.call_count, 1)
        with patch.dict(os.environ, env), patch.object(release, 'github_api', return_value={'object': {'type': 'commit', 'sha': 'b' * 40}}), \
                patch.object(release.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Tag moved'):
                release.publish(directory)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
