import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

type Point = { x: number; y: number };
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type Stroke = {
  id: string;
  tool: 'pen' | 'eraser' | 'blur';
  color: string;
  size: number;
  opacity?: number;
  strength?: number;
  targetId?: string;
  points: Point[];
};
type OverlayLayer = {
  id: string;
  name: string;
  image: HTMLImageElement;
  data: string;
  position: Point;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  erasures: Stroke[];
};
type HistoryState = {
  strokes: Stroke[];
  layerStack: string[];
  erasures: Array<{ id: string; strokes: Stroke[] }>;
  overlays: Array<{
    id: string;
    position: Point;
    scaleX: number;
    scaleY: number;
  }>;
  filters: Filters;
};
type ImageDocument = {
  id: string;
  name: string;
  image: HTMLImageElement;
  data: string;
  filters: Filters;
  strokes: Stroke[];
  undoStack: HistoryState[];
  redoStack: HistoryState[];
};
type Project = {
  version: 1;
  kind: 'webcanvas-project';
  name: string;
  image?: string;
  overlay?: string;
  overlayPosition?: Point;
  overlays?: Array<{
    name?: string;
    data: string;
    position: Point;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    visible?: boolean;
    erasures?: Stroke[];
  }>;
  layerOrder?: Array<number | string>;
  canvas: { width: number; height: number };
  filters: Filters;
  strokes: Stroke[];
  documents?: Array<{
    name: string;
    image: string;
    filters: Filters;
    strokes: Stroke[];
  }>;
  activeDocument?: number;
};

const MAX_OVERLAY_LAYERS = 1;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const STROKE_PREFIX = 'stroke:';
type Filters = {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  hue: number;
};

