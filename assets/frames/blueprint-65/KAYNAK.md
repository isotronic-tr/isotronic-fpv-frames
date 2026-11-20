# Blueprint 65: kaynak notu

- Model: 65mm Tiny Whoop frame
- Sayfa: https://www.printables.com/model/443817
- Yazar: @blueprint3D (https://www.printables.com/@blueprint3D_169296)
- Lisans: Creative Commons Attribution 4.0 International (CC BY 4.0); ticari kullanım serbest, atıf zorunlu
- Lisans kanıtı: kullanıcının 2026-11-18 tarihli ekran görüntüsü (`kaynak-modeller/blueprint65/Ekran görüntüsü 2026-11-18 162802.png`, repoya alınmaz)
- Erişim tarihi: 2026-11-18
- Atıf satırı: "65mm Tiny Whoop frame, @blueprint3D, CC BY 4.0 (https://www.printables.com/model/443817). Çizgi görünümüne dönüştürüldü."

## Kaynak dosya

- `kaynak-modeller/blueprint65/65mm_frame_tinywhoop.stp` (repoya girmez)
- SHA-256: `c76738f338b10878f76780408b009fee826dfc6f40a2f4b81a7107f9c4a238b6`
- Tek katı, 442 CAD yüzü, birim mm

Build yalnız `src/components/frame3d/generated/blueprint-65.ts` dosyasına dayanır.

## Dönüştürme aracı

- `occt-import-js` **0.0.23** (OpenCascade tabanlı, LGPL-2.1). Yalnız geçici klasörde kullanılır; projeye bağımlılık olarak eklenmez, çıktıya kodu girmez.
- Betik: `scripts/blueprint-convert.mjs` (build'in ve `frames:generate`'in parçası değildir)

| Parametre | Değer |
|---|---|
| Doğrusal sapma (`linearDeflection`, `absolute_value`) | 0,03 mm |
| Açısal sapma (`angularDeflection`) | 0,3 radyan |
| Kenar açı eşiği | 30 derece |
| Köşe birleştirme ızgarası | 0,005 mm |
| Koordinat yuvarlama | 0,01 mm |

Kenarlar yalnız farklı CAD yüzleri arasındaki sınırlardan alınır ve iki yüz arasındaki açı eşiği aşmalıdır. Yüz içi üçgen kenarları ile teğet geçişler çizilmez.

## Yeniden üretim

Proje dışında boş bir klasörde:

```
npm init -y
npm install --ignore-scripts --save-exact occt-import-js@0.0.23
```

`nextjs-site` klasöründe:

```
node scripts/blueprint-convert.mjs "<araç klasörü>/node_modules/occt-import-js" "../kaynak-modeller/blueprint65/65mm_frame_tinywhoop.stp"
```

Aynı girdiyle iki çalıştırma bayt bayt aynı çıktıyı verdi. Çıktı SHA-256: `6ee1482cb3d63b0ec72337423400711dd990d63d14c2a2d2b51a957129e761ec`

## Ölçülenler

- Motor merkezleri: 4 duct silindirinin (r 16,65 mm) eksenlerinden, (±22,98, ±22,98) mm. Motor-motor çaprazı 65,0 mm.
- Gövde yüksekliği 15,74 mm; dış ölçü yaklaşık 80,5 x 80,5 mm.

## Varsayımlar

1. **Burun yönü:** kaynakta belirtilmiyor; STEP −Z yönü burun kabul edildi.
2. **Pervane çapı:** 31 mm varsayıldı (çizilmez).

## Yapılan değişiklikler

- Katı model çizgi görünümüne dönüştürüldü; eksenler site düzenine taşındı (burun +y, z yukarı, z=0 en alt, orijin motorların ortası).
- Motor, pervane, elektronik, vida ve yazı eklenmedi.
