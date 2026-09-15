import type { Camera } from "../camera.ts";

const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_RATE = 0.0015;

export function bindCameraInput(
  target: HTMLElement,
  camera: Camera,
  input: { onRefit: () => void },
): () => void {
  let pointerId: number | undefined;
  let lastX = 0;
  let lastY = 0;
  let dragged = false;

  function localPoint(event: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || pointerId !== undefined) {
      return;
    }
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    dragged = false;
    target.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!dragged && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) {
      return;
    }
    dragged = true;
    target.dataset.panning = "true";
    lastX = event.clientX;
    lastY = event.clientY;
    camera.panByScreen(dx, dy);
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = undefined;
    delete target.dataset.panning;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  // A drag ends with a click on the scene, which the theme reads as a selection.
  // Swallowing it in the capture phase keeps panning from selecting a bot.
  function onClickCapture(event: MouseEvent): void {
    if (!dragged) {
      return;
    }
    dragged = false;
    event.stopPropagation();
    event.preventDefault();
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    camera.zoomAt(localPoint(event), Math.exp(-event.deltaY * WHEEL_ZOOM_RATE));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Home" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const node = event.target;
    if (node instanceof HTMLElement && isTypingTarget(node)) {
      return;
    }
    event.preventDefault();
    input.onRefit();
  }

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);
  target.addEventListener("click", onClickCapture, true);
  target.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", onPointerUp);
    target.removeEventListener("click", onClickCapture, true);
    target.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
  };
}

function isTypingTarget(node: HTMLElement): boolean {
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}
