# Meta Content Auto Deleter (Ekstensi Google Chrome)

Ekstensi Google Chrome (Manifest V3) untuk menghapus konten di **Meta Business Suite** (`https://business.facebook.com/*`, misalnya halaman **Konten -> Postingan & reel**) secara otomatis.

## Fitur Utama

1. **Mode Bulk Delete (Hapus Massal)**
   - Otomatis mencentang checkbox **Pilih Semua** di header tabel (atau memilih **N konten teratas** per batch sesuai pengaturan).
   - Mengklik tombol **Hapus** di toolbar atas dan otomatis mengonfirmasi dialog hapus.
   - Mengulang proses per batch sampai seluruh konten habis atau mencapai batas maksimal yang ditentukan.

2. **Mode 1 per 1 dari Konten Teratas**
   - Menghapus konten satu per satu selalu dimulai dari baris paling atas (**konten teratas**).
   - Mendukung **3 strategi**:
     - **Otomatis (Disarankan)**: Mengklik tombol menu `...` pada baris teratas -> pilih `Hapus postingan` / `Hapus` -> konfirmasi dialog. Jika opsi menu tidak tersedia, otomatis beralih menggunakan checkbox baris teratas + tombol `Hapus` di toolbar.
     - **Hanya Menu (`...`) baris teratas**.
     - **Hanya Checkbox baris teratas**.
   - Dilengkapi opsi **Lewati jika gagal** agar proses tidak terjebak jika ada konten yang tidak dapat dihapus (misalnya postingan iklan aktif).

3. **Kontrol & Diagnostik**
   - Panel mengambang (*floating widget*) langsung di halaman Meta Business Suite (bisa digeser/drag dan diperkecil menjadi tombol pill), ditambah popup dari ikon ekstensi di toolbar Chrome.
   - Tombol **Cek** (*dry-run*) untuk memastikan jumlah baris, checkbox Pilih Semua, dan tombol `...` terbaca dengan benar sebelum mulai menghapus.
   - Pengaturan **Jeda antar hapus**, **Maksimal hapus**, **Jeda / Lanjut / Stop**, serta log aktivitas real-time.
   - Mendukung tampilan Meta Business Suite **Bahasa Indonesia** maupun **English**.

## Cara Pasang (Load Unpacked) di Google Chrome

1. Buka Google Chrome dan akses `chrome://extensions/`.
2. Aktifkan **Developer mode** (Mode pengembang) di pojok kanan atas.
3. Klik tombol **Load unpacked** (Muat yang belum dibuka).
4. Pilih folder proyek ini (`/home/clawser/Projects/ekstensi`).
5. Buka halaman Meta Business Suite, misalnya:
   `https://business.facebook.com/latest/posts/published_posts`
6. Panel **Meta Auto Deleter** akan muncul di pojok kanan bawah halaman.

## Cara Penggunaan Singkat

1. Pastikan Anda berada di tab konten yang ingin dihapus (misalnya **Diterbitkan**, **Dijadwalkan**, atau **Draf**).
2. Klik **Cek** terlebih dahulu untuk memverifikasi jumlah baris yang terdeteksi.
3. Pilih mode:
   - **Bulk Delete**: untuk menghapus massal secara cepat.
   - **1 per 1 (Teratas)**: untuk menghapus satu per satu mulai dari item paling atas.
4. Atur **Jeda antar hapus** (disarankan `2.5` – `5` detik agar aman dari batas rate Meta) dan **Maks hapus** (`0` untuk menghapus semua).
5. Klik **Mulai Hapus** dan pantau progres di log aktivitas. Anda dapat menekan **Jeda** atau **Stop** kapan saja.
