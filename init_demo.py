#!/usr/bin/env python3
"""初始化本地《红女王》Demo，不调用真实供应商。"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"


def main() -> int:
    command = "npm.cmd" if os.name == "nt" else "npm"
    result = subprocess.run([command, "run", "init:demo"], cwd=BACKEND, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
