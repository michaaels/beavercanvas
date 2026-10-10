# BeaverCanvas 0.6.1 validation — 2026-10-10

Rebranding validation for `v0.6.1-beta.1`; this is not production certification.
Target: DBeaver Desktop Community 26.2.2, Java 21 bytecode.
The published 0.6.0 beta and previous releases are unchanged.

| Check | Result and scope |
| --- | --- |
| Java/API contracts | Passed on Windows and Ubuntu 24.04 WSL; document persistence, SQL companion ownership, query isolation/cancellation/deadlines, parameters and Browser navigation |
| Windows Edge | All six browser suites passed; 15 chart types / 30 Canvas-SVG renders, legends, widget SQL editing, eight-edge resizing, report reflow, preview/commit equality and exports |
| Linux Chromium / WebKit | Same browser suites passed in both engines, using the packaged local libraries |
| EML | Independently decoded MIME, recipients, Unicode, inline PNG/CID images and identical HTML attachment passed; bounded tables still respect configured page/height |
| Windows P2 from 0.5.0 | Installed baseline built from commit `55550a0c`, upgraded, uninstalled and reinstalled; exactly one bundle and unchanged JSON/SQL fixture hashes |
| Windows P2 from published 0.6.0 | Verified the actual release ZIP SHA-256 before install/upgrade/uninstall/reinstall; same legacy IU, new labels and unchanged fixture files |
| Linux P2 | Same candidate archive installed in an official Linux distribution; installed bundle and legacy content-type routing resolved |
| Installed icon decoding | SWT ImageLoader checks the eleven transparent PNG variants, including 150%/200% icons, against their intended dimensions |
| Native Linux | Isolated DBeaver workbench opened an existing-format report through the original view ID; SWT/WebKit displayed the new name, icon, chart and table; synthetic snapshots supplied by the harness, no SQL executed |
| Offline assets | SVG vocabulary namespace accepted; remote image, link and stylesheet URLs remain rejected; library/map hashes and notices verified |
| Artwork | Native vector sources and exported small/large PNGs reviewed on light and dark backgrounds |

Browser suites test the real frontend with fixture bridges. Registry/P2 checks
test installation and extension routing. The native Linux capture tests the
real SWT Browser and packaged resources; it does not certify driver behavior.
The existing 0.6.0 native Windows/SQLite/MariaDB evidence remains historical.
Native Windows rebranding at multiple display scales, macOS, a broad driver
matrix and real Outlook client rendering still require manual release review.

## Reproduce

Run `scripts/validate.ps1` or `scripts/validate.sh` against the pinned DBeaver
plugins, then the browser suites in `.github/workflows/p2-package.yml`.
`scripts/test-linux.sh` runs both Linux engines and the installed registry.
`scripts/test-p2-install.ps1 -PreviousRepositoryZip ...` uses fresh destinations
and writes a machine-readable lifecycle report. Use
`scripts/fetch-upgrade-release.ps1` for the checksum-pinned published baseline.

The local review installer is built from a clean detached checkout of the
rebranding commit. The published installer is built by GitHub Actions from the
final merged source commit and checked on both Windows and Linux. Its `build-info.json` records the exact source commit,
qualified version, compiler, DBeaver target and unsigned state. Rebuilds can have
different ZIP hashes because P2 metadata contains publication timestamps.
The release notes link the GitHub Actions run for the published artifact.
The table above also records the local checks, including the separate native
SWT/WebKit fixture test; CI does not replace manual mail-client certification.

## Test environment observations

Cancelling DBeaver's initial Product Configuration wizard exits the application;
the isolated workspace was configured with usage sharing and startup tips off.
An early forced termination of Xvfb while the exit confirmation was open caused
an AWT/X11 native JVM crash. The final native check confirms the exit dialog and
shuts DBeaver down normally. GTK scrollbar warnings were present in the native
test log. These observations do not establish a plugin defect and are not
silently counted as a complete SWT lifecycle certification.
