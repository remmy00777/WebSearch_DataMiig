"""CLI wrapper: reads analysis payload JSON on stdin, writes result JSON to stdout.
Used by the Node app when ANALYSIS_SERVICE_URL is not set (local, non-Docker mode)."""
import json
import sys

from engine import analyze

if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(analyze(payload)))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(0)
