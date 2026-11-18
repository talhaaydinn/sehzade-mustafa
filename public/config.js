// =====================================================================
//  ŞEHZADE MUSTAFA CENAZE ALAYI — AYARLAR
//  Buradaki değerleri değiştirip sayfayı yenile.
// =====================================================================
window.CENAZE_CONFIG = {
  title: 'Şehzade Mustafa’nın Cenazesi',

  // ---------------- katılım
  // Herhangi bir yorum yazan (ya da takip eden / paylaşan) arkadaki saflara katılır. Süre yoktur.
  // Hediye atan saflarda süresiz kalır ve ÖN SAFLARA geçer (çok atan daha önde).
  // Saflar doluyken yeni biri gelince yorumla girmiş en eski kişi alaydan ayrılır.
  rowWidth: 6,              // bir safta kaç kişi yan yana
  maxRows: 10,              // en fazla kaç saf (toplam kapasite = rowWidth x maxRows)
  rowSpacing: 1.35,         // saflar arası mesafe (metre)
  colSpacing: 1.15,         // yan yana iki kişi arası mesafe (metre)

  // ---------------- hediyeye özel roller
  // Hediyenin adı (names) ya da TikTok hediye numarası (ids) eşleşirse o rol verilir.
  // role: portre (en önde şehzadenin resmini taşıyan, 1 kişi) · omuz (tabutu omuzlayan, 8 kişi) · sancak (bayrak sallayan, 2 kişi)
  // Koltuklar doluyken yeni gelen, o rolde EN UZUN SÜREDİR duran kişinin yerine geçer. Süre yoktur.
  // TikTok hediye adını bazen İngilizce gönderir. Emin olmak için hediyeyi bir kez at, yönetim panelinde
  // ve terminalde görünen adı ya da #numarayı buraya ekle (ör. ids: [5655]). Büyük/küçük harf fark etmez.
  giftRoles: [
    { role: 'portre', label: 'Çay',         names: ['Çay', 'Tea'],                         ids: [] },
    { role: 'omuz',   label: 'Kalp',        names: ['Kalp', 'Heart', 'Heart Me'],          ids: [] },
    { role: 'sancak', label: 'Donut',       names: ['Donut', 'Doughnut'],                  ids: [] },
    // Gül ve diğer bütün hediyeler: rol vermez, atan ön saflara geçer
  ],
  carriers: 8,              // tabutu taşıyan kişi sayısı (4 sol, 4 sağ)
  flagBearers: 2,           // bayrak taşıyan kişi sayısı
  portraitBearers: 1,       // en önde şehzadenin resmini taşıyan kişi sayısı
  portrait: 'resimler/images.jfif', // taşınan resim (public klasörüne göre yol)

  // ---------------- dua sayacı (beğeniler)
  likeEnergy: 0.002,        // her beğeni sayacı ne kadar doldurur
  giftEnergy: 0.004,        // her jeton sayacı ne kadar doldurur
  energyDecay: 0.006,       // saniyede ne kadar boşalır
  duaSeconds: 18,           // sayaç dolunca "dua" anı kaç saniye sürer

  // ---------------- yürüyüş
  stepsPerMinute: 76,       // ağır, vakur adım (müzik dosyası çalarken de bu tempo kullanılır)
  strideLength: 0.62,       // bir adım kaç metre

  // ---------------- kamera
  camera: {
    fov: 34,
    pitch: 50,                  // geniş açıda yere bakış açısı (derece, 90 = tam tepeden)
    topLimit: 420,              // geniş açıda alayın en arkası ekranda en fazla bu yüksekliğe çıkar (px)
    bottomLimit: 1835,          // alayın önü (bayraklar) ekranda bu yüksekliğe kadar iner (px)
    director: true,             // kamera ara sıra kendiliğinden tabuta / bayraklara yaklaşsın
    autoShotEvery: [10, 16],    // kendiliğinden yakın çekim kaç saniyede bir (en az, en çok)
    joinShotSeconds: 2.2,       // saflara yeni girene kaç saniye yaklaşsın (0 = kapalı)
    joinShotGap: 0.6,           // iki "yeni giren" çekimi arasında en az kaç saniye geniş açıda kalsın
    joinQueueMax: 4,            // aynı anda çok kişi girerse en fazla kaç tanesi sırada beklesin (eskiler atlanır)
  },

  // Karakter modelleri (Mixamo iskeletli .glb veya .fbx). Kıyafetler (kaftan, sarık, ferace) kodla giydirilir.
  // solid: modelin kendi üst kıyafeti dokusuz, kaftan renginde boyanır
  // hide: modelden gizlenecek parçaların malzeme/mesh adı (ör. modern şapka)
  models: [
    { file: 'models/readyplayer.me.glb', height: 1.76, gender: 'male', hide: ['Wolf3D_Headwear'], solid: ['Wolf3D_Outfit_Top'],
      tint: { Wolf3D_Outfit_Bottom: '#3a2c22', Wolf3D_Outfit_Footwear: '#2a1a12' } },
    // kadınlar: aynı model, uzun ferace + yüzü açık, başı saran başörtüsü
    { file: 'models/readyplayer.me.glb', height: 1.64, gender: 'female', hide: ['Wolf3D_Headwear', 'Wolf3D_Beard', 'Wolf3D_Hair'], solid: ['Wolf3D_Outfit_Top'],
      tint: { Wolf3D_Outfit_Bottom: '#2a2020', Wolf3D_Outfit_Footwear: '#1a1210' } },
  ],

  // ---------------- ses
  sound: true,
  music: false,             // oyun müziği (ney/kös ezgisi ya da public/music içindeki mp3'ler). false = kapalı
  musicVolume: 0.65,
  sfxVolume: 0.5,
  chatBubbles: true,

  // Yorumda bu kelimelerden biri tek kelime olarak geçerse karakteri kadın / erkek olur
  femaleKeywords: ['kadın', 'kadin', 'kız', 'kiz'],
  maleKeywords: ['erkek'],
};

(() => {
  const C = window.CENAZE_CONFIG;
  C.maxMourners = C.rowWidth * C.maxRows;
})();
