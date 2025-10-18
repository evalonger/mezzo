// Kullanıcı verileri (geçici - ileride backend'e taşınacak)
let users = JSON.parse(localStorage.getItem('users')) || [];
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
// Kayıt olma için geçici veri
let registrationData = {};

// Mezat verileri
let rawAuctionData = JSON.parse(localStorage.getItem('auctionData')) || {
    totalProducts: 0,
    activeItemIndex: 0,
    items: [],
    upcomingAuctions: [] // Yeni eklenen: Gelecek mezatlar
};

// Aktif ürün indeksini takip et
let activeItemIndex = 0;

// Tarih objelerini düzelt
let auctionData = {
    ...rawAuctionData,
    upcomingAuctions: rawAuctionData.upcomingAuctions ? rawAuctionData.upcomingAuctions.map(auction => {
        return {
            ...auction,
            date: typeof auction.date === 'string' ? new Date(auction.date) : auction.date
        };
    }) : []
};

// Mezat süresi (10 saniye için test)
let auctionTime = 10;
let timerInterval;
let bids = [];
let highestBid = 0;
let highestBidder = "";

// Günlük kullanıcı limitleri
const DAILY_AUCTION_LIMIT = 3;  // Bir kullanıcı en fazla 3 mezata katılabilir
const AUCTION_ITEM_LIMIT = 5000; // Toplam 5000 ürüne kadar yükleme yapılabilir
const MIN_ITEMS_PER_AUCTION = 10; // Her mezata en az 10 ürün yüklenebilir
const MAX_ITEMS_PER_AUCTION = 500; // Her mezata en fazla 500 ürün yüklenebilir
const MAX_ITEMS_PER_USER_PER_AUCTION = 10; // Bir kullanıcı bir mezata en fazla 10 ürün yükleyebilir

// Sayfa yüklendiğinde
window.onload = function() {
    checkUserStatus();
    loadAuctionData();
    startTimer();
    updateBidsList();
    updateAuctionInfo();
    updateQueueList();
    updateRankings();
    updateUpcomingAuctions(); // Yeni eklenen: Gelecek mezatları güncelle
    startAuctionMonitoring(); // Yeni eklenen: Mezatları izlemeye başlat
    
    // Dosya yükleme olayını ekle
    document.getElementById('productImage').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${e.target.result}" alt="Önizleme">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Kullanıcı adı alanını doldur
    const userNameInput = document.getElementById('userName');
    if (userNameInput && currentUser) {
        userNameInput.value = currentUser.username;
    }
    
    // Sol paneldeki bilgileri 1 saniyede bir güncelle
    setInterval(updateAuctionInfo, 1000);
};

// Kullanıcı durumunu kontrol et
function checkUserStatus() {
    if (currentUser) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('userSection').style.display = 'block';
        document.getElementById('userNameDisplay').textContent = currentUser.username;
        
        // Mezatçıysa ürün ekle butonunu göster
        if (currentUser.isSeller) {
            // Buton elementini kontrol et
            // const addProductBtn = document.getElementById('addProductBtn');
            // const sellerProductCount = document.getElementById('sellerProductCount');
            
            // if (addProductBtn) {
            //     addProductBtn.style.display = 'block';
            // }
            
            // if (sellerProductCount) {
            //     sellerProductCount.style.display = 'block';
            //     updateSellerProductCount();
            // }
        }
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('userSection').style.display = 'none';
        
        // Buton elementini kontrol et
        // const addProductBtn = document.getElementById('addProductBtn');
        // const sellerProductCount = document.getElementById('sellerProductCount');
        
        // if (addProductBtn) {
        //     addProductBtn.style.display = 'none';
        // }
        
        // if (sellerProductCount) {
        //     sellerProductCount.style.display = 'none';
        // }
    }
}

// Mezatçı ürün sayısını güncelle
function updateSellerProductCount() {
    // if (currentUser && currentUser.isSeller) {
    //     const productCount = currentUser.products ? currentUser.products.length : 0;
    //     document.getElementById('sellerProductCountValue').textContent = `${productCount} / 10`;
    // }
}

// Mezat bilgilerini güncelle
function updateAuctionInfo() {
    // Şu anki aktif mezatı bul
    const activeAuction = getCurrentlyActiveAuction();
    
    // Yüklenen ürünler
    if (activeAuction) {
        document.getElementById('totalProducts').textContent = `${activeAuction.productCount} / ${MAX_ITEMS_PER_AUCTION}`;
    } else {
        document.getElementById('totalProducts').textContent = `0 / ${MAX_ITEMS_PER_AUCTION}`;
    }
    
    // Kalan ürün (yüklenen ürünlerden çıkarılanlar hariç)
    const remainingItems = document.getElementById('remainingItems');
    if (activeAuction) {
        // Kalan ürün = Toplam ürün - Aktif ürün indeksi - 1
        const remaining = activeAuction.products.length - activeItemIndex - 1;
        remainingItems.textContent = remaining >= 0 ? remaining : 0;
    } else {
        remainingItems.textContent = "0";
    }
    
    // Durum (her zaman "Şuan devam ediyor" olarak göster)
    document.getElementById('auctionStatus').textContent = "Şuan devam ediyor";
    
    // Kullanıcı limit bilgilerini güncelle
    if (currentUser) {
        const userAuctionsToday = getUserAuctionsForToday();
        document.getElementById('dailyLimitInfo').textContent = `${userAuctionsToday} / ${DAILY_AUCTION_LIMIT}`;
    } else {
        document.getElementById('dailyLimitInfo').textContent = `0 / ${DAILY_AUCTION_LIMIT}`;
    }
}

// Şu anki aktif mezatı bul
function getCurrentlyActiveAuction() {
    if (auctionData.upcomingAuctions.length > 0) {
        // Tarihe göre sırala
        const sortedAuctions = [...auctionData.upcomingAuctions].sort((a, b) => {
            const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
            const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
            return dateA - dateB;
        });
        
        // Şu anki zamana eşit veya geçmişte olan ilk mezatı bul
        const now = new Date();
        for (let i = 0; i < sortedAuctions.length; i++) {
            const auctionDate = typeof sortedAuctions[i].date === 'string' ? new Date(sortedAuctions[i].date) : sortedAuctions[i].date;
            if (auctionDate <= now) {
                return sortedAuctions[i];
            }
        }
    }
    return null;
}

// Mezat verilerini yükle
function loadAuctionData() {
    // Sıra listesini güncelle
    updateQueueList();
}

// Modal işlemleri
function openLoginModal() {
    document.getElementById('modalTitle').textContent = 'Giriş Yap';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verificationForm').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex';
}

function openRegisterModal() {
    document.getElementById('modalTitle').textContent = 'Kayıt Ol';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('verificationForm').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex';
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('verificationForm').style.display = 'none';
    document.getElementById('modalTitle').textContent = 'Kayıt Ol';
}

function showLoginForm() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verificationForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Giriş Yap';
}

function showVerificationForm() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verificationForm').style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Doğrulama Kodu';
}

