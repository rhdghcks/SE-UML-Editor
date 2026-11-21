# SE-UML-Editor 작업 규칙

작업 전 docs/TEAM_DEVELOPMENT.md의 담당 모듈 행과 docs/ARCHITECTURE.md의 데이터 흐름을 읽는다. 변경 파일과 완료 조건을 먼저 정한다.

- src/core/types.ts, contracts.ts, layout-metadata.ts의 공개 형식은 팀 계약이다. 변경이 필요하면 호출자, 호환성, 예제, 마이그레이션을 적은 별도 제안 PR을 먼저 리뷰받는다.
- 기존 타입을 import한다. 다른 모듈을 고치거나 타입 단언으로 실패를 숨기지 않는다. 통합 지점은 src/ui/App.tsx다.
- core는 순수 TypeScript다. React, Mermaid, 브라우저 파일 API는 어댑터와 UI에 둔다.
- 미지원 문법은 위치를 포함한 오류로 처리한다. 원본 문자열을 정규화해 덮어쓰지 않는다.
- GUI는 명령을 발행하고 구독자는 상태를 읽는다. 새 기능은 성공·실패 테스트를 담당 파일 옆에 추가한다.
- 작업 브랜치에만 커밋한다. PR에 검증 명령의 실제 결과와 남은 범위를 쓴다. 자동 병합하지 않는다.
