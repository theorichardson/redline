/**
 * Interactive Redline demo for the marketing site.
 * Mirrors extension hover, box model, guides, tooltip, and FAB behavior.
 */
(function () {
  const viewport = document.getElementById('rl-demo-viewport');
  if (!viewport) return;

  const page = viewport.querySelector('.rl-demo-page');
  const overlay = viewport.querySelector('.rl-overlay');
  const fab = viewport.querySelector('#rl-demo-fab');
  const fabBtn = fab?.querySelector('.redline-fab');
  const collapseBtn = fab?.querySelector('.redline-collapse-btn');

  const fabContainer = fab?.querySelector('.redline-buttons-container');
  let expandActivationTimeout = null;

  let active = true;
  let hoveredEl = null;
  let copyTimeout = null;

  const VIEWPORT_MARGIN = 4;

  const layers = {
    margin: overlay.querySelector('.rl-margin-layer'),
    padding: overlay.querySelector('.rl-padding-layer'),
    gap: overlay.querySelector('.rl-gap-layers'),
    guides: overlay.querySelector('.rl-guides'),
    box: overlay.querySelector('.rl-box'),
    marginLabels: overlay.querySelector('.rl-margin-labels'),
    paddingLabels: overlay.querySelector('.rl-padding-labels'),
    gapLabels: overlay.querySelector('.rl-gap-labels'),
    tooltip: overlay.querySelector('.rl-tooltip'),
  };

  function viewportRect() {
    return viewport.getBoundingClientRect();
  }

  function toLocal(rect) {
    const vr = viewportRect();
    return {
      top: rect.top - vr.top + viewport.scrollTop,
      left: rect.left - vr.left + viewport.scrollLeft,
      width: rect.width,
      height: rect.height,
      right: rect.right - vr.left,
      bottom: rect.bottom - vr.top,
    };
  }

  function formatElementName(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = Array.from(el.classList)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');
    return `<${tag}>${id}${classes}`;
  }

  function extractToken(value) {
    const normalized = (value || '').trim();
    const calcMatch = normalized.match(
      /calc\s*\(\s*(?:var\s*\(\s*--spacing\s*\)\s*\*\s*([\d.]+)|([\d.]+)\s*\*\s*var\s*\(\s*--spacing\s*\))\s*\)/i,
    );
    if (calcMatch) {
      const scale = calcMatch[1] || calcMatch[2];
      return `spacing-${scale.replace(/\.?0+$/, '')}`;
    }
    const varMatch = normalized.match(/var\s*\(\s*(--[A-Za-z0-9_-]+)/);
    if (varMatch) {
      const name = varMatch[1].slice(2);
      if (name !== 'spacing') return name;
    }
    return null;
  }

  function getDeclaredValue(el, prop) {
    let value = '';
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule) {
            try {
              if (el.matches(rule.selectorText)) {
                const val = rule.style.getPropertyValue(prop);
                if (val) value = val;
              }
            } catch {
              /* invalid selector */
            }
          }
        }
      } catch {
        /* cross-origin */
      }
    }
    return value;
  }

  function getDeclaredSideValue(el, boxType, side) {
    const longhand = `${boxType}-${side}`;
    const direct = getDeclaredValue(el, longhand);
    if (direct) return direct;

    const shorthand = getDeclaredValue(el, boxType);
    if (!shorthand) return '';

    const parts = shorthand.trim().split(/\s+/);
    const idx = { top: 0, right: 1, bottom: 2, left: 3 };
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return side === 'top' || side === 'bottom' ? parts[0] : parts[1];
    if (parts.length === 3) {
      if (side === 'top') return parts[0];
      if (side === 'bottom') return parts[2];
      return parts[1];
    }
    if (parts.length >= 4) return parts[idx[side]];
    return '';
  }

  function formatBoxLabel(el, boxType, side, px) {
    const rounded = Math.round(px);
    if (rounded <= 0) return `${rounded}`;
    const raw = getDeclaredSideValue(el, boxType, side);
    const token = extractToken(raw);
    return token ? `${token} (${rounded}px)` : `${rounded}`;
  }

  function parseBox(el) {
    const c = getComputedStyle(el);
    const p = (v) => parseFloat(v) || 0;
    return {
      margin: { top: p(c.marginTop), right: p(c.marginRight), bottom: p(c.marginBottom), left: p(c.marginLeft) },
      border: { top: p(c.borderTopWidth), right: p(c.borderRightWidth), bottom: p(c.borderBottomWidth), left: p(c.borderLeftWidth) },
      padding: { top: p(c.paddingTop), right: p(c.paddingRight), bottom: p(c.paddingBottom), left: p(c.paddingLeft) },
    };
  }

  function setFrame(el, rect, inner) {
    const w = rect.width;
    const h = rect.height;
    el.style.display = 'block';
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.left}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.clipPath = `polygon(
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${inner.left}px ${inner.top}px,
      ${inner.left}px ${inner.bottom}px,
      ${inner.right}px ${inner.bottom}px,
      ${inner.right}px ${inner.top}px,
      ${inner.left}px ${inner.top}px
    )`;
  }

  function hideBoxModel() {
    [layers.margin, layers.padding].forEach((l) => {
      l.style.display = 'none';
      l.style.clipPath = 'none';
    });
    layers.marginLabels.innerHTML = '';
    layers.paddingLabels.innerHTML = '';
    layers.gap.innerHTML = '';
    layers.gapLabels.innerHTML = '';
  }

  function clampLabelToDemoViewport(label) {
    const vr = viewportRect();
    const minLeft = VIEWPORT_MARGIN;
    const minTop = VIEWPORT_MARGIN;
    const maxRight = vr.width - VIEWPORT_MARGIN;
    const maxBottom = vr.height - VIEWPORT_MARGIN;

    for (let pass = 0; pass < 2; pass++) {
      const rect = label.getBoundingClientRect();
      let dx = 0;
      let dy = 0;

      if (rect.left < vr.left + minLeft) dx += vr.left + minLeft - rect.left;
      if (rect.right > vr.left + maxRight) dx -= rect.right - (vr.left + maxRight);
      if (rect.top < vr.top + minTop) dy += vr.top + minTop - rect.top;
      if (rect.bottom > vr.top + maxBottom) dy -= rect.bottom - (vr.top + maxBottom);

      if (!dx && !dy) break;
      label.style.left = `${parseFloat(label.style.left) + dx}px`;
      label.style.top = `${parseFloat(label.style.top) + dy}px`;
    }
  }

  function pickPaddingSide(box) {
    const sides = ['top', 'right', 'bottom', 'left'];
    return sides.find((side) => box.padding[side] > 0) || 'top';
  }

  /** Single padding token label — top-left outside the element, like the name tooltip. */
  function placePaddingLabel(el, rect, box) {
    const side = pickPaddingSide(box);
    const px = box.padding[side];
    if (px <= 0) return;

    const label = document.createElement('span');
    label.className = 'rl-box-label rl-box-label--padding';
    label.textContent = formatBoxLabel(el, 'padding', side, px);
    layers.paddingLabels.appendChild(label);

    const gap = 8;
    label.style.visibility = 'hidden';
    label.style.display = 'block';
    label.style.left = `${rect.left}px`;
    label.style.top = `${rect.top - gap}px`;
    label.style.transform = 'translate(0, -100%)';
    label.style.visibility = '';

    clampLabelToDemoViewport(label);
  }

  function showBoxModel(el, rect, box) {
    hideBoxModel();

    const hasPadding =
      box.padding.top || box.padding.right || box.padding.bottom || box.padding.left;
    if (!hasPadding) return;

    const pTop = rect.top + box.border.top;
    const pLeft = rect.left + box.border.left;
    const pW = rect.width - box.border.left - box.border.right;
    const pH = rect.height - box.border.top - box.border.bottom;

    setFrame(layers.padding, { top: pTop, left: pLeft, width: pW, height: pH }, {
      top: box.padding.top,
      left: box.padding.left,
      right: pW - box.padding.right,
      bottom: pH - box.padding.bottom,
    });

    placePaddingLabel(el, rect, box);
  }

  function showGuides(el, rect) {
    layers.guides.innerHTML = '';
    const targets = Array.from(page.querySelectorAll('[data-rl]')).filter((n) => n !== el);
    const tolerance = 2;
    const edges = [
      { pos: rect.top, orient: 'h', type: 'top' },
      { pos: rect.bottom, orient: 'h', type: 'bottom' },
      { pos: rect.top + rect.height / 2, orient: 'h', type: 'centerY' },
      { pos: rect.left, orient: 'v', type: 'left' },
      { pos: rect.right, orient: 'v', type: 'right' },
      { pos: rect.left + rect.width / 2, orient: 'v', type: 'centerX' },
    ];

    for (const edge of edges) {
      let aligned = false;
      for (const other of targets) {
        const r = toLocal(other.getBoundingClientRect());
        const otherEdges =
          edge.orient === 'h'
            ? [r.top, r.bottom, r.top + r.height / 2]
            : [r.left, r.right, r.left + r.width / 2];
        if (otherEdges.some((p) => Math.abs(p - edge.pos) <= tolerance)) {
          aligned = true;
          break;
        }
      }
      if (!aligned) continue;

      const line = document.createElement('div');
      line.className = `rl-guide-line ${edge.orient === 'h' ? 'horizontal' : 'vertical'}`;
      if (edge.type === 'centerY' || edge.type === 'centerX') line.classList.add('selected');
      if (edge.orient === 'h') {
        line.style.top = `${edge.pos}px`;
      } else {
        line.style.left = `${edge.pos}px`;
      }
      layers.guides.appendChild(line);
    }
  }

  function truncateFont(family, max = 28) {
    const raw = family.split(',')[0]?.trim() ?? family;
    const stripped =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
    return stripped.length <= max ? stripped : stripped.slice(0, max - 1) + '…';
  }

  function showTooltip(el, rect, box, copied) {
    const c = getComputedStyle(el);
    const parts = [];
    if (copied) {
      parts.push({ label: 'Copied:', value: formatElementName(el) });
    } else {
      parts.push({ value: formatElementName(el) });
      parts.push({ value: `${Math.round(rect.width)} × ${Math.round(rect.height)}` });
      parts.push({ label: 'font-size:', value: c.fontSize });
      parts.push({ label: 'font:', value: truncateFont(c.fontFamily) });
    }

    layers.tooltip.innerHTML = '';
    parts.forEach((part, i) => {
      if (i > 0) layers.tooltip.appendChild(document.createTextNode(' '));
      if (part.label) {
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = part.label;
        layers.tooltip.appendChild(label);
      }
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = part.value;
      layers.tooltip.appendChild(value);
    });

    layers.tooltip.style.display = 'block';
    layers.tooltip.style.visibility = 'hidden';

    const targetTop = rect.top;
    const targetLeft = rect.left;
    const targetW = rect.width;
    const targetH = rect.height;

    const ttRect = layers.tooltip.getBoundingClientRect();
    const vr = viewportRect();
    let x = targetLeft + targetW / 2 - ttRect.width / 2;
    let y = targetTop - ttRect.height - 8;
    if (y < 8) y = targetTop + targetH + 8;
    x = Math.max(8, Math.min(x, vr.width - ttRect.width - 8));
    y = Math.max(8, Math.min(y, vr.height - ttRect.height - 8));

    layers.tooltip.style.left = `${x}px`;
    layers.tooltip.style.top = `${y}px`;
    layers.tooltip.style.visibility = '';
  }

  function highlight(el, copied = false) {
    if (!el || !el.closest('.rl-demo-page') || el === page) {
      clearHighlight();
      return;
    }

    hoveredEl = el;
    const rect = toLocal(el.getBoundingClientRect());
    const box = parseBox(el);

    layers.box.style.display = 'block';
    layers.box.style.top = `${rect.top}px`;
    layers.box.style.left = `${rect.left}px`;
    layers.box.style.width = `${rect.width}px`;
    layers.box.style.height = `${rect.height}px`;

    showBoxModel(el, rect, box);
    showGuides(el, rect);
    showTooltip(el, rect, box, copied);
  }

  function clearHighlight() {
    hoveredEl = null;
    layers.box.style.display = 'none';
    layers.tooltip.style.display = 'none';
    layers.guides.innerHTML = '';
    hideBoxModel();
  }

  function setActive(on) {
    active = on;
    fabBtn?.classList.toggle('redline-fab--active', on);
    fabBtn?.setAttribute('aria-pressed', on ? 'true' : 'false');
    viewport.classList.toggle('rl-demo-active', on);
    if (!on) clearHighlight();
  }

  function targetAt(e) {
    overlay.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = '';
    return hit?.closest('[data-rl]');
  }

  page.addEventListener('mousemove', (e) => {
    if (!active) return;
    highlight(targetAt(e));
  });

  page.addEventListener('mouseleave', () => {
    if (active) clearHighlight();
  });

  page.addEventListener('click', (e) => {
    if (!active) return;
    const el = targetAt(e);
    if (!el) return;
    e.preventDefault();
    highlight(el, true);
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      if (hoveredEl === el) highlight(el, false);
    }, 1500);
  });

  fabBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fab.classList.contains('collapsed')) return;
    setActive(!active);
  });

  function scheduleActivationOnExpand() {
    if (!fabContainer) {
      setActive(true);
      return;
    }

    if (expandActivationTimeout) {
      clearTimeout(expandActivationTimeout);
      expandActivationTimeout = null;
    }

    let fired = false;
    const finalize = () => {
      if (fired) return;
      fired = true;
      fabContainer.removeEventListener('transitionend', onTransitionEnd);
      if (expandActivationTimeout) {
        clearTimeout(expandActivationTimeout);
        expandActivationTimeout = null;
      }
      setActive(true);
    };

    const onTransitionEnd = (e) => {
      if (e.target !== fabContainer) return;
      finalize();
    };

    fabContainer.addEventListener('transitionend', onTransitionEnd);
    expandActivationTimeout = setTimeout(finalize, 500);
  }

  function toggleCollapse() {
    const wasCollapsed = fab.classList.contains('collapsed');
    fab.classList.toggle('collapsed');

    if (fab.classList.contains('collapsed')) {
      collapseBtn?.setAttribute('aria-label', 'Expand buttons');
      if (collapseBtn) collapseBtn.title = 'Expand buttons';
      setActive(false);
    } else {
      collapseBtn?.setAttribute('aria-label', 'Collapse buttons');
      if (collapseBtn) collapseBtn.title = 'Collapse buttons';
      if (wasCollapsed) scheduleActivationOnExpand();
    }
  }

  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCollapse();
  });

  setActive(true);
})();
