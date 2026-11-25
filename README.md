# SE-UML-Editor

Mermaid 코드와 캔버스를 양방향으로 동기화하는 클래스·시퀀스 다이어그램 편집기

현재 저장소의 코드는 **팀 공통 개발 기반과 최소 동작 예제**입니다. 최종 Mermaid 파서, 자동 배치 엔진, 완전한 렌더러가 구현된 버전은 아닙니다.

## 실행

Node.js 20.19+ 또는 22.12+ 환경에서 실행합니다.

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소(보통 `http://localhost:5173`)로 접속하면 됩니다.

```bash
npm run typecheck
npm test
npm run build
```

## 현재 동작하는 것

- `classDiagram` / `sequenceDiagram` 기본 문법을 내부 모델로 변환
- 코드 수정 시 모델 및 캔버스 갱신. 파싱 오류 시 마지막 정상 다이어그램 유지
- 새 객체 이름을 입력하고 **객체 추가**를 누르면 클래스 또는 참여자 선언이 원문에 추가됩니다.
- **Mermaid 미리보기**는 별도의 읽기 전용 SVG를 그립니다. 수동 좌표 편집은 편집 캔버스를 사용합니다.
- 노드 드래그·색상 변경 시 좌표/스타일을 Mermaid 주석 메타데이터에 저장
- 코드에서 객체 추가 시 기존 노드의 수동 배치 유지
- 최대 30개 노드 및 최근 5단계 실행 취소/다시 실행
- `.mmd` 텍스트 파일 열기 및 저장 (Ctrl/Cmd+S, Chromium 계열은 처음 저장할 때 OS 저장 창)
- 저장하지 않은 변경이 있으면 열기·예제 전환·페이지 닫기 전에 확인
- Ctrl/Cmd+Z 실행 취소, Ctrl/Cmd+Shift+Z·Ctrl+Y 다시 실행
- **내보내기**로 편집 캔버스(수동 배치·색상 반영)를 PNG·JPG 이미지로 저장 (2배 해상도, JPG는 흰 배경, Chromium 계열은 OS 저장 창에서 위치 선택)
- 모듈별 교체를 위한 Parser / Serializer / Layout / Renderer / Editor 계약

## 현재 지원 문법 (예제 어댑터 한정)

- 클래스: `class`, `class A { ... }`, 인라인 멤버 `A : +save()`, 클래스 관계 `A --> B`, `A <|-- B` 등의 기본 표기
- 시퀀스: `participant`, `actor`, 기본 메시지 4종, `activate` / `deactivate`, 중첩 `alt` / `else` / `opt` / `loop`, `critical` / `option`
- **그 외 Mermaid 문법은 의도적으로 오류 처리합니다.** 지원하지 않는 구문을 무시해 다이어그램을 손상시키지 않도록 한 설계입니다.
- 캔버스는 구조 연결을 시험하기 위한 단순 SVG 미리보기입니다. 화살표, 그룹, 활성화의 완전한 UML 렌더링은 아직 구현되지 않았습니다. 이미지 내보내기도 이 단순 캔버스를 그대로 그립니다.

## 문서

- [아키텍처·데이터 계약](docs/ARCHITECTURE.md)
- [팀원 개발 가이드 및 코딩 도구 프롬프트](docs/TEAM_DEVELOPMENT.md)
- [프로젝트 요구사항 명세서](https://app.notion.com/p/2e269c9c218383dfb5380180743be5ea)
- [소프트웨어 테스트 계획 및 테스트 케이스 명세서](https://app.notion.com/p/42369c9c21838147a203fe2c5e588a5a)

각 팀원은 본인 모듈의 구현을 `src/adapters` 또는 새 기능 디렉터리에서 작성하고, `src/core`의 계약 변경이 필요한 경우 먼저 팀 전체에 공유해 주세요.
