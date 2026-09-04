# Evaluasi & Rencana Pengembangan Modul Kurikulum

> Objek: `modules/kurikulum-module.js` (1.131 baris, READ‑ONLY) + data Supabase terkait.
> Metode: telaah kode lengkap (state, scope, fetch, render, style) + uji data langsung ke REST API (2026‑09‑04).

## 1. Snapshot Fitur Saat Ini

| Tab | Fungsi yang sudah jalan |
|---|---|
| **Silabus** | Dropdown level, quick search, accordion per kit, tabel dokumen akademik (No / Topik / Deskripsi / Capaian), meta kit (kode + hardware), badge sumber (Sekolah/Private), warning "Belum terikat ke Kit", achievement global per kit, print‑friendly |
| **Lesson Plan** | Dropdown level, daftar robot per kit (kiri) + panel detail (kanan): deskripsi, detail pembelajaran, target achievement, riwayat pertemuan (loading/error/empty state), badge "Pertemuan ke‑N" |
| **On Progress** | Gabungan `pertemuan_kelas` + `pertemuan_private` (maks 60/program), filter kelas sesuai scope, filter level, dikelompokkan per tanggal, search, badge pertemuan |

**Kontrol akses**: guest terkunci; `super_admin` semua; `pic` ikut kelas sekolahnya; `teacher` ikut `level_id` profil (dengan aturan khusus: Terapi Wicara → privat saja, Kiddy/Beginner → sekolah saja); `student` ikut kelasnya. Skeleton loader & empty state tersedia.

## 2. Kekuatan Modul

1. Arsitektur modul SPA konsisten dengan modul lain (state lokal + `init(canvas, profile)`).
2. Scoping per‑role cukup menyeluruh (kelas, level, program) — diterapkan konsisten di 3 tab.
3. `escapeHtml` dipakai menyeluruh — higiene XSS baik.
4. Render kolom RPP terstruktur (`tujuan_pembelajaran`, `alokasi_waktu`, `kegiatan_inti`, dll.) **sudah siap** meski datanya masih NULL — future‑proof.
5. Silabus berformat dokumen akademik + print CSS — sesuai kebutuhan administrasi sekolah.

## 3. Temuan Masalah (bukti kode + data)

### P0 — Bug / Konsistensi
| ID | Temuan | Bukti |
|---|---|---|
| **B1** | **Achievement global "menular" ke materi tanpa kit**: di tab Silabus, filter `achSekolah.filter(a => a.sub_level_id === item.sub_level_id)` membuat item `sub_level_id = null` mewarisi SEMUA achievement yang juga `null` (saat ini: 3 dari 3 baris). Tab Lesson Plan justru melakukan guard (`m.sub_level_id ? … : []`) → **dua tab menampilkan capaian berbeda untuk materi yang sama**. | `kurikulum-module.js:711` vs `:836`; data: semua `achievement_sekolah.sub_level_id` NULL |
| **B2** | **Urutan silabus tidak pedagogis**: 86/95 materi `order_index` NULL → jatuh ke tie‑breaker `created_at` (urutan input), item bernilai ditampilkan duluan lalu NULL di akhir. Urutan berubah tiap tambah materi lama. | `compareItems` :537‑540; data inventory |
| **B3** | **Grup "Belum Dikategorikan" mendominasi**: 71/95 materi tanpa `sub_level_id` → tab Silabus & Lesson Plan mayoritas berada di satu kit pseudo, mengalahkan fungsi pengelompokan kit. | `getSortedSubs` :578; data |
| **B4** | **Duplikasi item tampil ganda** di Silabus/Plan: "Introducing" 2×, "Obstacle Avoiding Car" 2×, "Crab Bot" (sekolah+privat, beda program — wajar, tapi "Obstacle Avoiding Car" 2× dalam tabel sama). | data `materi`/`materi_private` |

