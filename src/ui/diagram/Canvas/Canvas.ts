//구현 필요 기능
//drawText : 입력 죄표에 입력 텍스트를 적음


export class Canvas {
  private svg: SVGGElement;

  constructor(svg: SVGGElement) {
    this.svg = svg;
  }

  private createElement(name: string) {
    return document.createElementNS('http://www.w3.org/2000/svg',
      name);
  }

  //높이와 너비가 있는 좌표를 중심점 좌표계로 변환해 리턴
  //대부분 객체는 좌측 위가 (0,0), 너비가 있는 경우 이를 변환
  private toCenterRect(x: number, y: number, w: number, h: number) {
    return {
      x: x - w / 2,
      y: -y - h / 2,
      w,
      h
    };
  }
  private replacePoint(x: number, y: number) {
    return {
      x: x,
      y: -y
    };
  }

  //객체의 속성들을 추가
  private setAttributes(
    element: SVGElement,
    props: Record<string, string>) {
    Object.entries(props).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  // SVG 내부의 모든 도형 삭제
  public clear() {
    this.svg.replaceChildren();
  }

  //사각형 그리기
  public drawRect(
    x: number, y: number, w: number, h: number,
    props: Record<string, string> = {}
  ) {
    const pos = this.toCenterRect(x, y, w, h);
    const rect = this.createElement('rect');

    this.setAttributes(rect, {
      ...props,
      x: String(pos.x),
      y: String(pos.y),
      width: String(pos.w),
      height: String(pos.h)
    });

    this.svg.appendChild(rect);
  }

  public drawLine(
    x1: number, y1: number, x2: number, y2: number,
    props: Record<string, string> = {}
  ) {
    const pos1 = this.replacePoint(x1, y1);
    const pos2 = this.replacePoint(x2, y2);

    const line = this.createElement('line');

    this.setAttributes(line, {
      stroke: "#000000",
      stokeWidth: "2",
      ...props,
      x1: String(pos1.x),
      y1: String(pos1.y),
      x2: String(pos2.x),
      y2: String(pos2.y),
    });

    this.svg.appendChild(line);
  }

}