# 팀 개발 계약

처음 실행하면 시퀀스 예제가 열린다. 클래스 예제로 전환해 객체를 추가하고 드래그한 뒤 코드 맨 아래 주석을 확인해 보자. 일반 코드 한 줄을 수정해도 기존 ID의 좌표가 유지되어야 한다. 이 흐름이 각 담당 모듈의 통합 기준이다.

## 환경과 디렉터리

Node.js 22.12 이상(22 LTS 권장)에서 아래 명령을 실행한다. 공통 기반 PR 병합 전에는 feat/shared-ts-core를 체크아웃한다.

```sh
git clone https://github.com/rhdghcks/SE-UML-Editor.git
cd SE-UML-Editor
git switch feat/shared-ts-core
npm install
npm run dev
```

| 경로 | 담당 내용 |
| --- | --- |
| src/core/types.ts, contracts.ts | 공유 타입, 모듈 입출력 |
| src/core/diagram-store.ts, validation.ts | 편집 명령, 참조·배치 검증, 구독과 이력 |
| src/core/layout-metadata.ts | 배치 주석 v1 읽기·쓰기 |
| src/adapters/basic-mermaid-*.ts | 제한된 Mermaid 문법의 파싱·직렬화 |
| src/adapters/grid-layout.ts | 새 객체 배치 |
| src/adapters/mermaid-renderer.ts, local-file-manager.ts | 공식 SVG 생성, 브라우저 파일 입출력 |
| src/ui/App.tsx | 어댑터 조립, 파일 요청, 코드 입력, 툴바 |
| src/ui/DiagramCanvas.tsx, MermaidPreview.tsx | 편집 SVG 포인터 처리, 공식 렌더러 결과 표시 |
| src/**/*.test.ts, tests/editor.spec.ts | Vitest 단위·코어 통합 테스트, 실제 Chromium 테스트 |
| docs/, AGENTS.md | 설계 결정, 개발 규칙 |

## 호출 계약

동기 메서드는 실패 시 Error를 던진다. 예외적으로 updateSource는 편집 중 실패한 원문과 오류를 스냅샷에 게시한다. 비동기 어댑터는 Promise를 반환하고 실패하면 reject한다. UI는 늦게 도착한 결과가 최신 입력을 덮지 않게 해야 한다.

| 모듈 | 입력 → 출력 | 담당자 경계 |
| --- | --- | --- |
| IParser | parse(source) → DiagramModel | 행 번호가 있는 문법 오류. 주석을 제외한 미지원 구문을 조용히 버리지 않는다. |
| ISerializer | serialize(model) → string | 의미 코드 생성. 저장할 원문을 재작성하는 데 쓰지 않는다. |
| ILayoutEngine | layout(model, previous) → LayoutMap | 남아 있는 ID만 복사하고 신규 좌표를 계산한다. 입력을 변경하지 않는다. |
| IRenderer<T> | render(document) → Promise<T> | MermaidRenderer의 T는 SVG 문자열. 캔버스 이벤트는 렌더러 밖에서 처리한다. |
| IDiagramStore | getSnapshot, subscribe, canUndo, canRedo, getPersistedSource | 동일 리비전은 동일 스냅샷 참조. 구독 해제 함수를 반환한다. |
| IDiagramEditor | openSource/updateSource/addNode/moveNode/resizeNode/setNodeColor/undo/redo → void | 명령 하나당 성공 상태 한 번. DiagramStore 한 인스턴스가 읽기와 쓰기 계약을 구현한다. |
| IFileManager | read(Blob) → Promise<string>, write(source) → Promise<void> | 파일 선택은 UI 소유. 쓰기 성공은 브라우저에 다운로드를 요청했다는 뜻이다. |
| IImageExporter | export(document, 'png' 또는 'jpeg') → Promise<Blob> | 현재 계약만 있다. JPEG 흰 배경, MIME 및 해상도 검증을 구현 PR에 포함한다. |
| ISnapStrategy | snap(point, id, layout) → LayoutChange | 동기 좌표 변환. Store 생성자의 선택적 네 번째 인수다. |

## 타입과 구현 예제

DiagramModel.kind를 먼저 좁힌다. class면 nodes와 relations, sequence면 participants와 steps가 있다. 모델의 name은 코드 식별자이고 참여자의 displayName은 화면 이름이다. 위치는 layout[id]에서 찾는다. 스냅샷에서 받은 객체나 배열은 수정할 수 없다. 변경은 editor의 공개 메서드로 요청한다.

다음 구현을 src/adapters/grid-snap.ts에 두면 중앙 상태나 캔버스를 수정할 필요 없이 주입할 수 있다. 20단위 그리드는 예시이며 최종 스냅 기준은 고객 확인 사항이다.

```ts
import type { ISnapStrategy } from '../core/contracts';

export const gridSnap: ISnapStrategy = {
  snap({ x, y }) {
    return { x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 };
  },
};
```

