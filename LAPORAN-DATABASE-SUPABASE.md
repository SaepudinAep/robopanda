# Laporan Studi Database Supabase — Fokus Modul Kurikulum

> Hasil pemeriksaan langsung ke REST API Supabase project **Robopanda** (publishable key, akses anonim/RLS).
> Tanggal studi: 2026-09-04. Disusun sebagai bahan penelitian Modul Kurikulum.

## 1. Informasi Koneksi

| Item | Nilai |
|---|---|
| Project URL | `https://aedtrwpomswdqxarvsrg.supabase.co` |
| API REST | `https://aedtrwpomswdqxarvsrg.supabase.co/rest/v1/<tabel>?select=*` |
| Key dipakai klien | `sb_publishable_QXwMaSw5_11T2BpcWetm2A_hTgZeAsf` (publishable, di `assets/js/config.js`) |
| Storage gambar | Cloudinary `dmm6avtxd` (preset `robopanda-preset`), sebagian lama memakai `dltlwrtky` |

## 2. Inventaris Tabel (21 tabel aktif)

| Tabel | Baris | Peran |
|---|---|---|
| `levels` | 4 | Master jenjang kurikulum |
| `sub_levels` | 6 | Master kit/unit per level |
| `materi` | 45 | Bank materi program **Sekolah** |
| `materi_private` | 50 | Bank materi program **Private** |
| `achievement_sekolah` | 3 | Target capaian (sekolah) |
| `achievement_private` | 13 | Target capaian (private) |
| `schools` | n/a (RLS) | Master sekolah — tidak terbaca anonim |
| `classes` | 14 | Kelas sekolah (jadwal, level, tahun ajaran) |
| `class_private` | 8 | Kelas privat per siswa |
| `students` | 138 | Siswa sekolah (grade, class_id) |
| `students_private` | 8 | Siswa privat |
| `user_profiles` | 7 | Profil login: super_admin / teacher / pic / student |
| `pertemuan_kelas` | 107 | Riwayat sesi sekolah (FK materi, guru, kelas) |
| `pertemuan_private` | 55 | Riwayat sesi privat (+ pertemuan_ke, jumlah_sesi) |
| `attendance` | 965 | Absensi & penilaian sekolah (status, sikap, fokus) |
| `attendance_private` | 43 | Absensi privat (sikap, fokus, pemahaman) |
| `gallery_contents` | 607 | Foto kegiatan (Cloudinary, is_published) |
| `academic_years` | 2 | 2025/2026 (nonaktif), 2026/2027 (aktif) |
| `semesters` | 4 | Semester 1 & 2 per tahun ajaran |
| `menu_categories` / `app_menus` | 0 (RLS) | Menu dinamis (klien fallback `STATIC_MENUS`) |
| `gallery_sessions`, `tools`, `settings` | — | **Tidak ada** (404) |

## 3. Relasi Inti Modul Kurikulum

```
levels 1─┬─< sub_levels 1─┬─< materi          (program sekolah)
         │                └─< materi_private  (program privat)
         ├─< materi (level_id)     ──< pertemuan_kelas >── classes > schools
         ├─< materi_private        ──< pertemuan_private >── class_private
         └─ achievement_sekolah / achievement_private (sub_level_id, materi_id*)
attendance (sekolah)  : student + pertemuan_kelas → status/sikap/fokus
attendance_private    : student_private + pertemuan_private → sikap/fokus/pemahaman
```

## 4. Isi Master Kurikulum

### 4.1 Levels (4)

| order | kode | detail | id (awal) |
|---|---|---|---|
| 0 | Beginner | Robotik Beginner | de8faae5 |
| 1 | Kiddy | Robotik Kiddy | 37f69f2f |
| 2 | Robotic | All level and Coding | b3bc832e |
| 3 | Terapi Wicara | Terapi Wicara level | 54837684 |

### 4.2 Sub_levels / Kit (6)

