# 테스트 케이스 추적표

시스템·인수 테스트 케이스와 요구사항의 연결을 관리한다. 도출 규칙과 ID 형식은 [TESTING.md](TESTING.md) 3장을 따른다. 단위·통합 테스트는 이 표에 등록하지 않는다.

## 1. 테스트 케이스 목록

| TC ID | 레벨 | 요구사항 | 관련 기능 | 우선순위 | 기법 | 사전 조건 | 절차 요약 | 기대 결과 | 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-CODE-1.1-01 | 시스템 | FR-1, FR-7, FR-8 | 1.1, 1.3, 4.1, 5.3 | P1 | 사용자 흐름 | 편집기를 연 상태 | 클래스 코드 입력 → 노드 선택 → 색상 `#e8eefb` 적용 → Undo → Mermaid 미리보기 → 시퀀스 예제 | 색상 적용 시 코드에 `@se-uml-layout` 주석이 생기고, Undo 후 원문이 입력 전과 같다. 두 예제 모두 미리보기 SVG가 보인다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ~~TC-SYNC-3.1-01~~ | 시스템 | — | — | — | — | — | **삭제됨(2026-11-23).** 인수 TC-SYNC-3.1-02, TC-FILE-5.2-01과 같은 흐름이라 TESTING.md 3.3에 따라 삭제했다. 번호는 다시 쓰지 않는다. | — | — |
| TC-SYNC-3.1-02 | 인수 | FR-3 (AC-3-2) | 3.1, 3.2 | P1 | 합격 기준 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 코드를 Invoice, Order 두 클래스로 변경 | Invoice가 드래그한 위치에 있고 Order가 캔버스에 보인다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |
| TC-FILE-5.2-01 | 인수 | FR-13 (AC-8) | 5.1, 5.2 | P1 | 합격 기준, 왕복 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 저장 → 다른 예제 열기 → 저장 파일 다시 열기 | Invoice가 드래그한 위치에 있다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |

## 2. 요구사항별 커버리지

| 요구사항 | 기능명세 | 시스템·인수 TC | 상태 |
| --- | --- | --- | --- |
| FR-1 코드 기반 편집 | 1.1 | TC-CODE-1.1-01 | 일부 |
| FR-2 GUI 수동 편집·스냅 | 2.1 | TC-SYNC-3.1-02 (드래그만) | 스냅 미구현 |
| FR-3 양방향 동기화 | 3.1, 3.2 | TC-SYNC-3.1-02 | 있음 |
| FR-4 이미지 내보내기 | 6.1 | — | 미구현 |
| FR-5 다이어그램 종류 | 1.3 | TC-CODE-1.1-01 (클래스·시퀀스 전환) | 미지원 선언 안내 TC 없음 |
| FR-6 Mermaid 불러오기 | 1.4 | — | TC 없음 |
| FR-7 도형 색상 | 4.1 | TC-CODE-1.1-01 | 일부 |
| FR-8 로컬 저장·실행취소 | 5.1, 5.3 | TC-CODE-1.1-01, TC-FILE-5.2-01 | 5단계 경계 TC는 단위에만 있음 |
| FR-9 간선 이동 | 2.2 | — | 미구현 |
| FR-10 간선 꺾기 | 2.3 | — | 미구현 |
| FR-11 박스 크기 조절 | 2.4 | — | 미구현 |
| FR-13 이전 작업 불러오기 | 5.2 | TC-FILE-5.2-01 | 있음 |
| NFR-1 1초 반영 | 1.1, 3.1 | — | 인수 성능 TC 필요 |
| NFR-4 객체 30개 | 9.2 | — | 단위 경계 TC만 있음 |
| (제안) 코드 오류 처리 | 1.2 | — | 통합 TC만 있음 |

## 3. 미정 목록

`(※확인 필요)`, `(※기술 확인)` 때문에 TC를 확정하지 못한 항목이다. 확정되면 TC를 만들고 이 목록에서 지운다.

| 기능명세 | 미정 내용 | 현재 동작 고정 TC | 확인할 사람·시점 |
| --- | --- | --- | --- |
| 1.2 | 오류 상태에서 GUI 편집 허용 여부 | 통합: 오류 시 저장·추가 버튼 비활성 ([App.test.tsx](../tests/integration/ui/App.test.tsx)) | |
| 2.1 | 스냅 기준점(중심, 모서리, 그리드) | — | |
| 3.1 | 코드에서 이름을 바꾸면 같은 노드로 볼지 | ARCHITECTURE.md: 삭제 + 추가로 처리 | |
| 5.3 | redo 필요 여부, 코드 타이핑 Undo 단위 | 단위: 5단계 Undo와 Redo ([diagram-store.test.ts](../tests/unit/core/diagram-store.test.ts)) | |
| 9.2 | 간선도 30개에 포함하는지 | 단위: 노드 30개 초과 거부 | |
