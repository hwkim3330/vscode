# Gemini Code Assistant

Google Gemini AI를 사용한 코드 어시스턴트 애플리케이션

## 기능

- ✨ **Google OAuth2 인증** - 안전한 Google 계정 연동
- 🔑 **Gemini API Key 지원** - 간단한 API 키 인증
- 💬 **대화형 채팅** - Gemini AI와 실시간 대화
- 🔧 **코드 완성** - 코드 자동 완성 및 개선
- 📝 **코드 리뷰** - 코드 품질 분석 및 제안
- 🚀 **다양한 모델 지원** - Gemini Pro, Gemini 1.5 Pro/Flash

## 설치

```bash
# 저장소 클론
git clone https://github.com/hwkim3330/vscode.git
cd vscode

# 의존성 설치 (현재는 내장 모듈만 사용)
npm install
```

## 설정

### 방법 1: Gemini API Key 사용 (추천)

1. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 발급
2. 환경 변수 설정:
```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 방법 2: Google OAuth2 사용

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서 OAuth2 자격 증명 생성
2. 환경 변수 설정:
```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
```

## 사용법

### 인증

```bash
# 설정 가이드 보기
npm run setup

# 로그인
npm run login

# 인증 상태 확인
npm run status
```

### Gemini AI 사용

```bash
# 대화형 채팅 모드
npm start
# 또는
npm run chat

# 단일 질문
node gemini-app.js ask "JavaScript에서 배열을 정렬하는 방법은?"

# 코드 완성
node gemini-app.js complete example.js

# 코드 리뷰
node gemini-app.js review mycode.js

# 사용 가능한 모델 확인
node gemini-app.js models
```

### 채팅 모드 명령어

채팅 모드에서 사용 가능한 명령어:
- `/model <name>` - 모델 변경 (gemini-pro, gemini-1.5-pro, gemini-1.5-flash)
- `/code` - 코드 완성 모드
- `/review` - 코드 리뷰 모드
- `/clear` - 대화 초기화
- `exit` - 종료

## 테스트

```bash
# API 연결 및 기능 테스트
npm test
```

## 파일 구조

```
vscode/
├── google-gemini-auth.js    # Google OAuth2/API Key 인증
├── gemini-app.js            # Gemini AI 메인 애플리케이션
├── test-gemini.js           # 테스트 스위트
├── package.json             # 프로젝트 설정
└── README.md               # 이 파일
```

## 지원 모델

- **gemini-pro**: 텍스트 생성에 최적화
- **gemini-pro-vision**: 이미지 + 텍스트 처리
- **gemini-1.5-pro**: 최신 고성능 모델
- **gemini-1.5-flash**: 빠른 응답 속도 (기본값)

## 보안 주의사항

- API 키를 코드에 직접 포함하지 마세요
- 환경 변수나 설정 파일을 사용하세요
- `.gitignore`에 인증 파일 추가 필수

## 문제 해결

### API 키가 작동하지 않는 경우
1. API 키가 올바른지 확인
2. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 활성화 확인
3. 할당량 제한 확인

### OAuth2 인증 실패
1. Client ID와 Secret이 올바른지 확인
2. Redirect URI가 `http://localhost:1456/callback`로 설정되었는지 확인
3. 필요한 API가 활성화되었는지 확인

## 라이선스

MIT