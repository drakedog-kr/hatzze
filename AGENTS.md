<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 작업 폴더 하나를 여러 세션이 함께 쓴다

이 저장소의 메인 작업 폴더에서는 여러 에이전트 세션이 동시에 돌아간다. 워킹트리도 브랜치도 하나뿐이라, 내가 브랜치를 바꾸면 다른 세션의 작업이 그 위에 얹힌다.

## 세션을 열면 먼저 당긴다

```bash
git pull --ff-only
```

머지는 깃헙 서버에서 일어나 `origin/main` 만 옮긴다. 로컬 `main` 은 당겨야 따라온다. 그런데 PR 을 늘 별도 워크트리에서 만드니 메인 폴더는 커밋도 푸시도 할 일이 없다 — 브랜치가 움직일 계기가 없어서 조용히 뒤처진다.

2026-08-27 에 41커밋(PR 14건) 뒤처져 있었다. 그때 `git status` 에 뜬 수정 13건과 미추적 3건은 **하나도 빠짐없이 이미 머지된 것들의 옛 사본**이었다. 새 파일처럼 보이던 셋도 `origin/main` 에 같은 내용으로 있었다. 작업을 붙들고 있는 게 아니라 낡은 사본을 붙들고 있었던 것이다.

`--ff-only` 는 로컬에 커밋이 남아 있으면 당기지 말고 멈추라는 뜻이다. 머지 커밋을 자동으로 만들면 남의 작업이 섞인다. 당기기 전 `git status` 가 비어 있지 않으면, 그 변경이 이미 올라간 것인지부터 확인한다.

```bash
git show origin/main:<파일> | diff - <파일>   # 출력이 없으면 이미 올라간 것이다
git stash push -u -m 낡은사본                 # 지우기 전에 되돌릴 길을 만든다
```

## 커밋·PR 은 별도 워크트리에서

메인 폴더에서 커밋하지 말고, 레포 **밖** 임시 폴더(세션 스크래치패드)에 워크트리를 따서 거기서 커밋하고 PR 을 만든다. 남의 워킹트리를 전혀 건드리지 않는 유일한 방법이다.

```bash
git fetch origin
git worktree add <레포 밖 경로> -b <브랜치> origin/main
```

`origin/main` 을 기준으로 딴다. 지금 워킹트리의 HEAD 를 기준으로 따면 낡은 베이스를 물려받는다.

## PR 을 올렸으면 메인 폴더를 `main` 으로 되돌린다

브랜치에 얹어 둔 채 떠나면 다음 세션이 낡은 원고 위에서 일을 시작한다.

2026-07-31 에 실제로 그렇게 됐다. 이미 머지된 브랜치에 폴더가 남아 49커밋 뒤처져 있었고, `git status` 는 수정 10건으로 평범해 보였지만 `git diff --stat origin/main` 은 **22파일 766줄 삭제**였다. 그대로 커밋했다면 새 작업이 아니라 머지된 PR 여러 건을 되돌렸을 것이다.

## 커밋 직전 점검 세 줄

```bash
git branch --show-current      # main 이면 커밋하지 말고 브랜치부터 판다
git status --short             # 세션 시작 때 본 것은 이미 낡았다
git diff --stat origin/main    # 삭제 줄이 비정상적으로 크면 낡은 베이스다
```

`git add -A` 와 `git commit -a` 는 쓰지 않는다. 파일을 이름으로 지정해 스테이징하고, 낯선 파일이 섞여 있으면 `git diff -- <파일>` 로 남의 작업인지 먼저 확인한다.

## 머지는 사람이 한다

에이전트는 PR 까지만 만든다. `gh pr merge` 를 실행하지 않는다.
