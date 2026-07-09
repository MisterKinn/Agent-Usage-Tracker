# agent-usage-tracker

## 한 줄 목표

하나의 GPT 계정을 여러 명이 함께 쓸 때, 각자 로컬 Codex와 Claude Code 로그를 Firebase Firestore에 동기화하고 웹에서 실시간 사용량을 본다.

## 작업 카드

목표:
Next.js 웹 대시보드와 로컬 터미널 워처를 만들어, 팀원이 VSCode 터미널에서 한 줄만 실행하면 Codex와 Claude Code 사용량이 Firestore에 올라가고 웹에서 실시간 집계된다.

입력:
- `~/.codex/logs_2.sqlite`
- `~/.codex/session_index.jsonl`
- `~/.claude/projects/*/*.jsonl`
- Firebase Auth
- Firebase Firestore

출력:
- Next.js 대시보드
- Firestore `usageEvents`
- Firestore `trackerClients`

성공 기준:
- 사용자는 Firebase Auth로 웹 대시보드에 로그인한다.
- 각 팀원은 자기 작업 프로젝트에서 설치 명령 한 줄로 최소 워처만 내려받고 로컬 에이전트 로그를 동기화한다.
- 웹 대시보드는 Firestore 변경을 실시간으로 반영한다.

오늘 만들 최소 버전:
Next.js 앱, Firebase 연결 코드, Firestore 실시간 대시보드, 로컬 Codex/Claude Code 로그 동기화 CLI를 만든다.

## 만들 기능

- [x] Next.js 앱 루트 구성
- [x] Firebase Auth 로그인 화면
- [x] Firestore `usageEvents` 실시간 구독
- [x] 사람별 토큰 합계 대시보드
- [x] 최근 이벤트 테이블
- [x] 로컬 `~/.codex/logs_2.sqlite` 파서
- [x] 로컬 `~/.claude/projects/*/*.jsonl` 파서
- [x] `npm run track` 동기화 워처
- [x] Firebase 환경변수 예시 파일
- [x] Firestore 보안 규칙 초안
- [x] 원격 설치용 `/api/install` 라우트
- [x] Windows용 Python 원격 설치 라우트
- [x] Python 표준 라이브러리 기반 최소 로컬 워처
- [ ] Firebase 프로젝트 생성 및 웹 환경변수 연결
- [ ] GitHub 레포 생성
- [ ] Vercel 프로젝트 연결

## 팀원 사용 방법

팀원은 이 레포 전체를 clone하지 않고, Node.js나 npm도 설치하지 않습니다. Windows VSCode 터미널에서 자기 작업 프로젝트 폴더를 연 뒤 아래 한 줄만 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://agent-usage-tracker.vercel.app/api/install/windows')))"
```

macOS 터미널에서는 아래 한 줄을 실행합니다.

```bash
/usr/bin/curl -fsSL 'https://agent-usage-tracker.vercel.app/api/install/python' | python3
```

이 명령은 현재 프로젝트 안에 `.agent-usage-tracker/` 폴더만 만들고, 사용량 추적에 필요한 최소 파일만 내려받은 뒤 바로 실행합니다.

설치되는 것:
- `.agent-usage-tracker/track_agent_usage.py`
- `.agent-usage-tracker/.tracker-config.json` (첫 실행 후 이름 저장)
- `.agent-usage-tracker/.tracker-state.json` (동기화 상태 저장)

첫 실행 때 터미널에서 이름을 물어보고 `.agent-usage-tracker/.tracker-config.json`에 저장합니다. Firebase 공개 Web App 설정은 설치 시 트래커 코드 안에 함께 주입되므로, 팀원 로컬 프로젝트에 별도 `.env` 파일을 만들지 않습니다.

이후 같은 프로젝트에서는 아래 명령으로 다시 시작할 수 있습니다. Python 실행 명령은 PC마다 `py`, `python`, `python3` 중 하나입니다.

```powershell
cd .agent-usage-tracker
py -3 track_agent_usage.py
```

Python이 없는 PC에서는 설치 스크립트가 Python을 설치하라고 안내합니다. 그 경우에만 Python 설치가 필요합니다.

설치만 하고 바로 실행하지 않을 때:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://agent-usage-tracker.vercel.app/api/install/windows'))) --install-only"
```

`--agent all`이 기본값이라 Codex와 Claude Code를 함께 추적합니다.

윈도우에서 Claude/Codex 계정 없이 설치와 업로드 흐름만 테스트하려면, 가짜 Claude 사용 로그를 심은 뒤 1회 동기화를 실행할 수 있습니다.

```powershell
cd $HOME\.agent-usage-tracker
py -3 track_agent_usage.py --seed-fake-claude --once
```

기본적으로 테스트용 Claude 이벤트 3개를 만들고 바로 업로드합니다. 더 많이 만들고 싶으면 `--seed-count 5` 같은 식으로 늘릴 수 있습니다.