App.tsx의 생성 지점에서 `new DiagramStore(parser, layout, source, gridSnap)`으로 연결한다. 화면은 `useSyncExternalStore(store.subscribe, store.getSnapshot)`으로 구독한다. 포인터 이동 중 좌표는 UI가 임시로 보관하고 놓을 때 한 번 moveNode를 호출한다. origin은 init/code/gui/file/undo/redo 중 하나다. 구독자가 이벤트를 다시 편집 명령으로 내보내면 안 된다.

## 기능 추가와 계약 변경

1. 기능을 실행할 실제 경로와 담당 파일을 PR 초안에 적는다. 예를 들어 메시지 화살표를 추가하면 파서, 모델, 직렬화, 표시가 영향을 받는다.
2. 기존 타입으로 구현 가능하면 담당 어댑터와 테스트를 먼저 작성한다. 클래스·인터페이스 이름은 PascalCase, 함수와 변수는 camelCase, 어댑터 파일은 kebab-case, React 컴포넌트 파일은 PascalCase.tsx를 쓴다.
3. 공개 타입이나 메서드 변경이 필요하면 별도 제안 PR을 낸다. 변경 전후 입력·출력, 호출자 목록, v1 파일 처리, 회귀 테스트, 해당 모듈 담당자를 적는다. 팀 리뷰를 받은 뒤 구현 PR을 연결한다.
4. 작업 중 다른 모듈에서 발견한 결함은 최소 재현 입력과 함께 전달한다. 임시로 다른 모델을 복사하거나 as any로 계약을 우회하지 않는다. 동시에 App.tsx에 기능을 연결할 때는 한 사람이 조립 변경을 맡는다.

## 테스트와 Git

```sh
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:browser
```

단위 테스트는 구현 옆에 같은 이름의 .test.ts로 둔다. 파서는 지원 문법·오류 행·직렬화 왕복을, 배치는 기존 위치·새 노드·삭제를 검사한다. Store 테스트에서 실패 전후의 정상 모델과 이벤트 수를 비교한다. 브라우저 테스트는 빌드 결과를 preview로 띄우므로 빌드를 먼저 실행한다. 포인터 조작, 파일 다운로드, PNG 픽셀 등 DOM·브라우저에 의존하는 결과는 Vitest 통과만으로 검증했다고 쓰지 않는다.

공통 PR 병합 후 최신 main에서 `git switch -c feat/sequence-parser`처럼 담당 기능 브랜치를 만든다. 병합 전에 개발을 시작하면 공통 브랜치에서 분기하고 의존 PR을 설명에 적는다. 커밋은 기능과 해당 테스트를 묶는다. PR에는 입력 예시, 재현 방법, 검증 명령과 실제 결과, 남은 지원 범위를 적는다. 공통 PR 리뷰와 병합은 팀이 결정한다.

## AI에 전달할 작업 지시

각 프롬프트 앞에 다음 범위를 붙인다. “AGENTS.md와 docs/ARCHITECTURE.md를 읽고 types.ts와 contracts.ts의 기존 타입을 import해. 담당 파일과 테스트만 수정해. 공통 계약 변경이 필요하면 변경 이유와 영향을 먼저 제안해. 실행한 검증 결과와 미구현 범위를 구분해.”

| 담당 | 추가할 프롬프트 예시 |
| --- | --- |
| Parser | “basic-mermaid-parser.ts에서 새 시퀀스 구문의 입력 두 개를 지원해. 중첩 블록과 행 번호 오류를 테스트하고 미지원 입력은 원문으로 남겨.” |
| Serializer | “basic-mermaid-serializer.ts에서 합의된 모델의 Mermaid 출력을 구현해. alias와 중첩 else 순서가 parse → serialize → parse 후 같은지 확인해.” |
| Layout | “grid-layout.ts에서 신규 노드만 배치해. 수동 위치와 색상, 삭제된 ID 제거, 30개 입력을 테스트해.” |
| Renderer | “mermaid-renderer.ts의 IRenderer<string> 계약으로 SVG를 만들어. 입력 스냅샷을 수정하지 말고 Chromium에서 시퀀스 블록을 확인해.” |
| Editor | “DiagramCanvas.tsx에서 resizeNode에 연결할 핸들을 구현해. 포인터 해제 때 한 번 커밋하고 취소와 Undo를 테스트해. 조립 변경은 별도로 알려줘.” |
| Store | “diagram-store.ts에서 정해진 공개 명령의 실패 원자성을 검사해. 구독 해제, 동일 입력, redo 분기와 immutable snapshot 회귀 테스트를 작성해.” |
| File Manager | “local-file-manager.ts에서 한글과 CRLF가 든 파일을 왕복해. 읽기 실패 시 열린 문서를 보존하고 비동기 오류를 표시해.” |
| Image Exporter | “src/adapters에 IImageExporter 구현을 추가해. 수동 좌표가 적용된 이미지를 PNG/JPEG로 내보내고 MIME·크기·오류를 브라우저에서 검증해.” |

모듈별 구현 수준, 객체 수 계산과 ID 유지 범위, 1초 목표의 검증 조건은 [아키텍처 문서](ARCHITECTURE.md)에 정리했다.
