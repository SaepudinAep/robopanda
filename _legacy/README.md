# 🗄️ Arsip Generasi Lama (Legacy)

Folder ini berisi salinan aplikasi generasi lama yang telah dinonaktifkan
karena duplikat dengan sistem modular baru (`index.html` + `modules/*.js`).

## Isi

| File | Status | Alasan |
|---|---|---|
| `explorer.js` | **diarsipkan** (`git mv`) | import `./config.js` root tidak ada → layar putih di fresh clone. Logika hidup di `modules/explorer-module.js`. |
| `index.js` | **diarsipkan** (`git mv`) | versi SPA lama, import `./config.js` root rusak. Digantikan `assets/js/index.js`. |
| `gallery-module.js` | **diarsipkan** (`git mv`) | stub `console.log`, grid kosong. Digantikan `modules/gallery-module.js`. |
| `style_explorer.css` | **diarsipkan** (`git mv`) | salinan lemah line-ending CR, isi berbeda dari `assets/css/style_explorer.css`. |
| `explorer.html.snapshot.html` | snapshot | markup asli sebelum root `/explorer.html` dijadikan halaman pengalih ke `./index.html`. |
| `learning.html.snapshot.html` | snapshot | dokumentasi; `learning.html` sendiri TETAP AKTIF di root karena ditautkan oleh `scratch/*.html`. |

## Aturan

- Jangan mengedit file di sini untuk perubahan produk — semuanya *read-only* untuk referensi/debugging.
- Titik masuk aplikasi saat ini: **`index.html`** → `assets/js/index.js` → `modules/explorer-module.js` & `modules/gallery-module.js`.
