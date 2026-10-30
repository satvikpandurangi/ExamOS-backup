# Source and binary distribution

The repository includes all Python agent modules (including the evidence outbox), backend modules, React teacher/student interfaces, six database migrations, pinned dependency lockfiles, environment examples, launchers, Windows build specification, tests and documentation.

The repository intentionally excludes live `.env` files, generated instructor credentials, DPAPI device credentials, databases and backups, webcam/screen media, runtime uploads, generated screenshots/test artifacts, virtual environments, installed dependencies, caches and build intermediates. Tests create isolated records and real PDF files when run; no personal database is committed.

## Model

`agent/models/yolox.onnx` is 35,858,002 bytes. It is below GitHub's individual-file limit and is included as a normal Git file, alongside its Apache-2.0 license and pinned upstream URL, commit and SHA-256 in `MODEL.json`. It is an upstream object detector, not a model trained on local student data. Git LFS is unnecessary for this single pinned weight; it also avoids requiring LFS quota or network downloads at runtime. `Prepare-Camera-Model.ps1` can restore the exact file and checks its hash.

## Windows application

`Student-Agent/ExamOS-Agent.exe` is approximately 138 MB, exceeding GitHub's regular Git file limit. It remains preserved locally and is excluded from Git rather than silently discarded. The launcher and complete reproducible build configuration are committed. Build it on Windows using `agent/Build-Agent.ps1` after creating `.venv` with Python 3.13 and installing `agent/requirements-lock.txt`.

The build checks PE32+ Windows x64 format and launches the actual packaged enrollment interface before publishing locally. A separate GitHub Release is the appropriate channel for the EXE; do not mistake a source checkout for a prebuilt distribution. Any binary release should identify its source commit, SHA-256 and actual test results, and include the applicable third-party notices/source obligations for the bundled Python, PyInstaller bootloader, OpenCV, YOLOX, PyAV/FFmpeg and other dependencies. No new open-source license is assigned to the ExamOS application by this repository preparation.

See `CURRENT-VERIFICATION.md` for the current build's observed results and incomplete checks. Existing historical verification documents may describe earlier builds.
