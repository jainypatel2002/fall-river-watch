declare module "@mapbox/point-geometry" {
  class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
    clone(): Point;
    add(point: Point): Point;
    sub(point: Point): Point;
    mult(value: number): Point;
    div(value: number): Point;
    rotate(angle: number): Point;
    matMult(matrix: [number, number, number, number]): Point;
    unit(): Point;
    perp(): Point;
    round(): Point;
    mag(): number;
    equals(point: Point): boolean;
    dist(point: Point): number;
    distSqr(point: Point): number;
    angle(): number;
    angleTo(point: Point): number;
    angleWith(point: Point): number;
    angleWithSep(x: number, y: number): number;
    static convert(point: Point | { x: number; y: number } | [number, number]): Point;
  }

  export = Point;
}
