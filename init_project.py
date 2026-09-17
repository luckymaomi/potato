#!/usr/bin/env python3
"""Create project foundation files from the distributed skill document."""
from __future__ import annotations

import argparse
import getpass
import re
from pathlib import Path

DEFAULT_DOCUMENT = Path.cwd() / "maomi-dev-skill.md"
TEMPLATE_PATTERN = re.compile(
    r"<!-- MAOMI_TEMPLATE:(?P<name>[^>]+) -->\r?\n"
    r"````(?:markdown|text)\r?\n(?P<body>.*?)\r?\n````\r?\n"
    r"<!-- /MAOMI_TEMPLATE -->",
    re.DOTALL,
)

def load_templates(document: Path) -> dict[str, str]:
    text = document.read_text(encoding="utf-8")
    templates = {
        match.group("name"): match.group("body")
        for match in TEMPLATE_PATTERN.finditer(text)
    }
    if not templates:
        raise ValueError(f"未在单文件中找到项目模板：{document}")
    return templates

def render_template(
    templates: dict[str, str],
    name: str,
    project_name: str,
    copyright_holder: str,
) -> str:
    if name not in templates:
        raise KeyError(f"单文件缺少模板：{name}")
    return templates[name].replace("项目名称", project_name).replace("{copyright}", copyright_holder)

def write_missing(destination: Path, content: str) -> str:
    if destination.exists():
        return f"skipped {destination}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")
    return f"created {destination}"

def main() -> int:
    parser = argparse.ArgumentParser(description="从猫咪的开发 Skill 单文件创建项目底座")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--skill-document", type=Path, default=DEFAULT_DOCUMENT)
    parser.add_argument(
        "--stage",
        choices=("foundation", "implementation", "verification", "closure"),
        required=True,
    )
    parser.add_argument("--project-name", default=None)
    parser.add_argument("--license", choices=("none", "mit"), default="none")
    parser.add_argument("--copyright", default=None)
    args = parser.parse_args()

    root = args.root.resolve()
    document = args.skill_document.resolve()
    templates = load_templates(document)
    name = args.project_name.strip() if args.project_name and args.project_name.strip() else root.name
    holder = (args.copyright or getpass.getuser()).strip()
    template_map = {
        "AGENTS.md": "AGENTS.md",
        "spec.md": "spec.md",
        "plan.example.md": "plan.example.md",
        "README.md": "README.md",
        "CONTRIBUTING.md": "CONTRIBUTING.md",
        "SECURITY.md": "SECURITY.md",
        ".gitignore": ".gitignore",
        ".agents/skills/plan/SKILL.md": ".agents/skills/plan/SKILL.md",
        ".agents/skills/project-dev/SKILL.md": ".agents/skills/project-dev/SKILL.md",
    }
    if args.license == "mit":
        template_map["LICENSE"] = "LICENSE"

    print(f"root: {root}")
    print(f"project: {name}")
    print(f"skill document: {document}")
    for destination, template_name in template_map.items():
        content = render_template(templates, template_name, name, holder)
        print(write_missing(root / destination, content))
    print(f"stage: {args.stage}")
    print("default branch: master")
    print("next: replace template placeholders with confirmed project facts")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
