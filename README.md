# Redline

A Chrome extension for debugging web layout issues. Redline gives you DOM layer navigation, alignment guides, padding/margin visualization, and on-page rulers.

## Features

- Inspect any element on a page and see its computed styles and box model.
- Visualize padding, margin, and alignment relative to neighboring elements.
- Toggle on-page rulers to measure distances and check alignment.
- Floating button you can drag, collapse, and reposition.

## Keyboard shortcuts

- `Alt + Shift + R` — toggle inspection mode
- `Ctrl/Cmd + Shift + L` — alternate toggle

If a shortcut does nothing, another extension is probably claiming it. Re-assign Redline at `chrome://extensions/shortcuts`.

## Install (development)

```sh
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked" and select the `dist/` directory.

## Privacy

Redline runs entirely locally. It does not transmit any data to remote servers and does not include analytics or tracking. See [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) for details.

## Permissions

- `activeTab` + `http(s)://*/*` host access — read layout info from the active page.
- `storage` — remember the floating button's position and a few UI preferences.
- `scripting` — inject the inspector into the active tab on demand.
