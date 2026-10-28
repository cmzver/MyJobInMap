"""Generate CHANGELOG.md from git history (conventional commits).

The changelog is never edited by hand: commit messages are the source.
Commits are grouped by month and type; housekeeping types (chore, style,
test, docs, build, ci) and non-conventional subjects are skipped.

    server\\venv\\Scripts\\python.exe scripts\\changelog.py
"""

import re
import subprocess
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUTPUT = REPO / "CHANGELOG.md"

SECTIONS = {
    "feat": "Новое",
    "fix": "Исправления",
    "perf": "Производительность",
    "refactor": "Рефакторинг",
}
SUBJECT_RE = re.compile(r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]+)\))?!?:\s*(?P<text>.+)$")
PR_RE = re.compile(r"\s*\(#(\d+)\)$")
MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]


def read_commits() -> list[tuple[str, str, str]]:
    """(YYYY-MM, short hash, subject) for every non-merge commit, newest first."""
    out = subprocess.run(
        ["git", "log", "--no-merges", "--format=%ad%x09%h%x09%s", "--date=format:%Y-%m"],
        cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True,
    ).stdout
    return [tuple(line.split("\t", 2)) for line in out.splitlines() if line]


def render() -> str:
    months: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    seen: set[str] = set()
    for month, sha, subject in read_commits():
        match = SUBJECT_RE.match(subject)
        if not match or match["type"] not in SECTIONS:
            continue
        text = match["text"].strip()
        # The same change often lands twice: on a feature branch and squashed into main.
        key = PR_RE.sub("", text).lower()
        if key in seen:
            continue
        seen.add(key)
        scope = f"**{match['scope']}**: " if match["scope"] else ""
        pr = PR_RE.search(text)
        ref = f"#{pr[1]}" if pr else sha
        months[month][match["type"]].append(f"- {scope}{PR_RE.sub('', text)} ({ref})")

    lines = [
        "# Changelog",
        "",
        "Генерируется из истории коммитов: `server\\venv\\Scripts\\python.exe scripts\\changelog.py`.",
        "Руками не редактировать — источник правды это сообщения коммитов",
        "([conventional commits](https://www.conventionalcommits.org/ru/)).",
        "Планы — в [ROADMAP.md](ROADMAP.md).",
    ]
    for month in sorted(months, reverse=True):
        year, mon = month.split("-")
        lines += ["", f"## {MONTHS[int(mon) - 1]} {year}"]
        for type_, title in SECTIONS.items():
            entries = months[month].get(type_)
            if entries:
                lines += ["", f"### {title}", "", *entries]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    OUTPUT.write_text(render(), encoding="utf-8")
    print(f"Written {OUTPUT.relative_to(REPO)}")