export function useEditor() {
  const canvas = ref<HTMLCanvasElement | null>(null);
  const stage = ref<HTMLElement | null>(null);
  const imageInput = ref<HTMLInputElement | null>(null);
  const projectInput = ref<HTMLInputElement | null>(null);
  const source = ref<HTMLImageElement | null>(null);
  const imageDocuments = ref<ImageDocument[]>([]);
  const activeImageId = ref<string | null>(null);
  const overlayLayers = ref<OverlayLayer[]>([]);
  const layerStack = ref<string[]>([]);
  const selectedOverlayId = ref<string | null>(null);
  const editorMode = ref<'draw' | 'image'>('image');
  const canvasSize = ref({ width: 1600, height: 1000 });
  const imageData = ref('');
  const imageName = ref('Untitled canvas');
  const activeTool = ref<'select' | 'pen' | 'eraser' | 'blur'>('select');
  const brushColor = ref('#4f46e5');
  const penSize = ref(16);
  const eraserSize = ref(16);
  const blurSize = ref(32);
  const blurStrength = ref(8);
  const brushOpacity = ref(100);
  const zoom = ref(1);
  const filters = ref<Filters>({
    brightness: 100,
    contrast: 100,
    saturate: 100,
    blur: 0,
    hue: 0,
  });
  const strokes = ref<Stroke[]>([]);
  const undoStack = ref<HistoryState[]>([]);
  const redoStack = ref<HistoryState[]>([]);
  const drawing = ref<Stroke | null>(null);
  const placementMode = ref(false);
  const spaceHeld = ref(false);
  const pan = ref<Point>({ x: 0, y: 0 });
  let resizeObserver: ResizeObserver | undefined;
  let panDrag: { x: number; y: number; pan: Point } | null = null;
  let overlayDrag: {
    id: string;
    mode: 'move' | 'resize';
    handle?: ResizeHandle;
    start: Point;
    position: Point;
    scaleX: number;
    scaleY: number;
    width: number;
    height: number;
    left: number;
    top: number;
    snapshotted: boolean;
  } | null = null;
  let renderFrame: number | undefined;
  let compositeCanvas: HTMLCanvasElement | undefined;
  let maskCanvas: HTMLCanvasElement | undefined;
  let blurCanvas: HTMLCanvasElement | undefined;
  const hoverHandle = ref<ResizeHandle | null>(null);
  const hoverImage = ref(false);
  const eraserGuide = ref<{ x: number; y: number; size: number } | null>(null);
  const inspectorOpen = ref(false);

  const hasImage = computed(() => !!source.value);
  const hasDocument = computed(
    () => hasImage.value || editorMode.value === 'draw',
  );
  const canImportProject = computed(() =>
    editorMode.value === 'image'
      ? !imageDocuments.value.length
      : !overlayLayers.value.length && !strokes.value.length,
  );
  const activeSize = computed({
    get: () =>
      activeTool.value === 'eraser'
        ? eraserSize.value
        : activeTool.value === 'blur'
          ? blurSize.value
          : penSize.value,
    set: (value: number) =>
      activeTool.value === 'eraser'
        ? (eraserSize.value = value)
        : activeTool.value === 'blur'
          ? (blurSize.value = value)
          : (penSize.value = value),
  });
  const filterValue = computed(() => {
    const value = filters.value;
    return `brightness(${value.brightness}%) contrast(${value.contrast}%) saturate(${value.saturate}%) blur(${value.blur}px) hue-rotate(${value.hue}deg)`;
  });
  const canvasStyle = computed(() => ({
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
  }));

  const cloneStrokes = (value: Stroke[]) =>
    value.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    }));
  const cloneHistory = (): HistoryState =>
    editorMode.value === 'image'
      ? {
          strokes: [...strokes.value],
          layerStack: [],
          erasures: [],
          overlays: [],
          filters: { ...filters.value },
        }
      : {
          strokes: cloneStrokes(strokes.value),
          layerStack: [...layerStack.value],
          erasures: overlayLayers.value.map((layer) => ({
            id: layer.id,
            strokes: cloneStrokes(layer.erasures),
          })),
          overlays: overlayLayers.value.map((layer) => ({
            id: layer.id,
            position: { ...layer.position },
            scaleX: layer.scaleX,
            scaleY: layer.scaleY,
          })),
          filters: { ...filters.value },
        };
  function restoreHistory(state: HistoryState) {
    strokes.value = state.strokes;
    layerStack.value = state.layerStack;
    filters.value = state.filters;
    for (const layer of overlayLayers.value) {
      layer.erasures = cloneStrokes(
        state.erasures.find((item) => item.id === layer.id)?.strokes || [],
      );
      const overlay = state.overlays.find((item) => item.id === layer.id);
      if (overlay) {
        layer.position = { ...overlay.position };
        layer.scaleX = overlay.scaleX;
        layer.scaleY = overlay.scaleY;
      }
    }
    syncActiveDocument();
  }

  function syncActiveDocument() {
    const document = imageDocuments.value.find(
      (item) => item.id === activeImageId.value,
    );
    if (!document || editorMode.value !== 'image') return;
    document.name = imageName.value;
    document.data = imageData.value;
    document.filters = filters.value;
    document.strokes = strokes.value;
    document.undoStack = undoStack.value;
    document.redoStack = redoStack.value;
  }

  async function selectImageDocument(id: string) {
    const document = imageDocuments.value.find((item) => item.id === id);
    if (!document) return;
    activeImageId.value = id;
    source.value = document.image;
    imageData.value = document.data;
    imageName.value = document.name;
    canvasSize.value = {
      width: document.image.naturalWidth,
      height: document.image.naturalHeight,
    };
    filters.value = document.filters;
    strokes.value = document.strokes;
    undoStack.value = document.undoStack;
    redoStack.value = document.redoStack;
    pan.value = { x: 0, y: 0 };
    await nextTick();
    render();
    await fitToStage();
  }

  function snapshot() {
    undoStack.value.push(cloneHistory());
    if (undoStack.value.length > 30) undoStack.value.shift();
    redoStack.value = [];
  }

  function render() {
    const element = canvas.value;
    const image = source.value;
    if (!element) return;

    const context = element.getContext('2d');
    if (!context) return;
    const width = image?.naturalWidth || canvasSize.value.width;
    const height = image?.naturalHeight || canvasSize.value.height;
    element.width = width;
    element.height = height;
    context.clearRect(0, 0, element.width, element.height);
    if (image) {
      context.filter = filterValue.value;
      context.drawImage(image, 0, 0);
    } else {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, element.width, element.height);
    }
    context.filter = 'none';
    if (editorMode.value === 'image')
      renderStrokes(context, [
        ...strokes.value,
        ...(drawing.value ? [drawing.value] : []),
      ]);
    else {
      const stack = [
        ...layerStack.value,
        ...(drawing.value ? [`${STROKE_PREFIX}${drawing.value.id}`] : []),
      ];
      const content = getScratchCanvas(
        'composite',
        element.width,
        element.height,
      );
      const contentContext = content.getContext('2d');
      if (!contentContext) return;
      contentContext.clearRect(0, 0, content.width, content.height);
      const values = [
        ...strokes.value,
        ...(drawing.value ? [drawing.value] : []),
      ];
      const strokeById = new Map(
        values.map((stroke) => [`${STROKE_PREFIX}${stroke.id}`, stroke]),
      );
      for (const id of stack) {
        const stroke = strokeById.get(id);
        if (stroke) {
          renderStrokes(contentContext, [stroke]);
          continue;
        }
        const layer = overlayLayers.value.find((item) => item.id === id);
        if (!layer) continue;
        renderOverlay(contentContext, layer, element.width, element.height);
      }
      context.drawImage(content, 0, 0);
    }
    if (
      editorMode.value === 'draw' &&
      activeTool.value === 'select' &&
      selectedOverlayId.value
    ) {
      const layer = overlayLayers.value.find(
        (item) => item.id === selectedOverlayId.value,
      );
      if (!layer) return;
      const overlay = overlayBounds(layer, element.width, element.height);
      context.save();
      context.strokeStyle = '#5b5ce2';
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.strokeRect(overlay.x, overlay.y, overlay.width, overlay.height);
      context.fillStyle = '#fff';
      context.strokeStyle = '#17151e';
      context.lineWidth = 1.5;
      context.setLineDash([]);
      for (const [x, y] of [
        [overlay.x, overlay.y],
        [overlay.x + overlay.width / 2, overlay.y],
        [overlay.x + overlay.width, overlay.y],
        [overlay.x + overlay.width, overlay.y + overlay.height / 2],
        [overlay.x + overlay.width, overlay.y + overlay.height],
        [overlay.x + overlay.width / 2, overlay.y + overlay.height],
        [overlay.x, overlay.y + overlay.height],
        [overlay.x, overlay.y + overlay.height / 2],
      ]) {
        context.fillRect(x - 4, y - 4, 8, 8);
        context.strokeRect(x - 4, y - 4, 8, 8);
      }
      context.restore();
    }
  }

  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = undefined;
      render();
    });
  }

  function renderStrokes(
    strokeContext: CanvasRenderingContext2D,
    values: Stroke[],
  ) {
    for (const stroke of values) {
      if (stroke.points.length < 2) continue;
      if (stroke.tool === 'blur') {
        for (let index = 1; index < stroke.points.length; index += 1)
          renderBlurSegment(
            strokeContext,
            stroke.points[index - 1],
            stroke.points[index],
            stroke.size,
            stroke.strength || 8,
          );
        continue;
      }
      strokeContext.save();
      strokeContext.globalCompositeOperation =
        stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      strokeContext.globalAlpha = stroke.opacity ?? 1;
      strokeContext.strokeStyle = stroke.color;
      strokeContext.lineWidth = stroke.size;
      strokeContext.lineCap = 'round';
      strokeContext.lineJoin = 'round';
      strokeContext.beginPath();
      strokeContext.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points
        .slice(1)
        .forEach((point) => strokeContext.lineTo(point.x, point.y));
      strokeContext.stroke();
      strokeContext.restore();
    }
  }

  function getScratchCanvas(
    kind: 'composite' | 'mask' | 'blur',
    width: number,
    height: number,
  ) {
    const element =
      kind === 'composite'
        ? (compositeCanvas ||= document.createElement('canvas'))
        : kind === 'mask'
          ? (maskCanvas ||= document.createElement('canvas'))
          : (blurCanvas ||= document.createElement('canvas'));
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }
    return element;
  }

  function renderSegment(stroke: Stroke, from: Point, to: Point) {
    const context = canvas.value?.getContext('2d');
    if (!context) return;
    if (stroke.tool === 'blur') {
      renderBlurSegment(context, from, to, stroke.size, stroke.strength || 8);
      return;
    }
    context.save();
    context.globalCompositeOperation =
      stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.globalAlpha = stroke.opacity ?? 1;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function renderBlurSegment(
    context: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    size: number,
    strength: number,
  ) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(4, size / 3)));
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      renderBlurPoint(
        context,
        {
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        },
        size,
        strength,
      );
    }
  }

  function renderBlurPoint(
    context: CanvasRenderingContext2D,
    point: Point,
    size: number,
    strength: number,
  ) {
    const padding = Math.ceil(strength * 3);
    const radius = size / 2;
    const left = Math.max(0, Math.floor(point.x - radius - padding));
    const top = Math.max(0, Math.floor(point.y - radius - padding));
    const right = Math.min(
      context.canvas.width,
      Math.ceil(point.x + radius + padding),
    );
    const bottom = Math.min(
      context.canvas.height,
      Math.ceil(point.y + radius + padding),
    );
    const width = right - left;
    const height = bottom - top;
    if (!width || !height) return;
    const blur = getScratchCanvas('blur', width, height);
    const blurContext = blur.getContext('2d');
    if (!blurContext) return;
    blurContext.clearRect(0, 0, width, height);
    blurContext.drawImage(
      context.canvas,
      left,
      top,
      width,
      height,
      0,
      0,
      width,
      height,
    );
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.clip();
    context.filter = `blur(${strength}px)`;
    context.drawImage(blur, 0, 0, width, height, left, top, width, height);
    context.restore();
  }

  function renderOverlay(
    context: CanvasRenderingContext2D,
    layer: OverlayLayer,
    width: number,
    height: number,
  ) {
    if (!layer.visible) return;
    const overlay = overlayBounds(layer, width, height);
    const erasures = [
      ...layer.erasures,
      ...(drawing.value?.targetId === layer.id ? [drawing.value] : []),
    ];
    if (!erasures.length) {
      context.drawImage(
        overlay.image,
        overlay.x,
        overlay.y,
        overlay.width,
        overlay.height,
      );
      return;
    }
    const mask = getScratchCanvas('mask', width, height);
    const maskContext = mask.getContext('2d');
    if (!maskContext) return;
    maskContext.clearRect(0, 0, width, height);
    maskContext.drawImage(
      overlay.image,
      overlay.x,
      overlay.y,
      overlay.width,
      overlay.height,
    );
    renderStrokes(maskContext, erasures);
    context.drawImage(mask, 0, 0);
  }

  function overlayBounds(
    layer: OverlayLayer,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    const image = layer.image;
    const scale = Math.min(
      (canvasWidth * 0.72) / image.naturalWidth,
      (canvasHeight * 0.72) / image.naturalHeight,
      1,
    );
    const width = image.naturalWidth * scale * layer.scaleX;
    const height = image.naturalHeight * scale * layer.scaleY;
    return {
      image,
      width,
      height,
      x: canvasWidth * layer.position.x - width / 2,
      y: canvasHeight * layer.position.y - height / 2,
    };
  }

  function fit() {
    const area = stage.value;
    if (!area) return;
    zoom.value = Math.min(
      1,
      (area.clientWidth - 80) / canvasSize.value.width,
      (area.clientHeight - 80) / canvasSize.value.height,
    );
  }

  async function fitToStage() {
    fit();
    await nextTick();
    const element = canvas.value;
    const area = stage.value;
    if (!element || !area) return;
    const canvasRect = element.getBoundingClientRect();
    const stageRect = area.getBoundingClientRect();
    pan.value = {
      x:
        pan.value.x +
        stageRect.left +
        stageRect.width / 2 -
        (canvasRect.left + canvasRect.width / 2),
      y:
        pan.value.y +
        stageRect.top +
        stageRect.height / 2 -
        (canvasRect.top + canvasRect.height / 2),
    };
  }

  function pointFrom(event: PointerEvent): Point | null {
    const element = canvas.value;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * element.width,
      y: ((event.clientY - rect.top) / rect.height) * element.height,
    };
  }

  function updateEraserGuide(event: PointerEvent) {
    const element = canvas.value;
    const area = stage.value;
    if (activeTool.value !== 'eraser' || !element || !area)
      return (eraserGuide.value = null);
    const canvasRect = element.getBoundingClientRect();
    const stageRect = area.getBoundingClientRect();
    eraserGuide.value = {
      x: event.clientX - stageRect.left,
      y: event.clientY - stageRect.top,
      size: (activeSize.value * canvasRect.width) / element.width,
    };
  }

  function topImageAt(point: Point) {
    const element = canvas.value;
    if (!element) return undefined;
    for (const id of [...layerStack.value].reverse()) {
      const layer = overlayLayers.value.find((item) => item.id === id);
      if (!layer?.visible) continue;
      const bounds = overlayBounds(layer, element.width, element.height);
      if (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      )
        return layer;
    }
    return undefined;
  }

  function resizeHandleAt(layer: OverlayLayer, point: Point) {
    const element = canvas.value;
    if (!element) return undefined;
    const { x, y, width, height } = overlayBounds(
      layer,
      element.width,
      element.height,
    );
    const near = 20;
    const left = Math.abs(point.x - x) <= near;
    const right = Math.abs(point.x - (x + width)) <= near;
    const top = Math.abs(point.y - y) <= near;
    const bottom = Math.abs(point.y - (y + height)) <= near;
    if (left && top) return 'nw';
    if (right && top) return 'ne';
    if (right && bottom) return 'se';
    if (left && bottom) return 'sw';
    if (top && point.x >= x && point.x <= x + width) return 'n';
    if (bottom && point.x >= x && point.x <= x + width) return 's';
    if (left && point.y >= y && point.y <= y + height) return 'w';
    if (right && point.y >= y && point.y <= y + height) return 'e';
    return undefined;
  }

  function pointerDown(event: PointerEvent) {
    if (!hasDocument.value || spaceHeld.value) return;
    const point = pointFrom(event);
    if (!point) return;
    if (activeTool.value === 'select') {
      if (!placementMode.value) return;
      const selected =
        editorMode.value === 'draw'
          ? topImageAt(point) ||
            overlayLayers.value.find(
              (layer) => layer.visible && resizeHandleAt(layer, point),
            )
          : undefined;
      if (selected) {
        selectedOverlayId.value = selected.id;
        const bounds = overlayBounds(
          selected,
          canvas.value!.width,
          canvas.value!.height,
        );
        const handle = resizeHandleAt(selected, point);
        overlayDrag = {
          id: selected.id,
          mode: handle ? 'resize' : 'move',
          handle,
          start: point,
          position: { ...selected.position },
          scaleX: selected.scaleX,
          scaleY: selected.scaleY,
          width: bounds.width,
          height: bounds.height,
          left: bounds.x,
          top: bounds.y,
          snapshotted: false,
        };
        (event.currentTarget as HTMLCanvasElement).setPointerCapture(
          event.pointerId,
        );
      } else {
        useTool('pen');
        return;
      }
      scheduleRender();
      return;
    }
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    snapshot();
    drawing.value = {
      id: crypto.randomUUID(),
      tool: activeTool.value,
      color: brushColor.value,
      size: activeSize.value,
      opacity: activeTool.value === 'pen' ? brushOpacity.value / 100 : 1,
      strength: activeTool.value === 'blur' ? blurStrength.value : undefined,
      points: [point, point],
    };
    if (editorMode.value === 'image')
      renderSegment(drawing.value, point, point);
    else render();
  }

  function useTool(tool: 'pen' | 'eraser' | 'blur') {
    placementMode.value = false;
    selectedOverlayId.value = null;
    hoverHandle.value = null;
    hoverImage.value = false;
    eraserGuide.value = null;
    activeTool.value = tool;
    render();
  }

  function stagePointerDown(event: PointerEvent) {
    if (!hasDocument.value || !spaceHeld.value) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    panDrag = { x: event.clientX, y: event.clientY, pan: { ...pan.value } };
  }

  function stagePointerMove(event: PointerEvent) {
    if (!panDrag) return;
    pan.value = {
      x: panDrag.pan.x + event.clientX - panDrag.x,
      y: panDrag.pan.y + event.clientY - panDrag.y,
    };
  }

  function stagePointerUp() {
    panDrag = null;
  }

  function onWheel(event: WheelEvent) {
    if (!hasDocument.value || !canvas.value) return;
    const nextZoom = Math.min(
      3,
      Math.max(0.1, zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
    );
    const rect = canvas.value.getBoundingClientRect();
    const ratio = nextZoom / zoom.value;
    pan.value = {
      x:
        pan.value.x +
        (event.clientX - (rect.left + rect.width / 2)) * (1 - ratio),
      y:
        pan.value.y +
        (event.clientY - (rect.top + rect.height / 2)) * (1 - ratio),
    };
    zoom.value = nextZoom;
  }

  function pointerMove(event: PointerEvent) {
    updateEraserGuide(event);
    if (overlayDrag) {
      const point = pointFrom(event);
      const element = canvas.value;
      if (!point || !element) return;
      const layer = overlayLayers.value.find(
        (item) => item.id === overlayDrag!.id,
      );
      if (!layer) return;
      if (
        !overlayDrag.snapshotted &&
        (point.x !== overlayDrag.start.x || point.y !== overlayDrag.start.y)
      ) {
        snapshot();
        overlayDrag.snapshotted = true;
      }
      const bounds = overlayBounds(layer, element.width, element.height);
      const minX = bounds.width / 2 / element.width;
      const minY = bounds.height / 2 / element.height;
      if (overlayDrag.mode === 'resize') {
        const handle = overlayDrag.handle!;
        const right = overlayDrag.left + overlayDrag.width;
        const bottom = overlayDrag.top + overlayDrag.height;
        let left = handle.includes('w')
          ? Math.max(0, Math.min(right - 24, point.x))
          : overlayDrag.left;
        let top = handle.includes('n')
          ? Math.max(0, Math.min(bottom - 24, point.y))
          : overlayDrag.top;
        let nextRight = handle.includes('e')
          ? Math.min(element.width, Math.max(left + 24, point.x))
          : right;
        let nextBottom = handle.includes('s')
          ? Math.min(element.height, Math.max(top + 24, point.y))
          : bottom;
        let width = nextRight - left;
        let height = nextBottom - top;
        if (event.shiftKey) {
          const aspect = overlayDrag.width / overlayDrag.height;
          const horizontal = handle.includes('w') || handle.includes('e');
          const vertical = handle.includes('n') || handle.includes('s');
          if (
            !vertical ||
            (horizontal &&
              Math.abs(width / overlayDrag.width - 1) >=
                Math.abs(height / overlayDrag.height - 1))
          )
            height = width / aspect;
          else width = height * aspect;

          const anchorX = handle.includes('w')
            ? right
            : handle.includes('e')
              ? overlayDrag.left
              : overlayDrag.left + overlayDrag.width / 2;
          const anchorY = handle.includes('n')
            ? bottom
            : handle.includes('s')
              ? overlayDrag.top
              : overlayDrag.top + overlayDrag.height / 2;
          const maxWidth = handle.includes('w')
            ? anchorX
            : handle.includes('e')
              ? element.width - anchorX
              : Math.min(anchorX, element.width - anchorX) * 2;
          const maxHeight = handle.includes('n')
            ? anchorY
            : handle.includes('s')
              ? element.height - anchorY
              : Math.min(anchorY, element.height - anchorY) * 2;
          const scale = Math.min(1, maxWidth / width, maxHeight / height);
          width *= scale;
          height *= scale;
          left = handle.includes('w')
            ? anchorX - width
            : handle.includes('e')
              ? anchorX
              : anchorX - width / 2;
          top = handle.includes('n')
            ? anchorY - height
            : handle.includes('s')
              ? anchorY
              : anchorY - height / 2;
          nextRight = left + width;
          nextBottom = top + height;
        }
        layer.scaleX = (overlayDrag.scaleX * width) / overlayDrag.width;
        layer.scaleY = (overlayDrag.scaleY * height) / overlayDrag.height;
        layer.position = {
          x: (left + width / 2) / element.width,
          y: (top + height / 2) / element.height,
        };
      } else
        layer.position = {
          x: Math.min(
            1 - minX,
            Math.max(
              minX,
              overlayDrag.position.x +
                (point.x - overlayDrag.start.x) / element.width,
            ),
          ),
          y: Math.min(
            1 - minY,
            Math.max(
              minY,
              overlayDrag.position.y +
                (point.y - overlayDrag.start.y) / element.height,
            ),
          ),
        };
      scheduleRender();
      return;
    }
    const point = pointFrom(event);
    if (!point) return;
    if (activeTool.value === 'select' && placementMode.value) {
      const layer =
        topImageAt(point) ||
        overlayLayers.value.find(
          (item) => item.visible && resizeHandleAt(item, point),
        );
      hoverImage.value = !!layer;
      hoverHandle.value = layer ? resizeHandleAt(layer, point) || null : null;
    }
    if (!drawing.value) return;
    const previous = drawing.value.points[drawing.value.points.length - 1];
    drawing.value.points.push(point);
    if (editorMode.value === 'image')
      renderSegment(drawing.value, previous, point);
    else scheduleRender();
  }

  function pointerUp() {
    if (overlayDrag) {
      overlayDrag = null;
      return;
    }
    if (!drawing.value) return;
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = undefined;
    strokes.value.push(drawing.value);
    if (editorMode.value === 'draw')
      layerStack.value.push(`${STROKE_PREFIX}${drawing.value.id}`);
    drawing.value = null;
    if (editorMode.value === 'draw') render();
  }

  async function readImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert('Choose an image smaller than 16 MB.');
      return;
    }
    if (
      editorMode.value === 'draw' &&
      overlayLayers.value.length >= MAX_OVERLAY_LAYERS
    )
      return;
    let data: string;
    let image: HTMLImageElement;
    try {
      data = await fileToDataUrl(file);
      image = new Image();
      image.src = data;
      await image.decode();
    } catch {
      window.alert('This image could not be opened.');
      return;
    }
    if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
      window.alert('Choose an image with 16 megapixels or fewer.');
      return;
    }
    if (editorMode.value === 'draw') {
      const id = crypto.randomUUID();
      overlayLayers.value.push({
        id,
        name: file.name,
        image,
        data,
        position: { x: 0.5, y: 0.5 },
        scaleX: 1,
        scaleY: 1,
        visible: true,
        erasures: [],
      });
      layerStack.value.push(id);
      selectedOverlayId.value = id;
      placementMode.value = true;
      activeTool.value = 'select';
      await nextTick();
      render();
      return;
    }
    const document: ImageDocument = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '') || 'Untitled canvas',
      image,
      data,
      filters: {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        blur: 0,
        hue: 0,
      },
      strokes: [],
      undoStack: [],
      redoStack: [],
    };
    imageDocuments.value.push(document);
    editorMode.value = 'image';
    await selectImageDocument(document.id);
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function openImage() {
    imageInput.value?.click();
  }
  async function startEditor(mode: 'draw' | 'image') {
    editorMode.value = mode;
    activeTool.value = mode === 'draw' ? 'pen' : 'select';
    source.value = null;
    imageData.value = '';
    imageDocuments.value = [];
    activeImageId.value = null;
    overlayLayers.value = [];
    placementMode.value = false;
    layerStack.value = [];
    selectedOverlayId.value = null;
    imageName.value = mode === 'draw' ? 'Untitled drawing' : 'Untitled canvas';
    canvasSize.value = { width: 1600, height: 1000 };
    strokes.value = [];
    filters.value = {
      brightness: 100,
      contrast: 100,
      saturate: 100,
      blur: 0,
      hue: 0,
    };
    pan.value = { x: 0, y: 0 };
    await nextTick();
    render();
    await fitToStage();
  }
  function openProject() {
    if (canImportProject.value) projectInput.value?.click();
  }
  async function onImagePick(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (editorMode.value !== 'draw') {
      for (const file of files) await readImage(file);
      return;
    }
    if (overlayLayers.value.length) {
      window.alert('Free draw supports one placed image.');
      return;
    }
    const available = MAX_OVERLAY_LAYERS - overlayLayers.value.length;
    if (files.length > available)
      window.alert(`You can add up to ${MAX_OVERLAY_LAYERS} image layers.`);
    for (const file of files.slice(0, available)) await readImage(file);
  }

  async function loadProject(file: File) {
    try {
      const project = JSON.parse(await file.text()) as Project;
      if (
        project.version !== 1 ||
        project.kind !== 'webcanvas-project' ||
        !Array.isArray(project.strokes)
      )
        throw new Error('Invalid project');
      let image: HTMLImageElement | null = null;
      if (project.image) {
        image = new Image();
        image.src = project.image;
        await image.decode();
      }
      const savedLayers =
        project.overlays ||
        (project.overlay
          ? [
              {
                data: project.overlay,
                position: project.overlayPosition || { x: 0.5, y: 0.5 },
              },
            ]
          : []);
      const overlays = await Promise.all(
        savedLayers.map(async (saved) => {
          const overlay = new Image();
          overlay.src = saved.data;
          await overlay.decode();
          return {
            id: crypto.randomUUID(),
            name: saved.name || 'Image layer',
            image: overlay,
            data: saved.data,
            position: saved.position,
            scaleX: saved.scaleX || saved.scale || 1,
            scaleY: saved.scaleY || saved.scale || 1,
            visible: saved.visible !== false,
            erasures: saved.erasures || [],
          };
        }),
      );
      imageDocuments.value = [];
      activeImageId.value = null;
      source.value = image;
      overlayLayers.value = overlays;
      imageData.value = project.image || '';
      selectedOverlayId.value = null;
      imageName.value = project.name || 'Untitled canvas';
      canvasSize.value =
        project.canvas ||
        (image
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : { width: 1600, height: 1000 });
      editorMode.value = image ? 'image' : 'draw';
      pan.value = { x: 0, y: 0 };
      filters.value = { ...filters.value, ...project.filters };
      strokes.value = project.strokes.map((stroke) => ({
        ...stroke,
        id: stroke.id || crypto.randomUUID(),
      }));
      const defaultOrder = [
        ...overlays.map((_, index) => index),
        ...strokes.value.map((stroke) => `${STROKE_PREFIX}${stroke.id}`),
      ];
      const savedOrder = project.layerOrder || defaultOrder;
      layerStack.value = savedOrder.flatMap((item) => {
        if (typeof item === 'number')
          return overlays[item] ? [overlays[item].id] : [];
        if (item === 'drawing')
          return strokes.value.map((stroke) => `${STROKE_PREFIX}${stroke.id}`);
        return strokes.value.some(
          (stroke) => `${STROKE_PREFIX}${stroke.id}` === item,
        )
          ? [item]
          : [];
      });
      undoStack.value = [];
      redoStack.value = [];
      if (image && project.documents?.length) {
        imageDocuments.value = await Promise.all(
          project.documents.map(async (saved) => {
            const documentImage = new Image();
            documentImage.src = saved.image;
            await documentImage.decode();
            return {
              id: crypto.randomUUID(),
              name: saved.name,
              image: documentImage,
              data: saved.image,
              filters: saved.filters,
              strokes: saved.strokes,
              undoStack: [],
              redoStack: [],
            };
          }),
        );
        await selectImageDocument(
          imageDocuments.value[project.activeDocument || 0]?.id ||
            imageDocuments.value[0].id,
        );
        return;
      }
      if (image) {
        const document = {
          id: crypto.randomUUID(),
          name: imageName.value,
          image,
          data: project.image || '',
          filters: filters.value,
          strokes: strokes.value,
          undoStack: [],
          redoStack: [],
        };
        imageDocuments.value = [document];
        activeImageId.value = document.id;
      }
      await nextTick();
      render();
      await fitToStage();
    } catch {
      window.alert('This is not a valid Webcanvas project file.');
    }
  }

  async function onProjectPick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await loadProject(file);
  }

  function download(name: string, content: string | Blob, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveProject() {
    if (!hasDocument.value) return;
    const project: Project = {
      version: 1,
      kind: 'webcanvas-project',
      name: imageName.value,
      image: imageData.value || undefined,
      overlays: overlayLayers.value.map(
        ({ name, data, position, scaleX, scaleY, visible, erasures }) => ({
          name,
          data,
          position,
          scaleX,
          scaleY,
          visible,
          erasures,
        }),
      ),
      layerOrder: layerStack.value.map((id) =>
        id.startsWith(STROKE_PREFIX)
          ? id
          : overlayLayers.value.findIndex((layer) => layer.id === id),
      ),
      canvas: canvasSize.value,
      filters: filters.value,
      strokes: strokes.value,
      documents:
        editorMode.value === 'image'
          ? imageDocuments.value.map(({ name, data, filters, strokes }) => ({
              name,
              image: data,
              filters,
              strokes,
            }))
          : undefined,
      activeDocument: imageDocuments.value.findIndex(
        (item) => item.id === activeImageId.value,
      ),
    };
    download(
      `${imageName.value}.json`,
      JSON.stringify(project),
      'application/json',
    );
  }

  function exportPng() {
    if (!canvas.value) return;
    const selected = selectedOverlayId.value;
    selectedOverlayId.value = null;
    render();
    canvas.value.toBlob((blob) => {
      if (blob) download(`${imageName.value}.png`, blob, 'image/png');
    }, 'image/png');
    selectedOverlayId.value = selected;
    render();
  }

  function undo() {
    const previous = undoStack.value.pop();
    if (!previous) return;
    redoStack.value.push(cloneHistory());
    restoreHistory(previous);
    render();
  }

  function redo() {
    const next = redoStack.value.pop();
    if (!next) return;
    undoStack.value.push(cloneHistory());
    restoreHistory(next);
    render();
  }

  function resetEdits() {
    if (!hasDocument.value) return;
    snapshot();
    strokes.value = [];
    filters.value = {
      brightness: 100,
      contrast: 100,
      saturate: 100,
      blur: 0,
      hue: 0,
    };
    syncActiveDocument();
    render();
  }

  watch(filters, scheduleRender, { deep: true });
  function onKeyDown(event: KeyboardEvent) {
    if (
      event.code === 'Space' &&
      event.target instanceof HTMLElement &&
      !event.target.matches('input, button')
    ) {
      spaceHeld.value = true;
      event.preventDefault();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space') spaceHeld.value = false;
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(fit);
    if (stage.value) resizeObserver.observe(stage.value);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', stagePointerUp);
  });
  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    if (renderFrame) cancelAnimationFrame(renderFrame);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', stagePointerUp);
  });

  return {
    canvas,
    stage,
    imageInput,
    projectInput,
    source,
    imageDocuments,
    activeImageId,
    overlayLayers,
    editorMode,
    imageName,
    activeTool,
    brushColor,
    brushOpacity,
    zoom,
    filters,
    undoStack,
    redoStack,
    placementMode,
    spaceHeld,
    hoverHandle,
    hoverImage,
    eraserGuide,
    inspectorOpen,
    hasImage,
    hasDocument,
    canImportProject,
    activeSize,
    blurStrength,
    canvasStyle,
    pointerDown,
    pointerMove,
    pointerUp,
    useTool,
    stagePointerDown,
    stagePointerMove,
    stagePointerUp,
    onWheel,
    openImage,
    startEditor,
    openProject,
    onImagePick,
    onProjectPick,
    saveProject,
    exportPng,
    undo,
    redo,
    resetEdits,
    selectImageDocument,
  };
}