| Level | kode | nama | kit_alat |
|---|---|---|---|
| Beginner | Microbit_Kit | Microbit Kit | Microbit Kit + Frame |
| Kiddy | RoboKid | Robokid | Robo kid + Block Classic |
| Robotic | Coding_Scratch | Coding Scratch | Scratch App |
| Robotic | Roblox_Studio | Roblox Studio | Roblox Studio |
| Robotic | Wedo_Plus | WeDo Plus | Wedo 2.0 + Ekspansion Kit |
| Robotic | Wedo_std | WeDo Basic | Wedo 2.0 |

> ⚠️ Level **Terapi Wicara belum punya sub_level/kit**.

### 4.3 Distribusi Materi per Level

| Level | Sekolah (materi) | Private (materi_private) |
|---|---|---|
| Beginner | 12 | 0 |
| Kiddy | 30 | 0 |
| Robotic | 3 | 49 |
| Terapi Wicara | 0 | 1 |
| **Total** | **45** | **50** |

### 4.4 Daftar Materi Sekolah (45) — urut created_at

ReviewBot, LearnBot, Warming Up, 2 Propeller Plane, DreamBot *(Kiddy)* · Warming UpB, Loudness Bot, Sensing Bot, Silent Race, Creative Session B, Sensing bot B, Sumo robot, Sweep Bot, Axe bot, Airplane Launcher, Introducing, Motocycle *(Beginner)* · BumperBot, ControlBot, Lifeboat, Creative Session, Avoid Bot, Tank bot, Tower Defense, Helper Bot, Stand bot, Control bot, Sound bot, Mantis bot, Exploration Session, Rabbit Bot, Crossbow, Baseball, Dancing bot, Creative Session2, Favorite session, Introduction, Bike bot, Introducing, MartBot, Creative 1, Crab Bot *(Kiddy)* · Introducing Wedo 2.0, Motorcycle, Trolly Bot *(Robotic)*

> Hanya 8 materi sekolah terbaru yang punya `order_index` (0–2) dan `alokasi_waktu` terisi (mulai "Introducing", "Bike bot", "Introducing Wedo 2.0", "Motorcycle", "MartBot", "Creative 1", "Trolly Bot", "Motocycle").

### 4.5 Daftar Materi Private (50) — urut created_at

