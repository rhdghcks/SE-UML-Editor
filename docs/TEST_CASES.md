# 테스트 케이스 추적표

테스트 케이스의 원본은 팀의 [소프트웨어 테스트 계획 및 테스트 케이스 명세서](https://app.notion.com/p/42369c9c21838147a203fe2c5e588a5a)(Notion)다. 이 문서는 명세서의 케이스를 저장소의 자동 테스트에 연결하고, 저장소에서 새로 도출해 명세서 등록을 기다리는 케이스와 확정되지 않은 요구사항을 관리한다. ID 형식과 도출 규칙은 [TESTING.md](TESTING.md) 3장을 따른다.

단위부터 인수까지 전체 테스트와 요구사항의 연결, 실제 통과 여부는 자동 생성 추적표(4장)에서 본다. 아래 표의 "자동화 범위"는 테스트가 있는지와 명세서의 기대 결과를 얼마나 검사하는지만 나타내며 합격 여부가 아니다.

## 1. 명세서 케이스와 자동 테스트 대응

자동화 범위: **충족** 기대 결과를 모두 검사 · **부분** 일부만 검사(빠진 부분을 비고에 적음) · **없음** 자동 테스트 없음 · **미구현** 기능이 아직 없음

| ID | 입력 및 절차 (명세서) | 기대 결과 (명세서) | 자동 테스트 | 자동화 범위 | 비고 |
| --- | --- | --- | --- | --- | --- |
| UT-01 | 정상 Class 코드 입력 | 클래스 및 관계 모델 생성 | [basic-mermaid-parser.test.ts](../tests/unit/adapters/basic-mermaid-parser.test.ts) | 충족 | |
| UT-02 | 정상 Sequence 코드 입력 | 참여자 및 메시지 생성 | [basic-mermaid-parser.test.ts](../tests/unit/adapters/basic-mermaid-parser.test.ts) | 충족 | |
| UT-03 | 빈 코드, 잘못된 문법, 미지원 문법 입력 | 명세에 따른 오류 처리, 충돌 없음 | [basic-mermaid-parser.test.ts](../tests/unit/adapters/basic-mermaid-parser.test.ts) | 충족 | 빈 코드는 '헤더와 입력 전처리' 묶음에서 검사 |
| UT-04 | 객체 29/30/31개 입력 | 29/30 허용, 31 제한 | [diagram-store.test.ts](../tests/unit/core/diagram-store.test.ts), [core-modules.test.ts](../tests/integration/core/core-modules.test.ts) | 부분 | 30 허용·31 거부만 검사. 29개 없음 |
| UT-05 | 편집 6회 후 Undo 4/5/6회 시도 | 최대 5회 복원 | [diagram-store.test.ts](../tests/unit/core/diagram-store.test.ts) | 충족 | 편집 7회 → Undo 5회 후 더 되돌릴 수 없음을 검사 |
| UT-06 | 객체 추가/삭제 | 모델 참조 무결성 및 기존 배치 유지 | [diagram-store.test.ts](../tests/unit/core/diagram-store.test.ts) | 부분 | 추가 시 배치 유지만 검사. 삭제 시 참조 정리는 통합 m4-flow에서 검사 |
| IT-01 | 코드 수정 | GUI 갱신 | — | 없음 | 시스템 ST-07·ST-09에서만 확인 |
| IT-02 | GUI 객체 이동/편집 | 코드 또는 배치 메타데이터 반영 | [DiagramCanvas.test.tsx](../tests/integration/ui/DiagramCanvas.test.tsx) | 충족 | |
| IT-03 | A를 (300,200)으로 이동 후 B 추가 | A 좌표 유지, B 자동 배치 | [m2-layout.test.ts](../tests/integration/adapters/m2-layout.test.ts) | 충족 | 좌표는 (400,200)으로 검사 |
| IT-04 | 색상 변경 후 Undo | 기존 색상 복원 | — | 없음 | 시스템 ST-07에서만 확인 |
| IT-05 | 저장 후 재실행 및 열기 | 코드·좌표·색상 복원 | [file-roundtrip.test.ts](../tests/integration/adapters/file-roundtrip.test.ts), [core-modules.test.ts](../tests/integration/core/core-modules.test.ts) | 충족 | 크기와 꺾임점까지 LocalFileManager로 저장하고 새 Store에서 열어 검사. 브라우저 흐름은 ST-20 |
| IT-06 | 문법 오류 발생 후 정상 코드 입력 | 정상 렌더링 복귀 | [App.test.tsx](../tests/integration/ui/App.test.tsx) | 부분 | 오류 표시와 마지막 정상 캔버스 유지만 검사. 정상 코드로 복귀는 없음 |
| IT-07 | 연속 입력으로 비동기 레이아웃 경쟁 유발 | 최신 입력만 반영 | [m2-layout.test.ts](../tests/integration/adapters/m2-layout.test.ts) | 부분 | 수동 이동 뒤 늦은 배치 결과를 버리는지만 검사. 연속 코드 입력은 없음 |
| ST-01 | Class/Sequence 객체 1/10/20/30개에서 수정 후 실제 렌더 시간 반복 측정 | 1초 이내 | [m2-layout.spec.ts](../tests/system/m2-layout.spec.ts) | 부분 | 30개만 1회 측정. 1/10/20개와 반복 측정은 없음 |
| ST-02 | PNG/JPG 출력 후 파일 열기 | 정상 이미지 생성 | [export.spec.ts](../tests/system/export.spec.ts) | 충족 | 파일 서명·크기·픽셀로 검사. 클래스·시퀀스, 객체 1개와 30개 |
| ST-03 | 설치 후 네트워크 차단 및 실행 | 오프라인 기능 정상 | — | 없음 | 수동 테스트 대상 |
| ST-04 | 코드 직접 입력 없이 GUI 편집 | 지원 기능 정상 | — | 없음 | m3-editing 시스템 테스트가 GUI 조작을 검사하지만 시작 코드는 입력함 |
| ST-05 | 색상·폰트·스냅 검증 | 확정 명세 충족 | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) | 부분 | 스냅만 검사. 폰트 크기는 미정, 색상은 ST-07 |
| ST-06 | Mermaid 파일 가져오기 | 모델 및 화면 정상 복원 | — | 미구현 | 가져오기 메뉴(기능명세 1.4) 없음. `.mmd` 열기로 대신할지 확인 필요 |
| AT-01 | 가져오기 → 편집 → 이동 → 색상 → 저장 → 재열기 → 출력 | 사용자 작업 완료 | — | 미구현 | 가져오기 미구현으로 실행 불가(BLOCKED) |

