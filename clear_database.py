#!/usr/bin/env python3
"""删除仓库内 backend/data 目录，清空本地数据库和归档媒体。"""
from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_DIRECTORY = ROOT / "backend" / "data"


def main() -> int:
    data_directory = DATA_DIRECTORY.resolve()
    if not data_directory.exists():
        print(f"没有找到本地数据目录：{data_directory}")
        return 0

    shutil.rmtree(data_directory)
    print(f"已删除本地数据目录：{data_directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
