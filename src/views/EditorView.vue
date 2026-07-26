<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Aperture,
  Download,
  Eraser,
  FileJson,
  ImageUp,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
} from 'lucide-vue-next';
import { useEditor } from '../composables/useEditor';

const route = useRoute();
const router = useRouter();
const {
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
} = useEditor();

onMounted(() => startEditor(route.query.mode === 'draw' ? 'draw' : 'image'));

function clearCanvasHover() {
  hoverHandle.value = null;
  hoverImage.value = false;
  eraserGuide.value = null;
}
</script>

<template>
  <main class="editor-shell">
    <header class="topbar">
      <!-- prettier-ignore -->
      <button class="brand" type="button" @click="router.push({ name: 'home' })">
        <img class="brand-mark" src="/logo.svg" alt="" />
        WebCanvas
      </button>
      <p class="document-name">
        {{ imageName
        }}<small v-if="hasImage"> · {{ source?.naturalWidth }} x {{ source?.naturalHeight }}</small>
      </p>
      <div class="header-actions">
        <button
          class="button button-quiet"
          type="button"
          :disabled="!hasDocument"
          @click="saveProject"
        >
          <FileJson :size="16" /> Export JSON
        </button>
        <button
          class="button button-primary"
          type="button"
          :disabled="!hasDocument"
          @click="exportPng"
        >
          <Download :size="16" /> Save image
        </button>
      </div>
    </header>

    <section class="editor" :class="{ 'is-image-empty': editorMode === 'image' && !hasImage }">
      <aside v-if="hasDocument" class="toolbar" aria-label="Editing tools">
        <button
          type="button"
          title="Import image"
          aria-label="Import image"
          :disabled="editorMode === 'draw' && overlayLayers.length > 0"
          @click="openImage"
        >
          <ImageUp :size="18" />
        </button>
        <button
          v-if="canImportProject"
          type="button"
          title="Import JSON"
          aria-label="Import JSON"
          @click="openProject"
        >
          <FileJson :size="18" />
        </button>
        <span></span>
        <button
          v-if="editorMode === 'image'"
          :class="{ active: activeTool === 'select' }"
          type="button"
          title="Select"
          aria-label="Select"
          @click="activeTool = 'select'"
        >
          <MousePointer2 :size="18" />
        </button>
        <button
          :class="{ active: activeTool === 'pen' }"
          type="button"
          title="Draw"
          aria-label="Draw"
          @click="useTool('pen')"
        >
          <Pencil :size="18" />
        </button>
        <button
          v-if="editorMode === 'image'"
          :class="{ active: activeTool === 'blur' }"
          type="button"
          title="Blur"
          aria-label="Blur"
          @click="useTool('blur')"
        >
          <Aperture :size="18" />
        </button>
        <button
          :class="{ active: activeTool === 'eraser' }"
          type="button"
          title="Erase"
          aria-label="Erase"
          @click="useTool('eraser')"
        >
          <Eraser :size="18" />
        </button>
        <span></span>
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          :disabled="!undoStack.length"
          @click="undo"
        >
          <Undo2 :size="18" />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          :disabled="!redoStack.length"
          @click="redo"
        >
          <Redo2 :size="18" />
        </button>
      </aside>

      <section
        ref="stage"
        class="stage"
        :class="{ 'is-panning': spaceHeld }"
        aria-label="Image editor canvas"
        @pointerdown="stagePointerDown"
        @pointermove="stagePointerMove"
        @pointerup="stagePointerUp"
        @pointercancel="stagePointerUp"
        @wheel.prevent="onWheel"
      >
        <div v-if="!hasDocument" class="drop-empty">
          <div class="empty-icon"><ImageUp :size="28" /></div>
          <h1>Create something visual.</h1>
          <p>Import PNG, JPG, WebP, GIF, or any image your browser supports.</p>
          <div class="empty-actions">
            <button class="button button-primary" type="button" @click="openImage">
              <ImageUp :size="17" /> Import images
            </button>
            <button class="button button-quiet" type="button" @click="openProject">
              <FileJson :size="17" /> Import JSON
            </button>
          </div>
        </div>
        <canvas
          v-else
          ref="canvas"
          class="image-canvas"
          :class="[
            `tool-${activeTool}`,
            { 'placement-hover': placementMode && hoverImage && !hoverHandle },
            hoverHandle ? `resize-${hoverHandle}` : '',
          ]"
          :style="canvasStyle"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
          @pointercancel="pointerUp"
          @pointerleave="clearCanvasHover"
        />
        <div
          v-if="eraserGuide && activeTool === 'eraser'"
          class="eraser-guide"
          :style="{
            left: `${eraserGuide.x}px`,
            top: `${eraserGuide.y}px`,
            width: `${eraserGuide.size}px`,
            height: `${eraserGuide.size}px`,
          }"
        />
      </section>

      <button
        v-if="hasDocument"
        class="mobile-inspector-toggle"
        type="button"
        aria-controls="editor-inspector"
        :aria-expanded="inspectorOpen"
        @click="inspectorOpen = !inspectorOpen"
      >
        <SlidersHorizontal :size="16" /> Settings
      </button>
      <aside
        v-if="hasDocument"
        id="editor-inspector"
        :class="[
          'inspector',
          { 'is-draw': editorMode === 'draw', 'is-mobile-open': inspectorOpen },
        ]"
        aria-label="Image settings"
      >
        <template v-if="hasImage">
          <div class="panel-title"><SlidersHorizontal :size="16" /> Adjust</div>
          <label
            >Brightness <output>{{ filters.brightness }}%</output
            ><input v-model.number="filters.brightness" type="range" min="0" max="200"
          /></label>
          <label
            >Contrast <output>{{ filters.contrast }}%</output
            ><input v-model.number="filters.contrast" type="range" min="0" max="200"
          /></label>
          <label
            >Saturation <output>{{ filters.saturate }}%</output
            ><input v-model.number="filters.saturate" type="range" min="0" max="200"
          /></label>
          <label
            >Blur <output>{{ filters.blur }}px</output
            ><input v-model.number="filters.blur" type="range" min="0" max="24"
          /></label>
          <label
            >Hue <output>{{ filters.hue }}°</output
            ><input v-model.number="filters.hue" type="range" min="-180" max="180"
          /></label>
          <div class="divider"></div>
        </template>
        <div
          v-if="editorMode === 'draw' || activeTool !== 'select'"
          :class="[
            'tool-settings',
            { 'is-disabled': editorMode === 'draw' && activeTool === 'select' },
          ]"
        >
          <div class="panel-title">
            {{ activeTool === 'eraser' ? 'Eraser' : activeTool === 'blur' ? 'Blur' : 'Brush' }}
          </div>
          <label v-if="activeTool === 'pen'"
            >Color <input v-model="brushColor" class="color-input" type="color"
          /></label>
          <label
            >Size <output>{{ activeSize }}px</output
            ><input
              v-model.number="activeSize"
              type="range"
              min="2"
              max="100"
              :disabled="activeTool === 'select'"
          /></label>
          <label v-if="activeTool === 'pen'"
            >Opacity <output>{{ brushOpacity }}%</output
            ><input v-model.number="brushOpacity" type="range" min="0" max="100"
          /></label>
          <label v-if="activeTool === 'blur'"
            >Strength <output>{{ blurStrength }}px</output
            ><input v-model.number="blurStrength" type="range" min="1" max="24"
          /></label>
        </div>
        <p v-if="editorMode === 'draw'" class="artboard-note">
          Place one image, position it once, then draw and erase directly on the artboard.
        </p>
        <button
          v-if="editorMode === 'image'"
          class="button button-quiet reset-button"
          type="button"
          @click="resetEdits"
        >
          <RotateCcw :size="15" /> Reset edits
        </button>
        <div v-if="editorMode === 'image'" class="image-list">
          <div class="panel-title">
            Files <small>{{ imageDocuments.length }}</small>
          </div>
          <button
            v-for="document in imageDocuments"
            :key="document.id"
            :class="{ active: document.id === activeImageId }"
            type="button"
            @click="selectImageDocument(document.id)"
          >
            <ImageUp :size="15" /><span>{{ document.name }}</span>
          </button>
        </div>
      </aside>
    </section>

    <footer v-if="hasDocument" class="statusbar">
      <span>{{
        spaceHeld
          ? 'Drag to pan the canvas.'
          : activeTool === 'eraser'
            ? 'Eraser makes image areas transparent.'
            : activeTool === 'blur'
              ? 'Drag to blur a specific image area.'
              : activeTool === 'pen'
                ? 'Drag on the image to draw.'
                : 'Wheel to zoom · Hold Space and drag to pan.'
      }}</span>
      <div>
        <button type="button" aria-label="Zoom out" @click="zoom = Math.max(0.1, zoom - 0.1)">
          <Minus :size="14" /></button
        ><span>{{ Math.round(zoom * 100) }}%</span
        ><button type="button" aria-label="Zoom in" @click="zoom = Math.min(2, zoom + 0.1)">
          <Plus :size="14" />
        </button>
      </div>
    </footer>
  </main>
  <input
    ref="imageInput"
    class="visually-hidden"
    type="file"
    accept="image/*"
    multiple
    @change="onImagePick"
  />
  <input
    ref="projectInput"
    class="visually-hidden"
    type="file"
    accept=".json,application/json"
    @change="onProjectPick"
  />
</template>
