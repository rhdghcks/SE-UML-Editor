# language: ko
기능: 수동 배치 보존
  사용자는 캔버스에서 옮긴 객체 위치가 코드 편집과 파일 왕복 후에도 유지되기를 원한다.

  배경:
    조건 사용자가 편집기를 열었다
    그리고 코드에 "classDiagram\nclass Invoice"를 입력했다

  @TC-SYNC-3.1-02 @FR-3 @AC-3-2 @SPEC-3.1
  시나리오: 코드에 객체를 추가해도 드래그한 위치가 유지된다
    만일 "Invoice"를 오른쪽 아래로 드래그한다
    그리고 코드를 "classDiagram\nclass Invoice\nclass Order"로 바꾼다
    그러면 "Invoice"는 드래그한 위치에 있다
    그리고 캔버스에 "Order"가 보인다

  @TC-FILE-5.2-01 @FR-13 @AC-8 @SPEC-5.2
  시나리오: 저장한 파일을 다시 열어도 드래그한 위치가 유지된다
    만일 "Invoice"를 오른쪽 아래로 드래그한다
    그리고 파일을 저장한 뒤 다른 예제를 열었다가 저장한 파일을 다시 연다
    그러면 "Invoice"는 드래그한 위치에 있다
