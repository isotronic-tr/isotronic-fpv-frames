# TBS SOURCE ONE v4: kaynak dosyalar

- Depo: https://github.com/tbs-trappy/source_one
- Commit: `9ae65b1` (v4; depodaki LICENSE ve README'nin son bulunduğu commit)
- İndirme tarihi: 2026-11-17
- Lisans: GNU GPL v3. `LICENSE` ve `README.md` bu commit'teki dosyaların değiştirilmemiş kopyası. README: "The frame files are released under GNU Public License (GPL) V3."
- Neden v4: depo HEAD'i (`232ccff`, v6, 2025-09-17) ve v5 (`07a8690`, 2023-02-01) LICENSE/README içermiyor (v5 commit'inde silinmiş), GitHub lisans alanı boş. Lisans kuralı gereği kullanıcı v4'ü seçti (2026-11-17).

## Kullanılan dosyalar (değiştirilmeden)

| Dosya | Parça | Adet | Kalınlık |
|---|---|---|---|
| `SO_v4_center_plate_3mm.dxf` | kol altı plaka (kolların altında) | 1 | 3 mm (STEP: 3.00) |
| `SO_v4_5inch_arm_4mm_4x.dxf` | kol (5") | 4 | 4 mm (STEP: 4.00) |
| `SO_v4_bottom_plate_3mm.dxf` | ana plaka (kolların üstünde) | 1 | 3 mm (STEP: 3.00) |
| `SO_v4_cam_plate_2mm_2x.dxf` | kamera yan plakası (dik) | 2 | 2 mm (STEP: 2.00) |
| `SO_v4_top_plate_2mm.dxf` | üst plaka | 1 | 2 mm (STEP: 2.00) |
| `SO_v4.STEP` | montaj (19 katı, mm) | — | — |

7" Long Range için ayrıca (aynı commit `9ae65b1`, aynı GPL-3.0 lisansı):

| Dosya | Parça | Adet | Kalınlık |
|---|---|---|---|
| `SO_v4_7inch_arm_6mm_back_2x.dxf` | 7" ön kol (yana geniş açılan; dosya adı "back") | 2 | 6 mm (dosya adı ve README "Arm thickness 7": 6mm"; STEP'te yok) |
| `SO_v4_7inch_arm_6mm_front_2x.dxf` | 7" arka kol (dosya adı "front") | 2 | 6 mm |

Kopyalanan ama kullanılmayan: `SO_v4_battery_pad_top.dxf` (aksesuar). Ham DXF ve STEP `.dockerignore` ile Docker bağlamı dışında; build yalnızca `src/components/frame3d/generated/source-one.ts` ve `source-one-7.ts` dosyalarını kullanır.

## Hangi bilgi nereden

- Şekiller (dış kontur + delikler): DXF.
- Yerleşim, yön, kalınlık, z seviyeleri, standoff: STEP.
- STEP'teki bütün katılar aynı adı taşıyor (`Imported1`); bu yüzden katılar geometriyle eşlendi (z aralığı ve kalınlık; kamera plakaları x'te 2 mm ince, dik katılar). Montaj ağacındaki 19 yerleşim dönüşümü birim matris (elle doğrulandı), yani katılar dünya koordinatında. Üretici bu yüzden "montaj ağacı var" uyarısı basar; bu beklenen bir durum.
- Elde edilen değerler (z=0 en alt nokta):
  - STEP'te: kol altı plaka z 0–3, (boşluk 3–5), kollar 5–9, ana plaka 9–12, standoff'lar 12–42 (30 mm, Ø5; README: 30 mm), üst plaka 42–44, kamera plakaları dik 9–44;
  - çizimde (2026-11-18 sapmasından sonra, 5"): kol altı plaka 0–3, kollar 3–7, ana plaka 7–10, standoff'lar 10–40, üst plaka 40–42, kamera plakaları 7–42;
  - motor-motor çaprazı 226.0 mm (README: 226 mm), motorlar (±89.69, ±68.74).
- STEP'te 10 standoff var (README donanım listesi 8 diyor); STEP'teki 10 standoff çizildi.
- Kol altı plaka ile kollar arasında STEP'te 2 mm boşluk var. Kollar 4 mm, 7" kollar 6 mm olduğundan boşluk büyük olasılıkla 6 mm kol yuvası (aynı gövde iki kol kalınlığını taşıyor).

## Sapmalar (kaynaktan bilerek ayrılan noktalar)

- 2026-11-18, 5": kol altı plaka STEP konumundan **2 mm yukarı** alındı (`frames-generate.ts`, `lift: 2`), kollar plakaya oturuyor; STEP'teki 2 mm boşluk çizimde yok. Diğer bütün parçalar ve 10 standoff STEP'teki gibi; z=0 en alt nokta olduğundan çizimde bütün z değerleri 2 mm aşağı kaydı (toplam yükseklik 44 → 42 mm).

## Varsayımlar

- Burun yönü: kamera plakalarının bulunduğu uç burun kabul edildi (STEP −Y).
- Standoff'lar STEP'te Ø5 silindirdir; Source Two'daki gibi çizgi sanatında altıgen prizma olarak çizilir.
- Kamera plakasında yalnızca 1 yuvarlak delik olduğu için kaydı dış kontur örnekleriyle desteklendi (hata değeri düşük: ~7.3).

## 7" Long Range (`source-one-7`)

- Gövde (kol altı plaka, ana plaka, kamera plakaları, üst plaka, 10 standoff) 5" ile aynı STEP konumlarından; kol altı plaka STEP konumunda (öteleme yok).
- 7" kollar STEP montajında yok. Yerleşim (`deriveOnto`): 5" kol DXF'i her 5" kol katısına kaydedilir; 7" kolun 2 adet Ø3 kök deliği (r 1.5) 5" kolun 2 adet Ø3 kök deliğine rijit eşlenir (delik aralığı ikisinde de 7.4 mm, eşleme hatası 0.000 mm). Sıra × ayna 4 adayından, kök bölgesindeki (kök deliklerine 25 mm'den yakın) dış konturu 5" kol konturuna en yakın olan seçilir (ortalama uzaklık: ön kol 1.11 mm, arka kol 0.19 mm).
- Kalınlık 6 mm; kolun üst yüzü 5" kolun üst yüzüyle aynı düzlemde (ana plakanın altında), kol aşağı doğru STEP'teki 2 mm boşluğu doldurarak kol altı plakaya oturur. Çizimde: kol altı plaka 0–3, kollar 3–9, ana plaka 9–12, standoff'lar 12–42, üst plaka 42–44.
- Burun yönü STEP'ten kesin: iki kamera yan plakası (dik, x'te 2 mm ince katılar `#15198`, `#43795`) STEP Y 171.9–206.9 aralığında; gövde Y 165.1–325.7 (merkez ~245.6). Kamera düşük-Y ucunda → burun STEP −Y. 5" Source One'ın burun varsayımı da bununla aynı (`forward: [0, -1, 0]`).
- Ön/arka kol ataması (2026-11-18) STEP'teki kamera konumuna ve deadcat düzenine dayanır: yana daha geniş açılan kollar kamera tarafında (önde) olur, pervaneler kamera görüşünden uzak kalır. Yana geniş açılan kol `SO_v4_7inch_arm_6mm_back_2x.dxf` olduğu için bu dosya öne, `..._front_2x.dxf` arkaya konur. **Sapma:** DXF dosya adları bu atamayla ters düşüyor (ilk sürümde dosya adına göre atanmıştı; geniş kollar arkada kalıyordu).
- Sonuç: motorlar ön (±138.94, 94.95), arka (±113.42, −94.95); motor-motor çaprazı ~315.8 mm (README "Wheelbase 7": 318mm"; fark ~2 mm, motor merkezi en büyük yuvarlak delikten alındı).
- Pervane çapı (spec `propD`) 178 mm (7") varsayıldı.

## Eklenmeyenler

- TPU / 3D baskı parçaları (depoda `3D Print - *` klasörleri) ve vidalar: STEP'te yok, eklenmedi.
- Ham Fusion (`SO_v4.f3d`) ve IGES dosyaları kopyalanmadı.