// Kayıt olma işlemi - Adım 1: Doğrulama kodu isteme
function requestVerificationCode() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const phone = document.getElementById('registerPhone').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // Validasyon
    if (!username || !email || !phone || !password || !confirmPassword) {
        alert("Lütfen tüm alanları doldurun!");
        return;
    }
    
    if (password !== confirmPassword) {
        alert("Şifreler eşleşmiyor!");
        return;
    }
    
    // E-posta formatı kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert("Geçerli bir e-posta adresi girin!");
        return;
    }
    
    // Telefon formatı kontrolü (basit)
    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(phone)) {
        alert("Geçerli bir telefon numarası girin!");
        return;
    }
    
    // Kullanıcı adı daha önce alınmış mı?
    if (users.find(user => user.username === username)) {
        alert("Bu kullanıcı adı zaten alınmış!");
        return;
    }
    
    // E-posta veya telefon daha önce alınmış mı?
    if (users.find(user => user.email === email)) {
        alert("Bu e-posta adresi zaten kullanımda!");
        return;
    }
    
    // Geçici olarak kayıt verilerini sakla
    registrationData = {
        username: username,
        email: email,
        phone: phone,
        password: password
    };
    
    // Gerçek uygulamada burada e-posta veya SMS ile doğrulama kodu gönderilecek
    // Şimdilik sadece arayüzü gösteriyoruz
    showVerificationForm();
    alert("Doğrulama kodu gönderildi! (Gerçek uygulamada e-posta veya SMS ile gönderilir)");
}

// Kayıt olma işlemi - Adım 2: Kodu doğrula ve kayıt ol
function verifyCode() {
    const code = document.getElementById('verificationCode').value;
    
    // Gerçek uygulamada burada kod doğrulanacak
    // Şimdilik herhangi bir 6 haneli sayı kabul edilir
    const codeRegex = /^[0-9]{6}$/;
    if (!codeRegex.test(code)) {
        alert("Geçerli bir doğrulama kodu girin (6 haneli sayı)!");
        return;
    }
    
    // Yeni kullanıcı oluştur (şimdilik herkes mezatçı olabilir, ileride admin onayı gerekir)
    const newUser = {
        username: registrationData.username,
        email: registrationData.email,
        phone: registrationData.phone,
        password: registrationData.password, // Gerçek uygulamada şifre hashlenmeli
        isSeller: true, // Şimdilik her yeni kullanıcı mezatçı
        products: [] // Mezatçıların ürünleri
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    // Kayıt verilerini temizle
    registrationData = {};
    
    closeAuthModal();
    alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
}

// Giriş yapma işlemi
function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    // Validasyon
    if (!username || !password) {
        alert("Lütfen tüm alanları doldurun!");
        return;
    }
    
    // Kullanıcıyı bul
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        closeAuthModal();
        checkUserStatus();
        alert("Giriş başarılı!");
    } else {
        alert("Kullanıcı adı veya şifre hatalı!");
    }
}

// Çıkış yapma işlemi
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    checkUserStatus();
    alert("Çıkış yapıldı!");
}

// Mezat izleme sistemini başlat
function startAuctionMonitoring() {
    // Her saniye bir kontrol yap
    setInterval(() => {
        checkAndActivateAuctions();
    }, 1000);
}

// Mezatları kontrol et ve aktif olanı başlat
function checkAndActivateAuctions() {
    const now = new Date();
    let hasActiveAuction = false;
    
    // Mezatları kontrol et
    for (let i = 0; i < auctionData.upcomingAuctions.length; i++) {
        const auction = auctionData.upcomingAuctions[i];
        const auctionDate = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
        
        // Mezat zamanı geldiyse ve henüz başlatılmamışsa
        if (auctionDate <= now && !auction.isActivated) {
            // Mezatı aktif et
            activateAuction(auction);
            hasActiveAuction = true;
            break; // Sadece ilk uygun mezatı başlat
        }
    }
    
    // Eğer aktif mezat yoksa, sıradaki mezat bilgilerini göster
    if (!hasActiveAuction) {
        showNextAuctionInfo();
    }
}

// Mezatı aktif et
function activateAuction(auction) {
    // Mezatı başlatıldı olarak işaretle
    auction.isActivated = true;
    
    // Aktif ürün indeksini sıfırla
    activeItemIndex = 0;
    
    // Mezat verilerini localStorage'a kaydet
    saveAuctionData();
    
    // Eğer bu mezatta ürün varsa ilk ürünü göster
    if (auction.products.length > 0) {
        showAuctionItem(auction.products[0]);
        // Sayaç başlat
        auctionTime = 10;
        if (timerInterval) clearInterval(timerInterval);
        startTimer();
    }
    
    // Sol paneldeki bilgileri güncelle
    updateAuctionInfo();
    updateQueueList();
}

// Sıradaki mezat bilgilerini göster
function showNextAuctionInfo() {
    const nextAuction = getNextAuction();
    if (nextAuction) {
        // Sol paneldeki bilgileri güncelle
        document.getElementById('totalProducts').textContent = `${nextAuction.productCount} / ${MAX_ITEMS_PER_AUCTION}`;
        
        const nextItemInfo = document.getElementById('nextItemInfo');
        if (nextAuction.products.length > 0) {
            const nextItem = nextAuction.products[0];
            nextItemInfo.textContent = nextItem.name;
        } else {
            nextItemInfo.textContent = "-";
        }
        
        const remainingItems = document.getElementById('remainingItems');
        remainingItems.textContent = nextAuction.products.length - 1;
        if (remainingItems.textContent < 0) remainingItems.textContent = 0;
    }
}

// Sıradaki mezatı bul
function getNextAuction() {
    if (auctionData.upcomingAuctions.length > 0) {
        // Tarihe göre sırala
        const sortedAuctions = [...auctionData.upcomingAuctions].sort((a, b) => {
            const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
            const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
            return dateA - dateB;
        });
        
        // Gelecek tarihli ilk mezatı bul
        const now = new Date();
        return sortedAuctions.find(auction => {
            const auctionDate = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
            return auctionDate > now;
        });
    }
    return null;
}

// Mezat ürününü göster
function showAuctionItem(item) {
    if (item) {
        document.querySelector('.item-name').textContent = item.name;
        document.querySelector('.item-description').textContent = item.description;
        document.getElementById('itemImage').src = item.image;
        
        // Aktif ürün indeksini güncelle
        const activeAuction = getCurrentlyActiveAuction();
        if (activeAuction) {
            activeItemIndex = activeAuction.products.indexOf(item);
            if (activeItemIndex === -1) {
                activeItemIndex = 0;
            }
        }
    }
}

