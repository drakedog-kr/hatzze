"""common/llm_client — 그림이 든 메시지는 구독 경로(claude -p)에 stream-json 으로 넘긴다(2026-10-21).
글로만 넘기면 그림이 조용히 빠졌다(_user_text 는 글 블록만 잇는다)."""
import json
import subprocess

from common import llm_client as L

IMG = {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "iVBORw0KGgo="}}
KW = {
    "model": "claude-opus-5-5",
    "max_tokens": 100,
    "system": "판정자",
    "messages": [{"role": "user", "content": [IMG, {"type": "text", "text": "어느 후보?"}]}],
    "output_config": {"format": {"type": "json_schema", "schema": {"type": "object"}}},
}


def test_has_image_and_blocks():
    assert L._has_image(KW)
    assert not L._has_image({"messages": [{"role": "user", "content": "글"}]})
    assert L._user_blocks([{"role": "user", "content": "글"}]) == [{"type": "text", "text": "글"}]
    assert L._is_simple_request(KW)


def test_run_cli_streams_image_message(monkeypatch):
    seen = {}

    def fake_run(argv, input, **kw):
        seen["argv"], seen["input"] = argv, input
        lines = [
            {"type": "system", "subtype": "init"},
            {"type": "assistant", "message": {}},
            {"type": "result", "is_error": False, "structured_output": {"picks": [0]}, "usage": {"input_tokens": 5, "output_tokens": 9}},
        ]
        return subprocess.CompletedProcess(argv, 0, stdout="\n".join(json.dumps(x) for x in lines), stderr="")

    monkeypatch.setattr(L.subprocess, "run", fake_run)
    resp = L._run_cli(model="claude-opus-5-5", system="판정자", user="", schema={"type": "object"}, blocks=KW["messages"][0]["content"])
    assert json.loads(resp.content[0].text) == {"picks": [0]}
    a = seen["argv"]
    assert a[a.index("--input-format") + 1] == "stream-json" and a[a.index("--output-format") + 1] == "stream-json"
    msg = json.loads(seen["input"])
    assert msg["type"] == "user" and msg["message"]["content"][0]["type"] == "image"


def test_run_cli_text_path_unchanged(monkeypatch):
    seen = {}

    def fake_run(argv, input, **kw):
        seen["argv"], seen["input"] = argv, input
        out = {"is_error": False, "result": "답", "usage": {"output_tokens": 3}}
        return subprocess.CompletedProcess(argv, 0, stdout=json.dumps(out), stderr="")

    monkeypatch.setattr(L.subprocess, "run", fake_run)
    resp = L._run_cli(model="claude-haiku-5-5", system=None, user="글", schema=None)
    assert resp.content[0].text == "답" and seen["input"] == "글"
    a = seen["argv"]
    assert a[a.index("--output-format") + 1] == "json" and "--input-format" not in a


def test_subscription_client_routes_image_through_blocks(monkeypatch):
    got = {}

    def fake_cli(**kw):
        got.update(kw)
        return L._Response(content=[L._TextBlock(text='{"picks":[0]}')], usage=L._Usage(output_tokens=1))

    monkeypatch.setattr(L, "_run_cli", fake_cli)
    api = type("Api", (), {"messages": type("M", (), {"batches": None})()})()
    c = L.SubscriptionClient(api=api)
    c.messages.create(**KW)
    assert got["blocks"][0]["type"] == "image" and got["schema"] == {"type": "object"}
