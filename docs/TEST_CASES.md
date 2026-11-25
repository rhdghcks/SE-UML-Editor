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
| TC-FILE-5.1-01 | 시스템 | FR-8 | 5.1 | P1 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드를 `classDiagram\n  class Invoice`로 바꿈 → 코드 영역에서 Ctrl+S | `diagram.mmd`가 받아지고 내용이 입력 코드 + `@se-uml-layout` 주석이다. '저장 안 됨' 표시가 사라진다. | [file.spec.ts](../tests/system/file.spec.ts) |
| TC-FILE-5.2-02 | 시스템 | FR-13 | 5.2 | P2 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드 편집 → 시퀀스 예제 → 확인 창에서 취소 | 확인 창이 뜨고, 취소 후 편집한 코드가 그대로다. | [file.spec.ts](../tests/system/file.spec.ts) |
| TC-FILE-5.3-01 | 시스템 | FR-8 | 5.3, 3.2 | P1 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드 입력 → 색상 적용 → 코드 영역에서 Ctrl+Z 두 번 → Ctrl+Shift+Z 두 번 | Ctrl+Z가 GUI 편집과 코드 편집을 차례로 되돌리고, Ctrl+Shift+Z 두 번 뒤 색상 적용 상태로 돌아온다. | [file.spec.ts](../tests/system/file.spec.ts) |
| TC-EXPORT-6.1-01 | 시스템 | FR-4 | 6.1, 2.1, 4.1 | P1 | 사용자 흐름 | `classDiagram\n  class Invoice` 입력 | Invoice에 색상 `#fff0ce` 적용 → 드래그 → 내보내기 → PNG → 이미지 저장 | `diagram.png`가 PNG 서명으로 시작하고, 크기가 캔버스의 2배이며, 드래그한 Invoice 위치의 픽셀이 `#fff0ce`다. 코드는 내보내기 전과 같다. | [export.spec.ts](../tests/system/export.spec.ts) |
| TC-EXPORT-6.1-02 | 시스템 | FR-4 | 6.1 | P1 | 사용자 흐름 | TC-EXPORT-6.1-01과 같음 | 내보내기 → JPG → 이미지 저장 | `diagram.jpg`가 JPEG 서명(`FF D8 FF`)으로 시작하고, 크기가 캔버스의 2배이며, 모서리 픽셀이 흰색(채널 250 이상)이다. | [export.spec.ts](../tests/system/export.spec.ts) |
| TC-CODE-1.3-01 | 시스템 | FR-5 | 1.3, 1.2 | P2 | 사용자 흐름 | 편집기를 연 상태 | 클래스 코드(`Order : +total()`, `Order --> Customer`) 입력 → alt/loop가 중첩된 시퀀스 코드 입력 → `break` 블록이 든 코드 입력 | 한 줄 멤버와 관계 대상 클래스, 별칭 참여자와 블록 라벨이 캔버스에 보인다. `break`는 `3행` 오류로 표시되고 마지막 정상 다이어그램이 유지된다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| TC-CODE-1.3-02 | 시스템 | FR-5 | 1.3 | P2 | 사용자 흐름 | 편집기를 연 상태 | 중첩 `critical`과 `option` 두 개가 있는 시퀀스 코드 입력 → Mermaid 미리보기 → option 라벨 수정 | 캔버스에 critical·option 라벨이 모두 보이고, 미리보기 SVG에 수정 전후 라벨이 반영된다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| TC-SYNC-3.1-03 | 시스템 | FR-3, FR-10 | 3.1, 2.3 | P1 | 사용자 흐름 | 편집기를 연 상태 | `@se-uml-route` 꺾임점이 있는 `A --> B` 코드 입력 → 코드에 `B --> C` 추가 | 간선이 저장된 꺾임점(320,350)을 지나고, 관계를 추가한 뒤에도 유지되며 노드가 3개 보인다. | [m2-layout.spec.ts](../tests/system/m2-layout.spec.ts) |
| TC-CMN-9.2-01 | 시스템 | NFR-1, NFR-4 | 9.2, 1.1, 1.2, 5.3 | P1 | 경계값 | 편집기를 연 상태 | 클래스 30개 코드 입력 → 31번째 클래스 추가 → Ctrl+Z | 30개가 1초 안에 그려진다. 31개째에서 `30` 오류가 표시되고 노드는 30개로 유지된다. Ctrl+Z 후 30개 코드로 돌아오고 오류가 사라진다. | [m2-layout.spec.ts](../tests/system/m2-layout.spec.ts) |
| TC-CMN-9.2-02 | 시스템 | NFR-1, NFR-4 | 9.2, 1.1, 1.2, 5.3 | P1 | 경계값 | 편집기를 연 상태 | 참여자 30명 시퀀스 코드로 TC-CMN-9.2-01과 같은 절차 | TC-CMN-9.2-01과 같다. | [m2-layout.spec.ts](../tests/system/m2-layout.spec.ts) |
| TC-CODE-1.2-01 | 시스템 | FR-1 | 1.2 | P2 | 오류 추측 | 편집기를 연 상태 | 정상 시퀀스 코드 입력 → 주석·빈 줄 뒤에 활성화하지 않은 `deactivate B` 추가 | `7행: 활성화되지 않은 참여자: B` 오류가 표시되고 이전 메시지 `keep`이 캔버스에 남는다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| TC-CANVAS-2.1-01 | 시스템 | FR-2 | 2.1 | P1 | 사용자 흐름 | 클래스 A, B를 배치한 상태 | B를 A 근처로 드래그 → Undo → 스냅 해제 후 같은 드래그 → 관계 간선 근처로 C 드래그 | 스냅 켜짐: B가 A 기준선(250, 70)에 붙는다. 스냅 해제: 놓은 위치(255, 75) 그대로다. C는 관련 없는 간선 높이(y 70)에 붙는다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| TC-CANVAS-2.1-02 | 시스템 | FR-2 | 2.1, 5.3 | P1 | 오류 추측 | 스냅을 끈 상태 | 드래그 중 Escape → 드래그 후 마지막 좌표로 pointerup → Undo → 드래그 중 pointercancel | Escape와 pointercancel은 코드를 바꾸지 않는다. pointerup은 마지막 좌표(130, 140)로 확정되고 Undo로 원래 코드가 된다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| TC-CANVAS-2.1-03 | 시스템 | FR-2, FR-12 | 2.1, 3.1, 5.3 | P1 | 오류 추측 | 자동 배치 모듈 응답을 지연시킨 상태 | `class Invoice` 입력 → 드래그 도중 자동 배치 완료 → 놓기 → Undo | 드래그가 취소되지 않고 놓은 위치로 확정되며, 자동 배치 결과가 Undo 단계를 추가하지 않는다. | [m3-layout-race.spec.ts](../tests/system/m3-layout-race.spec.ts) |
| TC-CANVAS-2.3-01 | 시스템 | FR-9, FR-10 | 2.3, 2.2, 5.3 | P1 | 사용자 흐름 | 클래스 A, B를 배치한 상태 | 라벨 더블클릭·직선 드래그 시 미생성 확인 → 선 직접 더블클릭 두 번 → 간선·꺾임점 드래그 → 삭제 → 선 더블클릭으로 추가 → 경로 초기화 → Undo | 코드에 `@se-uml-route`가 생기고 꺾임점이 2개다. 노드 A는 움직이지 않는다. 삭제·추가·초기화가 꺾임점 수(1·2·0)에 반영되고 Undo 후 2개로 돌아온다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| TC-CANVAS-2.3-02 | 시스템 | FR-10, FR-3 | 2.3, 3.1 | P2 | 사용자 흐름 | 편집기를 연 상태 | `critical`/`option` 시퀀스 입력 → 메시지 간선 꺾기 → 코드에서 블록 라벨 수정 | 라벨을 수정한 뒤에도 간선 경로가 같고 `option: retry` 라벨이 보인다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| TC-CANVAS-2.4-01 | 시스템 | FR-11 | 2.4, 5.3, 5.2 | P1 | 사용자 흐름, 왕복 | 멤버가 많은 클래스 A를 연 상태 | 모서리 핸들로 크기 조절 → Undo → 텍스트에 맞추기 → 저장 → 다른 예제 → 저장 파일 열기 | 크기가 255×175로 바뀌고 Undo로 원래 너비가 된다. 텍스트에 맞추기 후 높이 150이고, 다시 연 파일에서 같은 크기가 복원된다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |

