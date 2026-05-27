type Point2D = [number, number]

export type MaskContourShape = {
  outline: Point2D[]
  holes: Point2D[][]
}

export type MaskContourMode = 'silhouette' | 'cutout' | 'loops'

export type MaskContourResult = {
  positions: number[]
  shapes: MaskContourShape[]
}

export type MaskDistanceFieldResult = {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

type ShapeDistanceFieldOptions = {
  minFieldWidth?: number
  maxFieldWidth?: number
  minFieldHeight?: number
  maxFieldHeight?: number
}

const LUMA_THRESHOLD = 0.5
const MIN_SAMPLE_WIDTH = 32
const MAX_SAMPLE_WIDTH = 256
const MIN_SAMPLE_HEIGHT = 32
const MAX_SAMPLE_HEIGHT = 256
const MIN_FIELD_WIDTH = 64
const MAX_FIELD_WIDTH = 256
const MIN_FIELD_HEIGHT = 64
const MAX_FIELD_HEIGHT = 256
const SDF_DISTANCE_RANGE_PX = 16
const POSITION_Z = 0.001
const POINT_PRECISION = 6
const CHAMFER_STRAIGHT_COST = 1
const CHAMFER_DIAGONAL_COST = 1.41421356237
const DISTANCE_INF = 1000000

type Segment = [Point2D, Point2D]
type Polyline = {
  points: Point2D[]
  closed: boolean
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load mask image: ${url}`))
    image.src = url
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getPoint(column: number, row: number, sampleWidth: number, sampleHeight: number): Point2D {
  const safeWidth = Math.max(sampleWidth - 1, 1)
  const safeHeight = Math.max(sampleHeight - 1, 1)
  const x = column / safeWidth - 0.5
  const y = 0.5 - row / safeHeight
  return [x, y]
}

function getPointKey(point: Point2D) {
  return `${point[0].toFixed(POINT_PRECISION)},${point[1].toFixed(POINT_PRECISION)}`
}

function getEdgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function getDistanceFromPointToSegment(point: Point2D, start: Point2D, end: Point2D) {
  const [pointX, pointY] = point
  const [startX, startY] = start
  const [endX, endY] = end
  const deltaX = endX - startX
  const deltaY = endY - startY
  const lengthSquared = deltaX * deltaX + deltaY * deltaY

  if (lengthSquared <= 0.0000001) {
    return Math.hypot(pointX - startX, pointY - startY)
  }

  const projection = ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared
  const clampedProjection = clamp(projection, 0, 1)
  const closestX = startX + deltaX * clampedProjection
  const closestY = startY + deltaY * clampedProjection
  return Math.hypot(pointX - closestX, pointY - closestY)
}

function simplifyOpenPolyline(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 2 || tolerance <= 0) {
    return points
  }

  let maxDistance = 0
  let splitIndex = -1

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = getDistanceFromPointToSegment(points[index], points[0], points[points.length - 1])
    if (distance > maxDistance) {
      maxDistance = distance
      splitIndex = index
    }
  }

  if (splitIndex < 0 || maxDistance <= tolerance) {
    return [points[0], points[points.length - 1]]
  }

  const left = simplifyOpenPolyline(points.slice(0, splitIndex + 1), tolerance)
  const right = simplifyOpenPolyline(points.slice(splitIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function getAveragePoint(points: Point2D[]) {
  const sum = points.reduce<[number, number]>(
    (accumulator, point) => [accumulator[0] + point[0], accumulator[1] + point[1]],
    [0, 0],
  )
  return [sum[0] / points.length, sum[1] / points.length] as Point2D
}

function rotatePoints(points: Point2D[], startIndex: number) {
  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

function simplifyClosedLoop(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 3 || tolerance <= 0) {
    return points
  }

  const center = getAveragePoint(points)
  let anchorIndex = 0
  let anchorDistance = -1

  points.forEach((point, index) => {
    const distance = Math.hypot(point[0] - center[0], point[1] - center[1])
    if (distance > anchorDistance) {
      anchorDistance = distance
      anchorIndex = index
    }
  })

  const rotated = rotatePoints(points, anchorIndex)
  const simplified = simplifyOpenPolyline([...rotated, rotated[0]], tolerance)
  const unique = simplified.slice(0, -1)
  return unique.length >= 3 ? unique : points
}

function chaikinOpen(points: Point2D[]) {
  if (points.length <= 2) {
    return points
  }

  const next: Point2D[] = [points[0]]
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const following = points[index + 1]
    next.push(
      [0.75 * current[0] + 0.25 * following[0], 0.75 * current[1] + 0.25 * following[1]],
      [0.25 * current[0] + 0.75 * following[0], 0.25 * current[1] + 0.75 * following[1]],
    )
  }
  next.push(points[points.length - 1])
  return next
}

function chaikinClosed(points: Point2D[]) {
  if (points.length <= 2) {
    return points
  }

  const next: Point2D[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const following = points[(index + 1) % points.length]
    next.push(
      [0.75 * current[0] + 0.25 * following[0], 0.75 * current[1] + 0.25 * following[1]],
      [0.25 * current[0] + 0.75 * following[0], 0.25 * current[1] + 0.75 * following[1]],
    )
  }
  return next
}

function getLoopArea(points: Point2D[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const following = points[(index + 1) % points.length]
    area += current[0] * following[1] - following[0] * current[1]
  }
  return area * 0.5
}

function pointInPolygon(point: Point2D, polygon: Point2D[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    const deltaY = previous[1] - current[1]
    const safeDeltaY = Math.abs(deltaY) < 0.0000001 ? (deltaY < 0 ? -0.0000001 : 0.0000001) : deltaY
    const intersects =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / safeDeltaY + current[0]

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function getContainmentPoint(points: Point2D[]) {
  return getAveragePoint(points)
}

function mergePolylinesToPositions(polylines: Polyline[]) {
  const positions: number[] = []

  polylines.forEach((polyline) => {
    if (polyline.points.length < 2) {
      return
    }

    const segmentCount = polyline.closed ? polyline.points.length : polyline.points.length - 1
    for (let index = 0; index < segmentCount; index += 1) {
      const start = polyline.points[index]
      const end = polyline.points[(index + 1) % polyline.points.length]
      positions.push(start[0], start[1], POSITION_Z, end[0], end[1], POSITION_Z)
    }
  })

  return positions
}

function orientLoop(points: Point2D[], clockwise: boolean) {
  const area = getLoopArea(points)
  const isClockwise = area < 0

  if (clockwise === isClockwise) {
    return points
  }

  return [...points].reverse()
}

function buildSegments(
  width: number,
  height: number,
  filled: (column: number, row: number) => boolean,
): Segment[] {
  const segments: Segment[] = []
  const pushSegment = (start: Point2D, end: Point2D) => {
    segments.push([start, end])
  }

  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const topLeft = filled(column, row)
      const topRight = filled(column + 1, row)
      const bottomRight = filled(column + 1, row + 1)
      const bottomLeft = filled(column, row + 1)

      const mask =
        (topLeft ? 8 : 0) |
        (topRight ? 4 : 0) |
        (bottomRight ? 2 : 0) |
        (bottomLeft ? 1 : 0)

      if (mask === 0 || mask === 15) {
        continue
      }

      const top = getPoint(column + 0.5, row, width, height)
      const right = getPoint(column + 1, row + 0.5, width, height)
      const bottom = getPoint(column + 0.5, row + 1, width, height)
      const left = getPoint(column, row + 0.5, width, height)

      switch (mask) {
        case 1:
        case 14:
          pushSegment(left, bottom)
          break
        case 2:
        case 13:
          pushSegment(bottom, right)
          break
        case 3:
        case 12:
          pushSegment(left, right)
          break
        case 4:
        case 11:
          pushSegment(top, right)
          break
        case 5:
          pushSegment(top, left)
          pushSegment(bottom, right)
          break
        case 6:
        case 9:
          pushSegment(top, bottom)
          break
        case 7:
        case 8:
          pushSegment(top, left)
          break
        case 10:
          pushSegment(top, right)
          pushSegment(left, bottom)
          break
        default:
          break
      }
    }
  }

  return segments
}

function buildPolylines(segments: Segment[]) {
  const nodes = new Map<
    string,
    {
      point: Point2D
      neighbors: Set<string>
    }
  >()
  const visitedEdges = new Set<string>()

  const ensureNode = (point: Point2D) => {
    const key = getPointKey(point)
    if (!nodes.has(key)) {
      nodes.set(key, {
        point,
        neighbors: new Set<string>(),
      })
    }
    return key
  }

  segments.forEach(([start, end]) => {
    const startKey = ensureNode(start)
    const endKey = ensureNode(end)
    nodes.get(startKey)?.neighbors.add(endKey)
    nodes.get(endKey)?.neighbors.add(startKey)
  })

  const walk = (startKey: string, nextKey: string): Polyline | null => {
    const keys = [startKey, nextKey]
    visitedEdges.add(getEdgeKey(startKey, nextKey))
    let previousKey = startKey
    let currentKey = nextKey
    let closed = false
    let guard = 0

    while (guard < nodes.size * 4) {
      guard += 1
      const currentNode = nodes.get(currentKey)
      if (!currentNode) {
        break
      }

      const nextCandidate = [...currentNode.neighbors].find((neighborKey) => {
        if (neighborKey === previousKey) {
          return false
        }

        return !visitedEdges.has(getEdgeKey(currentKey, neighborKey))
      })

      if (!nextCandidate) {
        break
      }

      visitedEdges.add(getEdgeKey(currentKey, nextCandidate))
      previousKey = currentKey
      currentKey = nextCandidate

      if (currentKey === startKey) {
        closed = true
        break
      }

      keys.push(currentKey)
    }

    const points = keys.map((key) => nodes.get(key)?.point).filter((point): point is Point2D => Boolean(point))
    if (points.length < 2) {
      return null
    }

    return {
      points,
      closed,
    }
  }

  const polylines: Polyline[] = []

  nodes.forEach((node, key) => {
    if (node.neighbors.size === 2) {
      return
    }

    node.neighbors.forEach((neighborKey) => {
      if (visitedEdges.has(getEdgeKey(key, neighborKey))) {
        return
      }

      const polyline = walk(key, neighborKey)
      if (polyline) {
        polylines.push(polyline)
      }
    })
  })

  nodes.forEach((node, key) => {
    node.neighbors.forEach((neighborKey) => {
      if (visitedEdges.has(getEdgeKey(key, neighborKey))) {
        return
      }

      const polyline = walk(key, neighborKey)
      if (polyline) {
        polylines.push(polyline)
      }
    })
  })

  return polylines
}

function processPolylines(
  polylines: Polyline[],
  options: {
    simplify: number
    smooth: number
    showInnerLoops: boolean
    sampleWidth: number
    sampleHeight: number
  },
) {
  const cellSize = 1 / Math.max(options.sampleWidth - 1, options.sampleHeight - 1, 1)
  const simplifyTolerance = options.simplify <= 0 ? 0 : cellSize * (0.25 + options.simplify * 8)
  const smoothIterations = Math.max(0, Math.round(options.smooth * 4))

  const processed = polylines
    .map((polyline) => {
      let nextPoints = polyline.points

      if (polyline.closed) {
        nextPoints = simplifyClosedLoop(nextPoints, simplifyTolerance)
      } else {
        nextPoints = simplifyOpenPolyline(nextPoints, simplifyTolerance)
      }

      for (let iteration = 0; iteration < smoothIterations; iteration += 1) {
        nextPoints = polyline.closed ? chaikinClosed(nextPoints) : chaikinOpen(nextPoints)
      }

      return {
        ...polyline,
        points: nextPoints,
      }
    })
    .filter((polyline) => polyline.points.length >= (polyline.closed ? 3 : 2))

  if (options.showInnerLoops) {
    return processed
  }

  const closedLoopsByArea = processed
    .filter((polyline) => polyline.closed)
    .map((polyline) => ({
      polyline,
      area: Math.abs(getLoopArea(polyline.points)),
      containmentPoint: getContainmentPoint(polyline.points),
    }))
    .sort((left, right) => right.area - left.area)

  const innerLoopKeys = new Set<string>()

  for (let index = 0; index < closedLoopsByArea.length; index += 1) {
    const candidate = closedLoopsByArea[index]
    const parent = closedLoopsByArea.find((entry, parentIndex) => {
      if (parentIndex >= index || entry.area <= candidate.area) {
        return false
      }

      return pointInPolygon(candidate.containmentPoint, entry.polyline.points)
    })

    if (parent) {
      innerLoopKeys.add(candidate.polyline.points.map(getPointKey).join('|'))
    }
  }

  return processed.filter((polyline) => !innerLoopKeys.has(polyline.points.map(getPointKey).join('|')))
}

function getPolylineKey(points: Point2D[]) {
  return points.map(getPointKey).join('|')
}

function buildLoopInfos(polylines: Polyline[]) {
  const closedLoops = polylines
    .filter((polyline) => polyline.closed && polyline.points.length >= 3)
    .map((polyline) => ({
      polyline,
      key: getPolylineKey(polyline.points),
      area: Math.abs(getLoopArea(polyline.points)),
      containmentPoint: getContainmentPoint(polyline.points),
    }))
    .sort((left, right) => right.area - left.area)

  const loopInfos: Array<{
    polyline: Polyline
    key: string
    area: number
    containmentPoint: Point2D
    parentIndex: number
    depth: number
  }> = []

  closedLoops.forEach((loop) => {
    let parentIndex = -1
    let parentArea = Number.POSITIVE_INFINITY

    loopInfos.forEach((candidate, candidateIndex) => {
      if (candidate.area <= loop.area || candidate.area >= parentArea) {
        return
      }

      if (!pointInPolygon(loop.containmentPoint, candidate.polyline.points)) {
        return
      }

      parentIndex = candidateIndex
      parentArea = candidate.area
    })

    loopInfos.push({
      ...loop,
      parentIndex,
      depth: parentIndex >= 0 ? loopInfos[parentIndex].depth + 1 : 0,
    })
  })

  return loopInfos
}

function filterLoopInfosByMinArea(
  loopInfos: ReturnType<typeof buildLoopInfos>,
  minArea: number,
) {
  if (minArea <= 0 || !loopInfos.length) {
    return loopInfos
  }

  const largestArea = loopInfos.reduce((maximum, loop) => Math.max(maximum, loop.area), 0)
  if (largestArea <= 0) {
    return loopInfos
  }

  const minAllowedArea = largestArea * minArea
  return loopInfos.filter((loop) => loop.area >= minAllowedArea)
}

function selectContourPolylines(polylines: Polyline[], mode: MaskContourMode) {
  if (mode === 'cutout' || mode === 'loops') {
    return polylines
  }

  const loopInfos = buildLoopInfos(polylines)
  const silhouetteKeys = new Set(loopInfos.filter((loop) => loop.depth === 0).map((loop) => loop.key))
  return polylines.filter((polyline) => !polyline.closed || silhouetteKeys.has(getPolylineKey(polyline.points)))
}

function buildContourShapesForMode(
  polylines: Polyline[],
  mode: MaskContourMode,
  minArea: number,
) {
  const loopInfos = filterLoopInfosByMinArea(buildLoopInfos(polylines), minArea)

  if (mode === 'loops') {
    return loopInfos.map((loop) => ({
      outline: orientLoop(loop.polyline.points, false),
      holes: [],
    }))
  }

  if (mode === 'silhouette') {
    return loopInfos
      .filter((loop) => loop.depth === 0)
      .map((loop) => ({
        outline: orientLoop(loop.polyline.points, false),
        holes: [],
      }))
  }

  const shapes: MaskContourShape[] = []
  const shapeIndexByLoopIndex = new Map<number, number>()

  loopInfos.forEach((loop, loopIndex) => {
    if (loop.depth % 2 === 0) {
      shapeIndexByLoopIndex.set(loopIndex, shapes.length)
      shapes.push({
        outline: orientLoop(loop.polyline.points, false),
        holes: [],
      })
      return
    }

    let ancestorIndex = loop.parentIndex
    while (ancestorIndex >= 0 && loopInfos[ancestorIndex].depth % 2 !== 0) {
      ancestorIndex = loopInfos[ancestorIndex].parentIndex
    }

    const shapeIndex = ancestorIndex >= 0 ? shapeIndexByLoopIndex.get(ancestorIndex) : undefined
    if (shapeIndex == null) {
      return
    }

    shapes[shapeIndex].holes.push(orientLoop(loop.polyline.points, true))
  })

  return shapes
}

function createMaskRaster(
  image: HTMLImageElement,
  sampleWidth: number,
  sampleHeight: number,
) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context || !image.width || !image.height) {
    return null
  }

  canvas.width = sampleWidth
  canvas.height = sampleHeight
  context.clearRect(0, 0, sampleWidth, sampleHeight)
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight)
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data
  const mask = new Uint8Array(sampleWidth * sampleHeight)

  for (let row = 0; row < sampleHeight; row += 1) {
    for (let column = 0; column < sampleWidth; column += 1) {
      const offset = (row * sampleWidth + column) * 4
      const alpha = (data[offset + 3] ?? 0) / 255
      const red = (data[offset] ?? 0) / 255
      const green = (data[offset + 1] ?? 0) / 255
      const blue = (data[offset + 2] ?? 0) / 255
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha
      mask[row * sampleWidth + column] = luminance >= LUMA_THRESHOLD ? 1 : 0
    }
  }

  return {
    width: sampleWidth,
    height: sampleHeight,
    mask,
  }
}

function buildBoundaryDistanceMap(mask: Uint8Array, width: number, height: number) {
  const distances = new Float32Array(width * height)
  distances.fill(DISTANCE_INF)

  const sampleAt = (column: number, row: number) => {
    if (column < 0 || column >= width || row < 0 || row >= height) {
      return 0
    }
    return mask[row * width + column] ?? 0
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column
      const value = sampleAt(column, row)
      const isBoundary =
        value !== sampleAt(column - 1, row) ||
        value !== sampleAt(column + 1, row) ||
        value !== sampleAt(column, row - 1) ||
        value !== sampleAt(column, row + 1)

      if (isBoundary) {
        distances[index] = 0
      }
    }
  }

  return distances
}

function applyChamferDistanceTransform(distances: Float32Array, width: number, height: number) {
  const update = (targetIndex: number, sourceIndex: number, cost: number) => {
    distances[targetIndex] = Math.min(distances[targetIndex], distances[sourceIndex] + cost)
  }

  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const index = row * width + column
        if (column > 0) {
          update(index, index - 1, CHAMFER_STRAIGHT_COST)
        }
        if (row > 0) {
          update(index, index - width, CHAMFER_STRAIGHT_COST)
        }
        if (column > 0 && row > 0) {
          update(index, index - width - 1, CHAMFER_DIAGONAL_COST)
        }
        if (column < width - 1 && row > 0) {
          update(index, index - width + 1, CHAMFER_DIAGONAL_COST)
        }
      }
    }

    for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = width - 1; column >= 0; column -= 1) {
        const index = row * width + column
        if (column < width - 1) {
          update(index, index + 1, CHAMFER_STRAIGHT_COST)
        }
        if (row < height - 1) {
          update(index, index + width, CHAMFER_STRAIGHT_COST)
        }
        if (column < width - 1 && row < height - 1) {
          update(index, index + width + 1, CHAMFER_DIAGONAL_COST)
        }
        if (column > 0 && row < height - 1) {
          update(index, index + width - 1, CHAMFER_DIAGONAL_COST)
        }
      }
    }
  }

  return distances
}

function createSignedDistanceFieldCanvas(mask: Uint8Array, width: number, height: number) {
  const distances = applyChamferDistanceTransform(buildBoundaryDistanceMap(mask, width, height), width, height)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  canvas.width = width
  canvas.height = height
  const imageData = context.createImageData(width, height)
  const output = imageData.data

  for (let index = 0; index < mask.length; index += 1) {
    const signedDistance = (mask[index] > 0 ? 1 : -1) * Math.min(distances[index] ?? 0, SDF_DISTANCE_RANGE_PX)
    const normalized = clamp(signedDistance / SDF_DISTANCE_RANGE_PX * 0.5 + 0.5, 0, 1)
    const value = Math.round(normalized * 255)
    const offset = index * 4
    output[offset] = value
    output[offset + 1] = value
    output[offset + 2] = value
    output[offset + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

export function createShapeDistanceField(
  shapes: MaskContourShape | MaskContourShape[],
  options?: ShapeDistanceFieldOptions,
): MaskDistanceFieldResult | null {
  const shapeList = Array.isArray(shapes) ? shapes : [shapes]
  const points = shapeList.flatMap((shape) => [shape.outline, ...shape.holes].flat())
  if (!points.length) {
    return null
  }

  const bounds = points.reduce(
    (accumulator, point) => ({
      minX: Math.min(accumulator.minX, point[0]),
      maxX: Math.max(accumulator.maxX, point[0]),
      minY: Math.min(accumulator.minY, point[1]),
      maxY: Math.max(accumulator.maxY, point[1]),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )

  const widthSpan = Math.max(bounds.maxX - bounds.minX, 0.0001)
  const heightSpan = Math.max(bounds.maxY - bounds.minY, 0.0001)
  const aspect = heightSpan / widthSpan
  const minFieldWidth = clamp(
    Math.round(options?.minFieldWidth ?? MIN_FIELD_WIDTH),
    16,
    MAX_FIELD_WIDTH,
  )
  const minFieldHeight = clamp(
    Math.round(options?.minFieldHeight ?? MIN_FIELD_HEIGHT),
    16,
    MAX_FIELD_HEIGHT,
  )
  const maxFieldWidth = clamp(
    Math.round(options?.maxFieldWidth ?? MAX_FIELD_WIDTH),
    minFieldWidth,
    MAX_FIELD_WIDTH,
  )
  const maxFieldHeight = clamp(
    Math.round(options?.maxFieldHeight ?? MAX_FIELD_HEIGHT),
    minFieldHeight,
    MAX_FIELD_HEIGHT,
  )
  const sampleWidth = clamp(
    widthSpan >= heightSpan ? maxFieldWidth : Math.round(maxFieldHeight / Math.max(aspect, 0.0001)),
    minFieldWidth,
    maxFieldWidth,
  )
  const sampleHeight = clamp(
    Math.round(sampleWidth * aspect),
    minFieldHeight,
    maxFieldHeight,
  )
  const mask = new Uint8Array(sampleWidth * sampleHeight)

  for (let row = 0; row < sampleHeight; row += 1) {
    for (let column = 0; column < sampleWidth; column += 1) {
      const u = sampleWidth <= 1 ? 0.5 : column / (sampleWidth - 1)
      const v = sampleHeight <= 1 ? 0.5 : row / (sampleHeight - 1)
      const point: Point2D = [
        bounds.minX + widthSpan * u,
        bounds.maxY - heightSpan * v,
      ]
      const insideAnyShape = shapeList.some((shape) => {
        const insideOutline = pointInPolygon(point, shape.outline)
        if (!insideOutline) {
          return false
        }

        const insideHole = shape.holes.some((hole) => pointInPolygon(point, hole))
        return !insideHole
      })
      mask[row * sampleWidth + column] = insideAnyShape ? 1 : 0
    }
  }

  const canvas = createSignedDistanceFieldCanvas(mask, sampleWidth, sampleHeight)
  if (!canvas) {
    return null
  }

  return {
    canvas,
    width: sampleWidth,
    height: sampleHeight,
  }
}

export async function extractMaskDistanceField(url: string): Promise<MaskDistanceFieldResult | null> {
  const image = await loadImage(url)
  if (!image.width || !image.height) {
    return null
  }

  const aspect = image.height / Math.max(image.width, 1)
  const sampleWidth = clamp(
    image.width >= image.height ? MAX_FIELD_WIDTH : Math.round(MAX_FIELD_HEIGHT / Math.max(aspect, 0.0001)),
    MIN_FIELD_WIDTH,
    Math.min(MAX_FIELD_WIDTH, image.width),
  )
  const sampleHeight = clamp(
    Math.round(sampleWidth * aspect),
    MIN_FIELD_HEIGHT,
    Math.min(MAX_FIELD_HEIGHT, image.height),
  )

  const raster = createMaskRaster(image, sampleWidth, sampleHeight)
  if (!raster) {
    return null
  }

  const canvas = createSignedDistanceFieldCanvas(raster.mask, raster.width, raster.height)
  if (!canvas) {
    return null
  }

  return {
    canvas,
    width: raster.width,
    height: raster.height,
  }
}

export async function extractMaskContour(
  url: string,
  options: {
    invert: boolean
    detail: number
    simplify: number
    smooth: number
    minArea: number
    mode: MaskContourMode
  },
): Promise<MaskContourResult | null> {
  const image = await loadImage(url)
  if (!image.width || !image.height) {
    return null
  }

  const detail = clamp(options.detail, 0, 1)
  const sampleWidth = clamp(
    Math.round(MIN_SAMPLE_WIDTH + (MAX_SAMPLE_WIDTH - MIN_SAMPLE_WIDTH) * detail),
    MIN_SAMPLE_WIDTH,
    Math.min(MAX_SAMPLE_WIDTH, image.width),
  )
  const aspect = image.height / Math.max(image.width, 1)
  const sampleHeight = clamp(
    Math.round(sampleWidth * aspect),
    MIN_SAMPLE_HEIGHT,
    Math.min(MAX_SAMPLE_HEIGHT, image.height),
  )
  const raster = createMaskRaster(image, sampleWidth, sampleHeight)
  if (!raster) {
    return null
  }
  const { mask } = raster

  const filled = (column: number, row: number) => {
    const isFilled = (mask[row * sampleWidth + column] ?? 0) > 0
    return options.invert ? !isFilled : isFilled
  }

  const segments = buildSegments(sampleWidth, sampleHeight, filled)
  const polylines = buildPolylines(segments)
  const processed = processPolylines(polylines, {
    simplify: options.simplify,
    smooth: options.smooth,
    showInnerLoops: true,
    sampleWidth,
    sampleHeight,
  })
  const displayPolylines = selectContourPolylines(processed, options.mode)
  const positions = mergePolylinesToPositions(displayPolylines)
  const shapes = buildContourShapesForMode(processed, options.mode, clamp(options.minArea, 0, 1))

  return positions.length || shapes.length ? { positions, shapes } : null
}
