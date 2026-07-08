# Firebase 설정 가이드

이 문서는 `agent-usage-tracker`를 Firebase Auth와 Firestore에 연결하는 절차입니다.
실제 Firebase 값은 `.env` 또는 `.env.local`에만 넣고 Git에는 올리지 않습니다.

## 1. Firebase 프로젝트 만들기

1. Firebase Console에 접속합니다.
2. `Add project`를 눌러 새 프로젝트를 만듭니다.
3. Google Analytics는 당장 필요 없으면 꺼도 됩니다.
4. 프로젝트 생성이 끝나면 왼쪽 메뉴에서 `Project Overview`로 돌아옵니다.

## 2. Web App 등록

1. `Project Overview`에서 Web 아이콘 `</>`을 누릅니다.
2. App nickname은 예를 들어 `agent-usage-tracker-web`으로 입력합니다.
3. Firebase Hosting 체크는 지금 단계에서는 하지 않아도 됩니다. 배포는 Vercel을 씁니다.
4. 등록 후 보이는 `firebaseConfig` 값을 `.env` 또는 `.env.local`에 옮깁니다.

필요한 키:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

설정 파일이 없다면 먼저 만듭니다.

```bash
cp .env.example .env.local
```

이 프로젝트의 브라우저 앱과 로컬 워처 모두 같은 `NEXT_PUBLIC_FIREBASE_*` 값을 읽습니다.

## 3. Authentication 켜기

1. Firebase Console 왼쪽 메뉴에서 `Authentication`을 엽니다.
2. `Get started`를 누릅니다.
3. `Sign-in method`에서 아래 provider를 켭니다.
4. `Email/Password`: Enable 후 Save
5. `Google`: Enable 후 support email 선택 후 Save
6. `Anonymous`: Enable 후 Save

Anonymous provider는 로컬 터미널 워처가 Firestore에 사용량 이벤트를 업로드할 때 씁니다.
웹 대시보드 로그인은 Email/Password 또는 Google을 사용합니다.

Google 로그인까지 쓸 계획이면 Vercel 배포 후 도메인도 허용해야 합니다.

허용할 도메인 예시:

```text
localhost
agent-usage-tracker.vercel.app
내가 받은 Vercel preview/production 도메인
```

위 도메인은 `Authentication` > `Settings` > `Authorized domains`에서 추가합니다.

## 4. Firestore Database 만들기

1. Firebase Console 왼쪽 메뉴에서 `Firestore Database`를 엽니다.
2. `Create database`를 누릅니다.
3. 시작 모드는 `Production mode`를 권장합니다.
4. 리전은 한국 사용자 중심이면 가까운 Asia 리전을 고릅니다. 이미 선택한 뒤에는 바꾸기 어렵습니다.
5. 생성 후 `Rules` 탭으로 이동합니다.

## 5. Firestore Rules 적용

현재 프로젝트의 `firestore.rules` 내용을 Firebase Console의 Firestore `Rules` 탭에 붙여 넣고 Publish합니다.

현재 MVP 규칙:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /usageEvents/{eventId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;
    }

    match /trackerClients/{clientId} {
      allow read, create, update: if request.auth != null;
    }
  }
}
```

이 규칙은 로그인한 사용자라면 팀 사용량을 읽고 쓸 수 있게 합니다.
초기 MVP에는 충분하지만, 외부 사용자가 계정을 만들 수 있으면 데이터에 접근할 수 있습니다.
팀 배포 전에는 이메일 allowlist나 관리자 승인 구조를 추가하는 것이 좋습니다.

## 6. 로컬에서 확인

앱 실행:

```bash
npm run dev
```

브라우저에서 엽니다.

```text
http://localhost:3000
```

로그인 화면이 보이면 Firebase 연결이 된 것입니다.

로컬 로그 파서만 확인:

```bash
npm run track:once -- --name "김성연" --agent all --dry-run
```

Firestore에 실제 업로드:

```bash
npm run track -- --name "김성연" --agent all
```

기본값은 최근 7일 로그만, 한 번에 최대 200개 이벤트만 올립니다.
처음 연결할 때는 아래처럼 더 좁게 확인하는 것을 권장합니다.

```bash
npm run track:once -- --name "김성연" --agent all --since-days 1 --max-events 20
```

성공하면 Firestore Console의 `usageEvents` 컬렉션에 문서가 생깁니다.

## 7. Vercel 연결

1. GitHub에 레포를 올립니다.
2. Vercel에서 `New Project`를 누르고 GitHub 레포를 import합니다.
3. Framework Preset은 Next.js로 자동 감지됩니다.
4. Vercel `Settings` > `Environment Variables`에 `.env.local`과 같은 값을 등록합니다.
5. Deploy 후 나온 Vercel 도메인을 Firebase Auth `Authorized domains`에 추가합니다.

Vercel에 넣을 값:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## 8. 팀원 사용 방법

팀원은 GitHub 레포를 받은 뒤 한 번만 설정합니다.

```bash
npm install
cp .env.example .env.local
```

`.env.local` 값은 관리자에게 받은 Firebase 설정으로 채웁니다.

그다음 각자 VSCode 터미널에서 실행합니다.

```bash
npm run track -- --name "본인이름" --agent all
```

Codex만:

```bash
npm run track -- --name "본인이름" --agent codex
```

Claude Code만:

```bash
npm run track -- --name "본인이름" --agent claude
```

## 참고 링크

- Firebase Web setup: https://firebase.google.com/docs/web/setup
- Firebase Authentication Web start: https://firebase.google.com/docs/auth/web/start
- Email/Password auth: https://firebase.google.com/docs/auth/web/password-auth
- Google sign-in: https://firebase.google.com/docs/auth/web/google-signin
- Firestore security rules: https://firebase.google.com/docs/firestore/security/get-started
