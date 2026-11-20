# isotronic-fpv-frames

[fpv.isotronic.tr](https://fpv.isotronic.tr/builds) sitesindeki build kartlarında dönen 3D frame çizimlerinin kaynak dosyaları ve bunları üreten betikler.

Site, aşağıdaki açık kaynak frame tasarımlarının CAD dosyalarını okuyup "çizgi görünümü" (kenar çizgileri) için sadeleştirilmiş geometri verisine dönüştürür. Bu depo, o dönüşümün **girdilerini, betiklerini ve çıktılarını** içerir. Böylece GPL-3.0'ın istediği kaynak erişimi ve CC BY 4.0'ın istediği atıf ve değişiklik bildirimi sağlanır. Sitenin geri kalan kodu bu depoda değildir.

## İçerik

| Model | Kaynak | Yazar | Lisans | Ham dosyalar bu depoda | Çıktı |
|---|---|---|---|---|---|
| TBS SOURCE ONE v4 (5" ve 7" kollar) | https://github.com/tbs-trappy/source_one (commit `9ae65b1`) | Team BlackSheep (TBS) | GPL-3.0 | evet (`assets/frames/source-one/`) | `source-one.ts`, `source-one-7.ts` |
| TBS SOURCE TWO v0.1 | https://github.com/ps915/source_two (commit `010ade9`) | Team BlackSheep (TBS) | GPL-3.0 | evet (`assets/frames/source-two/`) | `source-two.ts` |
| PickleWhoop 30 | https://www.printables.com/model/281119 | @ledroneclub | CC BY 4.0 | hayır, Printables'tan indirilir | `picklewhoop-30.ts` |
| 65mm Tiny Whoop frame | https://www.printables.com/model/443817 | @blueprint3D | CC BY 4.0 | hayır, Printables'tan indirilir | `blueprint-65.ts` |

- `assets/frames/<model>/KAYNAK.md` dosyalarında commit, dosya listesi, ölçümler, varsayımlar ve dönüştürme parametreleri yazılı.
- `assets/frames/<model>/LICENSE` dosyalarında orijinal lisans var: GPL için tam metin, CC BY için bildirim ve bağlantı.
- `src/components/frame3d/generated/*.ts` üretilmiş çıktılar. Elle düzenlenmez. Yollar, sitedeki depoyla birebir aynı tutuldu.

## Yapılan değişiklikler

Bu bölüm CC BY 4.0 §3(a)(1)(B) gereği değişiklik bildirimidir.

- Orijinal DXF ve STEP dosyaları **değiştirilmeden** okunur.
- Parça konturları ve delikler DXF'ten çıkarılır. Yaylar ve spline'lar çokgene çevrilir ve sadeleştirilir. Koordinatlar 0,01 mm'ye yuvarlanır.
- Parçalar, STEP montajındaki ya da ölçülen z seviyelerine göre 3B'de yerleştirilir.
- PickleWhoop 30'a standoff'lar temsilî olarak eklendi.
- Blueprint 65, STEP'ten tesselasyonla kenar çizgisine dönüştürüldü.
- Ayrıntılar her modelin `KAYNAK.md` dosyasında.

## Nasıl üretilir

Gereksinim: Node.js 22.18 veya üstü. `.ts` betiği Node'un yerleşik tür ayıklamasıyla doğrudan çalışır, ek bağımlılık gerekmez.

```bash
# TBS Source One / Two ve PickleWhoop 30 (DXF'ten)
npm run frames:generate          # ayrıntılı döküm: npm run frames:generate -- --dump
```

- TBS dosyaları depoda olduğu için doğrudan üretilir.
- PickleWhoop 30 için Printables'tan "DXF frame Files (for Carbon cutting)" klasörünü indirip `../kaynak-modeller/picklewhoop30/` altına koyun, yani bu deponun **yanındaki** klasöre. Klasör yoksa betik bu modeli uyarıyla atlar ve mevcut çıktıyı korur.

```bash
# Blueprint 65 (STEP'ten, OpenCascade tabanlı occt-import-js 0.0.23 ile; LGPL-2.1, yalnız araç)
npm install
node scripts/blueprint-convert.mjs node_modules/occt-import-js <indirilen 65mm_frame_tinywhoop.stp>
```

Aynı girdiyle çıktılar bayt bayt aynıdır. Kaynak dosyanın SHA-256 değeri `assets/frames/blueprint-65/KAYNAK.md` içinde.

## Lisans

Bu depo tek bir lisans altında değil, ayrıntı için kök dizindeki `LICENSE` dosyasına bakın:

- TBS türevleri ve betikler: **GNU GPL v3.0**
- PickleWhoop 30 ve Blueprint 65 türevleri: **CC BY 4.0**. Atıf: model adı, yazar, kaynak bağlantısı ve "çizgi görünümüne dönüştürüldü" notu.

Orijinal tasarımlar ve markalar sahiplerine aittir. Bu depo onlarla bağlantılı ya da onlar tarafından onaylanmış değildir. Lisanslar gereği garanti verilmez.

## fpv.isotronic.tr ile ilişkisi

Site, `src/components/frame3d/generated/` altındaki dosyaları aynen kullanır ve three.js ile kenar çizgisi olarak çizer. Her build kartında kaynak, yazar, lisans ve bu depoya "kaynak dosyalar" bağlantısı gösterilir.
