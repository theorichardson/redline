# Privacy Policy for Redline

_Last updated: 2026-05-02_

Redline is a developer tool that helps you inspect, annotate, and debug the layout of web pages you visit. This policy describes what Redline does and does not do with your data.

## Summary

- Redline does **not** collect, transmit, or sell any personal information.
- Redline does **not** include analytics, tracking, advertising, or any third-party SDKs.
- All processing happens **locally in your browser**. Nothing is sent to any remote server.

## What Redline accesses

When you actively use Redline on a page, it reads information from that page in order to display layout details:

- Computed CSS styles, bounding boxes, and DOM structure of elements you hover or click.
- The outer HTML of inspected elements, used to generate selectors and formatted notes.
- Annotations you create while inspecting an element.

Redline only inspects pages while the inspector is active. It does not run in the background when you are not using it.

## What Redline stores

Redline uses Chrome's `storage.local` API to remember a small amount of UI state on your device:

- Whether the inspector is enabled.
- The position and collapsed state of the floating Redline button.

This data never leaves your browser. Annotations and inspected element data are kept only in memory and are cleared when you deactivate the inspector or close the tab.

## Clipboard

When you choose to export annotations or alignment notes, Redline writes a formatted, Markdown-style summary to your system clipboard. This is initiated by you and only happens when you click the relevant action.

## Permissions

- `activeTab` and host permissions for `http://*/*` and `https://*/*`: required so the inspector can read layout information from the page you are currently viewing.
- `storage`: stores the small UI preferences described above.
- `clipboardWrite`: lets you copy annotations to your clipboard.
- `scripting`: allows the inspector to be injected into the active tab on demand.

Redline does not use these permissions for any purpose other than the features described above.

## Data sharing

Redline does not share, sell, rent, or transfer any data to third parties. There are no external network requests made by the extension.

## Children's privacy

Redline is a developer tool and is not directed at children under 13.

## Changes to this policy

If this policy changes, the updated version will be published in the extension's repository and store listing.

## Contact

For questions about this policy, please open an issue on the Redline repository.
