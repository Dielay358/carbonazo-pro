@ECHO OFF
IF "%INSTALLER_UNATTENDED%" == "0" (
    REM conda tos must fail silently for offline installations.
    REM Otherwise, the installation will fail and/or users will
    REM be confused by error messages.
    "%PREFIX%\python.exe" -m conda tos accept --system > NUL 2>&1
)
