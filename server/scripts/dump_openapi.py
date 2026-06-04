#!/usr/bin/env python
"""Dump the FastAPI OpenAPI schema to a JSON file (headless, no server needed).

Used by the portal's `npm run gen:api` to generate TypeScript types from the
single source of truth — the backend schema. Run from the `server/` directory:

    python scripts/dump_openapi.py openapi.json
"""

import json
import os
import sys

# Allow running as `python scripts/dump_openapi.py` from server/ — ensure the
# server root (parent of this scripts/ dir) is importable for `main`.
_SERVER_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVER_ROOT not in sys.path:
    sys.path.insert(0, _SERVER_ROOT)


def main() -> int:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
    # Schema generation must not require real secrets/DB.
    os.environ.setdefault("SECRET_KEY", "x" * 32)

    from main import app  # imported late so env defaults apply first

    spec = app.openapi()
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=2)
    print(f"OpenAPI schema written to {out_path} ({len(spec['paths'])} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
