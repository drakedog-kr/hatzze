# data-pipeline

MVP 5개 지표를 수집/적재하는 Python 배치 스크립트 모음 (PRD 4-1, 6절 참고).

- `scripts/` — 지표별 수집 스크립트 (정통 3: 미국 10년물 금리, 코스피 신고가 대비 괴리율, 버핏지수 / 밈 2: 네이버 검색 트렌드, 종목토론방 게시글 수)
- `common/` — 환경변수 로딩, Supabase 클라이언트 등 공용 모듈

## 실행 준비

```bash
cd data-pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

루트의 `.env.local`을 참고해 `data-pipeline/.env`에 동일한 키를 채워 넣으세요.
