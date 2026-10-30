import { useEffect, useRef } from 'preact/hooks';
import { closeSheet, sheetContent, sheetOpen } from '../lib/ui';

/**
 * Bottom sheet host. Drag it down to close: from anywhere on the panel when
 * its content is scrolled to the top (a drag starting in a textarea stays a
 * scroll / selection). A long drag or a quick flick closes it, otherwise it
 * springs back.
 */
export function Sheet() {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panel.current!;
    let startY = 0;
    let dy = 0;
    // Recent positions, to measure the speed at release (a flick).
    let samples: { y: number; t: number }[] = [];
    let state: 'idle' | 'maybe' | 'drag' = 'idle';

    const reset = () => {
      el.style.transition = '';
      el.style.transform = '';
      backdrop.current!.style.opacity = '';
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || (e.target as HTMLElement).closest('textarea')) return;
      state = el.scrollTop <= 0 ? 'maybe' : 'idle';
      startY = e.touches[0].clientY;
      dy = 0;
      samples = [{ y: startY, t: Date.now() }];
    };

    const onMove = (e: TouchEvent) => {
      if (state === 'idle') return;
      dy = e.touches[0].clientY - startY;
      const now = Date.now();
      samples = [...samples.filter(x => now - x.t < 100), { y: e.touches[0].clientY, t: now }];
      if (state === 'maybe') {
        // Moving up (or the content scrolled meanwhile): a normal scroll.
        if (dy < 0 || el.scrollTop > 0) { state = 'idle'; return; }
        if (dy < 6) return;
        state = 'drag';
        el.style.transition = 'none';
      }
      e.preventDefault();
      const y = Math.max(0, dy);
      el.style.transform = `translateY(${y}px)`;
      backdrop.current!.style.opacity = String(Math.max(0, 1 - y / el.offsetHeight));
    };

    const onEnd = () => {
      if (state !== 'drag') { state = 'idle'; return; }
      state = 'idle';
      const first = samples[0], last = samples[samples.length - 1];
      const velocity = (last.y - first.y) / Math.max(16, last.t - first.t);
      const close = dy > Math.min(120, el.offsetHeight * 0.25) || (dy > 40 && velocity > 0.4);
      reset();
      if (close) closeSheet();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div class={`sheet ${sheetOpen.value ? 'open' : ''}`} hidden={!sheetContent.value}>
      <div class="sheet-backdrop" ref={backdrop} onClick={() => closeSheet()} />
      <div class="sheet-panel" role="dialog" aria-modal="true" ref={panel}>
        <div class="sheet-grip" />
        {sheetContent.value}
      </div>
    </div>
  );
}