저장된 서버 집계를 본인 터미널에서 바로 확인하려면 아래처럼 실행합니다.

```powershell
cd $HOME\.agent-usage-tracker
py -3 track_agent_usage.py --report
py -3 track_agent_usage.py --report --report-days 30
```

개발자용 Node.js 설치 스크립트도 남겨두었지만, 팀원 배포 기본값은 Windows + Python 버전입니다.

## 개발자 실행 방법

의존성 설치:

```bash
npm install
```

Firebase 설정 파일 만들기:

```bash
cp .env.example .env.local
```

`.env.local`에 아래 값을 채운 뒤 웹을 실행합니다.

- Firebase Web App 공개 설정
- Firebase Admin SDK 서비스 계정 값
- `TRACKER_WRITE_TOKEN`
- 로컬 개발용 `AGENT_TRACKER_UPLOAD_URL`

```bash
npm run dev
```

이 레포를 직접 받은 개발자는 아래처럼 워처를 실행할 수 있습니다. `--agent all`이 기본값이라 Codex와 Claude Code를 함께 추적합니다.

첫 실행 때 이름을 직접 넘기면 프로젝트 폴더의 `.tracker-config.json`에 저장됩니다.

```bash
npm run track -- --name "김성연"
```

또는 그냥 실행하면 터미널에서 이름을 물어보고 저장합니다.

```bash
npm run track
```

저장된 서버 집계를 바로 확인하려면 아래 명령을 실행합니다.

```bash
npm run track:report
npm run track:report -- --report-days 30
```

이후에는 같은 프로젝트 폴더에서 아래 한 줄만 실행하면 됩니다.

```bash
npm run track
```

`.tracker-config.json`은 개인 설정 파일이라 Git에 올리지 않습니다.

Firebase 없이 로컬 파서만 확인할 때:

```bash
npm run track:once -- --dry-run
```

기본 워처는 최근 7일, 한 번에 최대 200개 이벤트만 올립니다. 범위를 조절할 수 있습니다.

```bash
npm run track -- --since-days 1 --max-events 50
```

과거 전체 로그를 한 번에 올릴 때만 명시적으로 실행합니다.

```bash
npm run track:once -- --all-history --max-events 0
```

특정 도구만 추적할 수도 있습니다.

```bash
npm run track -- --name "김성연" --agent codex
npm run track -- --name "김성연" --agent claude
```

## 확인 방법

- Firebase 설정 전에는 웹에서 설정 안내 화면이 보인다.
- Firebase 설정 후 로그인 화면이 보이고 Auth 로그인이 된다.
- 워처 실행 후 서버 API가 Firestore `usageDailySummaries`와 `trackerClients`를 갱신한다.
- 웹 대시보드의 총 토큰, 사용자 순위, 최근 이벤트가 실시간으로 갱신된다.
- 배포 전 `npm run build`가 통과한다.

## Firebase 설정

자세한 절차는 [Firebase 설정 가이드](/Users/kinn/Desktop/BAI-workspace/10-projects/agent-usage-tracker/docs/firebase-setup.md:1)를 따릅니다.

요약하면 Firebase Console에서 프로젝트를 만들고 아래를 켭니다.

- Authentication: Email/Password, Google, Anonymous provider
- Firestore Database: production mode로 생성 후 `firestore.rules` 참고
- Project settings > Web app: 웹 앱과 설치 트래커가 공통으로 쓸 Firebase Web App config 확인

`.env.local`은 Git에 올리지 않습니다. 특히 `FIREBASE_ADMIN_PRIVATE_KEY`, `TRACKER_WRITE_TOKEN`은 절대 공개 레포에 올리면 안 됩니다.

## 배포 흐름

1. GitHub에 새 레포를 만들고 이 폴더를 루트로 push한다.
2. Vercel에서 GitHub 레포를 import한다.
3. Vercel Environment Variables에 Web App 값과 함께 `FIREBASE_ADMIN_*`, `TRACKER_WRITE_TOKEN`을 등록한다.
4. Vercel 기본 도메인으로 접속해 로그인과 실시간 대시보드를 확인한다.

## Codex에게 다음에 요청할 말

```text
이 프로젝트를 GitHub에 올릴 수 있게 보안 점검하고 첫 커밋을 만들어줘.
```

## 메모

- 웹 앱 로그인은 Firebase Auth를 쓰지만, 로컬 트래커 업로드는 Vercel API가 Firebase Admin SDK로 대신 기록한다. 그래서 트래커 실행 시 Firebase `(anonymous)` 유저가 새로 생기지 않는다.
- 현재 Firestore rules는 인증된 사용자끼리 읽고 쓰는 MVP 초안이다. 팀 외부 사용자를 막으려면 allowlist 규칙을 추가해야 한다.
- 기존 Python CSV 리포트 도구는 `src/*.py`에 남겨 두었다. 웹/실시간 기본 흐름은 `scripts/track-agent-usage.mjs`와 Next.js 앱이다.
