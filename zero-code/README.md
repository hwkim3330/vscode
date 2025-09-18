# Zero Code CLI

진짜 제로 의존성 AI 코드 에디터 - Ubuntu 18.04부터 최신 시스템까지 완벽 지원

## 🌟 특징

- **제로 의존성**: npm 패키지 없이 Node.js 내장 모듈만 사용
- **멀티 플랫폼**: Linux (x64/ARM64/ARM), macOS (Intel/M1), Windows
- **멀티 AI 지원**: Claude, OpenAI/Codex, Google Gemini
- **Node.js 8.0+ 호환**: Ubuntu 18.04 기본 Node.js에서도 작동
- **단일 파일**: 50KB 크기의 단일 JavaScript 파일
- **번들 옵션**: Node.js 포함 standalone 실행 파일 생성 가능

## 📦 다운로드

### 사전 빌드된 바이너리

[Releases](https://github.com/hwkim3330/vscode/releases) 페이지에서 다운로드:

- `zero-code-1.0.0-linux-x64.tar.gz` - Linux x64 (Ubuntu, Debian, CentOS)
- `zero-code-1.0.0-linux-arm64.tar.gz` - Linux ARM64 (Raspberry Pi 4, AWS Graviton)
- `zero-code-1.0.0-linux-arm.tar.gz` - Linux ARM (Raspberry Pi 3)
- `zero-code-1.0.0-darwin-x64.tar.gz` - macOS Intel
- `zero-code-1.0.0-darwin-arm64.tar.gz` - macOS M1/M2
- `zero-code-1.0.0-win32-x64.zip` - Windows x64
- `zero-code-1.0.0-portable.tar.gz` - 포터블 버전 (Node.js 필요)

## 🚀 빠른 시작

### 방법 1: 포터블 버전 (권장)

```bash
# 다운로드 및 압축 해제
wget https://github.com/hwkim3330/vscode/releases/download/v1.0.0/zero-code-1.0.0-portable.tar.gz
tar -xzf zero-code-1.0.0-portable.tar.gz
cd portable

# 실행
./run.sh

# 또는 직접 Node.js로 실행
node main.js
```

### 방법 2: 플랫폼별 바이너리

```bash
# Linux x64 예시
wget https://github.com/hwkim3330/vscode/releases/download/v1.0.0/zero-code-1.0.0-linux-x64.tar.gz
tar -xzf zero-code-1.0.0-linux-x64.tar.gz
cd linux-x64

# 실행 (Node.js 포함된 경우)
./zero-code

# AI 설정
./zero-code setup
```

### 방법 3: 소스에서 빌드

```bash
# 저장소 클론
git clone https://github.com/hwkim3330/vscode.git
cd vscode/zero-code

# 실행
node src/main.js

# 또는 빌드
./scripts/build.sh
```

## 🔧 AI 제공자 설정

### 초기 설정 마법사

```bash
zero-code setup
```

각 AI 제공자별로 API 키를 입력하라는 메시지가 표시됩니다.

### API 키 얻기

#### Claude (Anthropic)
1. [Anthropic Console](https://console.anthropic.com/settings/keys) 접속
2. API 키 생성
3. 설정 시 입력

#### OpenAI/Codex
1. [OpenAI Platform](https://platform.openai.com/api-keys) 접속
2. API 키 생성
3. 설정 시 입력

#### Google Gemini
1. [Google AI Studio](https://makersuite.google.com/app/apikey) 접속
2. API 키 생성
3. 설정 시 입력

## 💻 사용법

### 웹 인터페이스

```bash
# 서버 시작
zero-code

# 브라우저에서 접속
http://localhost:3456
```

### 키보드 단축키
- `Ctrl+S` - 파일 저장
- `Enter` - AI에게 전송 (프롬프트 입력창에서)
- `Shift+Enter` - 줄바꿈 (프롬프트 입력창에서)

### 환경 변수

```bash
# 포트 변경
ZERO_PORT=8080 zero-code

# 원격 접속 허용
ZERO_HOST=0.0.0.0 zero-code

# 디버그 모드
DEBUG=true zero-code
```

## 🛠️ 빌드

### 현재 플랫폼용 빌드

```bash
cd zero-code
./scripts/build.sh
```

옵션:
1. 현재 플랫폼용 빌드
2. 포터블 패키지 생성
3. 모든 플랫폼 빌드

### 모든 플랫폼 빌드

```bash
./scripts/build-all.sh
```

자동으로:
- 6개 플랫폼용 바이너리 생성
- Node.js 번들링 (선택사항)
- 릴리스 패키지 생성

## 📁 프로젝트 구조

```
zero-code/
├── src/
│   └── main.js          # 메인 애플리케이션 (ES5, Node.js 8+ 호환)
├── bin/                 # 빌드된 바이너리
│   ├── linux-x64/
│   ├── linux-arm64/
│   ├── linux-arm/
│   ├── darwin-x64/
│   ├── darwin-arm64/
│   ├── win32-x64/
│   └── portable/
├── releases/           # 배포용 패키지
├── scripts/           # 빌드 스크립트
│   ├── build.sh
│   └── build-all.sh
└── package.json
```

## 🎯 지원 AI 모델

### Claude (Anthropic)
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307

### OpenAI
- gpt-4
- gpt-4-turbo-preview
- gpt-3.5-turbo

### Google Gemini
- gemini-pro
- gemini-1.5-pro-latest
- gemini-1.5-flash-latest

## 📊 시스템 요구사항

### 최소 요구사항
- **OS**: Linux, macOS, Windows
- **Node.js**: 8.0+ (포터블 버전)
- **메모리**: 128MB
- **디스크**: 10MB

### 지원 플랫폼
- Ubuntu 18.04+
- Debian 9+
- CentOS 7+
- RHEL 7+
- macOS 10.12+
- Windows 10+
- Raspberry Pi 3/4
- AWS EC2 (모든 인스턴스 타입)

## 🆚 비교

| 기능 | Zero Code | VSCode | Cursor | Claude Code | GitHub Copilot |
|-----|-----------|---------|---------|------------|---------------|
| 크기 | 50KB | 350MB | 400MB | 300MB | 200MB |
| 의존성 | 0 | 100+ | 150+ | 80+ | 50+ |
| Ubuntu 18.04 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Node.js 8+ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 멀티 AI | ✅ | ❌ | ⚠️ | ⚠️ | ❌ |
| 오프라인 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 무료 | ✅ | ✅ | ❌ | ❌ | ❌ |

## 🔒 보안

- API 키는 로컬에만 저장 (`~/.zero-code/config.json`)
- 외부 서버로 코드 전송 없음
- 모든 AI 통신은 HTTPS 사용
- 오픈소스로 코드 검증 가능

## 🐛 문제 해결

### Node.js를 찾을 수 없음
```bash
# Ubuntu/Debian
sudo apt install nodejs

# CentOS/RHEL
sudo yum install nodejs

# macOS
brew install node
```

### API 키가 작동하지 않음
1. API 키가 올바른지 확인
2. API 사용량 한도 확인
3. 네트워크 연결 확인

### 포트가 이미 사용 중
```bash
ZERO_PORT=3457 zero-code
```

## 📝 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 🤝 기여

PR 환영합니다! 특히:
- 더 많은 AI 제공자 지원
- UI 개선
- 버그 수정
- 문서 개선

## 🙏 크레딧

영감을 받은 프로젝트:
- [Claude Code](https://github.com/anthropics/claude-code) - Anthropic 공식 CLI
- [OpenAI Codex CLI](https://github.com/openai/codex) - OpenAI 공식 CLI
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) - Google 공식 CLI

---

**진짜 제로 의존성, 어디서나 작동하는 AI 코드 에디터 ⚡**