### P1 — Keterbatasan Fungsional
| ID | Temuan | Dampak |
|---|---|---|
| **F1** | On Progress tanpa filter rentang tanggal/semester (`limit(60)` hardcoded) — padahal `semesters` & `academic_years` tersedia dan sudah dipakai modul Gallery/Rekap. | Riwayat >60 sesi tersembunyi; tidak bisa menelusuri per semester |
| **F2** | Riwayat pertemuan di Lesson Plan tidak tertaut ke bukti kegiatan — `gallery_contents.pertemuan_id` / `pertemuan_private_id` tersedia di DB tapi tidak dimanfaatkan. | Guru tidak bisa loncat ke foto kegiatan |
| **F3** | Scope `teacher` meng-hardcode string level: `'Terapi Wicara'`, `'Kiddy'`, `'Beginner'`. | Tambah level baru = harus edit kode; rawan salah ketik |
| **F4** | `fetchCurriculum` menarik **semua** kolom `materi` (termasuk `detail` panjang) tiap kali modul dibuka (re‑init tiap navigasi), tanpa cache. | Payload & latensi membengkak saat konten tumbuh |
| **F5** | Pencarian di Silabus tetap menampilkan semua kit dengan pesan "Tidak ada topik yang cocok" per kit. | Hasil pencarian tidak fokus |

### P2 — Kualitas & Aksesibilitas
- Tidak ada `aria-label`/role pada accordion & tab (aksesibilitas keyboard terbatas).
- Badge/status hanya warna dot (sekolah vs privat) — tak berbeda teks untuk aksesibilitas warna (sudah ada `srcBadge` teks, bagus; pertahankan).
- Tabel silabus panjang tanpa sticky header saat scroll.

## 4. Rencana Pengembangan (prioritas + estimasi)

### Sprint P0 — Perbaikan segera (kode saja, tanpa ubah data)
1. **B1** — Guard filter achievement di Silabus: `item.sub_level_id ? achSekolah.filter(…) : []` (samakan dengan Lesson Plan). *~1 baris.*
2. **F5** — Saat `searchQuery` aktif, sembunyikan kit yang tidak punya item lolos filter. *~3 baris.*
3. **F1** — Filter semester/rentang tanggal di On Progress (dropdown `semesters`, query `.gte/.lte tanggal`). *~1‑2 jam.*
4. **F2** — Tombol "Lihat Galeri" per baris riwayat → navigasi ke `gallery-module` dengan filter `pertemuan_id`. *~2 jam.*

### Sprint P1 — Perlu sentuhan data (admin/SQL)
5. **B2** — Backfill `order_index` untuk 95 materi (urutan pedagogis disepakati kurikulum).
6. **B3** — Backfill `sub_level_id` per materi sesuai kit; target: 0 materi "Belum Dikategorikan".
7. **B4** — Gabungkan duplikat (jaga FK `pertemuan*.materi_id` saat merge).
8. **F3** — Ganti hardcode level teacher dengan kolom/relasi (mis. tabel mapping `teacher_levels`) atau minimal konstanta terpusat.

### Sprint P2 — Pengembangan fitur baru
9. **Analitik kurikulum**: tab ke‑4 "Coverage" — persentase materi terpakai per kelas/semester (data `pertemuan_*` + `students` sudah cukup).
10. **Cache data modul** (sessionStorage, TTL singkat) untuk mengurangi re‑fetch saat pindah modul.
11. **Ekspor PDF rapi per level** (sudah print‑friendly; tinggal header/footer cetak + identitas sekolah).
12. **Aksesibilitas**: role/aria pada tab & accordion, navigasi keyboard.

## 5. Ketergantungan Kode ↔ Data

| Perbaikan | Ubah kode | Ubah data | Catatan |
|---|---|---|---|
| B1 | ✅ | — | Aman langsung |
| B2, B3, B4 | — | ✅ | Lewat admin panel/SQL; modul otomatis rapi |
| F1, F2 | ✅ | — | Gunakan `semesters` & `gallery_contents` yang sudah ada |
| F3 | ✅ | opsional | Idealnya mapping di DB |

> Kesimpulan: fondasi modul sudah baik; masalah terbesar bukan pada kode melainkan **kelengkapan metadata materi** (`order_index`, `sub_level_id`, RPP) ditambah satu bug kecil pewarisan achievement (B1) yang mudah diperbaiki.