| TC-CANVAS-2.5-01 | 시스템 | 추가 요청 | 2.5 | P2 | 사용자 흐름 | A, B 배치 주석이 있는 코드 입력 | 커서 아래 위치에서 휠 확대 → 빈 공간 드래그 | 커서 아래 문서 위치와 페이지 스크롤이 유지된다. 화면은 드래그한 45×30 CSS 픽셀만큼 이동하며 원문과 노드 x=60은 그대로다. | [m3-viewport.spec.ts](../tests/system/m3-viewport.spec.ts) |
| TC-CANVAS-2.5-02 | 시스템 | FR-2, FR-10, FR-8, 추가 요청 | 2.5, 2.1, 2.3, 5.3 | P1 | 상태 전이 | A(60,70), B 배치 후 스냅 해제 | 확대·화면 이동 → A를 문서 좌표로 (42,24) 이동 → Undo → 선 더블클릭 | A가 (102,94)가 된다. Undo는 A만 복구하고 보기를 유지한다. 새 꺾임점은 클릭한 선의 문서 좌표에 생긴다. | [m3-viewport.spec.ts](../tests/system/m3-viewport.spec.ts) |
| TC-CANVAS-2.5-03 | 시스템 | 추가 요청 | 2.5 | P2 | 상태 전이 | A, B 배치 주석이 있는 코드 입력 | + 버튼 → 빈 공간 드래그 중 Esc → 다시 화면 이동 → 보기 초기화 | +는 120%를 표시한다. Esc는 이동 전 보기로 돌아간다. 초기화는 다이어그램 전체를 여백 안에 맞추고 가운데 정렬하며 원문은 그대로다. | [m3-viewport.spec.ts](../tests/system/m3-viewport.spec.ts) |

