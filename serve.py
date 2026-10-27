"""Serve the flashcard app on http://localhost:8000 and let it add new cards.

Usage (from the project folder):  python3 serve.py [port]
New cards are saved to words-user.js and get a French recording in audio/.
Only reachable from this computer.
"""
import json
import subprocess
import sys
import uuid
from datetime import date
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
import make_audio  # noqa: E402

MAX_FIELD = 200
MAX_BODY = 10_000


def clean(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError("Fields must be text.")
    value = " ".join(value.split())  # trims and turns newlines into spaces
    if len(value) > MAX_FIELD:
        raise ValueError(f"Fields can be at most {MAX_FIELD} characters.")
    return value


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always serve fresh files, so newly added cards appear after a reload
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def from_this_app(self):
        # Block other websites (and DNS-rebinding tricks) from adding cards through your browser
        port = self.server.server_address[1]
        allowed = {f"localhost:{port}", f"127.0.0.1:{port}"}
        origin = self.headers.get("Origin")
        return (self.headers.get("Host") in allowed
                and (origin is None or origin.split("://", 1)[-1] in allowed)
                and self.headers.get("Content-Type", "").startswith("application/json"))

    def do_GET(self):
        if self.path == "/api/status":
            return self.send_json(200, {"ok": True})
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/cards":
            return self.send_json(404, {"error": "Not found."})
        if not self.from_this_app():
            return self.send_json(403, {"error": "Forbidden."})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY:
                raise ValueError("Request too large.")
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise ValueError("Expected a card.")
            fields = {key: clean(data.get(key)) for key in ("fr", "en", "fi", "say")}
        except ValueError as e:  # includes invalid JSON
            return self.send_json(400, {"error": str(e)})
        if not fields["fr"]:
            return self.send_json(400, {"error": "French is required."})
        if not fields["en"] and not fields["fi"]:
            return self.send_json(400, {"error": "Add an English or Finnish translation (or both)."})

        card = {"id": "u-" + uuid.uuid4().hex[:10],
                **{key: value for key, value in fields.items() if value},
                "added": date.today().isoformat()}
        cards = make_audio.load_user_cards()
        cards.append(card)
        make_audio.save_user_cards(cards)

        audio = None
        text = make_audio.speech_text(card["fr"], card.get("say"))
        if text:
            try:
                _, audio = make_audio.record(text)
                make_audio.add_to_manifest(text, audio)
            except (subprocess.CalledProcessError, OSError) as e:
                # The card is saved anyway; rerun tools/make_audio.py to retry the recording
                self.log_error("Recording failed for %r: %s", text, e)
        self.send_json(201, {"card": card, "audio": audio})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"Flashcards running at http://localhost:{port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