Crab bot, Train Steam, Up side down, Jumping YL Man 9, Rabbit, Vertikal climbing, Little Dear, Collecting Robot, Programmable Car, Skiing Man, Electric Crocodile, Mario Bross Lv1, Shark, Reconnaissance Alien, Bus, Mouse, Infinite Loop, Scooter, Stepman robot, Santa Claus Car, Electric Fan, Score Maker, Elastis Pumper, Exploration robot, Helicopter bot, Mongkey Climbing, Obstacle Avoiding Car *(duplikat)*, Electric Tyranosaurus, Electric Stegosaurus, Coding Shooter, Coding Basket Ball, Christmas Tree, Rotating Plane, Rabbit Hammer, Santa Sleigh, Harley, Big Truck, Crab Bot *(duplikat)* *(Robotic)* · **Artikulasi /r/** *(Terapi Wicara)* · Inspection Robot, Triceratops, Line Patrol Robot, Basic 1‑2, Basic 1‑3, Basic 1‑4, Basic 1‑5, Basic 1‑Weapon System, Basic 1‑Drop Item, Basic 1‑Leaderboard *(Robotic, order 0–2)*

## 5. Pola Pemakaian Kurikulum (dari data pertemuan)

- **Sekolah:** seluruh 45 materi **pernah diajarkan** (107 pertemuan). Materi paling sering (×5): ReviewBot, LearnBot, BumperBot, Avoid Bot, Tower Defense, Sound bot, Exploration Session, Bike bot, MartBot. Kegiatan terakhir tercatat **2026‑09‑03** (Crab Bot).
- **Private:** 49 dari 50 materi pernah diajarkan (55 pertemuan). Yang **belum**: `Obstacle Avoiding Car` (salah satu dari dua baris duplikat). Terakhir: Big Truck (2026‑09‑04).
- **Achievement:** sekolah 3 baris (Programming‑Kiddy, Assembly ×2), private 13 baris (Assembly/Programming) — namun **semua `sub_level_id` & `materi_id` NULL**, artinya capaian belum tertaut ke kit/materi spesifik.

## 6. Temuan Kualitas Data (relevan untuk penelitian)

| # | Temuan | Dampak ke modul |
|---|---|---|
| 1 | `order_index` NULL pada **86/95** materi | Modul menempatkan item ber-order NULL di akhir lalu pakai tie‑breaker (created_at) — urutan silabus ≠ urutan pedagogis |
| 2 | `sub_level_id` NULL pada **71/95** materi | Mayoritas materi jatuh ke grup pseudo **"Belum Dikategorikan"** di tab Silabus, bukan per kit |
| 3 | `alokasi_waktu` kosong **85/95** | Kolom alokasi waktu di Lesson Plan sering kosong |
| 4 | Kolom RPP (`tujuan_pembelajaran`, `alat_bahan`, `kegiatan_apersepsi`, `kegiatan_inti`, `kegiatan_penutup`, `indikator_penilaian`) seluruhnya NULL pada sampel | Tab Lesson Plan bertumpu pada `detail`/`description` teks bebas |
| 5 | Indikasi duplikasi: "Introducing" (2× sekolah), "Obstacle Avoiding Car" & "Crab Bot" (2× private), "Motorcycle/Motocycle", "Control bot/ControlBot" | Silabus bisa menampilkan item ganda |
| 6 | `classes.sub_level_id` & `class_private.sub_level_id` semua NULL; nama level masih teks (`classes.level`) bukan FK | Pemetaan kelas→kit belum dipakai |
| 7 | `schools` tidak terbaca anonim (RLS); 8 school_id berbeda terreferensi | Data sekolah hanya via login PIC/admin |
| 8 | `attendance` (sekolah) simpan status sebagai **string** "0/1/2"; `attendance_private` pakai **integer** | Skema penilaian dua program tidak seragam |
| 9 | Semua materi `version = 1.0`, `version_notes` NULL; tidak ada yang `is_deleted` | Versioning tersedia tapi belum dipakai |
| 10 | Deskripsi/`detail` materi lama terisi naratif, materi baru (BumperBot, Bus, Mouse, dll.) kosong | Kualitas konten tidak merata |

## 7. Cara Kerja Modul Kurikulum (modules/kurikulum-module.js, READ‑ONLY)

- **3 tab**: **Silabus** (dokumen akademik per level → dikelompokkan per kit/sub_level + grup "Belum Dikategorikan"), **Lesson Plan** (detail per robot + riwayat diajarkan), **On Progress** (riwayat pertemuan gabungan sekolah+privat, dikelompokkan per tanggal).
- **Fetch paralel 6 tabel**: `levels`, `sub_levels`, `materi`, `materi_private`, `achievement_sekolah`, `achievement_private`; penyaringan dilakukan di sisi klien berdasarkan scope user.
- **Scope akses**: `super_admin` = semua; `pic` = level dari kelas sekolahnya; `teacher` = `level_id` di profil (kode "Terapi Wicara" → program privat saja; Kiddy/Beginner → sekolah); `student` = ikut `class_id`/`class_private_id`.
- Guest ditolak ("Akses Silabus Terkunci"). Fitur: quick search, accordion kit, print‑friendly, skeleton loader.

## 8. Saran Arah Penelitian Lanjutan

1. **Pembersihan data**: isi `order_index` & `sub_level_id` untuk 95 materi, hapus duplikat, seragamkan penamaan.
2. **Penautan achievement** ke `sub_level_id`/`materi_id` agar silabus ↔ capaian terhubung.
3. **Standardisasi RPP**: aktifkan kolom `tujuan_pembelajaran`, `alokasi_waktu`, dll. di form admin.
4. **Normalisasi skema**: FK `classes.level_id` menggantikan teks `level`, penyatuan skema penilaian sekolah vs privat.
5. **Analitik kurikulum**: tingkat pemakaian materi per sekolah/semester (data pertemuan+attendance sudah mendukung).

*Lampiran data mentah tersedia di `%TEMP%\supa-report2.txt` dan `%TEMP%\supa-kurikulum.txt`.*


