# TBS SOURCE TWO v0.1: kaynak dosyalar

- Depo: https://github.com/ps915/source_two
- Yazar: Team BlackSheep (TBS). README: "The SOURCE TWO is a collaborative open source frame project initiated by Team BlackSheep, targeted at FPV racers." Kaynak: https://raw.githubusercontent.com/ps915/source_two/master/README.md (doğrulama 2026-11-20)
- Commit: `010ade994a150b2971123d6e0a141ed6f69c57fe` (18.04.2019)
- İndirme tarihi: 2026-11-17
- Lisans: GNU GPL v3. `LICENSE`, depodaki dosyanın değiştirilmemiş kopyası. README: "The frame files are released under GNU Public License (GPL) V3."
- Depoda tek sürüm var (v0.1). 5" kollar kullanıldı; 6" kollar (`S2_v0.1_6_inch_arms_4mm_4x.dxf`) kopyalanmadı.

## Kullanılan dosyalar (değiştirilmeden)

| Dosya | Parça | Adet | Kalınlık |
|---|---|---|---|
| `S2_v0.1_main_plate_3mm.dxf` | ana (alt) plaka | 1 | 3 mm (STEP: 3.00) |
| `S2_v0.1_5_inch_arms_4mm_4x.dxf` | kol | 4 | 4 mm (STEP: 4.00) |
| `S2_v0.1_reinforcement_plate_2mm_2x.dxf` | takviye plakası (kolların üstü) | 2 | 2 mm (STEP: 2.00) |
| `S2_v0.1_top_plate_2mm.dxf` | üst plaka | 1 | 2 mm (STEP: 2.00) |
| `Source Two v0.1.step` | montaj (34 katı, tek ürün, dünya koordinatı, mm) | — | — |

Ham DXF ve STEP dosyaları `.dockerignore` ile Docker bağlamı dışında tutulur. Build yalnızca üretilmiş `src/components/frame3d/generated/source-two.ts` dosyasını kullanır.

## Hangi bilgi nereden

- Şekiller (dış kontur + delikler): DXF.
- Yerleşim, yön, kalınlık, z seviyeleri: STEP katıları. Her DXF parçası, aynı adlı STEP katısının düzlemine delik merkezleriyle oturtulur.
- Elde edilen değerler:
  - ana plaka z 0–3, kollar 3–7, takviye 7–9, standoff 9–34 (25 mm, Ø5), üst plaka 34–36;
  - motor-motor çaprazı 220.26 mm (README: 220).
- Burun yönü varsayımdır. STEP'te kamera montajları (`cam_mount`) bir uçta, anten yuvaları (`aXII_mount`, `foxeer_lolipop_mount`) öbür uçta durur; kamera tarafı burun kabul edildi.
- Standoff'lar STEP'te Ø5 silindirdir. Çizgi sanatında silüet çıksın diye altıgen prizma olarak çizilir.

## Eklenmeyenler (STEP'te var)

- 3D baskı/TPU: `cam_mount` ×2, `aXII_mount`, `foxeer_lolipop_mount`, `Session_mount`, `shark_fin`. Depoda STL/STEP olarak `3D-Print/` altında da duruyorlar; depo lisansı (GPL-3.0) kapsamında.
- Bağlantı elemanları: `M3x12mm` ×12, `M3 Locknut` ×4.
- Aksesuar: `Accessories/S2_v0.1_battery_pad.dxf` (pil pedi).
- Ham Fusion dosyası `Source Two v0.1.f3d`.
