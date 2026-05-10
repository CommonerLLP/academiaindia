# DO NOT HAND-EDIT the generation logic — edit _org/sync_all.py instead.
import subprocess
import sys
from pathlib import Path

_ORG = Path(__file__).parents[2] / "_org"
_CENTRAL = _ORG / "sync_all.py"


def _read_body(path: Path) -> str:
    lines = path.read_text().splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.strip() == "---":
            return "".join(lines[i + 1:])
    return "".join(lines)


def _run_embedded_fallback() -> None:
    """Fallback: generate CLAUDE.md + AGENTS.md only. No GEMINI.md. No role templates."""
    repo = Path(__file__).parent.parent
    org = repo.parent / "_org"

    shared_path = org / "CONTEXT-shared.md"
    repo_path = repo / "CONTEXT.md"

    if not repo_path.exists():
        print(f"error: {repo_path} not found", file=sys.stderr)
        sys.exit(1)

    parts = []
    if shared_path.exists():
        parts.append(_read_body(shared_path))
    else:
        print(f"warning: {shared_path} not found — skipping shared context", file=sys.stderr)
    parts.append(_read_body(repo_path))
    body = "".join(parts)

    repo_name = repo.name
    claude_header = f"# CLAUDE.md — {repo_name} (fallback-generated; run make sync-agents when _org/ is available)\n\n"
    agents_header = f"# AGENTS.md — {repo_name} (fallback-generated; run make sync-agents when _org/ is available)\n\n"

    (repo / "CLAUDE.md").write_text(claude_header + body)
    print("wrote CLAUDE.md (fallback)")
    (repo / "AGENTS.md").write_text(agents_header + body)
    print("wrote AGENTS.md (fallback)")


if _CENTRAL.exists():
    subprocess.run([sys.executable, str(_CENTRAL), "--repo", "."], check=True)
else:
    print("warning: _org/sync_all.py not found — running embedded fallback", file=sys.stderr)
    _run_embedded_fallback()
