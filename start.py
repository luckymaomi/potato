"""Start the mini-video backend and frontend development servers."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def fail(message: str) -> int:
    print(f"[mini-video] {message}")
    if os.name == "nt":
        input("按回车退出...")
    return 1


def start_windows() -> None:
    new_console = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    subprocess.Popen(
        ["cmd.exe", "/k", "npm.cmd run migrate && npm.cmd run dev"],
        cwd=BACKEND,
        creationflags=new_console,
    )
    subprocess.Popen(
        ["cmd.exe", "/k", "npm.cmd run dev -- --host 127.0.0.1"],
        cwd=FRONTEND,
        creationflags=new_console,
    )


def start_posix() -> None:
    subprocess.run(["npm", "run", "migrate"], cwd=BACKEND, check=True)
    subprocess.Popen(["npm", "run", "dev"], cwd=BACKEND)
    subprocess.Popen(["npm", "run", "dev", "--", "--host", "127.0.0.1"], cwd=FRONTEND)


def main() -> int:
    if not (BACKEND / "node_modules").is_dir():
        return fail("backend dependencies are missing. Run: cd backend && npm.cmd install")
    if not (FRONTEND / "node_modules").is_dir():
        return fail("frontend dependencies are missing. Run: cd frontend && npm.cmd install")

    if os.name == "nt":
        start_windows()
    else:
        start_posix()

    print("[mini-video] Backend: http://localhost:5679")
    print("[mini-video] Frontend: http://localhost:3012")
    return 0


if __name__ == "__main__":
    sys.exit(main())
