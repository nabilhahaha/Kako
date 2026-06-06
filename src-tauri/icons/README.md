# Icons (P6)

`tauri.conf.json` references these per-edition icons. Generate them from a single
1024×1024 PNG per edition with the Tauri CLI:

```bash
npx tauri icon path/to/vantora-retail-1024.png
```

This produces `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS),
`icon.ico` (Windows), and `tray.png`. The release scripts swap the edition's icon
set based on `KAKO_EDITION` before `tauri build`.

Icons are not committed (binary, per-edition); generate them at build time.
