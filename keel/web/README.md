# Keel web app

This Next.js app serves two things:

- **Keel UI** at `/`: folders, the checks for each folder, rule details, run history and rule packs. It reads the runner's store (`keel.db`) and calls the runner API.
- **Fake Box** at `/box`, `/fakebox/api/2.0` and `/fakebox/upload/2.0`. This is the local stand-in for Box: a Box-shaped REST API and a minimal web UI, backed by `fakebox.db`.

Start it with `../dev.sh`. See [`../README.md`](../README.md) for the full picture.
