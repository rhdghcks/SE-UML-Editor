# 테스트 케이스 추적표

시스템·인수 테스트 케이스의 절차와 기대 결과, 확정되지 않은 요구사항을 관리한다. 도출 규칙과 ID 형식은 [TESTING.md](TESTING.md) 3장을 따른다.

단위부터 인수까지 전체 테스트와 요구사항의 연결은 이 문서가 아니라 자동 생성 추적표(2장)에서 본다.

## 1. 테스트 케이스 목록

| TC ID | 레벨 | 요구사항 | 관련 기능 | 우선순위 | 기법 | 사전 조건 | 절차 요약 | 기대 결과 | 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CODE-1.1-01 | 시스템 | FR-1, FR-7, FR-8 | 1.1, 1.3, 4.1, 5.3 | P1 | 사용자 흐름 | 편집기를 연 상태 | 클래스 코드 입력 → 노드 선택 → 색상 `#e8eefb` 적용 → Undo → Mermaid 미리보기 → 시퀀스 예제 | 색상 적용 시 코드에 `@se-uml-layout` 주석이 생기고, Undo 후 원문이 입력 전과 같다. 두 예제 모두 미리보기 SVG가 보인다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ~~TC-SYNC-3.1-01~~ | 시스템 | — | — | — | — | — | **삭제됨(2026-11-23).** 인수 TC-SYNC-3.1-02, TC-FILE-5.2-01과 같은 흐름이라 TESTING.md 3.3에 따라 삭제했다. 번호는 다시 쓰지 않는다. | — | — |
| TC-SYNC-3.1-02 | 인수 | FR-3 (AC-3-2) | 3.1, 2.1, 3.2 | P1 | 합격 기준 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 코드를 Invoice, Order 두 클래스로 변경 | Invoice가 드래그한 위치에 있고 Order가 캔버스에 보인다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |
| TC-FILE-5.2-01 | 인수 | FR-13 (AC-8) | 5.1, 5.2 | P1 | 합격 기준, 왕복 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 저장 → 다른 예제 열기 → 저장 파일 다시 열기 | Invoice가 드래그한 위치에 있다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |
| TC-EXPORT-6.1-01 | 시스템 | FR-4 | 6.1, 2.1, 4.1 | P1 | 사용자 흐름 | `classDiagram\n  class Invoice` 입력 | Invoice에 색상 `#fff0ce` 적용 → 드래그 → 내보내기 → PNG → 이미지 저장 | `diagram.png`가 PNG 서명으로 시작하고, 크기가 캔버스의 2배이며, 드래그한 Invoice 위치의 픽셀이 `#fff0ce`다. 코드는 내보내기 전과 같다. | [export.spec.ts](../tests/system/export.spec.ts) |
| TC-EXPORT-6.1-02 | 시스템 | FR-4 | 6.1 | P1 | 사용자 흐름 | TC-EXPORT-6.1-01과 같음 | 내보내기 → JPG → 이미지 저장 | `diagram.jpg`가 JPEG 서명(`FF D8 FF`)으로 시작하고, 크기가 캔버스의 2배이며, 모서리 픽셀이 흰색(채널 250 이상)이다. | [export.spec.ts](../tests/system/export.spec.ts) |

## 2. 요구사항 추적표 (자동 생성)

전체 테스트(단위·통합·시스템·인수)와 요구사항의 연결은 테스트 이름의 `SPEC-x.y` 태그로 자동 생성한다. 손으로 관리하지 않는다.

- 로컬: `npm run test:coverage && npm run test:e2e && npm run test:trace` → `reports/test-trace.md`
- CI: 실행 요약 화면의 "요구사항 추적표", 또는 Artifacts의 `test-trace-<커밋 SHA>`

추적표에는 기능명세 번호별 SRS 요구사항, 레벨별 테스트 수, 통과 여부, 기능별 전체 테스트 목록이 들어 있다. 생성 규칙은 [TESTING.md](TESTING.md) 3.4와 3.8에 있다.

## 3. 미정 목록

`(※확인 필요)`, `(※기술 확인)` 때문에 TC를 확정하지 못한 항목이다. 확정되면 TC를 만들고 이 목록에서 지운다.

| 기능명세 | 미정 내용 | 현재 동작 고정 TC | 확인할 사람·시점 |
| --- | --- | --- | --- |
| 1.2 | 오류 상태에서 GUI 편집 허용 여부 | 통합: 오류 시 저장·추가 버튼 비활성 ([App.test.tsx](../tests/integration/ui/App.test.tsx)) | |
| 2.1 | 스냅 기준점(중심, 모서리, 그리드) | — | |
| 3.1 | 코드에서 이름을 바꾸면 같은 노드로 볼지 | ARCHITECTURE.md: 삭제 + 추가로 처리 | |
| 5.3 | redo 필요 여부, 코드 타이핑 Undo 단위 | 단위: 5단계 Undo와 Redo ([diagram-store.test.ts](../tests/unit/core/diagram-store.test.ts)) | |
| 6.1 | 해상도·배율(논문 인쇄용 고해상도) | 시스템: 2배 고정, 크기 = 캔버스 × 2 ([export.spec.ts](../tests/system/export.spec.ts)) | |
| 6.1 | 저장 위치 선택(OS 저장 창) | 미구현. 브라우저 다운로드(`diagram.png`, `diagram.jpg`)로 대체 | |
| 9.2 | 간선도 30개에 포함하는지 | 단위: 노드 30개 초과 거부 | |
