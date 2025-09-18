# Zero Code - Zero Dependency AI Code Editor

의존성 없이 **Ubuntu 18.04+** 에서 작동하는 올인원 AI 코드 에디터

## ✨ 특징

- **제로 의존성**: npm 패키지 없이 Node.js 내장 모듈만 사용
- **멀티 AI 지원**: Claude, OpenAI/Codex, Google Gemini 동시 지원
- **웹 기반 에디터**: 브라우저에서 작동하는 풀 코드 에디터
- **터미널 통합**: 웹에서 직접 명령 실행
- **포터블**: Ubuntu 18.04+ 어디서나 실행 가능
- **경량**: 단일 JavaScript 파일 (~50KB)

## 🚀 빠른 시작

```bash
# 저장소 클론
git clone https://github.com/hwkim3330/vscode.git
cd vscode

# 실행 (Node.js만 있으면 됨)
node zero-code.js

# 또는 포터블 런처 사용
./zero-code-portable.sh
```

브라우저에서 http://localhost:3456 접속

## 🔧 AI 제공자 설정

### 초기 설정 마법사
```bash
node zero-code.js setup
```

### 수동 설정

#### Claude (Anthropic)
1. [Anthropic Console](https://console.anthropic.com/settings/keys)에서 API 키 발급
2. 웹 UI에서 Claude 버튼 클릭
3. API 키 입력

#### OpenAI/Codex
1. [OpenAI Platform](https://platform.openai.com/api-keys)에서 API 키 발급
2. 웹 UI에서 OpenAI 버튼 클릭
3. API 키 입력

#### Google Gemini
1. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 발급
2. 웹 UI에서 Gemini 버튼 클릭
3. API 키 입력

## 💻 사용법

### 키보드 단축키
- `Ctrl+S` - 파일 저장
- `Ctrl+J` - 터미널 토글
- `Ctrl+I` - AI 어시스턴트 토글

### AI 기능
- **코드 완성**: 코드 선택 후 AI에게 완성 요청
- **코드 리뷰**: 현재 파일을 AI가 분석
- **질문 답변**: 프로그래밍 관련 질문
- **리팩토링**: 코드 개선 제안

### 터미널
- 웹에서 직접 명령 실행
- 현재 디렉토리에서 작동
- 출력 실시간 표시

## 📁 파일 구조

```
vscode/
├── zero-code.js           # 메인 애플리케이션 (의존성 없음)
├── zero-code-portable.sh  # 포터블 런처 스크립트
├── build-static.sh        # 정적 바이너리 빌드 (선택사항)
└── README.md             # 이 파일
```

## 🎯 지원 모델

### Claude
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307
- claude-2.1

### OpenAI
- gpt-4
- gpt-4-turbo-preview
- gpt-3.5-turbo
- code-davinci-002 (Codex)

### Gemini
- gemini-pro
- gemini-pro-vision
- gemini-1.5-pro-latest
- gemini-1.5-flash-latest

## 🔒 보안

- API 키는 로컬에만 저장 (~/.zero-code/auth.json)
- 외부 서버로 전송하지 않음
- 각 AI 제공자의 공식 API만 사용

## 🐧 시스템 요구사항

- **OS**: Ubuntu 18.04+ / Debian 9+ / CentOS 7+
- **Node.js**: 10.0+ (Ubuntu 18.04 기본 버전 호환)
- **브라우저**: Chrome, Firefox, Edge (최신 버전)
- **메모리**: 256MB 이상
- **디스크**: 10MB

## 🆚 비교

| 기능 | Zero Code | VSCode | Cursor | Claude Code |
|-----|-----------|---------|---------|------------|
| 의존성 없음 | ✅ | ❌ | ❌ | ❌ |
| Ubuntu 18.04 | ✅ | ❌ | ❌ | ❌ |
| 멀티 AI | ✅ | ❌ | ⚠️ | ⚠️ |
| 웹 기반 | ✅ | ⚠️ | ❌ | ❌ |
| 크기 | 50KB | 350MB | 400MB | 300MB |

## 🛠️ 고급 설정

### 포트 변경
```bash
ZERO_PORT=8080 node zero-code.js
```

### 원격 접속 허용
```bash
ZERO_HOST=0.0.0.0 node zero-code.js
```

### 환경 변수
```bash
export ZERO_PORT=3456
export ZERO_HOST=127.0.0.1
export ZERO_CONFIG_DIR=~/.zero-code
```

## 📝 라이선스

MIT License - 자유롭게 사용 가능

## 🤝 기여

PR 환영합니다!

---

**Ubuntu 18.04에서도 작동하는 진짜 제로 의존성 AI 코드 에디터 ⚡**