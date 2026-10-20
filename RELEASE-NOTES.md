## BuilTopia Sound - sg0hann 1.5.0

- Replaces the custom Windows Script Host / PowerShell update scripts with electron-updater's standard NSIS update flow.
- Removes the custom execution-policy override and scripted update launcher.
- Downloads are verified against the release's SHA-512 update manifest. Automatic install and relaunch are preserved.
- Release publication requires a successful Microsoft Defender custom scan of the installer and unpacked app, and Windows installation/update tests.

This release is not a guarantee against all antivirus detections or SmartScreen reputation prompts. The application is currently unsigned. Report the exact detection name and file path if Defender still flags it.
