# 해외주식 양도세 합산 계산기

여러 증권사(키움증권, 한국투자증권, 메리츠증권 등)의 해외주식 실현손익을 합산해
기본공제 250만원과 세율 22%(지방세 포함)를 적용한 예상 양도소득세를 계산하는 안드로이드 앱.

- 증권사별 공제 전 양도차익 입력 → 합산 세액 계산
- 연말 매도 시뮬레이션 (보유 종목 매도 시 세액 변화)
- 연말 매도 마감·신고 일정 안내
- 데이터는 기기 안(localStorage)에만 저장

참고용 계산기이며 실제 세액은 증권사 신고대행 또는 홈택스 신고 결과를 따른다.

## 구조

- `www/` — 앱 화면 (HTML/CSS/JS)
- `android/` — Capacitor 안드로이드 프로젝트

## 빌드

필요: Node.js, JDK 21, Android SDK (platform 36, build-tools 35)

```sh
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# 결과: android/app/build/outputs/apk/debug/app-debug.apk
```

Windows에서 프로젝트 경로에 한글이 있으면 Gradle이 실패할 수 있으므로
`subst U: "<프로젝트 경로>"`로 영문 드라이브를 매핑한 뒤 `U:\android`에서 빌드한다.
