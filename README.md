# Meta Auto Manager (Ekstensi Google Chrome)

Ekstensi Google Chrome (Manifest V3) untuk **Meta Business Suite** (`https://business.facebook.com/*`) dengan 2 fitur utama dalam satu panel mengambang:

1. **Isi & Jadwal Otomatis (Bulk Upload Reels / Composer)**
2. **Hapus Konten Otomatis (Postingan & Reel)**

---

## 1. Fitur Isi & Jadwal (Bulk Upload)

Berjalan di halaman `business.facebook.com/latest/bulk_upload_composer...`:

- **Isi Deskripsi Otomatis**:
  - Mendukung template fleksibel seperti `{judul} Episode {episode}`, `{nama_video}`, `{judul} Ep {episode_02} #reels #fyp`.
  - Variabel yang tersedia: `{judul}`, `{nama_video}`, `{episode}`, `{episode_02}`, `{episode_03}`, `{no}`, `{tanggal}`, `{jam}`.
  - Episode bisa berurutan (`Mulai Ep` + `Tambah (+)`) atau otomatis diekstrak dari nama video.
- **Jadwal Otomatis**:
  - Atur **Tanggal & Jam mulai**, serta interval per **Menit**, **Jam**, atau **Hari**.
  - **Lanjutkan dari jadwal terakhir (+1 interval)** untuk menyambung jadwal dari batch sebelumnya.
  - **Pengaturan Jadwal Lanjutan**:
    - Batasi jam aktif harian (misal `08:00` – `22:00`, otomatis lompat ke hari berikutnya jika melewati batas).
    - Maksimal postingan per hari.
    - Acak menit (`± jitter`) agar jam tayang lebih natural.
- **Unggah Gambar Cover Otomatis**:
  - Pilih 1 atau banyak gambar cover dari panel ekstensi.
  - Mode pencocokan: **Urutan file** (`1->1`, `2->2`), **Cocokkan nama file / nomor episode**, atau **1 gambar untuk semua**.
  - Otomatis membuka `More edit options` -> `Upload image` -> melampirkan gambar cover -> `Next` -> `Save`.

---

## 2. Fitur Hapus Konten

Berjalan di halaman **Konten -> Postingan & reel**:

- **Bulk Delete**: Centang **Pilih Semua** (atau *N* baris per batch) -> klik **Hapus** -> konfirmasi dialog secara berulang.
- **1 per 1 (Dari Konten Teratas)**: Menghapus satu per satu mulai baris paling atas (otomatis via menu `...` dengan fallback ke checkbox, serta opsi **Lewati jika gagal**).

---

## Cara Pasang / Update di Google Chrome

1. Buka `chrome://extensions/` dan aktifkan **Developer mode**.
2. Klik **Load unpacked** -> pilih folder `/home/clawser/Projects/ekstensi` (atau klik ikon **Reload** ↻ pada kartu ekstensi jika sudah terpasang sebelumnya).
3. Buka Meta Business Suite (`https://business.facebook.com/`). Panel **Meta Auto Manager** akan otomatis menyesuaikan tab aktif (`Isi & Jadwal` di Bulk Upload, atau `Hapus Konten` di halaman Konten).