| TC-CANVAS-2.5-04 | 시스템 | 추가 요청 | 2.5 | P2 | 오류 추측 | 긴 관계 라벨을 가진 클래스 A → B | 확대·화면 이동 → 보기 초기화 → 초기화 반복 | 노드와 긴 라벨이 모두 캔버스 안에 여백을 두고 보이며 가운데 정렬된다. 원문은 그대로이고 반복 초기화 결과가 같다. | [m3-viewport.spec.ts](../tests/system/m3-viewport.spec.ts) |
| TC-CANVAS-2.5-05 | 시스템 | 추가 요청 | 2.5 | P2 | 오류 추측 | 긴 critical 제목과 option을 가진 시퀀스 | 확대·화면 이동 → 보기 초기화 → 초기화 반복 | 참여자·메시지·생명선·긴 블록 제목이 모두 캔버스 안에 보인다. 원문은 그대로이고 반복 초기화 결과가 같다. | [m3-viewport.spec.ts](../tests/system/m3-viewport.spec.ts) |

| TC-CANVAS-2.1-04 | 시스템 | FR-2, FR-3, FR-13 | 2.1, 1.3, 5.3, 5.2 | P1 | 상태 전이, 왕복 | User(60,70)·Server(350,70)와 activate/deactivate·alt/else가 있는 시퀀스 | User를 Server 오른쪽으로 이동 → 확대 상태에서 Server 이동 → Undo/Redo → 저장 후 다른 예제로 전환 → 재열기 | activate/deactivate·alt/else 모두 오른쪽 끝을 같은 위치(139→429→529)에 맞춰 가장 왼쪽 생명선 바깥에 표시된다. 가장 왼쪽 참여자가 바뀌어도 같은 열을 유지하며 Undo/Redo·재열기로 위치가 복원된다. | [m3-sequence-annotations.spec.ts](../tests/system/m3-sequence-annotations.spec.ts) |

| TC-CANVAS-2.2-01 | 시스템 | FR-9, FR-3, FR-8, FR-13 | 2.2, 1.3, 5.3, 5.2, 3.1 | P1 | 상태 전이, 왕복 | User·Server와 활성화·분기가 있는 시퀀스 | 첫 선을 100 아래로 드래그 → Undo/Redo → 코드 재편집 → User를 Server 오른쪽으로 이동 → 저장·재열기 | 첫 화살표는 y=300, 꺾임점 0개, 양 끝은 생명선 위다. activate 설명은 y=324, 후속 메시지는 y=348이다. 코드·저장 복원 후에도 같은 위치와 설명 연결을 유지한다. | [m3-sequence-drag.spec.ts](../tests/system/m3-sequence-drag.spec.ts) |
| TC-CANVAS-2.2-02 | 시스템 | FR-9, FR-10, FR-8 | 2.2, 2.3, 2.5, 5.3 | P1 | 상태 전이 | 시퀀스 예제를 확대·화면 이동한 상태 | 선을 60 아래로 이동 → 더블클릭으로 점 1개 추가 → 점 이동 → 선 전체를 40 아래로 이동 → 초기화 → Undo → 드래그 중 Esc | 수직 이동만으로 점이 늘지 않는다. 점이 있는 경로는 모양을 유지하며 이동한다. 초기화는 높이·점을 함께 복구하고 Undo로 되돌리며 취소는 코드를 바꾸지 않는다. | [m3-sequence-drag.spec.ts](../tests/system/m3-sequence-drag.spec.ts) |

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
| 5.1, 6.1 | OS 저장 창 지원 브라우저 범위 | Chromium 계열만 저장 창, 나머지는 다운로드로 대체. 저장 창 자체는 자동화할 수 없어 통합 테스트가 가짜 저장 창으로 검증 ([local-file-manager.test.ts](../tests/integration/adapters/local-file-manager.test.ts), [download-blob.test.ts](../tests/integration/adapters/download-blob.test.ts)). 시스템 테스트는 다운로드 경로만 검증 | |
| 5.1 | 저장하지 않고 닫을 때 확인 | 통합: 변경이 있을 때만 beforeunload 경고 ([App.test.tsx](../tests/integration/ui/App.test.tsx)) (현재 동작 고정) | |
| 9.2 | 간선도 30개에 포함하는지 | 단위: 노드 30개 초과 거부 | |
