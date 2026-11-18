# 🕌 Şehzade Mustafa'nın Cenazesi

TikTok canlı yayını için interaktif 3D cenaze alayı. Önde 2 sancaktar yürür, ortada 8 kişi tabutu omuzlar, arkada saflar oluşur. İzleyiciler yorum yazarak saflara katılır, hediyeyle tabutu omuzlar ya da sancak taşır.

## Kurulum ve çalıştırma

[Node.js](https://nodejs.org) 20 veya üstü gerekli.

```bash
npm install
npm start                      # test modu (TikTok'a bağlanmaz)
npm start -- kullaniciadi      # @kullaniciadi canlı yayınına bağlanır
```

| Adres | Ne işe yarar |
|---|---|
| http://localhost:3000/ | Oyun ekranı (OBS / LIVE Studio'ya bu eklenir, 1080x1920) |
| http://localhost:3000/?demo | Sahte izleyicilerle kendi kendine oynayan önizleme |
| http://localhost:3000/?test | Klavye kısayolları açık (H ile gizle/göster) |
| http://localhost:3000/admin.html | **Yönetim paneli:** gelen hediyeler, tekrar uygula, elle hediye, koltuklara elle atama |
| http://localhost:3000/?transparent | Arka plansız |

Yayına ekleme halay oyunuyla aynı: Tarayıcı kaynağı, URL `http://localhost:3000/`, 1080 x 1920, "sesi OBS üzerinden kontrol et" işaretli, donanım hızlandırma açık.

## Kurallar

| İzleyici ne yapar | Ne olur |
|---|---|
| **Herhangi bir yorum** yazar (ya da takip eder / paylaşır) | Arkadaki saflara katılır. Kamera ona yaklaşır |
| Saflar doluyken (60 kişi) yeni biri katılır | Yorumla girmiş en eski kişi alaydan ayrılır. Süre yoktur |
| Yorumda tek kelime **kadın** (ya da kız) / **erkek** yazar | Karakteri ferace + yüzü açık başörtülü kadın / kaftanlı erkek olur |
| **☕ Çay** atar | 🖼️ **Şehzadenin portresini taşır.** Alayın en önünde, altın çerçeveli, köşesi siyah kurdeleli resmi göğsünde taşır. Tek kişilik; yeni gelen eskisinin yerine geçer, o kişi ön saflara döner. Resim: `public/resimler/` (`config.js` → `portrait`) |
| **❤️ Kalp** atar | ⚰️ **Tabutu omuzlar.** 8 koltuk var. Hepsi doluysa en uzun süredir taşıyanın yerine geçer, o kişi ön saflara döner |
| **🍩 Donut** atar | 🚩 **Sancak taşır.** 2 koltuk var (kırmızı ve yeşil sancak). Aynı yer değiştirme kuralı |
| **🌹 Gül** atar | Ön saflara geçer (diğer hediyeler gibi) |
| Başka bir hediye atar | **Ön saflara geçer** ve süresiz kalır. Çok jeton atan daha önde yürür, kıyafeti zenginleşir |
| Beğeni atar | 🤲 Dua sayacı dolar. Dolunca **"Ruhuna El-Fatiha"** anı: bütün saflar el açıp dua eder, kamera alayın etrafında döner |

Koltuk boşken orada isimsiz bir yeniçeri taşır. Ekranda hediye isteyen hiçbir yazı yoktur (başlıkta sadece "YORUM yaz" ve KADIN/ERKEK bilgisi var). Taşıyıcılar mavi dolama ve beyaz üsküflü yeniçeri, sancaktarlar kırmızı kaftanlı olur.

### Hangi hediye hangi rol

`public/config.js` → `giftRoles`. Ekrandaki "Omuz ver / Sancak taşı" yazıları bu listeden otomatik oluşur. TikTok hediye adını bazen İngilizce gönderir (ör. "Rose", "Finger Heart"). Emin olmak için yedek hesaptan hediyeyi bir kez at; yönetim panelinde ve terminalde görünen adı ya da `#numarayı` ilgili satırın `names` veya `ids` kısmına ekle.

## Kamera

- Normalde **yukarıdan geniş açı**: bayraklardan son safa kadar herkes ekranda. Saflar uzadıkça kamera kendiliğinden geri çekilir.
- **Saflara giren herkese** kısa yakın çekim yapılır (`camera.joinShotSeconds`). Aynı anda çok kişi girerse en yeni 4 kişi sıraya alınır, eskiler atlanır (`camera.joinQueueMax`).
- 10–16 saniyede bir **taşıyıcılara, sancaktarlara ya da tabuta** yaklaşır. Bunlar yeni girenlerden önceliklidir. Yeni taşıyıcı / sancaktar gelince kamera hemen ona gider.
- Yönetim panelinden kamerayı elle değiştirebilirsin. Kendiliğinden yakın çekimleri kapatmak için `camera.director: false`.

## Müzik

Oyun müziği varsayılan olarak **kapalı** (`config.js` → `music: false`). Kısa efekt sesleri (çan, boru) çalmaya devam eder. Açmak için `music: true` yap. Açıkken `public/music/` klasörüne mp3 koyarsan sırayla çalar. Klasör boşsa hicaz makamında ney benzeri ağır bir ezgi, dem ve iki adımda bir kös vuruşu üretilir. Yürüyüş temposu `stepsPerMinute` ayarından gelir.

> ⚠️ Telifli müzik koyma. TikTok canlı yayında telifli müziği algılayınca sesi kısabiliyor ya da yayını kapatabiliyor.

## Karakterler

Model olarak `readyplayer.me.glb` kullanılıyor (Mixamo iskeleti). Kaftan eteği, kuşak, sarık, kavuk, kalpak, yeniçeri üsküfü, ferace, başörtüsü ve peçe kodla giydiriliyor ve kemiklere bağlı hareket ediyor. Modelin ceketi dokusuz, kaftan renginde boyanıyor. Yürüyüş, sırık tutma, sancak sallama ve dua hareketleri ters kinematikle (IK) hesaplanıyor.

Kendi modelini eklemek için halay oyunundaki gibi Mixamo'dan **FBX, T-pose** indir, `public/models/` içine koy, `config.js` → `models` listesine ekle.

## Ayarlar

Hepsi `public/config.js` içinde: saf genişliği ve sayısı (`rowWidth`, `maxRows`), roller, dua sayacı, yürüyüş temposu, kamera.

## Hediye kaydı

Halay oyunuyla aynı: her hediye terminale ve `logs/hediyeler-YYYY-AA-GG.csv` dosyasına yazılır. **Ctrl+C** ile kapatınca yayının özeti çıkar.

## Klavye kısayolları (oyun ekranında)

`1` yorum · `B` 8 kişi · `C` saftakilerden yorum · `2` Gül (ön saf) · `3` Kalp (omuz) · `4` Parmak Kalp · `5` Çay (portre) · `6` Donut (sancak) · `7` 100 jeton · `8` 20 jeton · `K`/`E` kadın/erkek · `L` beğeni · `F` takip · `S` paylaşım · `V` kamera · `R` sıfırla · `M` ses · `H` yardım

## Dosyalar

```
server.js           TikTok olaylarını dinler, oyuna WebSocket ile iletir
public/config.js    Bütün ayarlar
public/game.js      Oyun mantığı, saflar, roller, arayüz
public/scene3d.js   3D sahne: alay, tabut, sancaklar, kıyafetler, IK yürüyüş, kamera
public/music.js     Müzik dosyası çalma + cenaze ezgisi üretici
public/admin.html   Yönetim paneli
```
