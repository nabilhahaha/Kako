<!--
  Release notes for the NEXT release. Edit this before tagging — the release
  workflow embeds it into the updater manifest (`release_notes`) and the app
  shows it in the install dialog. Markdown: headings, bullets, **bold**.
-->
## 0.1.0-beta.1

- Fix the desktop build: `frontendDist` now points at a minimal static shell
  instead of the Next.js standalone server dir (which bundled `node_modules` and
  was rejected by the Tauri bundler). The window loads the local Next server URL
  directly. Unblocks the release build past the frontend-asset validation.

## 0.1.0-beta.0

- Initial Offline Edition auto-update support.
