"""Render keel-reel.html to keel-reel.mp4: 1920x1080, 60 fps, motion blur, with the score.

    python3 -I demo/reel/music.py                     # score and cues.js first
    python3 -I demo/reel/render.py                    # full video
    python3 -I demo/reel/render.py --stills 2 7.6 12  # PNG stills at those seconds into build/
    python3 -I demo/reel/render.py --fps 30 --sub 1   # fast draft

Each output frame blends --sub subframes spread over a 180 degree shutter, so fast moves smear like a camera.
Frames are rendered by --workers headless pages in parallel, each seeking window.seek(t).
"""
import argparse
import concurrent.futures as cf
import pathlib
import shutil
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
HTML = HERE / "keel-reel.html"
BUILD = HERE / "build"
OUT = HERE / "keel-reel.mp4"


def chromium() -> str | None:
    cache = pathlib.Path.home() / "Library/Caches/ms-playwright"
    found = sorted(cache.glob("chromium_headless_shell-*/*/chrome-headless-shell"))
    return str(found[-1]) if found else None


def open_page(pw):
    browser = pw.chromium.launch(executable_path=chromium(), args=["--force-color-profile=srgb"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page.goto(HTML.as_uri() + "?render=1")
    page.wait_for_function("window.READY === true", timeout=20000)
    return browser, page


def work(args):
    times, outdir = args
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser, page = open_page(pw)
        for name, t in times:
            page.evaluate(f"seek({t})")
            page.screenshot(path=str(outdir / name), type="jpeg", quality=95)
        browser.close()
    return len(times)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="*", type=float)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--sub", type=int, default=2)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=30)
    a = ap.parse_args()
    BUILD.mkdir(exist_ok=True)

    if a.stills is not None:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser, page = open_page(pw)
            for t in a.stills:
                page.evaluate(f"seek({t})")
                page.screenshot(path=str(BUILD / f"still-{t:05.2f}.png"))
            browser.close()
        return

    frames = pathlib.Path(tempfile.mkdtemp(prefix="keel-reel-"))
    n_out = int(round((a.end - a.start) * a.fps))
    shutter = 0.5 / a.fps  # 180 degrees
    jobs = []
    for i in range(n_out):
        for k in range(a.sub):
            off = (k / a.sub - 0.5) * shutter if a.sub > 1 else 0
            jobs.append((f"{i * a.sub + k:06d}.jpg", max(0.0, a.start + i / a.fps + off)))
    chunks = [(jobs[w::a.workers], frames) for w in range(a.workers)]
    with cf.ProcessPoolExecutor(a.workers) as ex:
        done = sum(ex.map(work, chunks))
    print("rendered", done, "subframes")

    vf = f"tmix=frames={a.sub}:weights='{' '.join(['1'] * a.sub)}',select='not(mod(n\\,{a.sub}))',setpts=N/{a.fps}/TB" if a.sub > 1 else "null"
    music = BUILD / "music.wav"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(a.fps * a.sub), "-i", str(frames / "%06d.jpg")]
    if music.exists() and a.start == 0:
        cmd += ["-i", str(music)]
    cmd += ["-vf", vf, "-r", str(a.fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14", "-preset", "slow",
            "-profile:v", "high", "-movflags", "+faststart"]
    if music.exists() and a.start == 0:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += [str(OUT)]
    subprocess.run(cmd, check=True)
    shutil.rmtree(frames)
    print(OUT)


if __name__ == "__main__":
    main()
