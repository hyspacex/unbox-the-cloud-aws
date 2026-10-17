"""Render keel-intro.html to keel-intro.mp4 (1920x1080, 30 fps) by seeking every frame.

    python3 -I demo/intro/render.py                 # full video
    python3 -I demo/intro/render.py --stills 2 7 12  # PNG stills at those seconds, for checking
"""
import argparse
import pathlib
import shutil
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
HTML = HERE / "keel-intro.html"
OUT = HERE / "keel-intro.mp4"
FPS = 30


def chromium() -> str | None:
    """Newest Playwright headless shell already on disk, so no browser download is needed."""
    cache = pathlib.Path.home() / "Library/Caches/ms-playwright"
    found = sorted(cache.glob("chromium_headless_shell-*/*/chrome-headless-shell"))
    return str(found[-1]) if found else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="*", type=float)
    args = ap.parse_args()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=chromium())
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        page.goto(HTML.as_uri() + "?render=1")
        page.wait_for_function("typeof window.seek === 'function'")

        if args.stills is not None:
            for t in args.stills:
                page.evaluate(f"seek({t})")
                page.screenshot(path=str(HERE / f"still-{t:05.2f}.png"))
            browser.close()
            return

        duration = page.evaluate("window.DURATION")
        frames = pathlib.Path(tempfile.mkdtemp(prefix="keel-intro-"))
        for i in range(int(duration * FPS)):
            page.evaluate(f"seek({i / FPS})")
            page.screenshot(path=str(frames / f"{i:05d}.png"))
        browser.close()

    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(frames / "%05d.png"),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", str(OUT)],
        check=True,
    )
    shutil.rmtree(frames)
    print(OUT)


if __name__ == "__main__":
    main()
