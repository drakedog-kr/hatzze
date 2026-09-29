# data-pipeline

햇쩨의 수집·계산·LLM 요약을 맡는 Python 배치입니다. GitHub Actions(`daily-update` 등)가 하루 두 번 돌려 Supabase에 쓰고, 화면(Next.js)은 읽기만 합니다. 전체 흐름과 실행 시각은 루트 [README](../README.md)의 '어떻게 도는가'·'자동화'에 있습니다.

- `scripts/` — `fetch_*.py`(수집) · `calculate_*.py`(집계·점수) · `generate_*.py`(LLM 요약·총평) · 텔레그램 수집·분석·발송
- `config/` — 지표 임계값·가중치 · 종목 별칭 · 테마 사전 · 배당 종목군
- `common/` — Supabase·야후·KRX·HTTP 클라이언트 · LLM 호출·문장 검수 · 텔레그램 글 조립
- `backtest/` — 지표 눈금·가중치 재보정 하네스(`backtest/README.md`)
- `tests/` — 단위 테스트. 순수 함수만 보고 DB·LLM은 부르지 않습니다

## 실행 준비

```bash
cd data-pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

키는 **레포 루트의 `.env.local`** 을 그대로 읽습니다(`common/config.py`). 따로 `.env`를 만들 필요가 없고, 키 목록은 루트 README '환경변수'에 있습니다.

```bash
python scripts/calculate_score.py   # 지표 종합 점수
python -m pytest tests -q           # 단위 테스트(CI 와 같다)
```

LLM을 부르는 생성기(`generate_*.py` · `send_telegram_broadcast.py`)를 로컬에서 돌리면, 구독 토큰이 없을 때 조용히 API 키로 청구됩니다(`common/llm_client.py` 머리말). 급등 종목 까닭이나 급부상 한 줄 요약만 다시 써야 하면 러너에서 도는 `*-rerun` 워크플로를 씁니다.
