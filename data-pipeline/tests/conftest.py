"""파이프라인 단위 테스트의 경로 설정.

스크립트들은 `sys.path.insert(0, <data-pipeline>)` 로 `common`·`config` 를 찾는다. 테스트도 같은
자리를 보게 해 둔다. DB·LLM 은 부르지 않는다 — 여기 테스트는 순수 함수만 다룬다.
돌리는 법: `cd data-pipeline && python -m pytest tests` (pytest 는 requirements 에 없다. CI 가 따로 깐다).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT, ROOT / "scripts"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
