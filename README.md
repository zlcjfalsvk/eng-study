# Eng — 상황별 영단어·구동사·영문법 학습 앱

한국어 화자를 위한 모바일 우선 영어 학습 웹앱입니다. 단어의 뜻을 한두 개가 아니라 **상황(context)별로 분리**해서 보여 주고, 각 뜻마다 예문(영/한)과 **브라우저 내장 음성(TTS)** 을 제공합니다. 학습 기록은 브라우저(IndexedDB)에 저장되며 서버가 없습니다.

## 기능

- **레벨 4단계**: 초급(A1–A2) · 중급(B1–B2) · 고급(C1–C2) · 비즈니스
- **단어장**: 검색(표제어·뜻·예문), 레벨/유형(단어·구동사·관용구·연어)/학습 상태 필터, 북마크
- **상세**: 상황별 뜻 탭, 예문 음성 재생, 유의어·반의어·용법 노트, 관련 단어
- **학습(플래시카드)**: SM-2 기반 간격 반복. 다시/어려움/알겠음/쉬움 → 다음 복습 시점 자동 계산
- **퀴즈**: 뜻 고르기 · 단어 고르기 · 빈칸 채우기. 틀린 단어는 복습 큐로
- **문법 정리**: 레벨별 주제, 예문 음성, 흔한 오류(✗) 표시, 한국인이 자주 틀리는 포인트
- **설정**: 음성/속도 선택, 하루 새 단어 목표, 카드 앞면(영→한 / 한→영), 테마, 기록 내보내기/불러오기
- **PWA**: 홈 화면에 설치 가능, 오프라인 동작

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 콘텐츠 검증 → 타입체크 → dist/ 빌드 (정적 호스팅 어디든 배포 가능)
pnpm preview
```

라우팅은 해시(`/#/browse/...`) 방식이라 GitHub Pages·S3 등 정적 호스팅에서 새로고침해도 404 가 나지 않습니다.

## 콘텐츠

```
src/data/types.ts            # Entry / Sense / GrammarTopic 타입 (콘텐츠 계약)
src/data/schema.ts           # zod 스키마
content/
  beginner.jsonl             # 레벨별 어휘 원본 — 한 줄에 표제어 하나 (Entry)
  intermediate.jsonl
  advanced.jsonl
  business.jsonl
  grammar.json               # 문법 주제 (GrammarTopic[])
public/data/                 # 빌드 산출물 (git 제외) — 앱이 런타임에 fetch
  manifest.json              #   레벨별 개수
  relations.json             #   단어 간 연관 색인 (어근·유의어·반의어·related)
  grammar.json
  <level>/index.json         #   목록·검색용 경량 색인
  <level>/<n>.json           #   200개 단위 샤드 (전체 항목)
```

- `pnpm validate` — 원본을 스키마·규칙으로 검사합니다 (id 형식, 중복, 예문에 표제어 포함 여부 등).
- `pnpm data` — 검증 후 `public/data/` 를 생성합니다. `pnpm dev` 와 `pnpm build` 가 자동으로 먼저 실행합니다.
- 앱은 선택한 레벨의 색인(수백 KB)만 먼저 받고, 상세·학습·퀴즈에서 필요한 샤드만 추가로 받습니다. 받은 파일은 서비스 워커가 캐시해 오프라인에서도 쓰입니다. 레벨당 2,000개로 늘어도 첫 로딩은 거의 같습니다.
- 현재 시드 데이터: 레벨당 45개 표제어(총 180개, 뜻 394개) + 문법 20주제.

### 연관 단어 ("함께 익히기")

빌드 시 `scripts/relations.ts` 가 다음을 자동으로 찾아 `relations.json` 에 넣습니다. 단어 상세와 플래시카드 뒷면에 표시됩니다.

- 어근: `take` ↔ `take off`, `take a break` (구동사·연어·관용구의 내용어가 단어 표제어와 일치)
- 유의어·반의어: 각 뜻의 `synonyms`/`antonyms` 에 적힌 표제어
- `related`: 콘텐츠에 명시한 "함께 익히면 좋은 표현" (혼동어 등)
- 다른 레벨에 같은 표제어로 수록된 항목

### 대량 생성 (Claude API)

레벨당 1,500~2,000개 목표는 Claude Code 세션에서 에이전트로 직접 작성하거나, API 키가 있으면 `scripts/generate.ts` 로 무인 생성할 수 있습니다. 스크립트는 구조화 출력(JSON 스키마 강제)을 사용하고, 배치마다 `content/<level>.jsonl` 에 바로 append 하므로 중단해도 안전합니다.

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # 또는 `ant auth login`
pnpm generate --level intermediate --count 200
pnpm generate --level business --count 100 --wordlist scripts/wordlists/business.txt
pnpm generate --level beginner --count 10 --dry-run   # API 호출 없이 후보만 확인
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--level` | (필수) | beginner / intermediate / advanced / business |
| `--count` | 50 | 이번 실행에서 추가할 표제어 수 |
| `--batch` | 8 | 요청 1회당 표제어 수 |
| `--concurrency` | 3 | 동시 요청 수 |
| `--types` | word:70,phrasal:20,idiom:7,collocation:3 | 유형 비율 |
| `--wordlist` | 없음 | 표제어 목록 파일. 없으면 모델이 후보 제안 |
| `--model` | claude-opus-5-5 | 사용 모델 |
| `--effort` | medium | low / medium / high |

비용 감각: 표제어 1개당 출력 약 400~700 토큰. Opus 5.5 기준 2,000개 ≈ 출력 1.2M 토큰 ≈ $25 안팎 (입력·시스템 프롬프트 캐시 포함 시 조금 더). 품질을 먼저 확인하려면 `--count 20` 으로 시작하세요.

## 학습 기록 저장

IndexedDB(데이터베이스 `eng-study`, 키 `eng-progress-v1`)에 단어별 SRS 상태(ease·interval·due·reps), 일별 통계, 문법 읽음 표시, 설정이 저장됩니다. IndexedDB 를 쓸 수 없는 환경에서는 localStorage 로 폴백하고, 예전 버전이 localStorage 에 남긴 기록은 첫 실행 때 자동으로 이전됩니다. 시작 시 `navigator.storage.persist()` 로 영구 저장을 요청하며, 설정 화면에서 승인 여부와 사용량을 볼 수 있습니다. JSON 내보내기/불러오기로 기기 간 이동이 가능합니다.

## 음성

Web Speech API(`speechSynthesis`)를 사용합니다. iOS/macOS 는 Samantha·Ava, Chrome 은 Google US English, Windows 는 Aria/Jenny 등 기기에 설치된 영어 음성을 자동 선택하며 설정에서 바꿀 수 있습니다. 서버나 API 키가 필요 없습니다.

## 기술 스택

Vite 8 · React 19 · TypeScript · Tailwind CSS 4 · react-router 8 · zustand(persist) · vite-plugin-pwa · zod · @anthropic-ai/sdk(생성 스크립트 전용)
