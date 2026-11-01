import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/** Точка росчерка: координаты на площадке и миллисекунды от начала подписи. */
export type SignaturePoint = [number, number, number]
export type SignatureStroke = SignaturePoint[]

export interface SignaturePadHandle {
  clear: () => void
  /** [[[x, y, t], ...], ...] — целые пиксели и миллисекунды, как с телефона. */
  strokes: () => number[][][]
  /** PNG на прозрачном фоне, обрезанный по росчерку; null — подписи нет. */
  toPng: () => Promise<Blob | null>
}

const INK = '#111827'
const LINE_WIDTH = 2.5

function drawStroke(context: CanvasRenderingContext2D, stroke: SignatureStroke, offsetX = 0, offsetY = 0) {
  const [first, ...rest] = stroke
  if (!first) return
  if (rest.length === 0) {
    context.beginPath()
    context.arc(first[0] - offsetX, first[1] - offsetY, context.lineWidth / 2, 0, Math.PI * 2)
    context.fill()
    return
  }
  context.beginPath()
  context.moveTo(first[0] - offsetX, first[1] - offsetY)
  // Сглаживание: кривая через середины соседних отрезков
  let [px, py] = first
  for (const [x, y] of rest) {
    context.quadraticCurveTo(px - offsetX, py - offsetY, (px + x) / 2 - offsetX, (py + y) / 2 - offsetY)
    ;[px, py] = [x, y]
  }
  context.lineTo(px - offsetX, py - offsetY)
  context.stroke()
}

function prepare(context: CanvasRenderingContext2D, width: number) {
  context.strokeStyle = INK
  context.fillStyle = INK
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

/** Росчерки → целые пиксели и время от первого касания. */
function strokesJson(strokes: SignatureStroke[]): number[][][] {
  return strokes.map((stroke) => stroke.map(([x, y, t]) => [Math.round(x), Math.round(y), Math.round(t)]))
}

/** Площадка для подписи пальцем или мышью: бумажно-белая в любой теме. */
const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (isEmpty: boolean) => void; height?: number }>(
  function SignaturePad({ onChange, height = 200 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const strokesRef = useRef<SignatureStroke[]>([])
    const currentRef = useRef<SignatureStroke | null>(null)
    const startedAtRef = useRef<number | null>(null)
    const [isEmpty, setIsEmpty] = useState(true)

    const redraw = useCallback(() => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      prepare(context, LINE_WIDTH)
      strokesRef.current.forEach((stroke) => drawStroke(context, stroke))
      if (currentRef.current) drawStroke(context, currentRef.current)
    }, [height])

    useEffect(() => {
      redraw()
      const canvas = canvasRef.current
      if (!canvas || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => redraw())
      observer.observe(canvas)
      return () => observer.disconnect()
    }, [redraw])

    const setEmpty = (value: boolean) => {
      setIsEmpty(value)
      onChange?.(value)
    }

    const point = (event: React.PointerEvent<HTMLCanvasElement>): SignaturePoint => {
      const rect = event.currentTarget.getBoundingClientRect()
      const now = performance.now()
      if (startedAtRef.current === null) startedAtRef.current = now
      return [event.clientX - rect.left, event.clientY - rect.top, now - startedAtRef.current]
    }

    const finish = () => {
      const stroke = currentRef.current
      currentRef.current = null
      if (stroke && stroke.length > 0) {
        strokesRef.current = [...strokesRef.current, stroke]
        if (isEmpty) setEmpty(false)
      }
      redraw()
    }

    const clear = () => {
      strokesRef.current = []
      currentRef.current = null
      startedAtRef.current = null
      setEmpty(true)
      redraw()
    }

    useImperativeHandle(ref, () => ({
      clear,
      strokes: () => strokesJson(strokesRef.current),
      toPng: async () => {
        const points = strokesRef.current.flat()
        if (points.length === 0) return null
        const pad = LINE_WIDTH * 2
        const left = Math.min(...points.map((p) => p[0])) - pad
        const top = Math.min(...points.map((p) => p[1])) - pad
        const width = Math.max(...points.map((p) => p[0])) + pad - left
        const heightPx = Math.max(...points.map((p) => p[1])) + pad - top
        // Вдвое плотнее экрана, но не шире 800 px — как с телефона
        const scale = Math.min(2, 800 / Math.max(width, 1))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(heightPx * scale))
        const context = canvas.getContext('2d')
        if (!context) return null
        context.scale(scale, scale)
        prepare(context, LINE_WIDTH)
        strokesRef.current.forEach((stroke) => drawStroke(context, stroke, left, top))
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
      },
    }))

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair rounded-xl border border-gray-300 bg-white dark:border-gray-600"
          aria-label="Площадка для подписи"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            currentRef.current = [point(event)]
            redraw()
          }}
          onPointerMove={(event) => {
            if (!currentRef.current) return
            currentRef.current.push(point(event))
            redraw()
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {/* Линия и крестик — как на бумажном бланке */}
        <div className="pointer-events-none absolute inset-x-6 border-t border-gray-200" style={{ top: height * 0.78 }} />
        <span className="pointer-events-none absolute bottom-2 left-3 text-sm text-gray-400">×</span>
        {isEmpty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Распишитесь здесь
          </span>
        )}
        {!isEmpty && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs text-gray-600 shadow-sm hover:text-gray-900"
          >
            <Eraser className="h-3.5 w-3.5" />
            Стереть
          </button>
        )}
      </div>
    )
  },
)

export default SignaturePad
