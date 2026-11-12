/*
  viewportFit.js
  --------------
  Punto 94: la pantalla queda bien ajustada en el celular.

  - Al cerrar el teclado (un cuadro de escribir pierde el foco), si la
    página quedó corrida hacia un lado, vuelve a la orilla izquierda sin
    mover el scroll vertical. Solo en pantallas táctiles. Si el usuario
    hizo zoom con los dedos a propósito, no se toca.
  - Con ?debug=1 (ver debug.js): marca con borde rojo y avisa en la
    consola cada elemento más ancho que la pantalla, para encontrar al
    culpable en el iPhone real. Sin ?debug=1 esa parte no hace nada.
*/

import { DEBUG } from "./debug";

const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const KEYBOARD_CLOSE_DELAY_MS = 350;

function isTouchScreen() {
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

function realignAfterKeyboard() {
  document.addEventListener("focusout", (event) => {
    if (!FIELD_TAGS.has(event.target.tagName) || !isTouchScreen()) return;
    window.setTimeout(() => {
      // El foco pasó a otro cuadro: el teclado sigue abierto.
      if (document.activeElement && FIELD_TAGS.has(document.activeElement.tagName)) return;
      const vv = window.visualViewport;
      if (vv && vv.scale > 1.01) return;
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    }, KEYBOARD_CLOSE_DELAY_MS);
  });
}

// Un elemento cuenta si se sale de la pantalla y ningún ancestro lo
// recorta (los carruseles con overflow auto o hidden están bien).
function isClippedByAncestor(el) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflowX = window.getComputedStyle(node).overflowX;
    if (overflowX !== "visible") return true;
  }
  return false;
}

function findWideElements() {
  const width = document.documentElement.clientWidth;
  const sticksOut = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
  };
  const found = [];
  document.body.querySelectorAll("*").forEach((el) => {
    if (!sticksOut(el) || isClippedByAncestor(el)) return;
    // Solo el de más afuera: sus hijos se salen por culpa de él.
    if (el.parentElement && el.parentElement !== document.body && sticksOut(el.parentElement)) return;
    found.push(el);
  });
  return found;
}

function watchWideElements() {
  const marked = new Set();
  const scan = () => {
    findWideElements().forEach((el) => {
      if (marked.has(el)) return;
      marked.add(el);
      el.style.outline = "2px solid red";
      el.style.outlineOffset = "-2px";
      const rect = el.getBoundingClientRect();
      console.warn(
        `[debug] Más ancho que la pantalla (${Math.round(rect.left)}→${Math.round(rect.right)} de ${document.documentElement.clientWidth}px):`,
        el
      );
    });
  };
  window.setInterval(scan, 2000);
  window.addEventListener("resize", scan);
}

export function initViewportFit() {
  realignAfterKeyboard();
  if (DEBUG) watchWideElements();
}
