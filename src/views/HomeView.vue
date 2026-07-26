<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

const router = useRouter();

function openEditor(mode: 'draw' | 'image') {
  router.push({ name: 'editor', query: { mode } });
}
</script>

<template>
  <main class="home-shell">
    <header class="home-topbar">
      <span class="brand">
        <img class="brand-mark" src="/logo.svg" alt="" />
        WebCanvas
      </span>
    </header>
    <section class="home-hero">
      <div class="hero-copy">
        <p class="eyebrow">CREATIVE IMAGE EDITOR</p>
        <h1>Make an image<br />your own.</h1>
        <p class="hero-description">
          Draw freely on a clean canvas, or make a quick adjustment to a photo.
        </p>
        <div class="home-actions">
          <button
            class="button button-primary hero-button"
            type="button"
            @click="openEditor('draw')"
          >
            Canvas drawing <ArrowRight :size="17" />
          </button>
          <button
            class="button button-quiet hero-button"
            type="button"
            @click="openEditor('image')"
          >
            Edit an image <ArrowRight :size="17" />
          </button>
        </div>
      </div>
      <div class="feature-list" aria-label="Webcanvas features">
        <article>
          <strong>01</strong>
          <h2>Canvas drawing</h2>
          <p>
            Draw with a pen, erase with precision, and place one reference image directly on the
            artboard.
          </p>
        </article>
        <article>
          <strong>02</strong>
          <h2>Image editing</h2>
          <p>Adjust tone, blur, saturation, and hue, then draw or erase directly on each image.</p>
        </article>
        <article>
          <strong>03</strong>
          <h2>Save your work</h2>
          <p>
            Export your editable work as
            <code>.json</code>
            or save the current image as PNG.
          </p>
        </article>
      </div>
    </section>
    <footer class="home-footer">
      <span>Draw · erase · adjust · export</span>
      <span>Canvas tools for visual ideas</span>
    </footer>
  </main>
</template>
