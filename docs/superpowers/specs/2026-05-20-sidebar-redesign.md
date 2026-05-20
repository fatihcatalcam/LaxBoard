# Sidebar Redesign — Neon Aksanlı Stil

**Tarih:** 2026-05-20  
**Kapsam:** `frontend/style.css` ve `frontend/index.html` (küçük yapısal değişiklikler)

## Seçilen Tasarım: C — Neon Aksanlı

Kullanıcı üç seçenek arasından C stilini seçti. Mevcut mavi-lacivert arka plan ve buton sistemi korunurken görsel hiyerarşi ve detaylar güncelleniyor.

## Değişiklikler

### Renk & Arka Plan
- Sidebar arka planı `#0a0a12` (daha derin siyah)
- Sol kenar: `3px solid #e94560` kırmızı şerit
- Başlık text-shadow: `0 0 20px rgba(233,69,96,0.5)` glow efekti

### Section Başlıkları
- Mevcut düz `h2` yerine: iki yatay çizgi arasında kırmızı pill badge  
  `——[ SETS ]——` formatı
- Badge: `rgba(233,69,96,0.12)` arka plan, `#e94560` metin

### User Bar
- Username: büyük harf, `#e94560` kırmızı renk  
- Çıkış butonu: minimal, sadece border, hover'da kırmızı

### Butonlar
- "New Set": şeffaf, kırmızı kenar, kırmızı metin (solid değil outline)
- "Play": `box-shadow: 0 0 14px rgba(233,69,96,0.4)` glow
- "Save": kırmızı outline stil
- Step nav okları: kırmızı toned border/background
- "Clear Paths": turuncu accent (`#ffb74d`)
- Adım butonları (+ Yeni / × Sil): şeffaf, ince border

### Player Butonları
- Aktif oyuncu: kırmızı + `box-shadow` glow efekti  
- Top (●): altın sarısı, değişmez

### Korunacaklar
- ✎ yeniden adlandır ve ✕ sil butonları set listesinde kalır
- Tüm işlevsellik aynı — sadece stil değişimi
- Checkbox "Show paths" kalır
- HTML yapısı büyük ölçüde aynı kalır (section başlıklarına wrapper eklenir)

## Dosya Değişiklikleri
1. `frontend/style.css` — tüm sidebar CSS kuralları güncellenir
2. `frontend/index.html` — `<h2>` etiketleri section-strip yapısına dönüştürülür
