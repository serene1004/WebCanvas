import { createRouter, createWebHistory } from 'vue-router';
import EditorView from './views/EditorView.vue';
import HomeView from './views/HomeView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/editor', name: 'editor', component: EditorView },
  ],
});
