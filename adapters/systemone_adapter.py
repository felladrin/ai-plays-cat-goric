"""Serve a decision model that does not speak System One as POST /v1/systemone.

The driver sends choice questions with named options (`criteria`: name -> text)
and reads back `{"choice": name, "probabilities": {name: p}}`. Models whose own
server or API takes a different shape get wrapped here. Only `choice` is
implemented, because it is the only type the `decide` policy sends; anything
else is rejected with 422 rather than guessed at.

    python systemone_adapter.py --backend phocinae --model-dir /models/Phocinae-Largha-150M-v1
    python systemone_adapter.py --backend autojev  --model-dir /models/Darwin-27B-ZTC

See docs/bring-your-own-model.md.
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def option_text(name, text):
    return f"{name}: {text}" if text else name


def phocinae_backend(model_dir, device):
    from phocinae.engine import Engine

    eng = Engine(model_dir, device=device)

    def decide(state, questions):
        ids = list(questions)
        qs = [{"id": i, "type": "choice", "instructions": questions[i].get("instructions") or "",
               "options": [option_text(n, t) for n, t in questions[i]["criteria"].items()]} for i in ids]
        *_, scores = eng.run(state, qs, with_scores=True)
        return {i: list(scores[i]) for i in ids}

    return decide


def autojev_backend(model_dir, device):
    sys.path.insert(0, model_dir)
    from autojev.model import DecisionModel

    model = DecisionModel(checkpoint=model_dir, device=device)

    def decide(state, questions):
        ids = list(questions)
        rows = [{"state": state, "question": {"type": "choice", "instructions": questions[i].get("instructions"),
                                              "criteria": questions[i]["criteria"]}} for i in ids]
        return dict(zip(ids, model.predict(rows)))

    return decide


BACKENDS = {"phocinae": phocinae_backend, "autojev": autojev_backend}


def validate(body):
    if not isinstance(body, dict) or not isinstance(body.get("state"), str):
        raise ValueError("'state' must be a string")
    qs = body.get("questions")
    if not isinstance(qs, dict) or not qs:
        raise ValueError("'questions' must be a non-empty object")
    for qid, q in qs.items():
        if q.get("type") != "choice":
            raise ValueError(f"question {qid!r}: only 'choice' is supported by this adapter")
        if not isinstance(q.get("criteria"), dict) or not q["criteria"]:
            raise ValueError(f"question {qid!r}: 'criteria' must be a non-empty object")
    return body["state"], qs


class Handler(BaseHTTPRequestHandler):
    decide = None
    model_id = ""
    lock = threading.Lock()

    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"status": "ok", "model": self.model_id})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/systemone":
            return self._send(404, {"error": "not found; POST /v1/systemone"})
        try:
            state, questions = validate(json.loads(self.rfile.read(int(self.headers.get("content-length") or 0))))
        except (ValueError, json.JSONDecodeError) as e:
            return self._send(422, {"error": str(e)})
        t0 = time.perf_counter()
        with self.lock:
            probs = type(self).decide(state, questions)
        answers = {}
        for qid, p in probs.items():
            names = list(questions[qid]["criteria"])
            if len(p) != len(names):
                return self._send(500, {"error": f"{qid}: backend returned {len(p)} scores for {len(names)} options"})
            dist = dict(zip(names, (float(v) for v in p)))
            answers[qid] = {"choice": max(dist, key=dist.get), "probabilities": dist}
        self._send(200, {"model": self.model_id, "answers": answers,
                         "latency_ms": round((time.perf_counter() - t0) * 1000, 1)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=sorted(BACKENDS), required=True)
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--model-id", help="id reported back (default: the directory name)")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    Handler.decide = staticmethod(BACKENDS[a.backend](a.model_dir, a.device))
    Handler.model_id = a.model_id or a.model_dir.rstrip("/").split("/")[-1]
    print(f"serving {Handler.model_id} ({a.backend}) on http://{a.host}:{a.port}/v1/systemone", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
