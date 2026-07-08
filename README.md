# Hatzze — 코스피 과열도 판독기

정통 매크로 지표와 커뮤니티 밈 지표를 함께 묶어 "지금 코스피가 과열됐는가"를 하나의 스코어/배지로 보여주는 서비스. 자세한 배경과 지표 구성은 PRD 참고.

## 폴더 구조

- `app/` — Next.js(App Router) 프론트엔드
- `data-pipeline/` — 지표 수집용 Python 배치 스크립트 (`scripts/`), 공용 설정/Supabase 클라이언트 (`common/`)
- `supabase/schema.sql` — Supabase SQL Editor에 붙여넣을 테이블 스키마 (RLS 포함)

## 시작하기 (프론트엔드)

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인.

## 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 키를 채워 넣으세요.

```bash
cp .env.example .env.local
```

## 데이터 파이프라인

```bash
cd data-pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Supabase 스키마 적용

`supabase/schema.sql` 내용을 Supabase 프로젝트의 SQL Editor에 붙여넣어 실행하세요. `indicators`, `indicator_values`, `daily_score` 3개 테이블이 생성되고 RLS(읽기 전용 공개, 쓰기는 service_role)가 설정됩니다.