## 2. 저장소에서 추가한 케이스 (명세서 등록 필요)

명세서에 아직 없는 케이스다. 명세서에 등록하면 이 표에서 1장으로 옮긴다.

| ID | 레벨 | 요구사항 | 관련 기능 | 우선순위 | 기법 | 사전 조건 | 절차 요약 | 기대 결과 | 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ST-07 | 시스템 | FR-1, FR-7, FR-8 | 1.1, 1.3, 4.1, 5.3 | P1 | 사용자 흐름 | 편집기를 연 상태 | 클래스 코드 입력 → 노드 선택 → 색상 `#e8eefb` 적용 → Undo → Mermaid 미리보기 → 시퀀스 예제 | 색상 적용 시 코드에 `@se-uml-layout` 주석이 생기고, Undo 후 원문이 입력 전과 같다. 두 예제 모두 미리보기 SVG가 보인다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ST-08 | 시스템 | FR-1 | 1.2 | P2 | 오류 추측 | 편집기를 연 상태 | 정상 시퀀스 코드 입력 → 주석·빈 줄 뒤에 활성화하지 않은 `deactivate B` 추가 | `7행: 활성화되지 않은 참여자: B` 오류가 표시되고 이전 메시지 `keep`이 캔버스에 남는다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ST-09 | 시스템 | FR-5 | 1.3, 1.2 | P2 | 사용자 흐름 | 편집기를 연 상태 | 클래스 코드(`Order : +total()`, `Order --> Customer`) 입력 → alt/loop가 중첩된 시퀀스 코드 입력 → `break` 블록이 든 코드 입력 | 한 줄 멤버와 관계 대상 클래스, 별칭 참여자와 블록 라벨이 캔버스에 보인다. `break`는 `3행` 오류로 표시되고 마지막 정상 다이어그램이 유지된다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ST-10 | 시스템 | FR-5 | 1.3 | P2 | 사용자 흐름 | 편집기를 연 상태 | 중첩 `critical`과 `option` 두 개가 있는 시퀀스 코드 입력 → Mermaid 미리보기 → option 라벨 수정 | 캔버스에 critical·option 라벨이 모두 보이고, 미리보기 SVG에 수정 전후 라벨이 반영된다. | [editor.spec.ts](../tests/system/editor.spec.ts) |
| ST-11 | 시스템 | FR-3, FR-10 | 3.1, 2.3 | P1 | 사용자 흐름 | 편집기를 연 상태 | `@se-uml-route` 꺾임점이 있는 `A --> B` 코드 입력 → 코드에 `B --> C` 추가 | 간선이 저장된 꺾임점(320,350)을 지나고, 관계를 추가한 뒤에도 유지되며 노드가 3개 보인다. | [m2-layout.spec.ts](../tests/system/m2-layout.spec.ts) |
| ST-12 | 시스템 | FR-8 | 5.1 | P1 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드를 `classDiagram\n  class Invoice`로 바꿈 → 코드 영역에서 Ctrl+S | `diagram.mmd`가 받아지고 내용이 입력 코드 + `@se-uml-layout` 주석이다. '저장 안 됨' 표시가 사라진다. | [file.spec.ts](../tests/system/file.spec.ts) |
| ST-13 | 시스템 | FR-13 | 5.2 | P2 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드 편집 → 시퀀스 예제 → 확인 창에서 취소 | 확인 창이 뜨고, 취소 후 편집한 코드가 그대로다. | [file.spec.ts](../tests/system/file.spec.ts) |
| ST-14 | 시스템 | FR-8 | 5.3, 3.2 | P1 | 사용자 흐름 | 클래스 예제를 연 상태 | 코드 입력 → 색상 적용 → 코드 영역에서 Ctrl+Z 두 번 → Ctrl+Shift+Z 두 번 | Ctrl+Z가 GUI 편집과 코드 편집을 차례로 되돌리고, Ctrl+Shift+Z 두 번 뒤 색상 적용 상태로 돌아온다. | [file.spec.ts](../tests/system/file.spec.ts) |
| ST-15 | 시스템 | FR-2 | 2.1, 5.3 | P1 | 오류 추측 | 스냅을 끈 상태 | 드래그 중 Escape → 드래그 후 마지막 좌표로 pointerup → Undo → 드래그 중 pointercancel | Escape와 pointercancel은 코드를 바꾸지 않는다. pointerup은 마지막 좌표(130, 140)로 확정되고 Undo로 원래 코드가 된다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| ST-16 | 시스템 | FR-2, FR-12 | 2.1, 3.1, 5.3 | P1 | 오류 추측 | 자동 배치 모듈 응답을 지연시킨 상태 | `class Invoice` 입력 → 드래그 도중 자동 배치 완료 → 놓기 → Undo | 드래그가 취소되지 않고 놓은 위치로 확정되며, 자동 배치 결과가 Undo 단계를 추가하지 않는다. | [m3-layout-race.spec.ts](../tests/system/m3-layout-race.spec.ts) |
| ST-17 | 시스템 | FR-9, FR-10 | 2.3, 2.2, 5.3 | P1 | 사용자 흐름 | 클래스 A, B를 배치한 상태 | 간선 중간 드래그 → 꺾임점 드래그 → 꺾임점 삭제 → 꺾임점 추가 → 경로 초기화 → Undo | 코드에 `@se-uml-route`가 생기고 꺾임점이 2개다. 노드 A는 움직이지 않는다. 삭제·추가·초기화가 꺾임점 수(1·2·0)에 반영되고 Undo 후 2개로 돌아온다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| ST-18 | 시스템 | FR-10, FR-3 | 2.3, 3.1 | P2 | 사용자 흐름 | 편집기를 연 상태 | `critical`/`option` 시퀀스 입력 → 메시지 간선 꺾기 → 코드에서 블록 라벨 수정 | 라벨을 수정한 뒤에도 간선 경로가 같고 `option: retry` 라벨이 보인다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| ST-19 | 시스템 | FR-11 | 2.4, 5.3, 5.2 | P1 | 사용자 흐름, 왕복 | 멤버가 많은 클래스 A를 연 상태 | 모서리 핸들로 크기 조절 → Undo → 텍스트에 맞추기 → 저장 → 다른 예제 → 저장 파일 열기 | 크기가 255×175로 바뀌고 Undo로 원래 너비가 된다. 텍스트에 맞추기 후 높이 150이고, 다시 연 파일에서 같은 크기가 복원된다. | [m3-editing.spec.ts](../tests/system/m3-editing.spec.ts) |
| AT-02 | 인수 | FR-3 (AC-3-2) | 3.1, 2.1, 3.2 | P1 | 합격 기준 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 코드를 Invoice, Order 두 클래스로 변경 | Invoice가 드래그한 위치에 있고 Order가 캔버스에 보인다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |
| AT-03 | 인수 | FR-13 (AC-8) | 5.1, 5.2 | P1 | 합격 기준, 왕복 | `classDiagram\nclass Invoice` 입력 | Invoice 드래그 → 저장 → 다른 예제 열기 → 저장 파일 다시 열기 | Invoice가 드래그한 위치에 있다. | [manual-layout.feature](../tests/acceptance/features/manual-layout.feature) |
| IT-08 | 통합 | FR-8 | 5.1, 5.2, 9.2 | P2 | 경계값(0개), 현재 동작 고정 | 선언만 있는 `sequenceDiagram` | 저장 → 새 Store에서 열기 | 저장되고, 다시 열면 원문이 `sequenceDiagram` 그대로이며 객체가 0개다. | [file-roundtrip.test.ts](../tests/integration/adapters/file-roundtrip.test.ts) |
| IT-09 | 통합 | FR-8, FR-13, FR-5 | 5.2, 1.3, 2.3 | P1 | 왕복 | `critical` 블록에 `option` 2개, 첫 메시지에 꺾임점 | 저장 → 새 Store에서 열기 | 모델이 같고 블록 라벨 `결제 승인 / 시간 초과 / 권한 거부`와 꺾임점이 그대로다. ([m1-critical-option-contract.md](m1-critical-option-contract.md)의 M6 확인 요청) | [file-roundtrip.test.ts](../tests/integration/adapters/file-roundtrip.test.ts) |
| IT-10 | 통합 | FR-13 | 5.2 | P2 | 동등 분할(무효), 경계값 | 클래스 예제를 연 상태 | ① PNG 서명으로 시작하는 바이너리 파일 열기 ② 0바이트 파일 열기 | "열 수 없는 파일이에요"와 행 번호가 보이고 현재 문서와 저장 위치가 그대로다. | [App.test.tsx](../tests/integration/ui/App.test.tsx) |
| IT-11 | 통합 | FR-13 | 5.2 | P2 | 오류 추정(인코딩) | 클래스 예제를 연 상태 | Windows 메모장 형식(UTF-8 BOM + CRLF, 한글 멤버) 파일을 LocalFileManager로 열기 | 오류 없이 열리고 코드 첫 글자가 BOM(U+FEFF)이 아니다. | [App.test.tsx](../tests/integration/ui/App.test.tsx) |
| IT-12 | 통합 | FR-13 | 5.2 | P1 | 상태 전이(늦은 비동기 결과) | 파일 읽기를 지연시킨 상태 | ① 읽는 사이 코드 편집 ② 읽는 사이 Undo ③ 읽는 사이 자동 배치만 끝남 ④ 배치 주석이 있는 문서에 관계로 이어진 클래스를 입력한 직후 파일을 고르고, 읽는 사이 자동 배치가 주석을 다시 씀 ⑤ 두 파일을 연달아 고르고 먼저 고른 파일을 늦게 끝냄 | ①② 편집한 문서가 유지된다 ③④ 고른 파일이 열린다(회귀) ⑤ 마지막에 고른 파일만 열린다. | [App.test.tsx](../tests/integration/ui/App.test.tsx) |
| IT-13 | 통합 | FR-13, NFR-4 | 5.2, 9.2 | P1 | 경계값 | 클래스 예제를 연 상태 | 클래스 30개 파일 / 31개 파일 열기 | 30개는 열린다. 31개는 "열 수 없는 파일이에요 … 최대 30개" 오류가 나고 현재 문서가 그대로다. | [App.test.tsx](../tests/integration/ui/App.test.tsx) |
| IT-14 | 통합 | FR-4 | 6.1 | P2 | 경계값 | 내보내기를 대체한 App | 코드를 객체 0개 → 1개로 바꿈 → 내보내기 → 이미지 저장 | 0개에서 비활성, 1개가 되면 활성이고 그 1개가 든 문서를 PNG로 내보낸다. | [App.test.tsx](../tests/integration/ui/App.test.tsx) |
| UT-07 | 단위 | FR-4, FR-10, FR-11 | 6.1, 2.3, 2.4 | P1 | 블랙박스 | `Order --> Customer` | Order 크기를 260×140으로 바꾸고 간선에 꺾임점 2개 추가 → SVG 생성 | SVG의 Order 사각형이 260×140이고 간선 선이 꺾임점 (420,400), (610,400)을 지난다. | [canvas-svg-renderer.test.ts](../tests/unit/adapters/canvas-svg-renderer.test.ts) |
| UT-08 | 단위 | FR-4 | 6.1, 1.3 | P2 | 오류 추정(특수문자) | 별칭 `고객 😀`, 메시지 `x < y & "z"` | SVG 생성 | 한글·이모지는 그대로, `<`·`&`·`"`는 이스케이프되어 텍스트에 날것의 `&`·`<`가 없다. | [canvas-svg-renderer.test.ts](../tests/unit/adapters/canvas-svg-renderer.test.ts) |
| ST-20 | 시스템 | FR-8, FR-13, FR-3 | 5.1, 5.2, 3.2 | P1 | 사용자 흐름, 왕복 | 스냅을 끈 클래스 A, B | 간선 꺾기 → A 색상 `#dff2e5` → A 크기 조절 → B 이동 → Ctrl+S → 시퀀스 예제 → 저장 파일 열기 | 다시 연 화면의 노드 좌표·크기·색상과 간선 경로가 저장 전과 같고 '저장 안 됨'이 없다. | [file.spec.ts](../tests/system/file.spec.ts) |
| IT-15 | 통합 | FR-8 | 5.1 | P1 | 상태 전이, 경계값 | 가짜 저장 창 / 저장 창 없는 브라우저 | ① 세 번 저장 ② 두 번째 저장에서 저장 창 닫기 → 다시 저장 ③ 첫 쓰기 실패 → 다시 저장 ④ 저장 창 없이 두 번 저장 | ① 저장마다 저장 창이 뜨고 `diagram.mmd`, `diagram(1).mmd`, `diagram(2).mmd`를 제안하며 각각 새 파일에 쓴다 ②③ 실패한 저장은 번호를 올리지 않아 같은 이름을 다시 제안한다 ④ 같은 이름 순서로 다운로드한다. | [local-file-manager.test.ts](../tests/integration/adapters/local-file-manager.test.ts) |
| ST-21 | 시스템 | FR-8 | 5.1 | P1 | 사용자 흐름 | 저장 창이 없는 브라우저(다운로드) | 코드 입력 → Ctrl+S → 클래스 추가 → Ctrl+S | `diagram.mmd`와 `diagram(1).mmd` 두 파일이 받아지고 각각 그 시점의 코드와 배치 주석을 담는다. | [file.spec.ts](../tests/system/file.spec.ts) |

