import { Position, type Node, type NodeHandle } from "@xyflow/react"

const HANDLE_SIZE = 6
export const canvasHandleStyle = { width: HANDLE_SIZE, height: HANDLE_SIZE, boxSizing: "border-box" as const }

/** Public NodeHandle geometry keeps fixed-size controlled nodes connected across refreshes.
 * Fixed measured sizes also initialize culled nodes for React Flow camera fitting.
 * Coordinates match the rendered six-pixel handles and their half-size CSS translation.
 */
export function canvasNodeGeometry(width: number, height: number, vertical = false): Pick<Node, "width" | "height" | "style" | "handles" | "measured"> {
  const handles: NodeHandle[] = vertical ? [
    { type: "target", position: Position.Top, x: width / 2 - HANDLE_SIZE / 2, y: -HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
    { type: "source", position: Position.Bottom, x: width / 2 - HANDLE_SIZE / 2, y: height - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
  ] : [
    { type: "target", position: Position.Left, x: -HANDLE_SIZE / 2, y: height / 2 - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
    { type: "source", position: Position.Right, x: width - HANDLE_SIZE / 2, y: height / 2 - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
  ]
  return { width, height, measured: { width, height }, style: { width, height }, handles }
}
