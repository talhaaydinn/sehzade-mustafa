// Test için sahte izleyici ve olay üretici (oyun ekranı ve yönetim paneli ortak kullanır)
window.CenazeSim = (() => {
  const first = ['Ayşe', 'Mehmet', 'Zeynep', 'Ahmet', 'Elif', 'Mustafa', 'Fatma', 'Emre', 'Merve', 'Burak',
    'Hatice', 'Yusuf', 'Esra', 'Kerem', 'Selin', 'Hasan', 'Büşra', 'Ömer', 'Derya', 'Can', 'Gül', 'Murat',
    'Ece', 'Serkan', 'Sevgi', 'Oğuz', 'Nur', 'Tolga', 'Melek', 'İbrahim', 'Süleyman', 'Bayezid', 'Cihangir', 'Mihrimah'];
  const tags = ['34', '06', '16', '42', '61', '44', '35', '63', '01', '_osmanli', '.1453', '_tr', '.official', '_akinci'];
  const comments = ['Allah rahmet eylesin', 'Mekanı cennet olsun 🤲', 'Ruhuna Fatiha', 'MUSTAFA', 'Mustafa', 'Şehzadem 😢',
    'Ah Mustafa ah', 'Hakkını helal et şehzadem', '🤲🤲', 'Saflara katıldım', 'Mustafa Mustafa'];
  const gifts = { 1: 'Gül', 5: 'Parmak Kalp', 10: 'Kalp', 15: 'Çay', 30: 'Donut', 100: 'Hediye Kutusu', 500: 'Hazine Sandığı' };

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pool = [];
  let seq = 0;
  function newUser() {
    const n = pick(first);
    const base = n.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');
    const u = { id: `${base}${pick(tags)}_${++seq}`, name: n, avatar: '' };
    pool.push(u); if (pool.length > 90) pool.shift();
    return u;
  }
  function user(reuse = 0.35) { return pool.length && Math.random() < reuse ? pick(pool) : newUser(); }

  function make(kind, opts = {}) {
    const u = opts.user || user(opts.reuse ?? 0.35);
    switch (kind) {
      case 'join': return { type: 'chat', user: u, text: pick(comments) };
      case 'comment': return { type: 'chat', user: opts.user || user(1), text: opts.text || pick(comments) };
      case 'gift': { const coins = opts.coins || 1; return { type: 'gift', user: u, giftName: opts.giftName || gifts[coins] || 'Hediye', diamonds: coins, count: opts.count || 1 }; }
      case 'like': return { type: 'like', user: opts.user || user(0.8), count: opts.count || 15 };
      case 'follow': return { type: 'follow', user: u };
      case 'share': return { type: 'share', user: u };
      case 'reset': return { type: 'reset' };
      default: return null;
    }
  }
  return { make, user, pool, gifts };
})();