## 3. 이전 ID 대응표

2026-11-25에 명세서 ID 체계로 바꾸기 전의 ID다. 예전 PR·커밋에서 이전 ID를 찾을 때 쓴다.

| 이전 ID | 새 ID |
| --- | --- |
| TC-CMN-9.2-01 | ST-01 |
| TC-CMN-9.2-02 | ST-01 |
| TC-EXPORT-6.1-01 | ST-02 |
| TC-EXPORT-6.1-02 | ST-02 |
| TC-CANVAS-2.1-01 | ST-05 |
| TC-CODE-1.1-01 | ST-07 |
| TC-CODE-1.2-01 | ST-08 |
| TC-CODE-1.3-01 | ST-09 |
| TC-CODE-1.3-02 | ST-10 |
| TC-SYNC-3.1-03 | ST-11 |
| TC-FILE-5.1-01 | ST-12 |
| TC-FILE-5.2-02 | ST-13 |
| TC-FILE-5.3-01 | ST-14 |
| TC-CANVAS-2.1-02 | ST-15 |
| TC-CANVAS-2.1-03 | ST-16 |
| TC-CANVAS-2.3-01 | ST-17 |
| TC-CANVAS-2.3-02 | ST-18 |
| TC-CANVAS-2.4-01 | ST-19 |
| TC-SYNC-3.1-02 | AT-02 |
| TC-FILE-5.2-01 | AT-03 |
| ~~TC-SYNC-3.1-01~~ | 삭제됨(2026-11-23). AT-02, AT-03과 같은 흐름 |

## 4. 요구사항 추적표 (자동 생성)

전체 테스트(단위·통합·시스템·인수)와 요구사항의 연결은 테스트 이름의 `SPEC-x.y` 태그로 자동 생성한다. 손으로 관리하지 않는다.

- 로컬: `npm run test:coverage && npm run test:e2e && npm run test:trace` → `reports/test-trace.md`
- CI: 실행 요약 화면의 "요구사항 추적표", 또는 Artifacts의 `test-trace-<커밋 SHA>`

추적표에는 기능명세 번호별 SRS 요구사항, 레벨별 테스트 수, 통과 여부, 기능별 전체 테스트 목록이 들어 있다. 생성 규칙은 [TESTING.md](TESTING.md) 3.4와 3.8에 있다.

## 5. 미정 목록

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
| 5.1, 5.2 | 저장 파일 형식·확장자(`.mmd` / `.md`) | 저장 `diagram.mmd`·`diagram(n).mmd`, 열기는 `.mmd`·`.txt` 허용 | |
