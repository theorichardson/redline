# Privacy Policy for Redline

_Last updated: 2026-05-02_

Redline is a developer tool that helps you inspect and debug the layout of web pages you visit. This policy describes what Redline does and does not do with your data.

## Summary

- Redline does **not** collect, transmit, or sell any personal information.
- Redline does **not** include analytics, tracking, advertising, or any third-party SDKs.
- All processing happens **locally in your browser**. Nothing is sent to any remote server.

## What Redline accesses

Redline loads a small floating button on pages you visit so you can turn the inspector on and off. It only reads information from a page when you actively use the inspector on that page:

- Computed CSS styles and bounding boxes of elements you hover or click.
- DOM structure around the inspected element, used to draw alignment guides and rulers.

All of this is processed locally in the page and is discarded when you deactivate the inspector or close the tab.

## What Redline stores

Redline uses Chrome's `storage.local` API to remember a small amount of UI state on your device:

- Whether the floating Redline button is hidden on the current tab.
- The position and collapsed state of the floating Redline button.

This data never leaves your browser.

## Permissions

- `activeTab` and host permissions for `http://*/*` and `https://*/*`: required so the inspector can read layout information from the page you are currently viewing.
- `storage`: stores the small UI preferences described above.
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
