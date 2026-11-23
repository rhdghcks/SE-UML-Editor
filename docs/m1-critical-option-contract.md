# [M1 계약 제안] critical/option 공통 모델 및 분기 검증

팀원분들께 시퀀스의 `critical`과 `option`을 공통 모델에 추가하는 변경안을 검토해 주시길 부탁드립니다.

## 변경 전후

- 현재 `SequenceBlock.operator`는 `alt | opt | loop`입니다.
- 여기에 `critical`을 추가하고 기존 `SequenceBranch`를 재사용합니다. `branches[0]`은 `critical`의 기본 구역입니다. 뒤에 이어지는 각 `option`의 조건 문구와 내부 단계는 소스 순서대로 `branches[1...]`에 들어갑니다.
- 모든 블록에는 기본 분기가 하나 이상 필요합니다. `critical`은 option이 0개 이상이고, `alt`는 else가 0개 이상입니다. `loop`와 `opt`는 분기 하나입니다.
- `option`과 `else`는 현재 열려 있는 블록이 각각 `critical`과 `alt`일 때만 허용합니다. 그 외 위치에서는 원문 행 번호를 진단에 표시합니다. 중첩 블록의 `end`는 가장 안쪽 블록을 닫습니다.
- 직렬화기는 `critical`의 두 번째 분기부터 `option`으로 출력합니다.

## 호환성과 마이그레이션

기존 `IParser.parse(source): DiagramModel`, `DiagramStore` 호출 방식, ID와 `%% @se-uml-layout` v1 형식을 유지합니다. 기존 파일을 변환할 필요가 없습니다. `critical`을 담은 새 입력은 이 타입 확장을 반영한 버전에서 지원됩니다.

## 담당자별 확인 요청

- M1은 타입, 검증, 파싱, 직렬화 왕복을 확인합니다.
- M2와 M3는 참여자 ID, 배치 및 드래그 계약에 블록 종류별 가정이 있는지 확인해 주세요.
- M4는 미지원 입력이나 잘못된 분기에서 마지막 정상 모델과 편집 원문을 유지하는지 확인해 주세요.
- M5는 편집 캔버스에서 `option` 라벨과 각 분기가 올바른 `critical`에 표시되는지 확인해 주세요. 프레임 도형과 구역 크기 계산은 M5 후속 작업입니다.
- M6는 기존 `.mmd` 저장 및 재열기 흐름으로 `critical`과 `option`이 보존되는지 확인해 주세요.

## 검수 입력

```text
sequenceDiagram
  participant A
  participant B
  critical 주문 승인
    A->>B: 요청
  option 시간 초과
    B-->>A: 대기
  option 권한 거부
    B-->>A: 실패
  end
```

option 없는 critical, 중첩 critical, 여러 option의 순서, 최상위 option의 오류 행, 파싱 → 직렬화 → 재파싱을 확인합니다.
