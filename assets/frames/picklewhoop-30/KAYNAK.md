# PickleWhoop 30: kaynak notu

- Model: The PickleWhoop 20/25/30 cinematic whoop frame, 3" (PW30) sürümü
- Sayfa: https://www.printables.com/model/281119-the-picklewhoop-20-25-30-cinematic-whoop-frame
- Yazar: @ledroneclub (https://www.printables.com/@ledroneclub)
- Lisans: Creative Commons Attribution 4.0 International (CC BY 4.0); ticari kullanım serbest, atıf zorunlu
- Lisans kanıtı: kullanıcının 2026-11-18 16:29 tarihli ekran görüntüsü (`kaynak-modeller/picklewhoop30/Ekran görüntüsü 2026-11-18 162910.png`, repoya alınmaz)
- Erişim tarihi: 2026-11-18
- Atıf satırı: "PickleWhoop 30, @ledroneclub, CC BY 4.0 (https://www.printables.com/model/281119). Çizgi görünümüne dönüştürüldü, standoff'lar temsilî olarak eklendi."

## Dosyalar

Ham dosyalar `kaynak-modeller/picklewhoop30/` altında kalır, repoya girmez. Build yalnız `src/components/frame3d/generated/picklewhoop-30.ts` dosyasına dayanır. Ham klasör yoksa `npm run frames:generate` bu modeli uyarıyla atlar ve üretilmiş dosyayı korur.

| DXF | Parça | Adet | Kalınlık (dosya adından) | Üst yüz z (montaj STL) |
|---|---|---|---|---|
| `pw30_frame_3mm_v1-1.dxf` | ana gövde | 1 | 3 mm | +3 |
| `pw30_guard_upper_2mm_v1-0.dxf` | üst koruma (yarım) | 2 | 2 mm | −12 |
| `pw30_guard_lower_3mm_v1-0.dxf` | alt koruma (duct halkaları) | 1 | 3 mm | −20 |
| `pw_bottom_plate_1mm_v2-0.dxf` | alt plaka | 1 | 1 mm | −23 |

## Ölçülenler

- Şekiller DXF'ten; SPLINE'lar gerçek B-spline olarak değerlendirildi.
- XY yerleşimi ve z seviyeleri, aynı montaj koordinatındaki STL'lerden ölçüldü. DXF konturu ile STL köşeleri arasındaki sapma: ortalama en çok 0,011 mm, en büyük 0,039 mm.
- Çizimde z=0 en alt nokta: alt plaka 0–1, alt koruma 1–4, üst koruma 10–12, ana gövde 24–27 mm.
- Motor merkezleri: alt korumadaki 4 adet Ø79,18 duct deliğinin merkezleri, yaklaşık (±47,7, ±41,7) mm.

## Varsayımlar

1. **Standoff konumları:** kaynakta standoff modeli yok. Parçalarda çakışan deliklerden çıkarıldı.
2. **Standoff boyları:** STL'deki plaka aralıklarından türetildi: alt koruma–üst koruma 6 mm (12 adet), üst koruma–ana gövde 12 mm (4 adet), alt koruma–ana gövde 20 mm (5 adet).
3. **Standoff çapı:** Ø4 mm altıgen varsayıldı.
4. **(0, ±28) konumları:** her iki delik de ana gövde ile alt korumada çakıştığı için standoff kabul edildi; (0, −28) konumunda alt koruma deliği Ø3,1 olduğundan bu nokta kesin değil.
5. **Burun yönü:** ana gövdenin uzayan ucu ve alt korumadaki açıklık burun kabul edildi (montaj −y).
6. **İkinci üst koruma:** STL'de tek yarım var; diğer yarı x=0 düzlemine göre aynalandı (delikler alt korumayla bu şekilde çakışıyor).
7. **Pervane çapı:** 76 mm (3") varsayıldı.

## Kaynakla çelişki

- Alt plakanın dosya adı 1 mm, STL'i 1,5 mm kalınlığında (z −24,5…−23). Dosya adındaki 1 mm kullanıldı; üst yüz STL ile aynı (−23).

## Yapılan değişiklikler

- Parçalar sitenin çizgi görünümüne dönüştürüldü; geometri koordinatları montaj düzeninden frame düzenine taşındı (burun +y, z=0 en alt).
- Temsilî standoff'lar eklendi.
- Motor, pervane, elektronik, vida, TPU ve yazı eklenmedi.
