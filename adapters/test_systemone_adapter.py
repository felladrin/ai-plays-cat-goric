"""Checks the adapter's request validation and its name -> probability mapping with a
stub backend, so it runs without torch or a model: python adapters/test_systemone_adapter.py"""

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import systemone_adapter as A

# The stub scores options in criteria order, so a mapping bug shows up as a wrong name.
A.Handler.decide = staticmethod(lambda state, qs: {q: [0.1, 0.7, 0.2][: len(qs[q]["criteria"])] for q in qs})
srv = ThreadingHTTPServer(("127.0.0.1", 0), A.Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/v1/systemone"


def post(body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


code, out = post({"state": "s", "questions": {"move": {"type": "choice", "criteria": {"left": "a", "jump": "b", "right": None}}}})
assert code == 200, out
assert out["answers"]["move"] == {"choice": "jump", "probabilities": {"left": 0.1, "jump": 0.7, "right": 0.2}}, out

code, out = post({"state": "s", "questions": {"ok": {"type": "noul"}}})
assert code == 422 and "only 'choice'" in out["error"], out

code, out = post({"state": {"not": "a string"}, "questions": {}})
assert code == 422, out

srv.shutdown()
print("PASS test_systemone_adapter.py")