// Sayacı başlat
function startTimer() {
    // Önce mevcut interval'i temizle
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // Sadece aktif bir mezat varsa sayacı başlat
    const activeAuction = getCurrentlyActiveAuction();
    if (activeAuction && activeAuction.products.length > 0) {
        timerInterval = setInterval(() => {
            auctionTime--;
            
            // Süreyi güncelle
            const minutes = Math.floor(auctionTime / 60);
            const seconds = auctionTime % 60;
            const timerElement = document.getElementById('timer');
            if (timerElement && !timerElement.querySelector('.sold-message')) {
                timerElement.textContent = 
                    `Kalan Süre: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // Süre bittiğinde
            if (auctionTime <= 0) {
                finishAuction();
            }
        }, 1000);
    }
}

// Mezatı bitir ve sonraki ürüne geç
function finishAuction() {
    clearInterval(timerInterval);
    
    // Şu anki aktif mezatı bul
    const activeAuction = getCurrentlyActiveAuction();
    
    // Eğer aktif mezat varsa ve içinde ürün varsa
    if (activeAuction && activeAuction.products.length > 0) {
        const soldItem = activeAuction.products[0];
        
        // Teklif gelmediyse ürün geri çekildi
        if (bids.length === 0) {
            document.getElementById('timer').innerHTML = 
                `<div class="sold-message" style="color: red;">ÜRÜN GERİ ÇEKİLDİ!</div>`;
        } else {
            // Teklif geldiyse satıldı mesajı
            document.getElementById('timer').innerHTML = 
                `<div class="sold-message">SATILDI!<br>Kazanan: ${highestBidder}<br>Tutar: ${highestBid} TL</div>`;
            
            // Satılan ürünleri localStorage'a kaydet
            soldItem.soldTo = highestBidder;
            soldItem.soldPrice = highestBid;
            soldItem.soldDate = new Date();
            
            let soldItems = JSON.parse(localStorage.getItem('soldItems')) || [];
            soldItems.push(soldItem);
            localStorage.setItem('soldItems', JSON.stringify(soldItems));
            
            // Satış bilgisini tüm satışlar listesine ekle
            let allSales = JSON.parse(localStorage.getItem('allSales')) || [];
            allSales.push({
                seller: soldItem.soldBy || "Bilinmeyen Satıcı",
                user: highestBidder,
                itemId: soldItem.id,
                price: highestBid,
                date: new Date()
            });
            localStorage.setItem('allSales', JSON.stringify(allSales));
            
            // Satın alma bilgisini tüm satın almalar listesine ekle
            let allPurchases = JSON.parse(localStorage.getItem('allPurchases')) || [];
            allPurchases.push({
                user: highestBidder,
                itemId: soldItem.id,
                price: highestBid,
                date: new Date()
            });
            localStorage.setItem('allPurchases', JSON.stringify(allPurchases));
        }
        
        // Ürünü listeden çıkar
        activeAuction.products.shift();
        activeAuction.productCount--;
        auctionData.totalProducts--;
        
        // Mezat verilerini kaydet
        saveAuctionData();
        
        // 10 saniye sonra sonraki ürüne geç
        setTimeout(() => {
            // Eğer hâlâ bu mezatta ürün varsa sonraki ürüne geç
            if (activeAuction.products.length > 0) {
                // İlk ürünü aktif ürün olarak göster
                const nextItem = activeAuction.products[0];
                showAuctionItem(nextItem);
                
                // Sıra listesini güncelle
                updateQueueList();
                
                // Teklifleri sıfırla
                bids = [];
                highestBid = 0;
                highestBidder = "";
                updateBidsList();
                
                // Yeni sayaç başlat (10 saniye için test)
                auctionTime = 10;
                startTimer();
                
                // Mezat bilgilerini güncelle
                saveAuctionData();
            } else {
                // Eğer bu mezatta başka ürün kalmadıysa
                document.getElementById('timer').innerHTML = 
                    `<div class="sold-message">MEZAT BİTTİ!</div>`;
                
                // Bir sonraki mezatı kontrol et
                setTimeout(() => {
                    checkAndActivateAuctions();
                }, 10000);
            }
        }, 10000);
    }
}

// Sıra listesini güncelle
function updateQueueList() {
    const queue = document.getElementById('auctionQueue');
    if (!queue) return;
    
    queue.innerHTML = '';
    
    // Şu anki aktif mezatı bul
    const activeAuction = getCurrentlyActiveAuction();
    
    if (!activeAuction || activeAuction.products.length === 0) {
        queue.innerHTML = '<div class="queue-item">Henüz ürün eklenmemiş</div>';
        return;
    }
    
    activeAuction.products.forEach((item, index) => {
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        if (index === 0) {
            queueItem.classList.add('active');
            queueItem.innerHTML = `
                <span>${item.name}</span>
                <span>Şu anda aktif</span>
            `;
        } else {
            queueItem.innerHTML = `
                <span>${item.name}</span>
                <span>Beklemede</span>
            `;
        }
        queue.appendChild(queueItem);
    });
}

// Teklif verme fonksiyonu
function placeBid() {
    if (!currentUser) {
        alert("Teklif verebilmek için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    const userName = currentUser.username;
    const bidAmount = parseInt(document.getElementById('bidAmount').value);
    
    // Giriş kontrolü
    if (!bidAmount) {
        alert("Lütfen teklif miktarını girin!");
        return;
    }
    
    // Teklif geçerli mi?
    if (bidAmount <= highestBid) {
        alert("Teklifiniz mevcut en yüksek tekliften düşük veya eşit olamaz!");
        return;
    }
    
    // Yeni teklifi ekle
    const bid = {
        user: userName,
        amount: bidAmount,
        time: new Date(),
        itemId: auctionData.items[auctionData.activeItemIndex]?.id || 0
    };
    
    bids.unshift(bid); // En başa ekle
    highestBid = bidAmount;
    highestBidder = userName;
    
    // Tüm teklifleri sakla
    let allBids = JSON.parse(localStorage.getItem('allBids')) || [];
    allBids.push(bid);
    localStorage.setItem('allBids', JSON.stringify(allBids));
    
    // Son 10 saniyedeyse süreyi sıfırla
    if (auctionTime <= 10) {
        auctionTime = 10;
    }
    
    // Arayüzü güncelle
    updateBidsList();
    document.getElementById('bidAmount').value = "";
}

// Teklif listesini güncelle
function updateBidsList() {
    const bidsList = document.getElementById('bidsList');
    bidsList.innerHTML = "";
    
    bids.forEach((bid, index) => {
        const bidElement = document.createElement('div');
        bidElement.className = 'bid-item';
        if (index === 0) {
            bidElement.classList.add('highest-bid');
        }
        
        bidElement.innerHTML = `
            <strong>${bid.user}</strong>: ${bid.amount} TL
        `;
        
        bidsList.appendChild(bidElement);
    });
    
    // En yüksek teklif ve teklifi veren kullanıcıyı güncelle
    updateHighestBidInfo();
}

// En yüksek teklif bilgilerini güncelle
function updateHighestBidInfo() {
    const highestBidValue = document.getElementById('highestBidValue');
    const highestBidderName = document.getElementById('highestBidderName');
    
    if (bids.length > 0) {
        highestBidValue.textContent = `${highestBid} TL`;
        highestBidderName.textContent = highestBidder;
    } else {
        highestBidValue.textContent = "0 TL";
        highestBidderName.textContent = "-";
    }
    
    // Derecelendirmeleri güncelle (sadece sağ panelde)
    updateRankings();
}

// Derecelendirmeleri güncelle
function updateRankings() {
    // Kullanıcı istatistiklerini hesapla
    const userStats = calculateUserStats();
    
    // En çok teklif veren
    const topBidderElements = document.querySelectorAll('.ranking-value');
    if (topBidderElements.length > 0) {
        const topBidder = userStats.bidCounts.length > 0 ? userStats.bidCounts[0] : null;
        if (topBidder) {
            topBidderElements[0].innerHTML = `${topBidder.username} (${topBidder.count})`;
        } else {
            topBidderElements[0].innerHTML = "-";
        }
    }
    
    // En çok ürün satın alan
    if (topBidderElements.length > 1) {
        const topBuyer = userStats.purchaseCounts.length > 0 ? userStats.purchaseCounts[0] : null;
        if (topBuyer) {
            topBidderElements[1].innerHTML = `${topBuyer.username} (${topBuyer.count})`;
        } else {
            topBidderElements[1].innerHTML = "-";
        }
    }
    
    // En çok ürün satan
    if (topBidderElements.length > 2) {
        const topSeller = userStats.saleCounts.length > 0 ? userStats.saleCounts[0] : null;
        if (topSeller) {
            topBidderElements[2].innerHTML = `${topSeller.username} (${topSeller.count})`;
        } else {
            topBidderElements[2].innerHTML = "-";
        }
    }
    
    // En çok ürünü bulunan
    if (topBidderElements.length > 3) {
        const topCollector = userStats.itemCounts.length > 0 ? userStats.itemCounts[0] : null;
        if (topCollector) {
            topBidderElements[3].innerHTML = `${topCollector.username} (${topCollector.count})`;
        } else {
            topBidderElements[3].innerHTML = "-";
        }
    }
    
    // En aktif kullanıcıları güncelle
    updateTopBidders(userStats.bidCounts);
}

// En aktif kullanıcıları güncelle
function updateTopBidders(bidCounts) {
    const topBiddersList = document.querySelector('.top-bidders-list');
    topBiddersList.innerHTML = '';
    
    // İlk 5 kullanıcıyı göster
    for (let i = 0; i < Math.min(5, bidCounts.length); i++) {
        const bidder = bidCounts[i];
        const bidderItem = document.createElement('div');
        bidderItem.className = 'top-bidder-item';
        bidderItem.innerHTML = `
            <span class="top-bidder-name">${bidder.username}</span>
            <span class="top-bidder-count">${bidder.count} teklif</span>
        `;
        topBiddersList.appendChild(bidderItem);
    }
    
    // Eğer 5'ten az kullanıcı varsa boş alanları doldur
    for (let i = bidCounts.length; i < 5; i++) {
        const bidderItem = document.createElement('div');
        bidderItem.className = 'top-bidder-item';
        bidderItem.innerHTML = `
            <span class="top-bidder-name">-</span>
            <span class="top-bidder-count">0 teklif</span>
        `;
        topBiddersList.appendChild(bidderItem);
    }
}

// Kullanıcı istatistiklerini hesapla (tüm zamanlar için)
function calculateUserStats() {
    const bidCounts = []; // Teklif sayısı
    const purchaseCounts = []; // Satın alma sayısı
    const saleCounts = []; // Satış sayısı
    const itemCounts = []; // Ürün sayısı
    
    // Tüm teklifleri al (localStorage'dan)
    const allBids = JSON.parse(localStorage.getItem('allBids')) || [];
    
    // Teklif sayılarını hesapla
    const bidCountMap = {};
    allBids.forEach(bid => {
        bidCountMap[bid.user] = (bidCountMap[bid.user] || 0) + 1;
    });
    
    for (const [username, count] of Object.entries(bidCountMap)) {
        bidCounts.push({ username, count });
    }
    
    // Satın alma sayılarını hesapla (tüm zamanlardan)
    const allPurchases = JSON.parse(localStorage.getItem('allPurchases')) || [];
    const purchaseCountMap = {};
    allPurchases.forEach(purchase => {
        purchaseCountMap[purchase.user] = (purchaseCountMap[purchase.user] || 0) + 1;
    });
    
    for (const [username, count] of Object.entries(purchaseCountMap)) {
        purchaseCounts.push({ username, count });
    }
    
    // Satış sayılarını hesapla (tüm zamanlardan)
    const allSales = JSON.parse(localStorage.getItem('allSales')) || [];
    const saleCountMap = {};
    allSales.forEach(sale => {
        saleCountMap[sale.seller] = (saleCountMap[sale.seller] || 0) + 1;
    });
    
    for (const [username, count] of Object.entries(saleCountMap)) {
        saleCounts.push({ username, count });
    }
    
    // Ürün sayılarını hesapla (tüm zamanlardan)
    const itemCountMap = {};
    users.forEach(user => {
        if (user.products) {
            itemCountMap[user.username] = user.products.length;
        }
    });
    
    for (const [username, count] of Object.entries(itemCountMap)) {
        itemCounts.push({ username, count });
    }
    
    // Sırala
    bidCounts.sort((a, b) => b.count - a.count);
    purchaseCounts.sort((a, b) => b.count - a.count);
    saleCounts.sort((a, b) => b.count - a.count);
    itemCounts.sort((a, b) => b.count - a.count);
    
    return {
        bidCounts,
        purchaseCounts,
        saleCounts,
        itemCounts
    };
}

// Ürün ekleme formunu aç
function openProductForm() {
    if (!currentUser) {
        alert("Ürün eklemek için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    // Kullanıcının günlük mezat limitini kontrol et
    const userAuctionsToday = getUserAuctionsForToday();
    if (userAuctionsToday >= DAILY_AUCTION_LIMIT) {
        alert(`Günlük mezat katılma sınırına ulaştınız! (Maksimum ${DAILY_AUCTION_LIMIT} mezat)`);
        return;
    }
    
    // Aktif mezat için ürün eklenemez uyarısı
    alert("Aktif mezat devam ederken yeni ürün eklenemez. Lütfen sıradaki mezatlardan birine ürün ekleyin.");
    
    // Formu aç
    document.getElementById('productForm').style.display = 'block';
    
    // Varsayılan olarak ilk sıradaki mezata ekle
    if (auctionData.upcomingAuctions.length > 0) {
        const submitButton = document.querySelector('.submit-button');
        submitButton.onclick = function() {
            addProductToAuction(auctionData.upcomingAuctions[0].id);
        };
    }
}

// Ürün ekleme formunu kapat
function closeProductForm() {
    document.getElementById('productForm').style.display = 'none';
}

// Ürün ekle (eski yöntem - uyumluluk için korunuyor)
function addProduct() {
    // Bu fonksiyon artık doğrudan çağrılmayacak, sadece uyumluluk için bırakılıyor
    // Yeni sistem addProductToAuction fonksiyonunu kullanıyor
    if (auctionData.upcomingAuctions.length > 0) {
        addProductToAuction(auctionData.upcomingAuctions[0].id);
    }
}

// Diğer fonksiyonlar...
function viewMyAuctions() {
    if (!currentUser) {
        alert("Bu işlem için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    alert(`Mezatlarım:\n${currentUser.products && currentUser.products.length > 0 ? 
        currentUser.products.map(p => `- ${p.name} (${p.price} TL)`).join('\n') : 
        'Henüz ürün eklememişsiniz.'}`);
}

function viewEarnings() {
    if (!currentUser) {
        alert("Bu işlem için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    alert("Kazanç bilgileri burada gösterilecek.");
}

function filterCategory(category) {
    alert(`${category} kategorisi seçildi.`);
}

// Kullanıcının bugün katıldığı mezat sayısını al
function getUserAuctionsForToday() {
    if (!currentUser) return 0;
    
    // Kullanıcının bugün hangi mezatlara ürün eklediğini bul
    const today = new Date().toDateString();
    const userAuctions = new Set(); // Aynı mezata birden fazla ürün eklenmiş olabilir, bu yüzden Set kullanıyoruz
    
    // Tüm mezatlara bak
    auctionData.upcomingAuctions.forEach(auction => {
        // Mezattaki ürünlerde kullanıcı adına göre filtrele
        const userProductsInAuction = auction.products.filter(p => p.soldBy === currentUser.username);
        if (userProductsInAuction.length > 0) {
            // Ürün eklenmişse, bu mezatı set'e ekle
            const auctionDate = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
            if (auctionDate.toDateString() === today) {
                userAuctions.add(auction.id);
            }
        }
    });
    
    return userAuctions.size;
}

// Gelecek mezatları güncelle
function updateUpcomingAuctions() {
    console.log("updateUpcomingAuctions called");
    const upcomingAuctionsList = document.getElementById('upcomingAuctionsList');
    if (!upcomingAuctionsList) {
        console.log("upcomingAuctionsList element not found");
        return;
    }
    
    console.log("auctionData.upcomingAuctions:", auctionData.upcomingAuctions);
    
    // Kullanıcının bugün katıldığı mezat sayısını al
    const userAuctionsToday = getUserAuctionsForToday();
    const remainingAuctionsToday = DAILY_AUCTION_LIMIT - userAuctionsToday;
    
    // İlk olarak 10 adet örnek mezat oluşturalım (gerçek uygulamada bunlar kullanıcı tarafından oluşturulacak)
    if (auctionData.upcomingAuctions.length === 0) {
        console.log("Creating new upcoming auctions");
        const now = new Date();
        for (let i = 1; i <= 10; i++) {
            const auctionDate = new Date(now);
            auctionDate.setMinutes(now.getMinutes() + (i * 2)); // Her 2 dakikada bir
            
            auctionData.upcomingAuctions.push({
                id: i,
                date: auctionDate,
                productCount: 0,
                products: [],
                isActivated: false // Mezatın başlatılıp başlatılmadığını belirtir
            });
        }
        // Mezat verilerini güncelle
        saveAuctionData();
    }
    
    // Mezatları tarihe göre sırala
    const sortedAuctions = [...auctionData.upcomingAuctions].sort((a, b) => {
        const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
        return dateA - dateB;
    });
    
    upcomingAuctionsList.innerHTML = '';
    
    // Günlük limit bilgisini göster
    const limitInfo = document.createElement('div');
    limitInfo.className = 'daily-limit-info';
    limitInfo.innerHTML = `
        <div class="limit-info">
            <span class="limit-label">Günlük Mezat Katılım Limiti:</span>
            <span class="limit-value">${userAuctionsToday} / ${DAILY_AUCTION_LIMIT}</span>
        </div>
        <div class="limit-info">
            <span class="limit-label">Kalan Katılım Hakkı:</span>
            <span class="limit-value">${remainingAuctionsToday}</span>
        </div>
    `;
    upcomingAuctionsList.appendChild(limitInfo);
    
    // Kullanıcı limiti uyarı mesajı
    if (userAuctionsToday >= DAILY_AUCTION_LIMIT) {
        const warningMessage = document.createElement('div');
        warningMessage.className = 'warning-message';
        warningMessage.innerHTML = `
            <div class="warning-content">
                <span class="warning-icon">⚠️</span>
                <span class="warning-text">Günlük mezat katılma limitinize ulaştınız!</span>
            </div>
            <div class="warning-details">
                <p>Bugün toplam ${userAuctionsToday} mezata katıldınız. Maksimum ${DAILY_AUCTION_LIMIT} mezata katılma hakkınız var.</p>
                <p>Yeni mezatlara katılabilmeniz için yarın tekrar denemeniz gerekiyor.</p>
            </div>
        `;
        upcomingAuctionsList.appendChild(warningMessage);
    }
    
    // Sadece ilk 10 mezatı göster
    let shownAuctions = 0;
    for (let i = 0; i < sortedAuctions.length && shownAuctions < 10; i++) {
        const auction = sortedAuctions[i];
        console.log("Processing auction:", auction);
        // Tarih objesini kontrol et ve düzelt
        const auctionDateObj = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
        const auctionDate = auctionDateObj.toLocaleDateString('tr-TR');
        const auctionTime = auctionDateObj.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
        
        // Mezat başlangıcına ne kadar zaman kaldığını kontrol et
        const now = new Date();
        const timeDiff = auctionDateObj.getTime() - now.getTime();
        
        // Mezat başlangıç zamanı geçmişse gösterme
        if (timeDiff < 0) {
            continue;
        }
        
        shownAuctions++;
        
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        const isRemovalAllowed = hoursDiff > 0.5; // 30 dakikadan fazla süre varsa çıkarılabilir
        
        // Kullanıcının bu mezata eklediği ürün sayısını hesapla
        let userProductCount = 0;
        if (currentUser) {
            userProductCount = auction.products.filter(p => p.soldBy === currentUser.username).length;
        }
        
        const auctionCard = document.createElement('div');
        auctionCard.className = 'auction-card';
        
        // Kullanıcı limiti uyarı mesajı
        let limitWarning = '';
        if (userProductCount >= MAX_ITEMS_PER_USER_PER_AUCTION) {
            limitWarning = `
                <div class="product-limit-warning">
                    <span class="warning-icon">⚠️</span>
                    <span class="warning-text">Bu mezata maksimum ürün limitinize ulaştınız!</span>
                </div>
            `;
        }
        
        // Mezat başlangıcına yakın uyarı mesajı
        let timeWarning = '';
        const minutesDiff = Math.round(timeDiff / (1000 * 60));
        if (minutesDiff <= 30 && minutesDiff > 0) {
            timeWarning = `
                <div class="time-warning">
                    <span class="warning-icon">⚠️</span>
                    <span class="warning-text">Mezat başlangıcına ${minutesDiff} dakika kaldı!</span>
                </div>
            `;
        }
        
        auctionCard.innerHTML = `
            <div class="auction-card-header">
                <span class="auction-date">${auctionDate} ${auctionTime}</span>
                <span class="auction-product-info">
                    <span class="auction-product-count">${auction.productCount} ürün</span>
                    <button class="view-products-btn" onclick="viewAuctionProducts(${auction.id})">Ürünleri Gör</button>
                </span>
            </div>
            <div class="auction-card-body">
                <div class="auction-description">Bu mezat için ürün ekleme ve çıkarma işlemleri yapabilirsiniz.</div>
                ${timeWarning}
                ${limitWarning}
                <div class="user-product-info">
                    <span class="user-product-count">Sizin ürün sayınız: ${userProductCount} / ${MAX_ITEMS_PER_USER_PER_AUCTION}</span>
                </div>
                <div class="auction-limits">
                    <span class="auction-limit-info">Toplam limit: ${auction.productCount} / ${MAX_ITEMS_PER_AUCTION}</span>
                </div>
            </div>
            <div class="auction-card-footer">
                <button class="action-button-small add-product-btn" onclick="openProductFormForAuction(${auction.id})" ${userProductCount >= MAX_ITEMS_PER_USER_PER_AUCTION ? 'disabled' : ''}>Ürün Ekle</button>
                <button class="action-button-small remove-product-btn" onclick="removeProductFromAuction(${auction.id})" ${!isRemovalAllowed ? 'disabled' : ''} title="${!isRemovalAllowed ? 'Mezat başlangıcına 30 dakika veya daha az kaldığı için ürün çıkarma işlemi yapılamaz!' : 'Bu mezattan ürün çıkar'}">Ürün Çıkar</button>
            </div>
            <div class="product-form-inline" id="productForm_${auction.id}" style="display: none; margin-top: 15px;">
                <div class="form-group">
                    <label for="productName_${auction.id}">Ürün Adı</label>
                    <input type="text" id="productName_${auction.id}" placeholder="Ürün adını girin" class="form-control">
                </div>
                <div class="form-group">
                    <label for="productDescription_${auction.id}">Açıklama</label>
                    <textarea id="productDescription_${auction.id}" rows="3" placeholder="Ürün açıklamasını girin" class="form-control"></textarea>
                </div>
                <div class="form-group">
                    <label for="startingPrice_${auction.id}">Başlangıç Fiyatı (TL)</label>
                    <input type="number" id="startingPrice_${auction.id}" placeholder="Başlangıç fiyatını girin" class="form-control">
                </div>
                <div class="form-group">
                    <label for="productImage_${auction.id}">Ürün Resmi</label>
                    <input type="file" id="productImage_${auction.id}" class="file-input" accept="image/*">
                    <div class="image-preview" id="imagePreview_${auction.id}"></div>
                </div>
                <div class="form-actions">
                    <button class="form-button submit-button" onclick="addProductToAuction(${auction.id})">Ekle</button>
                    <button class="form-button cancel-button" onclick="closeProductFormForAuction(${auction.id})">İptal</button>
                </div>
            </div>
        `;
        
        upcomingAuctionsList.appendChild(auctionCard);
        
        // Dosya yükleme olayını ekle
        const fileInput = document.getElementById(`productImage_${auction.id}`);
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const preview = document.getElementById(`imagePreview_${auction.id}`);
                        if (preview) {
                            preview.innerHTML = `<img src="${e.target.result}" alt="Önizleme" style="max-width: 100%; max-height: 200px;">`;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }
    
    // Gösterilecek mezat kalmadığında mesaj göster
    if (shownAuctions === 0) {
        const noAuctionsMessage = document.createElement('div');
        noAuctionsMessage.className = 'no-auctions-message';
        noAuctionsMessage.innerHTML = `
            <div class="no-auctions-content">
                <span class="no-auctions-icon">ℹ️</span>
                <span class="no-auctions-text">Şu anda gösterilecek aktif mezat bulunmamaktadır.</span>
            </div>
        `;
        upcomingAuctionsList.appendChild(noAuctionsMessage);
    }
}

// Ürün çıkarmayı onayla
function confirmRemoveProduct(productId, auctionId) {
    if (!confirm("Bu ürünü çıkarmak istediğinizden emin misiniz?")) {
        return;
    }
    
    // Mezatı bul
    const auction = auctionData.upcomingAuctions.find(a => a.id === auctionId);
    if (!auction) {
        alert("Mezat bulunamadı!");
        closeRemoveProductModal();
        return;
    }
    
    // Ürünü bul
    const productIndex = auction.products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
        alert("Ürün bulunamadı!");
        return;
    }
    
    // Ürünü çıkart
    const removedProduct = auction.products.splice(productIndex, 1)[0];
    auction.productCount--;
    auctionData.totalProducts--;
    
    // Kullanıcı ürünlerinden de çıkar
    if (currentUser && currentUser.products) {
        const userProductIndex = currentUser.products.findIndex(p => p.id === productId);
        if (userProductIndex !== -1) {
            currentUser.products.splice(userProductIndex, 1);
        }
    }
    
    // Tüm kullanıcılar listesinden de çıkar
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    if (userIndex !== -1 && users[userIndex].products) {
        const globalProductIndex = users[userIndex].products.findIndex(p => p.id === productId);
        if (globalProductIndex !== -1) {
            users[userIndex].products.splice(globalProductIndex, 1);
        }
    }
    
    // Verileri localStorage'a kaydet
    try {
        localStorage.setItem('users', JSON.stringify(users));
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Mezat verilerini güncelle
        saveAuctionData();
        
        console.log("Product removed successfully");
        
        // Modal'ı kapat
        closeRemoveProductModal();
        
        // Arayüzü güncelle
        updateUpcomingAuctions();
        updateAuctionInfo();
        updateQueueList();
        
        // Kullanıcıya başarı mesajı ver
        const userProductsInThisAuction = auction.products.filter(p => p.soldBy === currentUser.username).length;
        const remainingQuota = MAX_ITEMS_PER_USER_PER_AUCTION - userProductsInThisAuction;
        
        alert(`Ürün başarıyla çıkarıldı! Kota geri kazanıldı.\n\n` +
              `Bu mezata ekleyebileceğiniz ${remainingQuota} ürün daha kaldı.`);
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert("Depolama alanı hatası! Lütfen bazı ürünleri silin veya daha küçük resimler kullanın.\n\n" +
                  "İşlem iptal edildi.");
            // İşlemi geri al
            auction.products.push(removedProduct);
            auction.productCount++;
            auctionData.totalProducts++;
            if (currentUser && currentUser.products) {
                currentUser.products.push(removedProduct);
            }
            return;
        }
    }
}

// Belirli bir mezattan ürün çıkar
function removeProductFromAuction(auctionId) {
    if (!currentUser) {
        alert("Ürün çıkarmak için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    // Mezatı bul
    const auction = auctionData.upcomingAuctions.find(a => a.id === auctionId);
    if (!auction) {
        alert("Mezat bulunamadı!");
        return;
    }
    
    // Mezat tarihini kontrol et (mezat başlangıcına 30 dakika ve daha az kalmışsa işlem yapılamaz)
    const auctionDate = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
    const now = new Date();
    const timeDiff = auctionDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff <= 0.5) { // 30 dakika veya daha az kalmışsa
        const minutesDiff = Math.round(timeDiff / (1000 * 60));
        alert(`Mezat başlangıcına ${minutesDiff} dakika veya daha az kaldığı için ürün çıkarma işlemi yapılamaz!\n\n` +
              `Lütfen mezat başladıktan sonra tekrar deneyin.`);
        return;
    }
    
    // Kullanıcının bu mezata yüklediği ürünleri bul
    const userProducts = auction.products.filter(p => p.soldBy === currentUser.username);
    
    if (userProducts.length === 0) {
        alert("Bu mezata henüz ürün yüklemediniz!\n\n" +
              "Önce bir ürün eklemelisiniz ki onu çıkarabilesiniz.");
        return;
    }
    
    // Kullanıcıya ürünlerini göster ve hangisini çıkaracağını seçmesini iste
    showRemoveProductModal(auctionId, userProducts);
}

// Belirli bir mezata ürün ekleme formunu aç
function openProductFormForAuction(auctionId) {
    if (!currentUser) {
        alert("Ürün eklemek için giriş yapmalısınız!");
        openLoginModal();
        return;
    }
    
    // Kullanıcının günlük mezat limitini kontrol et
    const userAuctionsToday = getUserAuctionsForToday();
    const auction = auctionData.upcomingAuctions.find(a => a.id === auctionId);
    
    // Kullanıcı bu mezata daha önce ürün eklemediyse ve zaten 3 mezata katıldıysa engelle
    const hasUserAddedToThisAuction = auction && auction.products.some(p => p.soldBy === currentUser.username);
    
    if (!hasUserAddedToThisAuction && userAuctionsToday >= DAILY_AUCTION_LIMIT) {
        alert(`Günlük mezat katılma sınırına ulaştınız! (Maksimum ${DAILY_AUCTION_LIMIT} mezat)\n\n` +
              `Şu anda ${userAuctionsToday} mezata katıldınız. Yarın tekrar deneyebilirsiniz.`);
        return;
    }
    
    // Toplam ürün limitini kontrol et
    if (auctionData.totalProducts >= AUCTION_ITEM_LIMIT) {
        alert(`Toplam ürün limitine ulaşıldı! (Maksimum ${AUCTION_ITEM_LIMIT} ürün)\n\n` +
              `Lütfen sistem yöneticisiyle iletişime geçin.`);
        return;
    }
    
    // Mezatın ürün limitini kontrol et
    if (auction && auction.productCount >= MAX_ITEMS_PER_AUCTION) {
        alert(`Bu mezat için maksimum ürün limitine ulaşıldı! (Maksimum ${MAX_ITEMS_PER_AUCTION} ürün)\n\n` +
              `Lütfen başka bir mezata ürün eklemeyi deneyin.`);
        return;
    }
    
    // Kullanıcının bu mezata eklediği ürün sayısını kontrol et (maksimum 10)
    const userProductsInThisAuction = auction.products.filter(p => p.soldBy === currentUser.username).length;
    if (userProductsInThisAuction >= MAX_ITEMS_PER_USER_PER_AUCTION) {
        alert(`Bu mezata maksimum ${MAX_ITEMS_PER_USER_PER_AUCTION} ürün yükleyebilirsiniz!\n\n` +
              `Mevcut ürün sayınız: ${userProductsInThisAuction}\n` +
              `Bu mezata daha fazla ürün ekleyemezsiniz.`);
        return;
    }
    
    // Formu aç
    const productForm = document.getElementById(`productForm_${auctionId}`);
    if (productForm) {
        productForm.style.display = 'block';
    }
}

// Resmi küçült ve base64'e çevir
function resizeAndCompressImage(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resmi yeniden boyutlandır
            let width = img.width;
            let height = img.height;
            
            // Maksimum boyutlara göre yeniden boyutlandır
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height *= maxWidth / width));
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width *= maxHeight / height));
                    height = maxHeight;
                }
            }
            
            // Canvas oluştur ve resmi yeniden boyutlandır
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;
            
            // Resmi çiz
            ctx.drawImage(img, 0, 0, width, height);
            
            // Kaliteye göre sıkıştır ve base64'e çevir (kaliteyi %50'ye düşürdük)
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Belirli bir mezata ürün ekle
function addProductToAuction(auctionId) {
    console.log("addProductToAuction called with auctionId:", auctionId);
    
    if (!currentUser) {
        alert("Ürün eklemek için giriş yapmalısınız!");
        return;
    }
    
    // Toplam ürün limitini kontrol et (5000 ürün)
    if (auctionData.totalProducts >= AUCTION_ITEM_LIMIT) {
        alert(`Toplam ürün limitine ulaşıldı! (Maksimum ${AUCTION_ITEM_LIMIT} ürün)\n\n` +
              `Lütfen sistem yöneticisiyle iletişime geçin.`);
        return;
    }
    
    // Kullanıcının günlük mezat limitini kontrol et (3 mezat)
    const userAuctionsToday = getUserAuctionsForToday();
    console.log("User auctions today:", userAuctionsToday);
    if (userAuctionsToday >= DAILY_AUCTION_LIMIT) {
        alert(`Günlük mezat katılma sınırına ulaştınız! (Maksimum ${DAILY_AUCTION_LIMIT} mezat)\n\n` +
              `Şu anda ${userAuctionsToday} mezata katıldınız. Yarın tekrar deneyebilirsiniz.`);
        return;
    }
    
    // Mezatı bul
    const auction = auctionData.upcomingAuctions.find(a => a.id === auctionId);
    console.log("Found auction:", auction);
    if (!auction) {
        alert("Mezat bulunamadı!\n\n" +
              "Lütfen geçerli bir mezat seçin.");
        return;
    }
    
    // Mezatın ürün limitini kontrol et (her mezat için maksimum 500 ürün)
    console.log("Auction product count:", auction.productCount);
    if (auction.productCount >= MAX_ITEMS_PER_AUCTION) {
        alert(`Bu mezat için maksimum ürün limitine ulaşıldı! (Maksimum ${MAX_ITEMS_PER_AUCTION} ürün)\n\n` +
              `Lütfen başka bir mezata ürün eklemeyi deneyin.`);
        return;
    }
    
    // Kullanıcının bu mezata yüklediği ürün sayısını kontrol et (maksimum 10)
    const userProductsInThisAuction = auction.products.filter(p => p.soldBy === currentUser.username).length;
    console.log("User products in this auction:", userProductsInThisAuction);
    
    if (userProductsInThisAuction >= MAX_ITEMS_PER_USER_PER_AUCTION) {
        alert(`Bu mezata maksimum ${MAX_ITEMS_PER_USER_PER_AUCTION} ürün yükleyebilirsiniz!\n\n` +
              `Mevcut ürün sayınız: ${userProductsInThisAuction}\n` +
              `Bu mezata daha fazla ürün ekleyemezsiniz.`);
        return;
    }
    
    // Form verilerini al (yeni yapıya göre)
    const name = document.getElementById(`productName_${auctionId}`).value;
    const description = document.getElementById(`productDescription_${auctionId}`).value;
    const price = document.getElementById(`startingPrice_${auctionId}`).value;
    const imageFile = document.getElementById(`productImage_${auctionId}`).files[0];
    
    console.log("Form data:", {name, description, price, imageFile});
    
    if (!name || !description || !price || !imageFile) {
        alert("Lütfen tüm alanları doldurun!\n\n" +
              "Ürün adı, açıklama, fiyat ve resim alanları zorunludur.");
        return;
    }
    
    // Resmi küçült ve base64 formatına çevir
    resizeAndCompressImage(imageFile, 800, 600, 0.5, function(imageData) {
        console.log("Image data loaded and compressed");
        
        // Yeni ürünü oluştur
        const newProduct = {
            id: Date.now(), // Basit ID oluşturma
            name: name,
            description: description,
            price: parseFloat(price),
            image: imageData, // Base64 resim verisi
            dateAdded: new Date(),
            soldBy: currentUser.username, // Satıcı bilgisi
            auctionId: auctionId // Hangi mezata ait olduğu
        };
        
        console.log("New product created:", newProduct);
        
        // Ürünü mezata ekle
        auction.products.push(newProduct);
        auction.productCount++;
        
        // Toplam ürün sayısını güncelle
        auctionData.totalProducts++;
        
        console.log("Product added to auction. New count:", auction.productCount);
        console.log("Total products:", auctionData.totalProducts);
        
        // Kullanıcıya ürünü ekle
        currentUser.products = currentUser.products || [];
        currentUser.products.push(newProduct);
        
        console.log("Product added to user products");
        
        // Kullanıcıyı güncelle - quota kontrolü eklendi
        const userIndex = users.findIndex(u => u.username === currentUser.username);
        if (userIndex !== -1) {
            users[userIndex] = currentUser;
            try {
                localStorage.setItem('users', JSON.stringify(users));
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                console.log("User data saved to localStorage");
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    alert("Depolama alanı doldu! Lütfen bazı ürünleri silin veya daha küçük resimler kullanın.\n\n" +
                          "İşlem iptal edildi.");
                    // Ürünü geri al
                    auction.products.pop();
                    auction.productCount--;
                    auctionData.totalProducts--;
                    currentUser.products.pop();
                    return;
                }
            }
        }
        
        // Mezat verilerini güncelle
        saveAuctionData();
        
        console.log("Auction data updated in memory");
        
        // Formu temizle ve kapat
        document.getElementById(`productName_${auctionId}`).value = '';
        document.getElementById(`productDescription_${auctionId}`).value = '';
        document.getElementById(`startingPrice_${auctionId}`).value = '';
        document.getElementById(`productImage_${auctionId}`).value = '';
        document.getElementById(`imagePreview_${auctionId}`).innerHTML = '';
        document.getElementById(`productForm_${auctionId}`).style.display = 'none';
        
        console.log("Form cleared and hidden");
        
        // Arayüzü güncelle
        updateUpcomingAuctions();
        updateAuctionInfo();
        updateQueueList();
        
        console.log("UI updated");
        
        // Kullanıcıya başarı mesajı ver
        const remainingProducts = MAX_ITEMS_PER_USER_PER_AUCTION - userProductsInThisAuction - 1;
        alert(`Ürün başarıyla eklendi!\n\n` +
              `Bu mezata ekleyebileceğiniz ${remainingProducts} ürün daha kaldı.`);
    });
}

// Mezat ürünleri görüntüle
function viewAuctionProducts(auctionId) {
    const auction = auctionData.upcomingAuctions.find(a => a.id === auctionId);
    if (!auction) {
        alert("Mezat bulunamadı!");
        return;
    }
    
    // Ürünleri modal içinde göster
    showProductsModal(auction);
}

// Ürünleri modal içinde göster
function showProductsModal(auction) {
    // Modal elementini oluştur
    let modal = document.getElementById('productsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'productsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content products-modal-content">
                <div class="modal-header">
                    <div class="modal-title">${auction.date.toLocaleDateString('tr-TR')} ${auction.date.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})} - Ürünler</div>
                    <span class="close-button" onclick="closeProductsModal()">&times;</span>
                </div>
                <div class="modal-body" id="productsModalBody">
                    <!-- Ürünler burada listelenecek -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Modal dışına tıklandığında kapat
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeProductsModal();
            }
        });
    }
    
    // Modal başlığını düzelt (tarih objesi string olabilir)
    const modalTitle = modal.querySelector('.modal-title');
    if (modalTitle) {
        const auctionDateObj = typeof auction.date === 'string' ? new Date(auction.date) : auction.date;
        const auctionDate = auctionDateObj.toLocaleDateString('tr-TR');
        const auctionTime = auctionDateObj.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
        modalTitle.textContent = `${auctionDate} ${auctionTime} - Ürünler`;
    }
    
    // Ürünleri güncelle
    const modalBody = document.getElementById('productsModalBody');
    if (modalBody) {
        if (auction.products.length === 0) {
            modalBody.innerHTML = '<p>Bu mezata henüz ürün eklenmemiş.</p>';
        } else {
            let productsHTML = '<div class="products-grid">';
            auction.products.forEach(product => {
                productsHTML += `
                    <div class="product-card">
                        <div class="product-image">
                            <img src="${product.image}" alt="${product.name}">
                        </div>
                        <div class="product-info">
                            <h4 class="product-name">${product.name}</h4>
                            <p class="product-description">${product.description}</p>
                            <p class="product-price">${product.price} TL</p>
                            <p class="product-seller">Satıcı: ${product.soldBy}</p>
                        </div>
                    </div>
                `;
            });
            productsHTML += '</div>';
            modalBody.innerHTML = productsHTML;
        }
    }
    
    // Modal'ı göster
    modal.style.display = 'flex';
}

// Ürün modal'ını kapat
function closeProductsModal() {
    const modal = document.getElementById('productsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Mezat verilerini kaydet
function saveAuctionData() {
    // Mezat verilerini güncelle - tarih objelerini string'e çevir
    const auctionDataToSave = {
        ...auctionData,
        upcomingAuctions: auctionData.upcomingAuctions.map(a => {
            return {
                ...a,
                date: a.date instanceof Date ? a.date.toISOString() : a.date
            };
        })
    };
    localStorage.setItem('auctionData', JSON.stringify(auctionDataToSave));
    
    // auctionData'yı güncelle
    auctionData = {...auctionDataToSave, upcomingAuctions: auctionDataToSave.upcomingAuctions.map(a => {
        return {
            ...a,
            date: typeof a.date === 'string' ? new Date(a.date) : a.date
        };
    })};
}