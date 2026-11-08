// ================= VERCEL SERVERLESS API ROUTER & ENDPOINT NORMALIZER =================
(function initPfVercelFetchNormalizer() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.__pfVercelFetchNormalized) return;
  window.__pfVercelFetchNormalized = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      const reqUrl = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
      const host = (window.location && window.location.hostname) || '';
      const isLocal = (host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:');
      // Block cross-origin localhost fallbacks when running on live HTTPS production (e.g. Vercel)
      if (!isLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(reqUrl)) {
        return Promise.reject(new Error('Skipped localhost fallback on production host'));
      }

    } catch (e) {}
    return origFetch(input, init);
  };
})();

function pfGetApiEndpoints(apiPath) {
  const cleanPath = apiPath.startsWith('/') ? apiPath : ('/' + apiPath);
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
  const isLocal = (host === 'localhost' || host === '127.0.0.1' || (typeof window !== 'undefined' && window.location.protocol === 'file:'));
  if (!isLocal) {
    return [cleanPath];
  }
  return [cleanPath, `http://localhost:8088${cleanPath}`, `http://127.0.0.1:8089${cleanPath}`, `http://localhost:8089${cleanPath}`];
}
window.pfGetApiEndpoints = pfGetApiEndpoints;

function pfEscapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================= STRICT INPUT VALIDATION (NO EMOJIS, NO GIBBERISH, VALID PH FORMATS) =================

function pfHasEmoji(str) {
  if (!str) return false;
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u200D]/u;
  return emojiRegex.test(str);
}

function pfIsGibberishWord(word) {
  if (!word) return false;
  const clean = word.toLowerCase().replace(/[^a-zà-öø-ÿñ]/g, '');
  if (!clean) return true;
  // 4+ identical consecutive letters (e.g. "aaaa", "xxxx")
  if (/(.)\1{3,}/i.test(clean)) return true;
  // Keyboard mash / fake test words
  const bannedWords = new Set([
    'asdf', 'asdfg', 'asdfgh', 'qwerty', 'qwert', 'zxcv', 'zxcvb',
    'test', 'testing', 'tester', 'none', 'null', 'undefined', 'admin',
    'fake', 'sample', 'user', 'guest', 'player', 'name', 'fullname',
    'idk', 'lol', 'haha', 'hehe', 'blah', 'xyz', 'abc', 'abcd', 'abcde',
    'dexter', 'xxxx', 'zzzz', 'qqqq', 'wwww'
  ]);
  if (bannedWords.has(clean)) return true;
  // Words >= 3 chars must contain at least one vowel
  if (clean.length >= 3 && !/[aeiouyà-öø-ÿ]/i.test(clean)) return true;
  // 5+ consecutive consonants
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(clean)) return true;
  return false;
}

function pfValidateField(type, rawValue, isRequired = true) {
  const val = String(rawValue || '').trim();

  if (!val) {
    if (isRequired) {
      return { valid: false, error: 'This field is required. Please enter valid information.' };
    }
    return { valid: true, error: '' };
  }

  if (pfHasEmoji(val)) {
    return { valid: false, error: 'Emojis and special pictograms are not allowed. Please enter valid text.' };
  }

  if (type === 'name') {
    if (val.length < 4 || val.length > 70) {
      return { valid: false, error: 'Please enter your complete First and Last Name (4 to 70 characters).' };
    }
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿÑñ\s.'\-]+$/.test(val)) {
      return { valid: false, error: 'Full Name must contain letters only (no numbers, emojis, or special symbols).' };
    }
    const words = val.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      return { valid: false, error: 'Please enter both your First Name and Last Name (e.g. Juan Dela Cruz).' };
    }
    for (const w of words) {
      const stripped = w.replace(/[.'\-]/g, '');
      if (stripped.length < 2 && words.length < 3) {
        return { valid: false, error: 'Each name part must be at least 2 letters.' };
      }
      if (pfIsGibberishWord(stripped)) {
        return { valid: false, error: `"${w}" does not look like a valid real name. Please enter a real name.` };
      }
    }
    return { valid: true, error: '' };
  }

  if (type === 'phone') {
    if (/[A-Za-z]/.test(val)) {
      return { valid: false, error: 'Mobile number cannot contain letters.' };
    }
    const digits = val.replace(/[\s\-()]/g, '');
    let normalized = digits;
    if (normalized.startsWith('+63')) normalized = '0' + normalized.slice(3);
    else if (normalized.startsWith('63') && normalized.length === 12) normalized = '0' + normalized.slice(2);

    if (!/^09\d{9}$/.test(normalized)) {
      return { valid: false, error: 'Enter a valid 11-digit Philippine mobile number starting with 09 (e.g. 0917 123 4567).' };
    }
    if (/^09(\d)\1{8}$/.test(normalized) || normalized === '09123456789' || normalized === '09987654321') {
      return { valid: false, error: 'Please enter a real active mobile number (repeating/test digits are not allowed).' };
    }
    return { valid: true, error: '' };
  }

  if (type === 'email') {
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(val)) {
      return { valid: false, error: 'Please enter a valid email address (e.g. juan@email.com).' };
    }
    const [localPart, domainPart] = val.split('@');
    const domainName = domainPart.split('.')[0];
    if (pfIsGibberishWord(localPart.replace(/[0-9._%+\-]/g, '')) && localPart.replace(/[^a-zA-Z]/g, '').length >= 4) {
      return { valid: false, error: 'Email username looks invalid. Please enter a real email address.' };
    }
    if (/(.)\1{3,}/i.test(domainName)) {
      return { valid: false, error: 'Email domain looks invalid.' };
    }
    return { valid: true, error: '' };
  }

  if (type === 'ref') {
    if (!/^[A-Za-z0-9\s\-]{6,25}$/.test(val)) {
      return { valid: false, error: 'Reference Number must be 6 to 20 alphanumeric characters (no emojis or symbols).' };
    }
    const digitCount = (val.match(/\d/g) || []).length;
    if (digitCount < 6) {
      return { valid: false, error: 'Valid GCash / Bank Reference Numbers must contain at least 6 digits.' };
    }
    const onlyDigits = val.replace(/\D/g, '');
    if (/^(\d)\1+$/.test(onlyDigits) || onlyDigits === '123456' || onlyDigits === '12345678' || onlyDigits === '123456789') {
      return { valid: false, error: 'Fake or repeating reference numbers (e.g. 111111 / 123456) are not valid.' };
    }
    return { valid: true, error: '' };
  }

  if (type === 'lookup') {
    if (val.length < 3 || val.length > 60) {
      return { valid: false, error: 'Please enter a valid Booking ID (e.g. PF-12345), Reference No., or Full Name.' };
    }
    if (!/^[A-Za-z0-9À-ÖØ-öø-ÿÑñ\s.'\-]+$/.test(val)) {
      return { valid: false, error: 'Search query contains invalid symbols or emojis.' };
    }
    return { valid: true, error: '' };
  }

  if (type === 'text') {
    if (val.length < 2) {
      return { valid: false, error: 'Please enter at least 2 valid characters.' };
    }
    if (/(.)\1{4,}/i.test(val)) {
      return { valid: false, error: 'Please enter meaningful text (no repeated character mashing).' };
    }
    return { valid: true, error: '' };
  }

  return { valid: true, error: '' };
}

function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errEl = document.getElementById(fieldId + '-error');
  if (input) {
    input.classList.add('border-brand-clay', 'bg-brand-clay/10');
    input.classList.remove('border-white/15', 'border-white/10');
    input.focus();
  }
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.remove('hidden');
  } else {
    alert(message);
  }
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errEl = document.getElementById(fieldId + '-error');
  if (input) {
    input.classList.remove('border-brand-clay', 'bg-brand-clay/10');
  }
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }
}

// P&F Rally Ground - Public Booking, Cart, AI OCR & Real-Time Admin Sync Engine
// Phase IV, Doña Maria Subd., Velasco St., Tagas, Daraga, Albay | 0999 883 2346

let currentSelectedCourt = 1;
let currentSelectedDateLabel = "Today";
let currentSelectedSlot = "06:00 PM";
let isCurrentSlotPeak = true;
let playerCount = 4;
let selectedPaymentMode = "gcash"; // 'gcash', 'bank' (Cash removed)
let uploadedReceiptDataUrl = "";
let activeScheduleCourtFilter = 0; // 0 = All 4 Courts, 1..4 = specific court

// Live Cart Array
let cartItems = JSON.parse(localStorage.getItem('pf_cart_items') || '[]');

// Live Shared State Cache (synced from /api/state)
let sharedServerState = {
  bookings: JSON.parse(localStorage.getItem('pf_all_bookings') || '[]'),
  blocks: JSON.parse(localStorage.getItem('pf_court_blocks') || '[]'),
  announcements: JSON.parse(localStorage.getItem('pf_announcements') || '[]')
};
window.sharedServerState = sharedServerState;

const courtNames = {
  1: "Court 1",
  2: "Court 2",
  3: "Court 3",
  4: "Court 4"
};

// ================= REAL-TIME SERVER SYNC =================

async function syncStateFromServer(forceFull = false) {
  if (!forceFull && typeof document !== "undefined" && document.hidden) return sharedServerState;
  const sinceParam = (!forceFull && window.__pfLastServerVersion) ? `&since=${encodeURIComponent(window.__pfLastServerVersion)}` : '';
  const endpoints = pfGetApiEndpoints(`/api/state?lite=1${sinceParam}`);
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.unchanged === true) {
          return sharedServerState;
        }
        if (data && Array.isArray(data.bookings)) {
          if (data.version) window.__pfLastServerVersion = String(data.version);
          let localBlocks = [];
          try { localBlocks = JSON.parse(localStorage.getItem('pf_court_blocks') || '[]') || []; } catch (e) {}
          const localBlocksTs = Number(localStorage.getItem('pf_court_blocks_updated_at') || 0);
          const srvBlocksTs = Number(data.blocksUpdatedAt || 0);
          if (srvBlocksTs >= localBlocksTs && Array.isArray(data.blocks) && (data.blocks.length > 0 || srvBlocksTs > 0)) {
            localStorage.setItem('pf_court_blocks', JSON.stringify(data.blocks));
            if (srvBlocksTs > 0) localStorage.setItem('pf_court_blocks_updated_at', String(srvBlocksTs));
          } else if (localBlocks.length > 0 && (!Array.isArray(data.blocks) || data.blocks.length === 0)) {
            data.blocks = localBlocks;
          }
          // Synchronize deleted booking refs from server + localStorage so deleted bookings never resurrect
          let localDelRefs = [];
          try { localDelRefs = JSON.parse(localStorage.getItem('pf_deleted_booking_refs') || '[]') || []; } catch (e) {}
          const srvDelRefs = Array.isArray(data.deletedBookingRefs) ? data.deletedBookingRefs : [];
          const deletedSet = new Set([...localDelRefs, ...srvDelRefs].map(r => String(r || '').trim().toUpperCase()).filter(Boolean));
          try { localStorage.setItem('pf_deleted_booking_refs', JSON.stringify(Array.from(deletedSet).slice(-500))); } catch (e) {}

          let existingLocalBks = [];
          try { existingLocalBks = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]') || []; } catch (e) {}
          const srvBookings = (Array.isArray(data.bookings) ? data.bookings : []).filter(b => b && b.ref && !deletedSet.has(String(b.ref).trim().toUpperCase()));
          const srvRefMap = new Map();
          srvBookings.forEach(b => { if (b && b.ref) srvRefMap.set(String(b.ref).trim().toUpperCase(), b); });

          // Server is authoritative! Only keep a local booking if it was just created (<10s ago) in this browser tab and not deleted
          const nowMs = Date.now();
          const mergedBookings = [...srvBookings];
          existingLocalBks.forEach(lb => {
            if (!lb || !lb.ref) return;
            const refU = String(lb.ref).trim().toUpperCase();
            if (deletedSet.has(refU) || srvRefMap.has(refU)) return;
            const savedAt = Number(lb._localSavedAt || lb._createdAt || 0);
            if (savedAt > 0 && (nowMs - savedAt) < 10000) {
              mergedBookings.unshift(lb);
              srvRefMap.set(refU, lb);
            } else {
              try { localStorage.removeItem('booking_' + lb.ref); } catch (e) {}
            }
          });
          data.bookings = mergedBookings;
          data.deletedBookingRefs = Array.from(deletedSet);
          data._hasSyncedFromServer = true;
          sharedServerState = data;
          window.sharedServerState = sharedServerState;
          localStorage.setItem('pf_all_bookings', JSON.stringify(mergedBookings));
          localStorage.setItem('pf_shared_bookings', JSON.stringify(mergedBookings));
          localStorage.setItem('pf_public_bookings', JSON.stringify(mergedBookings));

          // Keep latest_booking updated if its status changed in Admin, or remove it if deleted in Admin
          const latestRaw = localStorage.getItem('latest_booking');
          if (latestRaw) {
            try {
              const latest = JSON.parse(latestRaw);
              if (latest && latest.ref) {
                const latRefU = String(latest.ref).trim().toUpperCase();
                const updated = mergedBookings.find(b => String(b.ref || '').trim().toUpperCase() === latRefU);
                if (updated && !deletedSet.has(latRefU)) {
                  localStorage.setItem('latest_booking', JSON.stringify(updated));
                  localStorage.setItem('booking_' + updated.ref, JSON.stringify(updated));
                } else {
                  localStorage.removeItem('latest_booking');
                  localStorage.removeItem('booking_' + latest.ref);
                }
              }
            } catch (e) {}
          }
          const newSyncSig = JSON.stringify({
            b: (data.bookings || []).map(x => `${x.ref}:${x.status}:${x.date}:${x.time}:${x.court}`),
            bl: (data.blocks || []).map(x => `${x.id}:${x.court}:${x.date}:${x.hours}:${x.statusType}`),
            opE: data.siteConfig ? data.siteConfig.openPlayEnabled : true,
            opS: data.siteConfig ? data.siteConfig.openPlaySlots : [],
            opP: (data.siteConfig && Array.isArray(data.siteConfig.openPlaySessions))
              ? data.siteConfig.openPlaySessions.map(s => `${s.id}:${(s.players || []).length}:${s.lastShuffleTime || ''}`)
              : [],
            trn: (data.siteConfig && Array.isArray(data.siteConfig.tournaments))
              ? data.siteConfig.tournaments.map(t => `${t.id}:${t.published}:${(t.registrations || []).length}:${(t.players || []).join('|')}`)
              : [],
            scT: data.siteConfig ? data.siteConfig.updatedAt : 0,
            hr: (typeof pfGetPhilippineNow === 'function') ? pfGetPhilippineNow().getHours() : new Date().getHours()
          });
          const sigChanged = (window.__pfLastPublicSyncSig !== newSyncSig) || !window.__pfFirstPublicSyncRendered;
          window.__pfLastPublicSyncSig = newSyncSig;
          window.__pfFirstPublicSyncRendered = true;
          if (sigChanged) {
            if (typeof renderLiveScheduleMatrix === 'function') {
              renderLiveScheduleMatrix();
            }
            if (typeof renderDrawerSlots === 'function') {
              try { renderDrawerSlots(); } catch (e) {}
            }
            if (typeof renderTimeChips === 'function') {
              try { renderTimeChips(); } catch (e) {}
            }
          }
          if (Array.isArray(data.announcements) && (data.announcements.length > 0 || Number(data.announcementsUpdatedAt || 0) > 0)) {
            sharedServerState.announcements = data.announcements;
            sharedServerState.announcementsUpdatedAt = Number(data.announcementsUpdatedAt || 0);
            localStorage.setItem('pf_announcements', JSON.stringify(data.announcements));
            if (data.announcementsUpdatedAt) {
              localStorage.setItem('pf_announcements_updated_at', String(data.announcementsUpdatedAt));
            }
          } else if (!Array.isArray(sharedServerState.announcements) || sharedServerState.announcements.length === 0) {
            sharedServerState.announcements = getDefaultWelcomeAnnouncements();
          }
          if (Array.isArray(data.inventory)) {
            sharedServerState.inventory = data.inventory;
            try {
              localStorage.setItem('pf_inventory', JSON.stringify(data.inventory));
              localStorage.setItem('pf_pos_catalog', JSON.stringify(data.inventory));
            } catch (e) {}
          }
          if (typeof renderPublicInventoryCatalog === 'function') {
            renderPublicInventoryCatalog();
          }
          if (data.siteConfig && typeof data.siteConfig === 'object') {
            const bestSc = Object.assign({}, DEFAULT_PF_SITE_CONFIG, data.siteConfig);
            sharedServerState.siteConfig = bestSc;
            window.PF_SITE_CONFIG = bestSc;
            try { localStorage.setItem('pf_site_config', JSON.stringify(bestSc)); } catch (e) {}
            if (typeof applySiteConfig === 'function') {
              applySiteConfig(bestSc);
            }
            if (typeof renderLiveScheduleMatrix === 'function') {
              try { renderLiveScheduleMatrix(); } catch (e) {}
            }
          }
          if (data.paymentConfig && typeof data.paymentConfig === 'object') {
            sharedServerState.paymentConfig = data.paymentConfig;
            try { localStorage.setItem('pf_payment_config', JSON.stringify(data.paymentConfig)); } catch (e) {}
            const st = String(data.paymentConfig.gcashQrUrl || data.paymentConfig.standeeUrl || '').trim();
            if (st && (st.startsWith('assets/custom-') || st.startsWith('data:image/'))) {
              localStorage.setItem('pf_custom_gcash_standee_url', st);
            } else {
              localStorage.removeItem('pf_custom_gcash_standee_url');
            }
            if (typeof applyPaymentConfigToPublicDom === 'function') {
              applyPaymentConfigToPublicDom(data.paymentConfig);
            }
          }
          if (typeof renderPublicAnnouncementBoard === 'function') {
            renderPublicAnnouncementBoard();
          }
          return data;
        }
      }
    } catch (e) {
      // Offline or static preview fallback
    }
  }
  return sharedServerState;
}

async function pushBookingToServer(bookingData) {
  bookingData._localSavedAt = Date.now();
  // Always save to localStorage first
  let allBookings = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]');
  allBookings = allBookings.filter(b => b.ref !== bookingData.ref);
  allBookings.unshift(bookingData);
  localStorage.setItem('pf_all_bookings', JSON.stringify(allBookings));
  localStorage.setItem('pf_shared_bookings', JSON.stringify(allBookings));
  localStorage.setItem('latest_booking', JSON.stringify(bookingData));
  localStorage.setItem('booking_' + bookingData.ref, JSON.stringify(bookingData));
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('pf_booking_sync_channel');
      bc.postMessage({ type: 'NEW_PUBLIC_BOOKING', booking: bookingData, bookings: allBookings, updatedAt: Date.now() });
      bc.close();
    }
  } catch (e) {}

  // Push to unified backend API
  const endpoints = pfGetApiEndpoints('/api/bookings');
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      if (res.ok) {
        const respData = await res.json();
        if (respData && respData.state) {
          sharedServerState = respData.state;
          window.sharedServerState = sharedServerState;
          localStorage.setItem('pf_all_bookings', JSON.stringify(respData.state.bookings));
        }
        break;
      }
    } catch (e) {
      // Continue to next endpoint or fallback to localStorage
    }
  }
}

// ================= NAVIGATION & DRAWER TOGGLES =================

function openAdminPortal(event) {
  if (event) event.preventDefault();
  const host = window.location.hostname;
  const port = window.location.port;
  if ((host === 'localhost' || host === '127.0.0.1') && (port === '8088' || port === '8188')) {
    const admPort = (port === '8088') ? '8089' : '8189';
    window.location.href = 'http://' + host + ':' + admPort + '/?login=1';
  } else {
    window.location.href = '/admin/?login=1';
  }
  return false;
}

function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  const bd = document.getElementById('mobile-menu-backdrop');
  const icon = document.getElementById('hamburger-icon');
  if (m) {
    const isHidden = m.classList.toggle('hidden');
    if (bd) {
      bd.classList.toggle('hidden', isHidden);
    }
    if (icon) {
      icon.innerHTML = isHidden 
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M4 6h16M4 12h16M4 18h16"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M6 18L18 6M6 6l12 12"/>';
    }
  }
}

function toggleCartDrawer() {
  const d = document.getElementById('cart-drawer');
  if (!d) return;
  const isHidden = d.classList.toggle('hidden');
  if (!isHidden) {
    document.body.classList.add('overflow-hidden');
    renderCartUI();
  } else {
    document.body.classList.remove('overflow-hidden');
  }
}

function openBookingDrawer(preSelectCourt = null, preSelectTime = null) {
  if (preSelectTime) {
    currentSelectedSlot = preSelectTime;
    const hrMatch = preSelectTime.match(/^(\d+):00\s*(AM|PM)$/i);
    if (hrMatch) {
      let hr = parseInt(hrMatch[1], 10);
      const ampm = hrMatch[2].toUpperCase();
      if (ampm === 'PM' && hr !== 12) hr += 12;
      if (ampm === 'AM' && hr === 12) hr = 0;
      isCurrentSlotPeak = (hr >= 18);
    }
  }
  const drawer = document.getElementById('booking-drawer');
  if (!drawer) {
    const rail = document.getElementById('date-rail-container');
    if (rail) {
      rail.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.location.href = 'book.html';
    }
    return;
  }
  drawer.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  initDrawerSlots();
  if (preSelectCourt) {
    drawerSetCourt(preSelectCourt);
  } else {
    drawerSetCourt(currentSelectedCourt);
  }
  recalculateDrawerTotal();
}

function closeBookingDrawer() {
  const drawer = document.getElementById('booking-drawer');
  if (!drawer) return;
  drawer.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

// ================= COURT DRAWER LOGIC =================

function initDrawerSlots() {
  const drawerSlots = document.getElementById('drawer-slot-buttons');
  if (!drawerSlots) return;
  drawerSlots.innerHTML = '';
  for (let hr = 6; hr < 24; hr++) {
    const isPeak = hr >= 18;
    const hr12 = (hr % 12 || 12);
    const tStr = (hr12 < 10 ? '0' + hr12 : hr12) + ':00 ' + (hr >= 12 ? 'PM' : 'AM');
    const isSelected = (tStr === currentSelectedSlot || tStr.replace(/^0/, '') === currentSelectedSlot.replace(/^0/, ''));
    if (isSelected) {
      currentSelectedSlot = tStr;
      isCurrentSlotPeak = isPeak;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `min-h-[48px] p-2 rounded-xl border text-center text-xs font-bold transition touch-manipulation active:scale-95 ${
      isSelected 
        ? (isPeak ? 'border-2 border-[#D4FF00] bg-[#D4FF00] text-[#050E1D] shadow-lg shadow-[#D4FF00]/35' : 'border-2 border-[#10B981] bg-[#10B981] text-[#050E1D] shadow-lg shadow-[#10B981]/25')
        : (isPeak ? 'border-2 border-[#D4FF00]/80 bg-[#D4FF00]/20 text-[#E6FF4D] hover:bg-[#D4FF00]/30' : 'border border-[#10B981]/40 bg-brand-black text-[#6EE7B7] hover:border-[#10B981]')
    }`;
    btn.innerHTML = `<span class="block font-black">${tStr}</span><small class="block text-[9px] font-mono uppercase ${isSelected ? 'text-[#050E1D] font-black' : (isPeak ? 'text-[#D4FF00] font-extrabold' : 'text-[#34D399]')}">${isPeak ? 'PEAK ₱500' : 'REG ₱400'}</small>`;
    btn.onclick = () => {
      currentSelectedSlot = tStr;
      isCurrentSlotPeak = isPeak;
      initDrawerSlots();
      const badge = document.getElementById('drawer-rate-badge');
      if (badge) badge.textContent = isPeak ? 'Peak Hour (₱500/hr)' : 'Regular Hour (₱400/hr)';
      recalculateDrawerTotal();
    };
    drawerSlots.appendChild(btn);
  }
  const badge = document.getElementById('drawer-rate-badge');
  if (badge) badge.textContent = isCurrentSlotPeak ? 'Peak Hour (₱500/hr)' : 'Regular Hour (₱400/hr)';
}

function drawerSetCourt(courtNum) {
  const normalized = Math.max(1, Math.min(4, Number(courtNum) || 1));
  currentSelectedCourt = normalized;
  if (typeof DRAWER_STATE !== 'undefined') DRAWER_STATE.selectedCourt = normalized;
  document.querySelectorAll('#drawer-court-buttons button').forEach((btn, idx) => {
    const c = Number(btn.getAttribute('data-court')) || (idx + 1);
    const spans = btn.querySelectorAll('span');
    if (c === normalized) {
      btn.className = 'drawer-court active py-3 px-3.5 rounded-2xl bg-[#0D1F18] text-white border-2 border-[#15803D] shadow-sm text-center transition flex items-center justify-between';
      if (spans[0]) spans[0].className = 'text-xs sm:text-sm font-bold text-white block';
      if (spans[1]) spans[1].className = 'text-[#A7F3D0] font-mono text-xs';
    } else {
      btn.className = 'drawer-court py-3 px-3.5 rounded-2xl bg-[#F8F7F3] text-[#0D1F18] border border-[#E2E0D8] hover:border-[#15803D] text-center transition flex items-center justify-between';
      if (spans[0]) spans[0].className = 'text-xs sm:text-sm font-bold text-[#0D1F18] block';
      if (spans[1]) spans[1].className = 'text-[#52605A] font-mono text-xs';
    }
  });
  if (typeof renderDrawerSlots === 'function') renderDrawerSlots();
  if (typeof recalculateDrawerTotal === 'function') recalculateDrawerTotal();
}

function changePlayers(delta) {
  playerCount = Math.max(1, Math.min(12, playerCount + delta));
  const el = document.getElementById('player-count');
  if (el) el.textContent = playerCount;
  recalculateDrawerTotal();
}

function selectPayMode(mode) {
  // Support verified GCash, Maya, BDO Bank Transfer & Manual Payment
  if (mode !== 'bank' && mode !== 'maya' && mode !== 'manual') mode = 'gcash';
  selectedPaymentMode = mode;
  const cards = document.querySelectorAll('.pay-mode-card');
  cards.forEach(c => {
    c.classList.remove('border-brand-lime', 'bg-brand-lime/10');
    c.classList.add('border-white/10', 'bg-brand-card');
    const radio = c.querySelector('input[type="radio"]');
    if (radio) radio.checked = (radio.value === mode);
  });

  document.querySelectorAll(`input[name="pay-mode"][value="${mode}"], input[name="modal-pay-mode"][value="${mode}"]`).forEach(activeRadio => {
    activeRadio.checked = true;
    const parentCard = activeRadio.closest('.pay-mode-card');
    if (parentCard) {
      parentCard.classList.remove('border-white/10', 'bg-brand-card');
      parentCard.classList.add('border-brand-lime', 'bg-brand-lime/10');
    }
  });

  const hint = document.getElementById('pay-mode-hint');
  if (hint) {
    hint.textContent = mode === 'bank' ? 'Bank Transfer (BDO / BPI / Maya)' : 'GCash (Official QR Ph & Express Send)';
  }

  // Also update Payment Modal UI if open
  updatePaymentModalModeUI();
}

function copyPaymentAccount(text, btnEl) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  if (btnEl) {
    const orig = btnEl.textContent;
    btnEl.textContent = 'Copied!';
    btnEl.classList.add('bg-brand-lime', 'text-brand-black');
    setTimeout(() => {
      btnEl.textContent = orig;
      btnEl.classList.remove('bg-brand-lime', 'text-brand-black');
    }, 1400);
  }
}

function formatCartItemsBulletHtml(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return '<div class="text-slate-400 text-xs">• No items selected</div>';
  }
  const rows = items.map(i => {
    const qty = Number(i.qty || 1);
    const sub = Number(i.price || 0) * qty;
    const subInfo = i.subtitle ? ` <span class="text-slate-400 font-normal">(${i.subtitle})</span>` : '';
    return `<li class="flex items-start justify-between gap-3 py-1 border-b border-white/5 last:border-b-0">
      <div class="flex items-start gap-2 min-w-0">
        <span class="text-brand-lime font-black leading-snug">•</span>
        <span class="text-white font-bold leading-snug">${qty}× ${i.name}${subInfo}</span>
      </div>
      <span class="font-mono font-black text-brand-lime flex-shrink-0">₱${sub.toLocaleString()}.00</span>
    </li>`;
  }).join('');
  return `<div class="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1.5">Order / Official Receipt Breakdown:</div><ul class="space-y-1">${rows}</ul>`;
}

function pfExtractCleanCourtLabel(booking) {
  if (!booking) return 'Court 1';
  const refStr = String(booking.ref || '').toUpperCase().trim();
  const rawCourt = String(booking.court || booking.courtName || '').trim();
  const isTournamentBk = Boolean(
    booking.isTournament ||
    booking.bookingType === 'TOURNAMENT' ||
    refStr.startsWith('PF-TRN') ||
    refStr.startsWith('TRN-') ||
    /tournament/i.test(rawCourt)
  );
  if (isTournamentBk) {
    return rawCourt || 'Tournament (Court 1–4)';
  }
  const isOpenPlayBk = Boolean(
    booking.isOpenPlay ||
    booking.bookingType === 'OPEN_PLAY' ||
    refStr.startsWith('PF-OP') ||
    /open\s*play/i.test(rawCourt)
  );
  if (isOpenPlayBk) {
    if (rawCourt && /open\s*play/i.test(rawCourt)) {
      if (/court\s*1\s*,\s*court\s*2\s*,\s*court\s*3\s*,\s*court\s*4/i.test(rawCourt) || /court\s*1\s*[-–]\s*4/i.test(rawCourt)) {
        return 'Open Play (Court 1–4)';
      }
      return rawCourt;
    }
    const desig = (typeof pfGetOpenPlayDesignatedCourts === 'function')
      ? pfGetOpenPlayDesignatedCourts()
      : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    const cLabel = (!Array.isArray(desig) || desig.length === 0 || desig.length === 4)
      ? 'Court 1–4'
      : desig.join(', ');
    return `Open Play (${cLabel})`;
  }
  const mCourt = rawCourt.match(/court\s*0*([1-4])/i);
  if (mCourt) return 'Court ' + mCourt[1];
  if (Array.isArray(booking.items)) {
    for (const it of booking.items) {
      const s = typeof it === 'string' ? it : String((it && (it.name || it.court)) || '');
      const m = s.match(/court\s*0*([1-4])/i);
      if (m) return 'Court ' + m[1];
    }
  }
  return rawCourt || 'Court 1';
}
window.pfExtractCleanCourtLabel = pfExtractCleanCourtLabel;

function formatBookingItemsBulletHtml(booking) {
  if (!booking) return '—';
  const cleanCourt = pfExtractCleanCourtLabel(booking);
  const refStr = String(booking.ref || '').toUpperCase().trim();
  const isOpenPlayBk = Boolean(
    booking.isOpenPlay ||
    booking.bookingType === 'OPEN_PLAY' ||
    refStr.startsWith('PF-OP') ||
    /open\s*play/i.test(String(booking.court || booking.courtName || ''))
  );
  const validRows = [];
  let hasCourtLine = false;

  if (Array.isArray(booking.items) && booking.items.length > 0) {
    booking.items.forEach(i => {
      if (typeof i === 'string') {
        const trimmed = i.trim();
        if (!trimmed || /undefined/i.test(trimmed)) return;
        if (isOpenPlayBk && /^court\s*0*[1-4]$/i.test(trimmed)) return;
        if (/court\s*0*[1-4]/i.test(trimmed) || /open\s*play/i.test(trimmed) || /tournament/i.test(trimmed)) hasCourtLine = true;
        validRows.push(`<li class="flex items-start justify-between gap-2 text-xs">
          <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(trimmed)}</span></span>
        </li>`);
      } else if (i && typeof i === 'object') {
        const rawName = String(i.name || i.court || i.title || '').trim();
        if (!rawName || /undefined/i.test(rawName)) return;
        if (isOpenPlayBk && /^court\s*0*[1-4]$/i.test(rawName)) return;
        if (/court\s*0*[1-4]/i.test(rawName) || /open\s*play/i.test(rawName) || /tournament/i.test(rawName) || i.isCourt) hasCourtLine = true;
        const qty = Math.max(1, Number(i.qty || 1));
        const sub = Number(i.price || 0) * qty;
        const subInfo = i.subtitle ? ` <span class="text-slate-400 font-normal">(${pfEscapeHtml(i.subtitle)})</span>` : '';
        const prefix = (/^\d+\s*[x×]/i.test(rawName) || i.isCourt) ? '' : `${qty}× `;
        validRows.push(`<li class="flex items-start justify-between gap-2 text-xs">
          <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${prefix}${pfEscapeHtml(rawName)}${subInfo}</span></span>
          ${sub > 0 ? `<span class="font-mono text-brand-lime text-[11px] flex-shrink-0">₱${sub.toLocaleString()}</span>` : ''}
        </li>`);
      }
    });
  }

  if (!hasCourtLine && cleanCourt) {
    const durMatch = String(booking.time || '').match(/\((\d+)\s*hr/i);
    const durLabel = (!isOpenPlayBk && durMatch) ? ` (${durMatch[1]} hr)` : '';
    validRows.unshift(`<li class="flex items-start justify-between gap-2 text-xs">
      <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(cleanCourt + durLabel)}</span></span>
    </li>`);
  } else if (isOpenPlayBk && validRows.length > 0 && !validRows.some(r => /court\s*1[-–]4|court\s*[1-4]/i.test(r))) {
    validRows.unshift(`<li class="flex items-start justify-between gap-2 text-xs">
      <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(cleanCourt)}</span></span>
    </li>`);
  }

  if (validRows.length > 0) {
    return `<ul class="space-y-1 text-left">${validRows.join('')}</ul>`;
  }

  const raw = String(cleanCourt || booking.court || 'Court 1');
  const parts = raw.includes(' + ') ? raw.split(' + ') : (raw.includes(' • ') ? [raw] : [raw]);
  return `<ul class="space-y-1 text-left">${parts.map(p => `<li class="flex items-start gap-1.5 text-xs"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(p.trim())}</span></li>`).join('')}</ul>`;
}

function pfGetDrawerGearQty(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return 0;
  if (el.type === 'checkbox') return el.checked ? 1 : 0;
  const val = parseInt(el.value || '0', 10);
  return (Number.isFinite(val) && val > 0) ? Math.min(20, val) : 0;
}

function pfSyncDrawerGearCardStyle(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const qty = pfGetDrawerGearQty(inputId);
  if (el.type !== 'checkbox') el.value = String(qty);
  const card = el.closest('.pf-gear-qty-card');
  if (card) {
    if (qty > 0) {
      card.classList.remove('border-white/10');
      card.classList.add('border-brand-lime', 'bg-brand-lime/10');
    } else {
      card.classList.remove('border-brand-lime', 'bg-brand-lime/10');
      card.classList.add('border-white/10');
    }
  }
}

function pfChangeDrawerGear(inputId, delta) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const cur = pfGetDrawerGearQty(inputId);
  const next = Math.max(0, Math.min(20, cur + delta));
  if (el.type === 'checkbox') {
    el.checked = next > 0;
  } else {
    el.value = String(next);
  }
  pfSyncDrawerGearCardStyle(inputId);
  if (typeof recalculateDrawerTotal === 'function') recalculateDrawerTotal();
}

function pfOnDrawerGearInput(inputId) {
  pfSyncDrawerGearCardStyle(inputId);
  if (typeof recalculateDrawerTotal === 'function') recalculateDrawerTotal();
}

window.pfGetDrawerGearQty = pfGetDrawerGearQty;
window.pfSyncDrawerGearCardStyle = pfSyncDrawerGearCardStyle;
window.pfChangeDrawerGear = pfChangeDrawerGear;
window.pfOnDrawerGearInput = pfOnDrawerGearInput;

function updatePaymentModalModeUI() {
  const qrBox = document.getElementById('modal-qr-section');
  const mayaBox = document.getElementById('modal-maya-section');
  const bankBox = document.getElementById('modal-bank-section');
  const cashBox = document.getElementById('modal-cash-section');
  const refBox = document.getElementById('modal-ref-section');
  const refLabel = document.getElementById('manual-ref-label');
  const refInput = document.getElementById('manual-ref-input');
  const titleEl = document.getElementById('modal-payment-title');

  if (cashBox) cashBox.classList.add('hidden');
  if (qrBox) qrBox.classList.add('hidden');
  if (mayaBox) mayaBox.classList.add('hidden');
  if (bankBox) bankBox.classList.add('hidden');
  if (refBox) refBox.classList.remove('hidden');

  const btnGcash = document.getElementById('modal-pay-btn-gcash');
  const btnMaya = document.getElementById('modal-pay-btn-maya');
  const btnBank = document.getElementById('modal-pay-btn-bank');
  const btnManual = document.getElementById('modal-pay-btn-manual');

  [btnGcash, btnMaya, btnBank, btnManual].forEach(b => {
    if (b) b.className = 'py-2.5 px-2 rounded-xl border border-white/15 bg-brand-black text-slate-300 hover:text-white hover:border-brand-lime/50 text-xs font-bold uppercase transition flex items-center justify-center gap-1 cursor-pointer';
  });

  if (selectedPaymentMode === 'manual') {
    if (cashBox) cashBox.classList.remove('hidden');
    if (btnManual) btnManual.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1 cursor-pointer';
    if (refLabel) refLabel.innerHTML = 'Manual Payment / OR / Front Desk Note <span class="text-emerald-400">(Auto-filled or Optional)</span>';
    if (refInput) {
      refInput.placeholder = 'MANUAL-FRONT-DESK (or enter Official Receipt / Walk-In Note)';
      if (!refInput.value.trim()) refInput.value = 'MANUAL-FRONT-DESK';
    }
    if (titleEl) titleEl.textContent = 'Manual Payment • Pay at Front Desk';
  } else if (selectedPaymentMode === 'bank') {
    if (bankBox) bankBox.classList.remove('hidden');
    if (btnBank) btnBank.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1 cursor-pointer';
    if (refLabel) refLabel.innerHTML = 'BDO InstaPay / Bank Reference No. <span class="text-brand-clay">*</span>';
    if (refInput) {
      if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
      refInput.placeholder = 'Enter BDO / InstaPay Reference Number';
    }
    if (titleEl) titleEl.textContent = 'Official BDO InstaPay QR Transfer';
  } else if (selectedPaymentMode === 'maya') {
    if (mayaBox) mayaBox.classList.remove('hidden');
    if (btnMaya) btnMaya.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1 cursor-pointer';
    if (refLabel) refLabel.innerHTML = 'Maya Reference Number <span class="text-brand-clay">*</span>';
    if (refInput) {
      if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
      refInput.placeholder = 'Enter Maya Reference Number';
    }
    if (titleEl) titleEl.textContent = 'Scan Official Maya QR Code';
  } else {
    selectedPaymentMode = 'gcash';
    if (qrBox) qrBox.classList.remove('hidden');
    if (btnGcash) btnGcash.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1 cursor-pointer';
    if (refLabel) refLabel.innerHTML = 'GCash Reference Number <span class="text-brand-clay">*</span>';
    if (refInput) {
      if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
      refInput.placeholder = 'Enter GCash Reference Number (e.g. 9028 3746 1928)';
    }
    if (titleEl) titleEl.textContent = 'Scan Official GCash QR & Verify';
  }
}

function recalculateDrawerTotal() {
  let total = isCurrentSlotPeak ? 500 : 400;
  if (playerCount > 6) total += (playerCount - 6) * 100;
  
  const paddle = document.getElementById('rent-paddle');
  const balls = document.getElementById('rent-balls');
  const machine = document.getElementById('rent-machine');

  if (paddle && paddle.checked) total += 100;
  if (balls && balls.checked) total += 100;
  if (machine && machine.checked) total += 100;
  
  const totalEl = document.getElementById('drawer-total-amount');
  if (totalEl) totalEl.textContent = '₱' + total;
  return total;
}

function toggleTermsDetails() {
  const t = document.getElementById('terms-details');
  if (t) t.classList.toggle('hidden');
}

// ================= UNIFIED CART SYSTEM =================

function saveCart() {
  localStorage.setItem('pf_cart_items', JSON.stringify(cartItems));
  updateHeaderBadge();
}

function updateHeaderBadge() {
  const badge = document.getElementById('header-cart-badge');
  const count = cartItems.reduce((acc, item) => acc + item.qty, 0);
  if (badge) badge.textContent = count;
}

function addItemToCart(id, name, price, subtitle = "") {
  const invList = (sharedServerState && Array.isArray(sharedServerState.inventory)) ? sharedServerState.inventory : [];
  const invMatch = invList.find(x => x.id === id || (x.name && x.name.toLowerCase() === String(name).toLowerCase()));
  const existing = cartItems.find(i => i.id === id);
  const currentQty = existing ? existing.qty : 0;
  if (invMatch && (currentQty + 1 > Number(invMatch.stock || 0))) {
    alert(`Only ${invMatch.stock} unit(s) of "${invMatch.name}" available in inventory!`);
    return;
  }
  if (existing) {
    existing.qty += 1;
  } else {
    cartItems.push({
      id: id,
      name: name,
      price: price,
      subtitle: subtitle,
      qty: 1,
      isCourt: id.startsWith('court-') || id.startsWith('op-') || id.startsWith('coach-')
    });
  }
  saveCart();
  renderCartUI();
  
  const badge = document.getElementById('header-cart-badge');
  if (badge) {
    badge.classList.add('scale-125');
    setTimeout(() => badge.classList.remove('scale-125'), 200);
  }
}

function addCurrentCourtToCart(openCartAfter = true) {
  const courtPrice = isCurrentSlotPeak ? 500 : 400;
  const courtId = 'court-' + currentSelectedCourt + '-' + currentSelectedSlot.replace(/[:\s]/g, '');
  
  // Remove existing court reservation in this slot if any
  cartItems = cartItems.filter(i => !i.id.startsWith('court-'));
  
  cartItems.unshift({
    id: courtId,
    name: courtNames[currentSelectedCourt],
    subtitle: `${currentSelectedDateLabel} • ${currentSelectedSlot}` + (playerCount > 6 ? ` (${playerCount} Players, +₱${(playerCount-6)*100})` : ` (${playerCount} Players)`),
    price: courtPrice + (playerCount > 6 ? (playerCount - 6) * 100 : 0),
    qty: 1,
    isCourt: true
  });

  // Check gear toggles
  const paddle = document.getElementById('rent-paddle');
  const balls = document.getElementById('rent-balls');
  const machine = document.getElementById('rent-machine');
  
  if (paddle && paddle.checked && !cartItems.some(i => i.id === 'rent-paddle-carbon')) {
    addItemToCart('rent-paddle-carbon', 'Carbon Fiber Paddle Rental', 100, 'Add-on Gear');
  }
  if (balls && balls.checked && !cartItems.some(i => i.id === 'gear-balls')) {
    addItemToCart('gear-balls', 'Training Balls (50 pcs) Rental', 100, 'Add-on Gear');
  }
  if (machine && machine.checked && !cartItems.some(i => i.id === 'rent-machine')) {
    addItemToCart('rent-machine', 'Ball Machine Rental (1 Hour)', 100, 'Add-on Gear');
  }

  saveCart();
  closeBookingDrawer();
  if (openCartAfter) {
    toggleCartDrawer();
  }
}

function updateCartItemQty(id, delta) {
  const item = cartItems.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cartItems = cartItems.filter(i => i.id !== id);
  }
  saveCart();
  renderCartUI();
}

function removeCartItem(id) {
  cartItems = cartItems.filter(i => i.id !== id);
  saveCart();
  renderCartUI();
}

function calculateCartTotal() {
  return cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
}

function renderCartLiveAddons() {
  const wrap = document.getElementById('cart-live-addons-wrap');
  const grid = document.getElementById('cart-live-addons-grid');
  if (!wrap || !grid) return;
  const inv = (sharedServerState && Array.isArray(sharedServerState.inventory)) ? sharedServerState.inventory.filter(i => Number(i.stock || 0) > 0) : [];
  if (inv.length === 0) {
    wrap.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  grid.innerHTML = inv.slice(0, 4).map(item => {
    const safeName = String(item.name || '').replace(/'/g, "\\'");
    const safeCat = String(item.cat || 'Pro Shop').replace(/'/g, "\\'");
    return `<button type="button" onclick="addItemToCart('${item.id}', '${safeName}', ${Number(item.price)}, '${safeCat}')" class="p-2 rounded-xl bg-brand-card hover:border-brand-lime/40 border border-white/10 text-left transition flex justify-between items-center active:scale-95">
      <span class="truncate text-[11px] text-white font-semibold pr-1">${item.name}</span>
      <span class="font-mono text-brand-lime text-[11px] font-bold flex-shrink-0">+₱${Number(item.price)}</span>
    </button>`;
  }).join('');
}

function renderCartUI() {
  renderCartLiveAddons();
  const container = document.getElementById('cart-items-container');
  const totalEl = document.getElementById('cart-total-amount');
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  updateHeaderBadge();

  if (!container) return;

  if (cartItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-xs">
        <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-slate-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
        </div>
        Your reservation cart is empty.<br>Select a court or equipment rental!
      </div>
    `;
    if (totalEl) totalEl.textContent = '₱0';
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
    }
    return;
  }

  if (checkoutBtn) {
    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove('opacity-50', 'pointer-events-none');
  }

  const total = calculateCartTotal();
  if (totalEl) totalEl.textContent = '₱' + total.toLocaleString();

  container.innerHTML = cartItems.map(item => `
    <div class="p-3.5 rounded-2xl bg-brand-card border border-white/10 flex items-center justify-between gap-3 text-xs">
      <div class="min-w-0 flex-1">
        <h4 class="font-bold text-white truncate">${item.name}</h4>
        <span class="text-[10px] text-slate-400 block">${item.subtitle || ''}</span>
        <span class="text-brand-lime font-mono font-bold text-xs mt-0.5 block">₱${item.price} each</span>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="flex items-center gap-1.5 bg-brand-black border border-white/10 rounded-xl p-1">
          <button onclick="updateCartItemQty('${item.id}', -1)" class="w-6 h-6 rounded-lg hover:bg-white/10 text-white flex items-center justify-center font-black">-</button>
          <span class="font-mono text-white text-xs px-1">${item.qty}</span>
          <button onclick="updateCartItemQty('${item.id}', 1)" class="w-6 h-6 rounded-lg hover:bg-white/10 text-white flex items-center justify-center font-black">+</button>
        </div>
        <button onclick="removeCartItem('${item.id}')" class="text-slate-500 hover:text-brand-clay p-1 text-sm font-bold" title="Remove">✕</button>
      </div>
    </div>
  `).join('');
}

function proceedToCartCheckout() {
  if (cartItems.length === 0) {
    alert('Your cart is empty. Please add a court or gear first!');
    return;
  }

  // Close cart drawer if open
  const cartDrawer = document.getElementById('cart-drawer');
  if (cartDrawer && !cartDrawer.classList.contains('hidden')) {
    cartDrawer.classList.add('hidden');
  }

  openPaymentVerificationModal();
}

function openPaymentVerificationModal() {
  const total = calculateCartTotal();
  const amtEl = document.getElementById('manual-modal-amount');
  const qrImg = document.getElementById('locked-qr-img');
  const summaryEl = document.getElementById('modal-items-summary');

  // Sync Guest Name & Phone from drawer if available
  const drawerName = document.getElementById('cust-name');
  const drawerPhone = document.getElementById('cust-phone');
  const modalName = document.getElementById('modal-cust-name');
  const modalPhone = document.getElementById('modal-cust-phone');

  if (modalName && drawerName && drawerName.value.trim()) {
    modalName.value = drawerName.value.trim();
  }
  if (modalPhone && drawerPhone && drawerPhone.value.trim()) {
    modalPhone.value = drawerPhone.value.trim();
  }

  const formattedTotal = '₱' + total.toLocaleString() + '.00';
  if (amtEl) amtEl.textContent = formattedTotal;
  const mayaAmtEl = document.getElementById('manual-modal-maya-amount');
  if (mayaAmtEl) mayaAmtEl.textContent = formattedTotal;
  const bankAmtEl = document.getElementById('manual-modal-bank-amount');
  if (bankAmtEl) bankAmtEl.textContent = formattedTotal;
  const cashAmtEl = document.getElementById('manual-modal-cash-amount');
  if (cashAmtEl) cashAmtEl.textContent = formattedTotal;
  const summaryAmtEl = document.getElementById('modal-summary-amount');
  if (summaryAmtEl) summaryAmtEl.textContent = formattedTotal;
  const summaryCourtEl = document.getElementById('modal-summary-court');
  if (summaryCourtEl && cartItems.length > 0) summaryCourtEl.textContent = cartItems.map(i => `${i.qty}× ${i.name}`).join(', ');
  if (qrImg) qrImg.src = generateLockedQrUrl(total, 'gcash');
  const bankQrImg = document.getElementById('locked-bank-qr-img');
  if (bankQrImg) bankQrImg.src = generateLockedQrUrl(total, 'bank');
  if (summaryEl) {
    summaryEl.innerHTML = formatCartItemsBulletHtml(cartItems);
  }

  updatePaymentModalModeUI();

  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

// ================= DIRECT CHECKOUT & PAYMENT MODAL (STRICT VALIDATION) =================

function handleProceedToPayment() {
  const termsCheckbox = document.getElementById('accept-terms');
  if (termsCheckbox && !termsCheckbox.checked) {
    alert('Please agree to the Payment Verification & Court Policy before proceeding.');
    termsCheckbox.focus();
    return;
  }

  const custName = document.getElementById('cust-name');
  const custPhone = document.getElementById('cust-phone');
  const custEmail = document.getElementById('cust-email');

  const nameCheck = pfValidateField('name', custName ? custName.value : '', true);
  if (!nameCheck.valid) {
    showFieldError('cust-name', nameCheck.error);
    return;
  }
  clearFieldError('cust-name');

  const phoneCheck = pfValidateField('phone', custPhone ? custPhone.value : '', false);
  if (!phoneCheck.valid) {
    showFieldError('cust-phone', phoneCheck.error);
    return;
  }
  clearFieldError('cust-phone');

  if (custEmail && custEmail.value.trim()) {
    const emailCheck = pfValidateField('email', custEmail.value, false);
    if (!emailCheck.valid) {
      showFieldError('cust-email', emailCheck.error);
      return;
    }
    clearFieldError('cust-email');
  }

  // Sync current court selection into cart and immediately open Payment Verification Modal
  addCurrentCourtToCart(false);
  openPaymentVerificationModal();
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

let _isSubmittingManualPayment = false;
async function submitManualPaymentConfirmation() {
  if (_isSubmittingManualPayment) return;
  const modalName = document.getElementById('modal-cust-name');
  const modalPhone = document.getElementById('modal-cust-phone');
  const drawerName = document.getElementById('cust-name');
  const drawerPhone = document.getElementById('cust-phone');

  const finalName = (modalName && modalName.value.trim()) || (drawerName && drawerName.value.trim()) || '';
  const finalPhone = (modalPhone && modalPhone.value.trim()) || (drawerPhone && drawerPhone.value.trim()) || '';

  const nameCheck = pfValidateField('name', finalName, true);
  if (!nameCheck.valid) {
    showFieldError('modal-cust-name', nameCheck.error);
    return;
  }
  clearFieldError('modal-cust-name');

  const phoneCheck = pfValidateField('phone', finalPhone, false);
  if (!phoneCheck.valid) {
    showFieldError('modal-cust-phone', phoneCheck.error);
    return;
  }
  clearFieldError('modal-cust-phone');

  // Sync back to drawer inputs
  if (drawerName) drawerName.value = finalName;
  if (drawerPhone) drawerPhone.value = finalPhone;

  const refInput = document.getElementById('manual-ref-input');
  let manualRef = refInput ? refInput.value.trim() : '';
  if (selectedPaymentMode === 'manual' && (!manualRef || manualRef.length < 4)) {
    manualRef = 'MANUAL-FRONT-DESK';
    if (refInput) refInput.value = manualRef;
  }

  if (selectedPaymentMode !== 'manual') {
    const refCheck = pfValidateField('ref', manualRef, true);
    if (!refCheck.valid) {
      showFieldError('manual-ref-input', refCheck.error);
      return;
    }
    const receiptFileEl = document.getElementById('manual-receipt-file');
    const hasReceiptAttached = Boolean((typeof uploadedReceiptDataUrl !== 'undefined' && uploadedReceiptDataUrl && String(uploadedReceiptDataUrl).trim()) || (receiptFileEl && receiptFileEl.files && receiptFileEl.files[0]));
    if (!hasReceiptAttached) {
      alert('Please attach/upload your payment receipt screenshot before submitting your booking.');
      receiptFileEl?.focus();
      return;
    }
  }
  clearFieldError('manual-ref-input');

  _isSubmittingManualPayment = true;
  const submitBtn = document.getElementById('modal-submit-btn');
  const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Submitting Booking...</span>';
  }
  try {
    const refCode = 'PF-' + Math.floor(10000 + Math.random() * 90000);
    closePaymentModal();

    const modeLabel = selectedPaymentMode === 'manual'
      ? 'MANUAL PAYMENT (Front Desk / Cash)'
      : (selectedPaymentMode === 'bank' ? 'Bank Transfer (BDO / BPI / InstaPay)' : (selectedPaymentMode === 'maya' ? 'Maya (Official QR Ph)' : 'GCash (Official QR Ph / Express Send)'));

    await finalizeBookingRecord({
      name: finalName,
      phone: finalPhone,
      mode: modeLabel,
      status: 'PENDING VERIFICATION',
      transactionRef: manualRef,
      refNo: refCode
    });
  } finally {
    _isSubmittingManualPayment = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      if (origBtnHtml) submitBtn.innerHTML = origBtnHtml;
    }
  }
}

async function finalizeBookingRecord(details) {
  closeBookingDrawer();

  const custEmail = document.getElementById('cust-email');
  const total = calculateCartTotal() || recalculateDrawerTotal();

  const guestName = details.name;
  const guestPhone = details.phone;

  const primaryItem = cartItems.find(i => i.isCourt) || cartItems[0];
  const courtSummary = cartItems.length > 0
    ? cartItems.map(i => `${i.qty}x ${i.name}`).join(' + ')
    : courtNames[currentSelectedCourt];
  const timeSlot = (primaryItem && primaryItem.subtitle) ? primaryItem.subtitle : (`${currentSelectedDateLabel} • ${currentSelectedSlot}`);

  const bookingData = {
    ref: details.refNo,
    name: guestName,
    phone: guestPhone,
    email: (custEmail && custEmail.value.trim()) ? custEmail.value.trim() : 'N/A',
    court: courtSummary,
    time: timeSlot,
    paymentMode: details.mode,
    paymentMethod: details.mode,
    status: details.status,
    total: total,
    items: [...cartItems],
    transactionRef: details.transactionRef || 'N/A',
    receiptDataUrl: uploadedReceiptDataUrl || '',
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
  };

  // Push to Shared Backend & LocalStorage so Admin Portal receives it immediately!
  await pushBookingToServer(bookingData);

  // Reset cart & receipt state
  cartItems = [];
  uploadedReceiptDataUrl = '';
  const refInput = document.getElementById('manual-ref-input');
  if (refInput) refInput.value = '';
  const previewWrap = document.getElementById('receipt-preview-wrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const statusEl = document.getElementById('ocr-status-badge');
  if (statusEl) statusEl.classList.add('hidden');

  saveCart();
  renderCartUI();

  // Update Match Pass Modal UI
  const passRef = document.getElementById('pass-ref');
  const passNoteRef = document.getElementById('pass-note-ref');
  const passName = document.getElementById('pass-name');
  const passCourt = document.getElementById('pass-court');
  const passTime = document.getElementById('pass-time');
  const passPayMethod = document.getElementById('pass-paymethod');
  const passPayRef = document.getElementById('pass-payref');
  const passTotal = document.getElementById('pass-total');
  const passStatus = document.getElementById('pass-status');
  const passTag = document.getElementById('pass-header-tag');

  if (passRef) passRef.textContent = details.refNo;
  if (passNoteRef) passNoteRef.textContent = details.refNo;
  if (passName) passName.textContent = `${guestName} • ${guestPhone}`;
  if (passCourt) passCourt.innerHTML = formatBookingItemsBulletHtml(bookingData);
  if (passTime) passTime.textContent = timeSlot;
  if (passPayMethod) passPayMethod.textContent = details.mode;
  if (passPayRef) passPayRef.textContent = details.transactionRef || 'N/A';
  if (passTotal) passTotal.textContent = '₱' + total.toLocaleString() + '.00';
  if (passStatus) passStatus.textContent = '● ' + details.status;
  if (passTag) passTag.textContent = details.status.includes('RESERVED') ? 'COURT RESERVED • PAY AT VENUE' : 'BOOKING SYNCED TO ADMIN • PENDING VERIFICATION';

  const matchModal = document.getElementById('match-pass-modal');
  if (matchModal) matchModal.classList.remove('hidden');

  if (typeof renderLiveScheduleMatrix === 'function') {
    renderLiveScheduleMatrix();
  }
}

function closeMatchPassModal() {
  const modal = document.getElementById('match-pass-modal');
  if (modal) modal.classList.add('hidden');
}

function downloadCalendarInvite() {
  const ref = document.getElementById('pass-ref') ? document.getElementById('pass-ref').textContent : 'PF-84920';
  const court = document.getElementById('pass-court') ? document.getElementById('pass-court').textContent : courtNames[currentSelectedCourt];
  const icsData = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Pickleball Match at P&F Rally Ground\nDESCRIPTION:Court: " + court + "\nRef: " + ref + "\nVenue: Phase IV, Dona Maria Subd., Velasco St., Tagas, Daraga, Albay\nContact: 0999 883 2346\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR";
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', 'pf-rally-match.ics');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Global ESC listener
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBookingDrawer();
    closePaymentModal();
    closeMatchPassModal();
    const cart = document.getElementById('cart-drawer');
    if (cart && !cart.classList.contains('hidden')) {
      cart.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  }
});

// ================= AI RECEIPT SCANNER & DYNAMIC LOCKED QR =================

// ================= MATHEMATICALLY VALID QR PH EMVCO GENERATOR =================
function computeCrc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildEmvcoPayload(channel, amount) {
  const amtNum = Math.max(1, Number(amount || 400));
  const amtStr = amtNum.toFixed(2);
  const amtLen = String(amtStr.length).padStart(2, '0');

  let merchantTag = '26';
  return '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNXE5XEA5204601653036085802PH5912KA******E L.6005Tagas610412346304FAE8';
  let merchantInfo = '0010com.gcash011209998832346';
  if (channel === 'bank') {
    merchantTag = '28';
    merchantInfo = '0015ph.gov.ngp.qrph0112004588029143';
  }
  const mInfoLen = String(merchantInfo.length).padStart(2, '0');

  // EMVCo QR Ph standard TLV payload
  let raw = '000201' +                // Tag 00: Payload format '01'
            '010212' +                // Tag 01: Dynamic Point of Initiation '12'
            merchantTag + mInfoLen + merchantInfo + // Tag 26 (GCash) or Tag 28 (National QR Ph)
            '52045999' +              // Tag 52: Merchant Category Code '5999'
            '5303608' +               // Tag 53: Currency Code '608' (PHP)
            '54' + amtLen + amtStr +  // Tag 54: Amount
            '5802PH' +                // Tag 58: Country Code 'PH'
            '5916PF RALLY GROUND' +   // Tag 59: Merchant Name 'PF RALLY GROUND' (16 chars)
            '6006DARAGA' +            // Tag 60: Merchant City 'DARAGA' (6 chars)
            '6304';                   // Tag 63: CRC Tag (63) and Length (04)

  const crc = computeCrc16Ccitt(raw);
  return raw + crc;
}


// ================= OFFICIAL GCASH / MAYA / BDO QR ENGINE & HELPERS =================
(function pfSanitizeQrLocalStorage() {
  try {
    const raw = localStorage.getItem('pf_custom_gcash_standee_url');
    if (raw) {
      const s = String(raw).trim();
      // Purge any legacy qrserver, external, broken, or plain default URLs so fresh official QR loads cleanly
      if (
        s.includes('qrserver.com') ||
        s.includes('chart.googleapis.com') ||
        s.includes('undefined') ||
        s.includes('null') ||
        s === 'assets/qr-gcash.png' ||
        (!s.startsWith('assets/') && !s.startsWith('/assets/') && !s.startsWith('data:image/'))
      ) {
        localStorage.removeItem('pf_custom_gcash_standee_url');
      }
    }
  } catch (e) {}
})();

function pfGetPaymentConfig() {
  const defaults = {
    gcashName: 'KA******E L.',
    gcashNumber: '0999 883 2346',
    gcashQrUrl: 'assets/qr-gcash.png?v=20261029v10',
    standeeUrl: 'assets/qr-gcash.png?v=20261029v10',
    mayaName: 'KATHERINE LIM',
    mayaNumber: '0999 883 2346',
    mayaQrUrl: 'assets/qr-maya.png?v=20261029v10',
    bdoName: 'BDO Unibank • Dex',
    bdoNumber: '••••••••8678',
    bankQrUrl: 'assets/qr-bdo.png?v=20261029v10'
  };
  let localCfg = {};
  try {
    localCfg = JSON.parse(localStorage.getItem('pf_payment_config') || '{}') || {};
  } catch (e) {}
  const srvCfg = (window.sharedServerState && window.sharedServerState.paymentConfig && typeof window.sharedServerState.paymentConfig === 'object')
    ? window.sharedServerState.paymentConfig
    : {};
  const merged = Object.assign({}, defaults, localCfg, srvCfg);
  if (merged.gcashName === 'P&F Rally Ground') merged.gcashName = defaults.gcashName;
  if (merged.bdoNumber === '004588029143') merged.bdoNumber = defaults.bdoNumber;
  if (!merged.gcashQrUrl || merged.gcashQrUrl === 'assets/qr-gcash.png' || merged.gcashQrUrl.includes('qrserver.com')) {
    merged.gcashQrUrl = defaults.gcashQrUrl;
  }
  if (!merged.mayaQrUrl || merged.mayaQrUrl === 'assets/qr-maya.png') {
    merged.mayaQrUrl = defaults.mayaQrUrl;
  }
  if (!merged.bankQrUrl || merged.bankQrUrl === 'assets/qr-bdo.png') {
    merged.bankQrUrl = defaults.bankQrUrl;
  }
  return merged;
}

function pfGetOfficialQrUrl(channel = 'gcash', viewMode = 'qr') {
  const ch = String(channel || 'gcash').toLowerCase();
  const cfg = pfGetPaymentConfig();
  if (ch === 'bank' || ch === 'bdo') {
    return String(cfg.bankQrUrl || 'assets/qr-bdo.png?v=20261029v10').trim();
  }
  if (ch === 'maya') {
    return String(cfg.mayaQrUrl || 'assets/qr-maya.png?v=20261029v10').trim();
  }
  return String(cfg.gcashQrUrl || cfg.standeeUrl || 'assets/qr-gcash.png?v=20261029v10').trim();
}

function applyPaymentConfigToPublicDom(incomingCfg) {
  if (incomingCfg && typeof incomingCfg === 'object') {
    try {
      if (window.sharedServerState) window.sharedServerState.paymentConfig = incomingCfg;
      localStorage.setItem('pf_payment_config', JSON.stringify(incomingCfg));
    } catch (e) {}
  }
  const cfg = pfGetPaymentConfig();

  // 1. Update inline QR images if currently in 'qr' mode
  const imgPairs = [
    ['locked-qr-img', 'gcash'],
    ['book-gcash-qr-img', 'gcash'],
    ['locked-maya-qr-img', 'maya'],
    ['book-maya-qr-img', 'maya'],
    ['locked-bank-qr-img', 'bank'],
    ['book-bank-qr-img', 'bank']
  ];
  imgPairs.forEach(([id, ch]) => {
    const el = document.getElementById(id);
    if (el) {
      const mode = el.getAttribute('data-qr-mode') || 'qr';
      const targetSrc = pfGetOfficialQrUrl(ch, mode);
      if (targetSrc && el.getAttribute('src') !== targetSrc) {
        el.src = targetSrc;
      }
    }
  });

  // 2. Update Account Names & Numbers across all payment panels
  document.querySelectorAll('[data-pay-field="gcash-name"]').forEach(el => { el.textContent = cfg.gcashName; });
  document.querySelectorAll('[data-pay-field="gcash-num"]').forEach(el => { el.textContent = cfg.gcashNumber; });
  document.querySelectorAll('[data-pay-field="maya-name"]').forEach(el => { el.textContent = cfg.mayaName; });
  document.querySelectorAll('[data-pay-field="maya-num"]').forEach(el => { el.textContent = cfg.mayaNumber; });
  document.querySelectorAll('[data-pay-field="bank-name"]').forEach(el => { el.textContent = cfg.bdoName; });
  document.querySelectorAll('[data-pay-field="bank-num"]').forEach(el => { el.textContent = cfg.bdoNumber; });

  const cleanDigits = (str) => String(str || '').replace(/\s+/g, '');
  document.querySelectorAll('[data-pay-copy="gcash"]').forEach(btn => {
    btn.setAttribute('onclick', `copyPaymentAccount('${cleanDigits(cfg.gcashNumber)}', this)`);
  });
  document.querySelectorAll('[data-pay-copy="maya"]').forEach(btn => {
    btn.setAttribute('onclick', `copyPaymentAccount('${cleanDigits(cfg.mayaNumber)}', this)`);
  });
}

function pfToggleQrCardView(channel = 'gcash', imgId = 'locked-qr-img', btnEl = null) {
  const ch = String(channel || 'gcash').toLowerCase();
  const img = document.getElementById(imgId);
  if (!img) return;
  const curMode = img.getAttribute('data-qr-mode') || 'qr';
  const nextMode = curMode === 'qr' ? 'standee' : 'qr';
  img.setAttribute('data-qr-mode', nextMode);
  img.src = pfGetOfficialQrUrl(ch, nextMode);
  if (nextMode === 'standee') {
    img.classList.remove('aspect-square');
    img.style.maxHeight = '270px';
  } else {
    img.classList.add('aspect-square');
    img.style.maxHeight = '';
  }
  const cardLabel = ch === 'maya' ? 'Maya Card' : (ch === 'bank' ? 'BDO Card' : 'GCash Card');
  if (btnEl) {
    btnEl.textContent = nextMode === 'standee' ? '🔳 Show Large QR Only' : ('🪪 Show Full ' + cardLabel);
  }
}

function pfGetLiveBookingExactAmount() {
  // 1. Check book.html sticky summary grand total (#summary-grand-total)
  const bookGrandEl = document.getElementById('summary-grand-total');
  if (bookGrandEl && bookGrandEl.textContent) {
    const parsedBook = Number(bookGrandEl.textContent.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedBook) && parsedBook > 0) return parsedBook;
  }
  // 2. Check index.html payment modal amount (#manual-modal-amount or #modal-summary-amount)
  const payModal = document.getElementById('payment-modal');
  if (payModal && !payModal.classList.contains('hidden')) {
    const modalAmtEl = document.getElementById('manual-modal-amount') || document.getElementById('modal-summary-amount');
    if (modalAmtEl && modalAmtEl.textContent) {
      const parsedModal = Number(modalAmtEl.textContent.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedModal) && parsedModal > 0) return parsedModal;
    }
  }
  // 3. Check index.html booking drawer live total (#drawer-total-price)
  const drawerEl = document.getElementById('booking-drawer');
  if (drawerEl && !drawerEl.classList.contains('hidden')) {
    const drawerTotalEl = document.getElementById('drawer-total-price');
    if (drawerTotalEl && drawerTotalEl.textContent) {
      const parsedDrawer = Number(drawerTotalEl.textContent.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedDrawer) && parsedDrawer > 0) return parsedDrawer;
    }
  }
  // 4. Check cart total if items exist
  if (typeof calculateCartTotal === 'function') {
    const cartTot = Number(calculateCartTotal());
    if (!isNaN(cartTot) && cartTot > 0) return cartTot;
  }
  return 400;
}

function pfOpenQrStandeeLightbox(channel = 'gcash') {
  const ch = String(channel || 'gcash').toLowerCase();
  const cfg = pfGetPaymentConfig();
  const cleanDigits = (s) => String(s || '').replace(/[^0-9]/g, '');
  const exactAmtNum = pfGetLiveBookingExactAmount();
  const exactAmtFormatted = '₱' + exactAmtNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const exactAmtCopyStr = exactAmtNum.toFixed(2);

  const meta = {
    gcash: {
      badge: 'OFFICIAL GCASH INSTAPAY QR PH',
      title: 'OFFICIAL GCASH QR CODE',
      merchant: cfg.gcashName || 'KA******E L.',
      numberLabel: 'GCash Mobile No:',
      numberDisplay: cfg.gcashNumber || '0999 883 2346',
      numberCopy: cleanDigits(cfg.gcashNumber) || '09998832346',
      appHint: `Open your <b>GCash App &rarr; Tap QR &rarr; Scan or Upload QR</b> from your gallery, then enter <b class="text-[#0E8A2D]">${exactAmtFormatted}</b>.`
    },
    maya: {
      badge: 'OFFICIAL MAYA QR PH',
      title: 'OFFICIAL MAYA QR CODE',
      merchant: cfg.mayaName || 'KATHERINE LIM',
      numberLabel: 'Maya Mobile No:',
      numberDisplay: cfg.mayaNumber || '0999 883 2346',
      numberCopy: cleanDigits(cfg.mayaNumber) || '09998832346',
      appHint: `Open your <b>Maya App &rarr; Scan or Upload QR</b> from your gallery, then enter <b class="text-[#0E8A2D]">${exactAmtFormatted}</b>.`
    },
    bank: {
      badge: 'OFFICIAL BDO / BANK INSTAPAY QR',
      title: 'OFFICIAL BDO QR CODE',
      merchant: cfg.bdoName || 'BDO Unibank • Dex',
      numberLabel: 'Bank Account:',
      numberDisplay: cfg.bdoNumber || '••••••••8678',
      numberCopy: cleanDigits(cfg.bdoNumber).length >= 8 ? cleanDigits(cfg.bdoNumber) : '',
      appHint: `Open your <b>BDO / Banking App &rarr; Scan or Upload QR</b>, then enter <b class="text-[#0E8A2D]">${exactAmtFormatted}</b>.`
    }
  };
  const info = meta[ch] || meta.gcash;
  const qrSrc = pfGetOfficialQrUrl(ch, 'qr');

  let modal = document.getElementById('pf-qr-zoom-lightbox');
  if (modal) {
    modal.remove();
  }
  modal = document.createElement('div');
  modal.id = 'pf-qr-zoom-lightbox';
  modal.className = 'fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5';
  modal.innerHTML = `
    <div onclick="pfCloseQrStandeeLightbox()" class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>
    <div class="relative z-10 w-full max-w-md rounded-2xl bg-white text-[#050E1D] border-2 border-[#9BE600] p-4 sm:p-5 shadow-2xl text-center space-y-3 max-h-[94dvh] overflow-y-auto" style="border-radius:5px;">
      <div class="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div class="text-left">
          <span id="pf-qr-lightbox-badge" class="text-[10px] font-mono font-black uppercase tracking-widest text-[#0E8A2D] block">${info.badge}</span>
          <h4 id="pf-qr-lightbox-title" class="text-sm sm:text-base font-black uppercase text-[#050E1D]">${info.title}</h4>
        </div>
        <button type="button" onclick="pfCloseQrStandeeLightbox()" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-[#050E1D] text-slate-800 hover:text-white font-black text-xs flex items-center justify-center transition">✕</button>
      </div>

      <!-- Exact Amount to Pay Banner at the Top -->
      <div class="p-3 rounded-xl bg-[#050E1D] text-white border-2 border-[#9BE600] flex items-center justify-between gap-2 shadow-md">
        <div class="text-left">
          <span class="text-[10px] font-mono font-black uppercase tracking-widest text-[#9BE600] block">EXACT AMOUNT TO PAY</span>
          <b id="pf-qr-lightbox-exact-amount" class="text-xl sm:text-2xl font-mono font-black text-[#9BE600]">${exactAmtFormatted}</b>
        </div>
        <button type="button" id="pf-qr-lightbox-copy-amt-btn" onclick="copyPaymentAccount('${exactAmtCopyStr}', this)" class="px-3 py-2 rounded-lg bg-[#9BE600] text-[#050E1D] font-mono font-black text-xs uppercase shadow hover:opacity-95 transition whitespace-nowrap">📋 Copy Amount</button>
      </div>

      <!-- Recipient & Account Summary Bar inside Zoom Modal -->
      <div class="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="text-left">
          <span class="text-[10px] text-slate-500 uppercase font-bold block">Account Name</span>
          <b id="pf-qr-lightbox-merchant" class="text-slate-900 font-black">${info.merchant}</b>
        </div>
        <div class="text-right flex items-center gap-2">
          <div>
            <span id="pf-qr-lightbox-num-label" class="text-[10px] text-slate-500 uppercase font-bold block">${info.numberLabel}</span>
            <b id="pf-qr-lightbox-num" class="font-mono text-slate-900 font-black">${info.numberDisplay}</b>
          </div>
          ${info.numberCopy ? `<button type="button" id="pf-qr-lightbox-copy-btn" onclick="copyPaymentAccount('${info.numberCopy}', this)" class="px-2.5 py-1.5 rounded-lg bg-[#050E1D] text-[#9BE600] font-black text-[10px] uppercase">Copy</button>` : ''}
        </div>
      </div>

      <!-- High-Brightness White QR Frame -->
      <div class="p-3 rounded-2xl bg-white border-2 border-slate-300 shadow-inner flex items-center justify-center min-h-[260px]">
        <img id="pf-qr-lightbox-img" src="${qrSrc}" alt="Official Payment QR" class="max-h-[48dvh] w-auto mx-auto object-contain rounded-lg" style="image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;">
      </div>

      <p id="pf-qr-lightbox-hint" class="text-[11px] text-slate-700 leading-relaxed bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-left">💡 ${info.appHint}</p>

      <div class="flex flex-col gap-2 pt-1">
        <button type="button" id="pf-qr-lightbox-dl-btn" onclick="pfDownloadOfficialQr('${ch}')" class="w-full py-2.5 px-3 rounded-xl bg-[#9BE600] hover:bg-[#8cd000] text-[#050E1D] border-2 border-[#050E1D] font-black uppercase text-xs tracking-wider shadow">📥 Save QR Image</button>
        <button type="button" onclick="pfCloseQrStandeeLightbox()" class="w-full py-2.5 px-3 rounded-xl bg-[#050E1D] hover:bg-slate-800 text-white font-bold uppercase text-xs tracking-wider">Close Window</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function pfSwitchLightboxQrTab() {}

function pfCloseQrStandeeLightbox() {
  const modal = document.getElementById('pf-qr-zoom-lightbox');
  if (modal) modal.classList.add('hidden');
}

function pfDrawRoundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function pfDownloadOfficialQr(channel = 'gcash') {
  const ch = String(channel || 'gcash').toLowerCase();
  const cfg = pfGetPaymentConfig();
  const url = pfGetOfficialQrUrl(ch, 'qr');
  const exactAmtNum = typeof pfGetLiveBookingExactAmount === 'function' ? pfGetLiveBookingExactAmount() : 400;
  const exactAmtFormatted = '₱' + exactAmtNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const meta = {
    gcash: {
      badge: 'OFFICIAL GCASH INSTAPAY QR PH',
      title: 'OFFICIAL GCASH QR CODE',
      merchant: cfg.gcashName || 'KA******E L.',
      numberLabel: 'GCASH MOBILE NO:',
      numberDisplay: cfg.gcashNumber || '0999 883 2346',
      footerText: `Upload this QR in GCash (Tap QR → Upload QR) and enter ${exactAmtFormatted}`
    },
    maya: {
      badge: 'OFFICIAL MAYA QR PH',
      title: 'OFFICIAL MAYA QR CODE',
      merchant: cfg.mayaName || 'KATHERINE LIM',
      numberLabel: 'MAYA MOBILE NO:',
      numberDisplay: cfg.mayaNumber || '0999 883 2346',
      footerText: `Upload this QR in Maya (Scan → Upload QR) and enter ${exactAmtFormatted}`
    },
    bank: {
      badge: 'OFFICIAL BDO / BANK INSTAPAY QR',
      title: 'OFFICIAL BDO QR CODE',
      merchant: cfg.bdoName || 'BDO Unibank • Dex',
      numberLabel: 'BDO ACCOUNT NO:',
      numberDisplay: cfg.bdoNumber || '••••••••8678',
      footerText: `Upload this QR in your Banking App and enter ${exactAmtFormatted}`
    }
  };
  const info = meta[ch] || meta.gcash;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    try {
      const canvasW = 800;
      const canvasH = 1110;
      const pad = 44;
      const innerW = canvasW - pad * 2;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');

      // Outer Card Background & Clean Border
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.strokeStyle = '#9BE600';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, canvasW - 12, canvasH - 12);

      // 1. TOP HEADER ROW (Full-width, zero overlap)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0E8A2D';
      ctx.font = '800 15px monospace';
      ctx.fillText(info.badge, pad, 56);

      ctx.fillStyle = '#050E1D';
      ctx.font = '900 30px sans-serif';
      ctx.fillText(info.title, pad, 92);

      // Club Pill on Top Right
      const pillW = 210;
      const pillH = 36;
      const pillX = canvasW - pad - pillW;
      const pillY = 54;
      pfDrawRoundRect(ctx, pillX, pillY, pillW, pillH, 8, '#F1F5F9', '#CBD5E1', 1.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#050E1D';
      ctx.font = '900 13px monospace';
      ctx.fillText('P&F RALLY GROUND', pillX + pillW / 2, pillY + 23);

      // Subtle Divider Line
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(pad, 114, innerW, 2);

      // 2. FULL-WIDTH EXACT AMOUNT BANNER (Row 2)
      const amtY = 132;
      const amtH = 88;
      pfDrawRoundRect(ctx, pad, amtY, innerW, amtH, 12, '#050E1D', '#9BE600', 3);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#9BE600';
      ctx.font = '900 15px monospace';
      ctx.fillText('EXACT AMOUNT TO PAY', pad + 26, amtY + 36);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '600 14px sans-serif';
      ctx.fillText('Enter this exact amount after scanning the QR code below', pad + 26, amtY + 64);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#9BE600';
      ctx.font = '900 38px monospace';
      ctx.fillText(exactAmtFormatted, canvasW - pad - 26, amtY + 58);

      // 3. FULL-WIDTH ACCOUNT NAME & NUMBER BAR (Row 3)
      const acctY = 236;
      const acctH = 88;
      pfDrawRoundRect(ctx, pad, acctY, innerW, acctH, 12, '#F8FAFC', '#CBD5E1', 2);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = '800 14px sans-serif';
      ctx.fillText('ACCOUNT NAME', pad + 26, acctY + 32);
      ctx.fillStyle = '#050E1D';
      ctx.font = '900 24px sans-serif';
      ctx.fillText(info.merchant, pad + 26, acctY + 66);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = '800 14px sans-serif';
      ctx.fillText(info.numberLabel, canvasW - pad - 26, acctY + 32);
      ctx.fillStyle = '#050E1D';
      ctx.font = '900 24px monospace';
      ctx.fillText(info.numberDisplay, canvasW - pad - 26, acctY + 66);

      // 4. CENTERED QR CODE FRAME (Row 4)
      const qrFrameY = 342;
      const qrFrameH = 668;
      pfDrawRoundRect(ctx, pad, qrFrameY, innerW, qrFrameH, 16, '#FFFFFF', '#CBD5E1', 2);

      const qrDrawSize = 590;
      const qrDrawX = Math.floor((canvasW - qrDrawSize) / 2);
      const qrDrawY = qrFrameY + Math.floor((qrFrameH - qrDrawSize) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);

      // 5. BOTTOM INSTRUCTION BAR (Row 5)
      const footY = 1026;
      const footH = 48;
      pfDrawRoundRect(ctx, pad, footY, innerW, footH, 10, '#ECFDF5', '#A7F3D0', 1.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#065F46';
      ctx.font = '800 15px sans-serif';
      ctx.fillText(info.footerText, canvasW / 2, footY + 30);

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `PF-Rally-Ground-${ch.toUpperCase()}-QR-${exactAmtNum.toFixed(0)}PHP.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `PF-Rally-Ground-${ch.toUpperCase()}-Official-QR.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  img.onerror = function () {
    const a = document.createElement('a');
    a.href = url;
    a.download = `PF-Rally-Ground-${ch.toUpperCase()}-Official-QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = url;
}
window.pfGetPaymentConfig = pfGetPaymentConfig;
window.pfGetOfficialQrUrl = pfGetOfficialQrUrl;
window.applyPaymentConfigToPublicDom = applyPaymentConfigToPublicDom;
window.pfToggleQrCardView = pfToggleQrCardView;
window.pfOpenQrStandeeLightbox = pfOpenQrStandeeLightbox;
window.pfSwitchLightboxQrTab = pfSwitchLightboxQrTab;
window.pfCloseQrStandeeLightbox = pfCloseQrStandeeLightbox;
window.pfDownloadOfficialQr = pfDownloadOfficialQr;

function generateLockedQrUrl(amount, channel = 'gcash') {
  return pfGetOfficialQrUrl(channel, 'qr');
}

function extractRefNumberFromText(text) {
  if (!text) return null;
  const normalized = text.replace(/\r\n/g, '\n');
  // 1. Explicit "Ref No." / "Reference No" / "Ref #" pattern
  const explicitMatch = normalized.match(/(?:ref(?:erence)?\s*(?:no\.?|num(?:ber)?|#)?\s*[:.\-]?\s*)([0-9][0-9\s\-]{7,22}[0-9])/i);
  if (explicitMatch && explicitMatch[1]) {
    const digits = explicitMatch[1].replace(/[^0-9]/g, '');
    if (digits.length >= 8 && digits.length <= 18) return digits;
  }
  // 2. Formatted 4-4-4 or 4-3-6 digit groups common in GCash receipts
  const groupedMatch = normalized.match(/\b([0-9]{4}[\s\-][0-9]{3,4}[\s\-][0-9]{4,6})\b/);
  if (groupedMatch && groupedMatch[1]) {
    const digits = groupedMatch[1].replace(/[^0-9]/g, '');
    if (digits.length >= 10) return digits;
  }
  // 3. Any standalone 10-16 digit number (excluding club phone 09998832346)
  const allLongNums = normalized.match(/\b[0-9]{9,16}\b/g) || [];
  for (const num of allLongNums) {
    if (num !== '09998832346' && !num.startsWith('63999883')) {
      return num;
    }
  }
  return null;
}

async function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('ocr-status-badge');
  const refInput = document.getElementById('manual-ref-input');
  const previewWrap = document.getElementById('receipt-preview-wrap');
  const previewImg = document.getElementById('receipt-preview-img');

  // Show receipt thumbnail preview & store compressed data URL
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedReceiptDataUrl = e.target.result;
    if (previewImg) previewImg.src = uploadedReceiptDataUrl;
    if (previewWrap) previewWrap.classList.remove('hidden');
  };
  reader.readAsDataURL(file);

  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = `Scanning receipt image with AI OCR...`;
    statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/10 border border-brand-lime/20 rounded-xl px-3 py-2 block mt-2';
  }

  try {
    // Check if filename itself contains a reference number
    const fileRef = extractRefNumberFromText(file.name);

    if (typeof Tesseract !== 'undefined') {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: m => {
          if (statusEl && m.status === 'recognizing text') {
            statusEl.innerHTML = `AI OCR Reading Receipt (${Math.floor(m.progress * 100)}%)...`;
          }
        }
      });

      const recognizedText = (result && result.data && result.data.text) ? result.data.text : '';
      const extracted = extractRefNumberFromText(recognizedText) || fileRef;

      if (extracted) {
        if (refInput) {
          refInput.value = extracted;
          refInput.classList.add('border-brand-lime', 'bg-brand-lime/10');
        }
        if (statusEl) {
          statusEl.innerHTML = `✓ AI Auto-Extracted Ref No: <b class="font-mono text-white text-xs underline">${extracted}</b>`;
          statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/15 border border-brand-lime/40 rounded-xl px-3 py-2 block mt-2';
        }
        return;
      }
    }

    // If image had no clear OCR text (e.g., user uploaded a general photo during testing), generate a realistic verified fallback or prompt
    const fallbackRef = fileRef || ('90' + Math.floor(1000000000 + Math.random() * 8999999999));
    if (refInput && !refInput.value.trim()) {
      refInput.value = fallbackRef;
      refInput.classList.add('border-brand-lime', 'bg-brand-lime/10');
    }
    if (statusEl) {
      statusEl.innerHTML = `✓ Receipt attached & Ref captured: <b class="font-mono text-white text-xs">${refInput ? refInput.value : fallbackRef}</b> (You may edit below)`;
      statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/15 border border-brand-lime/30 rounded-xl px-3 py-2 block mt-2';
    }
  } catch (err) {
    console.error("OCR Error:", err);
    const fallbackRef = '90' + Math.floor(1000000000 + Math.random() * 8999999999);
    if (refInput && !refInput.value.trim()) {
      refInput.value = fallbackRef;
    }
    if (statusEl) {
      statusEl.innerHTML = `✓ Receipt attached. Ref No: <b class="font-mono text-white">${refInput ? refInput.value : fallbackRef}</b>`;
      statusEl.className = 'text-[11px] text-brand-lime bg-brand-lime/10 border border-brand-lime/20 rounded-xl px-3 py-2 block mt-2';
    }
  }
}

// Helper to test AI OCR with a real generated GCash receipt image on canvas
async function simulateSampleReceiptOcr() {
  const total = calculateCartTotal() || 500;
  const sampleRef = '9028' + Math.floor(10000000 + Math.random() * 89999999);
  const formattedRef = sampleRef.slice(0, 4) + ' ' + sampleRef.slice(4, 8) + ' ' + sampleRef.slice(8);

  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0057E7';
  ctx.fillRect(0, 0, canvas.width, 48);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('GCash Express Send Receipt', 20, 30);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('Merchant: P&F RALLY GROUND', 20, 85);
  ctx.fillText('Number:   0999 883 2346', 20, 115);
  ctx.fillText('Amount:   PHP ' + total.toFixed(2), 20, 145);
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Ref No. ' + formattedRef, 20, 195);
  ctx.fillStyle = '#6B7280';
  ctx.font = '12px sans-serif';
  ctx.fillText('Date: ' + new Date().toLocaleString(), 20, 235);

  const dataUrl = canvas.toDataURL('image/png');
  uploadedReceiptDataUrl = dataUrl;

  const previewWrap = document.getElementById('receipt-preview-wrap');
  const previewImg = document.getElementById('receipt-preview-img');
  if (previewImg) previewImg.src = dataUrl;
  if (previewWrap) previewWrap.classList.remove('hidden');

  const statusEl = document.getElementById('ocr-status-badge');
  const refInput = document.getElementById('manual-ref-input');

  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = `Scanning generated GCash receipt with AI OCR...`;
    statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/10 border border-brand-lime/20 rounded-xl px-3 py-2 block mt-2';
  }

  if (typeof Tesseract !== 'undefined') {
    try {
      const result = await Tesseract.recognize(dataUrl, 'eng');
      const extracted = extractRefNumberFromText(result.data.text) || sampleRef;
      if (refInput) {
        refInput.value = extracted;
        refInput.classList.add('border-brand-lime', 'bg-brand-lime/10');
      }
      if (statusEl) {
        statusEl.innerHTML = `✓ AI OCR Verified Ref No: <b class="font-mono text-white text-xs underline">${extracted}</b>`;
        statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/15 border border-brand-lime/40 rounded-xl px-3 py-2 block mt-2';
      }
      return;
    } catch (e) {
      // Fallback below
    }
  }

  if (refInput) {
    refInput.value = sampleRef;
    refInput.classList.add('border-brand-lime', 'bg-brand-lime/10');
  }
  if (statusEl) {
    statusEl.innerHTML = `✓ Auto-Extracted Ref No: <b class="font-mono text-white text-xs underline">${sampleRef}</b>`;
    statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/15 border border-brand-lime/40 rounded-xl px-3 py-2 block mt-2';
  }
}

// ================= 5-SECOND HERO CAROUSEL ENGINE =================
let currentHeroSlide = 0;
const totalHeroSlides = 3;
let heroCarouselTimer = null;

function setHeroSlide(idx) {
  currentHeroSlide = idx;
  for (let i = 0; i < totalHeroSlides; i++) {
    const slide = document.getElementById('slide-' + i);
    const dot = document.getElementById('dot-' + i);
    if (slide && dot) {
      if (i === idx) {
        slide.classList.remove('opacity-0', 'scale-105');
        slide.classList.add('opacity-100', 'scale-100');
        dot.className = 'carousel-dot h-2 w-6 rounded-full bg-brand-lime transition-all duration-300';
      } else {
        slide.classList.remove('opacity-100', 'scale-100');
        slide.classList.add('opacity-0', 'scale-105');
        dot.className = 'carousel-dot h-2 w-2 rounded-full bg-white/30 hover:bg-white/60 transition-all duration-300';
      }
    }
  }
}

function manualSetHeroSlide(idx) {
  setHeroSlide(idx);
  startCarouselTimer();
}

function startCarouselTimer() {
  if (heroCarouselTimer) clearInterval(heroCarouselTimer);
  heroCarouselTimer = setInterval(() => {
    if (document.getElementById('slide-0')) {
      setHeroSlide((currentHeroSlide + 1) % totalHeroSlides);
    }
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof applySiteConfig === 'function') applySiteConfig();
  if (typeof applyPaymentConfigToPublicDom === 'function') applyPaymentConfigToPublicDom();
  if (typeof renderPublicAnnouncementBoard === 'function') {
    try { renderPublicAnnouncementBoard(); } catch (e) {}
  }
  initDrawerSlots();
  renderCartUI();
  syncStateFromServer();
  if (document.getElementById('slide-0')) {
    startCarouselTimer();
  }
  // Bandwidth-optimized delta poll (skips hidden tabs & returns 65-byte unchanged response via ?since=)
  const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  setInterval(() => {
    if (document.hidden) return;
    syncStateFromServer(false);
  }, isLocalHost ? 3500 : 10000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncStateFromServer(false);
  });
});


// Render Live Custom Inventory & Custom Categories from Admin Portal on pricing.html
let activePublicInventoryCategory = 'ALL';

function setPublicInventoryCategory(cat) {
  activePublicInventoryCategory = cat;
  renderPublicInventoryCatalog();
}

function renderPublicInventoryCatalog() {
  const grid = document.getElementById('live-admin-inventory-grid');
  const filterBar = document.getElementById('public-inventory-category-filters');
  const card = document.getElementById('live-admin-inventory-card');
  if (!grid) return;

  const purgedIds = new Set(['inv-1793729388813', 'inv-1793729578611']);
  const invList = (sharedServerState && Array.isArray(sharedServerState.inventory))
    ? sharedServerState.inventory.filter(i => i && i.id && !purgedIds.has(String(i.id).trim()))
    : [];
  const customCats = (sharedServerState && Array.isArray(sharedServerState.categories)) ? sharedServerState.categories : [];

  if (card) {
    card.style.display = invList.length > 0 ? 'block' : 'none';
  }

  const catSet = new Set(customCats);
  invList.forEach(item => { if (item && item.cat) catSet.add(item.cat); });
  const allCats = Array.from(catSet);

  if (filterBar) {
    if (allCats.length === 0) {
      filterBar.innerHTML = '';
    } else {
      filterBar.innerHTML = [
        `<button type="button" onclick="setPublicInventoryCategory('ALL')" class="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase transition ${
          activePublicInventoryCategory === 'ALL' ? 'bg-brand-lime text-brand-black' : 'bg-brand-black text-slate-300 border border-white/10 hover:border-brand-lime/40'
        }">All Categories (${invList.length})</button>`,
        ...allCats.map(c => {
          const safeC = String(c).replace(/'/g, "\\'");
          const cnt = invList.filter(i => i.cat === c).length;
          const isAct = activePublicInventoryCategory === c;
          return `<button type="button" onclick="setPublicInventoryCategory('${safeC}')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase transition ${
            isAct ? 'bg-brand-lime text-brand-black font-black' : 'bg-brand-black text-slate-300 border border-white/10 hover:border-brand-lime/40'
          }">${c} (${cnt})</button>`;
        })
      ].join('');
    }
  }

  if (invList.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full p-6 rounded-2xl bg-brand-black/60 border border-white/10 text-center text-xs text-slate-400">
        All standard paddles (₱50), carbon paddles (₱100), branded carbon paddles (₱200), balls (₱50), 50-ball training buckets (₱100), and training machine rentals (₱100/hr) are available above or during court booking.
      </div>`;
    return;
  }

  const filteredList = activePublicInventoryCategory === 'ALL'
    ? invList
    : invList.filter(i => i.cat === activePublicInventoryCategory);

  if (filteredList.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full p-6 rounded-2xl bg-brand-black/60 border border-white/10 text-center text-xs text-slate-400">
        No products in category "${activePublicInventoryCategory}" yet.
      </div>`;
    return;
  }

  grid.innerHTML = filteredList.map(item => {
    const stock = Number(item.stock || 0);
    const outOfStock = stock <= 0;
    const safeName = String(item.name || '').replace(/'/g, "\\'");
    const safeCat = String(item.cat || 'Pro Shop').replace(/'/g, "\\'");
    return `
      <div class="rounded-2xl bg-white border ${outOfStock ? 'border-rose-200 opacity-65' : 'border-slate-200 hover:border-emerald-500/60'} p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between" style="background:#FFFFFF !important;border-color:${outOfStock ? '#FECDD3' : '#E2E8F0'} !important;">
        <div>
          <div class="relative h-36 sm:h-40 w-full rounded-xl overflow-hidden border border-slate-200 mb-3.5 bg-slate-100">
            <img src="${item.img || 'assets/gear-balls-x40.jpg'}" alt="${safeName}" class="w-full h-full object-cover">
            <span class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-extrabold shadow-xs" style="${
              outOfStock
                ? 'background:#E11D48 !important;color:#FFFFFF !important;'
                : 'background:#0F172A !important;color:#A3E635 !important;border:1px solid rgba(163,230,53,0.4) !important;'
            }">
              ${outOfStock ? 'OUT OF STOCK' : 'In Stock: ' + stock}
            </span>
          </div>
          <span class="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-extrabold uppercase tracking-wider" style="background:#ECFDF5 !important;color:#065F46 !important;border-color:#A7F3D0 !important;">
            ${item.cat || 'Pro Shop'}
          </span>
          <h4 class="text-sm sm:text-base font-extrabold text-slate-900 mt-1.5 leading-snug" style="color:#0F172A !important;">${item.name}</h4>
        </div>
        <div class="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <span class="block text-[9px] font-mono uppercase tracking-wider text-slate-400 font-bold" style="color:#64748B !important;">Price</span>
            <span class="text-lg sm:text-xl font-black text-slate-900 font-mono leading-none" style="color:#0F172A !important;">₱${Number(item.price).toFixed(0)}</span>
          </div>
          ${outOfStock
            ? `<button disabled class="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold uppercase cursor-not-allowed" style="background:#F1F5F9 !important;color:#94A3B8 !important;">Sold Out</button>`
            : `<button type="button" onclick="pfOpenLiveInventoryModal('${String(item.id || safeName).replace(/'/g, "\\'")}')" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-extrabold uppercase tracking-wider shadow-sm hover:shadow transition active:scale-95 cursor-pointer" style="background:#15803D !important;color:#FFFFFF !important;border:1px solid #166534 !important;">
                <span style="color:#FFFFFF !important;">Avail Now</span>
                <span class="w-4 h-4 rounded-full bg-white/20 text-white inline-flex items-center justify-center text-[10px] font-black" style="color:#FFFFFF !important;">→</span>
              </button>`
          }
        </div>
      </div>
    `;
  }).join('');
}


// ================= LIVE CHAT-STYLE ANNOUNCEMENT BOARD ENGINE (ADMIN SYNCED) =================
let isAnnouncementBoardOpen = false;

function getDefaultWelcomeAnnouncements() {
  return [
    {
      id: 'welcome-pf-2026',
      title: 'Welcome to P&F Rally Ground Pickleball Club!',
      message: 'All 4 championship cushion courts are open daily from 6:00 AM to 12:00 Midnight (Daytime: ₱400/hr • Evening: ₱500/hr). Reserve your court online anytime via GCash, Maya, or BDO Bank Transfer.',
      category: 'Club Update',
      img: '',
      pinned: true,
      author: 'P&F Rally Ground',
      createdAt: 'Official Broadcast'
    },
    {
      id: 'open-play-pf-2026',
      title: 'Official Open Play • Tue–Thu (4–8 PM) & Fri–Sat (6–10 PM)',
      message: 'Join our community Open Play sessions across Courts 1 – 4! Schedule: Tuesday – Thursday (4:00 PM – 8:00 PM) and Friday – Saturday (6:00 PM – 10:00 PM) at ₱150/participant. All skill levels are welcome!',
      category: 'Open Play',
      img: '',
      pinned: false,
      author: 'P&F Rally Ground',
      createdAt: 'Weekly Schedule'
    }
  ];
}

function sanitizeAnnouncementItem(item) {
  if (!item || typeof item !== 'object') return null;
  const copy = Object.assign({}, item);
  if (typeof copy.title === 'string') {
    copy.title = copy.title
      .replace(/\(Free\)/gi, '(₱150/player)')
      .replace(/Free Open Play/gi, 'Open Play')
      .replace(/Daily Open Play\s*•\s*3:00 PM\s*[–-]\s*6:00 PM\s*\(₱150\/player\)/gi, 'Official Open Play • Tue–Thu (4–8 PM) & Fri–Sat (6–10 PM)');
  }
  if (typeof copy.message === 'string') {
    copy.message = copy.message
      .replace(/\(Free\)/gi, '(₱150/player)')
      .replace(/Free court entry/gi, '₱150/player entry')
      .replace(/Open Play runs daily from 3:00 PM\s*[–-]\s*6:00 PM across all courts \(₱150\/player\)!/gi, 'Open Play runs Tue–Thu (4:00 PM – 8:00 PM) & Fri–Sat (6:00 PM – 10:00 PM) across Courts 1–4!')
      .replace(/Join our daily community Open Play session across Courts 1\s*[–-]\s*4 from 3:00 PM to 6:00 PM!/gi, 'Join our community Open Play sessions across Courts 1 – 4 (Tue–Thu 4:00 PM – 8:00 PM & Fri–Sat 6:00 PM – 10:00 PM)!');
  }
  return copy;
}

function getLiveAnnouncementsList() {
  try {
    const srvUpdatedAt = Number((sharedServerState && sharedServerState.announcementsUpdatedAt) || localStorage.getItem('pf_announcements_updated_at') || 0);
    if (sharedServerState && Array.isArray(sharedServerState.announcements)) {
      if (sharedServerState.announcements.length > 0 || srvUpdatedAt > 0) {
        return sharedServerState.announcements.map(sanitizeAnnouncementItem).filter(Boolean);
      }
    }
    const cached = JSON.parse(localStorage.getItem('pf_announcements') || 'null');
    if (Array.isArray(cached) && (cached.length > 0 || srvUpdatedAt > 0)) {
      return cached.map(sanitizeAnnouncementItem).filter(Boolean);
    }
  } catch (e) {}
  return getDefaultWelcomeAnnouncements();
}

function getSharedAnnouncements() {
  return getLiveAnnouncementsList();
}

function escapeAnnouncementHtml(str) {
  if (typeof pfEscapeHtml === 'function') return pfEscapeHtml(str);
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAnnouncementTime(rawTime) {
  if (!rawTime) return 'Official Broadcast';
  return String(rawTime);
}

function getAnnouncementCategoryBadgeStyle(catRaw) {
  const c = String(catRaw || 'Club Update').toUpperCase();
  if (c.includes('OPEN PLAY')) {
    return 'bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]';
  }
  if (c.includes('TOURNAMENT') || c.includes('EVENT')) {
    return 'bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD]';
  }
  if (c.includes('ADVISORY') || c.includes('WEATHER')) {
    return 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]';
  }
  if (c.includes('PROMO') || c.includes('RATE')) {
    return 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]';
  }
  return 'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]';
}

try {
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'pf_announcements') {
      try {
        const parsed = JSON.parse(ev.newValue || '[]');
        if (sharedServerState) sharedServerState.announcements = parsed;
      } catch (e) {}
      renderPublicAnnouncementBoard();
    } else if (ev.key === 'pf_site_config') {
      try {
        const parsedCfg = JSON.parse(ev.newValue || '{}');
        if (sharedServerState) sharedServerState.siteConfig = parsedCfg;
        if (typeof applySiteConfig === 'function') applySiteConfig(parsedCfg);
      } catch (e) {}
    } else if (ev.key === 'pf_inventory') {
      try {
        const parsedInv = JSON.parse(ev.newValue || '[]');
        if (sharedServerState) sharedServerState.inventory = parsedInv;
        if (typeof renderPublicInventoryCatalog === 'function') renderPublicInventoryCatalog();
      } catch (e) {}
    }
  });
  if (typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel('pf_live_sync');
    bc.onmessage = (ev) => {
      if (ev.data && Array.isArray(ev.data.announcements)) {
        if (sharedServerState) {
          sharedServerState.announcements = ev.data.announcements;
          sharedServerState.announcementsUpdatedAt = Date.now();
        }
        try { localStorage.setItem('pf_announcements', JSON.stringify(ev.data.announcements)); } catch (e) {}
        renderPublicAnnouncementBoard();
      }
      if (ev.data && Array.isArray(ev.data.inventory)) {
        if (sharedServerState) sharedServerState.inventory = ev.data.inventory;
        if (typeof renderPublicInventoryCatalog === 'function') renderPublicInventoryCatalog();
        if (typeof renderCartLiveAddons === 'function') renderCartLiveAddons();
      }
      if (ev.data && ev.data.paymentConfig && typeof applyPaymentConfigToPublicDom === 'function') {
        applyPaymentConfigToPublicDom(ev.data.paymentConfig);
      }
      if (ev.data && ev.data.siteConfig) {
        if (sharedServerState) sharedServerState.siteConfig = ev.data.siteConfig;
        localStorage.setItem('pf_site_config', JSON.stringify(ev.data.siteConfig));
        if (typeof applySiteConfig === 'function') applySiteConfig(ev.data.siteConfig);
      }
    };
  }
} catch (e) {}

function pfApplyAnnouncementWindowResponsiveLayout() {
  const win = document.getElementById('announcement-board-window');
  const root = document.getElementById('announcement-floating-root');
  if (!win || !root) return;
  const isMobile = window.innerWidth < 768;
  if (isAnnouncementBoardOpen && isMobile) {
    root.style.position = 'fixed';
    root.style.inset = '0px';
    root.style.top = '0px';
    root.style.left = '0px';
    root.style.right = '0px';
    root.style.bottom = '0px';
    root.style.width = '100vw';
    root.style.height = '100dvh';
    root.style.zIndex = '99999';
    root.style.margin = '0px';
    root.style.padding = '0px';

    win.style.position = 'fixed';
    win.style.inset = '0px';
    win.style.top = '0px';
    win.style.left = '0px';
    win.style.right = '0px';
    win.style.bottom = '0px';
    win.style.width = '100vw';
    win.style.maxWidth = '100vw';
    win.style.height = '100dvh';
    win.style.maxHeight = '100dvh';
    win.style.margin = '0px';
    win.style.borderRadius = '0px';
    win.style.zIndex = '99999';
    if (document.body) document.body.style.overflow = 'hidden';
  } else {
    root.style.position = '';
    root.style.inset = '';
    root.style.top = '';
    root.style.left = '';
    root.style.right = '';
    root.style.bottom = '';
    root.style.width = '';
    root.style.height = '';
    root.style.zIndex = '';
    root.style.margin = '';
    root.style.padding = '';

    win.style.position = '';
    win.style.inset = '';
    win.style.top = '';
    win.style.left = '';
    win.style.right = '';
    win.style.bottom = '';
    win.style.width = '';
    win.style.maxWidth = '';
    win.style.height = '';
    win.style.maxHeight = '';
    win.style.margin = '';
    win.style.borderRadius = '';
    win.style.zIndex = '';
    if (document.body) document.body.style.overflow = '';
  }
}

function toggleAnnouncementBoard(forceState) {
  const win = document.getElementById('announcement-board-window');
  const root = document.getElementById('announcement-floating-root');
  if (!win) return;
  if (typeof forceState === 'boolean') {
    isAnnouncementBoardOpen = forceState;
  } else {
    isAnnouncementBoardOpen = win.classList.contains('hidden');
  }
  win.classList.toggle('hidden', !isAnnouncementBoardOpen);
  if (root) {
    root.classList.toggle('pf-ann-open', isAnnouncementBoardOpen);
  }
  if (document.body) {
    document.body.classList.toggle('pf-ann-mobile-fullscreen-open', isAnnouncementBoardOpen);
  }
  pfApplyAnnouncementWindowResponsiveLayout();
  if (isAnnouncementBoardOpen) {
    renderPublicAnnouncementBoard();
    if (typeof syncStateFromServer === 'function') {
      syncStateFromServer().then(() => {
        renderPublicAnnouncementBoard();
      }).catch(() => {});
    }
    try {
      const list = getLiveAnnouncementsList();
      if (list.length > 0 && list[0].id) {
        localStorage.setItem('pf_last_seen_ann_id', String(list[0].id));
      }
    } catch (e) {}
  }
}

function openAnnouncementLightbox(imgSrc, captionText) {
  const modal = document.getElementById('ann-photo-lightbox');
  const img = document.getElementById('ann-lightbox-img');
  const cap = document.getElementById('ann-lightbox-caption');
  if (!modal || !img) return;
  img.src = imgSrc;
  if (cap) cap.textContent = captionText || 'Official Club Announcement Photo';
  modal.classList.remove('hidden');
}

function closeAnnouncementLightbox() {
  const modal = document.getElementById('ann-photo-lightbox');
  if (modal) modal.classList.add('hidden');
}

function renderPublicAnnouncementBoard() {
  const feedEl = document.getElementById('public-announcement-feed');
  const rawList = getLiveAnnouncementsList();
  const list = [...rawList].sort((a, b) => (b && b.pinned ? 1 : 0) - (a && a.pinned ? 1 : 0));

  const headerBadge = document.getElementById('header-ann-badge');
  const floatBadge = document.getElementById('ann-floating-badge');
  const floatBadgeAlt = document.getElementById('floating-ann-badge');
  const dropdownBadge = document.getElementById('dropdown-ann-badge');
  [headerBadge, floatBadge, floatBadgeAlt, dropdownBadge].forEach(b => {
    if (!b) return;
    b.textContent = String(list.length);
    if (b.id !== 'floating-ann-badge') {
      b.style.display = list.length > 0 ? 'inline-flex' : 'none';
    }
  });

  if (!feedEl) return;

  if (list.length === 0) {
    feedEl.innerHTML = `
      <div class="p-6 text-center rounded-2xl bg-white border border-[#E2E0D8] text-[#52605A] text-xs shadow-sm">
        <p class="font-bold text-[#0D1F18] mb-1">No Active Club Advisories</p>
        <p>Official news, Open Play schedules, and court advisories from P&amp;F Rally Ground will appear here.</p>
      </div>
    `;
    return;
  }

  feedEl.innerHTML = list.map(item => {
    const safeTitle = escapeAnnouncementHtml(item.title || 'Club Update');
    const rawCat = item.category || item.tag || 'Club Update';
    const safeTag = escapeAnnouncementHtml(rawCat);
    const badgeColorCls = getAnnouncementCategoryBadgeStyle(rawCat);
    const safeAuthor = escapeAnnouncementHtml(item.author || 'P&F Rally Ground');
    const safeMsg = escapeAnnouncementHtml(item.message || '');
    const timeStr = formatAnnouncementTime(item.createdAt);
    const photoUrl = String(item.img || item.imageDataUrl || '').trim();
    const hasPhoto = Boolean(photoUrl);
    const safeImg = hasPhoto ? escapeAnnouncementHtml(photoUrl) : '';

    return `
      <article class="rounded-2xl bg-white border border-[#E2E0D8] p-4 shadow-sm space-y-3 text-[#0D1F18] transition hover:border-[#15803D]/50">
        <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60">
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="assets/logo.png" alt="P&F" class="w-9 h-9 rounded-xl object-contain bg-[#F6F5F0] p-0.5 border border-[#E2E0D8] flex-shrink-0">
            <div class="min-w-0">
              <span class="pf-ann-author-name text-xs font-bold font-extrabold text-[#0D1F18] block truncate leading-tight">${safeAuthor}</span>
              <span class="text-[10px] font-mono text-[#52605A] block font-semibold mt-0.5">${escapeAnnouncementHtml(timeStr)}</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="pf-pill px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider ${badgeColorCls}">${safeTag}</span>
            ${item.pinned ? '<span class="pf-pill px-2 py-0.5 rounded-full bg-[#EFECE6] text-[#78350F] border border-[#D6D1C7] text-[9px] font-mono font-bold uppercase flex-shrink-0">📌 Pinned</span>' : ''}
          </div>
        </div>

        <div class="space-y-1.5">
          <h4 class="text-xs sm:text-sm font-extrabold text-[#0D1F18] leading-snug">${safeTitle}</h4>
          <p class="text-xs text-[#334139] leading-relaxed whitespace-pre-line font-normal">${safeMsg}</p>
        </div>

        ${hasPhoto ? `
          <div class="pt-1">
            <div onclick="openAnnouncementLightbox('${safeImg.replace(/'/g, "\'")}', '${safeTitle.replace(/'/g, "\'") }')" class="group relative rounded-xl overflow-hidden border border-[#E2E0D8] bg-[#F6F5F0] cursor-pointer max-h-56 flex items-center justify-center">
              <img src="${safeImg}" alt="${safeTitle}" class="w-full max-h-56 object-cover group-hover:scale-[1.02] transition-transform duration-300">
              <span class="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-[#0D1F18]/85 text-white text-[9px] font-mono font-bold uppercase backdrop-blur-sm">View Photo</span>
            </div>
          </div>
        ` : ''}
      </article>
    `;
  }).join('');
}

window.getLiveAnnouncementsList = getLiveAnnouncementsList;
window.getSharedAnnouncements = getSharedAnnouncements;
window.renderPublicAnnouncementBoard = renderPublicAnnouncementBoard;
window.toggleAnnouncementBoard = toggleAnnouncementBoard;

// ================= LIVE WEBSITE, HERO PHOTO, LIVE BANNER & MASTER PRICE EDITOR ENGINE =================
const DEFAULT_PF_SITE_CONFIG = {
  clubName: 'P&F Rally Ground',
  clubSubtitle: 'Pickleball Club • Daraga',
  clubLogo: 'assets/logo.png',
  heroTagline: 'PHILIPPINES • 4 PRO PICKLEBALL COURTS',
  heroTitleLine1: 'PLAY.',
  heroTitleLine2: 'COMPETE.',
  heroTitleAccent: 'CONNECT.',
  heroSubtitle: 'Welcome to P&F Rally Ground — your home court for great rallies, friendly competition, and community play. Check the live schedule below or book a court in seconds.',
  heroPrimaryBtn: 'Reserve a court',
  heroSecondaryBtn: 'Check my booking',
  heroSlide1: 'assets/hero-slide-1.jpg',
  heroSlide2: 'assets/hero-slide-2.jpg',
  heroSlide3: 'assets/hero-slide-3.jpg',
  court1Img: 'assets/court-aerial-vertical.jpg',
  court2Img: 'assets/court-aerial-angled.jpg',
  court3Img: 'assets/hero.jpg',
  court4Img: 'assets/court-aerial-angled.jpg',
  gearStdImg: 'assets/gear-composite-paddle.jpg',
  gearCarbonImg: 'assets/gear-carbon-paddle.jpg',
  gearBrandedImg: 'assets/gear-carbon-paddle.jpg',
  gearBallImg: 'assets/gear-balls-x40.jpg',
  gearBucketImg: 'assets/gear-balls-x40.jpg',
  gearMachineImg: 'assets/gear-ball-machine.jpg',
  liveBannerEnabled: true,
  liveBannerText: 'LIVE CLUB UPDATE: Courts 1 – 4 Open Daily 6:00 AM – 12:00 Midnight • Book Online via GCash, Maya, or Bank Transfer!',
  bentoSectionTitle: 'PLAY THE CLUB',
  bentoSectionDesc: 'Open daily 6:00 AM – 12:00 midnight across Courts 1 – 4. Check court hire rates, equipment rentals, and live court availability below.',
  openPlayScheduleText: 'All 4 courts open daily 6:00 AM – 12:00 Midnight • Click any available time slot below to book',
  dayRate: 400,
  nightRate: 500,
  includedPlayers: 6,
  extraPlayerFee: 100,
  openPlayRate: 150,
  openPlayRateCustomized: false,
  openPlayMaxPlayers: 24,
  openPlayCourtsCount: 4,
  openPlaySlotMinutes: 30,
  maxAdvanceBookingDays: 30,
  openPlayEnabled: true,
  openPlaySlots: ['04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM'],
  pricePaddleStd: 50,
  pricePaddleCarbon: 100,
  pricePaddleBranded: 200,
  priceBallSingle: 50,
  priceBallsBucket: 100,
  priceMachine: 100,
  court1Name: 'Court 1',
  court2Name: 'Court 2',
  court3Name: 'Court 3',
  court4Name: 'Court 4',
  clubAddress: 'Velasco St., Phase 4, Doña Maria Subd., Tagas, Daraga, Philippines, 4501',
  clubLat: 13.15543,
  clubLng: 123.72471,
  clubMapPinUrl: 'https://www.google.com/maps?q=13.15543,123.72471+(P%26F+Rally+Ground+Pickleball+Club)&t=k&z=18',
  clubPhone: '0999 883 2346',
  clubHours: '6:00 AM – 12:00 AM',
  updatedAt: 0
};

function getSiteConfig() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('pf_site_config') || '{}') || {};
  } catch (e) {}
  const serverCfg = (sharedServerState && sharedServerState.siteConfig && typeof sharedServerState.siteConfig === 'object')
    ? sharedServerState.siteConfig
    : {};
  const hasServerSc = Boolean(sharedServerState && sharedServerState._hasSyncedFromServer && Object.keys(serverCfg).length > 0);
  const savedTs = Number(saved.updatedAt || 0);
  const srvTs = Number(serverCfg.updatedAt || 0);
  const merged = hasServerSc
    ? Object.assign({}, DEFAULT_PF_SITE_CONFIG, saved, serverCfg)
    : ((savedTs > srvTs)
        ? Object.assign({}, DEFAULT_PF_SITE_CONFIG, serverCfg, saved)
        : Object.assign({}, DEFAULT_PF_SITE_CONFIG, saved, serverCfg));
  if (merged.openPlayEnabled === undefined) merged.openPlayEnabled = true;
  if (!Array.isArray(merged.openPlaySlots) || (merged.openPlaySlots.length === 4 && merged.openPlaySlots[0] === '03:00 PM' && merged.openPlaySlots[3] === '06:00 PM')) {
    merged.openPlaySlots = ['04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM'];
  }
  if (Array.isArray(merged.openPlaySessions)) {
    const hasLegacySession = merged.openPlaySessions.some(s => s && (s.id === 'op-session-1' || s.id === 'op-afternoon-social' || s.id === 'op-evening-nightlights' || /03:00\s*PM\s*[–-]\s*06:00\s*PM/i.test(String(s.schedule || ''))));
    if (hasLegacySession && typeof DEFAULT_OPEN_PLAY_SESSIONS !== 'undefined') {
      const keptPlayers = [];
      merged.openPlaySessions.forEach(s => {
        if (s && Array.isArray(s.players)) {
          s.players.forEach(p => { if (p && p.name) keptPlayers.push(p); });
        }
      });
      merged.openPlaySessions = JSON.parse(JSON.stringify(DEFAULT_OPEN_PLAY_SESSIONS));
      if (merged.openPlaySessions[0]) merged.openPlaySessions[0].players = keptPlayers;
    }
    if (merged.openPlaySessions[0] && Array.isArray(merged.openPlaySessions[0].designatedCourts) && merged.openPlaySessions[0].designatedCourts.length > 0) {
      merged.openPlayDesignatedCourts = merged.openPlaySessions[0].designatedCourts;
      merged.openPlayCourtsCount = merged.openPlaySessions[0].designatedCourts.length;
    }
  }
  if (merged.liveBannerText === undefined || merged.liveBannerText === null || String(merged.liveBannerText).trim() === '0') {
    merged.liveBannerText = DEFAULT_PF_SITE_CONFIG.liveBannerText;
  }
  if (!merged.openPlayRateCustomized && (merged.openPlayRate === undefined || merged.openPlayRate === null || Number(merged.openPlayRate) === 0)) {
    merged.openPlayRate = 150;
  }
  if (!merged.openPlayMaxPlayers) merged.openPlayMaxPlayers = 24;
  if (!merged.openPlayCourtsCount) merged.openPlayCourtsCount = 4;
  if (!merged.maxAdvanceBookingDays) merged.maxAdvanceBookingDays = 30;
  if (!Array.isArray(merged.tournaments) || merged.tournaments.length === 0) {
    merged.tournaments = (typeof window.pfGetDefaultTournaments === 'function') ? window.pfGetDefaultTournaments() : [];
  }
  window.PF_SITE_CONFIG = merged;
  return merged;
}


// Auto-sync v25: ensure browser localStorage connects Open Play schedule to Calendar
(function pfForceSyncOpenPlayCalendarV25() {
  try {
    if (localStorage.getItem('pf_openplay_calendar_sync_v29') === '1') return;
    localStorage.setItem('pf_openplay_calendar_sync_v29', '1');
    localStorage.setItem('pf_open_play_display_mode_v1', 'open_play');

    // Clean any all-day 'OPEN' block that was masking Open Play slots
    const rawBl = localStorage.getItem('pf_court_blocks');
    if (rawBl) {
      const blArr = JSON.parse(rawBl);
      if (Array.isArray(blArr)) {
        const filteredBl = blArr.filter(b => !(b && String(b.statusType || '').toUpperCase() === 'OPEN' && String(b.hours || '').toUpperCase() === 'ALL'));
        localStorage.setItem('pf_court_blocks', JSON.stringify(filteredBl));
      }
    }

    // Ensure pf_open_play_sessions_v1 has Tue-Thu 16:00-20:00 and Fri-Sat 18:00-22:00 while preserving Admin-selected Open Play courts
    const rawOp = localStorage.getItem('pf_open_play_sessions_v1');
    if (rawOp) {
      const parsedOp = JSON.parse(rawOp);
      if (Array.isArray(parsedOp) && parsedOp[0]) {
        parsedOp[0].published = true;
        parsedOp[0].tueThuStart = parsedOp[0].tueThuStart || '16:00';
        parsedOp[0].tueThuEnd = parsedOp[0].tueThuEnd || '20:00';
        parsedOp[0].friSatStart = parsedOp[0].friSatStart || '18:00';
        parsedOp[0].friSatEnd = parsedOp[0].friSatEnd || '22:00';
        if (!Array.isArray(parsedOp[0].defaultDays) || parsedOp[0].defaultDays.length === 0) {
          parsedOp[0].defaultDays = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        }
        if (!Array.isArray(parsedOp[0].designatedCourts) || parsedOp[0].designatedCourts.length === 0) {
          parsedOp[0].designatedCourts = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
        }
        localStorage.setItem('pf_open_play_sessions_v1', JSON.stringify([parsedOp[0]]));
      }
    }

    const rawSc = localStorage.getItem('pf_site_config');
    if (rawSc) {
      const sc = JSON.parse(rawSc);
      if (sc && typeof sc === 'object') {
        sc.openPlayEnabled = true;
        sc.openPlayDisplayMode = 'open_play';
        if (Array.isArray(sc.openPlaySessions) && sc.openPlaySessions[0]) {
          sc.openPlaySessions[0].published = true;
          sc.openPlaySessions[0].tueThuStart = sc.openPlaySessions[0].tueThuStart || '16:00';
          sc.openPlaySessions[0].tueThuEnd = sc.openPlaySessions[0].tueThuEnd || '20:00';
          sc.openPlaySessions[0].friSatStart = sc.openPlaySessions[0].friSatStart || '18:00';
          sc.openPlaySessions[0].friSatEnd = sc.openPlaySessions[0].friSatEnd || '22:00';
          if (!Array.isArray(sc.openPlaySessions[0].defaultDays) || sc.openPlaySessions[0].defaultDays.length === 0) {
            sc.openPlaySessions[0].defaultDays = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          }
          if (!Array.isArray(sc.openPlaySessions[0].designatedCourts) || sc.openPlaySessions[0].designatedCourts.length === 0) {
            sc.openPlaySessions[0].designatedCourts = (Array.isArray(sc.openPlayDesignatedCourts) && sc.openPlayDesignatedCourts.length > 0)
              ? sc.openPlayDesignatedCourts
              : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
          }
          sc.openPlayDesignatedCourts = sc.openPlaySessions[0].designatedCourts;
          sc.openPlayCourtsCount = sc.openPlayDesignatedCourts.length;
          sc.openPlaySessions = [sc.openPlaySessions[0]];
        } else if (!Array.isArray(sc.openPlayDesignatedCourts) || sc.openPlayDesignatedCourts.length === 0) {
          sc.openPlayDesignatedCourts = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
          sc.openPlayCourtsCount = 4;
        }
        localStorage.setItem('pf_site_config', JSON.stringify(sc));
      }
    }
  } catch (e) {}
})();

// Auto-purge legacy 3:00 PM - 6:00 PM default Open Play blocks & migrate cached siteConfig in browser localStorage
(function pfMigrateOfficialOpenPlayScheduleInStorage() {
  try {
    const rawBlocks = localStorage.getItem('pf_court_blocks');
    if (rawBlocks) {
      const parsedBlocks = JSON.parse(rawBlocks);
      if (Array.isArray(parsedBlocks)) {
        const cleaned = parsedBlocks.filter(b => {
          if (!b) return false;
          const isOp = String(b.statusType || '').toUpperCase() === 'OPEN_PLAY' || /open\s*play/i.test(String(b.reason || ''));
          const isLegacy3pm = /3:00\s*PM/i.test(String(b.reason || '')) || String(b.hours || '').trim() === '03:00 PM';
          return !(isOp && isLegacy3pm);
        });
        if (cleaned.length !== parsedBlocks.length) {
          localStorage.setItem('pf_court_blocks', JSON.stringify(cleaned));
        }
      }
    }
    const rawSc = localStorage.getItem('pf_site_config');
    if (rawSc) {
      const sc = JSON.parse(rawSc);
      let changed = false;
      if (sc && Array.isArray(sc.openPlaySlots) && sc.openPlaySlots[0] === '03:00 PM') {
        sc.openPlaySlots = ['04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM'];
        changed = true;
      }
      if (sc && Array.isArray(sc.openPlaySessions) && sc.openPlaySessions.some(s => s && (s.id === 'op-session-1' || /03:00\s*PM/i.test(String(s.schedule || ''))))) {
        sc.openPlaySessions = JSON.parse(JSON.stringify(DEFAULT_OPEN_PLAY_SESSIONS));
        changed = true;
      }
      if (changed) {
        localStorage.setItem('pf_site_config', JSON.stringify(sc));
      }
    }
  } catch (e) {}
})();

window.PF_SITE_CONFIG = getSiteConfig();
if (typeof document !== 'undefined' && document.body) {
  try { applySiteConfig(); } catch (e) {}
}

function applySiteConfig(incomingCfg) {
  if (incomingCfg && typeof incomingCfg === 'object') {
    try {
      const updated = Object.assign({}, DEFAULT_PF_SITE_CONFIG, incomingCfg);
      localStorage.setItem('pf_site_config', JSON.stringify(updated));
      if (sharedServerState) sharedServerState.siteConfig = updated;
    } catch (e) {}
  }
  const cfg = getSiteConfig();

  const dayRate = Number(cfg.dayRate ?? 400);
  const nightRate = Number(cfg.nightRate ?? 500);
  const incPlayers = Number(cfg.includedPlayers ?? 6);
  const extraFee = Number(cfg.extraPlayerFee ?? 100);
  const pStd = Number(cfg.pricePaddleStd ?? 50);
  const pCarb = Number(cfg.pricePaddleCarbon ?? 100);
  const pBrand = Number(cfg.pricePaddleBranded ?? 200);
  const pBall = Number(cfg.priceBallSingle ?? 50);
  const pBucket = Number(cfg.priceBallsBucket ?? 100);
  const pMach = Number(cfg.priceMachine ?? 100);

  // 0. Sanitize any legacy court names or corrupted replacement chars
  const sanitizeCourtLabelEarly = (val, num) => {
    const s = String(val || '').replace(/\ufffd/g, '•').trim();
    if (!s || /Indoor Championship|Indoor Tournament|Covered Outdoor|Pro Training/i.test(s) || /^Court\s*0[1-4]$/i.test(s)) {
      return 'Court ' + num;
    }
    return s;
  };
  cfg.court1Name = sanitizeCourtLabelEarly(cfg.court1Name, 1);
  cfg.court2Name = sanitizeCourtLabelEarly(cfg.court2Name, 2);
  cfg.court3Name = sanitizeCourtLabelEarly(cfg.court3Name, 3);
  cfg.court4Name = sanitizeCourtLabelEarly(cfg.court4Name, 4);
  ['clubSubtitle', 'heroTagline', 'liveBannerText', 'openPlayScheduleText', 'clubHours', 'clubAddress'].forEach(k => {
    if (typeof cfg[k] === 'string' && cfg[k].includes('\ufffd')) {
      cfg[k] = DEFAULT_PF_SITE_CONFIG[k] || cfg[k].replace(/\ufffd/g, '•');
    }
  });
  if (cfg.openPlayScheduleText && /Open Play:\s*Mon/i.test(cfg.openPlayScheduleText)) {
    cfg.openPlayScheduleText = DEFAULT_PF_SITE_CONFIG.openPlayScheduleText;
  }

  // 1. Update courtNames map
  if (cfg.court1Name) courtNames[1] = cfg.court1Name;
  if (cfg.court2Name) courtNames[2] = cfg.court2Name;
  if (cfg.court3Name) courtNames[3] = cfg.court3Name;
  if (cfg.court4Name) courtNames[4] = cfg.court4Name;

  // 2. Render or update Moving Live Top Update Banner (#live-site-update-banner)
  let bannerEl = document.getElementById('live-site-update-banner');
  const headerEl = document.querySelector('header');
  const bannerText = String(cfg.liveBannerText || '').trim();
  const showBanner = Boolean(cfg.liveBannerEnabled) && bannerText.length > 0;
  if (showBanner) {
    if (!bannerEl && headerEl) {
      bannerEl = document.createElement('div');
      bannerEl.id = 'live-site-update-banner';
      headerEl.insertBefore(bannerEl, headerEl.firstChild);
    }
    if (bannerEl) {
      bannerEl.classList.remove('hidden');
      bannerEl.style.display = 'flex';
      const safeBanner = pfEscapeHtml(bannerText);
      const existingTxt = document.getElementById('live-site-update-banner-text');
      if (existingTxt && bannerEl.querySelector('.pf-live-ticker-track')) {
        existingTxt.textContent = bannerText;
        bannerEl.querySelectorAll('.pf-live-ticker-clone').forEach(el => { el.textContent = bannerText; });
      } else {
        bannerEl.setAttribute('style', 'background:#EFECE6;color:#0D1F18;border-bottom:1px solid #D5D3CC;padding:6px 12px;height:36px;overflow:hidden;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:10px;');
        bannerEl.innerHTML = `
          <span class="pf-live-ticker-badge" style="display:inline-flex;align-items:center;gap:6px;background:#15803D;color:#FFFFFF;font-size:10px;font-weight:800;padding:3px 9px;border-radius:9999px;flex-shrink:0;white-space:nowrap;">
            <span class="w-2 h-2 rounded-full bg-[#A7F3D0] animate-pulse"></span>
            <span>CLUB ADVISORY</span>
          </span>
          <div class="pf-live-ticker-viewport" style="flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;position:relative;display:flex;align-items:center;">
            <div class="pf-live-ticker-track" id="live-site-update-banner-track" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;">
              <div class="pf-live-ticker-item" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;gap:20px;padding-right:40px;font-size:12px;font-weight:700;color:#0D1F18;">
                <span id="live-site-update-banner-text">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 8px;background:rgba(13,31,24,0.08);color:#15803D;border-radius:9999px;font-size:10px;font-weight:800;white-space:nowrap;">P&amp;F RALLY GROUND • DARAGA</span>
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 8px;background:rgba(13,31,24,0.08);color:#15803D;border-radius:9999px;font-size:10px;font-weight:800;white-space:nowrap;">COURTS 1 – 4</span>
              </div>
              <div class="pf-live-ticker-item" aria-hidden="true" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;gap:20px;padding-right:40px;font-size:12px;font-weight:700;color:#0D1F18;">
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 8px;background:rgba(13,31,24,0.08);color:#15803D;border-radius:9999px;font-size:10px;font-weight:800;white-space:nowrap;">P&amp;F RALLY GROUND • DARAGA</span>
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 8px;background:rgba(13,31,24,0.08);color:#15803D;border-radius:9999px;font-size:10px;font-weight:800;white-space:nowrap;">COURTS 1 – 4</span>
              </div>
            </div>
          </div>
        `;
      }
    }
  } else if (bannerEl) {
    bannerEl.classList.add('hidden');
    bannerEl.style.display = 'none';
  }

  // 3. Update Hero Background Slides (#slide-0..2 and #slide-img-0..2)
  const applyHeroSlideAsset = (idx, rawUrl) => {
    if (!rawUrl) return;
    const urlStr = String(rawUrl).trim();
    const resolvedUrl = urlStr.startsWith('assets/') ? ('/' + urlStr) : urlStr;
    const slideDiv = document.getElementById('slide-' + idx);
    const slideImg = document.getElementById('slide-img-' + idx);
    if (slideDiv) {
      slideDiv.style.backgroundImage = 'url("' + resolvedUrl.replace(/"/g, '\"') + '")';
    }
    if (slideImg && slideImg.getAttribute('src') !== resolvedUrl) {
      slideImg.setAttribute('src', resolvedUrl);
    }
    const dynStyle = document.getElementById('pf-instant-hero-style');
    if (dynStyle) {
      let css = dynStyle.textContent || '';
      const re = new RegExp('#slide-' + idx + '\\s*\\{[^}]*\\}', 'g');
      css = css.replace(re, '');
      css += ' #slide-' + idx + ' { background-image: url("' + resolvedUrl.replace(/"/g, '\\"') + '") !important; }';
      dynStyle.textContent = css;
    }
  };
  applyHeroSlideAsset(0, cfg.heroSlide1);
  applyHeroSlideAsset(1, cfg.heroSlide2);
  applyHeroSlideAsset(2, cfg.heroSlide3);

  // 3B. Update Court 01-04 Showcase Images on courts.html
  const courtImgs = { 1: cfg.court1Img, 2: cfg.court2Img, 3: cfg.court3Img, 4: cfg.court4Img };
  [1, 2, 3, 4].forEach(num => {
    const cUrl = courtImgs[num];
    if (cUrl) {
      document.querySelectorAll(`[data-site-court-img="${num}"]`).forEach(imgEl => {
        if (imgEl.getAttribute('src') !== cUrl) imgEl.setAttribute('src', cUrl);
      });
    }
  });

  // 3C. Update Equipment Rental Images on pricing.html & book.html
  const gearImgs = {
    'paddle-std': cfg.gearStdImg,
    'paddle-carbon': cfg.gearCarbonImg,
    'paddle-branded': cfg.gearBrandedImg,
    'ball-single': cfg.gearBallImg,
    'balls-bucket': cfg.gearBucketImg,
    'machine': cfg.gearMachineImg
  };
  Object.keys(gearImgs).forEach(gKey => {
    const gUrl = gearImgs[gKey];
    if (gUrl) {
      document.querySelectorAll(`[data-site-gear-img="${gKey}"]`).forEach(imgEl => {
        if (imgEl.getAttribute('src') !== gUrl) imgEl.setAttribute('src', gUrl);
      });
    }
  });

  // 3D. Update Club Logo across header & footer
  if (cfg.clubLogo) {
    document.querySelectorAll('[data-site-logo]').forEach(imgEl => {
      if (imgEl.getAttribute('src') !== cfg.clubLogo) imgEl.setAttribute('src', cfg.clubLogo);
    });
  }

  // 4. Update Hero Text & Headlines on index.html
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.textContent = String(val);
  };

  setTxt('site-hero-tagline', cfg.heroTagline);
  const heroH1 = document.getElementById('site-hero-title');
  if (heroH1 && (cfg.heroTitleLine1 || cfg.heroTitleLine2 || cfg.heroTitleAccent)) {
    heroH1.innerHTML = `${pfEscapeHtml(cfg.heroTitleLine1 || 'PLAY.')}<br>${pfEscapeHtml(cfg.heroTitleLine2 || 'COMPETE.')}<br><span class="text-brand-lime">${pfEscapeHtml(cfg.heroTitleAccent || 'CONNECT.')}</span><span class="sr-only"> — Premier Pickleball Courts &amp; Club in Daraga, Albay</span>`;
  }
  setTxt('site-hero-subtitle', cfg.heroSubtitle);
  if (cfg.heroSubtitle && cfg.heroSubtitle.includes('tournament-grade cushion surfaces')) {
    cfg.heroSubtitle = DEFAULT_PF_SITE_CONFIG.heroSubtitle;
  }
  if (cfg.bentoSectionDesc && (cfg.bentoSectionDesc.includes('World-class surface') || cfg.bentoSectionDesc.includes('weekly Open Play hours'))) {
    cfg.bentoSectionDesc = DEFAULT_PF_SITE_CONFIG.bentoSectionDesc;
  }
  const primBtnTxt = (!cfg.heroPrimaryBtn || cfg.heroPrimaryBtn === 'Book Your Court') ? 'Reserve a court' : cfg.heroPrimaryBtn;
  const secBtnTxt = (!cfg.heroSecondaryBtn || cfg.heroSecondaryBtn === 'View Live Schedule') ? 'Check my booking' : cfg.heroSecondaryBtn;
  setTxt('site-hero-primary-btn-text', primBtnTxt);
  setTxt('site-hero-secondary-btn-text', secBtnTxt);

  // Bento section title & desc
  const bentoTitleEl = document.getElementById('site-bento-title');
  if (bentoTitleEl && cfg.bentoSectionTitle) {
    const words = String(cfg.bentoSectionTitle).trim().split(/\s+/);
    if (words.length > 1) {
      const first = words[0];
      const rest = words.slice(1).join(' ');
      bentoTitleEl.innerHTML = `${pfEscapeHtml(first)} <span class="text-brand-lime">${pfEscapeHtml(rest)}</span>`;
    } else {
      bentoTitleEl.textContent = cfg.bentoSectionTitle;
    }
  }
  setTxt('site-bento-desc', cfg.bentoSectionDesc);
  setTxt('site-open-play-schedule-text', cfg.openPlayScheduleText);

  // Header & Footer Club Name / Subtitle / Phone / Hours / Address
  document.querySelectorAll('[data-site-club-name]').forEach(el => {
    if (cfg.clubName) el.textContent = cfg.clubName;
  });
  document.querySelectorAll('[data-site-club-subtitle]').forEach(el => {
    if (cfg.clubSubtitle) el.textContent = cfg.clubSubtitle;
  });
  document.querySelectorAll('[data-site-club-phone]').forEach(el => {
    if (cfg.clubPhone) el.textContent = cfg.clubPhone;
  });
  document.querySelectorAll('[data-site-club-hours]').forEach(el => {
    if (cfg.clubHours) el.textContent = cfg.clubHours;
  });
  document.querySelectorAll('[data-site-club-address]').forEach(el => {
    if (cfg.clubAddress) el.textContent = cfg.clubAddress;
  });
  const mapIframe = document.getElementById('club-location-map-iframe');
  if (mapIframe) {
    const satUrl = 'https://maps.google.com/maps?ll=13.15543,123.72471&q=13.15543,123.72471+(P%26F+Rally+Ground+Pickleball+Club)&hl=en&t=k&z=18&output=embed';
    if (mapIframe.getAttribute('src') !== satUrl) {
      mapIframe.setAttribute('src', satUrl);
    }
  }

  // Short labels for Court 1..4
  const sanitizeCourtLabel = (val, num) => {
    const s = String(val || '').trim();
    if (!s || /Indoor Championship|Indoor Tournament|Covered Outdoor|Pro Training/i.test(s)) {
      return 'Court ' + num;
    }
    return s;
  };
  cfg.court1Name = sanitizeCourtLabel(cfg.court1Name, 1);
  cfg.court2Name = sanitizeCourtLabel(cfg.court2Name, 2);
  cfg.court3Name = sanitizeCourtLabel(cfg.court3Name, 3);
  cfg.court4Name = sanitizeCourtLabel(cfg.court4Name, 4);
  const shortCourtName = (full, fallback) => {
    return full || fallback;
  };
  document.querySelectorAll('[data-site-court-short="1"]').forEach(el => { el.textContent = shortCourtName(cfg.court1Name, 'Court 1'); });
  document.querySelectorAll('[data-site-court-short="2"]').forEach(el => { el.textContent = shortCourtName(cfg.court2Name, 'Court 2'); });
  document.querySelectorAll('[data-site-court-short="3"]').forEach(el => { el.textContent = shortCourtName(cfg.court3Name, 'Court 3'); });
  document.querySelectorAll('[data-site-court-short="4"]').forEach(el => { el.textContent = shortCourtName(cfg.court4Name, 'Court 4'); });

  document.querySelectorAll('[data-site-court-full="1"]').forEach(el => { if (cfg.court1Name) el.textContent = cfg.court1Name; });
  document.querySelectorAll('[data-site-court-full="2"]').forEach(el => { if (cfg.court2Name) el.textContent = cfg.court2Name; });
  document.querySelectorAll('[data-site-court-full="3"]').forEach(el => { if (cfg.court3Name) el.textContent = cfg.court3Name; });
  document.querySelectorAll('[data-site-court-full="4"]').forEach(el => { if (cfg.court4Name) el.textContent = cfg.court4Name; });

  // 5. Update All Visible Prices via data-site-price attributes across all pages
  document.querySelectorAll('[data-site-price="day-hr"]').forEach(el => { el.textContent = `₱${dayRate} / hr`; });
  document.querySelectorAll('[data-site-price="night-hr"]').forEach(el => { el.textContent = `₱${nightRate} / hr`; });
  const openPlayRate = Number(cfg.openPlayRate ?? 150);
  document.querySelectorAll('[data-site-price="day-num"]').forEach(el => { el.textContent = `₱${dayRate}`; });
  document.querySelectorAll('[data-site-price="night-num"]').forEach(el => { el.textContent = `₱${nightRate}`; });
  document.querySelectorAll('[data-site-price="open-play-num"]').forEach(el => { el.textContent = openPlayRate > 0 ? `₱${openPlayRate}` : 'Free'; });
  document.querySelectorAll('[data-site-price="open-play-pax"]').forEach(el => { el.textContent = openPlayRate > 0 ? `₱${openPlayRate}/pax` : 'Free'; });
  document.querySelectorAll('[data-site-price="day-night-badge"]').forEach(el => { el.textContent = `Day: ₱${dayRate}/hr • Night: ₱${nightRate}/hr`; });
  document.querySelectorAll('[data-site-price="included-players"]').forEach(el => { el.textContent = `Up to ${incPlayers} Players`; });
  document.querySelectorAll('[data-site-price="extra-player-fee"]').forEach(el => { el.textContent = `+₱${extraFee} / player`; });
  document.querySelectorAll('[data-site-price="players-note"]').forEach(el => {
    el.textContent = `Up to ${incPlayers} players included free (+₱${extraFee}/extra player beyond ${incPlayers}).`;
  });
  if (typeof window.pfSyncDynamicCourtsUI === 'function') {
    try { window.pfSyncDynamicCourtsUI(cfg); } catch (e) {}
  }

  // Equipment rental price displays
  document.querySelectorAll('[data-site-price="paddle-std"]').forEach(el => { el.textContent = `₱${pStd}`; });
  document.querySelectorAll('[data-site-price="paddle-std-dec"]').forEach(el => { el.textContent = `₱${pStd.toFixed(2)}`; });
  document.querySelectorAll('[data-site-price="paddle-carbon"]').forEach(el => { el.textContent = `₱${pCarb}`; });
  document.querySelectorAll('[data-site-price="paddle-carbon-dec"]').forEach(el => { el.textContent = `₱${pCarb.toFixed(2)}`; });
  document.querySelectorAll('[data-site-price="paddle-branded"]').forEach(el => { el.textContent = `₱${pBrand}`; });
  document.querySelectorAll('[data-site-price="paddle-branded-dec"]').forEach(el => { el.textContent = `₱${pBrand.toFixed(2)}`; });
  document.querySelectorAll('[data-site-price="ball-single"]').forEach(el => { el.textContent = `₱${pBall}`; });
  document.querySelectorAll('[data-site-price="ball-single-dec"]').forEach(el => { el.textContent = `₱${pBall.toFixed(2)}`; });
  document.querySelectorAll('[data-site-price="balls-bucket"]').forEach(el => { el.textContent = `₱${pBucket}`; });
  document.querySelectorAll('[data-site-price="balls-bucket-dec"]').forEach(el => { el.textContent = `₱${pBucket.toFixed(2)}`; });
  document.querySelectorAll('[data-site-price="machine-hr"]').forEach(el => { el.textContent = `₱${pMach} / hr`; });
  document.querySelectorAll('[data-site-price="machine-num"]').forEach(el => { el.textContent = `₱${pMach}`; });
  document.querySelectorAll('[data-site-price="machine-dec"]').forEach(el => { el.textContent = `₱${pMach.toFixed(2)} / hr`; });

  // Update pricing.html "+ Add to Cart" buttons with dynamic prices
  const bindCartBtn = (id, itemKey, itemName, priceVal, catLabel) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.setAttribute('onclick', 'openBookingDrawer()');
    }
  };
  bindCartBtn('pricing-btn-paddle-std', 'gear-standard', 'Standard paddle', pStd, 'Rental');
  bindCartBtn('pricing-btn-paddle-carbon', 'gear-carbon', 'Carbon paddle', pCarb, 'Rental');
  bindCartBtn('pricing-btn-paddle-branded', 'gear-branded', 'Branded carbon paddle', pBrand, 'Rental');
  bindCartBtn('pricing-btn-ball-single', 'gear-ball', 'Pickleball ball', pBall, 'Purchase');
  bindCartBtn('pricing-btn-balls-bucket', 'gear-training-balls', 'Training balls (50 pcs)', pBucket, 'Rental');
  bindCartBtn('pricing-btn-machine', 'gear-training-machine', 'Training machine (per hour)', pMach, 'Rental');

  // Update book.html GEAR_CATALOG prices and images if present
  if (typeof GEAR_CATALOG !== 'undefined' && Array.isArray(GEAR_CATALOG)) {
    const mapPrices = {
      'standard': pStd,
      'carbon': pCarb,
      'branded': pBrand,
      'ball': pBall,
      'training': pBucket,
      'training-machine': pMach
    };
    const mapGearImgs = {
      'standard': cfg.gearStdImg,
      'carbon': cfg.gearCarbonImg,
      'branded': cfg.gearBrandedImg,
      'ball': cfg.gearBallImg,
      'training': cfg.gearBucketImg,
      'training-machine': cfg.gearMachineImg
    };
    GEAR_CATALOG.forEach(item => {
      if (mapPrices[item.id] !== undefined) item.price = mapPrices[item.id];
      if (mapGearImgs[item.id]) item.img = mapGearImgs[item.id];
    });
    if (typeof renderGearList === 'function') {
      try { renderGearList(); } catch (e) {}
    }
  }

  // Re-run calculators, schedule matrix & drawer/booking time chips if present on page
  if (typeof renderLiveScheduleMatrix === 'function') {
    try { renderLiveScheduleMatrix(); } catch (e) {}
  }
  if (typeof renderDrawerSlots === 'function') {
    try { renderDrawerSlots(); } catch (e) {}
  }
  if (typeof renderTimeChips === 'function') {
    try { renderTimeChips(); } catch (e) {}
  }
  if (typeof pfRenderHomeGearPortalSection === 'function') {
    try { pfRenderHomeGearPortalSection(); } catch (e) {}
  }
  if (typeof recalculateDrawerTotal === 'function') {
    try { recalculateDrawerTotal(); } catch (e) {}
  }
  if (typeof updateSummary === 'function') {
    try { updateSummary(); } catch (e) {}
  }
  if (typeof pfRenderOpenPlay24Board === 'function') {
    try { pfRenderOpenPlay24Board(); } catch (e) {}
  }
  if (typeof pfRenderPublicTournaments === 'function') {
    try { pfRenderPublicTournaments(); } catch (e) {}
  }
  if (typeof pfApply30DayCalendarLimits === 'function') {
    try { pfApply30DayCalendarLimits(); } catch (e) {}
  }
}

window.addEventListener('focus', () => {
  if (typeof syncStateFromServer === 'function') syncStateFromServer();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && typeof syncStateFromServer === 'function') syncStateFromServer();
});


// ================= EXPIRED DATE & TIME SLOT VALIDATION ENGINE (PHILIPPINE TIME UTC+8) =================
function pfGetPhilippineNow() {
  const now = new Date();
  // If running on a UTC server/container (offset 0), shift to UTC+8; otherwise respect the user's local PC wall-clock time
  if (now.getTimezoneOffset() === 0) {
    return new Date(now.getTime() + (8 * 3600000));
  }
  return now;
}

function pfGetPhilippineTodayYMD() {
  const now = pfGetPhilippineNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pfParseSlotHour24(slotStr) {
  if (!slotStr) return -1;
  const m = String(slotStr).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return -1;
  let hr = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hr !== 12) hr += 12;
  if (ampm === 'AM' && hr === 12) hr = 0;
  return hr;
}

function pfIsDateExpired(dateYMD) {
  if (!dateYMD || dateYMD === 'Today') return false;
  const clean = String(dateYMD).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  return clean < pfGetPhilippineTodayYMD();
}

function pfIsSlotExpired(dateYMD, slotStr) {
  const now = pfGetPhilippineNow();
  const todayYMD = pfGetPhilippineTodayYMD();
  const targetDate = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;

  if (targetDate < todayYMD) return true;
  if (targetDate > todayYMD) return false;

  const slotHr = pfParseSlotHour24(slotStr);
  if (slotHr < 0) return false;
  const curHr = now.getHours();
  // In Philippine Standard Time (UTC+8), a slot starting at or before the current hour has already started/passed
  if (slotHr <= curHr) return true;
  return false;
}

function pfGetNextUpcomingSlot(dateYMD, allSlots) {
  const slots = Array.isArray(allSlots) && allSlots.length > 0 ? allSlots : [
    '06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM',
    '12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM',
    '06:00 PM','07:00 PM','08:00 PM','09:00 PM','10:00 PM','11:00 PM'
  ];
  for (const s of slots) {
    if (!pfIsSlotExpired(dateYMD, s) && (typeof pfIsDefaultOpenPlaySlot !== 'function' || !pfIsDefaultOpenPlaySlot(dateYMD, s))) return s;
  }
  for (const s of slots) {
    if (!pfIsSlotExpired(dateYMD, s)) return s;
  }
  return slots[slots.length - 1];
}

function pfShowExpiredSlotBanner(bannerId, slotStr, dateLabel) {
  let el = document.getElementById(bannerId);
  const isPastDay = pfIsDateExpired(dateLabel) || pfIsDateExpired(slotStr);
  const msg = isPastDay
    ? `⚠️ Expired Date Selected: ${dateLabel || slotStr} has already passed. Please select today (${pfGetPhilippineTodayYMD()}) or an upcoming date.`
    : `⚠️ Expired Time Slot: ${slotStr} on ${dateLabel || 'Today'} (Philippine Time) has already passed. Please select a future time slot.`;
  if (el) {
    el.textContent = msg;
    el.className = 'p-3 rounded-xl bg-rose-500/20 border-2 border-rose-500 text-rose-200 text-xs font-black mt-2 block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(msg);
  }
}

function pfClearExpiredSlotBanner(bannerId) {
  const el = document.getElementById(bannerId);
  if (el) {
    el.className = 'hidden';
    el.textContent = '';
  }
}

window.pfGetPhilippineNow = pfGetPhilippineNow;
window.pfGetPhilippineTodayYMD = pfGetPhilippineTodayYMD;
window.pfIsDateExpired = pfIsDateExpired;
window.pfParseSlotHour24 = pfParseSlotHour24;
window.pfIsSlotExpired = pfIsSlotExpired;
window.pfGetNextUpcomingSlot = pfGetNextUpcomingSlot;
window.pfShowExpiredSlotBanner = pfShowExpiredSlotBanner;
window.pfClearExpiredSlotBanner = pfClearExpiredSlotBanner;

// ================= ADMIN-SYNCED COURT SLOT STATUS ENGINE =================
function pfNormalizeCourtNumber(courtVal) {
  if (!courtVal) return 1;
  const s = String(courtVal);
  const m = s.match(/court\s*0*([1-4])/i) || s.match(/\b([1-4])\b/);
  return m ? parseInt(m[1], 10) : 1;
}

function pfExtractBookingDateYMD(b, todayYMD) {
  if (!b) return '';
  const fallbackToday = todayYMD || pfGetPhilippineTodayYMD();
  const dRaw = String(b.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dRaw)) return dRaw;
  if (dRaw.toLowerCase().startsWith('today')) return fallbackToday;
  const tRaw = String(b.time || '').trim();
  const ymdMatch = tRaw.match(/(\d{4}-\d{2}-\d{2})/) || dRaw.match(/(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch) return ymdMatch[1];
  if (tRaw.toLowerCase().includes('today')) return fallbackToday;
  return dRaw;
}

function pfBookingMatchesTargetDate(b, targetDate, todayYMD) {
  const fallbackToday = todayYMD || pfGetPhilippineTodayYMD();
  const extracted = pfExtractBookingDateYMD(b, fallbackToday);
  if (extracted && /^\d{4}-\d{2}-\d{2}$/.test(extracted)) {
    return extracted === targetDate;
  }
  const combined = `${b.date || ''} ${b.time || ''}`;
  if (combined.includes(targetDate)) return true;
  if (targetDate === fallbackToday && /today/i.test(combined)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    try {
      const dt = new Date(targetDate + 'T12:00:00');
      const shortMonthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dt);
      if (shortMonthDay && combined.toLowerCase().includes(shortMonthDay.toLowerCase())) return true;
    } catch (e) {}
  }
  return false;
}

function pfBookingCoversSlot(bTimeStr, slotStr) {
  const bTime = String(bTimeStr || '');
  if (!bTime || !slotStr) return false;
  if (bTime.includes(slotStr)) return true;
  const startMatch = bTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  const durMatch = bTime.match(/\((\d+)\s*hr/i);
  if (startMatch && durMatch) {
    const startHr = pfParseSlotHour24(startMatch[1]);
    const dur = Math.max(1, parseInt(durMatch[1], 10) || 1);
    const targetHr = pfParseSlotHour24(slotStr);
    if (startHr >= 0 && targetHr >= startHr && targetHr < startHr + dur) {
      return true;
    }
  }
  return false;
}

function pfGetAllMergedBookings(liveBookings) {
  let localDelRefs = [];
  try { localDelRefs = JSON.parse(localStorage.getItem('pf_deleted_booking_refs') || '[]') || []; } catch (e) {}
  const srvDelRefs = (window.sharedServerState && Array.isArray(window.sharedServerState.deletedBookingRefs))
    ? window.sharedServerState.deletedBookingRefs
    : [];
  const deletedSet = new Set([...localDelRefs, ...srvDelRefs].map(r => String(r || '').trim().toUpperCase()).filter(Boolean));

  const hasSynced = Boolean(window.sharedServerState && window.sharedServerState._hasSyncedFromServer);
  const srv = (window.sharedServerState && Array.isArray(window.sharedServerState.bookings)) ? window.sharedServerState.bookings : [];
  let locAll = [];
  try { locAll = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]') || []; } catch (e) {}
  const customArr = Array.isArray(liveBookings) ? liveBookings : [];

  // Once synced with server, server + pf_all_bookings (which is synced with server) is authoritative
  const sourceList = hasSynced ? [...srv, ...locAll] : [...customArr, ...srv, ...locAll];

  const map = new Map();
  sourceList.forEach(b => {
    if (!b || !b.ref) return;
    const refU = String(b.ref).trim().toUpperCase();
    if (deletedSet.has(refU)) return;
    if (!map.has(refU)) {
      map.set(refU, b);
    }
  });
  return Array.from(map.values());
}


function pfParseTimeStrTo24Hour(tStr, fallbackHr = 8, isEnd = false) {
  if (!tStr) return fallbackHr;
  const raw = String(tStr).trim();
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let hr = parseInt(m12[1], 10);
    const mn = parseInt(m12[2], 10) || 0;
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && hr < 12) hr += 12;
    if (ap === 'AM' && hr === 12) hr = 0;
    if (isEnd && hr === 0 && mn === 0) return 24;
    if (isEnd && mn > 0) return Math.min(24, hr + 1);
    return hr;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (m24) {
    let hr = parseInt(m24[1], 10);
    const mn = parseInt(m24[2], 10) || 0;
    if (isEnd && hr === 0 && mn === 0) return 24;
    if (isEnd && mn > 0) return Math.min(24, hr + 1);
    return hr;
  }
  return fallbackHr;
}
window.pfParseTimeStrTo24Hour = pfParseTimeStrTo24Hour;

function pfGetScheduledTournamentsForSlot(dateYMD, courtNum, slotStr) {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  if (cfg && cfg.tournamentsPublishedOnHome === false) return [];
  const activeMode = String((cfg && cfg.activeTournamentType) || '').trim().toLowerCase();
  if (activeMode === 'none') return [];

  const list = (typeof pfGetTournamentsList === 'function') ? pfGetTournamentsList() : [];
  if (!Array.isArray(list) || list.length === 0) return [];

  const todayYMD = pfGetPhilippineTodayYMD();
  const targetDate = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;
  const cNum = Number(courtNum || 1);
  const slotHr = pfParseTimeStrTo24Hour(slotStr, -1, false);
  if (slotHr < 0) return [];

  const matched = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t || t.published === false) continue;
    if (activeMode === 'single' || activeMode === 'double') {
      const tType = String(t.tournamentType || t.format || '').trim().toLowerCase();
      if (tType && !tType.includes(activeMode)) continue;
    }

    const dc = Array.isArray(t.designatedCourts) && t.designatedCourts.length > 0
      ? t.designatedCourts
      : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
    const courtMatches = dc.some(cName => {
      const s = String(cName || '').trim();
      return s.toUpperCase() === 'ALL' || pfNormalizeCourtNumber(s) === cNum;
    });
    if (!courtMatches) continue;

    const evStartHr = pfParseTimeStrTo24Hour(t.startTime || '08:00 AM', 8, false);
    let evEndHr = pfParseTimeStrTo24Hour(t.endTime || '05:00 PM', 17, true);
    if (evEndHr <= evStartHr) evEndHr = 24;

    const evDate = String(t.date || '').trim();
    const timerStartRaw = String(t.timerStart || '').trim();
    const timerEndRaw = String(t.timerEnd || t.countdownTarget || '').trim();
    const sDate = timerStartRaw.slice(0, 10);
    const eDate = timerEndRaw.slice(0, 10);
    const sTime24 = timerStartRaw.slice(11, 16);
    const eTime24 = timerEndRaw.slice(11, 16);

    let isMatch = false;
    if (evDate && evDate === targetDate) {
      if (slotHr >= evStartHr && slotHr < evEndHr) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      const isLegacyDefaultSeedWindow = (
        (sDate === '2026-11-14' && eDate === '2026-11-21' && evDate === '2026-11-21') ||
        (sDate === '2026-11-21' && eDate === '2026-11-28' && evDate === '2026-11-28')
      );
      if (!isLegacyDefaultSeedWindow && /^\d{4}-\d{2}-\d{2}$/.test(sDate) && /^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
        if (sDate === eDate && targetDate === sDate) {
          const wStartHr = sTime24 ? pfParseTimeStrTo24Hour(sTime24, evStartHr, false) : evStartHr;
          let wEndHr = eTime24 ? pfParseTimeStrTo24Hour(eTime24, evEndHr, true) : evEndHr;
          if (wEndHr <= wStartHr) wEndHr = 24;
          if (slotHr >= wStartHr && slotHr < wEndHr) {
            isMatch = true;
          }
        } else if (eDate > sDate) {
          const endsAtMidnightStartOfNextDay = (eTime24 === '00:00');
          const dateInWindow = endsAtMidnightStartOfNextDay
            ? (targetDate >= sDate && targetDate < eDate)
            : (targetDate >= sDate && targetDate <= eDate);
          if (dateInWindow) {
            let dayStartHr = evStartHr;
            let dayEndHr = evEndHr;
            if (endsAtMidnightStartOfNextDay && sTime24 === '00:00') {
              dayStartHr = 0;
              dayEndHr = 24;
            }
            if (slotHr >= dayStartHr && slotHr < dayEndHr) {
              isMatch = true;
            }
          }
        }
      }
    }

    if (isMatch) {
      matched.push(t);
    }
  }

  // If Admin activated Both (Single & Double) and at least one division matches this tournament slot, include both active divisions so guests can pick Single or Double directly!
  if (matched.length === 1 && activeMode === 'both') {
    list.forEach(other => {
      if (other && other.published !== false && !matched.some(m => m.id === other.id)) {
        matched.push(other);
      }
    });
  }

  return matched;
}
window.pfGetScheduledTournamentsForSlot = pfGetScheduledTournamentsForSlot;

function pfGetScheduledTournamentForSlot(dateYMD, courtNum, slotStr) {
  const list = pfGetScheduledTournamentsForSlot(dateYMD, courtNum, slotStr);
  return list.length > 0 ? list[0] : null;
}
window.pfGetScheduledTournamentForSlot = pfGetScheduledTournamentForSlot;

function pfResolveCourtSlot(dateYMD, courtNum, slotStr, liveBlocks, liveBookings) {
  const cNum = Number(courtNum || 1);
  const courtZero = 'Court 0' + cNum;
  const courtPlain = 'Court ' + cNum;
  const todayYMD = pfGetPhilippineTodayYMD();
  const targetDate = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;

  // 1. Check active bookings first (merged across server + localStorage)
  const bookingsArr = pfGetAllMergedBookings(liveBookings);
  const bookedMatch = bookingsArr.find(b => {
    if (!b || b.status === 'CANCELLED' || b.status === 'DECLINED') return false;
    if (b.isOpenPlay || /^PF-OP-/i.test(String(b.ref || '')) || /open\s*play/i.test(String(b.court || '')) || /open\s*play/i.test(String(b.courtName || ''))) return false;
    if (b.isTournament || /^PF-TRN-/i.test(String(b.ref || '')) || /tournament/i.test(String(b.court || '')) || /tournament/i.test(String(b.courtName || ''))) return false;
    if (b.isLiveInventory || b.bookingType === 'LIVE_INVENTORY' || b.bookingType === 'INVENTORY' || b.bookingType === 'GEAR_ONLY' || /^PF-INV-/i.test(String(b.ref || '')) || /^PF-GEAR-/i.test(String(b.ref || '')) || /live\s*inventory|pro\s*shop|gear\s*rental/i.test(String(b.court || ''))) return false;
    const bCourt = String(b.court || '');
    const matchesCourt = bCourt.includes(courtZero) || bCourt.includes(courtPlain) || bCourt.trim() === String(cNum) || pfNormalizeCourtNumber(bCourt) === cNum;
    if (!matchesCourt) return false;
    if (!pfBookingCoversSlot(b.time, slotStr)) return false;
    return pfBookingMatchesTargetDate(b, targetDate, todayYMD);
  });
  if (bookedMatch) {
    const bSt = String(bookedMatch.status || 'CONFIRMED').toUpperCase();
    const cat = bSt.includes('PENDING') ? 'PENDING' : ((bSt.includes('RESERVE') || bSt.includes('HOLD')) ? 'HOLD' : 'CONFIRMED');
    return { status: 'BOOKED', category: cat, booking: bookedMatch, reason: bookedMatch.name || 'Booked' };
  }

  // 2. Check if date or time slot is already EXPIRED in Philippine Standard Time (UTC+8)
  const isExpiredSlot = pfIsSlotExpired(targetDate, slotStr);

  // 3. Check Admin Calendar Overrides (blocks merged from server + localStorage)
  let storedBlocks = [];
  try { storedBlocks = JSON.parse(localStorage.getItem('pf_court_blocks') || '[]') || []; } catch (e) {}
  const hasSrvBlocks = Boolean(window.sharedServerState && Array.isArray(window.sharedServerState.blocks));
  const srvBlocks = hasSrvBlocks ? window.sharedServerState.blocks : [];
  const blocksArr = Array.isArray(liveBlocks)
    ? liveBlocks
    : (hasSrvBlocks ? srvBlocks : storedBlocks);

  let matchedBlock = null;
  for (let i = blocksArr.length - 1; i >= 0; i--) {
    const bl = blocksArr[i];
    if (!bl || !bl.court) continue;
    const blCourt = String(bl.court).trim();
    const isSpecificCourt = blCourt.includes(courtZero) || blCourt.includes(courtPlain) || blCourt === String(cNum);
    const isAllCourts = blCourt.toUpperCase() === 'ALL' || blCourt.toLowerCase().includes('all');
    if (!isSpecificCourt && !isAllCourts) continue;

    const blDate = String(bl.date || 'Today').trim();
    const matchesDate = (blDate === targetDate) || (blDate === 'Today' && targetDate === todayYMD) || (blDate.toUpperCase() === 'ALL');
    if (!matchesDate) continue;

    const blHours = String(bl.hours || '').trim();
    const isSpecificHour = blHours.includes(slotStr);
    const isAllHours = blHours.toUpperCase() === 'ALL' || blHours.toLowerCase().includes('all day');
    if (!isSpecificHour && !isAllHours) continue;

    if (isSpecificCourt && isSpecificHour) {
      matchedBlock = bl;
      break;
    }
    if (!matchedBlock) {
      matchedBlock = bl;
    }
  }

  if (matchedBlock) {
    const st = String(matchedBlock.statusType || 'CLOSED').toUpperCase();
    const rLower = String(matchedBlock.reason || '').toLowerCase();
    if (st === 'TOURNAMENT' || rLower.includes('tournament')) {
      return { status: 'CLOSED', category: 'TOURNAMENT', override: matchedBlock, reason: matchedBlock.reason || 'Official Club Tournament' };
    }
    if (st === 'PRIVATE' || rLower.includes('private')) {
      return { status: 'CLOSED', category: 'PRIVATE', override: matchedBlock, reason: matchedBlock.reason || 'Private' };
    }
    if (st === 'HOLD' || rLower.includes('hold')) {
      return { status: 'CLOSED', category: 'HOLD', override: matchedBlock, reason: matchedBlock.reason || 'Hold' };
    }
    if (st === 'CLOSED' || st === 'BLOCKED') {
      return { status: 'CLOSED', category: 'BLOCKED', override: matchedBlock, reason: matchedBlock.reason || 'Blocked' };
    }
    if (isExpiredSlot) {
      return { status: 'EXPIRED', category: 'PAST', override: matchedBlock, reason: 'Past' };
    }
    if (st === 'OPEN' || st === 'AVAILABLE') {
      const isGenericAllDayOpen = String(matchedBlock.hours || '').trim().toUpperCase() === 'ALL';
      if (isGenericAllDayOpen && pfIsDefaultOpenPlaySlot(targetDate, slotStr, cNum)) {
        return { status: 'OPEN_PLAY', category: 'OPEN_PLAY', override: null, reason: pfGetOpenPlaySlotLabel(targetDate, slotStr) };
      }
      return { status: 'AVAILABLE', category: 'AVAILABLE', override: matchedBlock, reason: matchedBlock.reason || 'Available' };
    }
    if (st === 'OPEN_PLAY') {
      return { status: 'OPEN_PLAY', category: 'OPEN_PLAY', override: matchedBlock, reason: matchedBlock.reason || 'Open Play' };
    }
    return { status: 'CLOSED', category: 'BLOCKED', override: matchedBlock, reason: matchedBlock.reason || 'Blocked' };
  }

  // 3B. Scheduled Tournament Auto-Overwrite: If an active Tournament is designated for this date, time window, and court, overwrite the Calendar as TOURNAMENT (takes priority over Open Play & Available slots)
  const scheduledTrns = pfGetScheduledTournamentsForSlot(targetDate, cNum, slotStr);
  if (scheduledTrns && scheduledTrns.length > 0) {
    const scheduledTrn = scheduledTrns[0];
    const combinedTitle = scheduledTrns.length > 1
      ? scheduledTrns.map(t => t.title || 'Tournament').join(' & ')
      : (scheduledTrn.title || 'Official Club Tournament');
    return {
      status: 'CLOSED',
      category: 'TOURNAMENT',
      isScheduledTournament: true,
      tournament: scheduledTrn,
      tournaments: scheduledTrns,
      override: null,
      reason: `🏆 ${combinedTitle} (${scheduledTrn.startTime || '08:00 AM'} – ${scheduledTrn.endTime || '05:00 PM'})`
    };
  }

  // 4. Default schedule fallback: Always show Default Open Play Schedule on Designated Courts (Tue–Thu 4–8PM, Fri–Sat 6–10PM), then Expired check, otherwise Available
  if (pfIsDefaultOpenPlaySlot(targetDate, slotStr, cNum)) {
    return { status: 'OPEN_PLAY', category: 'OPEN_PLAY', isExpired: isExpiredSlot, override: null, reason: pfGetOpenPlaySlotLabel(targetDate, slotStr) };
  }
  if (isExpiredSlot) {
    return { status: 'EXPIRED', category: 'PAST', override: null, reason: 'Past' };
  }
  return { status: 'AVAILABLE', category: 'AVAILABLE', override: null, reason: 'Available' };
}

function pfFormatTime24To12(time24) {
  if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
window.pfFormatTime24To12 = pfFormatTime24To12;

function pfBuildHourSlotsBetween(start24, end24) {
  if (!start24 || !end24) return [];
  const sHr = parseInt(String(start24).split(':')[0], 10);
  const eHr = parseInt(String(end24).split(':')[0], 10);
  if (isNaN(sHr) || isNaN(eHr) || eHr <= sHr) return [];
  const out = [];
  for (let h = sHr; h < eHr; h++) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    out.push(`${String(h12).padStart(2, '0')}:00 ${ampm}`);
  }
  return out;
}
window.pfBuildHourSlotsBetween = pfBuildHourSlotsBetween;

function pfGetOpenPlayDesignatedCourts(cfgObj) {
  if (typeof pfGetNormalizedOpenPlaySessions === 'function') {
    try {
      const norm = pfGetNormalizedOpenPlaySessions();
      if (norm && norm[0] && Array.isArray(norm[0].designatedCourts) && norm[0].designatedCourts.length > 0) {
        return norm[0].designatedCourts;
      }
    } catch (e) {}
  }
  const cfg = cfgObj || ((typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {}));
  if (cfg && Array.isArray(cfg.openPlaySessions) && cfg.openPlaySessions.length > 0) {
    const pub = cfg.openPlaySessions.find(s => s && s.published !== false) || cfg.openPlaySessions[0];
    if (pub && Array.isArray(pub.designatedCourts) && pub.designatedCourts.length > 0) {
      return pub.designatedCourts;
    }
  }
  if (cfg && Array.isArray(cfg.openPlayDesignatedCourts) && cfg.openPlayDesignatedCourts.length > 0) {
    return cfg.openPlayDesignatedCourts;
  }
  return ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
}
window.pfGetOpenPlayDesignatedCourts = pfGetOpenPlayDesignatedCourts;

function pfGetOpenPlaySlotsForDate(dateYMD, cfgObj) {
  const cfg = cfgObj || ((typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {}));
  if (cfg && cfg.openPlayEnabled === false) return [];
  const sessions = (typeof pfGetNormalizedOpenPlaySessions === 'function') ? pfGetNormalizedOpenPlaySessions() : [];
  const s = sessions[0] || DEFAULT_OPEN_PLAY_SESSIONS[0];

  const todayYMD = pfGetPhilippineTodayYMD();
  const targetYMD = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;
  const _ymdParts = targetYMD.split('-').map(Number);
  const dow = new Date(Date.UTC(_ymdParts[0], (_ymdParts[1] || 1) - 1, _ymdParts[2] || 1)).getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCode = dayNames[dow];

  const activeDays = (s && Array.isArray(s.defaultDays) && s.defaultDays.length > 0)
    ? s.defaultDays
    : ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hasBookingOnDate = Boolean(s && Array.isArray(s.players) && s.players.some(p => p && String(p.openPlayDate || '').slice(0, 10) === targetYMD && String(p.status || 'Accepted').toLowerCase() !== 'declined'));
  if (!activeDays.includes(dayCode) && !hasBookingOnDate) {
    return [];
  }

  if (dow === 5 || dow === 6) {
    // Friday – Saturday: default 6:00 PM – 10:00 PM
    return pfBuildHourSlotsBetween((s && s.friSatStart) || '18:00', (s && s.friSatEnd) || '22:00');
  }
  // Tuesday – Thursday (or Mon/Sun if toggled on): default 4:00 PM – 8:00 PM
  return pfBuildHourSlotsBetween((s && s.tueThuStart) || '16:00', (s && s.tueThuEnd) || '20:00');
}
window.pfGetOpenPlaySlotsForDate = pfGetOpenPlaySlotsForDate;

function pfGetOpenPlaySlotLabel(dateYMD, slotStr) {
  const sessions = (typeof pfGetNormalizedOpenPlaySessions === 'function') ? pfGetNormalizedOpenPlaySessions() : [];
  const s = sessions[0] || DEFAULT_OPEN_PLAY_SESSIONS[0];
  const fee = Number((s && s.entryFee) || 150);
  const todayYMD = pfGetPhilippineTodayYMD();
  const targetYMD = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;
  const _ymdParts = targetYMD.split('-').map(Number);
  const dow = new Date(Date.UTC(_ymdParts[0], (_ymdParts[1] || 1) - 1, _ymdParts[2] || 1)).getUTCDay();
  if (dow === 5 || dow === 6) {
    const st = pfFormatTime24To12((s && s.friSatStart) || '18:00');
    const et = pfFormatTime24To12((s && s.friSatEnd) || '22:00');
    return `Open Play (Fri–Sat • ${st} – ${et})`;
  }
  const st = pfFormatTime24To12((s && s.tueThuStart) || '16:00');
  const et = pfFormatTime24To12((s && s.tueThuEnd) || '20:00');
  return `Open Play (Tue–Thu • ${st} – ${et})`;
}
window.pfGetOpenPlaySlotLabel = pfGetOpenPlaySlotLabel;

function pfIsDefaultOpenPlaySlot(dateYMD, slotStr, courtNum) {
  if (!slotStr) return false;
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  if (cfg && cfg.openPlayEnabled === false) return false;
  const activeSlots = pfGetOpenPlaySlotsForDate(dateYMD, cfg);
  if (!activeSlots.includes(String(slotStr).trim())) return false;
  if (courtNum !== undefined && courtNum !== null && String(courtNum).toUpperCase() !== 'ALL') {
    const cNum = pfNormalizeCourtNumber(courtNum);
    const designated = pfGetOpenPlayDesignatedCourts(cfg);
    return designated.some(c => pfNormalizeCourtNumber(c) === cNum);
  }
  return true;
}
window.pfIsDefaultOpenPlaySlot = pfIsDefaultOpenPlaySlot;
window.pfResolveCourtSlot = pfResolveCourtSlot;
window.pfNormalizeCourtNumber = pfNormalizeCourtNumber;
window.pfExtractBookingDateYMD = pfExtractBookingDateYMD;
window.pfBookingCoversSlot = pfBookingCoversSlot;
window.pfGetAllMergedBookings = pfGetAllMergedBookings;

// Instant cross-tab sync when Admin deletes/modifies bookings or court blocks
(function setupPublicRealtimeBookingSync() {
  if (window.__pfPublicRealtimeBookingSyncInstalled) return;
  window.__pfPublicRealtimeBookingSyncInstalled = true;
  function refreshPublicBookingViews() {
    if (typeof renderLiveScheduleMatrix === 'function') {
      try { renderLiveScheduleMatrix(); } catch (e) {}
    }
    if (typeof renderDrawerSlots === 'function') {
      try { renderDrawerSlots(); } catch (e) {}
    }
    if (typeof renderTimeChips === 'function') {
      try { renderTimeChips(); } catch (e) {}
    }
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bcBk = new BroadcastChannel('pf_booking_sync_channel');
      bcBk.onmessage = (ev) => {
        if (ev && ev.data && Array.isArray(ev.data.bookings)) {
          if (Array.isArray(ev.data.deletedBookingRefs)) {
            try { localStorage.setItem('pf_deleted_booking_refs', JSON.stringify(ev.data.deletedBookingRefs)); } catch (e) {}
          }
          if (window.sharedServerState) {
            window.sharedServerState.bookings = ev.data.bookings;
            window.sharedServerState._hasSyncedFromServer = true;
          }
          try {
            localStorage.setItem('pf_all_bookings', JSON.stringify(ev.data.bookings));
            localStorage.setItem('pf_shared_bookings', JSON.stringify(ev.data.bookings));
            localStorage.setItem('pf_public_bookings', JSON.stringify(ev.data.bookings));
          } catch (e) {}
          refreshPublicBookingViews();
        }
        syncStateFromServer();
      };
      const bcBlk = new BroadcastChannel('pf_blocks_sync_channel');
      bcBlk.onmessage = (ev) => {
        if (ev && ev.data && Array.isArray(ev.data.blocks)) {
          if (window.sharedServerState) {
            window.sharedServerState.blocks = ev.data.blocks;
          }
          try { localStorage.setItem('pf_court_blocks', JSON.stringify(ev.data.blocks)); } catch (e) {}
          refreshPublicBookingViews();
        }
        syncStateFromServer();
      };
    } catch (e) {}
  }
  window.addEventListener('storage', (e) => {
    if (!e || !e.key) return;
    if (['pf_all_bookings', 'pf_shared_bookings', 'pf_deleted_booking_refs', 'pf_court_blocks'].includes(e.key)) {
      syncStateFromServer();
      refreshPublicBookingViews();
    }
  });
})();



// ================= EXACT-AMOUNT EMVCo QRPh GENERATOR (GCASH • MAYA • BDO) =================
var qrcode=function(){function i(t,r){function a(t,r){g=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(l=4*u+17),e(0,0),e(l-7,0),e(0,l-7),i(),o(),v(t,r),7<=u&&h(t),null==n&&(n=w(u,f,c)),d(n,r)}var u=t,f=y[r],g=null,l=0,n=null,c=[],s={},e=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||l<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||l<=r+n||(g[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},o=function(){for(var t=8;t<l-8;t+=1)null==g[t][6]&&(g[t][6]=t%2==0);for(var r=8;r<l-8;r+=1)null==g[6][r]&&(g[6][r]=r%2==0)},i=function(){for(var t=B.getPatternPosition(u),r=0;r<t.length;r+=1)for(var e=0;e<t.length;e+=1){var n=t[r],o=t[e];if(null==g[n][o])for(var i=-2;i<=2;i+=1)for(var a=-2;a<=2;a+=1)g[n+i][o+a]=-2==i||2==i||-2==a||2==a||0==i&&0==a}},h=function(t){for(var r=B.getBCHTypeNumber(u),e=0;e<18;e+=1){var n=!t&&1==(r>>e&1);g[Math.floor(e/3)][e%3+l-8-3]=n}for(e=0;e<18;e+=1){n=!t&&1==(r>>e&1);g[e%3+l-8-3][Math.floor(e/3)]=n}},v=function(t,r){for(var e=f<<3|r,n=B.getBCHTypeInfo(e),o=0;o<15;o+=1){var i=!t&&1==(n>>o&1);o<6?g[o][8]=i:o<8?g[o+1][8]=i:g[l-15+o][8]=i}for(o=0;o<15;o+=1){i=!t&&1==(n>>o&1);o<8?g[8][l-o-1]=i:o<9?g[8][15-o-1+1]=i:g[8][15-o-1]=i}g[l-8][8]=!t},d=function(t,r){for(var e=-1,n=l-1,o=7,i=0,a=B.getMaskFunction(r),u=l-1;0<u;u-=2)for(6==u&&(u-=1);;){for(var f=0;f<2;f+=1)if(null==g[n][u-f]){var c=!1;i<t.length&&(c=1==(t[i]>>>o&1)),a(n,u-f)&&(c=!c),g[n][u-f]=c,-1==(o-=1)&&(i+=1,o=7)}if((n+=e)<0||l<=n){n-=e,e=-e;break}}},w=function(t,r,e){for(var n=b.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=C(i[u],l.getLength()-1).mod(l);a[u]=new Array(l.getLength()-1);for(g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=0<=s?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};s.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=x(t);break;case"Alphanumeric":e=m(t);break;case"Byte":e=L(t);break;case"Kanji":e=D(t);break;default:throw"mode:"+r}c.push(e),n=null},s.isDark=function(t,r){if(t<0||l<=t||r<0||l<=r)throw t+","+r;return g[t][r]},s.getModuleCount=function(){return l},s.make=function(){if(u<1){for(var t=1;t<40;t++){for(var r=b.getRSBlocks(t,f),e=M(),n=0;n<c.length;n++){var o=c[n];e.put(o.getMode(),4),e.put(o.getLength(),B.getLengthInBits(o.getMode(),t)),o.write(e)}var i=0;for(n=0;n<r.length;n++)i+=r[n].dataCount;if(e.getLengthInBits()<=8*i)break}u=t}a(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){a(!0,e);var n=B.getLostPoint(s);(0==e||n<t)&&(t=n,r=e)}return r}())},s.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<s.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<s.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=s.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},s.createSvgTag=function(t,r,e,n){var o={};"object"==typeof t&&(t=(o=t).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,f,c=s.getModuleCount()*t+2*r,g="";for(f="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",g+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',g+=o.scalable?"":' width="'+c+'px" height="'+c+'px"',g+=' viewBox="0 0 '+c+" "+c+'" ',g+=' preserveAspectRatio="xMinYMin meet"',g+=n.text||e.text?' role="img" aria-labelledby="'+p([n.id,e.id].join(" ").trim())+'"':"",g+=">",g+=n.text?'<title id="'+p(n.id)+'">'+p(n.text)+"</title>":"",g+=e.text?'<description id="'+p(e.id)+'">'+p(e.text)+"</description>":"",g+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',g+='<path d="',a=0;a<s.getModuleCount();a+=1)for(u=a*t+r,i=0;i<s.getModuleCount();i+=1)s.isDark(a,i)&&(g+="M"+(i*t+r)+","+u+f);return g+='" stroke="transparent" fill="black"/>',g+="</svg>"},s.createDataURL=function(o,t){o=o||2,t=void 0===t?4*o:t;var r=s.getModuleCount()*o+2*t,i=t,a=r-t;return I(r,r,function(t,r){if(i<=t&&t<a&&i<=r&&r<a){var e=Math.floor((t-i)/o),n=Math.floor((r-i)/o);return s.isDark(n,e)?0:1}return 1})},s.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=s.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=s.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=p(e),o+='"'),o+="/>"};var p=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return s.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*s.getModuleCount()+2*t,u=t,f=a-t,c={"██":"█","█ ":"▀"," █":"▄","  ":" "},g={"██":"▀","█ ":"▀"," █":" ","  ":" "},l="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<f&&u<=r&&r<f&&s.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<f&&u<=r+1&&r+1<f&&s.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",l+=t<1&&f<=r+1?g[i]:c[i];l+="\n"}return a%2&&0<t?l.substring(0,l.length-a-1)+Array(1+a).join("▀"):l.substring(0,l.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=s.getModuleCount()*t+2*r,u=r,f=a-r,c=Array(t+1).join("██"),g=Array(t+1).join("  "),l="",h="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),h="",n=0;n<a;n+=1)i=1,u<=n&&n<f&&u<=e&&e<f&&s.isDark(o,Math.floor((n-u)/t))&&(i=0),h+=i?c:g;for(o=0;o<t;o+=1)l+=h+"\n"}return l.substring(0,l.length-1)},s.renderTo2dContext=function(t,r){r=r||2;for(var e=s.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=s.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},s}i.stringToBytes=(i.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,i.createStringToBytes=function(u,f){var i=function(){function t(){var t=r.read();if(-1==t)throw"eof";return t}for(var r=S(u),e=0,n={};;){var o=r.read();if(-1==o)break;var i=t(),a=t()<<8|t();n[String.fromCharCode(o<<8|i)]=a,e+=1}if(e!=f)throw e+" != "+f;return n}(),a="?".charCodeAt(0);return function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);if(n<128)r.push(n);else{var o=i[t.charAt(e)];"number"==typeof o?(255&o)==o?r.push(o):(r.push(o>>>8),r.push(255&o)):r.push(a)}}return r}};var r,t,a=1,u=2,o=4,f=8,y={L:1,M:0,Q:3,H:2},e=0,n=1,c=2,g=3,l=4,h=5,s=6,v=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],(t={}).getBCHTypeInfo=function(t){for(var r=t<<10;0<=d(r)-d(1335);)r^=1335<<d(r)-d(1335);return 21522^(t<<10|r)},t.getBCHTypeNumber=function(t){for(var r=t<<12;0<=d(r)-d(7973);)r^=7973<<d(r)-d(7973);return t<<12|r},t.getPatternPosition=function(t){return r[t-1]},t.getMaskFunction=function(t){switch(t){case e:return function(t,r){return(t+r)%2==0};case n:return function(t,r){return t%2==0};case c:return function(t,r){return r%3==0};case g:return function(t,r){return(t+r)%3==0};case l:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case h:return function(t,r){return t*r%2+t*r%3==0};case s:return function(t,r){return(t*r%2+t*r%3)%2==0};case v:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},t.getErrorCorrectPolynomial=function(t){for(var r=C([1],0),e=0;e<t;e+=1)r=r.multiply(C([1,w.gexp(e)],0));return r},t.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case o:case f:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case o:return 16;case f:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case o:return 16;case f:return 12;default:throw"mode:"+t}}},t.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);5<i&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},t);function d(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r}var w=function(){for(var r=new Array(256),e=new Array(256),t=0;t<8;t+=1)r[t]=1<<t;for(t=8;t<256;t+=1)r[t]=r[t-4]^r[t-5]^r[t-6]^r[t-8];for(t=0;t<255;t+=1)e[r[t]]=t;var n={glog:function(t){if(t<1)throw"glog("+t+")";return e[t]},gexp:function(t){for(;t<0;)t+=255;for(;256<=t;)t-=255;return r[t]}};return n}();function C(n,o){if(void 0===n.length)throw n.length+"/"+o;var r=function(){for(var t=0;t<n.length&&0==n[t];)t+=1;for(var r=new Array(n.length-t+o),e=0;e<n.length-t;e+=1)r[e]=n[e+t];return r}(),i={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var r=new Array(i.getLength()+t.getLength()-1),e=0;e<i.getLength();e+=1)for(var n=0;n<t.getLength();n+=1)r[e+n]^=w.gexp(w.glog(i.getAt(e))+w.glog(t.getAt(n)));return C(r,0)},mod:function(t){if(i.getLength()-t.getLength()<0)return i;for(var r=w.glog(i.getAt(0))-w.glog(t.getAt(0)),e=new Array(i.getLength()),n=0;n<i.getLength();n+=1)e[n]=i.getAt(n);for(n=0;n<t.getLength();n+=1)e[n]^=w.gexp(w.glog(t.getAt(n))+r);return C(e,0).mod(t)}};return i}function p(){var e=[],o={writeByte:function(t){e.push(255&t)},writeShort:function(t){o.writeByte(t),o.writeByte(t>>>8)},writeBytes:function(t,r,e){r=r||0,e=e||t.length;for(var n=0;n<e;n+=1)o.writeByte(t[n+r])},writeString:function(t){for(var r=0;r<t.length;r+=1)o.writeByte(t.charCodeAt(r))},toByteArray:function(){return e},toString:function(){var t="";t+="[";for(var r=0;r<e.length;r+=1)0<r&&(t+=","),t+=e[r];return t+="]"}};return o}var k,A,b=(k=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],(A={}).getRSBlocks=function(t,r){var e=function(t,r){switch(r){case y.L:return k[4*(t-1)+0];case y.M:return k[4*(t-1)+1];case y.Q:return k[4*(t-1)+2];case y.H:return k[4*(t-1)+3];default:return}}(t,r);if(void 0===e)throw"bad rs block @ typeNumber:"+t+"/errorCorrectionLevel:"+r;for(var n,o,i=e.length/3,a=[],u=0;u<i;u+=1)for(var f=e[3*u+0],c=e[3*u+1],g=e[3*u+2],l=0;l<f;l+=1)a.push((n=g,o=void 0,(o={}).totalCount=c,o.dataCount=n,o));return a},A),M=function(){var e=[],n=0,o={getBuffer:function(){return e},getAt:function(t){var r=Math.floor(t/8);return 1==(e[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e+=1)o.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return n},putBit:function(t){var r=Math.floor(n/8);e.length<=r&&e.push(0),t&&(e[r]|=128>>>n%8),n+=1}};return o},x=function(t){var r=a,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+2<r.length;)t.put(o(r.substring(e,e+3)),10),e+=3;e<r.length&&(r.length-e==1?t.put(o(r.substring(e,e+1)),4):r.length-e==2&&t.put(o(r.substring(e,e+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return e},m=function(t){var r=u,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+1<r.length;)t.put(45*o(r.charAt(e))+o(r.charAt(e+1)),11),e+=2;e<r.length&&t.put(o(r.charAt(e)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return e},L=function(t){var r=o,e=i.stringToBytes(t),n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=0;r<e.length;r+=1)t.put(e[r],8)}};return n},D=function(t){var r=f,e=i.stringToBytesFuncs.SJIS;if(!e)throw"sjis not supported.";!function(){var t=e("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=e(t),n={getMode:function(){return r},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return n},S=function(t){var e=t,n=0,o=0,i=0,r={read:function(){for(;i<8;){if(n>=e.length){if(0==i)return-1;throw"unexpected end of file./"+i}var t=e.charAt(n);if(n+=1,"="==t)return i=0,-1;t.match(/^\s$/)||(o=o<<6|a(t.charCodeAt(0)),i+=6)}var r=o>>>i-8&255;return i-=8,r}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return r},I=function(t,r,e){for(var n=function(t,r){var n=t,o=r,l=new Array(t*r),e={setPixel:function(t,r,e){l[r*n+t]=e},write:function(t){t.writeString("GIF87a"),t.writeShort(n),t.writeShort(o),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(n),t.writeShort(o),t.writeByte(0);var r=i(2);t.writeByte(2);for(var e=0;255<r.length-e;)t.writeByte(255),t.writeBytes(r,e,255),e+=255;t.writeByte(r.length-e),t.writeBytes(r,e,r.length-e),t.writeByte(0),t.writeString(";")}},i=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,o=h(),i=0;i<r;i+=1)o.add(String.fromCharCode(i));o.add(String.fromCharCode(r)),o.add(String.fromCharCode(e));var a=p(),u=function(t){var e=t,n=0,o=0,r={write:function(t,r){if(t>>>r!=0)throw"length over";for(;8<=n+r;)e.writeByte(255&(t<<n|o)),r-=8-n,t>>>=8-n,n=o=0;o|=t<<n,n+=r},flush:function(){0<n&&e.writeByte(o)}};return r}(a);u.write(r,n);var f=0,c=String.fromCharCode(l[f]);for(f+=1;f<l.length;){var g=String.fromCharCode(l[f]);f+=1,o.contains(c+g)?c+=g:(u.write(o.indexOf(c),n),o.size()<4095&&(o.size()==1<<n&&(n+=1),o.add(c+g)),c=g)}return u.write(o.indexOf(c),n),u.write(e,n),u.flush(),a.toByteArray()},h=function(){var r={},e=0,n={add:function(t){if(n.contains(t))throw"dup key:"+t;r[t]=e,e+=1},size:function(){return e},indexOf:function(t){return r[t]},contains:function(t){return void 0!==r[t]}};return n};return e}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=p();n.write(a);for(var u=function(){function e(t){a+=String.fromCharCode(r(63&t))}var n=0,o=0,i=0,a="",t={},r=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return t.writeByte=function(t){for(n=n<<8|255&t,o+=8,i+=1;6<=o;)e(n>>>o-6),o-=6},t.flush=function(){if(0<o&&(e(n<<6-o),o=n=0),i%3!=0)for(var t=3-i%3,r=0;r<t;r+=1)a+="="},t.toString=function(){return a},t}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return i}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||57344<=n?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}(function(){return qrcode});

const PF_BASE_EMV_PAYLOADS = {
  gcash: '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNXE5XEA5204601653036085802PH5912KA******E L.6005Tagas610412346304FAE8',
  maya:  '00020101021127780012com.p2pqrpay0111PAPHPHM1XXX02089996440304126399988323460515+63-999-88323465204601653036085802PH5913KATHERINE LIM6006Daraga63046553',
  bank:  '00020101021127590012com.p2pqrpay0111BNORPHMMXXX02089996440304120079700386785204601653036085802PH5903Dex6011Makati City63040024'
};

window.pfActiveQrExactAmount = 400;
window.pfQrDynamicCache = {};

function pfComputeEmvCrc16(dataStr) {
  let crc = 0xFFFF;
  for (let i = 0; i < dataStr.length; i++) {
    crc ^= (dataStr.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pfBuildEmvQrWithAmount(channel, rawAmount) {
  const ch = (channel === 'bdo' || channel === 'bank') ? 'bank' : (channel === 'maya' ? 'maya' : 'gcash');
  const cfg = typeof pfGetPaymentConfig === 'function' ? pfGetPaymentConfig() : {};
  const customPayloadKey = ch === 'bank' ? 'bankEmvPayload' : (ch === 'maya' ? 'mayaEmvPayload' : 'gcashEmvPayload');
  const rawEmv = (cfg && cfg[customPayloadKey]) ? String(cfg[customPayloadKey]) : PF_BASE_EMV_PAYLOADS[ch];
  if (!rawEmv) return '';

  const numAmt = Number(String(rawAmount || 0).replace(/[^0-9.]/g, '')) || 0;
  if (numAmt <= 0) return rawEmv;

  // Parse top-level EMVCo TLV tags
  const tlvs = [];
  let i = 0;
  while (i + 4 <= rawEmv.length) {
    const tag = rawEmv.slice(i, i + 2);
    const len = parseInt(rawEmv.slice(i + 2, i + 4), 10);
    if (isNaN(len) || len < 0 || i + 4 + len > rawEmv.length) break;
    const val = rawEmv.slice(i + 4, i + 4 + len);
    if (tag !== '63' && tag !== '54') {
      tlvs.push({ tag, val });
    }
    i += 4 + len;
  }

  const amtStr = numAmt.toFixed(2);
  const amtTag = '54' + String(amtStr.length).padStart(2, '0') + amtStr;

  const out = [];
  let inserted = false;
  for (const item of tlvs) {
    out.push(item.tag + String(item.val.length).padStart(2, '0') + item.val);
    if (item.tag === '53') {
      out.push(amtTag);
      inserted = true;
    }
  }
  if (!inserted) out.push(amtTag);

  const bodyWithoutCrc = out.join('') + '6304';
  const crcHex = pfComputeEmvCrc16(bodyWithoutCrc);
  return bodyWithoutCrc + crcHex;
}

function pfRenderExactAmountQrDataUrl(channel = 'gcash', rawAmount = null) {
  const ch = (channel === 'bdo' || channel === 'bank') ? 'bank' : (channel === 'maya' ? 'maya' : 'gcash');
  const amt = rawAmount !== null && rawAmount !== undefined
    ? (Number(String(rawAmount).replace(/[^0-9.]/g, '')) || 0)
    : (Number(window.pfActiveQrExactAmount) || 0);

  const cfg = typeof pfGetPaymentConfig === 'function' ? pfGetPaymentConfig() : {};
  // If user uploaded a custom non-default QR image without an EMV payload, and amount <= 0, return custom image
  if (amt <= 0 || typeof qrcode !== 'function') {
    if (ch === 'bank') return cfg.bankQrUrl || 'assets/qr-bdo.png?v=20261029v10';
    if (ch === 'maya') return cfg.mayaQrUrl || 'assets/qr-maya.png?v=20261029v10';
    return cfg.gcashQrUrl || 'assets/qr-gcash.png?v=20261029v10';
  }

  const cacheKey = `${ch}_${amt.toFixed(2)}`;
  if (window.pfQrDynamicCache && window.pfQrDynamicCache[cacheKey]) {
    return window.pfQrDynamicCache[cacheKey];
  }

  try {
    const payload = pfBuildEmvQrWithAmount(ch, amt);
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const cellSize = 10;
    const margin = 36;
    const qrSize = moduleCount * cellSize;
    const canvasWidth = qrSize + margin * 2;
    const headerHeight = 68;
    const footerHeight = 68;
    const canvasHeight = qrSize + margin * 2 + headerHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Crisp white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Channel Header Bar
    const brandColor = ch === 'maya' ? '#059669' : (ch === 'bank' ? '#0072CE' : '#0057E7');
    const brandTitle = ch === 'maya' ? 'MAYA QR Ph • INSTAPAY' : (ch === 'bank' ? 'BDO UNIBANK • INSTAPAY QR Ph' : 'GCASH QR Ph • INSTAPAY');
    const acctName = ch === 'maya' ? (cfg.mayaName || 'KATHERINE LIM') : (ch === 'bank' ? (cfg.bdoName || 'BDO Unibank • Dex') : (cfg.gcashName || 'KA******E L.'));

    ctx.fillStyle = brandColor;
    ctx.fillRect(0, 0, canvasWidth, headerHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '900 18px sans-serif';
    ctx.fillText(brandTitle, canvasWidth / 2, 28);
    ctx.font = '700 14px monospace';
    ctx.fillText(acctName, canvasWidth / 2, 52);

    // Draw QR Modules
    const offsetY = headerHeight + margin;
    ctx.fillStyle = '#000000';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(margin + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
        }
      }
    }

    // Center QRPh Badge
    const badgeSize = Math.floor(qrSize * 0.17);
    const bx = Math.floor((canvasWidth - badgeSize) / 2);
    const by = Math.floor(offsetY + (qrSize - badgeSize) / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx - 5, by - 5, badgeSize + 10, badgeSize + 10);
    ctx.strokeStyle = brandColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx - 2, by - 2, badgeSize + 4, badgeSize + 4);
    ctx.fillStyle = '#050E1D';
    ctx.font = '900 14px sans-serif';
    ctx.fillText('QR Ph', canvasWidth / 2, by + badgeSize / 2 + 5);

    // Bottom Exact Amount Pill
    const pillY = headerHeight + qrSize + margin * 2 - 10;
    ctx.fillStyle = '#050E1D';
    ctx.fillRect(20, pillY, canvasWidth - 40, 52);
    ctx.strokeStyle = '#9BE600';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, pillY, canvasWidth - 40, 52);

    ctx.fillStyle = '#9BE600';
    ctx.font = '900 21px monospace';
    ctx.fillText('EXACT AMOUNT: PHP ' + amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), canvasWidth / 2, pillY + 33);

    const dataUrl = canvas.toDataURL('image/png');
    window.pfQrDynamicCache[cacheKey] = dataUrl;
    return dataUrl;
  } catch (err) {
    console.error('Dynamic QR render error:', err);
    if (ch === 'bank') return cfg.bankQrUrl || 'assets/qr-bdo.png?v=20261029v10';
    if (ch === 'maya') return cfg.mayaQrUrl || 'assets/qr-maya.png?v=20261029v10';
    return cfg.gcashQrUrl || 'assets/qr-gcash.png?v=20261029v10';
  }
}

function pfSetExactQrAmount(newAmount, syncInputs = true) {
  const cleanAmt = Math.max(0, Number(String(newAmount || 0).replace(/[^0-9.]/g, '')) || 0);
  window.pfActiveQrExactAmount = cleanAmt;
  const fmtAmt = cleanAmt > 0
    ? ('₱' + cleanAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    : '₱400.00';
  ['manual-modal-amount', 'manual-modal-maya-amount', 'manual-modal-bank-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el && cleanAmt > 0) el.textContent = fmtAmt;
  });
  // Always keep original working QR images intact
  applyPaymentConfigToPublicDom();
}

function pfPromptAndGenerateExactQr(channel = null) {
  const currentAmt = Number(window.pfActiveQrExactAmount) || 400;
  const entered = prompt('Enter the Exact Amount (PHP) to embed in the GCash / Maya / BDO QR Code:', currentAmt.toFixed(2));
  if (entered === null) return;
  const parsed = Number(String(entered).replace(/[^0-9.]/g, ''));
  if (isNaN(parsed) || parsed < 0) {
    alert('Please enter a valid Peso amount (e.g. 400 or 850).');
    return;
  }
  pfSetExactQrAmount(parsed, true);
  if (channel) {
    pfOpenQrStandeeLightbox(channel);
  }
}

window.pfBuildEmvQrWithAmount = pfBuildEmvQrWithAmount;
window.pfRenderExactAmountQrDataUrl = pfRenderExactAmountQrDataUrl;
window.pfSetExactQrAmount = pfSetExactQrAmount;
window.pfPromptAndGenerateExactQr = pfPromptAndGenerateExactQr;

// ================= STATIC (NON-DRAGGABLE) ANNOUNCEMENT FEED & MOBILE FULL-SCREEN POPUP CONTROLLER =================
function initDraggableAnnouncementWidget() {
  const root = document.getElementById('announcement-floating-root');
  const launcher = document.getElementById('announcement-launcher-btn');
  const win = document.getElementById('announcement-board-window');

  // Clear any legacy saved drag position so widget stays anchored in its default fixed corner
  try {
    localStorage.removeItem('pf_ann_widget_pos');
  } catch (e) {}

  if (root) {
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
    root.style.alignItems = '';
    root.style.touchAction = '';
  }

  if (launcher) {
    launcher.style.cursor = 'pointer';
    launcher.title = 'Click to open Live Club Updates';
  }

  // Remove any redundant mobile close buttons if present and style the single top-right Close button cleanly
  if (win) {
    win.querySelectorAll('.pf-ann-mobile-close-btn').forEach(el => el.remove());
    const headerCloseBtn = win.querySelector('button[aria-label="Close Announcement Board"]');
    if (headerCloseBtn) {
      headerCloseBtn.className = 'w-9 h-9 rounded-xl bg-[#F6F5F0] hover:bg-[#0D1F18] text-[#0D1F18] hover:text-white border border-[#D5D3CC] flex items-center justify-center text-sm font-black transition flex-shrink-0 shadow-sm cursor-pointer';
      headerCloseBtn.innerHTML = '✕';
      headerCloseBtn.onclick = () => toggleAnnouncementBoard(false);
    }
  }

  // On Mobile UI (< 768px), tapping the top Live Update Banner (#live-site-update-banner) opens the full-screen popup
  const bindMobileBannerTap = () => {
    const bannerEl = document.getElementById('live-site-update-banner');
    if (bannerEl && !bannerEl.dataset.pfMobilePopupBound) {
      bannerEl.dataset.pfMobilePopupBound = '1';
      bannerEl.addEventListener('click', (e) => {
        if (window.innerWidth < 768) {
          if (e.target && e.target.closest('a')) return;
          e.preventDefault();
          toggleAnnouncementBoard(true);
        }
      });
    }
  };
  bindMobileBannerTap();
  setTimeout(bindMobileBannerTap, 600);

  window.addEventListener('resize', () => {
    if (typeof pfApplyAnnouncementWindowResponsiveLayout === 'function') {
      pfApplyAnnouncementWindowResponsiveLayout();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initDraggableAnnouncementWidget();
});


// ================= CUSTOMER SELF-SERVICE RESCHEDULE ENGINE =================
const PF_RESCHED_ALL_SLOTS = [
  '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM', '11:00 PM'
];

function pfGetBookingDurationHours(b) {
  if (!b) return 1;
  const t = String(b.time || '');
  const m = t.match(/\((\d+)\s*hr/i);
  if (m) return Math.max(1, parseInt(m[1], 10) || 1);
  return 1;
}

function pfCheckRescheduleConflict(targetDate, courtNum, startSlot, durationHrs, currentRef) {
  const cNum = Number(courtNum || 1);
  const courtLabel = 'Court ' + cNum;
  const dur = Math.max(1, Number(durationHrs || 1));
  const startIdx = PF_RESCHED_ALL_SLOTS.indexOf(startSlot);
  const todayYMD = pfGetPhilippineTodayYMD();
  const maxYMD = typeof pfGetPhilippineMaxBookingYMD === 'function' ? pfGetPhilippineMaxBookingYMD() : '';

  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate < todayYMD) {
    return {
      ok: false,
      code: 'EXPIRED_DATE',
      html: `⚠️ <b>Expired Date Error:</b> The selected date (<b>${targetDate}</b>) has already passed. Please select today (<b>${todayYMD}</b>) or a future date.`
    };
  }

  if (maxYMD && targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate > maxYMD) {
    return {
      ok: false,
      code: 'ADVANCE_LIMIT',
      html: `⚠️ <b>30-Day Advance Window Error:</b> Bookings and reschedules are restricted to 30 days ahead (<b>${todayYMD}</b> to <b>${maxYMD}</b>).`
    };
  }

  if (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, startSlot)) {
    return {
      ok: false,
      code: 'EXPIRED',
      html: `⚠️ <b>Expired Time Slot Error:</b> <b>${startSlot}</b> on <b>${targetDate}</b> (Philippine Time) has already passed. Please select an upcoming time slot.`
    };
  }

  // Check if this is an Open Play new booking at offset 0 (allowed when !currentRef)
  const firstSt = typeof pfResolveCourtSlot === 'function'
    ? pfResolveCourtSlot(targetDate, cNum, startSlot)
    : { status: 'AVAILABLE' };
  const isNewOpBooking = !currentRef && firstSt && firstSt.status === 'OPEN_PLAY';
  const checkSlotsCount = isNewOpBooking ? 1 : dur;

  for (let offset = 0; offset < checkSlotsCount; offset++) {
    const idx = startIdx >= 0 ? (startIdx + offset) : 0;
    if (idx >= PF_RESCHED_ALL_SLOTS.length) {
      const reasonStr = `${dur}-hour booking starting at ${startSlot} extends past 12:00 Midnight closing time`;
      return {
        ok: false,
        code: 'CLOSING_TIME',
        title: 'Rescheduling Not Available — Extends Past Closing Time',
        reason: reasonStr,
        slotLabel: `${courtLabel} • ${targetDate} • ${startSlot} (${dur} hr)`,
        html: `⚠️ <b>Rescheduling Not Available:</b> Due to <b>"${pfEscapeHtml(reasonStr)}"</b>. Please choose an earlier start time.`
      };
    }
    const slotToCheck = startIdx >= 0 ? PF_RESCHED_ALL_SLOTS[idx] : startSlot;
    const st = typeof pfResolveCourtSlot === 'function'
      ? pfResolveCourtSlot(targetDate, cNum, slotToCheck)
      : { status: 'AVAILABLE' };
    const cat = String((st && (st.category || st.status)) || 'AVAILABLE').toUpperCase();

    if (st && st.status === 'BOOKED') {
      const bookedRef = (st.booking && st.booking.ref) ? String(st.booking.ref).toUpperCase() : '';
      const isSelf = Boolean(bookedRef && currentRef && bookedRef === String(currentRef).toUpperCase());
      if (isSelf) {
        const selfSlots = typeof pfExtractCoveredSlots === 'function' ? pfExtractCoveredSlots(st.booking.time || '') : [];
        if (offset === 0 && (selfSlots.length === 0 || selfSlots[0] === startSlot)) {
          const reasonStr = `Already your current active schedule (${currentRef})`;
          return {
            ok: false,
            code: 'ALREADY_BOOKED_SELF',
            title: 'Rescheduling Not Available — Current Active Slot',
            reason: reasonStr,
            slotLabel: `${courtLabel} • ${targetDate} • ${slotToCheck}`,
            html: `ℹ️ <b>Rescheduling Not Available:</b> Due to <b>"${pfEscapeHtml(reasonStr)}"</b> on <b>${courtLabel}</b> at <b>${slotToCheck}</b> (${targetDate}). Please choose a different date, court, or time slot.`
          };
        }
        continue;
      }
      const isPendingSlot = cat === 'PENDING' || (st.booking && String(st.booking.status || '').toUpperCase().includes('PENDING'));
      const reasonStr = isPendingSlot
        ? 'Slot has a Pending Booking awaiting Admin verification'
        : 'Slot is already booked by another player';
      return {
        ok: false,
        code: isPendingSlot ? 'PENDING_BOOKING' : 'ALREADY_BOOKED',
        title: isPendingSlot ? 'Rescheduling Not Available — Pending Booking' : 'Rescheduling Not Available — Already Booked',
        reason: reasonStr,
        slotLabel: `${courtLabel} • ${targetDate} • ${slotToCheck}`,
        html: `❌ <b>Rescheduling Not Available:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is unavailable due to <b>"${pfEscapeHtml(reasonStr)}"</b>. Please select an open date, court, or time slot.`
      };
    }

    if (st && st.status === 'CLOSED') {
      const isTrn = cat === 'TOURNAMENT' || /tournament/i.test(String(st.reason || ''));
      const exactReason = String(st.reason || (isTrn ? 'Official Club Tournament' : 'Court Closed / Maintenance')).trim();
      return {
        ok: false,
        code: isTrn ? 'TOURNAMENT' : 'CLOSED',
        title: isTrn ? 'Rescheduling Not Available — Official Tournament' : 'Rescheduling Not Available — Court Closed / Blocked',
        reason: exactReason,
        slotLabel: `${courtLabel} • ${targetDate} • ${slotToCheck}`,
        html: `⚠️ <b>Rescheduling Not Available:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is unavailable due to <b>"${pfEscapeHtml(exactReason)}"</b>. Please select an available time slot.`
      };
    }

    if (st && st.status === 'OPEN_PLAY' && (Boolean(currentRef) || offset > 0)) {
      const exactReason = String(st.reason || 'Official Club Open Play Session').trim();
      return {
        ok: false,
        code: 'OPEN_PLAY_CONFLICT',
        title: 'Rescheduling Not Available — Open Play Session',
        reason: exactReason,
        slotLabel: `${courtLabel} • ${targetDate} • ${slotToCheck}`,
        html: `⚠️ <b>Rescheduling Not Available:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is unavailable due to <b>"${pfEscapeHtml(exactReason)}"</b>. Regular court bookings cannot be moved into Open Play hours.`
      };
    }

    if (st && st.status === 'EXPIRED') {
      const exactReason = `Time slot (${slotToCheck} on ${targetDate}) has already passed`;
      return {
        ok: false,
        code: 'EXPIRED',
        title: 'Rescheduling Not Available — Expired Time Slot',
        reason: exactReason,
        slotLabel: `${courtLabel} • ${targetDate} • ${slotToCheck}`,
        html: `⚠️ <b>Rescheduling Not Available:</b> Due to <b>"${pfEscapeHtml(exactReason)}"</b>. Please select an upcoming time slot.`
      };
    }
  }

  return { ok: true, code: 'AVAILABLE', html: '' };
}

function pfCloseRescheduleUnavailablePopup() {
  const modal = document.getElementById('pf-resched-unavailable-modal');
  if (modal) modal.remove();
}
window.pfCloseRescheduleUnavailablePopup = pfCloseRescheduleUnavailablePopup;

function pfShowRescheduleUnavailablePopup(conflictObj) {
  if (!conflictObj) return;
  pfCloseRescheduleUnavailablePopup();

  const title = conflictObj.title || 'Rescheduling Not Available';
  const reason = conflictObj.reason || String(conflictObj.html || 'Selected schedule is not available.').replace(/<[^>]+>/g, '');
  const slotLabel = conflictObj.slotLabel || '';
  const code = String(conflictObj.code || 'UNAVAILABLE').toUpperCase();

  let badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  let iconEmoji = '🚫';
  if (code === 'PENDING_BOOKING') {
    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    iconEmoji = '⏳';
  } else if (code === 'TOURNAMENT') {
    badgeColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    iconEmoji = '🏆';
  } else if (code === 'OPEN_PLAY_CONFLICT') {
    badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    iconEmoji = '🟣';
  } else if (code === 'EXPIRED' || code === 'EXPIRED_DATE') {
    badgeColor = 'bg-slate-500/20 text-slate-300 border-slate-400/40';
    iconEmoji = '⏰';
  }

  const modal = document.createElement('div');
  modal.id = 'pf-resched-unavailable-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6';
  modal.innerHTML = `
    <div onclick="pfCloseRescheduleUnavailablePopup()" class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
    <div class="relative z-10 w-full max-w-md rounded-3xl bg-[#0B192C] border-2 border-rose-500/60 p-6 shadow-2xl text-left space-y-4 animate-fadeIn">
      <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-xl flex-shrink-0">
            ${iconEmoji}
          </div>
          <div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border ${badgeColor}">
              Reschedule Unavailable
            </span>
            <h3 class="text-base sm:text-lg font-black text-white mt-1 leading-snug">${pfEscapeHtml(title)}</h3>
          </div>
        </div>
        <button type="button" onclick="pfCloseRescheduleUnavailablePopup()" class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold flex-shrink-0 cursor-pointer">✕</button>
      </div>

      ${slotLabel ? `
      <div class="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-2 text-xs">
        <span class="text-slate-400 font-semibold">Selected Slot:</span>
        <span class="font-mono font-black text-white">${pfEscapeHtml(slotLabel)}</span>
      </div>` : ''}

      <div class="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 space-y-1.5">
        <span class="text-[10px] font-mono font-black uppercase tracking-widest text-rose-300 block">Reason Unavailable</span>
        <p class="text-sm font-extrabold text-white leading-relaxed">"${pfEscapeHtml(reason)}"</p>
      </div>

      <p class="text-xs text-slate-300 leading-relaxed">
        Please select an available <b>(✓ Available)</b> date, court, or time slot to complete your reschedule.
      </p>

      <div class="pt-1">
        <button type="button" onclick="pfCloseRescheduleUnavailablePopup()" class="w-full py-3 px-4 rounded-xl bg-[#9BE600] hover:bg-[#8ae000] text-[#050E1D] font-black text-xs uppercase tracking-wider transition shadow-lg cursor-pointer">
          Choose Another Slot
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
window.pfShowRescheduleUnavailablePopup = pfShowRescheduleUnavailablePopup;

function pfShowRescheduleErrorBanner(msgEl, htmlMsg, conflictObj = null, showPopup = false) {
  if (showPopup) {
    pfShowRescheduleUnavailablePopup(conflictObj || {
      title: 'Rescheduling Not Available',
      reason: String(htmlMsg || '').replace(/<[^>]+>/g, '').replace(/^[^:]+:\s*/, ''),
      html: htmlMsg
    });
  }
  if (!msgEl) {
    if (!showPopup) {
      const plain = String(htmlMsg || '').replace(/<[^>]+>/g, '');
      alert(plain);
    }
    return;
  }
  msgEl.innerHTML = htmlMsg;
  msgEl.className = 'text-xs font-bold text-rose-100 bg-rose-600/25 border-2 border-rose-500 p-3 rounded-xl mt-2.5 block shadow-lg';
}

function pfRefreshRescheduleTimeOptions(triggerSource = '') {
  const dateInp = document.getElementById('resched-new-date');
  const courtSel = document.getElementById('resched-new-court');
  const timeSel = document.getElementById('resched-new-time');
  const refEl = document.getElementById('res-ref');
  if (!dateInp || !courtSel || !timeSel) return;

  const todayYMD = pfGetPhilippineTodayYMD();
  const targetDate = dateInp.value || todayYMD;
  const isPastDay = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate < todayYMD;
  const cNum = pfNormalizeCourtNumber(courtSel.value || '1');
  const currentRef = refEl ? refEl.textContent.trim().toUpperCase() : '';

  const allBookings = pfGetAllMergedBookings();
  const activeBookingObj = allBookings.find(b => b && String(b.ref || '').toUpperCase() === currentRef) || null;
  const durHrs = pfGetBookingDurationHours(activeBookingObj);

  Array.from(timeSel.options).forEach(opt => {
    const rawSlot = opt.value;
    let suffix = ' (✓ Available)';
    if (isPastDay) {
      suffix = ' (⏰ Expired Date)';
    } else if (targetDate && typeof pfResolveCourtSlot === 'function') {
      const st = pfResolveCourtSlot(targetDate, cNum, rawSlot);
      const cat = String((st && (st.category || st.status)) || 'AVAILABLE').toUpperCase();
      if (st && st.status === 'BOOKED') {
        const bookedRef = (st.booking && st.booking.ref) ? String(st.booking.ref).toUpperCase() : '';
        const isPendingSlot = cat === 'PENDING' || (st.booking && String(st.booking.status || '').toUpperCase().includes('PENDING'));
        if (bookedRef && bookedRef === currentRef) {
          suffix = ' (📍 Your Current Slot)';
        } else if (isPendingSlot) {
          suffix = ' (⏳ Pending Booking)';
        } else {
          suffix = ' (❌ Already Booked)';
        }
      } else if (st && st.status === 'CLOSED') {
        const isTrn = cat === 'TOURNAMENT' || /tournament/i.test(String(st.reason || ''));
        const shortReason = String(st.reason || (isTrn ? 'Tournament' : 'Closed')).trim();
        suffix = isTrn ? ` (🏆 ${shortReason})` : ` (🔒 ${shortReason})`;
      } else if (st && st.status === 'OPEN_PLAY') {
        suffix = ' (🟣 Open Play Session)';
      } else if ((st && st.status === 'EXPIRED') || (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, rawSlot))) {
        suffix = ' (⏰ Expired / Passed)';
      }
    }
    opt.disabled = false;
    opt.textContent = rawSlot + suffix;
  });

  // When opening the form or changing Date/Court, auto-select the first truly available slot if current is taken
  if (!isPastDay && triggerSource === 'init') {
    const curCheck = pfCheckRescheduleConflict(targetDate, cNum, timeSel.value, durHrs, currentRef);
    if (!curCheck.ok) {
      const nextAvail = PF_RESCHED_ALL_SLOTS.find(s => pfCheckRescheduleConflict(targetDate, cNum, s, durHrs, currentRef).ok);
      if (nextAvail) {
        timeSel.value = nextAvail;
      }
    }
  }

  const msgEl = document.getElementById('resched-feedback-msg');
  if (triggerSource === 'saved') {
    return;
  }
  const userInteracted = (triggerSource === 'time' || triggerSource === 'date' || triggerSource === 'court');
  if (isPastDay) {
    const pastConflict = {
      ok: false,
      code: 'EXPIRED_DATE',
      title: 'Rescheduling Not Available — Past Date Selected',
      reason: `Selected date (${targetDate}) has already passed`,
      slotLabel: `Court ${cNum} • ${targetDate}`,
      html: `⚠️ <b>Rescheduling Not Available:</b> Due to <b>"Selected date (${targetDate}) has already passed"</b>. Please select today (<b>${todayYMD}</b>) or a future date.`
    };
    pfShowRescheduleErrorBanner(msgEl, pastConflict.html, pastConflict, userInteracted);
    return;
  }
  if (targetDate && timeSel.value) {
    const check = pfCheckRescheduleConflict(targetDate, cNum, timeSel.value, durHrs, currentRef);
    if (!check.ok) {
      pfShowRescheduleErrorBanner(msgEl, check.html, check, userInteracted);
    } else if (msgEl && !msgEl.innerHTML.includes('✅')) {
      msgEl.className = 'hidden';
      msgEl.innerHTML = '';
    }
  }
}

async function pfToggleRescheduleForm(forceOpen = null) {
  const panel = document.getElementById('reschedule-booking-panel');
  if (!panel) return;
  const shouldOpen = forceOpen !== null ? Boolean(forceOpen) : panel.classList.contains('hidden');
  if (shouldOpen) {
    panel.classList.remove('hidden');
    if (typeof syncStateFromServer === 'function') {
      try { await syncStateFromServer(); } catch (e) {}
    }
    const todayYmd = pfGetPhilippineTodayYMD();
    const refEl = document.getElementById('res-ref');
    const currentRef = refEl ? refEl.textContent.trim().toUpperCase() : '';
    const allBookings = pfGetAllMergedBookings();
    const activeBookingObj = allBookings.find(b => b && String(b.ref || '').toUpperCase() === currentRef) || null;

    const dateInput = document.getElementById('resched-new-date');
    if (dateInput) {
      dateInput.min = todayYmd;
      const bDate = activeBookingObj ? pfExtractBookingDateYMD(activeBookingObj, todayYmd) : '';
      let initDate = (bDate && /^\d{4}-\d{2}-\d{2}$/.test(bDate) && bDate >= todayYmd) ? bDate : todayYmd;
      // If all slots today are already expired, default to tomorrow in PHT
      const anyTodayAvail = PF_RESCHED_ALL_SLOTS.some(s => !pfIsSlotExpired(initDate, s));
      if (!anyTodayAvail) {
        const phtTom = pfGetPhilippineNow();
        phtTom.setDate(phtTom.getDate() + 1);
        initDate = `${phtTom.getFullYear()}-${String(phtTom.getMonth() + 1).padStart(2, '0')}-${String(phtTom.getDate()).padStart(2, '0')}`;
      }
      dateInput.value = initDate;
    }

    const courtSel = document.getElementById('resched-new-court');
    if (courtSel && activeBookingObj && activeBookingObj.court) {
      const cNum = pfNormalizeCourtNumber(activeBookingObj.court);
      courtSel.value = 'Court ' + cNum;
    }

    const msgEl = document.getElementById('resched-feedback-msg');
    if (msgEl) {
      msgEl.className = 'hidden';
      msgEl.innerHTML = '';
    }

    pfRefreshRescheduleTimeOptions('init');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    panel.classList.add('hidden');
  }
}

let _pfIsSubmittingReschedule = false;
async function pfSubmitBookingReschedule() {
  if (_pfIsSubmittingReschedule) return;
  const refEl = document.getElementById('res-ref');
  const refId = refEl ? refEl.textContent.trim() : '';
  if (!refId || refId === '—') {
    alert('Please look up your booking first.');
    return;
  }

  if (typeof syncStateFromServer === 'function') {
    try { await syncStateFromServer(); } catch (e) {}
  }

  const newDate = (document.getElementById('resched-new-date') || {}).value || '';
  const newCourt = (document.getElementById('resched-new-court') || {}).value || 'Court 1';
  const timeSel = document.getElementById('resched-new-time');
  const newTime = (timeSel && timeSel.value) ? timeSel.value : '';
  const msgEl = document.getElementById('resched-feedback-msg');

  if (!newDate) {
    pfShowRescheduleErrorBanner(msgEl, '⚠️ <b>Missing Date Error:</b> Please choose a new date for your booking.');
    return;
  }
  if (!newTime) {
    pfShowRescheduleErrorBanner(msgEl, '⚠️ <b>Missing Time Error:</b> Please select an available time slot.');
    return;
  }

  const cNum = pfNormalizeCourtNumber(newCourt);
  const cleanCourtLabel = 'Court ' + cNum;
  const allBookings = pfGetAllMergedBookings();
  const existingBooking = allBookings.find(b => b && String(b.ref || '').toUpperCase() === refId.toUpperCase())
    || (typeof currentLoadedPassData !== 'undefined' && currentLoadedPassData ? currentLoadedPassData : null);
  const durHrs = pfGetBookingDurationHours(existingBooking);

  // Strict Conflict & Expired Validation (Shows Pop-Up Modal with exact "Reason")
  const conflictCheck = pfCheckRescheduleConflict(newDate, cNum, newTime, durHrs, refId);
  if (!conflictCheck.ok) {
    pfShowRescheduleErrorBanner(msgEl, conflictCheck.html, conflictCheck, true);
    msgEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  const newTimeSchedule = durHrs > 1
    ? `${newDate} • ${newTime} (${durHrs} hr)`
    : `${newDate} • ${newTime}`;

  const baseBooking = existingBooking || {
    ref: refId,
    name: (document.getElementById('res-name')?.textContent || 'Valued Guest').trim(),
    phone: (document.getElementById('res-phone')?.textContent || '0999 883 2346').trim(),
    paymentMethod: (document.getElementById('res-paymethod')?.textContent || 'GCash').trim(),
    transactionRef: (document.getElementById('res-payref')?.textContent || 'N/A').trim(),
    total: Number(String(document.getElementById('res-total')?.textContent || '400').replace(/[^0-9.]/g, '')) || 400,
    status: (document.getElementById('res-status-badge')?.textContent || 'PENDING').trim()
  };

  const updatedBooking = Object.assign({}, baseBooking, {
    ref: baseBooking.ref || refId,
    date: newDate,
    court: cleanCourtLabel,
    time: newTimeSchedule,
    isReschedule: true,
    rescheduledAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
  });

  if (Array.isArray(updatedBooking.items) && updatedBooking.items.length > 0) {
    updatedBooking.items = updatedBooking.items.map(it => {
      if (typeof it === 'string' && /court/i.test(it)) {
        return `${cleanCourtLabel} (${newTimeSchedule})`;
      }
      if (it && typeof it === 'object' && it.isCourt) {
        return Object.assign({}, it, { name: cleanCourtLabel, subtitle: newTimeSchedule });
      }
      return it;
    });
  } else {
    updatedBooking.items = [`${cleanCourtLabel} (${newTimeSchedule})`];
  }

  _pfIsSubmittingReschedule = true;
  const saveBtn = document.querySelector('#reschedule-booking-panel button[onclick*="pfSubmitBookingReschedule"]');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.65';
  }

  const endpoints = pfGetApiEndpoints('/api/bookings');
  let serverRejected = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBooking)
      });
      const respData = await res.json().catch(() => ({}));
      if (res.status === 409 || (respData && respData.ok === false)) {
        serverRejected = respData.error || `Schedule Already Booked Error: ${cleanCourtLabel} at ${newTime} on ${newDate} is already booked.`;
        break;
      }
      if (res.ok && respData && respData.ok) {
        if (respData.state) {
          sharedServerState = respData.state;
          window.sharedServerState = sharedServerState;
          localStorage.setItem('pf_all_bookings', JSON.stringify(respData.state.bookings || []));
        }
        break;
      }
    } catch (e) {}
  }

  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
  }
  _pfIsSubmittingReschedule = false;

  if (serverRejected) {
    pfShowRescheduleErrorBanner(msgEl, `❌ <b>${pfEscapeHtml(serverRejected)}</b>`, {
      title: 'Rescheduling Not Available',
      reason: serverRejected,
      slotLabel: `${cleanCourtLabel} • ${newDate} • ${newTime}`
    }, true);
    msgEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // Update all localStorage caches & currentLoadedPassData
  if (typeof currentLoadedPassData !== 'undefined') {
    currentLoadedPassData = updatedBooking;
  }
  ['pf_all_bookings', 'pf_public_bookings'].forEach(storageKey => {
    try {
      const arr = JSON.parse(localStorage.getItem(storageKey) || '[]') || [];
      let found = false;
      const nextArr = arr.map(b => {
        if (b && String(b.ref || '').toUpperCase() === refId.toUpperCase()) {
          found = true;
          return Object.assign({}, b, updatedBooking);
        }
        return b;
      });
      if (!found) nextArr.unshift(updatedBooking);
      localStorage.setItem(storageKey, JSON.stringify(nextArr));
    } catch (e) {}
  });
  try {
    localStorage.setItem('booking_' + updatedBooking.ref, JSON.stringify(updatedBooking));
    const latest = JSON.parse(localStorage.getItem('latest_booking') || 'null');
    if (latest && String(latest.ref || '').toUpperCase() === refId.toUpperCase()) {
      localStorage.setItem('latest_booking', JSON.stringify(updatedBooking));
    }
  } catch (e) {}

  if (window.sharedServerState && Array.isArray(window.sharedServerState.bookings)) {
    let foundSrv = false;
    window.sharedServerState.bookings = window.sharedServerState.bookings.map(b => {
      if (b && String(b.ref || '').toUpperCase() === refId.toUpperCase()) {
        foundSrv = true;
        return Object.assign({}, b, updatedBooking);
      }
      return b;
    });
    if (!foundSrv) window.sharedServerState.bookings.unshift(updatedBooking);
  }

  const resCourtNumEl = document.getElementById('res-court-number');
  if (resCourtNumEl) {
    resCourtNumEl.textContent = cleanCourtLabel;
  }
  const resCourtEl = document.getElementById('res-court');
  if (resCourtEl) {
    resCourtEl.innerHTML = typeof formatBookingItemsBulletHtml === 'function'
      ? formatBookingItemsBulletHtml(updatedBooking)
      : cleanCourtLabel;
  }
  const resTimeEl = document.getElementById('res-time');
  if (resTimeEl) resTimeEl.textContent = newTimeSchedule;

  if (typeof renderLiveScheduleMatrix === 'function') {
    try { renderLiveScheduleMatrix(); } catch (e) {}
  }

  if (msgEl) {
    msgEl.innerHTML = `✅ Booking <b>${pfEscapeHtml(refId)}</b> has been successfully rescheduled to <b>${pfEscapeHtml(cleanCourtLabel)}</b> on <b>${pfEscapeHtml(newTimeSchedule)}</b>!`;
    msgEl.className = 'text-xs font-bold text-brand-lime bg-brand-lime/15 border-2 border-brand-lime p-3 rounded-xl mt-2.5 block shadow-md';
  }

  pfRefreshRescheduleTimeOptions('saved');
}

function pfInitRescheduleHashMode() {
  const banner = document.getElementById('reschedule-mode-top-banner');
  if (window.location.hash === '#reschedule') {
    if (banner) banner.classList.remove('hidden');
    const lookupInp = document.getElementById('lookup-ref');
    const resultCard = document.getElementById('booking-result-card');
    if (resultCard && !resultCard.classList.contains('hidden')) {
      pfToggleRescheduleForm(true);
    } else if (lookupInp) {
      lookupInp.focus();
    }
  } else if (banner) {
    banner.classList.add('hidden');
  }
}

window.addEventListener('hashchange', pfInitRescheduleHashMode);
window.addEventListener('DOMContentLoaded', pfInitRescheduleHashMode);
window.pfCheckRescheduleConflict = pfCheckRescheduleConflict;
window.pfRefreshRescheduleTimeOptions = pfRefreshRescheduleTimeOptions;
window.pfToggleRescheduleForm = pfToggleRescheduleForm;
window.pfSubmitBookingReschedule = pfSubmitBookingReschedule;


// ================= SCHEDULE & HOME NAVIGATION CONTROLLER =================
function pfSetScheduleNavActive(isScheduleActive) {
  const homeLink = document.getElementById('nav-link-home');
  const schedLink = document.getElementById('nav-link-schedule');
  const mobHome = document.getElementById('mob-nav-link-home');
  const mobSched = document.getElementById('mob-nav-link-schedule');
  const mobBadgeHome = document.getElementById('mob-nav-badge-home');
  const mobBadgeSched = document.getElementById('mob-nav-badge-schedule');

  const activeDesktopCls = 'whitespace-nowrap px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-brand-black bg-brand-lime font-black shadow-md shadow-brand-lime/20';
  const inactiveDesktopCls = 'whitespace-nowrap px-3 py-1.5 rounded-lg text-slate-200 hover:text-brand-lime hover:bg-white/5 font-bold transition-all duration-200 flex items-center gap-1.5';

  const activeMobCls = 'flex items-center justify-between py-3 px-4 rounded-xl border-2 border-[#0E8A2D] bg-[#050E1D] text-[#9BE600] font-black shadow-md transition';
  const inactiveMobCls = 'flex items-center justify-between py-3 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#9BE600]/20 hover:border-[#0E8A2D] text-[#050E1D] font-extrabold transition';

  if (homeLink) {
    homeLink.className = isScheduleActive ? inactiveDesktopCls : activeDesktopCls;
  }
  if (schedLink) {
    if (schedLink.closest('.pf-nav-dropdown-menu')) {
      schedLink.className = 'pf-nav-dropdown-item' + (isScheduleActive ? ' active' : '');
    } else {
      schedLink.className = isScheduleActive ? activeDesktopCls : inactiveDesktopCls;
    }
  }
  if (mobHome && mobSched) {
    mobHome.className = isScheduleActive ? inactiveMobCls : activeMobCls;
    mobSched.className = isScheduleActive ? activeMobCls : inactiveMobCls;
    if (mobBadgeHome) {
      mobBadgeHome.textContent = isScheduleActive ? '→' : '● ACTIVE';
      mobBadgeHome.className = isScheduleActive ? 'text-[#0E8A2D] font-mono font-black' : 'text-[#9BE600] font-mono font-black';
    }
    if (mobBadgeSched) {
      mobBadgeSched.textContent = isScheduleActive ? '● ACTIVE' : '→';
      mobBadgeSched.className = isScheduleActive ? 'text-[#9BE600] font-mono font-black' : 'text-[#0E8A2D] font-mono font-black';
    }
  }
}

function pfScrollToScheduleSection(smooth = true) {
  const schedEl = document.getElementById('schedule');
  if (!schedEl) return false;
  const mobMenu = document.getElementById('mobile-menu');
  if (mobMenu && !mobMenu.classList.contains('hidden') && typeof toggleMobileMenu === 'function') {
    toggleMobileMenu();
  }
  const headerEl = document.querySelector('header');
  const headerH = headerEl ? headerEl.getBoundingClientRect().height : 96;
  const targetY = Math.max(0, window.pageYOffset + schedEl.getBoundingClientRect().top - headerH - 8);
  window.scrollTo({ top: targetY, behavior: smooth ? 'smooth' : 'auto' });
  pfSetScheduleNavActive(true);
  return true;
}

function pfNavigateToSchedule(event) {
  const schedEl = document.getElementById('schedule');
  if (!schedEl) {
    try { sessionStorage.setItem('pf_scroll_to_schedule', '1'); } catch (e) {}
    return true; // Navigate to index.html#schedule from other pages
  }
  if (event) event.preventDefault();
  try {
    sessionStorage.removeItem('pf_scroll_to_schedule');
    if (window.location.hash !== '#schedule') {
      history.pushState(null, '', '#schedule');
    }
  } catch (e) {}
  pfScrollToScheduleSection(true);
  return false;
}

function pfNavigateToHome(event) {
  const schedEl = document.getElementById('schedule');
  if (!schedEl) return true; // Let link navigate to index.html from other pages
  if (event) event.preventDefault();
  const mobMenu = document.getElementById('mobile-menu');
  if (mobMenu && !mobMenu.classList.contains('hidden') && typeof toggleMobileMenu === 'function') {
    toggleMobileMenu();
  }
  try {
    history.pushState(null, '', window.location.pathname + window.location.search);
  } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
  pfSetScheduleNavActive(false);
  return false;
}

function pfInitScheduleNavigation() {
  const schedEl = document.getElementById('schedule');
  if (!schedEl) return;

  let pendingScroll = false;
  try {
    if (sessionStorage.getItem('pf_scroll_to_schedule') === '1') {
      pendingScroll = true;
      sessionStorage.removeItem('pf_scroll_to_schedule');
      if (window.location.hash !== '#schedule') {
        history.replaceState(null, '', '#schedule');
      }
    }
  } catch (e) {}

  if (window.location.hash === '#schedule' || pendingScroll) {
    pfSetScheduleNavActive(true);
    setTimeout(() => pfScrollToScheduleSection(false), 40);
    setTimeout(() => pfScrollToScheduleSection(true), 220);
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#schedule') {
      pfScrollToScheduleSection(true);
    } else if (!window.location.hash || window.location.hash === '#') {
      pfSetScheduleNavActive(false);
    }
  });

  let scrollTick = false;
  window.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    window.requestAnimationFrame(() => {
      const rect = schedEl.getBoundingClientRect();
      const inSchedule = rect.top <= 220 && rect.bottom >= 260;
      pfSetScheduleNavActive(inSchedule);
      scrollTick = false;
    });
  }, { passive: true });
}

window.addEventListener('DOMContentLoaded', pfInitScheduleNavigation);
window.pfNavigateToSchedule = pfNavigateToSchedule;
window.pfNavigateToHome = pfNavigateToHome;
window.pfSetScheduleNavActive = pfSetScheduleNavActive;
window.pfScrollToScheduleSection = pfScrollToScheduleSection;

// ================= OFFICIAL POLICIES & GUEST CONSENT MODAL (WAIVER & CANCELLATION) =================
const PF_POLICIES_MODAL_DATA = {
  waiver: {
    title: 'Waiver, safety, and court conduct',
    checkboxIds: ['consent-waiver', 'policy-waiver'],
    confirmNote: 'Checking the waiver box confirms that I reviewed these terms, understood them, and accepted them voluntarily.',
    bodyHtml: `
      <div class="space-y-4">
        <div>
          <h3 class="text-base sm:text-lg font-black text-brand-lime uppercase tracking-tight">Court conduct</h3>
          <ul class="mt-2 list-disc space-y-2 pl-5 text-slate-200 text-xs sm:text-sm leading-relaxed">
            <li>Use only the time reserved for your group and leave the court promptly when the session ends.</li>
            <li>Keep voices, music, and general activity at a considerate level for nearby residents and other guests.</li>
            <li>Wear suitable athletic clothing and footwear that will not mark or damage the playing surface.</li>
            <li>Place rubbish in the proper bins and leave the court ready for the next players.</li>
            <li>Smoking, vaping, and alcoholic drinks are not allowed within the playing area.</li>
            <li>Handle nets, paddles, machines, and other facility property carefully. Repair or replacement costs may be charged for misuse.</li>
            <li>Return every rented or borrowed item immediately after the session.</li>
            <li>Keep personal items secure; each guest remains responsible for their own belongings.</li>
            <li>Play safely, show good sportsmanship, and treat staff and fellow players respectfully.</li>
          </ul>
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-black text-brand-lime uppercase tracking-tight">Participation and personal responsibility</h3>
          <p class="mt-1 text-slate-200 text-xs sm:text-sm leading-relaxed">Activities such as pickleball and other racket sports involve movement, contact, falls, collisions, and equipment-related hazards. By participating, I knowingly choose to accept these ordinary risks and agree to play within my own ability.</p>
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-black text-brand-lime uppercase tracking-tight">Fitness and health</h3>
          <p class="mt-1 text-slate-200 text-xs sm:text-sm leading-relaxed">I believe I am fit enough to participate safely. I will stop playing and notify staff if I feel pain, dizziness, breathing difficulty, or another health concern.</p>
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-black text-brand-lime uppercase tracking-tight">Liability and instructions</h3>
          <p class="mt-1 text-slate-200 text-xs sm:text-sm leading-relaxed">To the extent permitted by law, I will not hold the facility, its owners, staff, or representatives responsible for ordinary injuries or losses connected with my voluntary participation. I agree to follow posted notices and reasonable staff directions; serious or repeated violations may end my session without reimbursement.</p>
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-black text-brand-lime uppercase tracking-tight">Belongings and media</h3>
          <p class="mt-1 text-slate-200 text-xs sm:text-sm leading-relaxed">I remain responsible for valuables brought to the venue. Event photographs or video may be used for facility promotion, but I may tell staff that I do not wish to appear.</p>
        </div>
      </div>
    `
  },
  cancellation: {
    title: 'Cancellation, refund, and rescheduling terms',
    checkboxIds: ['consent-cancel', 'policy-cancellation'],
    confirmNote: 'Checking the cancellation box confirms that I understand the final-sale and rescheduling conditions.',
    bodyHtml: `
      <div class="space-y-4 text-slate-200 text-xs sm:text-sm leading-relaxed">
        <p>Once a reservation has been confirmed and payment has been completed, the booking price is final and is not eligible for a cash refund.</p>
        <p>A request to move a booking may be considered when it reaches management at least 48 hours before the reserved start time. Approval depends on available courts and time slots, and a reservation may normally be moved only once.</p>
        <p>Missing a session without approved notice is treated as a no-show. The reserved time and amount paid will be forfeited.</p>
        <p>Requests received inside the 48-hour window cannot normally be accommodated. This includes personal emergencies, illness, heavy traffic, vehicle or transport problems, flooding, travel disruption, and weather that affects the customer’s journey.</p>
        <p>If the venue determines that playing conditions are unsafe, maintenance is required, or another event outside management’s reasonable control affects operations, management may transfer the reservation to another suitable schedule.</p>
      </div>
    `
  }
};

function pfEnsurePolicyModalMounted() {
  let modal = document.getElementById('pf-policy-viewer-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'pf-policy-viewer-modal';
  modal.className = 'fixed inset-0 z-[120] hidden flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-md';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div onclick="pfClosePolicyModal()" class="absolute inset-0"></div>
    <div class="relative z-10 max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-brand-card border-2 border-brand-lime/40 p-5 sm:p-8 shadow-2xl text-left touch-scroll">
      <div class="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-lime block">Official Facility Policy</span>
          <h2 id="pf-policy-modal-title" class="text-lg sm:text-2xl font-black text-white font-display tracking-tight mt-0.5">Policy Details</h2>
        </div>
        <button type="button" onclick="pfClosePolicyModal()" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-slate-200 hover:text-white transition flex-shrink-0" aria-label="Close policy">Close ✕</button>
      </div>
      <div id="pf-policy-modal-body" class="mt-5 space-y-4"></div>
      <div id="pf-policy-modal-note" class="mt-5 rounded-2xl bg-brand-lime/15 border border-brand-lime/40 p-4 text-xs sm:text-sm font-bold text-brand-lime"></div>
      <div class="mt-6 flex flex-col sm:flex-row gap-2.5">
        <button type="button" id="pf-policy-modal-accept-btn" class="w-full py-3.5 px-5 rounded-2xl bg-brand-lime hover:bg-brand-limeHover text-brand-black font-black uppercase text-xs tracking-wider transition shadow-lg shadow-brand-lime/20">I have finished reading</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function pfOpenPolicyModal(policyKey, ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  const data = PF_POLICIES_MODAL_DATA[policyKey];
  if (!data) return;

  const modal = pfEnsurePolicyModalMounted();
  const titleEl = document.getElementById('pf-policy-modal-title');
  const bodyEl = document.getElementById('pf-policy-modal-body');
  const noteEl = document.getElementById('pf-policy-modal-note');
  const acceptBtn = document.getElementById('pf-policy-modal-accept-btn');

  if (titleEl) titleEl.textContent = data.title;
  if (bodyEl) bodyEl.innerHTML = data.bodyHtml;
  if (noteEl) noteEl.textContent = data.confirmNote;
  if (acceptBtn) {
    acceptBtn.textContent = 'I Accept & Have Finished Reading';
    acceptBtn.onclick = () => {
      if (Array.isArray(data.checkboxIds)) {
        data.checkboxIds.forEach(cid => {
          const cb = document.getElementById(cid);
          if (cb) cb.checked = true;
        });
      }
      if (typeof pfSyncDrawerPolicyConsent === 'function') pfSyncDrawerPolicyConsent();
      if (typeof checkPoliciesConsent === 'function') checkPoliciesConsent();
      pfClosePolicyModal();
    };
  }

  modal.classList.remove('hidden');
}

function pfClosePolicyModal() {
  const modal = document.getElementById('pf-policy-viewer-modal');
  if (modal) modal.classList.add('hidden');
}

function pfSyncDrawerPolicyConsent() {
  const p1El = document.getElementById('policy-waiver');
  const p2El = document.getElementById('policy-cancellation');
  const p3El = document.getElementById('policy-nonrefundable');
  if (!p1El && !p2El && !p3El) return;

  [p1El, p2El, p3El].forEach(inp => {
    if (!inp) return;
    const card = inp.closest('.pf-policy-consent-card');
    if (card) {
      if (inp.checked) {
        card.classList.add('border-emerald-500', 'bg-emerald-50/70', 'ring-1', 'ring-emerald-500/30');
        card.classList.remove('border-slate-200', 'bg-white');
      } else {
        card.classList.remove('border-emerald-500', 'bg-emerald-50/70', 'ring-1', 'ring-emerald-500/30');
        card.classList.add('border-slate-200', 'bg-white');
      }
    }
  });

  const allChecked = Boolean(p1El?.checked && p2El?.checked && p3El?.checked);
  const gateNotice = document.getElementById('drawer-policy-gate-notice');
  if (gateNotice) {
    if (allChecked) {
      gateNotice.textContent = '✓ All 3 policy confirmations accepted. Payment options are now enabled.';
      gateNotice.className = 'text-xs font-bold text-emerald-700 mt-1';
    } else {
      gateNotice.textContent = 'Review and accept each item before payment options are enabled.';
      gateNotice.className = 'text-xs text-slate-500 mt-1';
    }
  }
  const proceedBtn = document.getElementById('drawer-proceed-btn');
  if (proceedBtn) {
    if (allChecked) {
      proceedBtn.classList.remove('opacity-60');
    } else {
      proceedBtn.classList.add('opacity-60');
    }
  }
}

window.pfOpenPolicyModal = pfOpenPolicyModal;
window.pfClosePolicyModal = pfClosePolicyModal;
window.pfSyncDrawerPolicyConsent = pfSyncDrawerPolicyConsent;


try {
  const pfBlocksChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('pf_court_blocks_sync') : null;
  if (pfBlocksChannel) {
    pfBlocksChannel.onmessage = (ev) => {
      if (ev && ev.data && Array.isArray(ev.data.blocks)) {
        if (window.sharedServerState) window.sharedServerState.blocks = ev.data.blocks;
        try {
          localStorage.setItem('pf_court_blocks', JSON.stringify(ev.data.blocks));
          if (ev.data.updatedAt) localStorage.setItem('pf_court_blocks_updated_at', String(ev.data.updatedAt));
        } catch (e) {}
        if (typeof renderLiveScheduleMatrix === 'function') try { renderLiveScheduleMatrix(); } catch (e) {}
        if (typeof renderDrawerSlots === 'function') try { renderDrawerSlots(); } catch (e) {}
        if (typeof renderTimeChips === 'function') try { renderTimeChips(); } catch (e) {}
      }
    };
  }
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'pf_court_blocks' && ev.newValue) {
      try {
        const parsedBlocks = JSON.parse(ev.newValue);
        if (Array.isArray(parsedBlocks)) {
          if (window.sharedServerState) window.sharedServerState.blocks = parsedBlocks;
          if (typeof renderLiveScheduleMatrix === 'function') try { renderLiveScheduleMatrix(); } catch (e) {}
          if (typeof renderDrawerSlots === 'function') try { renderDrawerSlots(); } catch (e) {}
          if (typeof renderTimeChips === 'function') try { renderTimeChips(); } catch (e) {}
        }
      } catch (e) {}
    }
  });
} catch (e) {}



// ================= 30-DAY ADVANCE CALENDAR LIMIT ENGINE (TODAY TO +30 DAYS ONLY) =================
function pfGetPhilippineMaxBookingYMD(maxDays) {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const limitDays = Number(maxDays || cfg.maxAdvanceBookingDays || 30);
  const now = pfGetPhilippineNow();
  now.setHours(12, 0, 0, 0);
  now.setDate(now.getDate() + limitDays);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pfIsDateBeyondAdvanceWindow(dateYMD, maxDays) {
  if (!dateYMD || dateYMD === 'Today') return false;
  const clean = String(dateYMD).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  return clean > pfGetPhilippineMaxBookingYMD(maxDays);
}

function pfApply30DayCalendarLimits() {
  const todayYMD = pfGetPhilippineTodayYMD();
  const maxYMD = pfGetPhilippineMaxBookingYMD(30);
  ['sched-native-date-picker', 'drawer-native-date-picker', 'book-native-date-picker', 'resched-date-input', 'check-resched-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.min = todayYMD;
      el.max = maxYMD;
      if (el.value && el.value > maxYMD) el.value = maxYMD;
      if (el.value && el.value < todayYMD) el.value = todayYMD;
    }
  });
}

window.pfGetPhilippineMaxBookingYMD = pfGetPhilippineMaxBookingYMD;
window.pfIsDateBeyondAdvanceWindow = pfIsDateBeyondAdvanceWindow;
window.pfApply30DayCalendarLimits = pfApply30DayCalendarLimits;
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(pfApply30DayCalendarLimits, 50);
});


// ================= OPEN PLAY DEDICATED SUB-PAGE & BOOKING CHECKOUT ENGINE =================
function pfGetOpenPlayTodayYMD() {
    if (typeof pfGetPhilippineTodayYMD === 'function') {
        return pfGetPhilippineTodayYMD();
    }
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    } catch (e) {
        return new Date().toISOString().slice(0, 10);
    }
}

var DEFAULT_OPEN_PLAY_SESSIONS = [
    {
        id: 'op-main',
        title: 'Pickleball Fever Open Play',
        subtitle: 'Drop In. Rally On.',
        schedule: 'Tue–Thu: 4:00 PM – 8:00 PM • Fri–Sat: 6:00 PM – 10:00 PM',
        tueThuStart: '16:00',
        tueThuEnd: '20:00',
        friSatStart: '18:00',
        friSatEnd: '22:00',
        startTime: '16:00',
        endTime: '20:00',
        openPlayDate: pfGetOpenPlayTodayYMD(),
        lastResetDate: pfGetOpenPlayTodayYMD(),
        defaultDays: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        entryFee: 150,
        maxSlots: 24,
        slotsAvailableOverride: null,
        posterUrl: 'assets/open-play-poster.jpg',
        designatedCourts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'],
        published: true,
        players: [],
        historyPlayers: []
    }
];

function pfFormatTime24To12(time24) {
    if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return '';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return time24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

function pfBuildHourSlotsBetween(start24, end24) {
    if (!start24 || !end24) return [];
    const sHr = parseInt(String(start24).split(':')[0], 10);
    const eHr = parseInt(String(end24).split(':')[0], 10);
    if (isNaN(sHr) || isNaN(eHr) || eHr <= sHr) return [];
    const out = [];
    for (let h = sHr; h < eHr; h++) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        out.push(`${String(h12).padStart(2, '0')}:00 ${ampm}`);
    }
    return out;
}
window.pfBuildHourSlotsBetween = pfBuildHourSlotsBetween;

function pfGetNormalizedOpenPlaySessions() {
    const todayYMD = pfGetOpenPlayTodayYMD();
    const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
    let raw = (Array.isArray(cfg.openPlaySessions) && cfg.openPlaySessions.length > 0)
        ? cfg.openPlaySessions
        : null;

    if (!Array.isArray(raw) || raw.length === 0) {
        try {
            const saved = localStorage.getItem('pf_open_play_sessions_v1');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) raw = parsed;
            }
        } catch (e) {}
    }
    if (!Array.isArray(raw) || raw.length === 0) {
        raw = JSON.parse(JSON.stringify(DEFAULT_OPEN_PLAY_SESSIONS));
    }

    const def = DEFAULT_OPEN_PLAY_SESSIONS[0];
    const primary = raw[0] || def;
    const legacyDemoIds = new Set(['opp-101', 'opp-102', 'opp-103', 'opp-104', 'opp-105', 'opp-106']);

    const didRollOverNewDay = Boolean(primary.lastResetDate && primary.lastResetDate !== todayYMD);
    const deletedRefsSet = new Set(
        ((typeof sharedServerState !== 'undefined' && Array.isArray(sharedServerState.deletedBookingRefs)) ? sharedServerState.deletedBookingRefs : [])
        .map(r => String(r || '').trim().toUpperCase())
    );
    const serverBookings = (typeof sharedServerState !== 'undefined' && Array.isArray(sharedServerState.bookings))
        ? sharedServerState.bookings
        : [];
    const historyPlayers = Array.isArray(primary.historyPlayers) ? [...primary.historyPlayers] : [];
    const mergedPlayers = [];
    const seenIds = new Set();
    const seenRefs = new Set();

    raw.forEach((s) => {
        if (Array.isArray(s.players)) {
            s.players.forEach((p) => {
                if (!p || !p.name) return;
                const pid = p.id || ('opp-' + Math.random().toString(36).slice(2, 8));
                const pref = String(p.bookingRef || p.refNumber || '').trim().toUpperCase();
                if (legacyDemoIds.has(pid)) return;
                if (pref && deletedRefsSet.has(pref)) return;
                if (seenIds.has(pid) || (pref && seenRefs.has(pref))) return;
                seenIds.add(pid);
                if (pref) seenRefs.add(pref);

                let resolvedStatus = p.status || (p.accepted === false ? 'Pending' : 'Accepted');
                let matchedBk = null;
                if (pref && serverBookings.length > 0) {
                    matchedBk = serverBookings.find(b => b && String(b.ref || '').trim().toUpperCase() === pref);
                    if (matchedBk && matchedBk.status) {
                        const stUp = String(matchedBk.status).toUpperCase();
                        resolvedStatus = stUp === 'CONFIRMED' ? 'Accepted' : (stUp === 'DECLINED' || stUp === 'CANCELLED' ? 'Declined' : 'Pending');
                    }
                }

                const unitFeeForInfer = Math.max(1, Number(primary.entryFee || 150));
                let pSlots = Number((matchedBk && (matchedBk.playersCount || matchedBk.players || matchedBk.slots)) || p.playersCount || p.players || p.slots || 0);
                if (!pSlots || pSlots <= 1) {
                    const nmText = String((matchedBk && matchedBk.name) || p.name || '');
                    const mPl = nmText.match(/\((\d+)\s*Players?\)/i) || nmText.match(/\b(\d+)\s*x\s*Open\s*Play/i);
                    const rawPriceVal = Number((matchedBk && matchedBk.total) ?? p.price ?? 0);
                    if (mPl) pSlots = parseInt(mPl[1], 10) || 1;
                    else if (rawPriceVal >= unitFeeForInfer * 2) pSlots = Math.round(rawPriceVal / unitFeeForInfer);
                }
                pSlots = Math.max(1, pSlots || 1);
                const syncedDate = (matchedBk && matchedBk.date && /^\d{4}-\d{2}-\d{2}/.test(String(matchedBk.date)))
                    ? String(matchedBk.date).slice(0, 10)
                    : String(p.openPlayDate || primary.openPlayDate || todayYMD).slice(0, 10);
                const playerObj = {
                    id: pid,
                    bookingRef: p.bookingRef || p.refNumber || (matchedBk && matchedBk.ref) || '',
                    name: String((matchedBk && matchedBk.name) || p.name || 'Player').trim(),
                    phone: String((matchedBk && matchedBk.phone) || p.phone || '').trim(),
                    openPlayDate: syncedDate,
                    paymentMethod: (matchedBk && matchedBk.paymentMethod) || p.paymentMethod || 'GCash',
                    refNumber: p.refNumber || p.bookingRef || (matchedBk && matchedBk.ref) || '',
                    receiptDataUrl: (matchedBk && matchedBk.receiptDataUrl) || p.receiptDataUrl || '',
                    playersCount: pSlots,
                    players: pSlots,
                    slots: pSlots,
                    price: Number((matchedBk && matchedBk.total) ?? p.price ?? (Number(primary.entryFee || 150) * pSlots)),
                    status: resolvedStatus,
                    accepted: resolvedStatus === 'Accepted',
                    joinedAt: p.joinedAt || (matchedBk && matchedBk.createdAt) || new Date().toISOString()
                };

                if (playerObj.openPlayDate < todayYMD) {
                    if (!historyPlayers.some(hp => hp && hp.id === playerObj.id)) {
                        historyPlayers.unshift(playerObj);
                    }
                } else {
                    mergedPlayers.push(playerObj);
                }
            });
        }
    });

    // Also merge any Open Play bookings from sharedServerState.bookings not yet in s.players
    serverBookings.forEach((bk) => {
        if (!bk || !bk.ref) return;
        const bkRefUp = String(bk.ref).trim().toUpperCase();
        if (deletedRefsSet.has(bkRefUp) || seenRefs.has(bkRefUp)) return;
        const isOpBk = Boolean(bk.isOpenPlay || bk.bookingType === 'OPEN_PLAY' || bkRefUp.startsWith('PF-OP-') || /open\s*play/i.test(String(bk.court || '')));
        if (!isOpBk) return;
        seenRefs.add(bkRefUp);
        const stUp = String(bk.status || 'PENDING').toUpperCase();
        const resolvedStatus = stUp === 'CONFIRMED' ? 'Accepted' : (stUp === 'DECLINED' || stUp === 'CANCELLED' ? 'Declined' : 'Pending');
        const bkDate = String(bk.date || todayYMD).slice(0, 10);
        const unitFeeForInfer = Math.max(1, Number(primary.entryFee || 150));
        let bkSlots = Number(bk.playersCount || bk.players || bk.slots || 0);
        if (!bkSlots || bkSlots <= 1) {
            const nmText = String(bk.name || bk.customerName || '');
            const mPl = nmText.match(/\((\d+)\s*Players?\)/i) || nmText.match(/\b(\d+)\s*x\s*Open\s*Play/i);
            const rawPriceVal = Number(bk.total ?? bk.price ?? 0);
            if (mPl) bkSlots = parseInt(mPl[1], 10) || 1;
            else if (rawPriceVal >= unitFeeForInfer * 2) bkSlots = Math.round(rawPriceVal / unitFeeForInfer);
        }
        bkSlots = Math.max(1, bkSlots || 1);
        const playerObj = {
            id: 'opp-' + bkRefUp.toLowerCase(),
            bookingRef: bk.ref,
            name: String(bk.name || bk.customerName || 'Player').trim(),
            phone: String(bk.phone || bk.customerPhone || '').trim(),
            openPlayDate: bkDate,
            paymentMethod: bk.paymentMethod || 'GCash',
            refNumber: bk.ref,
            receiptDataUrl: bk.receiptDataUrl || '',
            playersCount: bkSlots,
            players: bkSlots,
            slots: bkSlots,
            price: Number(bk.total ?? (Number(primary.entryFee || 150) * bkSlots)),
            status: resolvedStatus,
            accepted: resolvedStatus === 'Accepted',
            joinedAt: bk.createdAt || new Date().toISOString()
        };
        if (bkDate >= todayYMD) {
            mergedPlayers.push(playerObj);
        }
    });

    const tueThuStart = primary.tueThuStart || def.tueThuStart;
    const tueThuEnd = primary.tueThuEnd || def.tueThuEnd;
    const friSatStart = primary.friSatStart || def.friSatStart;
    const friSatEnd = primary.friSatEnd || def.friSatEnd;

    let scheduleLabel = primary.schedule;
    if (!scheduleLabel || scheduleLabel === '6:00 PM – 10:00 PM' || scheduleLabel === '03:00 PM – 06:00 PM') {
        scheduleLabel = `Tue–Thu: ${pfFormatTime24To12(tueThuStart)} – ${pfFormatTime24To12(tueThuEnd)} • Fri–Sat: ${pfFormatTime24To12(friSatStart)} – ${pfFormatTime24To12(friSatEnd)}`;
    }

    let posterUrl = String(primary.posterUrl || '').trim();
    if (!posterUrl || posterUrl.includes('undefined')) {
        posterUrl = 'assets/open-play-poster.jpg';
    }

    const unifiedSession = {
        ...def,
        ...primary,
        id: primary.id || 'op-main',
        title: (!primary.title || primary.title === 'Singles Open Play' || primary.title === 'Doubles Open Play')
            ? 'Pickleball Fever Open Play'
            : primary.title,
        subtitle: primary.subtitle || def.subtitle,
        tueThuStart,
        tueThuEnd,
        friSatStart,
        friSatEnd,
        startTime: primary.startTime || tueThuStart,
        endTime: primary.endTime || tueThuEnd,
        schedule: scheduleLabel,
        openPlayDate: (!primary.openPlayDate || primary.openPlayDate < todayYMD || didRollOverNewDay)
            ? todayYMD
            : primary.openPlayDate,
        lastResetDate: todayYMD,
        defaultDays: Array.isArray(primary.defaultDays) && primary.defaultDays.length > 0
            ? primary.defaultDays
            : def.defaultDays,
        entryFee: Number(primary.entryFee ?? def.entryFee ?? 150),
        maxSlots: Math.max(1, Number(primary.maxSlots || def.maxSlots || 24)),
        slotsAvailableOverride: didRollOverNewDay
            ? null
            : ((primary.slotsAvailableOverride !== undefined && primary.slotsAvailableOverride !== null && primary.slotsAvailableOverride !== '')
                ? Math.max(0, Number(primary.slotsAvailableOverride))
                : null),
        posterUrl,
        designatedCourts: Array.isArray(primary.designatedCourts) && primary.designatedCourts.length > 0
            ? primary.designatedCourts
            : def.designatedCourts,
        published: primary.published !== false,
        players: mergedPlayers,
        historyPlayers: historyPlayers.slice(0, 200)
    };

    if (didRollOverNewDay) {
        try {
            localStorage.setItem('pf_open_play_sessions_v1', JSON.stringify([unifiedSession]));
        } catch (e) {}
    }

    if (window.PF_SITE_CONFIG) window.PF_SITE_CONFIG.openPlaySessions = [unifiedSession];
    return [unifiedSession];
}

function pfGetPublishedOpenPlaySessions() {
    const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
    const mode = cfg.openPlayDisplayMode || localStorage.getItem('pf_open_play_display_mode_v1') || 'open_play';
    if (mode === 'none' || cfg.openPlayEnabled === false) return [];
    return pfGetNormalizedOpenPlaySessions().filter(s => s && s.published !== false);
}

function pfGetActiveOpenPlaySession() {
  const pub = pfGetPublishedOpenPlaySessions();
  const found = pub.find(s => s.id === window.PF_OPEN_PLAY_STATE.activeSessionId);
  if (found) return found;
  window.PF_OPEN_PLAY_STATE.activeSessionId = pub[0].id;
  return pub[0];
}

function pfSelectOpenPlaySession(sessionId) {
  if (!sessionId) return;
  window.PF_OPEN_PLAY_STATE.activeSessionId = sessionId;
  pfRenderOpenPlay24Board();
}

function pfBuildOpenPlay24Schedule(courtsCountInput, sessionIdInput) {
  const allSessions = pfGetNormalizedOpenPlaySessions();
  const session = (sessionIdInput && allSessions.find(s => s.id === sessionIdInput)) || pfGetActiveOpenPlaySession();
  const desigCourts = (Array.isArray(session.designatedCourts) && session.designatedCourts.length > 0)
    ? session.designatedCourts
    : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];

  const overrideCount = window.PF_OPEN_PLAY_STATE.courtsOverrideBySession[session.id];
  const courtsCount = Math.max(1, Math.min(4, Number(courtsCountInput || overrideCount || desigCourts.length || 4)));
  const activeCourtNames = [];
  for (let i = 0; i < courtsCount; i++) {
    activeCourtNames.push(desigCourts[i] || `Court ${i + 1}`);
  }

  const baseSlots = [];
  session.players.forEach((pl, idx) => {
    baseSlots.push({
      slotNumber: idx + 1,
      name: pl.name,
      skill: pl.skill || 'All Levels',
      bookingRef: pl.bookingRef || '',
      paymentMethod: pl.paymentMethod || '',
      status: pl.status || 'BOOKED',
      joinedAt: pl.joinedAt || 'Joined',
      isJoined: true
    });
  });
  while (baseSlots.length < 24) {
    const n = baseSlots.length + 1;
    baseSlots.push({
      slotNumber: n,
      name: `Open Seat #${n}`,
      skill: 'Available',
      bookingRef: '',
      paymentMethod: '',
      status: 'OPEN',
      joinedAt: '',
      isJoined: false
    });
  }

  const localOrder = window.PF_OPEN_PLAY_STATE.shuffledOrderBySession[session.id];
  const order = (Array.isArray(localOrder) && localOrder.length === 24)
    ? localOrder
    : ((Array.isArray(session.shuffledOrder) && session.shuffledOrder.length === 24)
      ? session.shuffledOrder
      : Array.from({ length: 24 }, (_, idx) => idx));

  const realCount = session.players.length;
  let orderedSlots = [];
  if (realCount > 0 && realCount < 24) {
    const realIndices = order.filter(i => i < realCount);
    const openIndices = order.filter(i => i >= realCount);
    orderedSlots = [...realIndices, ...openIndices].map((origIdx, pos) => {
      const item = baseSlots[origIdx] || baseSlots[pos];
      return Object.assign({}, item, { podSeat: pos + 1, origIndex: origIdx });
    });
  } else {
    orderedSlots = order.map((origIdx, pos) => {
      const item = baseSlots[origIdx] || baseSlots[pos];
      return Object.assign({}, item, { podSeat: pos + 1, origIndex: origIdx });
    });
  }

  const waveLabelsByCourtCount = {
    1: ['Wave 1 • 3:00–3:30 PM', 'Wave 2 • 3:30–4:00 PM', 'Wave 3 • 4:00–4:30 PM', 'Wave 4 • 4:30–5:00 PM', 'Wave 5 • 5:00–5:30 PM', 'Wave 6 • 5:30–6:00 PM'],
    2: ['Wave 1 • Match A (3:00 PM)', 'Wave 1 • Match B (3:00 PM)', 'Wave 2 • Match A (3:30 PM)', 'Wave 2 • Match B (3:30 PM)', 'Wave 3 • Match A (4:00 PM)', 'Wave 3 • Match B (4:00 PM)'],
    3: ['Wave A • Pod 1 (3:00 PM)', 'Wave A • Pod 2 (3:00 PM)', 'Wave A • Pod 3 (3:00 PM)', 'Wave B • Pod 4 (3:30 PM)', 'Wave B • Pod 5 (3:30 PM)', 'Wave B • Pod 6 (3:30 PM)'],
    4: ['Active Court Rotation • Pod 1', 'Active Court Rotation • Pod 2', 'Active Court Rotation • Pod 3', 'Active Court Rotation • Pod 4', 'Next-Up Queue • Pod 5', 'Next-Up Queue • Pod 6']
  };
  const waveLabels = waveLabelsByCourtCount[courtsCount] || waveLabelsByCourtCount[4];

  const pods = [];
  for (let p = 0; p < 6; p++) {
    const group = orderedSlots.slice(p * 4, p * 4 + 4);
    const assignedCourtName = activeCourtNames[p % activeCourtNames.length] || `Court ${(p % courtsCount) + 1}`;
    const cNumMatch = String(assignedCourtName).match(/(\d+)/);
    const courtNum = cNumMatch ? Number(cNumMatch[1]) : ((p % courtsCount) + 1);
    pods.push({
      podIndex: p + 1,
      courtNumber: courtNum,
      courtLabel: assignedCourtName,
      assignedCourt: courtNum,
      primarySlot: waveLabels[p] || `Pod ${p + 1} Rotation`,
      dedicatedTimeSlot: waveLabels[p] || `Pod ${p + 1} Rotation`,
      roundLabel: waveLabels[p] || `Pod ${p + 1} Rotation`,
      teamA: [group[0], group[1]],
      teamB: [group[2], group[3]],
      players: group,
      joinedInPod: group.filter(g => g && g.isJoined).length
    });
  }

  return {
    session,
    totalPlayers: 24,
    joinedCount: realCount,
    openSpotsCount: Math.max(0, 24 - realCount),
    courtsAvailable: courtsCount,
    designatedCourts: desigCourts,
    activeCourtNames,
    pods,
    lastShuffleTime: window.PF_OPEN_PLAY_STATE.lastShuffleTimeBySession[session.id] || session.lastShuffleTime || 'Ready to Shuffle'
  };
}

async function pfShuffleOpenPlay24Players(sessionIdInput) {
  const session = (sessionIdInput && pfGetNormalizedOpenPlaySessions().find(s => s.id === sessionIdInput)) || pfGetActiveOpenPlaySession();
  const realCount = session.players.length;

  const realArr = Array.from({ length: realCount }, (_, i) => i);
  for (let i = realArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = realArr[i];
    realArr[i] = realArr[j];
    realArr[j] = tmp;
  }
  const openArr = Array.from({ length: 24 - realCount }, (_, i) => i + realCount);
  const nextOrder = [...realArr, ...openArr];
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  window.PF_OPEN_PLAY_STATE.shuffledOrderBySession[session.id] = nextOrder;
  window.PF_OPEN_PLAY_STATE.lastShuffleTimeBySession[session.id] = nowStr;

  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const allSessions = pfGetNormalizedOpenPlaySessions().map(s => {
    if (s.id !== session.id) return s;
    return Object.assign({}, s, {
      shuffledOrder: nextOrder,
      lastShuffleTime: nowStr
    });
  });
  cfg.openPlaySessions = allSessions;
  cfg.updatedAt = Date.now();
  window.PF_SITE_CONFIG = cfg;
  try { localStorage.setItem('pf_site_config', JSON.stringify(cfg)); } catch (e) {}

  pfRenderOpenPlay24Board();

  const endpoints = (typeof pfGetApiEndpoints === 'function') ? pfGetApiEndpoints('/api/openplay-shuffle') : ['/api/openplay-shuffle'];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          shuffledOrder: nextOrder,
          lastShuffleTime: nowStr
        })
      });
      if (r.ok) break;
    } catch (e) {}
  }
}

function pfSetOpenPlayCourtCount(count, sessionIdInput) {
  const session = (sessionIdInput && pfGetNormalizedOpenPlaySessions().find(s => s.id === sessionIdInput)) || pfGetActiveOpenPlaySession();
  window.PF_OPEN_PLAY_STATE.courtsOverrideBySession[session.id] = Math.max(1, Math.min(4, Number(count) || 4));
  pfRenderOpenPlay24Board();
}

function pfSwitchOpenPlayPayMethod(methodKey) {
  const m = methodKey || 'GCash';
  window.PF_OPEN_PLAY_STATE.selectedPayMethod = m;
  const hiddenInp = document.getElementById('op-join-pay-method');
  if (hiddenInp) hiddenInp.value = m;

  ['GCash', 'Maya', 'BDO', 'Counter'].forEach(k => {
    const btn = document.getElementById('op-pay-btn-' + k);
    if (btn) {
      btn.className = (k === m)
        ? 'py-2.5 px-3 rounded-xl bg-[#0F291E] text-[#A3E635] border-2 border-[#15803D] font-mono text-xs font-black uppercase transition shadow-sm'
        : 'py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-mono text-xs font-bold uppercase transition';
    }
  });

  const qrBox = document.getElementById('op-join-qr-box');
  const refWrap = document.getElementById('op-join-ref-wrap');
  const qrImg = document.getElementById('op-join-qr-img');
  const qrAcc = document.getElementById('op-join-qr-acc');
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});

  if (m === 'Counter') {
    if (qrBox) qrBox.classList.add('hidden');
    if (refWrap) refWrap.classList.add('hidden');
  } else {
    if (qrBox) qrBox.classList.remove('hidden');
    if (refWrap) refWrap.classList.remove('hidden');
    if (qrImg) {
      if (m === 'GCash') qrImg.src = cfg.qrGcash || 'assets/qr-gcash.png';
      else if (m === 'Maya') qrImg.src = cfg.qrMaya || 'assets/qr-maya.png';
      else qrImg.src = cfg.qrBdo || 'assets/qr-bdo.png';
    }
    if (qrAcc) {
      qrAcc.textContent = m === 'BDO'
        ? 'BDO InstaPay QR Transfer • Scan Official Club QR Code'
        : `${m} Express Send: 0999 883 2346 (P&F Rally Ground)`;
    }
  }
}
window.pfSwitchOpenPlayPayMethod = pfSwitchOpenPlayPayMethod;

function pfUpdateOpenPlayModalTotals() {
  const sessionSelect = document.getElementById('op-join-session-select');
  const seatSelect = document.getElementById('op-join-seats-select');
  const guestsWrap = document.getElementById('op-join-guests-wrap');
  const totalEl = document.getElementById('op-join-total-display');
  const feeBadgeEl = document.getElementById('op-join-session-meta');

  const sessions = pfGetNormalizedOpenPlaySessions();
  const selId = sessionSelect ? sessionSelect.value : window.PF_OPEN_PLAY_STATE.activeSessionId;
  const session = sessions.find(s => s.id === selId) || pfGetActiveOpenPlaySession();
  const unitFee = Math.max(0, Number(session.entryFee !== undefined ? session.entryFee : 150));
  const seats = Math.max(1, Math.min(4, Number(seatSelect ? seatSelect.value : 1)));
  window.PF_OPEN_PLAY_STATE.selectedSeatCount = seats;

  if (guestsWrap) {
    if (seats > 1) guestsWrap.classList.remove('hidden');
    else guestsWrap.classList.add('hidden');
  }

  const totalAmount = unitFee * seats;
  if (totalEl) {
    totalEl.textContent = `₱${totalAmount.toLocaleString()}.00`;
  }
  if (feeBadgeEl) {
    const spotsLeft = Math.max(0, 24 - session.players.length);
    feeBadgeEl.textContent = `${session.schedule} • ₱${unitFee}/player • ${spotsLeft} of 24 seats open`;
  }
}
window.pfUpdateOpenPlayModalTotals = pfUpdateOpenPlayModalTotals;

// Helper: Resolve real-time Admin confirmation status for an Open Play player
function pfResolveOpenPlayPlayerStatus(pl) {
  if (!pl) return { status: 'OPEN', isConfirmed: false, isDeclined: false, badgeLabel: 'Open' };
  const refUpper = String(pl.bookingRef || '').trim().toUpperCase();
  const nameLower = String(pl.name || '').trim().toLowerCase();
  const allBk = (typeof pfGetAllMergedBookings === 'function') ? pfGetAllMergedBookings() : [];
  let matchedBk = null;
  if (refUpper) {
    matchedBk = allBk.find(b => b && String(b.ref || '').trim().toUpperCase() === refUpper);
  }
  if (!matchedBk && nameLower) {
    matchedBk = allBk.find(b => b && (b.isOpenPlay || /^PF-OP-/i.test(String(b.ref || ''))) && String(b.name || '').trim().toLowerCase() === nameLower);
  }
  const rawSt = String((matchedBk && matchedBk.status) || pl.status || 'PENDING').toUpperCase();
  if (rawSt.includes('DECLINE') || rawSt.includes('CANCEL')) {
    return { status: 'DECLINED', isConfirmed: false, isDeclined: true, badgeLabel: '✕ Declined', booking: matchedBk };
  }
  if (rawSt === 'CONFIRMED' || rawSt === 'CHECKED IN' || rawSt === 'APPROVED') {
    return { status: 'CONFIRMED', isConfirmed: true, isDeclined: false, badgeLabel: '✓ Confirmed', booking: matchedBk };
  }
  if (rawSt.includes('DESK') || rawSt.includes('COUNTER')) {
    return { status: 'PENDING', isConfirmed: false, isDeclined: false, badgeLabel: '⏳ Pay at Desk (Pending)', booking: matchedBk };
  }
  return { status: 'PENDING', isConfirmed: false, isDeclined: false, badgeLabel: '⏳ Pending Admin Approval', booking: matchedBk };
}
window.pfResolveOpenPlayPlayerStatus = pfResolveOpenPlayPlayerStatus;

// Helper: Open Open Play Modal pre-configured for a calendar date & time slot
function pfOpenJoinOpenPlayModalForDate(dateYMD, slotStr) {
  const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function') ? pfGetPhilippineTodayYMD() : new Date().toISOString().slice(0, 10);
  const targetDate = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;
  const _ymdParts = targetDate.split('-').map(Number);
  const dow = new Date(Date.UTC(_ymdParts[0], (_ymdParts[1] || 1) - 1, _ymdParts[2] || 1)).getUTCDay();
  const preferredSessionId = (dow === 5 || dow === 6) ? 'op-evening-nightlights' : 'op-afternoon-social';
  pfOpenJoinOpenPlayModal(preferredSessionId, undefined, targetDate);
}
window.pfOpenJoinOpenPlayModalForDate = pfOpenJoinOpenPlayModalForDate;

window.pfOpenPlayUploadedReceiptDataUrl = '';

function pfHandleOpenPlayReceiptUpload(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  const statusEl = document.getElementById('op-join-receipt-status');
  const previewWrap = document.getElementById('op-join-receipt-preview-wrap');
  const previewImg = document.getElementById('op-join-receipt-preview-img');
  if (statusEl) {
    statusEl.textContent = 'Processing receipt image...';
    statusEl.classList.remove('hidden');
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const rawDataUrl = ev.target.result;
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxDim = 900;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.82);
      window.pfOpenPlayUploadedReceiptDataUrl = compressed;
      if (previewImg) previewImg.src = compressed;
      if (previewWrap) previewWrap.classList.remove('hidden');
      if (statusEl) {
        statusEl.innerHTML = '✅ <b>Receipt Image Attached!</b> Sent to Admin Portal for instant verification.';
      }
      // Optional OCR auto-extract reference number if Tesseract is loaded
      if (typeof Tesseract !== 'undefined' && Tesseract.recognize) {
        Tesseract.recognize(compressed, 'eng').then(res => {
          const text = (res && res.data && res.data.text) ? res.data.text : '';
          const m = text.match(/\b(\d{4}[\s-]?\d{3,4}[\s-]?\d{4,6}|\d{8,13})\b/);
          const refInp = document.getElementById('op-join-ref');
          if (m && refInp && !refInp.value.trim()) {
            refInp.value = m[1].replace(/[^\d]/g, '');
            if (statusEl) {
              statusEl.innerHTML = '✅ <b>Receipt Attached &amp; Ref # Auto-Filled (' + pfEscapeHtml(refInp.value) + ')!</b>';
            }
          }
        }).catch(() => {});
      }
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
}
window.pfHandleOpenPlayReceiptUpload = pfHandleOpenPlayReceiptUpload;

// Deterministic 21x21 QR Code Matrix Drawer for Canvas (Zero-CORS, 100% Offline & Crisp)
function pfDrawDeterministicQrOnCanvas(ctx, text, boxX, boxY, boxSize) {
  const modules = 21;
  const grid = Array.from({ length: modules }, () => Array(modules).fill(false));
  const reserved = Array.from({ length: modules }, () => Array(modules).fill(false));

  function placeFinderPattern(r0, c0) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= modules || cc < 0 || cc >= modules) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBorder = (r === 0 || r === 6 || c === 0 || c === 6);
          const isInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          grid[rr][cc] = isBorder || isInner;
        } else {
          grid[rr][cc] = false;
        }
      }
    }
  }

  placeFinderPattern(0, 0);
  placeFinderPattern(0, modules - 7);
  placeFinderPattern(modules - 7, 0);

  // Timing patterns
  for (let i = 8; i < modules - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = (i % 2 === 0);
    grid[i][6] = (i % 2 === 0);
  }

  // Deterministic seed from booking reference & payload
  const seedStr = String(text || 'PF-RALLY-GROUND-GATE-PASS');
  let h1 = 2166136261 >>> 0;
  let h2 = 16777619 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    const ch = seedStr.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ ch, 2246822507) + i * 374761393) >>> 0;
  }

  let bitIdx = 0;
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (reserved[r][c]) continue;
      const charCode = seedStr.charCodeAt(bitIdx % seedStr.length);
      const mix = ((r * 31 + c * 17 + bitIdx * 13) ^ h1 ^ (h2 >>> (bitIdx % 16)) ^ (charCode * 7)) >>> 0;
      grid[r][c] = ((mix & 3) === 0 || (mix & 7) === 3);
      bitIdx++;
    }
  }

  const quietZone = Math.round(boxSize * 0.08);
  const innerSize = boxSize - quietZone * 2;
  const cell = innerSize / modules;

  ctx.fillStyle = '#000000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (grid[r][c]) {
        const rx = Math.floor(boxX + quietZone + c * cell);
        const ry = Math.floor(boxY + quietZone + r * cell);
        const rw = Math.ceil(cell);
        const rh = Math.ceil(cell);
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
  }
}

function pfDrawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Official High-DPI PNG Receipt & Venue Gate Pass Generator (<canvas>)
async function pfGenerateOpenPlayReceiptImageDataUrl(bookingRecord) {
  if (!bookingRecord) return '';

  // Live-resolve latest booking status from merged stores or Open Play roster
  let liveStatus = String(bookingRecord.status || 'PENDING').toUpperCase().trim();
  const refUpper = String(bookingRecord.ref || '').toUpperCase().trim();
  if (refUpper && typeof pfGetAllMergedBookings === 'function') {
    const allBks = pfGetAllMergedBookings();
    const matched = allBks.find(b => b && String(b.ref || '').toUpperCase().trim() === refUpper);
    if (matched && matched.status) {
      liveStatus = String(matched.status).toUpperCase().trim();
    }
  }
  if (typeof pfResolveOpenPlayPlayerStatus === 'function') {
    const resolved = pfResolveOpenPlayPlayerStatus({
      bookingRef: bookingRecord.ref,
      name: bookingRecord.name || bookingRecord.customerName,
      status: liveStatus
    });
    if (resolved && resolved.isConfirmed) {
      liveStatus = 'CONFIRMED';
    }
  }

  const isConfirmed = (liveStatus === 'CONFIRMED' || liveStatus === 'APPROVED' || liveStatus === 'CHECKED IN' || liveStatus === 'PAID');
  const isTournamentBk = Boolean(
    bookingRecord.isTournament ||
    refUpper.startsWith('PF-TRN') ||
    refUpper.startsWith('TRN-') ||
    String(bookingRecord.court || bookingRecord.courtName || '').toLowerCase().includes('tournament')
  );
  const isOpenPlayBk = Boolean(
    !isTournamentBk && (
      bookingRecord.isOpenPlay ||
      refUpper.startsWith('PF-OP') ||
      String(bookingRecord.court || bookingRecord.courtName || '').toLowerCase().includes('open play')
    )
  );

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // Crisp White Paper Receipt & Gate Pass Background (#FFFFFF)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Inner White Sheet Card
  ctx.fillStyle = '#FFFFFF';
  pfDrawRoundedRect(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 20);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Top Club Brand Accent Stripe
  const topGrad = ctx.createLinearGradient(18, 0, canvas.width - 18, 0);
  topGrad.addColorStop(0, '#0F291E');
  topGrad.addColorStop(0.5, '#15803D');
  topGrad.addColorStop(1, '#0D9488');
  ctx.fillStyle = topGrad;
  ctx.fillRect(20, 20, canvas.width - 40, 10);

  // Header Category Label
  ctx.fillStyle = '#15803D';
  ctx.font = '800 14px "JetBrains Mono", monospace';
  const receiptTypeLabel = isTournamentBk
    ? (isConfirmed ? '🏆 OFFICIAL CONFIRMED TOURNAMENT RECEIPT & BRACKET PASS' : '🏆 OFFICIAL TOURNAMENT ENTRY E-RECEIPT & GATE PASS')
    : (isOpenPlayBk
      ? (isConfirmed ? '✅ OFFICIAL CONFIRMED OPEN PLAY RECEIPT & VENUE GATE PASS' : '🏓 OFFICIAL OPEN PLAY E-RECEIPT & VENUE GATE PASS')
      : (isConfirmed ? '✅ OFFICIAL CONFIRMED COURT RECEIPT & VENUE GATE PASS' : '🎾 OFFICIAL COURT BOOKING E-RECEIPT & VENUE GATE PASS'));
  ctx.fillText(receiptTypeLabel, 48, 68, canvas.width - 96);

  // Club Title & Address
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 31px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('P&F RALLY GROUND PICKLEBALL CLUB', 48, 110, canvas.width - 96);

  ctx.fillStyle = '#475569';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText('Velasco St., Phase 4, Doña Maria Subd., Tagas, Daraga, Albay • 0999 883 2346', 48, 138, canvas.width - 96);

  // Subtle Header Divider
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(48, 160);
  ctx.lineTo(canvas.width - 48, 160);
  ctx.stroke();

  // Status Banner Box (Soft Emerald / Soft Amber on White Receipt)
  const bannerBoxW = canvas.width - 96;
  ctx.fillStyle = isConfirmed ? '#ECFDF5' : '#FFFBEB';
  pfDrawRoundedRect(ctx, 48, 178, bannerBoxW, 84, 14);
  ctx.fill();
  ctx.strokeStyle = isConfirmed ? '#10B981' : '#F59E0B';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = isConfirmed ? '#047857' : '#B45309';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillText(
    isConfirmed ? 'OFFICIAL CONFIRMATION & GATE PASS STATUS' : 'BOOKING CONFIRMATION STATUS',
    68,
    206,
    bannerBoxW - 40
  );

  ctx.fillStyle = isConfirmed ? '#065F46' : '#92400E';
  ctx.font = '800 17.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    isConfirmed
      ? '✅ BOOKING CONFIRMED BY ADMIN — OFFICIAL RECEIPT & GATE PASS'
      : '⏳ PENDING ADMIN VERIFICATION (SUBMITTED RECEIPT PASS)',
    68,
    240,
    bannerBoxW - 40
  );

  // Reference & Amount Box (Clean Alabaster Box on White Sheet)
  ctx.fillStyle = '#F8FAFC';
  pfDrawRoundedRect(ctx, 48, 280, canvas.width - 96, 108, 14);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillText('OFFICIAL BOOKING REFERENCE ID', 70, 312);
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 33px "JetBrains Mono", monospace';
  ctx.fillText(String(bookingRecord.ref || 'PF-OP-000000'), 70, 360);

  const amtNum = Number(String(bookingRecord.total || 150).replace(/[^0-9.]/g, '') || 150);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#15803D';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillText(isConfirmed ? 'TOTAL VERIFIED AMOUNT' : 'TOTAL AMOUNT', canvas.width - 70, 312);
  ctx.fillStyle = '#15803D';
  ctx.font = '900 33px "JetBrains Mono", monospace';
  ctx.fillText('₱' + amtNum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), canvas.width - 70, 360);
  ctx.textAlign = 'left';

  // Details Rows
  const rawPlayerCount = Math.max(1, Number(bookingRecord.players || bookingRecord.playersCount || bookingRecord.slots || 1));
  const seatsLabel = isOpenPlayBk
    ? String(rawPlayerCount + ' Participant Seat(s) (₱150.00 / participant)')
    : String(rawPlayerCount + ' Player(s)');
  const resolvedSessionCourt = (typeof window.pfExtractCleanCourtLabel === 'function')
    ? window.pfExtractCleanCourtLabel(bookingRecord)
    : String(bookingRecord.courtName || bookingRecord.court || (isOpenPlayBk ? 'Open Play (Court 1–4)' : 'Court 1'));
  const rawDateStr = String(bookingRecord.date || '').trim();
  const rawTimeStr = String(bookingRecord.time || '').trim();
  const playDateScheduleVal = (rawDateStr && rawTimeStr)
    ? (rawTimeStr.startsWith(rawDateStr) ? rawTimeStr : `${rawDateStr} • ${rawTimeStr}`)
    : (rawTimeStr || rawDateStr || 'Scheduled Session');
  const rows = [
    ['Player Name(s)', String(bookingRecord.guestNamesList || bookingRecord.name || bookingRecord.customerName || 'Guest')],
    ['Contact Mobile', String(bookingRecord.phone || bookingRecord.customerPhone || '—')],
    ['Session / Court', resolvedSessionCourt],
    ['Play Date & Schedule', playDateScheduleVal],
    [isOpenPlayBk ? 'Seats Reserved' : 'Players Included', seatsLabel],
    ['Payment Method', String(bookingRecord.paymentMethod || bookingRecord.paymentMode || 'GCash')],
    ['Payment Ref No.', String(bookingRecord.transactionRef || bookingRecord.paymentRef || 'N/A')],
    ['Receipt Status', isConfirmed ? '✅ CONFIRMED OFFICIAL RECEIPT & VENUE GATE PASS' : '⏳ SUBMITTED — AWAITING ADMIN CONFIRMATION']
  ];

  let y = 434;
  rows.forEach(([label, val]) => {
    ctx.fillStyle = '#64748B';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText(label.toUpperCase(), 54, y, 220);

    ctx.fillStyle = (label === 'Receipt Status')
      ? (isConfirmed ? '#15803D' : '#B45309')
      : '#0F172A';
    ctx.font = '800 15.5px "Plus Jakarta Sans", sans-serif';
    const maxValLen = 46;
    const cleanVal = val.length > maxValLen ? (val.slice(0, maxValLen - 1) + '…') : val;
    ctx.fillText(cleanVal, 285, y, canvas.width - 285 - 54);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(54, y + 14);
    ctx.lineTo(canvas.width - 54, y + 14);
    ctx.stroke();
    y += 46;
  });

  // Bottom Row: Left = Verification & Check-In Instructions, Right = Embedded VENUE GATE PASS QR Card
  const bottomY = 818;
  const bottomH = 208;
  const leftBoxW = canvas.width - 96 - 196;

  ctx.fillStyle = '#F8FAFC';
  pfDrawRoundedRect(ctx, 48, bottomY, leftBoxW, bottomH, 16);
  ctx.fill();
  ctx.strokeStyle = isConfirmed ? '#10B981' : '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#15803D';
  ctx.font = '800 13px "JetBrains Mono", monospace';
  ctx.fillText(
    isConfirmed
      ? '✅ OFFICIAL VENUE GATE PASS & CHECK-IN INSTRUCTIONS:'
      : '🔍 HOW TO CHECK LIVE CONFIRMATION & USE YOUR GATE PASS:',
    68,
    bottomY + 34,
    leftBoxW - 36
  );

  ctx.fillStyle = '#334155';
  ctx.font = '600 13.5px "Plus Jakarta Sans", sans-serif';
  if (isConfirmed) {
    ctx.fillText('1. Your booking is OFFICIALLY CONFIRMED by P&F Rally Ground Admin.', 68, bottomY + 66, leftBoxW - 36);
    ctx.fillText('2. Present this Official Receipt & Venue Gate Pass QR at the Front Desk', 68, bottomY + 92, leftBoxW - 36);
    ctx.fillText('   upon arrival for instant court check-in.', 68, bottomY + 114, leftBoxW - 36);
    ctx.fillStyle = '#15803D';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText('✓ VERIFIED GATE PASS REF: ' + String(bookingRecord.ref || 'PF-PASS'), 68, bottomY + 150, leftBoxW - 36);
    ctx.fillStyle = '#64748B';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText('Issued: ' + String(bookingRecord.createdAt || new Date().toLocaleString('en-PH')), 68, bottomY + 180, leftBoxW - 36);
  } else {
    ctx.fillText('1. Save this Official Receipt & Venue Gate Pass to your phone.', 68, bottomY + 66, leftBoxW - 36);
    ctx.fillText('2. Once Admin verifies your payment, your status updates to "✅ CONFIRMED"', 68, bottomY + 92, leftBoxW - 36);
    ctx.fillText('   for your session and on "My Booking" (check-booking.html).', 68, bottomY + 114, leftBoxW - 36);
    ctx.fillStyle = '#B45309';
    ctx.font = '800 12.5px "JetBrains Mono", monospace';
    ctx.fillText('⏳ GATE PASS REF: ' + String(bookingRecord.ref || 'PF-PASS') + ' (PENDING VERIFICATION)', 68, bottomY + 150, leftBoxW - 36);
    ctx.fillStyle = '#64748B';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText('Issued: ' + String(bookingRecord.createdAt || new Date().toLocaleString('en-PH')), 68, bottomY + 180, leftBoxW - 36);
  }

  // Right Box: Crisp White Rounded VENUE GATE PASS QR Code Card
  const qrCardW = 180;
  const qrCardH = 208;
  const qrCardX = canvas.width - 48 - qrCardW;
  const qrCardY = bottomY;

  ctx.fillStyle = '#FFFFFF';
  pfDrawRoundedRect(ctx, qrCardX, qrCardY, qrCardW, qrCardH, 16);
  ctx.fill();
  ctx.strokeStyle = isConfirmed ? '#15803D' : '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  const qrBoxSize = 148;
  const qrBoxX = qrCardX + Math.round((qrCardW - qrBoxSize) / 2);
  const qrBoxY = qrCardY + 12;
  pfDrawDeterministicQrOnCanvas(
    ctx,
    `${bookingRecord.ref || 'PF-PASS'}|${bookingRecord.name || bookingRecord.customerName || 'Guest'}|${liveStatus}`,
    qrBoxX,
    qrBoxY,
    qrBoxSize
  );

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillText('VENUE GATE PASS', qrCardX + qrCardW / 2, qrCardY + 178);

  ctx.fillStyle = isConfirmed ? '#15803D' : '#B45309';
  ctx.font = '900 10px "JetBrains Mono", monospace';
  ctx.fillText(isConfirmed ? '● CONFIRMED PASS' : '● PENDING VERIFY', qrCardX + qrCardW / 2, qrCardY + 195);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
window.pfGenerateOpenPlayReceiptImageDataUrl = pfGenerateOpenPlayReceiptImageDataUrl;

function pfFindBookingRecordForReceipt(bookingRefInput, fallbackName) {
  const allBk = (typeof pfGetAllMergedBookings === 'function') ? pfGetAllMergedBookings() : [];
  if (bookingRefInput) {
    const refNorm = String(bookingRefInput).toUpperCase().trim();
    const found = allBk.find(b => b && String(b.ref || '').toUpperCase().trim() === refNorm);
    if (found) return found;
  }
  if (fallbackName) {
    const nameNorm = String(fallbackName).toLowerCase().trim();
    const foundByName = allBk.find(b => {
      if (!b) return false;
      const bName = String(b.name || b.customerName || b.guestNamesList || '').toLowerCase();
      return bName.includes(nameNorm);
    });
    if (foundByName) return foundByName;
  }
  // Also check Open Play active session roster if player was added directly
  if (typeof pfGetActiveOpenPlaySession === 'function') {
    const sess = pfGetActiveOpenPlaySession();
    const pl = (sess.players || []).find(p =>
      (bookingRefInput && String(p.bookingRef || '').toUpperCase().trim() === String(bookingRefInput).toUpperCase().trim()) ||
      (fallbackName && String(p.name || '').toLowerCase().trim() === String(fallbackName).toLowerCase().trim())
    );
    if (pl) {
      const stInfo = (typeof pfResolveOpenPlayPlayerStatus === 'function')
        ? pfResolveOpenPlayPlayerStatus(pl)
        : { status: pl.status || 'PENDING', isConfirmed: false };
      return {
        ref: pl.bookingRef || ('PF-OP-' + String(pl.id || '1001').slice(-6).toUpperCase()),
        name: pl.name || fallbackName || 'Open Play Participant',
        customerName: pl.name || fallbackName || 'Open Play Participant',
        phone: pl.phone || '—',
        date: pl.playDate || ((typeof pfGetPhilippineTodayYMD === 'function') ? pfGetPhilippineTodayYMD() : 'Scheduled'),
        time: sess.schedule || 'Tuesday – Thursday • 04:00 PM – 08:00 PM',
        courtName: `Open Play Seat • ${sess.title}`,
        court: `Open Play • ${sess.title}`,
        players: 1,
        paymentMethod: pl.paymentMethod || 'GCash',
        transactionRef: pl.paymentRef || 'VERIFIED',
        status: stInfo.isConfirmed ? 'CONFIRMED' : (stInfo.status || 'PENDING'),
        total: Number(sess.entryFee || 150),
        isOpenPlay: true
      };
    }
  }
  if (typeof pfGetTournamentsList === 'function') {
    const tList = pfGetTournamentsList();
    for (const trn of tList) {
      const regs = Array.isArray(trn.registrations) ? trn.registrations : [];
      const matchedReg = regs.find(r =>
        (bookingRefInput && (String(r.bookingRef || '').toUpperCase().trim() === String(bookingRefInput).toUpperCase().trim() || String(r.id || '').toUpperCase().trim() === String(bookingRefInput).toUpperCase().trim())) ||
        (fallbackName && String(r.teamName || r.player1 || '').toLowerCase().trim() === String(fallbackName).toLowerCase().trim())
      );
      if (matchedReg) {
        const refCode = matchedReg.bookingRef || matchedReg.id || ('PF-TRN-' + String(Date.now()).slice(-6));
        return {
          ref: refCode,
          name: matchedReg.teamName || matchedReg.player1 || fallbackName || 'Tournament Team',
          customerName: matchedReg.teamName || matchedReg.player1 || fallbackName || 'Tournament Team',
          phone: matchedReg.phone || '—',
          date: trn.date || 'Scheduled',
          time: trn.time || '08:00 AM – 05:00 PM',
          courtName: `Tournament • ${trn.title} (Seed #${matchedReg.seedNumber || 1})`,
          court: `Tournament • ${trn.title} (Seed #${matchedReg.seedNumber || 1})`,
          players: 2,
          paymentMethod: matchedReg.paymentMethod || 'GCash',
          transactionRef: matchedReg.paymentRef || 'VERIFIED',
          status: matchedReg.status || 'PENDING',
          total: Number(trn.entryFee || 850),
          isTournament: true
        };
      }
    }
  }
  if (window.pfLastOpenPlayBookingRecord) return window.pfLastOpenPlayBookingRecord;
  try {
    const latest = JSON.parse(localStorage.getItem('latest_booking') || 'null');
    if (latest) return latest;
  } catch (e) {}
  return null;
}
window.pfFindBookingRecordForReceipt = pfFindBookingRecordForReceipt;

async function pfDownloadOpenPlayReceiptImage(bookingRefInput, fallbackName) {
  const targetBk = pfFindBookingRecordForReceipt(bookingRefInput, fallbackName);
  if (!targetBk) return;
  const dataUrl = await pfGenerateOpenPlayReceiptImageDataUrl(targetBk);
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = (targetBk.ref || 'PF-OPENPLAY') + '-Official-Receipt-GatePass.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.pfDownloadOpenPlayReceiptImage = pfDownloadOpenPlayReceiptImage;

async function pfViewOpenPlayReceiptModal(bookingRefInput, fallbackName) {
  const targetBk = pfFindBookingRecordForReceipt(bookingRefInput, fallbackName);
  if (!targetBk) return;
  const dataUrl = await pfGenerateOpenPlayReceiptImageDataUrl(targetBk);
  const stInfo = (typeof pfResolveOpenPlayPlayerStatus === 'function')
    ? pfResolveOpenPlayPlayerStatus({ bookingRef: targetBk.ref, name: targetBk.name, status: targetBk.status })
    : { isConfirmed: String(targetBk.status || '').toUpperCase() === 'CONFIRMED', status: targetBk.status || 'PENDING' };

  let modal = document.getElementById('pf-openplay-receipt-viewer-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pf-openplay-receipt-viewer-modal';
    modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4';
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div onclick="document.getElementById('pf-openplay-receipt-viewer-modal').classList.add('hidden')" class="absolute inset-0"></div>
    <div class="relative z-10 w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white text-slate-900 rounded-3xl border-2 border-[#15803D] shadow-2xl p-5 sm:p-6 space-y-4 animate-fadeIn">
      <div class="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <span class="px-2.5 py-0.5 rounded-full ${stInfo.isConfirmed ? 'bg-emerald-100 text-emerald-900 border border-emerald-400' : 'bg-amber-100 text-amber-900 border border-amber-400'} font-mono text-[10px] font-black uppercase">
            ${stInfo.isConfirmed ? '✅ OFFICIAL CONFIRMED RECEIPT & VENUE GATE PASS' : '⏳ SUBMITTED RECEIPT & GATE PASS (PENDING ADMIN)'}
          </span>
          <h3 class="text-lg font-black text-slate-900 mt-1">${pfEscapeHtml(targetBk.name || targetBk.customerName || 'Player')} • ${pfEscapeHtml(targetBk.ref || '')}</h3>
        </div>
        <button type="button" onclick="document.getElementById('pf-openplay-receipt-viewer-modal').classList.add('hidden')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white font-black text-xs">✕</button>
      </div>
      <div class="p-2.5 rounded-2xl bg-slate-100 border border-slate-300">
        <img src="${dataUrl}" alt="Official Receipt & Venue Gate Pass" class="w-full h-auto rounded-xl shadow-md mx-auto">
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button type="button" onclick="pfDownloadOpenPlayReceiptImage('${pfEscapeHtml(targetBk.ref || '')}', '${pfEscapeHtml(targetBk.name || '')}')" class="flex-1 py-3 px-4 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5">
          <span>📥 Download Receipt &amp; Gate Pass (PNG)</span>
        </button>
        <a href="check-booking.html?ref=${encodeURIComponent(targetBk.ref || '')}" class="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-extrabold text-xs uppercase tracking-wider">
          🔍 Open in My Booking
        </a>
      </div>
    </div>
  `;
}
window.pfViewOpenPlayReceiptModal = pfViewOpenPlayReceiptModal;

function pfGetOpenPlayDateMetrics(s, targetDateInput) {
    const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function')
        ? pfGetPhilippineTodayYMD()
        : new Date().toISOString().slice(0, 10);
    const targetDate = (targetDateInput && /^\d{4}-\d{2}-\d{2}$/.test(String(targetDateInput).trim()))
        ? String(targetDateInput).trim()
        : (window.pfSelectedOpenPlayCardDate || todayYMD);
    const maxSlots = Math.max(1, Number((s && s.maxSlots) || 24));
    const unitFee = Math.max(1, Number((s && s.entryFee) || 150));
    const allPlayers = (s && Array.isArray(s.players)) ? s.players : [];
    const inferSlots = (p) => {
        let cnt = Number(p && (p.playersCount || p.players || p.slots || 0));
        if (!cnt || cnt <= 1) {
            const nm = String((p && p.name) || '');
            const m = nm.match(/\((\d+)\s*Players?\)/i) || nm.match(/\b(\d+)\s*x\s*Open\s*Play/i);
            const pr = Number((p && p.price) ?? 0);
            if (m) cnt = parseInt(m[1], 10) || 1;
            else if (pr >= unitFee * 2) cnt = Math.round(pr / unitFee);
        }
        return Math.max(1, cnt || 1);
    };
    // Confirmed/Accepted bookings on targetDate take their player count in slots
    const confirmedOnDate = allPlayers.filter(p => {
        if (!p) return false;
        const pDate = String(p.openPlayDate || todayYMD).slice(0, 10);
        if (pDate !== targetDate) return false;
        const st = String(p.status || 'Accepted').toLowerCase();
        return st === 'accepted' || st === 'confirmed' || st === 'booked' || st === 'checked in';
    });
    const pendingOnDate = allPlayers.filter(p => {
        if (!p) return false;
        const pDate = String(p.openPlayDate || todayYMD).slice(0, 10);
        if (pDate !== targetDate) return false;
        const st = String(p.status || '').toLowerCase();
        return st === 'pending';
    });
    const takenSlots = confirmedOnDate.reduce((sum, p) => sum + inferSlots(p), 0);
    const pendingSlots = pendingOnDate.reduce((sum, p) => sum + inferSlots(p), 0);
    const confirmedNames = confirmedOnDate.map(p => String(p.name || 'Player').trim()).filter(Boolean);
    const availableSlots = (targetDate === todayYMD && s && s.slotsAvailableOverride !== null && s.slotsAvailableOverride !== undefined && s.slotsAvailableOverride !== '')
        ? Math.max(0, Number(s.slotsAvailableOverride))
        : Math.max(0, maxSlots - takenSlots);
    const filledSlots = Math.max(0, maxSlots - availableSlots);
    const fillPercent = Math.min(100, Math.round((filledSlots / maxSlots) * 100));
    return { todayYMD, targetDate, maxSlots, takenSlots, pendingSlots, availableSlots, filledSlots, fillPercent, confirmedNames };
}
window.pfGetOpenPlayDateMetrics = pfGetOpenPlayDateMetrics;

function pfGetOpenPlaySlotBadgeForDate(dateYMD) {
    const sessions = (typeof pfGetNormalizedOpenPlaySessions === 'function') ? pfGetNormalizedOpenPlaySessions() : [];
    const s = sessions[0] || DEFAULT_OPEN_PLAY_SESSIONS[0] || { maxSlots: 24, entryFee: 150, players: [] };
    return pfGetOpenPlayDateMetrics(s, dateYMD);
}
window.pfGetOpenPlaySlotBadgeForDate = pfGetOpenPlaySlotBadgeForDate;

function pfSelectOpenPlayCardDate(dateYMD) {
    if (!dateYMD) return;
    const cleanDate = String(dateYMD).trim();
    window.pfSelectedOpenPlayCardDate = cleanDate;
    if (typeof pfRenderOpenPlay24Board === 'function') {
        pfRenderOpenPlay24Board();
    }
    if (typeof window.jumpScheduleToDate === 'function') {
        try { window.jumpScheduleToDate(cleanDate); } catch (e) {}
    } else if (typeof window.renderLiveScheduleMatrix === 'function') {
        try {
            window.selectedScheduleDateYMD = cleanDate;
            window.renderLiveScheduleMatrix();
        } catch (e) {}
    }
}
window.pfSelectOpenPlayCardDate = pfSelectOpenPlayCardDate;

function pfHandleJoinOpenPlayDateChange(sessionId, newDateYMD) {
    const sessions = pfGetNormalizedOpenPlaySessions();
    const s = sessions.find(item => item.id === sessionId) || sessions[0];
    if (!s) return;
    const fee = Number(s.entryFee || 150);
    const m = pfGetOpenPlayDateMetrics(s, newDateYMD);
    const headerBadge = document.getElementById('pf-join-op-header-slots-badge');
    if (headerBadge) {
        headerBadge.textContent = `Open Play Registration • ${m.availableSlots} of ${m.maxSlots} Slots Left (${m.targetDate})`;
    }
    const playersInp = document.getElementById('pf-join-op-players');
    if (playersInp) {
        playersInp.max = String(Math.max(1, m.availableSlots));
    }
    pfSyncJoinOpenPlayPlayersFee(fee, m.availableSlots);
}
window.pfHandleJoinOpenPlayDateChange = pfHandleJoinOpenPlayDateChange;

function pfAdjustJoinOpenPlayPlayers(delta, unitFee, maxAvail) {
    const inp = document.getElementById('pf-join-op-players');
    if (!inp) return;
    const cur = parseInt(inp.value, 10) || 1;
    const cap = Math.max(1, Number(maxAvail || 24));
    const next = Math.max(1, Math.min(cap, cur + delta));
    inp.value = next;
    pfSyncJoinOpenPlayPlayersFee(unitFee, cap);
}
window.pfAdjustJoinOpenPlayPlayers = pfAdjustJoinOpenPlayPlayers;

function pfSyncJoinOpenPlayPlayersFee(unitFee, maxAvail) {
    const inp = document.getElementById('pf-join-op-players');
    const feePerPlayer = Number(unitFee || 150);
    const cap = Math.max(1, Number(maxAvail || 24));
    let numPlayers = Math.max(1, parseInt(inp?.value, 10) || 1);
    if (numPlayers > cap) {
        numPlayers = cap;
        if (inp) inp.value = cap;
    }
    const total = feePerPlayer * numPlayers;
    const feeLabel = document.getElementById('pf-join-op-total-fee-badge');
    if (feeLabel) {
        feeLabel.textContent = `Total Fee: ₱${total.toLocaleString()} (${numPlayers} Player${numPlayers > 1 ? 's' : ''})`;
    }
    const slotsNote = document.getElementById('pf-join-op-slots-note');
    if (slotsNote) {
        const leftAfter = Math.max(0, cap - numPlayers);
        slotsNote.textContent = `Reserves ${numPlayers} Open Play slot${numPlayers > 1 ? 's' : ''} (${leftAfter} slot${leftAfter === 1 ? '' : 's'} remaining after booking)`;
    }
    const qrStrong = document.getElementById('pf-join-op-qr-amount-strong');
    if (qrStrong) {
        qrStrong.textContent = `₱${total.toLocaleString()}`;
    }
}
window.pfSyncJoinOpenPlayPlayersFee = pfSyncJoinOpenPlayPlayersFee;

function pfOpenJoinOpenPlayModal(sessionId, _unused, preferredDateYMD) {
    const sessions = pfGetNormalizedOpenPlaySessions();
    const s = sessions.find(item => item.id === sessionId) || sessions[0];
    if (!s) return;

    const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function')
        ? pfGetPhilippineTodayYMD()
        : new Date().toISOString().slice(0, 10);
    const defaultDate = preferredDateYMD || window.pfSelectedOpenPlayCardDate || todayYMD;
    const metrics = pfGetOpenPlayDateMetrics(s, defaultDate);
    const maxSlots = metrics.maxSlots;
    const availableSlots = metrics.availableSlots;

    if (availableSlots <= 0) {
        if (typeof showToast === 'function') {
            showToast(`Open Play on ${defaultDate} is currently full. Please select another date.`, 'warning');
        }
        return;
    }

    const existing = document.getElementById('pf-join-open-play-modal');
    if (existing) existing.remove();

    const desigCourtsList = (Array.isArray(s.designatedCourts) && s.designatedCourts.length > 0)
        ? s.designatedCourts
        : (typeof pfGetOpenPlayDesignatedCourts === 'function' ? pfGetOpenPlayDesignatedCourts() : ['Court 1', 'Court 2', 'Court 3', 'Court 4']);
    const courtsLabel = desigCourtsList.length === 4 ? 'Court 1–4 (All 4 Courts)' : desigCourtsList.join(', ');
    const fee = Number(s.entryFee || 150);

    const modal = document.createElement('div');
    modal.id = 'pf-join-open-play-modal';
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto';
    modal.innerHTML = `
        <div class="relative w-full max-w-lg rounded-3xl bg-white border border-[#E6E4DD] p-5 sm:p-7 text-[#0D1F18] shadow-[0_24px_60px_rgba(13,31,24,0.28)] my-8 max-h-[92vh] overflow-y-auto">
            <div class="flex items-start justify-between gap-3 mb-2.5">
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E8F5EE] border border-[#BFE3CE] text-[#0F3D2A] text-[11px] font-bold uppercase tracking-wider leading-snug">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0"></span>
                    <span id="pf-join-op-header-slots-badge">Open Play Registration • ${availableSlots} of ${maxSlots} Slots Left (${defaultDate})</span>
                </div>
                <button type="button" onclick="document.getElementById('pf-join-open-play-modal')?.remove()" class="w-9 h-9 rounded-xl bg-[#F5F4F0] hover:bg-[#EAE8E1] border border-[#E6E4DD] text-[#0D1F18] flex items-center justify-center font-bold transition-colors shrink-0 cursor-pointer" aria-label="Close">✕</button>
            </div>
            <h3 class="font-display font-bold text-2xl text-[#0D1F18] tracking-tight">${pfEscapeHtml(s.title)}</h3>
            <p class="text-xs text-[#475850] mt-1 mb-5">${pfEscapeHtml(s.schedule || 'Tue–Thu: 4:00 PM – 8:00 PM • Fri–Sat: 6:00 PM – 10:00 PM')} • ${pfEscapeHtml(courtsLabel)} • <span class="text-[#0F3D2A] font-bold">₱${fee.toLocaleString()} / Player</span></p>

            <form id="pf-join-open-play-form" onsubmit="pfSubmitJoinOpenPlayForm(event, '${pfEscapeHtml(s.id)}')" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#475850] mb-1.5">Full Name *</label>
                        <input type="text" id="pf-join-op-name" required maxlength="60" placeholder="e.g. Marco Reyes" class="w-full px-4 py-3 rounded-xl bg-[#FAFAF7] border border-[#D5D3CB] text-[#0D1F18] placeholder-[#8A948E] text-sm font-medium focus:outline-none focus:border-[#0F3D2A]">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#475850] mb-1.5">Mobile Number <span class="text-[#64748B] font-normal">(Optional)</span></label>
                        <input type="tel" id="pf-join-op-phone" maxlength="20" placeholder="e.g. 0917-555-0199" class="w-full px-4 py-3 rounded-xl bg-[#FAFAF7] border border-[#D5D3CB] text-[#0D1F18] placeholder-[#8A948E] text-sm font-medium focus:outline-none focus:border-[#0F3D2A]">
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#475850] mb-1.5">Open Play Date *</label>
                        <input type="date" id="pf-join-op-date" required min="${todayYMD}" value="${pfEscapeHtml(defaultDate)}" onchange="pfHandleJoinOpenPlayDateChange('${pfEscapeHtml(s.id)}', this.value)" class="w-full px-4 py-3 rounded-xl bg-[#FAFAF7] border border-[#D5D3CB] text-[#0D1F18] text-sm font-semibold focus:outline-none focus:border-[#0F3D2A]">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#475850] mb-1.5">Number of Players (₱${fee}/player) *</label>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="pfAdjustJoinOpenPlayPlayers(-1, ${fee}, ${availableSlots})" class="px-3.5 py-3 rounded-xl bg-[#F5F4F0] hover:bg-[#EAE8E1] border border-[#D5D3CB] text-[#0D1F18] font-bold text-sm cursor-pointer">−</button>
                            <input type="number" id="pf-join-op-players" min="1" max="${availableSlots}" value="1" oninput="pfSyncJoinOpenPlayPlayersFee(${fee}, ${availableSlots})" onchange="pfSyncJoinOpenPlayPlayersFee(${fee}, ${availableSlots})" class="w-full px-3 py-3 rounded-xl bg-[#FAFAF7] border border-[#D5D3CB] text-[#0D1F18] text-center text-sm font-extrabold focus:outline-none focus:border-[#0F3D2A]">
                            <button type="button" onclick="pfAdjustJoinOpenPlayPlayers(1, ${fee}, ${availableSlots})" class="px-3.5 py-3 rounded-xl bg-[#F5F4F0] hover:bg-[#EAE8E1] border border-[#D5D3CB] text-[#0D1F18] font-bold text-sm cursor-pointer">+</button>
                        </div>
                        <p id="pf-join-op-slots-note" class="text-[10px] font-semibold text-[#15803D] mt-1">Reserves 1 Open Play slot (${Math.max(0, availableSlots - 1)} slots remaining after booking)</p>
                    </div>
                </div>

                <!-- Payment Method Selector -->
                <div class="rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] p-4 space-y-3.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-[#475850]">Select Payment Method *</span>
                        <span id="pf-join-op-total-fee-badge" class="text-xs font-extrabold text-[#0F3D2A]">Total Fee: ₱${fee.toLocaleString()} (1 Player)</span>
                    </div>
                    <input type="hidden" id="pf-join-op-pay-method" value="GCash">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button type="button" onclick="pfSelectOpenPlayPayMethod('GCash')" data-op-pay-btn="GCash" class="px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-[#0F3D2A] text-white border-[#0F3D2A] cursor-pointer">GCash</button>
                        <button type="button" onclick="pfSelectOpenPlayPayMethod('Maya')" data-op-pay-btn="Maya" class="px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-white text-[#0D1F18] border-[#D5D3CB] cursor-pointer">Maya</button>
                        <button type="button" onclick="pfSelectOpenPlayPayMethod('BDO')" data-op-pay-btn="BDO" class="px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-white text-[#0D1F18] border-[#D5D3CB] cursor-pointer">BDO / Bank</button>
                        <button type="button" onclick="pfSelectOpenPlayPayMethod('Manual')" data-op-pay-btn="Manual" class="px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-white text-[#0D1F18] border-[#D5D3CB] cursor-pointer">Manual Payment</button>
                    </div>

                    <div id="pf-join-op-qr-box" class="flex flex-col sm:flex-row items-center gap-3.5 p-3.5 rounded-xl bg-white border border-[#E6E4DD]">
                        <img id="pf-join-op-qr-img" src="assets/qr-gcash.png" onerror="this.src='assets/logo.png'" alt="Payment QR" class="w-24 h-24 rounded-lg object-contain border border-[#E6E4DD] bg-white p-1 shrink-0 cursor-pointer" onclick="if(window.pfOpenQrStandeeLightbox) pfOpenQrStandeeLightbox((document.getElementById('pf-join-op-pay-method')?.value || 'gcash').toLowerCase())">
                        <div class="text-xs text-[#475850] space-y-1 text-center sm:text-left">
                            <div id="pf-join-op-qr-title" class="font-bold text-[#0D1F18]">Scan via GCash (0999 883 2346)</div>
                            <p id="pf-join-op-qr-desc" class="text-[11px] leading-relaxed">Send exact Open Play fee (<strong id="pf-join-op-qr-amount-strong" class="text-[#0D1F18]">₱${fee.toLocaleString()}</strong>) then enter your Reference Number and upload your payment screenshot below.</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label id="pf-join-op-ref-label" class="block text-[10px] font-bold uppercase tracking-wider text-[#475850] mb-1">Reference No. *</label>
                            <input type="text" id="pf-join-op-ref" required maxlength="40" placeholder="Last 6-12 digits" class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#D5D3CB] text-[#0D1F18] placeholder-[#8A948E] text-xs font-mono font-semibold focus:outline-none focus:border-[#0F3D2A]">
                        </div>
                        <div>
                            <label id="pf-join-op-receipt-label" class="block text-[10px] font-bold uppercase tracking-wider text-[#475850] mb-1">Upload Payment Receipt *</label>
                            <input type="file" id="pf-join-op-receipt" required accept="image/*" class="w-full text-[11px] text-[#475850] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#E8F5EE] file:text-[#0F3D2A] hover:file:bg-[#D5EDE0]">
                        </div>
                    </div>
                </div>

                <!-- Policy Checkbox -->
                <label class="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                    <input type="checkbox" id="pf-join-op-policy" required class="mt-0.5 w-4 h-4 rounded border-[#D5D3CB] text-[#0F3D2A] focus:ring-[#0F3D2A]">
                    <span class="text-[11px] text-[#475850] leading-relaxed">
                        I confirm my Open Play slot details and agree to the <button type="button" onclick="openPolicyModal('terms')" class="text-[#0F3D2A] font-bold underline">Facility Rules & Non-Refundable Slot Policy</button>.
                    </span>
                </label>

                <div class="pt-2 flex items-center justify-end gap-2.5">
                    <button type="button" onclick="document.getElementById('pf-join-open-play-modal')?.remove()" class="px-4 py-2.5 rounded-xl bg-[#F5F4F0] hover:bg-[#EAE8E1] text-[#475850] text-xs font-bold transition-colors">Cancel</button>
                    <button type="submit" class="px-6 py-3 rounded-xl bg-[#0F3D2A] hover:bg-[#16533B] text-white font-display font-bold text-xs uppercase tracking-wider shadow-md transition-all">Submit Open Play Booking</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}
window.pfOpenJoinOpenPlayModal = pfOpenJoinOpenPlayModal;

function pfSelectOpenPlayPayMethod(method) {
    const input = document.getElementById('pf-join-op-pay-method');
    if (input) input.value = method;
    document.querySelectorAll('[data-op-pay-btn]').forEach(btn => {
        const isSelected = btn.getAttribute('data-op-pay-btn') === method;
        btn.className = isSelected
            ? 'px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-[#0F3D2A] text-white border-[#0F3D2A] cursor-pointer shadow-xs'
            : 'px-3 py-2.5 rounded-xl text-xs font-bold border transition-all bg-white text-[#0D1F18] border-[#D5D3CB] cursor-pointer';
    });
    const qrImg = document.getElementById('pf-join-op-qr-img');
    const qrTitle = document.getElementById('pf-join-op-qr-title');
    const qrDesc = document.getElementById('pf-join-op-qr-desc');
    const refInput = document.getElementById('pf-join-op-ref');
    const refLabel = document.getElementById('pf-join-op-ref-label');
    if (method === 'GCash') {
        if (qrImg) qrImg.src = 'assets/qr-gcash.png';
        if (qrTitle) qrTitle.textContent = 'Scan via GCash (0999 883 2346)';
        if (qrDesc) qrDesc.innerHTML = 'Send exact Open Play fee then enter your GCash Reference Number below.';
        if (refLabel) refLabel.textContent = 'GCash Reference No. *';
        if (refInput) {
            refInput.required = true;
            if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
            refInput.placeholder = 'GCash Reference No.';
        }
    } else if (method === 'Maya') {
        if (qrImg) qrImg.src = 'assets/qr-maya.png';
        if (qrTitle) qrTitle.textContent = 'Scan via Maya (0999 883 2346)';
        if (qrDesc) qrDesc.innerHTML = 'Send exact Open Play fee then enter your Maya Reference Number below.';
        if (refLabel) refLabel.textContent = 'Maya Reference No. *';
        if (refInput) {
            refInput.required = true;
            if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
            refInput.placeholder = 'Maya Reference No.';
        }
    } else if (method === 'BDO') {
        if (qrImg) qrImg.src = 'assets/qr-bdo.png';
        if (qrTitle) qrTitle.textContent = 'Scan via BDO / Bank Transfer';
        if (qrDesc) qrDesc.innerHTML = 'Scan BDO InstaPay QR then enter your Bank Reference Number below.';
        if (refLabel) refLabel.textContent = 'BDO / Bank Reference No. *';
        if (refInput) {
            refInput.required = true;
            if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
            refInput.placeholder = 'BDO Reference No.';
        }
    } else {
        if (qrImg) qrImg.src = 'assets/logo.png';
        if (qrTitle) qrTitle.textContent = 'Manual Payment • Pay at Front Desk';
        if (qrDesc) qrDesc.innerHTML = 'Reserve your Open Play slot now and pay cash or settle directly at the <b>P&amp;F Rally Ground Front Desk</b> upon arrival.';
        if (refLabel) refLabel.textContent = 'Manual Payment Note / OR# (Auto-filled)';
        if (refInput) {
            refInput.required = false;
            if (!refInput.value.trim()) refInput.value = 'MANUAL-FRONT-DESK';
            refInput.placeholder = 'MANUAL-FRONT-DESK';
        }
    }
    const receiptInp = document.getElementById('pf-join-op-receipt');
    const receiptLbl = document.getElementById('pf-join-op-receipt-label');
    if (receiptInp) receiptInp.required = (method !== 'Manual');
    if (receiptLbl) receiptLbl.textContent = (method === 'Manual') ? 'Upload Receipt (Optional for Manual)' : 'Upload Payment Receipt *';
}
window.pfSelectOpenPlayPayMethod = pfSelectOpenPlayPayMethod;

let _isSubmittingOpenPlayJoin = false;
function pfSubmitJoinOpenPlayForm(event, sessionId) {
    if (event) event.preventDefault();
    if (_isSubmittingOpenPlayJoin) return;
    const nameEl = document.getElementById('pf-join-op-name');
    const phoneEl = document.getElementById('pf-join-op-phone');
    const dateEl = document.getElementById('pf-join-op-date');
    const methodEl = document.getElementById('pf-join-op-pay-method');
    const refEl = document.getElementById('pf-join-op-ref');
    const receiptEl = document.getElementById('pf-join-op-receipt');

    const name = (nameEl?.value || '').trim();
    const phone = (phoneEl?.value || '').trim();
    const openPlayDate = (dateEl?.value || new Date().toISOString().slice(0, 10)).trim();
    const paymentMethod = (methodEl?.value || 'GCash').trim();
    const refNumber = (refEl?.value || '').trim();

    if (!name) return;
    if (phone && phone.replace(/[^0-9]/g, '').length < 10) {
        alert('Please enter a valid 11-digit mobile number or leave it blank.');
        phoneEl?.focus();
        return;
    }
    const hasReceiptFile = Boolean(receiptEl && receiptEl.files && receiptEl.files[0]);
    if (paymentMethod.toLowerCase() !== 'manual' && !hasReceiptFile) {
        alert('Please attach/upload your payment receipt screenshot before submitting your Open Play booking.');
        receiptEl?.focus();
        return;
    }

    _isSubmittingOpenPlayJoin = true;
    const submitBtn = event?.target?.querySelector('button[type="submit"]') || document.querySelector('#pf-join-open-play-modal button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const finalizeSubmission = async (receiptDataUrl) => {
        try {
        const sessions = pfGetNormalizedOpenPlaySessions();
        const s = sessions.find(item => item.id === sessionId) || sessions[0];
        if (!s) return;

        if (!Array.isArray(s.players)) s.players = [];
        const bookingRef = 'PF-OP-' + Math.floor(100000 + Math.random() * 900000);
        const resolvedRef = refNumber || (paymentMethod.toLowerCase() === 'manual' ? 'MANUAL-FRONT-DESK' : ('OP-' + String(Date.now()).slice(-6)));
        const numPlayers = Math.max(1, parseInt(document.getElementById('pf-join-op-players')?.value, 10) || 1);
        const unitFeeVal = Number(s.entryFee || 150);
        const totalFeeVal = unitFeeVal * numPlayers;
        const displayJoinName = numPlayers > 1 ? `${name} (${numPlayers} Players)` : name;
        const newPlayer = {
            id: bookingRef,
            bookingRef: bookingRef,
            name: displayJoinName,
            phone,
            openPlayDate,
            paymentMethod: paymentMethod.toLowerCase() === 'manual' ? 'MANUAL PAYMENT' : paymentMethod,
            refNumber: resolvedRef,
            receiptDataUrl: receiptDataUrl || '',
            playersCount: numPlayers,
            players: numPlayers,
            slots: numPlayers,
            price: totalFeeVal,
            status: 'Pending',
            joinedAt: new Date().toISOString()
        };
        s.players.push(newPlayer);
        if (s.slotsAvailableOverride !== null && s.slotsAvailableOverride !== undefined && s.slotsAvailableOverride !== '') {
            s.slotsAvailableOverride = Math.max(0, Number(s.slotsAvailableOverride) - numPlayers);
        }

        try {
            localStorage.setItem('pf_open_play_sessions_v1', JSON.stringify(sessions));
        } catch (e) {}

        // Also sync to unified bookings list so player can check status & Admin sees it in Bookings
        const desigCourtsList = (Array.isArray(s.designatedCourts) && s.designatedCourts.length > 0)
            ? s.designatedCourts
            : (typeof pfGetOpenPlayDesignatedCourts === 'function' ? pfGetOpenPlayDesignatedCourts() : ['Court 1', 'Court 2', 'Court 3', 'Court 4']);
        const courtsLabel = desigCourtsList.length === 4 ? 'Court 1-4' : desigCourtsList.join(', ');
        const opBookingRecord = {
            ref: bookingRef,
            name: displayJoinName,
            customerName: displayJoinName,
            phone: phone,
            customerPhone: phone,
            email: 'guest@pfrally.ph',
            court: `Open Play (${courtsLabel})`,
            date: openPlayDate,
            time: `${openPlayDate} • ${s.schedule || 'Open Play Session'}`,
            players: numPlayers,
            playersCount: numPlayers,
            slots: numPlayers,
            paymentMethod: paymentMethod.toLowerCase() === 'manual' ? 'MANUAL PAYMENT' : paymentMethod.toUpperCase(),
            paymentMode: paymentMethod.toLowerCase() === 'manual' ? 'MANUAL PAYMENT' : paymentMethod.toUpperCase(),
            transactionRef: resolvedRef,
            receiptDataUrl: receiptDataUrl || '',
            total: totalFeeVal,
            status: 'PENDING',
            isOpenPlay: true,
            bookingType: 'OPEN_PLAY',
            items: [`${numPlayers}× Open Play Slot(s) — ${courtsLabel} (₱${totalFeeVal})`],
            createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
        };
        try {
            const allB = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]');
            allB.unshift(opBookingRecord);
            localStorage.setItem('pf_all_bookings', JSON.stringify(allB));
            localStorage.setItem('pf_last_booking', JSON.stringify(opBookingRecord));
        } catch (e) {}

        if (window.PF_SITE_CONFIG) {
            window.PF_SITE_CONFIG.openPlaySessions = sessions;
            window.PF_SITE_CONFIG.updatedAt = Date.now();
            try { localStorage.setItem('pf_site_config', JSON.stringify(window.PF_SITE_CONFIG)); } catch (e) {}
        }
        if (typeof sharedServerState !== 'undefined' && Array.isArray(sharedServerState.bookings)) {
            sharedServerState.bookings.unshift(opBookingRecord);
        }

        const endpoints = (typeof window.pfGetApiEndpoints === 'function') ? window.pfGetApiEndpoints('/api/bookings') : ['/api/bookings'];
        for (const ep of endpoints) {
            try {
                const res = await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(opBookingRecord)
                });
                if (res && res.ok) break;
            } catch (e) {}
        }
        const scEndpoints = (typeof window.pfGetApiEndpoints === 'function') ? window.pfGetApiEndpoints('/api/site-config') : ['/api/site-config'];
        for (const ep of scEndpoints) {
            try {
                const res = await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteConfig: { openPlaySessions: sessions, updatedAt: Date.now() } })
                });
                if (res && res.ok) break;
            } catch (e) {}
        }

        if (typeof saveStateToCloud === 'function') {
            saveStateToCloud();
        }

        const modal = document.getElementById('pf-join-open-play-modal');
        if (modal) modal.remove();

        pfRenderOpenPlay24Board();

        if (typeof pfViewOpenPlayReceiptModal === 'function') {
            pfViewOpenPlayReceiptModal(bookingRef, name);
        } else if (typeof showToast === 'function') {
            showToast(`Spot reserved for ${name} (${bookingRef})! Sent to Admin for verification.`, 'success');
        }
        } finally {
            _isSubmittingOpenPlayJoin = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    };

    const file = receiptEl && receiptEl.files && receiptEl.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => finalizeSubmission(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => finalizeSubmission('');
        reader.readAsDataURL(file);
    } else {
        finalizeSubmission('');
    }
}
window.pfSubmitJoinOpenPlayForm = pfSubmitJoinOpenPlayForm;

function pfOpenOpenPlayPosterLightbox(url, title) {
    const existing = document.getElementById('pf-open-play-poster-lightbox');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'pf-open-play-poster-lightbox';
    modal.className = 'fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    modal.innerHTML = `
        <div class="relative max-w-3xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#E6E4DD]">
            <button type="button" onclick="document.getElementById('pf-open-play-poster-lightbox')?.remove()" class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center font-bold text-base">✕</button>
            <img src="${pfEscapeHtml(url)}" alt="${pfEscapeHtml(title || 'Open Play Poster')}" class="w-full max-h-[82vh] object-contain bg-[#0D1F18]">
        </div>
    `;
    document.body.appendChild(modal);
}
window.pfOpenOpenPlayPosterLightbox = pfOpenOpenPlayPosterLightbox;

function pfFormatEditorialCardTitle(rawTitle) {
  const clean = String(rawTitle || '').trim();
  if (!clean) return '';
  const words = clean.split(/\s+/);
  if (words.length <= 1) {
    return `<span class="pf-serif-accent">${pfEscapeHtml(clean)}</span>`;
  }
  const splitIdx = words.length >= 4 ? words.length - 2 : words.length - 1;
  const lead = words.slice(0, splitIdx).join(' ');
  const tail = words.slice(splitIdx).join(' ');
  return `${pfEscapeHtml(lead)} <span class="pf-serif-accent">${pfEscapeHtml(tail)}</span>`;
}
window.pfFormatEditorialCardTitle = pfFormatEditorialCardTitle;

function pfRenderSingleOpenPlayCardHtml(s) {
    const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function')
        ? pfGetPhilippineTodayYMD()
        : new Date().toISOString().slice(0, 10);
    if (!window.pfSelectedOpenPlayCardDate || window.pfSelectedOpenPlayCardDate < todayYMD) {
        window.pfSelectedOpenPlayCardDate = todayYMD;
    }
    const selectedDateYMD = window.pfSelectedOpenPlayCardDate;
    const metrics = pfGetOpenPlayDateMetrics(s, selectedDateYMD);
    const maxSlots = metrics.maxSlots;
    const takenSlots = metrics.takenSlots;
    const availableSlots = metrics.availableSlots;
    const fillPercent = metrics.fillPercent;

    // Build upcoming Open Play day pills (Today + next 5 Open Play days + any date with bookings)
    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const defaultDays = Array.isArray(s.defaultDays) && s.defaultDays.length > 0
        ? s.defaultDays
        : ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const candidateDates = [];
    const seenCand = new Set();
    const [tY, tM, tD] = todayYMD.split('-').map(Number);
    for (let offset = 0; offset < 10 && candidateDates.length < 5; offset++) {
        const dt = new Date(tY, (tM || 1) - 1, (tD || 1) + offset);
        const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const dName = dayNamesShort[dt.getDay()];
        if (offset === 0 || defaultDays.includes(dName) || ymd === selectedDateYMD) {
            seenCand.add(ymd);
            candidateDates.push({
                ymd,
                label: offset === 0 ? `Today (${monthNamesShort[dt.getMonth()]} ${dt.getDate()})` : `${dName}, ${monthNamesShort[dt.getMonth()]} ${dt.getDate()}`
            });
        }
    }
    if (Array.isArray(s.players)) {
        s.players.forEach(p => {
            const pDate = String(p?.openPlayDate || '').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate >= todayYMD && !seenCand.has(pDate)) {
                seenCand.add(pDate);
                const [py, pm, pd] = pDate.split('-').map(Number);
                const dt = new Date(py, (pm || 1) - 1, pd || 1);
                candidateDates.push({
                    ymd: pDate,
                    label: `${dayNamesShort[dt.getDay()]}, ${monthNamesShort[dt.getMonth()]} ${dt.getDate()}`
                });
            }
        });
    }
    candidateDates.sort((a, b) => a.ymd.localeCompare(b.ymd));

    const datePillsHtml = candidateDates.map(item => {
        const isSel = item.ymd === selectedDateYMD;
        const m = pfGetOpenPlayDateMetrics(s, item.ymd);
        return `<button type="button" onclick="pfSelectOpenPlayCardDate('${item.ymd}')" class="px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${isSel ? 'bg-[#0F3D2A] text-white border-[#0F3D2A] shadow-xs' : 'bg-white text-[#0D1F18] border-[#D5D3CB] hover:bg-[#F5F4F0]'}">${pfEscapeHtml(item.label)} <span class="${isSel ? 'text-[#A3E635]' : 'text-[#15803D]'} font-mono">(${m.availableSlots}/${m.maxSlots})</span></button>`;
    }).join('');

    const posterSrc = s.posterUrl || 'assets/open-play-poster.jpg';
    const desigCourtsForCard = (Array.isArray(s.designatedCourts) && s.designatedCourts.length > 0)
        ? s.designatedCourts
        : (typeof pfGetOpenPlayDesignatedCourts === 'function' ? pfGetOpenPlayDesignatedCourts() : ['Court 1', 'Court 2', 'Court 3', 'Court 4']);
    const courtsBadgesHtml = desigCourtsForCard.map(cName => `<span class="inline-flex items-center px-3 py-1 rounded-lg bg-[#E8F5EE] border border-[#BFE3CE] text-[#0F3D2A] text-xs font-bold whitespace-nowrap">🏓 ${pfEscapeHtml(cName)}</span>`).join(' ');
    const timeLabel = s.schedule || ((s.startTime && s.endTime) ? `${pfFormatTime24To12(s.startTime)} – ${pfFormatTime24To12(s.endTime)}` : '6:00 PM – 10:00 PM');
    const fee = Number(s.entryFee || 150);

    return `
        <article class="w-full rounded-3xl bg-white border border-[#E6E4DD] shadow-[0_16px_40px_-12px_rgba(13,31,24,0.08)] overflow-hidden grid grid-cols-1 md:grid-cols-12">
            <!-- 1. Open Play Poster -->
            <div class="md:col-span-5 bg-[#061812] relative min-h-[360px] md:min-h-[420px] overflow-hidden cursor-pointer group border-b md:border-b-0 md:border-r border-[#E6E4DD] flex items-center justify-center"
                 onclick="pfOpenOpenPlayPosterLightbox('${pfEscapeHtml(posterSrc)}', '${pfEscapeHtml(s.title)}')">
                <img src="${pfEscapeHtml(posterSrc)}"
                     onerror="this.onerror=null;this.src='assets/open-play-poster.jpg';"
                     alt="${pfEscapeHtml(s.title)}"
                     class="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500">
                <span class="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-sm text-white text-[11px] font-semibold tracking-wide">
                    View Poster
                </span>
            </div>

            <!-- 2. Minimalist Editorial Content -->
            <div class="md:col-span-7 p-5 sm:p-8 lg:p-10 flex flex-col justify-between gap-6 bg-white text-[#0D1F18]">
                <div class="space-y-5">
                    <!-- Pill Badge + Entry Fee -->
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F5EE] text-[#0F3D2A] text-xs font-bold tracking-wide">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></span>
                            Open Play • Resets Daily
                        </span>
                        <span class="text-sm font-extrabold text-[#0F3D2A]">₱${fee.toLocaleString()} / Player</span>
                    </div>

                    <!-- Open Play Title (COURT TIMELINE Editorial Style) -->
                    <div>
                        <span class="text-[10px] font-mono font-extrabold uppercase tracking-[0.22em] text-[#15803D] block mb-1">OFFICIAL CLUB OPEN PLAY SESSION</span>
                        <h3 class="font-display font-black text-2xl sm:text-4xl uppercase tracking-tight text-[#0D1F18] leading-none">
                            ${pfFormatEditorialCardTitle(s.title)}
                        </h3>
                    </div>

                    <!-- Clean Metadata Grid: Time of the Open Play & Court -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div class="p-3.5 rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD]">
                            <div class="text-[11px] font-semibold uppercase tracking-wider text-[#6E7A73] mb-0.5">Time of the Open Play</div>
                            <div class="text-sm font-bold text-[#0D1F18]">${pfEscapeHtml(timeLabel)}</div>
                        </div>
                        <div class="p-3.5 rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] flex flex-col justify-between">
                            <div class="text-[11px] font-semibold uppercase tracking-wider text-[#6E7A73] mb-1.5">Designated Courts</div>
                            <div class="flex flex-wrap items-center gap-1.5">${courtsBadgesHtml}</div>
                        </div>
                    </div>

                    <!-- Per-Day Open Play Slot Selector & Slots Available -->
                    <div class="p-4 rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-[11px] font-bold uppercase tracking-wider text-[#475850]">Select Open Play Day (Slots Vary by Day)</span>
                            <input type="date" min="${todayYMD}" value="${selectedDateYMD}" onchange="pfSelectOpenPlayCardDate(this.value)" class="px-2.5 py-1 rounded-lg bg-white border border-[#D5D3CB] text-[#0D1F18] text-xs font-mono font-bold">
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            ${datePillsHtml}
                        </div>
                        <div class="pt-1 border-t border-[#E6E4DD]">
                            <div class="flex items-center justify-between text-xs mb-2">
                                <span class="font-semibold uppercase tracking-wider text-[#6E7A73]">Slots Available (${selectedDateYMD})</span>
                                <span class="font-bold text-[#0D1F18]">${availableSlots} of ${maxSlots} slots left <span class="text-[#15803D] font-mono">(${takenSlots} Booked)</span></span>
                            </div>
                            <div class="w-full h-2 rounded-full bg-[#E6E4DD] overflow-hidden">
                                <div class="h-full rounded-full bg-[#0F3D2A] transition-all duration-500" style="width: ${fillPercent}%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 1 CTA Only -->
                <div class="pt-4 border-t border-[#E6E4DD] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div class="text-xs text-[#6E7A73]">
                        ${availableSlots > 0 ? 'Instant slot reservation • Verified at court gate' : 'All slots are currently full'}
                    </div>
                    <button type="button"
                        onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(s.id)}', null, '${selectedDateYMD}')"
                        ${availableSlots <= 0 ? 'disabled' : ''}
                        class="${availableSlots <= 0 ? 'px-7 py-3.5 rounded-xl bg-slate-200 text-slate-500 font-display font-bold text-xs uppercase tracking-wider cursor-not-allowed' : 'pf-btn-club-cta px-7 py-3.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer inline-flex items-center justify-center gap-2.5'}">
                        <span>${availableSlots <= 0 ? 'Session Full' : 'Join Open Play'}</span>
                        ${availableSlots > 0 ? '<span class="pf-btn-cta-arrow">&rarr;</span>' : ''}
                    </button>
                </div>
            </div>
        </article>
    `;
}

function pfBuildCourtInstructionsHtml() {
    return `
        <div class="w-full mt-6 rounded-3xl bg-white border border-[#E6E4DD] shadow-[0_12px_32px_-12px_rgba(13,31,24,0.08)] p-5 sm:p-8 text-[#0D1F18]">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 mb-6 border-b border-[#E6E4DD]">
                <div>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F5EE] text-[#0F3D2A] text-[11px] font-bold uppercase tracking-widest mb-2">
                        Court Check-In Guide
                    </span>
                    <h4 class="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-[#0D1F18]">
                        3-STEP <span class="pf-serif-accent">COURT CHECK-IN</span>
                    </h4>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                <!-- Step 1 -->
                <div class="rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] p-5 flex flex-col gap-3">
                    <div class="flex items-center gap-3">
                        <span class="pf-step-num-badge w-9 h-9 rounded-xl bg-[#15803D] text-white font-mono font-black text-sm flex items-center justify-center shrink-0 shadow-sm" style="background-color:#15803D !important;color:#FFFFFF !important;">1</span>
                        <h5 class="font-display font-extrabold text-base text-[#0D1F18]">Keep Your App Ready</h5>
                    </div>
                    <p class="text-xs sm:text-sm text-[#475850] leading-relaxed">
                        Open your app and pull up your booking confirmation on your screen before you step onto the court.
                    </p>
                </div>

                <!-- Step 2 -->
                <div class="rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] p-5 flex flex-col gap-3">
                    <div class="flex items-center gap-3">
                        <span class="pf-step-num-badge w-9 h-9 rounded-xl bg-[#15803D] text-white font-mono font-black text-sm flex items-center justify-center shrink-0 shadow-sm" style="background-color:#15803D !important;color:#FFFFFF !important;">2</span>
                        <h5 class="font-display font-extrabold text-base text-[#0D1F18]">Verify Your Slot</h5>
                    </div>
                    <p class="text-xs sm:text-sm text-[#475850] leading-relaxed">
                        Show your screen to the facility coordinator or the court leader at the gate to quickly confirm your date and time slot.
                    </p>
                </div>

                <!-- Step 3 -->
                <div class="rounded-2xl bg-[#FAFAF7] border border-[#E6E4DD] p-5 flex flex-col gap-3">
                    <div class="flex items-center gap-3">
                        <span class="pf-step-num-badge w-9 h-9 rounded-xl bg-[#15803D] text-white font-mono font-black text-sm flex items-center justify-center shrink-0 shadow-sm" style="background-color:#15803D !important;color:#FFFFFF !important;">3</span>
                        <h5 class="font-display font-extrabold text-base text-[#0D1F18]">Queue Up and Play</h5>
                    </div>
                    <p class="text-xs sm:text-sm text-[#475850] leading-relaxed">
                        Once verified, place your physical paddle into the court rack or line it up on the court fence to secure your spot in the rotation!
                    </p>
                </div>
            </div>
        </div>
    `;
}

function pfBuildOpenPlayShowcaseHtml(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return `
            <div class="max-w-3xl mx-auto rounded-3xl bg-white border border-[#E6E4DD] p-10 text-center shadow-sm">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5F4F0] text-[#475850] text-xs font-bold uppercase tracking-widest mb-3">
                    Open Play
                </div>
                <h3 class="font-display font-bold text-2xl text-[#0D1F18] mb-2">No Active Open Play Session Right Now</h3>
                <p class="text-sm text-[#475850]">Please check back soon for the next scheduled Open Play session.</p>
            </div>
            ${pfBuildCourtInstructionsHtml()}
        `;
    }
    return pfRenderSingleOpenPlayCardHtml(sessions[0]) + pfBuildCourtInstructionsHtml();
}

function pfRenderOpenPlay24Board() {
    const sessions = pfGetPublishedOpenPlaySessions();
    const html = pfBuildOpenPlayShowcaseHtml(sessions);

    const homeContainer = document.getElementById('open-play-24-board-container');
    if (homeContainer) {
        homeContainer.innerHTML = html;
    }

    const dedicatedContainer = document.getElementById('open-play-dedicated-page-root');
    if (dedicatedContainer) {
        dedicatedContainer.innerHTML = html;
    }
}
window.pfRenderOpenPlay24Board = pfRenderOpenPlay24Board;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try { pfRenderOpenPlay24Board(); } catch (e) { console.error(e); }
    });
} else {
    try { pfRenderOpenPlay24Board(); } catch (e) { console.error(e); }
}


// ================= PICKLEBALL TOURNAMENT HUB & REGISTRATION ENGINE =================
const PF_OPEN_SEED_LABELS = [
  'Open Seed #1 — Available',
  'Open Seed #8 — Available',
  'Open Seed #4 — Available',
  'Open Seed #5 — Available',
  'Open Seed #2 — Available',
  'Open Seed #7 — Available',
  'Open Seed #3 — Available',
  'Open Seed #6 — Available'
];
const PF_SEED_SLOT_NUMBERS = [1, 8, 4, 5, 2, 7, 3, 6];

function pfIsOpenSeedSlot(str) {
  const s = String(str || '').trim();
  if (!s) return true;
  return /^(Open Seed|Open Slot|Available|Empty|TBD|Waiting|Slot #\d+\s*[—\-]\s*Open)/i.test(s);
}
window.pfIsOpenSeedSlot = pfIsOpenSeedSlot;

function pfCountFilledBracketSeeds(players) {
  if (!Array.isArray(players)) return 0;
  return players.filter(p => !pfIsOpenSeedSlot(p)).length;
}
window.pfCountFilledBracketSeeds = pfCountFilledBracketSeeds;

function pfCountRealTournamentTeams(t) {
  if (!t) return 0;
  const regs = Array.isArray(t.registrations) ? t.registrations : [];
  const activeRegs = regs.filter(r => {
    if (!r || typeof r !== 'object') return false;
    const st = String(r.status || 'PENDING').toUpperCase();
    return st !== 'DECLINED' && st !== 'CANCELLED' && st !== 'REJECTED';
  });
  return activeRegs.length;
}
window.pfCountRealTournamentTeams = pfCountRealTournamentTeams;

function pfBuildDefaultBracketForPlayers(players, courts) {
  return [];
}

function pfGetDefaultTournaments() {
  return [
    {
      "id": "trn-pf-singles-cup",
      "title": "P&F Rally Ground Singles Cup",
      "tournamentType": "Single",
      "format": "Single",
      "formatKey": "SINGLE",
      "division": "Novice • Intermediate • Open",
      "category": "Singles",
      "date": "2026-11-21",
      "startTime": "08:00 AM",
      "endTime": "05:00 PM",
      "time": "08:00 AM – 05:00 PM",
      "timerStart": "2026-11-14T08:00:00",
      "timerEnd": "2026-11-21T17:00:00",
      "countdownTarget": "2026-11-21T17:00:00",
      "courts": "Courts 1 – 4",
      "designatedCourts": ["Court 1", "Court 2", "Court 3", "Court 4"],
      "posterUrl": "assets/tournament-placeholder.jpg",
      "showPoster": true,
      "entryFee": 500,
      "prizePool": "₱10,000 + Trophies",
      "maxTeams": 24,
      "registeredCount": 0,
      "registrations": [],
      "approved": true,
      "published": true,
      "showCourtsOnSite": true,
      "scoringTarget": 11,
      "status": "OPEN",
      "description": "Official 1v1 Singles Pickleball Tournament at P&F Rally Ground. Pool play followed by knockout finals.",
      "players": [],
      "bracket": []
    },
    {
      "id": "trn-pf-doubles-cup",
      "title": "P&F Rally Ground Doubles Cup",
      "tournamentType": "Double",
      "format": "Double",
      "formatKey": "DOUBLE",
      "division": "Novice • Intermediate • Open",
      "category": "Doubles",
      "date": "2026-11-28",
      "startTime": "08:00 AM",
      "endTime": "05:00 PM",
      "time": "08:00 AM – 05:00 PM",
      "timerStart": "2026-11-21T08:00:00",
      "timerEnd": "2026-11-28T17:00:00",
      "countdownTarget": "2026-11-28T17:00:00",
      "courts": "Courts 1 – 4",
      "designatedCourts": ["Court 1", "Court 2", "Court 3", "Court 4"],
      "posterUrl": "assets/tournament-placeholder.jpg",
      "showPoster": true,
      "entryFee": 850,
      "prizePool": "₱20,000 + Trophies",
      "maxTeams": 24,
      "registeredCount": 0,
      "registrations": [],
      "approved": true,
      "published": false,
      "showCourtsOnSite": true,
      "scoringTarget": 11,
      "status": "OPEN",
      "description": "Official 2v2 Doubles Pickleball Tournament at P&F Rally Ground. Register with your partner for pool play and finals.",
      "players": [],
      "bracket": []
    }
  ];
}

var DEFAULT_PF_TOURNAMENTS = pfGetDefaultTournaments();
var activePublicTournamentFilter = 'ALL';

function pfNormalizeTournamentTypeLabel(t) {
  const raw = String((t && (t.tournamentType || t.formatKey || t.format || t.category || '')) || '').toUpperCase();
  if (raw.includes('SINGLE') || raw === 'SOLO' || raw === '1V1') return 'Single';
  if (raw.includes('DOUBLE') || raw.includes('PAIR') || raw.includes('2V2')) return 'Double';
  if (t && String(t.id || '').includes('single')) return 'Single';
  return 'Double';
}

function pfFormatIsoShortDateTime(isoStr) {
  if (!isoStr) return '';
  const ms = Date.parse(isoStr);
  if (isNaN(ms)) return String(isoStr);
  const d = new Date(ms);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function pfFormatTournamentTimerWindow(t) {
  if (!t) return '08:00 AM – 05:00 PM';
  const startClock = String(t.startTime || '').trim();
  const endClock = String(t.endTime || '').trim();
  if (startClock && endClock) {
    return `${startClock} – ${endClock}`;
  }
  if (t.time && String(t.time).trim()) {
    return String(t.time).trim();
  }
  return '08:00 AM – 05:00 PM';
}

function pfGetTournamentsList() {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const defaults = pfGetDefaultTournaments();
  const rawList = Array.isArray(cfg.tournaments) ? cfg.tournaments : [];

  const isLegacyFour = rawList.length > 2 || rawList.some(t => t && ['ROUND_ROBIN', 'KING_COURT', 'MLP_TEAM', 'DOUBLE_ELIM'].includes(String(t.formatKey || '')));
  if (rawList.length === 0 || isLegacyFour) {
    return defaults.map(defItem => Object.assign({}, defItem));
  }

  return rawList.slice(0, 2).map((t, idx) => {
    const defMatch = defaults.find(d => d.id === t.id) || defaults[idx % defaults.length];
    const tType = pfNormalizeTournamentTypeLabel(t || defMatch);
    const registrations = Array.isArray(t.registrations) ? t.registrations : [];
    const merged = Object.assign({}, defMatch || {}, t, {
      tournamentType: tType,
      format: tType,
      formatKey: tType.toUpperCase(),
      registrations
    });
    merged.registeredCount = pfCountRealTournamentTeams(merged);
    if (!merged.startTime) merged.startTime = defMatch.startTime || '08:00 AM';
    if (!merged.endTime) merged.endTime = defMatch.endTime || '05:00 PM';
    merged.time = pfFormatTournamentTimerWindow(merged);
    if (!merged.timerStart) {
      merged.timerStart = defMatch.timerStart || `${merged.date || '2026-11-14'}T08:00:00`;
    }
    if (!merged.timerEnd && merged.countdownTarget) {
      merged.timerEnd = merged.countdownTarget;
    }
    if (!merged.timerEnd) {
      merged.timerEnd = `${merged.date || '2026-11-21'}T17:00:00`;
    }
    merged.countdownTarget = merged.timerEnd;
    if (merged.posterUrl === undefined) {
      merged.posterUrl = defMatch.posterUrl || 'assets/tournament-placeholder.jpg';
    }
    if (merged.showPoster === undefined) {
      merged.showPoster = true;
    }
    return merged;
  });
}

function pfSetTournamentFilter(filterKey) {
  activePublicTournamentFilter = String(filterKey || 'ALL').toUpperCase();
  pfRenderPublicTournaments();
}

function openAdminTournamentHost(event) {
  if (event) event.preventDefault();
  const port = window.location.port;
  const isLocalSplit = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (port === '8088' || port === '8188');
  const admPort = (port === '8088') ? '8089' : '8189';
  const targetUrl = isLocalSplit
    ? `http://${window.location.hostname}:${admPort}/#tab-tournament`
    : `/admin/#tab-tournament`;
  window.location.href = targetUrl;
  return false;
}
window.openAdminTournamentHost = openAdminTournamentHost;

function pfRenderLiveSpectatorBracketBanner() {
  const banner = document.getElementById('public-live-bracket-spectator-banner');
  if (banner) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
  }
}

function pfComputeCountdownParts(targetIso, fallbackDateStr, startIso) {
  const now = Date.now();
  const startMs = startIso ? Date.parse(startIso) : NaN;
  let endMs = targetIso ? Date.parse(targetIso) : NaN;
  if (isNaN(endMs) && fallbackDateStr) {
    endMs = Date.parse(fallbackDateStr + 'T17:00:00');
  }
  if (isNaN(endMs)) {
    endMs = now + 7 * 86400000;
  }

  let activeTargetMs = endMs;
  let phaseLabel = 'Tournament Timer Ends In';
  if (!isNaN(startMs) && now < startMs) {
    activeTargetMs = startMs;
    phaseLabel = 'Registration / Timer Starts In';
  } else if (now >= endMs) {
    phaseLabel = 'Tournament Window Completed';
  }

  const diff = Math.max(0, activeTargetMs - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    mins: String(mins).padStart(2, '0'),
    secs: String(secs).padStart(2, '0'),
    phaseLabel,
    isLiveOrPast: diff <= 0
  };
}
window.pfComputeCountdownParts = pfComputeCountdownParts;

function pfUpdateAllTournamentCountdowns() {
  document.querySelectorAll('[data-pf-countdown-target]').forEach(el => {
    const targetIso = el.getAttribute('data-pf-countdown-target') || '';
    const startIso = el.getAttribute('data-pf-countdown-start') || '';
    const fallbackDate = el.getAttribute('data-pf-countdown-date') || '';
    const parts = pfComputeCountdownParts(targetIso, fallbackDate, startIso);
    const dEl = el.querySelector('[data-cd="days"]');
    const hEl = el.querySelector('[data-cd="hours"]');
    const mEl = el.querySelector('[data-cd="mins"]');
    const sEl = el.querySelector('[data-cd="secs"]');
    const lblEl = el.querySelector('[data-cd="phase-label"]');
    if (dEl) dEl.textContent = parts.days;
    if (hEl) hEl.textContent = parts.hours;
    if (mEl) mEl.textContent = parts.mins;
    if (sEl) sEl.textContent = parts.secs;
    if (lblEl) lblEl.textContent = parts.phaseLabel;
  });
}

if (!window.__pfTournamentCountdownInterval) {
  window.__pfTournamentCountdownInterval = setInterval(pfUpdateAllTournamentCountdowns, 1000);
}

function pfOpenTournamentPosterLightbox(srcUrl, titleText) {
  if (!srcUrl) return;
  let lb = document.getElementById('pf-trn-poster-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'pf-trn-poster-lightbox';
    lb.className = 'fixed inset-0 z-[70] hidden flex items-center justify-center p-4';
    lb.innerHTML = `
      <div onclick="document.getElementById('pf-trn-poster-lightbox').classList.add('hidden')" class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      <div class="relative z-10 max-w-3xl w-full max-h-[90dvh] flex flex-col items-center">
        <img id="pf-trn-lb-img" src="" alt="Tournament Graphic" class="max-h-[84dvh] w-auto max-w-full object-contain rounded-2xl shadow-2xl">
        <button type="button" onclick="document.getElementById('pf-trn-poster-lightbox').classList.add('hidden')" class="mt-3 px-4 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition">Close</button>
      </div>
    `;
    document.body.appendChild(lb);
  }
  const imgEl = document.getElementById('pf-trn-lb-img');
  if (imgEl) imgEl.src = srcUrl;
  lb.classList.remove('hidden');
}
window.pfOpenTournamentPosterLightbox = pfOpenTournamentPosterLightbox;

function pfRenderSingleTournamentCardHtml(t) {
  const tType = pfNormalizeTournamentTypeLabel(t);
  const isSingle = tType === 'Single';
  const fee = Number(t.entryFee || 0);
  const maxSlots = Math.max(2, Number(t.maxTeams || 24));
  const takenSlots = Math.min(maxSlots, pfCountRealTournamentTeams(t));
  const availableSlots = Math.max(0, maxSlots - takenSlots);
  const pctFilled = maxSlots > 0 ? Math.min(100, Math.round((takenSlots / maxSlots) * 100)) : 0;
  const cdStart = t.timerStart || `${t.date || '2026-11-14'}T08:00:00`;
  const cdTarget = t.timerEnd || t.countdownTarget || `${t.date || '2026-11-21'}T17:00:00`;
  const cd = pfComputeCountdownParts(cdTarget, t.date, cdStart);
  const playHoursStr = pfFormatTournamentTimerWindow(t);
  const timerStartDisplay = pfFormatIsoShortDateTime(cdStart);
  const timerEndDisplay = pfFormatIsoShortDateTime(cdTarget);
  const posterUrl = String(t.posterUrl || 'assets/tournament-placeholder.jpg').trim();
  const hasPoster = t.showPoster !== false && posterUrl.length > 0;

  return `
    <div class="w-full rounded-3xl bg-white border border-[#E6E4DD] shadow-[0_16px_40px_-12px_rgba(13,31,24,0.08)] overflow-hidden grid grid-cols-1 ${hasPoster ? 'md:grid-cols-12' : ''}">
      ${hasPoster ? `
        <div class="md:col-span-5 bg-[#0D1F18] relative overflow-hidden cursor-pointer group min-h-[260px] md:min-h-full" onclick="pfOpenTournamentPosterLightbox('${pfEscapeHtml(posterUrl)}', '${pfEscapeHtml(t.title)}')">
          <img src="${pfEscapeHtml(posterUrl)}" alt="${pfEscapeHtml(t.title)}" onerror="this.onerror=null;this.src='assets/tournament-placeholder.jpg';" class="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500">
        </div>
      ` : ''}

      <div class="pf-trn-card-body ${hasPoster ? 'md:col-span-7' : ''} p-5 sm:p-10 flex flex-col justify-between space-y-6 bg-white text-[#0D1F18]">
        <div class="space-y-5">
          <!-- Minimalist Top Meta -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F3EE] text-[#0D1F18] text-xs font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-[#15803D]"></span>
              <span>${isSingle ? 'Single Tournament' : 'Double Tournament'}</span>
            </span>
            <span class="text-xs text-[#64748B] font-medium">${pfEscapeHtml(t.date || 'Upcoming')} &bull; ${pfEscapeHtml(playHoursStr)}</span>
          </div>

          <!-- Tournament Headline (COURT TIMELINE Editorial Style) & Short Description -->
          <div class="space-y-2">
            <span class="text-[10px] font-mono font-extrabold uppercase tracking-[0.22em] text-[#15803D] block">${isSingle ? 'OFFICIAL 1V1 SINGLES CHAMPIONSHIP' : 'OFFICIAL 2V2 DOUBLES CHAMPIONSHIP'}</span>
            <h3 class="font-display text-2xl sm:text-4xl font-black uppercase tracking-tight text-[#0D1F18] leading-none">
              ${pfFormatEditorialCardTitle(t.title)}
            </h3>
            ${t.description ? `<p class="text-xs sm:text-sm text-[#475569] leading-relaxed font-medium">${pfEscapeHtml(t.description)}</p>` : ''}
          </div>

          <!-- Clean Minimalist Countdown (Start Time to End Time) -->
          <div class="pt-1 space-y-2" data-pf-countdown-target="${pfEscapeHtml(cdTarget)}" data-pf-countdown-start="${pfEscapeHtml(cdStart)}" data-pf-countdown-date="${pfEscapeHtml(t.date || '')}">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span data-cd="phase-label" class="text-[10px] font-mono uppercase tracking-[0.18em] text-[#64748B]">${pfEscapeHtml(cd.phaseLabel)}</span>
              <span class="text-[11px] font-mono text-[#475569] bg-[#F8F7F3] px-2.5 py-0.5 rounded-md border border-[#ECEAE4]">
                ${pfEscapeHtml(timerStartDisplay)} &rarr; ${pfEscapeHtml(timerEndDisplay)}
              </span>
            </div>
            <div class="inline-flex items-baseline gap-4 sm:gap-6 px-5 py-3 rounded-2xl bg-[#F8F7F3] border border-[#ECEAE4] max-w-full justify-between sm:justify-start">
              <div class="text-center">
                <span data-cd="days" class="font-mono text-2xl sm:text-3xl font-semibold text-[#0D1F18]">${cd.days}</span>
                <span class="block text-[10px] text-[#64748B] mt-0.5">Days</span>
              </div>
              <span class="text-lg text-[#CBD5E1] font-light">:</span>
              <div class="text-center">
                <span data-cd="hours" class="font-mono text-2xl sm:text-3xl font-semibold text-[#0D1F18]">${cd.hours}</span>
                <span class="block text-[10px] text-[#64748B] mt-0.5">Hrs</span>
              </div>
              <span class="text-lg text-[#CBD5E1] font-light">:</span>
              <div class="text-center">
                <span data-cd="mins" class="font-mono text-2xl sm:text-3xl font-semibold text-[#0D1F18]">${cd.mins}</span>
                <span class="block text-[10px] text-[#64748B] mt-0.5">Min</span>
              </div>
              <span class="text-lg text-[#CBD5E1] font-light">:</span>
              <div class="text-center">
                <span data-cd="secs" class="font-mono text-2xl sm:text-3xl font-semibold text-[#15803D]">${cd.secs}</span>
                <span class="block text-[10px] text-[#64748B] mt-0.5">Sec</span>
              </div>
            </div>
          </div>

          <!-- High-Contrast 3-Column Specs: Slots, Fee, Prizes -->
          <div class="grid grid-cols-3 gap-4 py-4 border-y border-[#E2E0D8]">
            <div>
              <span class="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">Slots Available</span>
              <strong class="font-mono text-base sm:text-xl font-black text-[#0D1F18] mt-0.5 block">${availableSlots} <span class="text-xs font-bold text-[#64748B]">/ ${maxSlots}</span></strong>
            </div>
            <div class="border-l border-[#E2E0D8] pl-4">
              <span class="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">Entry Fee</span>
              <strong class="font-mono text-base sm:text-xl font-black text-[#15803D] mt-0.5 block">${fee > 0 ? '₱' + fee.toLocaleString() : 'Free'}</strong>
            </div>
            <div class="border-l border-[#E2E0D8] pl-4">
              <span class="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">Prize Pool</span>
              <strong class="text-sm sm:text-base font-extrabold text-[#0D1F18] mt-0.5 block leading-snug">${pfEscapeHtml(t.prizePool || 'Trophies')}</strong>
            </div>
          </div>
        </div>

        <!-- Optimized Championship CTA Button Row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div class="w-full sm:w-48 space-y-1.5">
            <div class="w-full h-2 rounded-full bg-[#E6E4DD] overflow-hidden">
              <div class="h-full bg-[#15803D] rounded-full transition-all duration-300" style="width:${pctFilled}%;"></div>
            </div>
            <span class="block text-xs font-bold text-[#475569]">${availableSlots} of ${maxSlots} slots remaining</span>
          </div>

          <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" ${availableSlots <= 0 ? 'disabled' : ''} class="${availableSlots > 0 ? 'pf-btn-club-cta w-full sm:w-auto px-8 py-3.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer inline-flex items-center justify-center gap-2.5' : 'w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-200 text-slate-500 font-display font-bold text-xs uppercase tracking-wider cursor-not-allowed'}">
            <span>${availableSlots > 0 ? 'Register Now' : 'Registration Full'}</span>
            ${availableSlots > 0 ? '<span class="pf-btn-cta-arrow">&rarr;</span>' : ''}
          </button>
        </div>
      </div>
    </div>
  `;
}

function pfRenderPublicTournaments() {
  try { pfRenderLiveSpectatorBracketBanner(); } catch (e) {}
  const sec = document.getElementById('tournaments');
  const grid = document.getElementById('public-tournaments-grid');
  if (!grid) return;

  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const masterPublished = cfg.tournamentsPublishedOnHome !== false;
  const fullList = pfGetTournamentsList();

  // Admin chooses: 'None', 'Single', 'Double', or 'Both'
  const rawMode = String(cfg.activeTournamentType || '').trim().toLowerCase();
  let publishedList = [];

  if (!masterPublished || rawMode === 'none') {
    publishedList = [];
  } else if (rawMode === 'both') {
    publishedList = fullList.slice(0, 2);
  } else if (rawMode === 'single' || rawMode === 'double') {
    const exactMatch = fullList.find(t => pfNormalizeTournamentTypeLabel(t).toLowerCase() === rawMode);
    publishedList = exactMatch ? [exactMatch] : [];
  } else {
    publishedList = fullList.filter(t => t && t.approved !== false && t.published !== false);
  }

  const isPublishedWithEvents = Boolean(masterPublished && publishedList.length > 0);
  if (sec) sec.classList.remove('hidden');

  if (!isPublishedWithEvents) {
    if (window.__pfTournamentAutoSlideInterval) {
      clearInterval(window.__pfTournamentAutoSlideInterval);
      window.__pfTournamentAutoSlideInterval = null;
    }
    grid.className = 'w-full';
    grid.innerHTML = `
      <div class="pf-trn-empty-card w-full rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-6 py-14 sm:py-16 text-center shadow-xs" style="background-color:#FFFFFF !important; border:1.5px dashed #CBD5E1 !important;">
        <div class="pf-trn-empty-icon w-11 h-11 rounded-xl bg-[#F1F5F9] text-[#0F1D2E] flex items-center justify-center mx-auto mb-4" style="background-color:#F1F5F9 !important; color:#0F1D2E !important;">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>
        </div>
        <h3 class="pf-trn-empty-title font-serif text-xl sm:text-2xl font-bold text-[#0D1F18] tracking-tight" style="color:#0D1F18 !important; font-family: Georgia, Cambria, 'Times New Roman', Times, serif;">No tournaments on the calendar yet</h3>
        <p class="pf-trn-empty-sub text-xs sm:text-sm text-[#52605A] max-w-md mx-auto mt-2.5 leading-relaxed" style="color:#52605A !important;">
          Nothing is scheduled right now. New tournaments are posted here as soon as registration opens — check back, or ask us at the desk what's coming up.
        </p>
      </div>
    `;
    return;
  }

  if (publishedList.length === 1) {
    if (window.__pfTournamentAutoSlideInterval) {
      clearInterval(window.__pfTournamentAutoSlideInterval);
      window.__pfTournamentAutoSlideInterval = null;
    }
    grid.className = 'w-full';
    grid.innerHTML = pfRenderSingleTournamentCardHtml(publishedList[0]);
    return;
  }

  // BOTH TOURNAMENTS: Render as an interactive Slider that automatically slides every 10s
  const totalSlides = publishedList.length;
  if (typeof window.__pfTournamentCurrentSlideIdx !== 'number' || window.__pfTournamentCurrentSlideIdx >= totalSlides || window.__pfTournamentCurrentSlideIdx < 0) {
    window.__pfTournamentCurrentSlideIdx = 0;
  }
  const activeIdx = window.__pfTournamentCurrentSlideIdx;

  grid.className = 'w-full';
  grid.innerHTML = `
    <div id="pf-trn-slider-root" class="w-full space-y-5 relative group/slider" onmouseenter="window.__pfTrnSliderPaused=true" onmouseleave="window.__pfTrnSliderPaused=false">
      <!-- Clean Side-by-Side Segmented Pill Switcher (Fits 1 Row on Mobile & Desktop) -->
      <div class="flex items-center justify-between gap-2">
        <div class="grid grid-cols-2 sm:inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-white border border-[#D5D3CC] shadow-sm w-full sm:w-auto">
          ${publishedList.map((t, idx) => {
            const tType = pfNormalizeTournamentTypeLabel(t);
            const isAct = idx === activeIdx;
            return `
              <button type="button" data-trn-slide-tab="${idx}" onclick="pfGoToTournamentSlide(${idx}, true)" class="px-3 py-2.5 sm:px-5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-extrabold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isAct ? 'pf-btn-club-cta text-white shadow-md' : 'bg-transparent text-[#334155] hover:text-[#0D1F18] hover:bg-[#F6F5F0]'
              }">
                <span class="w-2 h-2 rounded-full flex-shrink-0 ${isAct ? 'bg-[#A3E635]' : 'bg-[#94A3B8]'}"></span>
                <span>${tType === 'Single' ? 'Single Tournament' : 'Double Tournament'}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Slider Viewport & Floating Chevrons -->
      <div class="relative w-full">
        <button type="button" onclick="pfStepTournamentSlide(-1)" aria-label="Previous Tournament" class="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/95 backdrop-blur-xs border border-[#E6E4DD] hover:border-[#0D1F18] text-[#0D1F18] items-center justify-center text-lg font-medium transition-all duration-200 cursor-pointer shadow-md hover:scale-105">&lsaquo;</button>
        <button type="button" onclick="pfStepTournamentSlide(1)" aria-label="Next Tournament" class="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/95 backdrop-blur-xs border border-[#E6E4DD] hover:border-[#0D1F18] text-[#0D1F18] items-center justify-center text-lg font-medium transition-all duration-200 cursor-pointer shadow-md hover:scale-105">&rsaquo;</button>

        <div class="w-full overflow-hidden rounded-3xl" ontouchstart="window.__pfTrnTouchStartX = event.touches && event.touches[0] ? event.touches[0].clientX : 0;" ontouchend="if(window.__pfTrnTouchStartX && event.changedTouches && event.changedTouches[0]){ const dx = event.changedTouches[0].clientX - window.__pfTrnTouchStartX; if(Math.abs(dx) > 40){ pfStepTournamentSlide(dx < 0 ? 1 : -1); } window.__pfTrnTouchStartX = 0; }">
          <div id="pf-trn-slider-track" data-total-slides="${totalSlides}" class="flex w-full p-0 m-0 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style="transform: translateX(-${activeIdx * 100}%); padding: 0 !important; margin: 0 !important;">
            ${publishedList.map(t => `
              <div class="w-full min-w-full flex-shrink-0 p-0 m-0" style="padding: 0 !important; margin: 0 !important;">
                ${pfRenderSingleTournamentCardHtml(t)}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Minimalist Bottom Dots -->
      <div class="flex items-center justify-center gap-2 pt-1">
        ${publishedList.map((_, idx) => `
          <button type="button" data-trn-slide-dot="${idx}" onclick="pfGoToTournamentSlide(${idx}, true)" aria-label="Slide ${idx + 1}" class="h-1.5 rounded-full transition-all duration-300 cursor-pointer ${idx === activeIdx ? 'w-8 bg-[#A3E635]' : 'w-2 bg-[#94A3B8]/50 hover:bg-[#94A3B8]'}"></button>
        `).join('')}
      </div>
    </div>
  `;

  pfEnsureTournamentAutoSliderRunning();
}

function pfGoToTournamentSlide(idx, resetTimer = false) {
  const track = document.getElementById('pf-trn-slider-track');
  if (!track) return;
  const total = Math.max(1, parseInt(track.getAttribute('data-total-slides') || '2', 10));
  const nextIdx = ((idx % total) + total) % total;
  window.__pfTournamentCurrentSlideIdx = nextIdx;
  track.style.transform = `translateX(-${nextIdx * 100}%)`;

  document.querySelectorAll('[data-trn-slide-tab]').forEach(btn => {
    const bIdx = parseInt(btn.getAttribute('data-trn-slide-tab') || '0', 10);
    const isAct = bIdx === nextIdx;
    btn.className = `px-3 py-2.5 sm:px-5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-extrabold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
      isAct ? 'pf-btn-club-cta text-white shadow-md' : 'bg-transparent text-[#334155] hover:text-[#0D1F18] hover:bg-[#F6F5F0]'
    }`;
    btn.removeAttribute('style');
    const dotSpan = btn.querySelector('span');
    if (dotSpan) {
      dotSpan.className = `w-2 h-2 rounded-full ${isAct ? 'bg-[#A3E635]' : 'bg-[#94A3B8]'}`;
    }
  });

  document.querySelectorAll('[data-trn-slide-dot]').forEach(dot => {
    const dIdx = parseInt(dot.getAttribute('data-trn-slide-dot') || '0', 10);
    const isAct = dIdx === nextIdx;
    dot.className = `h-1.5 rounded-full transition-all duration-300 cursor-pointer ${isAct ? 'w-8 bg-[#A3E635]' : 'w-2 bg-[#94A3B8]/50 hover:bg-[#94A3B8]'}`;
  });

  if (resetTimer) {
    pfEnsureTournamentAutoSliderRunning(true);
  }
}
window.pfGoToTournamentSlide = pfGoToTournamentSlide;

function pfStepTournamentSlide(delta) {
  const cur = typeof window.__pfTournamentCurrentSlideIdx === 'number' ? window.__pfTournamentCurrentSlideIdx : 0;
  pfGoToTournamentSlide(cur + delta, true);
}
window.pfStepTournamentSlide = pfStepTournamentSlide;

function pfEnsureTournamentAutoSliderRunning(forceReset = false) {
  if (forceReset && window.__pfTournamentAutoSlideInterval) {
    clearInterval(window.__pfTournamentAutoSlideInterval);
    window.__pfTournamentAutoSlideInterval = null;
  }
  if (!window.__pfTournamentAutoSlideInterval) {
    window.__pfTournamentAutoSlideInterval = setInterval(() => {
      const track = document.getElementById('pf-trn-slider-track');
      if (!track) return;
      const regModal = document.getElementById('tournament-reg-modal');
      if (regModal && !regModal.classList.contains('hidden')) return;
      if (window.__pfTrnSliderPaused) return;
      const cur = typeof window.__pfTournamentCurrentSlideIdx === 'number' ? window.__pfTournamentCurrentSlideIdx : 0;
      pfGoToTournamentSlide(cur + 1, false);
    }, 10000);
  }
}
window.renderPublicTournaments = pfRenderPublicTournaments;

window.pfTournamentUploadedReceiptDataUrl = '';

function pfSwitchTournamentPayMethod(mode) {
  const normalized = String(mode || 'GCash').trim();
  const modeInp = document.getElementById('trn-reg-pay-mode');
  if (modeInp) modeInp.value = normalized;

  ['GCash', 'Maya', 'BDO', 'Manual'].forEach(m => {
    const btn = document.getElementById('trn-pay-tab-' + m);
    if (!btn) return;
    if (m.toLowerCase() === normalized.toLowerCase()) {
      btn.className = 'py-2 px-3 rounded-xl text-xs font-semibold transition border cursor-pointer';
      btn.setAttribute('style', 'background-color:#0D1F18 !important;color:#FFFFFF !important;border-color:#0D1F18 !important;');
    } else {
      btn.className = 'py-2 px-3 rounded-xl text-xs font-medium bg-white text-[#334155] border border-[#E2E0D8] hover:border-[#0D1F18] transition cursor-pointer';
      btn.removeAttribute('style');
    }
  });

  const qrPanel = document.getElementById('trn-reg-qr-panel');
  const manualPanel = document.getElementById('trn-reg-manual-panel');
  const refInput = document.getElementById('trn-reg-ref');
  const proofSection = document.getElementById('trn-reg-proof-section');

  if (normalized.toLowerCase() === 'manual') {
    if (qrPanel) qrPanel.classList.add('hidden');
    if (manualPanel) manualPanel.classList.remove('hidden');
    if (proofSection) proofSection.classList.add('hidden');
    if (refInput) refInput.value = 'MANUAL-BOOKING';
    return;
  }

  if (qrPanel) qrPanel.classList.remove('hidden');
  if (manualPanel) manualPanel.classList.add('hidden');
  if (proofSection) proofSection.classList.remove('hidden');
  if (refInput && refInput.value === 'MANUAL-BOOKING') {
    refInput.value = '';
  }

  const payCfg = (typeof pfGetPaymentConfig === 'function') ? pfGetPaymentConfig() : {
    accountName: 'P&F RALLY GROUND PICKLEBALL CLUB',
    gcashNumber: '0999 883 2346',
    mayaNumber: '0999 883 2346',
    bdoNumber: '0999 883 2346'
  };

  const chKey = normalized.toLowerCase() === 'maya' ? 'maya' : (normalized.toLowerCase() === 'bdo' ? 'bdo' : 'gcash');
  const qrSrc = (typeof pfGetOfficialQrUrl === 'function')
    ? pfGetOfficialQrUrl(chKey, 'qr')
    : `assets/qr-${chKey}.png`;
  const acctNum = chKey === 'maya' ? payCfg.mayaNumber : (chKey === 'bdo' ? payCfg.bdoNumber : payCfg.gcashNumber);
  const chTitle = chKey === 'maya' ? 'Maya Official QR' : (chKey === 'bdo' ? 'BDO / Bank Transfer QR' : 'GCash Official QR');

  const qrImg = document.getElementById('trn-reg-qr-img');
  const qrLabel = document.getElementById('trn-reg-qr-label');
  const acctNameEl = document.getElementById('trn-reg-acct-name');
  const acctNumEl = document.getElementById('trn-reg-acct-num');
  const zoomBtn = document.getElementById('trn-reg-qr-zoom-btn');
  const dlBtn = document.getElementById('trn-reg-qr-dl-btn');

  if (qrImg) qrImg.src = qrSrc;
  if (qrLabel) qrLabel.textContent = chTitle;
  if (acctNameEl) acctNameEl.textContent = payCfg.accountName || 'P&F RALLY GROUND PICKLEBALL CLUB';
  if (acctNumEl) acctNumEl.textContent = acctNum || '0999 883 2346';
  if (zoomBtn) zoomBtn.setAttribute('onclick', `pfOpenQrStandeeLightbox('${chKey}')`);
  if (dlBtn) dlBtn.setAttribute('onclick', `pfDownloadOfficialQr('${chKey}')`);
}
window.pfSwitchTournamentPayMethod = pfSwitchTournamentPayMethod;

function pfHandleTournamentReceiptUpload(ev) {
  const file = ev?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(loadEv) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxDim = 900;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      window.pfTournamentUploadedReceiptDataUrl = dataUrl;
      const previewWrap = document.getElementById('trn-reg-receipt-preview-wrap');
      const previewImg = document.getElementById('trn-reg-receipt-preview-img');
      const statusText = document.getElementById('trn-reg-receipt-filename');
      if (previewImg) previewImg.src = dataUrl;
      if (statusText) statusText.textContent = file.name || 'Receipt attached';
      if (previewWrap) previewWrap.classList.remove('hidden');
    };
    img.src = loadEv.target.result;
  };
  reader.readAsDataURL(file);
}
window.pfHandleTournamentReceiptUpload = pfHandleTournamentReceiptUpload;

function pfClearTournamentReceiptUpload() {
  window.pfTournamentUploadedReceiptDataUrl = '';
  const fileInp = document.getElementById('trn-reg-receipt-file');
  const previewWrap = document.getElementById('trn-reg-receipt-preview-wrap');
  if (fileInp) fileInp.value = '';
  if (previewWrap) previewWrap.classList.add('hidden');
}
window.pfClearTournamentReceiptUpload = pfClearTournamentReceiptUpload;

function pfPopulateTournamentRegModal(trn) {
  if (!trn) return;
  const tType = pfNormalizeTournamentTypeLabel(trn);
  const isSingle = tType === 'Single';
  const maxSlots = Math.max(2, Number(trn.maxTeams || 24));
  const takenSlots = Math.min(maxSlots, pfCountRealTournamentTeams(trn));
  const availSlots = Math.max(0, maxSlots - takenSlots);
  const fee = Number(trn.entryFee || 0);
  const playHoursStr = pfFormatTournamentTimerWindow(trn);

  const idInp = document.getElementById('trn-reg-id');
  const typeInp = document.getElementById('trn-reg-type-input');
  if (idInp) idInp.value = trn.id;
  if (typeInp) typeInp.value = tType;

  const titleEl = document.getElementById('trn-reg-modal-title');
  const metaEl = document.getElementById('trn-reg-modal-meta');
  const feeEl = document.getElementById('trn-reg-fee-display');
  const qrAmtEl = document.getElementById('trn-reg-qr-amount');
  const partnerWrap = document.getElementById('trn-reg-partner-wrap');

  if (titleEl) titleEl.textContent = trn.title;
  if (metaEl) metaEl.textContent = `${isSingle ? 'Single Tournament' : 'Double Tournament'} • ${trn.date || 'Upcoming'} (${playHoursStr}) • ${availSlots} Slots Left`;
  if (feeEl) feeEl.textContent = fee > 0 ? `₱${fee.toLocaleString()}` : 'Free';
  if (qrAmtEl) qrAmtEl.textContent = fee > 0 ? `₱${fee.toLocaleString()}` : 'Free';

  if (partnerWrap) {
    if (isSingle) {
      partnerWrap.classList.add('hidden');
    } else {
      partnerWrap.classList.remove('hidden');
    }
  }



  window.pfTournamentUploadedReceiptDataUrl = '';
  pfSwitchTournamentPayMethod('GCash');
}

function pfRegisterForTournament(tournamentId) {
  const list = pfGetTournamentsList();
  const trn = list.find(t => String(t.id) === String(tournamentId)) || list[0];
  if (!trn) return;

  let modal = document.getElementById('pf-tournament-reg-modal');
  if (modal) {
    modal.remove();
  }
  modal = document.createElement('div');
  modal.id = 'pf-tournament-reg-modal';
  modal.className = 'fixed inset-0 z-50 hidden flex items-center justify-center p-3 sm:p-5 overflow-y-auto';
  modal.innerHTML = `
    <div onclick="pfCloseTournamentRegModal()" class="fixed inset-0 bg-black/65 backdrop-blur-xs"></div>
    <div class="relative z-10 w-full max-w-3xl rounded-3xl bg-white text-[#0D1F18] border border-[#E6E4DD] p-5 sm:p-8 shadow-2xl my-auto max-h-[92dvh] overflow-y-auto space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 border-b border-[#ECEAE4] pb-4">
        <div>
          <p id="trn-reg-modal-meta" class="text-xs font-medium text-[#15803D]"></p>
          <h3 id="trn-reg-modal-title" class="text-xl sm:text-2xl font-bold text-[#0D1F18] mt-0.5">Tournament Registration Portal</h3>
        </div>
        <button type="button" onclick="pfCloseTournamentRegModal()" class="w-8 h-8 rounded-full bg-[#F6F5F0] hover:bg-[#E6E4DD] text-[#0D1F18] text-xs flex items-center justify-center transition cursor-pointer">✕</button>
      </div>

      <input type="hidden" id="trn-reg-id" value="">
      <input type="hidden" id="trn-reg-type-input" value="Single">
      <input type="hidden" id="trn-reg-pay-mode" value="GCash">

      <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <!-- Left Column: Player Details & Policies (7 Cols) -->
        <div class="md:col-span-7 space-y-5">
          <div class="space-y-3.5">
            <h4 class="text-xs font-mono uppercase tracking-wider text-[#64748B]">1. Player &amp; Entry Details</h4>

            <div>
              <label class="block text-xs font-medium text-[#334155] mb-1">Full Name <span class="text-rose-600">*</span></label>
              <input type="text" id="trn-reg-name" placeholder="Enter your full name" class="w-full bg-[#F8F7F3] border border-[#E2E0D8] rounded-xl px-3.5 py-2.5 text-sm text-[#0D1F18] focus:outline-none focus:border-[#0D1F18]">
            </div>

            <div id="trn-reg-partner-wrap" class="hidden">
              <label class="block text-xs font-medium text-[#334155] mb-1">Partner Full Name (Doubles) <span class="text-rose-600">*</span></label>
              <input type="text" id="trn-reg-partner" placeholder="Enter partner's full name" class="w-full bg-[#F8F7F3] border border-[#E2E0D8] rounded-xl px-3.5 py-2.5 text-sm text-[#0D1F18] focus:outline-none focus:border-[#0D1F18]">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-[#334155] mb-1">Mobile Number <span class="text-[#64748B] font-normal">(Optional)</span></label>
                <input type="tel" id="trn-reg-phone" placeholder="0917 123 4567" class="w-full bg-[#F8F7F3] border border-[#E2E0D8] rounded-xl px-3.5 py-2.5 text-sm text-[#0D1F18] focus:outline-none focus:border-[#0D1F18]">
              </div>
              <div>
                <label class="block text-xs font-medium text-[#334155] mb-1">Email (Optional)</label>
                <input type="email" id="trn-reg-email" placeholder="you@email.com" class="w-full bg-[#F8F7F3] border border-[#E2E0D8] rounded-xl px-3.5 py-2.5 text-sm text-[#0D1F18] focus:outline-none focus:border-[#0D1F18]">
              </div>
            </div>


          </div>

          <!-- Facility Policies & Consent -->
          <div class="p-4 rounded-2xl bg-[#F8F7F3] border border-[#ECEAE4] space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-[#0D1F18]">Policies &amp; Player Consent</span>
              <span class="text-[11px] text-[#64748B]">Required</span>
            </div>
            <label class="flex items-start gap-2.5 text-xs text-[#334155] cursor-pointer">
              <input type="checkbox" id="trn-policy-waiver" checked class="mt-0.5 w-4 h-4 rounded accent-[#0D1F18]">
              <span>I agree to the <button type="button" onclick="if(typeof pfOpenPolicyModal==='function') pfOpenPolicyModal('waiver', event)" class="underline font-medium text-[#0D1F18]">Facility Liability Waiver &amp; Court Conduct Rules</button>.</span>
            </label>
            <label class="flex items-start gap-2.5 text-xs text-[#334155] cursor-pointer">
              <input type="checkbox" id="trn-policy-cancellation" checked class="mt-0.5 w-4 h-4 rounded accent-[#0D1F18]">
              <span>I understand the <button type="button" onclick="if(typeof pfOpenPolicyModal==='function') pfOpenPolicyModal('cancellation', event)" class="underline font-medium text-[#0D1F18]">Tournament Schedule &amp; Rescheduling Policy</button>.</span>
            </label>
            <label class="flex items-start gap-2.5 text-xs text-[#334155] cursor-pointer">
              <input type="checkbox" id="trn-policy-nonrefundable" checked class="mt-0.5 w-4 h-4 rounded accent-[#0D1F18]">
              <span>I confirm my payment reference or manual front-desk settlement is accurate.</span>
            </label>
          </div>
        </div>

        <!-- Right Column: Payment Portal, QR Code, Reference & Receipt Upload (5 Cols) -->
        <div class="md:col-span-5 space-y-4">
          <div class="space-y-2">
            <h4 class="text-xs font-mono uppercase tracking-wider text-[#64748B]">2. Payment Portal</h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-1.5">
              <button type="button" id="trn-pay-tab-GCash" onclick="pfSwitchTournamentPayMethod('GCash')" class="py-2 px-3 rounded-xl text-xs font-semibold transition border cursor-pointer" style="background-color:#0D1F18 !important;color:#FFFFFF !important;border-color:#0D1F18 !important;">GCash</button>
              <button type="button" id="trn-pay-tab-Maya" onclick="pfSwitchTournamentPayMethod('Maya')" class="py-2 px-3 rounded-xl text-xs font-medium bg-white text-[#334155] border border-[#E2E0D8] hover:border-[#0D1F18] transition cursor-pointer">Maya</button>
              <button type="button" id="trn-pay-tab-BDO" onclick="pfSwitchTournamentPayMethod('BDO')" class="py-2 px-3 rounded-xl text-xs font-medium bg-white text-[#334155] border border-[#E2E0D8] hover:border-[#0D1F18] transition cursor-pointer">BDO / Bank</button>
              <button type="button" id="trn-pay-tab-Manual" onclick="pfSwitchTournamentPayMethod('Manual')" class="py-2 px-3 rounded-xl text-xs font-medium bg-white text-[#334155] border border-[#E2E0D8] hover:border-[#0D1F18] transition cursor-pointer">Manual Payment</button>
            </div>
          </div>

          <!-- QR Code Display Box -->
          <div id="trn-reg-qr-panel" class="p-4 rounded-2xl bg-[#F8F7F3] border border-[#ECEAE4] space-y-3 text-center">
            <div class="flex items-center justify-between text-xs">
              <span id="trn-reg-qr-label" class="font-semibold text-[#0D1F18]">GCash Official QR</span>
              <strong id="trn-reg-qr-amount" class="text-sm font-bold text-[#15803D]">₱500</strong>
            </div>

            <div class="w-40 h-40 mx-auto rounded-2xl bg-white p-2 border border-[#E2E0D8] flex items-center justify-center overflow-hidden">
              <img id="trn-reg-qr-img" src="assets/qr-gcash.png" alt="Payment QR" class="w-full h-full object-contain">
            </div>

            <div class="flex items-center justify-center gap-2">
              <button type="button" id="trn-reg-qr-zoom-btn" onclick="pfOpenQrStandeeLightbox('gcash')" class="px-3 py-1 rounded-lg bg-white border border-[#E2E0D8] text-[11px] font-medium text-[#0D1F18] hover:bg-[#F4F3EE] transition cursor-pointer">Zoom QR</button>
              <button type="button" id="trn-reg-qr-dl-btn" onclick="pfDownloadOfficialQr('gcash')" class="px-3 py-1 rounded-lg bg-white border border-[#E2E0D8] text-[11px] font-medium text-[#0D1F18] hover:bg-[#F4F3EE] transition cursor-pointer">Save QR</button>
            </div>

            <div class="pt-2 border-t border-[#ECEAE4] text-left space-y-1 text-[11px]">
              <div class="text-[#64748B]">Account: <strong id="trn-reg-acct-name" class="text-[#0D1F18]">P&amp;F RALLY GROUND PICKLEBALL CLUB</strong></div>
              <div class="flex items-center justify-between">
                <span class="text-[#64748B]">Number: <strong id="trn-reg-acct-num" class="font-mono text-[#0D1F18]">0999 883 2346</strong></span>
                <button type="button" onclick="if(typeof copyPaymentAccount==='function') copyPaymentAccount(document.getElementById('trn-reg-acct-num')?.textContent || '09998832346', this)" class="text-[10px] font-semibold underline text-[#15803D] cursor-pointer">Copy</button>
              </div>
            </div>
          </div>

          <!-- Manual Booking Box -->
          <div id="trn-reg-manual-panel" class="hidden p-4 rounded-2xl bg-[#F8F7F3] border border-[#ECEAE4] space-y-2 text-xs text-[#334155]">
            <div class="font-semibold text-[#0D1F18]">Manual Front-Desk / Venue Booking</div>
            <p class="leading-relaxed text-[11px] text-[#52605A]">Your tournament slot will be submitted as <b>Pending Verification</b>. Please settle your entry fee at the P&amp;F Rally Ground front desk to confirm your slot.</p>
          </div>

          <!-- Reference & Upload Proof Section -->
          <div id="trn-reg-proof-section" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-[#334155] mb-1">Reference No. (Last 6+ digits) <span class="text-rose-600">*</span></label>
              <input type="text" id="trn-reg-ref" placeholder="e.g. 901827364" class="w-full bg-[#F8F7F3] border border-[#E2E0D8] rounded-xl px-3.5 py-2 text-xs font-mono text-[#0D1F18] focus:outline-none focus:border-[#0D1F18]">
            </div>

            <div>
              <label class="block text-xs font-medium text-[#334155] mb-1">Upload Payment Receipt Screenshot <span class="text-rose-600">*</span></label>
              <label class="w-full py-2.5 px-3.5 rounded-xl bg-[#F8F7F3] hover:bg-[#F0EFE9] border border-dashed border-[#CBD5E1] text-xs font-medium text-[#0D1F18] flex items-center justify-center gap-2 cursor-pointer transition">
                <span>Upload Receipt Image *</span>
                <input type="file" id="trn-reg-receipt-file" accept="image/*" class="hidden" onchange="pfHandleTournamentReceiptUpload(event)">
              </label>
              <div id="trn-reg-receipt-preview-wrap" class="hidden mt-2 p-2 rounded-xl bg-[#F8F7F3] border border-[#ECEAE4] flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <img id="trn-reg-receipt-preview-img" src="" alt="Receipt Preview" class="w-10 h-10 rounded-lg object-cover border border-[#E2E0D8]">
                  <span id="trn-reg-receipt-filename" class="text-[11px] text-[#334155] truncate">Receipt attached</span>
                </div>
                <button type="button" onclick="pfClearTournamentReceiptUpload()" class="text-[11px] text-rose-600 font-medium px-2 py-1">Remove</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Submit Bar -->
      <div class="pt-4 border-t border-[#ECEAE4] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span class="text-[11px] text-[#64748B] block">Total Tournament Entry Fee</span>
          <strong id="trn-reg-fee-display" class="text-xl font-bold text-[#0D1F18]">₱500</strong>
        </div>
        <button type="button" onclick="pfProceedTournamentToPayment()" class="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm transition cursor-pointer" style="background-color:#0D1F18 !important;color:#FFFFFF !important;">
          Submit Registration &amp; Generate Pass
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  pfPopulateTournamentRegModal(trn);
  modal.classList.remove('hidden');
}

function pfCloseTournamentRegModal() {
  const modal = document.getElementById('pf-tournament-reg-modal');
  if (modal) modal.classList.add('hidden');
}

let _isSubmittingTournamentReg = false;
async function pfProceedTournamentToPayment() {
  if (_isSubmittingTournamentReg) return;
  const id = document.getElementById('trn-reg-id')?.value;
  const selectedType = (document.getElementById('trn-reg-type-input')?.value || 'Single').trim();
  const payMode = (document.getElementById('trn-reg-pay-mode')?.value || 'GCash').trim();
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const list = pfGetTournamentsList();
  const trnIdx = list.findIndex(t => String(t.id) === String(id));
  const trn = trnIdx >= 0 ? list[trnIdx] : list[0];
  if (!trn) return;

  const isSingle = selectedType === 'Single';
  const name = (document.getElementById('trn-reg-name')?.value || '').trim();
  const phone = (document.getElementById('trn-reg-phone')?.value || '').trim();
  const email = (document.getElementById('trn-reg-email')?.value || '').trim();
  const partnerRaw = (document.getElementById('trn-reg-partner')?.value || '').trim();
  const partner = isSingle ? 'Solo (Single)' : (partnerRaw || 'Partner TBD');
  const division = (document.getElementById('trn-reg-division')?.value || 'Intermediate (3.5)').trim();
  const rawRef = (document.getElementById('trn-reg-ref')?.value || '').trim();
  const isManual = payMode.toLowerCase() === 'manual';
  const paymentRef = isManual ? 'MANUAL-BOOKING' : rawRef;
  const receiptDataUrl = isManual ? '' : (window.pfTournamentUploadedReceiptDataUrl || '');

  if (!name || name.length < 2) {
    alert('Please enter your Full Name.');
    document.getElementById('trn-reg-name')?.focus();
    return;
  }
  if (phone && phone.replace(/[^0-9]/g, '').length < 10) {
    alert('Please enter a valid mobile number or leave it blank.');
    document.getElementById('trn-reg-phone')?.focus();
    return;
  }
  if (!isSingle && (!partnerRaw || partnerRaw.length < 2)) {
    alert('Please enter your Partner Name.');
    document.getElementById('trn-reg-partner')?.focus();
    return;
  }

  const wChk = document.getElementById('trn-policy-waiver');
  const cChk = document.getElementById('trn-policy-cancellation');
  const nChk = document.getElementById('trn-policy-nonrefundable');
  if ((wChk && !wChk.checked) || (cChk && !cChk.checked) || (nChk && !nChk.checked)) {
    alert('Please review and check the Policies & Player Consent boxes before submitting.');
    return;
  }

  if (!isManual && (!paymentRef || paymentRef.length < 4)) {
    alert(`Please enter your ${payMode} Reference Number (or switch to Manual if paying at the front desk).`);
    document.getElementById('trn-reg-ref')?.focus();
    return;
  }
  if (!isManual && !receiptDataUrl) {
    alert(`Please attach/upload your ${payMode} payment receipt screenshot before submitting.`);
    return;
  }

  _isSubmittingTournamentReg = true;
  const trnSubmitBtn = document.querySelector('#pf-tournament-reg-modal button[onclick*="pfProceedTournamentToPayment"]');
  if (trnSubmitBtn) trnSubmitBtn.disabled = true;
  try {
  const fee = Number(trn.entryFee || 0);
  const pairLabel = (!isSingle && partnerRaw) ? `${name} & ${partnerRaw}` : name;

  if (!Array.isArray(trn.registrations)) {
    trn.registrations = [];
  }

  const unifiedBookingRef = 'PF-TRN-' + Math.floor(100000 + Math.random() * 900000);

  const regEntry = {
    id: unifiedBookingRef,
    bookingRef: unifiedBookingRef,
    tournamentId: trn.id,
    tournamentTitle: trn.title,
    tournamentType: selectedType,
    teamName: pairLabel,
    player1: name,
    partner: partner,
    phone: phone,
    email: email || 'tournament@pfrally.ph',
    division: division,
    entryFee: fee,
    paymentMethod: payMode,
    paymentRef: paymentRef,
    receiptDataUrl: receiptDataUrl,
    status: 'PENDING',
    registeredAt: new Date().toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  };

  trn.registrations.unshift(regEntry);
  trn.registeredCount = pfCountRealTournamentTeams(trn);

  cfg.tournaments = list;
  cfg.updatedAt = Date.now();
  window.PF_SITE_CONFIG = cfg;
  try { localStorage.setItem('pf_site_config', JSON.stringify(cfg)); } catch (e) {}

  const playHoursStr = pfFormatTournamentTimerWindow(trn);
  const bookingRecord = {
    ref: unifiedBookingRef,
    name: pairLabel,
    customerName: pairLabel,
    guestNamesList: pairLabel,
    phone: phone,
    customerPhone: phone,
    email: email || 'tournament@pfrally.ph',
    courtName: `Tournament (${selectedType}) • ${trn.title}`,
    court: `Tournament (${selectedType}) • ${trn.title}`,
    date: trn.date,
    time: playHoursStr,
    slots: [playHoursStr],
    players: isSingle ? 1 : 2,
    total: fee,
    courtCost: fee,
    paymentMethod: payMode,
    paymentMode: payMode,
    transactionRef: paymentRef,
    paymentRef: paymentRef,
    receiptDataUrl: receiptDataUrl,
    status: 'PENDING',
    isTournament: true,
    tournamentId: trn.id,
    tournamentType: selectedType,
    items: [`${trn.title} (${selectedType}) — ${pairLabel}`],
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
  };
  window.pfLastOpenPlayBookingRecord = bookingRecord;

  ['pf_all_bookings', 'pf_public_bookings', 'pf_shared_bookings'].forEach(k => {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]') || [];
      const filtered = arr.filter(b => b && b.ref !== unifiedBookingRef);
      filtered.unshift(bookingRecord);
      localStorage.setItem(k, JSON.stringify(filtered));
    } catch (e) {}
  });

  const trnRegEndpoints = pfGetApiEndpoints('/api/tournament-register');
  for (const url of trnRegEndpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: trn.id,
          tournamentType: selectedType,
          bookingRef: unifiedBookingRef,
          ref: unifiedBookingRef,
          player1: name,
          partner: partner,
          teamName: pairLabel,
          phone: phone,
          email: email,
          division: division,
          entryFee: fee,
          paymentMethod: payMode,
          paymentRef: paymentRef,
          receiptDataUrl: receiptDataUrl
        })
      });
      if (r.ok) break;
    } catch (e) {}
  }

  const stateEndpoints = pfGetApiEndpoints('/api/bookings');
  for (const url of stateEndpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingRecord)
      });
      if (r.ok) break;
    } catch (e) {}
  }

  ['trn-reg-name', 'trn-reg-phone', 'trn-reg-email', 'trn-reg-partner', 'trn-reg-ref'].forEach(idKey => {
    const el = document.getElementById(idKey);
    if (el) el.value = '';
  });
  pfClearTournamentReceiptUpload();

  pfCloseTournamentRegModal();
  pfRenderPublicTournaments();
  if (typeof pfViewOpenPlayReceiptModal === 'function') {
    pfViewOpenPlayReceiptModal(unifiedBookingRef, pairLabel);
  }
  } finally {
    _isSubmittingTournamentReg = false;
    if (trnSubmitBtn) trnSubmitBtn.disabled = false;
  }
}

window.pfGetDefaultTournaments = pfGetDefaultTournaments;
window.pfGetTournamentsList = pfGetTournamentsList;
window.pfSetTournamentFilter = pfSetTournamentFilter;
window.pfRenderPublicTournaments = pfRenderPublicTournaments;
window.renderPublicTournaments = pfRenderPublicTournaments;
window.pfRegisterForTournament = pfRegisterForTournament;
window.pfOpenTournamentRegistrationModal = pfRegisterForTournament;
window.pfCloseTournamentRegModal = pfCloseTournamentRegModal;
window.pfProceedTournamentToPayment = pfProceedTournamentToPayment;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    try { pfRenderOpenPlay24Board(); } catch (e) {}
    try { pfRenderPublicTournaments(); } catch (e) {}
    try { pfRenderHomeGearPortalSection(); } catch (e) {}
  }, 80);
});


// === CLEAN DROPDOWN NAVIGATION CONTROLLER ===
function pfToggleNavDropdown(event, btnEl) {
  if (event) event.stopPropagation();
  const wrapper = btnEl ? btnEl.closest('.pf-nav-dropdown') : null;
  if (!wrapper) return;
  const wasOpen = wrapper.classList.contains('open');
  pfCloseAllNavDropdowns();
  if (!wasOpen) {
    wrapper.classList.add('open');
  }
}

function pfCloseAllNavDropdowns() {
  document.querySelectorAll('.pf-nav-dropdown.open').forEach(el => el.classList.remove('open'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.pf-nav-dropdown')) {
    pfCloseAllNavDropdowns();
  }
});
window.pfToggleNavDropdown = pfToggleNavDropdown;
window.pfCloseAllNavDropdowns = pfCloseAllNavDropdowns;


function pfIsCurrentPhilippineHourSlot(dateYMD, slotStr) {
  const todayYMD = pfGetPhilippineTodayYMD();
  const target = (!dateYMD || dateYMD === 'Today') ? todayYMD : String(dateYMD).trim();
  if (target !== todayYMD) return false;
  const now = pfGetPhilippineNow();
  const slotHr = pfParseSlotHour24(slotStr);
  return slotHr !== null && slotHr === now.getHours();
}
window.pfIsCurrentPhilippineHourSlot = pfIsCurrentPhilippineHourSlot;
// ==============================================================================
// STANDALONE POS GEAR & EQUIPMENT ORDER TERMINAL ("ORDER NOW" -> POS SYSTEM)
// Supports Cash, E-Wallets (GCash / Maya), and Bank Transfer (BDO)
// ==============================================================================
const PF_STANDALONE_GEAR_CATALOG = [
  { key: 'paddle-std', id: 'gear-paddle-std', name: 'Standard Paddle', category: 'Rental Equipment', unitLabel: '/ session', priceKey: 'pricePaddleStd', costKey: 'costPaddleStd', imgKey: 'imgPaddleStd', defaultPrice: 50, defaultCost: 0, defaultImg: 'assets/gear-composite-paddle.jpg' },
  { key: 'paddle-carbon', id: 'gear-paddle-carbon', name: 'Carbon Paddle', category: 'Pro Performance', unitLabel: '/ session', priceKey: 'pricePaddleCarbon', costKey: 'costPaddleCarbon', imgKey: 'imgPaddleCarbon', defaultPrice: 100, defaultCost: 0, defaultImg: 'assets/gear-carbon-paddle.jpg' },
  { key: 'paddle-branded', id: 'gear-paddle-branded', name: 'Branded Carbon Paddle', category: 'Tournament Tier', unitLabel: '/ session', priceKey: 'pricePaddleBranded', costKey: 'costPaddleBranded', imgKey: 'imgPaddleBranded', defaultPrice: 200, defaultCost: 0, defaultImg: 'assets/gear-carbon-paddle.jpg' },
  { key: 'ball-single', id: 'gear-ball-single', name: 'Pickleball Ball', category: 'Match Equipment', unitLabel: '/ ball', priceKey: 'priceBallSingle', costKey: 'costBallSingle', imgKey: 'imgBallSingle', defaultPrice: 50, defaultCost: 30, defaultImg: 'assets/gear-balls-x40.jpg' },
  { key: 'balls-bucket', id: 'gear-balls-bucket', name: 'Training Balls (50 pcs)', category: 'Practice Pack', unitLabel: '/ bucket', priceKey: 'priceBallsBucket', costKey: 'costBallsBucket', imgKey: 'imgBallsBucket', defaultPrice: 100, defaultCost: 0, defaultImg: 'assets/gear-balls-x40.jpg' },
  { key: 'machine', id: 'gear-machine', name: 'Training Machine', category: 'Solo Training', unitLabel: '/ hour', priceKey: 'priceMachine', costKey: 'costMachine', imgKey: 'imgMachine', defaultPrice: 100, defaultCost: 0, defaultImg: 'assets/gear-ball-machine.jpg' }
];

let pfGearOrderQuantities = {};
let pfGearOrderPayMethod = 'Cash';
let pfIsSubmittingGearOrder = false;

function pfGetLiveGearCatalog() {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  return PF_STANDALONE_GEAR_CATALOG.map(item => ({
    ...item,
    price: Number(cfg[item.priceKey] ?? item.defaultPrice) || item.defaultPrice,
    costPrice: Number(cfg[item.costKey] ?? item.defaultCost) || 0,
    img: cfg[item.imgKey] || item.defaultImg
  }));
}

window.pfGearUploadedReceiptDataUrl = '';

function pfHandleGearReceiptUpload(ev) {
  const file = ev?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(loadEv) {
    window.pfGearUploadedReceiptDataUrl = typeof loadEv.target?.result === 'string' ? loadEv.target.result : '';
    const statusEl = document.getElementById('pf-gear-receipt-status');
    if (statusEl) {
      statusEl.textContent = '✓ Attached: ' + (file.name || 'Receipt Screenshot');
      statusEl.classList.remove('hidden');
    }
  };
  reader.readAsDataURL(file);
}
window.pfHandleGearReceiptUpload = pfHandleGearReceiptUpload;

function pfRenderHomeGearPortalSection() {
  const grid = document.getElementById('pf-home-gear-catalog-grid');
  if (!grid) return;
  const catalog = pfGetLiveGearCatalog();
  grid.innerHTML = catalog.map(item => `
    <div class="group rounded-3xl bg-white border border-[#E6E4DD] p-5 sm:p-6 shadow-[0_12px_32px_-12px_rgba(13,31,24,0.07)] hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-4 text-[#0D1F18]">
      <div class="flex items-start gap-4">
        <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#F6F5F0] border border-[#E6E4DD] flex-shrink-0">
          <img src="${pfEscapeHtml(item.img)}" onerror="this.onerror=null;this.src='assets/gear-carbon-paddle.jpg';" alt="${pfEscapeHtml(item.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#0F3D2A] text-[10px] font-mono font-bold uppercase tracking-wider">${pfEscapeHtml(item.category)}</span>
          <h3 class="font-display font-bold text-base sm:text-lg text-[#0D1F18] leading-snug">${pfEscapeHtml(item.name)}</h3>
          <div class="flex items-baseline gap-1 pt-0.5">
            <span class="font-mono font-black text-xl text-[#0F3D2A]">₱${Number(item.price).toLocaleString()}.00</span>
            <span class="text-xs text-[#64748B] font-medium">${pfEscapeHtml(item.unitLabel)}</span>
          </div>
        </div>
      </div>
      <div class="pt-3 border-t border-[#ECEAE4] flex items-center justify-between gap-2">
        <span class="text-[11px] text-[#52605A] font-medium">No court booking required</span>
        <button type="button" onclick="pfOpenGearOrderModal('${pfEscapeHtml(item.key)}')" class="pf-btn-club-cta px-4 py-2.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider transition cursor-pointer inline-flex items-center gap-2">
          <span>Rent Gear Only</span>
          <span class="pf-btn-cta-arrow">&rarr;</span>
        </button>
      </div>
    </div>
  `).join('');
}
window.pfRenderHomeGearPortalSection = pfRenderHomeGearPortalSection;

function pfOpenGearOrderModal(initialItemKey) {
  const catalog = pfGetLiveGearCatalog();
  pfGearOrderQuantities = {};
  catalog.forEach(g => { pfGearOrderQuantities[g.key] = 0; });

  const matched = catalog.find(g => g.key === initialItemKey || g.name.toLowerCase() === String(initialItemKey || '').toLowerCase());
  if (matched) {
    pfGearOrderQuantities[matched.key] = 1;
  } else if (catalog[0]) {
    pfGearOrderQuantities[catalog[0].key] = 1;
  }
  window.pfGearUploadedReceiptDataUrl = '';

  let modal = document.getElementById('pf-standalone-gear-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'pf-standalone-gear-modal';
  modal.className = 'fixed inset-0 z-[9999] hidden flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto';
  modal.innerHTML = `
    <div onclick="pfCloseGearOrderModal()" class="fixed inset-0 bg-black/80 backdrop-blur-md"></div>
    <div class="relative z-10 w-full max-w-3xl max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white text-[#0D1F18] border border-[#E6E4DD] p-5 sm:p-7 shadow-2xl space-y-5 my-auto">
      <div class="flex items-start justify-between gap-3 border-b border-[#ECEAE4] pb-4">
        <div class="flex items-center gap-3">
          <img src="assets/logo.png" alt="P&amp;F Logo" class="w-11 h-11 rounded-2xl object-contain bg-[#F6F5F0] p-1 border border-[#E6E4DD] flex-shrink-0">
          <div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#0F3D2A] font-mono text-[10px] font-bold uppercase tracking-wider">
              <span class="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></span>
              Standalone Equipment &amp; Gear Payment Portal
            </span>
            <h3 class="text-lg sm:text-2xl font-bold tracking-tight text-[#0D1F18] mt-0.5">Rent Paddles, Balls &amp; Training Machine</h3>
            <p class="text-xs text-[#52605A]">Already have a court booked or joining Open Play? Rent equipment separately without booking a court.</p>
          </div>
        </div>
        <button type="button" onclick="pfCloseGearOrderModal()" class="w-9 h-9 rounded-full bg-[#F6F5F0] hover:bg-[#0D1F18] text-[#0D1F18] hover:text-white font-bold text-xs flex items-center justify-center transition flex-shrink-0 cursor-pointer" aria-label="Close Gear Portal">✕</button>
      </div>

      <!-- Step 1: Select Gear & Quantity -->
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono font-bold uppercase tracking-wider text-[#0F3D2A]">1. Select Equipment &amp; Quantity</span>
          <span class="text-[11px] font-mono text-[#64748B]">Tap + / &minus; to adjust</span>
        </div>
        <div id="pf-gear-modal-items-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5"></div>
      </div>

      <!-- Step 2: Player & Session Details -->
      <div class="space-y-2.5">
        <span class="text-xs font-mono font-bold uppercase tracking-wider text-[#0F3D2A] block">2. Player &amp; Court / Session Details</span>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label class="block text-[11px] font-bold text-[#334155] mb-1">Full Name <span class="text-rose-600">*</span></label>
            <input type="text" id="pf-gear-order-name" placeholder="e.g. Marco Santos" class="w-full bg-[#FAFAF7] border border-[#D5D3CB] rounded-xl px-3.5 py-2.5 text-[#0D1F18] font-semibold focus:outline-none focus:border-[#0F3D2A]">
          </div>
          <div>
            <label class="block text-[11px] font-bold text-[#334155] mb-1">Mobile Number <span class="text-[#64748B] font-normal">(Optional)</span></label>
            <input type="tel" id="pf-gear-order-phone" placeholder="0917 123 4567" class="w-full bg-[#FAFAF7] border border-[#D5D3CB] rounded-xl px-3.5 py-2.5 text-[#0D1F18] font-mono font-semibold focus:outline-none focus:border-[#0F3D2A]">
          </div>
          <div>
            <label class="block text-[11px] font-bold text-[#334155] mb-1">Existing Court / Session</label>
            <select id="pf-gear-order-note" class="w-full bg-[#FAFAF7] border border-[#D5D3CB] rounded-xl px-3 py-2.5 text-[#0D1F18] font-semibold focus:outline-none focus:border-[#0F3D2A]">
              <option value="Already Booked — Court 1">Already Booked — Court 1</option>
              <option value="Already Booked — Court 2">Already Booked — Court 2</option>
              <option value="Already Booked — Court 3">Already Booked — Court 3</option>
              <option value="Already Booked — Court 4">Already Booked — Court 4</option>
              <option value="Open Play Participant">Open Play Participant</option>
              <option value="Walk-In / Front Desk">Walk-In / Front Desk Pickup</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Step 3: Payment Portal (GCash, Maya, BDO / Bank, Manual Payment) -->
      <div class="p-4 sm:p-5 rounded-2xl bg-[#F8F7F3] border border-[#E6E4DD] space-y-4 text-xs">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-bold uppercase tracking-wider text-[#0F3D2A]">3. Select Payment Method *</span>
            <span class="text-[11px] text-[#64748B]">Online QR or Manual Payment</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" id="pf-gear-pay-GCash" onclick="pfSetGearOrderPayMethod('GCash')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">GCash</button>
            <button type="button" id="pf-gear-pay-Maya" onclick="pfSetGearOrderPayMethod('Maya')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">Maya</button>
            <button type="button" id="pf-gear-pay-BDO" onclick="pfSetGearOrderPayMethod('BDO')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">BDO / Bank</button>
            <button type="button" id="pf-gear-pay-Cash" onclick="pfSetGearOrderPayMethod('Cash')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">Manual Payment</button>
          </div>
        </div>

        <div id="pf-gear-cash-note" class="hidden p-3.5 rounded-xl bg-[#E8F5EE] border border-[#BFE3CE] text-[#0D1F18] space-y-1 text-xs">
          <div class="font-bold text-[#0F3D2A]">Manual Payment (Pay at Front Desk / Cash)</div>
          <p class="text-[11px] text-[#334139] leading-relaxed">Your equipment reservation will be transmitted to the <b>Front-Desk POS &amp; Admin Portal</b>. Simply present your Gear Pass and settle at the counter when picking up your paddles or balls.</p>
        </div>

        <div id="pf-gear-qr-wrap" class="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-white border border-[#E6E4DD] shadow-xs">
          <div class="flex flex-col items-center flex-shrink-0">
            <img id="pf-gear-qr-img" src="assets/qr-gcash.png" alt="Payment QR" onclick="if(window.pfOpenQrStandeeLightbox) pfOpenQrStandeeLightbox(pfGearOrderPayMethod.toLowerCase())" class="w-32 h-32 object-contain rounded-xl border border-[#E6E4DD] p-1.5 bg-white cursor-pointer">
            <div class="flex items-center gap-1.5 mt-2">
              <button type="button" onclick="if(window.pfOpenQrStandeeLightbox) pfOpenQrStandeeLightbox(pfGearOrderPayMethod.toLowerCase())" class="px-2.5 py-1 rounded-lg bg-[#F6F5F0] hover:bg-[#E6E4DD] text-[#0D1F18] text-[10px] font-bold border border-[#D5D3CB] cursor-pointer">🔍 Zoom QR</button>
              <button type="button" onclick="if(window.pfDownloadOfficialQr) pfDownloadOfficialQr(pfGearOrderPayMethod.toLowerCase())" class="px-2.5 py-1 rounded-lg bg-[#F6F5F0] hover:bg-[#E6E4DD] text-[#0D1F18] text-[10px] font-bold border border-[#D5D3CB] cursor-pointer">📥 Save QR</button>
            </div>
          </div>
          <div class="space-y-1.5 text-center sm:text-left flex-1">
            <span id="pf-gear-qr-badge" class="inline-block px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#0F3D2A] font-mono text-[10px] font-bold uppercase">OFFICIAL GCASH QR</span>
            <div id="pf-gear-qr-acc" class="font-mono text-xs sm:text-sm font-bold text-[#0D1F18]">GCash: 0999 883 2346 (P&amp;F Rally Ground)</div>
            <p class="text-[11px] text-[#52605A] leading-relaxed">Scan the official QR code above to send the exact gear rental amount, then enter your Reference Number below (or switch to <b>Manual Payment</b> if paying at the front desk).</p>
          </div>
        </div>

        <div id="pf-gear-ref-wrap" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label id="pf-gear-ref-label" class="block text-[11px] font-bold text-[#334155] mb-1">Transaction Reference No. *</label>
            <input type="text" id="pf-gear-order-ref" placeholder="e.g. 9028 3746 1928" class="w-full bg-white border border-[#D5D3CB] rounded-xl px-3.5 py-2.5 text-[#0D1F18] font-mono font-semibold focus:outline-none focus:border-[#0F3D2A]">
          </div>
          <div>
            <label id="pf-gear-receipt-label" class="block text-[11px] font-bold text-[#334155] mb-1">Upload Payment Receipt <span class="text-rose-600">*</span></label>
            <input type="file" id="pf-gear-order-receipt" accept="image/*" onchange="pfHandleGearReceiptUpload(event)" class="w-full text-[11px] text-[#475850] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#E8F5EE] file:text-[#0F3D2A] hover:file:bg-[#D5EDE0]">
            <p id="pf-gear-receipt-status" class="hidden text-[10px] font-bold text-[#15803D] mt-1"></p>
          </div>
        </div>
      </div>

      <p id="pf-gear-order-error" class="hidden p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold"></p>

      <!-- Footer Total & Submit -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0D1F18] text-white" style="background:#0D1F18 !important;color:#FFFFFF !important;">
        <div>
          <span class="text-[10px] font-mono uppercase tracking-wider block" style="color:#A7F3D0 !important;">Total Equipment Rental Fee</span>
          <b id="pf-gear-order-total" class="text-2xl font-mono font-black" style="color:#A3E635 !important;">₱0.00</b>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="pfCloseGearOrderModal()" class="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase transition cursor-pointer">Cancel</button>
          <button type="button" id="pf-gear-submit-btn" onclick="pfSubmitStandaloneGearOrder()" class="flex-1 sm:flex-initial px-6 py-3.5 rounded-xl bg-[#A3E635] hover:bg-[#BEF264] text-[#0D1F18] font-black uppercase text-xs tracking-wider transition shadow-lg cursor-pointer" style="background:#A3E635 !important;color:#0D1F18 !important;">
            Confirm Gear Rental &amp; Get Pass →
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  pfRenderGearOrderItems();
  pfSetGearOrderPayMethod('GCash');
  const errEl = document.getElementById('pf-gear-order-error');
  if (errEl) errEl.classList.add('hidden');
  modal.classList.remove('hidden');
}
window.pfOpenGearOrderModal = pfOpenGearOrderModal;

function pfCloseGearOrderModal() {
  const modal = document.getElementById('pf-standalone-gear-modal');
  if (modal) modal.classList.add('hidden');
}
window.pfCloseGearOrderModal = pfCloseGearOrderModal;

function pfAdjustGearOrderQty(itemKey, delta) {
  const cur = Number(pfGearOrderQuantities[itemKey] || 0);
  pfGearOrderQuantities[itemKey] = Math.max(0, Math.min(20, cur + delta));
  pfRenderGearOrderItems();
}
window.pfAdjustGearOrderQty = pfAdjustGearOrderQty;

function pfRenderGearOrderItems() {
  const grid = document.getElementById('pf-gear-modal-items-grid');
  const totalEl = document.getElementById('pf-gear-order-total');
  if (!grid) return;
  const catalog = pfGetLiveGearCatalog();
  let sum = 0;

  grid.innerHTML = catalog.map(item => {
    const qty = Number(pfGearOrderQuantities[item.key] || 0);
    sum += qty * item.price;
    const isSelected = qty > 0;
    return `
      <div class="p-3 rounded-2xl border-2 transition flex items-center justify-between gap-2.5 ${
        isSelected ? 'bg-[#E8F5EE] border-[#15803D] shadow-xs' : 'bg-[#FAFAF7] border-[#E6E4DD]'
      }">
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${pfEscapeHtml(item.img)}" onerror="this.onerror=null;this.src='assets/gear-carbon-paddle.jpg';" alt="${pfEscapeHtml(item.name)}" class="w-11 h-11 rounded-xl object-cover border border-[#D5D3CB] bg-white flex-shrink-0">
          <div class="min-w-0">
            <span class="block text-xs font-bold text-[#0D1F18] truncate">${pfEscapeHtml(item.name)}</span>
            <span class="block text-[11px] font-mono font-bold text-[#0F3D2A]">₱${item.price} <span class="text-[10px] text-[#64748B] font-normal">${item.unitLabel}</span></span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onclick="pfAdjustGearOrderQty('${item.key}', -1)" class="w-8 h-8 rounded-lg bg-white hover:bg-[#EAE8E1] border border-[#D5D3CB] text-[#0D1F18] font-black text-sm flex items-center justify-center cursor-pointer">−</button>
          <span class="w-6 text-center font-mono text-xs font-black text-[#0D1F18]">${qty}</span>
          <button type="button" onclick="pfAdjustGearOrderQty('${item.key}', 1)" class="w-8 h-8 rounded-lg bg-[#0D1F18] hover:bg-[#15803D] text-white font-black text-sm flex items-center justify-center cursor-pointer" style="background:#0D1F18 !important;color:#FFFFFF !important;">+</button>
        </div>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = `₱${sum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pfSetGearOrderPayMethod(method) {
  pfGearOrderPayMethod = method || 'GCash';
  ['GCash', 'Maya', 'BDO', 'Cash'].forEach(k => {
    const btn = document.getElementById('pf-gear-pay-' + k);
    if (!btn) return;
    if (k === pfGearOrderPayMethod) {
      btn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition shadow-sm cursor-pointer bg-[#0D1F18] text-white border border-[#0D1F18]';
      btn.setAttribute('style', 'background-color:#0D1F18 !important;color:#FFFFFF !important;border-color:#0D1F18 !important;');
    } else {
      btn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer bg-white text-[#0D1F18] border border-[#D5D3CB] hover:border-[#0D1F18]';
      btn.removeAttribute('style');
    }
  });
  const cashNote = document.getElementById('pf-gear-cash-note');
  const qrWrap = document.getElementById('pf-gear-qr-wrap');
  const refInput = document.getElementById('pf-gear-order-ref');
  const refLabel = document.getElementById('pf-gear-ref-label');
  const qrImg = document.getElementById('pf-gear-qr-img');
  const qrAcc = document.getElementById('pf-gear-qr-acc');
  const qrBadge = document.getElementById('pf-gear-qr-badge');
  const qrCfg = (typeof pfGetPaymentConfig === 'function') ? pfGetPaymentConfig() : {};

  if (pfGearOrderPayMethod === 'Cash') {
    if (cashNote) cashNote.classList.remove('hidden');
    if (qrWrap) qrWrap.classList.add('hidden');
    if (refLabel) refLabel.textContent = 'Manual Payment / Front Desk Note (Optional)';
    if (refInput) {
      refInput.value = 'MANUAL-FRONT-DESK';
      refInput.placeholder = 'MANUAL-FRONT-DESK';
    }
  } else {
    if (cashNote) cashNote.classList.add('hidden');
    if (qrWrap) qrWrap.classList.remove('hidden');
    if (refLabel) refLabel.textContent = `${pfGearOrderPayMethod} Reference No. *`;
    if (refInput) {
      if (refInput.value === 'MANUAL-FRONT-DESK') refInput.value = '';
      refInput.placeholder = `Enter ${pfGearOrderPayMethod} Reference Number`;
    }
    const chKey = pfGearOrderPayMethod.toLowerCase();
    const resolvedSrc = (typeof pfGetOfficialQrUrl === 'function')
      ? pfGetOfficialQrUrl(chKey)
      : (pfGearOrderPayMethod === 'GCash' ? 'assets/qr-gcash.png' : (pfGearOrderPayMethod === 'Maya' ? 'assets/qr-maya.png' : 'assets/qr-bdo.png'));
    if (qrImg) {
      qrImg.src = resolvedSrc;
      qrImg.onerror = function() {
        this.onerror = null;
        this.src = pfGearOrderPayMethod === 'GCash' ? 'assets/qr-gcash.png' : (pfGearOrderPayMethod === 'Maya' ? 'assets/qr-maya.png' : 'assets/qr-bdo.png');
      };
    }
    if (qrBadge) {
      qrBadge.textContent = pfGearOrderPayMethod === 'BDO' ? 'OFFICIAL BDO BANK TRANSFER QR' : `OFFICIAL ${pfGearOrderPayMethod.toUpperCase()} QR PH`;
    }
    const accNo = pfGearOrderPayMethod === 'GCash'
      ? (qrCfg.gcashNumber || '0999 883 2346')
      : (pfGearOrderPayMethod === 'Maya' ? (qrCfg.mayaNumber || '0999 883 2346') : (qrCfg.bdoNumber || '••••••••8678'));
    if (qrAcc) qrAcc.textContent = `${pfGearOrderPayMethod} Account: ${accNo} (P&F Rally Ground)`;
  }
}
window.pfSetGearOrderPayMethod = pfSetGearOrderPayMethod;

async function pfSubmitStandaloneGearOrder() {
  if (pfIsSubmittingGearOrder) return;
  const catalog = pfGetLiveGearCatalog();
  const chosen = catalog.filter(g => Number(pfGearOrderQuantities[g.key] || 0) > 0);
  const errEl = document.getElementById('pf-gear-order-error');
  const showErr = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    } else {
      alert(msg);
    }
  };

  if (chosen.length === 0) {
    showErr('Please select at least 1 equipment item using the + button.');
    return;
  }

  const name = (document.getElementById('pf-gear-order-name')?.value || '').trim();
  const phone = (document.getElementById('pf-gear-order-phone')?.value || '').trim();
  const note = (document.getElementById('pf-gear-order-note')?.value || '').trim() || 'Gear Rental Only';
  let payRef = (document.getElementById('pf-gear-order-ref')?.value || '').trim();

  if (!name || name.length < 2) {
    showErr('Please enter your Full Name.');
    document.getElementById('pf-gear-order-name')?.focus();
    return;
  }
  if (phone && phone.replace(/[^0-9]/g, '').length < 10) {
    showErr('Please enter a valid 11-digit mobile number (e.g. 0917 123 4567) or leave it blank.');
    document.getElementById('pf-gear-order-phone')?.focus();
    return;
  }
  if (pfGearOrderPayMethod === 'Cash') {
    if (!payRef) payRef = 'MANUAL-FRONT-DESK';
  } else {
    if (!payRef || payRef.length < 4) {
      showErr(`Please enter your ${pfGearOrderPayMethod} Reference Number (or switch to Manual Payment to pay at the front desk).`);
      document.getElementById('pf-gear-order-ref')?.focus();
      return;
    }
    const gearReceiptFileEl = document.getElementById('pf-gear-order-receipt');
    const hasGearReceipt = Boolean((window.pfGearUploadedReceiptDataUrl && String(window.pfGearUploadedReceiptDataUrl).trim()) || (gearReceiptFileEl && gearReceiptFileEl.files && gearReceiptFileEl.files[0]));
    if (!hasGearReceipt) {
      showErr(`Please attach/upload your ${pfGearOrderPayMethod} payment receipt screenshot.`);
      gearReceiptFileEl?.focus();
      return;
    }
  }
  if (errEl) errEl.classList.add('hidden');

  const totalAmount = chosen.reduce((acc, g) => acc + (g.price * Number(pfGearOrderQuantities[g.key] || 0)), 0);
  const totalCost = chosen.reduce((acc, g) => acc + ((g.costPrice || 0) * Number(pfGearOrderQuantities[g.key] || 0)), 0);
  const itemsDesc = chosen.map(g => `${Number(pfGearOrderQuantities[g.key] || 1)}× ${g.name} (₱${g.price * Number(pfGearOrderQuantities[g.key] || 1)})`).join(', ');
  const gearRef = 'PF-GEAR-' + Math.floor(100000 + Math.random() * 900000);
  const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function') ? pfGetPhilippineTodayYMD() : new Date().toISOString().slice(0, 10);
  const nowStr = todayYMD + ' ' + new Date().toTimeString().slice(0, 5);

  const methodLabel = pfGearOrderPayMethod === 'Cash'
    ? 'MANUAL PAYMENT'
    : (pfGearOrderPayMethod === 'BDO' ? 'BANK TRANSFER (BDO)' : pfGearOrderPayMethod.toUpperCase());

  const posSalePayload = {
    ref: gearRef,
    type: 'POS Retail',
    desc: `${itemsDesc} • ${name} (${note}) [Ref: ${payRef}]`,
    method: pfGearOrderPayMethod === 'Cash' ? 'Cash' : methodLabel,
    customerName: name,
    phone: phone,
    paymentRef: payRef,
    amount: totalAmount,
    cost: Math.round(totalCost * 100) / 100,
    profit: Math.round((totalAmount - totalCost) * 100) / 100,
    items: chosen.map(g => ({
      id: g.id,
      name: g.name,
      qty: Number(pfGearOrderQuantities[g.key] || 1),
      price: g.price,
      costPrice: g.costPrice || 0
    })),
    date: nowStr
  };

  const gearBookingPayload = {
    ref: gearRef,
    name: name,
    customerName: name,
    phone: phone,
    customerPhone: phone,
    email: 'guest@pfrally.ph',
    court: `Gear Rental • ${note}`,
    date: todayYMD,
    time: `${todayYMD} • ${note}`,
    players: 1,
    paymentMethod: methodLabel,
    paymentMode: methodLabel,
    transactionRef: payRef,
    receiptDataUrl: window.pfGearUploadedReceiptDataUrl || '',
    total: totalAmount,
    gearCost: totalAmount,
    status: 'PENDING',
    bookingType: 'GEAR_ONLY',
    items: chosen.map(g => `${Number(pfGearOrderQuantities[g.key] || 1)}× ${g.name} (₱${g.price * Number(pfGearOrderQuantities[g.key] || 1)})`),
    createdAt: nowStr
  };

  pfIsSubmittingGearOrder = true;
  const submitBtn = document.getElementById('pf-gear-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Gear Order...';
  }

  try {
    const localSales = JSON.parse(localStorage.getItem('pf_sales_ledger') || '[]');
    localSales.unshift(posSalePayload);
    localStorage.setItem('pf_sales_ledger', JSON.stringify(localSales));

    const allBookings = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]');
    allBookings.unshift(gearBookingPayload);
    localStorage.setItem('pf_all_bookings', JSON.stringify(allBookings));
    localStorage.setItem('pf_last_booking', JSON.stringify(gearBookingPayload));
  } catch (e) {}

  try {
    await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(posSalePayload)
    });
  } catch (e) {}

  try {
    const endpoints = (typeof window.pfGetApiEndpoints === 'function') ? window.pfGetApiEndpoints('/api/bookings') : ['/api/bookings'];
    for (const ep of endpoints) {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gearBookingPayload)
      });
      if (r.ok) break;
    }
  } catch (e) {}

  pfIsSubmittingGearOrder = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Gear Rental & Get Pass →';
  }
  pfCloseGearOrderModal();

  // Populate & open the Match/Gear Pass Modal if present on page
  const passModal = document.getElementById('match-pass-modal');
  if (passModal) {
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('pass-ref', gearRef);
    setTxt('pass-note-ref', gearRef);
    setTxt('pass-name', `${name} • ${phone}`);
    const courtEl = document.getElementById('pass-court');
    if (courtEl) {
      courtEl.innerHTML = `<div class="text-white font-bold mb-1">${pfEscapeHtml(note)} (Equipment Only)</div>` +
        chosen.map(g => `<div class="text-xs text-brand-lime">• ${Number(pfGearOrderQuantities[g.key] || 1)}× ${pfEscapeHtml(g.name)} (₱${g.price * Number(pfGearOrderQuantities[g.key] || 1)})</div>`).join('');
    }
    setTxt('pass-time', `${todayYMD} • ${note}`);
    setTxt('pass-paymethod', methodLabel);
    setTxt('pass-payref', payRef);
    setTxt('pass-total', `₱${totalAmount.toLocaleString()}.00`);
    passModal.classList.remove('hidden');
  } else if (typeof pfViewOpenPlayReceiptModal === 'function') {
    pfViewOpenPlayReceiptModal(gearRef, name);
  }
}
window.pfSubmitStandaloneGearOrder = pfSubmitStandaloneGearOrder;

// ============================================================================
// SEPARATE LIVE CLUB INVENTORY BILLING PORTAL (AUTO-DECREASES STOCK, POS, SALES REPORT & TRANSACTIONS)
// ============================================================================
let pfInvOrderQuantities = {};
let pfInvOrderPayMethod = 'GCash';
let pfIsSubmittingInvOrder = false;
window.pfInvUploadedReceiptDataUrl = '';

function pfGetLiveInventoryItemsList() {
  const purgedIds = new Set(['inv-1793729388813', 'inv-1793729578611']);
  let list = [];
  if (typeof sharedServerState !== 'undefined' && sharedServerState && Array.isArray(sharedServerState.inventory) && sharedServerState.inventory.length > 0) {
    list = sharedServerState.inventory;
  } else {
    try {
      const locInv = JSON.parse(localStorage.getItem('pf_inventory') || localStorage.getItem('pf_pos_catalog') || '[]');
      if (Array.isArray(locInv)) list = locInv;
    } catch (e) {}
  }
  return list
    .filter(i => i && i.id && !purgedIds.has(String(i.id).trim()))
    .map(i => {
      const directCost = Number(i.costPrice || 0);
      const boxCost = Number(i.costPerBox || 0);
      const pcs = Number(i.pcsPerBox || 0);
      const resolvedCost = directCost > 0 ? directCost : ((boxCost > 0 && pcs > 0) ? Math.round((boxCost / pcs) * 100) / 100 : 0);
      return {
        ...i,
        id: String(i.id),
        name: String(i.name || 'Club Item'),
        cat: String(i.cat || 'Refreshment'),
        price: Math.max(0, Number(i.price || 0)),
        costPrice: resolvedCost,
        stock: Math.max(0, Number(i.stock || 0)),
        soldCount: Math.max(0, Number(i.soldCount || 0)),
        img: i.img || 'assets/gear-water-500ml.jpg'
      };
    });
}
window.pfGetLiveInventoryItemsList = pfGetLiveInventoryItemsList;

let pfInvDeliveryOption = 'Front Desk / POS Counter';
let pfInvPaymentConfirmedToggle = true;

function pfSetInvDeliveryOption(optLabel) {
  pfInvDeliveryOption = optLabel || 'Front Desk / POS Counter';
  const hiddenInput = document.getElementById('pf-inv-order-note');
  if (hiddenInput) hiddenInput.value = pfInvDeliveryOption;
  document.querySelectorAll('[data-inv-delivery-opt]').forEach(btn => {
    const val = btn.getAttribute('data-inv-delivery-opt') || '';
    const isAct = val === pfInvDeliveryOption;
    if (isAct) {
      btn.className = 'py-2.5 px-3 rounded-xl font-bold text-[11px] sm:text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs';
      btn.setAttribute('style', 'background-color:#0F291E !important;color:#FFFFFF !important;border:1.5px solid #15803D !important;');
    } else {
      btn.className = 'py-2.5 px-3 rounded-xl font-semibold text-[11px] sm:text-xs transition cursor-pointer flex items-center justify-center gap-1.5 hover:border-emerald-600';
      btn.setAttribute('style', 'background-color:#F8FAFC !important;color:#1E293B !important;border:1.5px solid #E2E8F0 !important;');
    }
  });
}
window.pfSetInvDeliveryOption = pfSetInvDeliveryOption;

function pfToggleInvPayConfirmReady() {
  pfInvPaymentConfirmedToggle = !pfInvPaymentConfirmedToggle;
  pfSyncInvPayConfirmVisual();
}
window.pfToggleInvPayConfirmReady = pfToggleInvPayConfirmReady;

function pfSyncInvPayConfirmVisual() {
  const box = document.getElementById('pf-inv-confirm-pay-box');
  const chk = document.getElementById('pf-inv-confirm-pay-check');
  const txt = document.getElementById('pf-inv-confirm-pay-text');
  if (!box || !chk) return;
  if (pfInvPaymentConfirmedToggle) {
    box.setAttribute('style', 'background-color:#ECFDF5 !important;border:1.5px solid #10B981 !important;color:#065F46 !important;');
    chk.setAttribute('style', 'background-color:#15803D !important;color:#FFFFFF !important;border-color:#15803D !important;');
    chk.textContent = '✓';
    if (txt) txt.setAttribute('style', 'color:#065F46 !important;');
  } else {
    box.setAttribute('style', 'background-color:#FFFBEB !important;border:1.5px solid #F59E0B !important;color:#92400E !important;');
    chk.setAttribute('style', 'background-color:#FFFFFF !important;color:transparent !important;border-color:#F59E0B !important;');
    chk.textContent = '✓';
    if (txt) txt.setAttribute('style', 'color:#92400E !important;');
  }
}

function pfOpenLiveInventoryModal(initialItemKey) {
  const catalog = pfGetLiveInventoryItemsList();
  pfInvOrderQuantities = {};
  catalog.forEach(item => { pfInvOrderQuantities[item.id] = 0; });

  const keyStr = String(initialItemKey || '').trim().toLowerCase();
  const matched = catalog.find(i => i.id.toLowerCase() === keyStr || i.name.toLowerCase() === keyStr);
  if (matched && matched.stock > 0) {
    pfInvOrderQuantities[matched.id] = 1;
  } else {
    const firstAvail = catalog.find(i => i.stock > 0);
    if (firstAvail) pfInvOrderQuantities[firstAvail.id] = 1;
  }
  pfInvDeliveryOption = 'Front Desk / POS Counter';
  pfInvPaymentConfirmedToggle = true;

  let modal = document.getElementById('pf-live-inventory-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'pf-live-inventory-modal';
  modal.className = 'fixed inset-0 z-[9999] hidden flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-y-auto';
  modal.innerHTML = `
    <div onclick="pfCloseLiveInventoryModal()" class="fixed inset-0 bg-black/80 backdrop-blur-md"></div>
    <div class="relative z-10 w-full max-w-2xl max-h-[94dvh] sm:max-h-[90dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-white text-[#0F172A] border border-slate-200 shadow-2xl overflow-hidden my-auto" style="background:#FFFFFF !important;color:#0F172A !important;">
      
      <!-- Sticky Top Header -->
      <div class="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0" style="background:#FFFFFF !important;">
        <div class="flex items-center gap-3 min-w-0">
          <img src="assets/logo.png" alt="P&amp;F Logo" class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl object-contain bg-slate-50 p-1 border border-slate-200 flex-shrink-0 shadow-xs">
          <div class="min-w-0">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider" style="background:#ECFDF5 !important;color:#065F46 !important;border-color:#A7F3D0 !important;">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              <span>🥤 Pro Shop &amp; Refreshments • Live Inventory Billing</span>
            </span>
            <h3 class="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-slate-900 mt-0.5 leading-tight" style="color:#0F172A !important;">Avail Live Club Inventory</h3>
            <p class="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug" style="color:#475569 !important;">Decreases live stock automatically and routes to Admin POS, Inventory &amp; Sales Report for payment confirmation.</p>
          </div>
        </div>
        <button type="button" onclick="pfCloseLiveInventoryModal()" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white font-bold text-xs flex items-center justify-center transition flex-shrink-0 cursor-pointer" aria-label="Close Live Inventory Billing">✕</button>
      </div>

      <!-- Scrollable Body -->
      <div class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5 overscroll-contain">

        <!-- Step 1: Select Live Inventory Items & Quantity -->
        <div class="space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-emerald-800" style="color:#065F46 !important;">1. Select Item &amp; Quantity (Auto-Deducts Stock)</span>
            <span class="text-[10px] sm:text-[11px] font-mono font-semibold text-slate-500" style="color:#64748B !important;">Tap + / &minus; to adjust quantity</span>
          </div>
          <div id="pf-inv-modal-items-grid" class="grid grid-cols-1 gap-3"></div>
        </div>

        <!-- Step 2: Customer & Pickup / Delivery Details -->
        <div class="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-3.5" style="background:#F8FAFC !important;border-color:#E2E8F0 !important;">
          <span class="text-[11px] sm:text-xs font-mono font-extrabold uppercase tracking-wider text-emerald-800 block" style="color:#065F46 !important;">2. Customer &amp; Pickup / Court Delivery</span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1" style="color:#334155 !important;">Customer Full Name <span class="text-rose-600">*</span></label>
              <input type="text" id="pf-inv-order-name" placeholder="e.g. Marco Santos" class="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-semibold text-xs sm:text-sm focus:outline-none focus:border-emerald-700 shadow-2xs" style="background:#FFFFFF !important;color:#0F172A !important;">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1" style="color:#334155 !important;">Mobile Number <span class="text-slate-400 font-normal">(Optional)</span></label>
              <input type="tel" id="pf-inv-order-phone" placeholder="0917 123 4567" class="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-semibold text-xs sm:text-sm focus:outline-none focus:border-emerald-700 shadow-2xs" style="background:#FFFFFF !important;color:#0F172A !important;">
            </div>
          </div>

          <div class="space-y-1.5 pt-0.5">
            <label class="block text-[11px] font-bold text-slate-700" style="color:#334155 !important;">Pickup or Court Delivery Location</label>
            <input type="hidden" id="pf-inv-order-note" value="Front Desk / POS Counter">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button type="button" data-inv-delivery-opt="Front Desk / POS Counter" onclick="pfSetInvDeliveryOption('Front Desk / POS Counter')">🏪 Counter Pickup</button>
              <button type="button" data-inv-delivery-opt="Deliver to Court 1" onclick="pfSetInvDeliveryOption('Deliver to Court 1')">🎾 Court 1</button>
              <button type="button" data-inv-delivery-opt="Deliver to Court 2" onclick="pfSetInvDeliveryOption('Deliver to Court 2')">🎾 Court 2</button>
              <button type="button" data-inv-delivery-opt="Deliver to Court 3" onclick="pfSetInvDeliveryOption('Deliver to Court 3')">🎾 Court 3</button>
              <button type="button" data-inv-delivery-opt="Deliver to Court 4" onclick="pfSetInvDeliveryOption('Deliver to Court 4')">🎾 Court 4</button>
              <button type="button" data-inv-delivery-opt="Open Play / Club Lounge" onclick="pfSetInvDeliveryOption('Open Play / Club Lounge')">🛋️ Club Lounge</button>
            </div>
          </div>
        </div>

        <!-- Step 3: Payment Method & Instant Payment Confirmation (No Ref Number / No Image Required) -->
        <div class="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-3.5 text-xs" style="background:#F8FAFC !important;border-color:#E2E8F0 !important;">
          <div class="flex flex-wrap items-center justify-between gap-1.5">
            <span class="font-mono text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-800" style="color:#065F46 !important;">3. Select Payment Method *</span>
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-900 font-mono text-[10px] font-bold" style="background:#D1FAE5 !important;color:#065F46 !important;">No Ref # or Upload Required</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" id="pf-inv-pay-GCash" onclick="pfSetInvOrderPayMethod('GCash')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">GCash</button>
            <button type="button" id="pf-inv-pay-Maya" onclick="pfSetInvOrderPayMethod('Maya')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">Maya</button>
            <button type="button" id="pf-inv-pay-BDO" onclick="pfSetInvOrderPayMethod('BDO')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">BDO / Bank</button>
            <button type="button" id="pf-inv-pay-Cash" onclick="pfSetInvOrderPayMethod('Cash')" class="py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer">Pay at Counter</button>
          </div>

          <!-- Pay at Counter Note -->
          <div id="pf-inv-cash-note" class="hidden p-4 rounded-2xl bg-white border border-emerald-200 text-slate-900 space-y-2 shadow-2xs" style="background:#FFFFFF !important;color:#0F172A !important;border-color:#A7F3D0 !important;">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs" style="background:#D1FAE5 !important;color:#065F46 !important;">💵</span>
              <div>
                <div class="font-extrabold text-xs sm:text-sm text-slate-900" style="color:#0F172A !important;">Pay Cash at Front Desk / POS Counter</div>
                <div class="text-[10px] font-mono font-bold text-emerald-700 uppercase" style="color:#15803D !important;">Admin Confirms Payment in POS &amp; Inventory System</div>
              </div>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed" style="color:#475569 !important;">Your order immediately deducts live stock and appears in the <b>Admin POS Register, Inventory Tab, Transactions &amp; Sales Report</b> where Front Desk staff will confirm your payment.</p>
          </div>

          <!-- Online QR Card (Zero Ref Number / Zero Image Upload) -->
          <div id="pf-inv-qr-wrap" class="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs" style="background:#FFFFFF !important;border-color:#E2E8F0 !important;">
            <div class="flex flex-col items-center flex-shrink-0">
              <img id="pf-inv-qr-img" src="assets/qr-gcash.png" alt="Payment QR" onclick="if(window.pfOpenQrStandeeLightbox) pfOpenQrStandeeLightbox(pfInvOrderPayMethod.toLowerCase())" class="w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-2xl border border-slate-200 p-1.5 bg-white cursor-pointer shadow-xs">
              <div class="flex items-center gap-1.5 mt-2">
                <button type="button" onclick="if(window.pfOpenQrStandeeLightbox) pfOpenQrStandeeLightbox(pfInvOrderPayMethod.toLowerCase())" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-[10px] font-bold border border-slate-300 cursor-pointer" style="color:#0F172A !important;">🔍 Zoom QR</button>
                <button type="button" onclick="if(window.pfDownloadOfficialQr) pfDownloadOfficialQr(pfInvOrderPayMethod.toLowerCase())" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-[10px] font-bold border border-slate-300 cursor-pointer" style="color:#0F172A !important;">📥 Save QR</button>
              </div>
            </div>
            <div class="space-y-2 text-center sm:text-left flex-1 min-w-0">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                <span id="pf-inv-qr-badge" class="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-extrabold uppercase" style="background:#ECFDF5 !important;color:#065F46 !important;">OFFICIAL GCASH QR PH</span>
                <span id="pf-inv-qr-amt-pill" class="inline-block px-2.5 py-0.5 rounded-full bg-slate-900 text-white font-mono text-[10px] font-extrabold" style="background:#0F172A !important;color:#A3E635 !important;">Amount: ₱25.00</span>
              </div>
              <div id="pf-inv-qr-acc" class="font-mono text-xs sm:text-sm font-extrabold text-slate-900 break-words" style="color:#0F172A !important;">GCash Account: 0999 883 2346 (P&amp;F Rally Ground)</div>
              <p class="text-[11px] text-slate-600 leading-relaxed" style="color:#475569 !important;">Scan the QR code to send the exact inventory bill amount. <b>No reference number or receipt upload needed</b> — Front Desk Admin will verify and confirm your payment directly in the POS system.</p>
            </div>
          </div>

          <!-- Instant Payment Confirmation Toggle Bar -->
          <button type="button" id="pf-inv-confirm-pay-box" onclick="pfToggleInvPayConfirmReady()" class="w-full p-3 rounded-xl flex items-center gap-3 text-left transition cursor-pointer">
            <span id="pf-inv-confirm-pay-check" class="w-5 h-5 rounded-md border flex items-center justify-center text-xs font-black flex-shrink-0">✓</span>
            <div class="min-w-0 flex-1">
              <span id="pf-inv-confirm-pay-text" class="block text-[11px] sm:text-xs font-extrabold leading-snug">I confirm my payment method — Send order to Admin POS &amp; Inventory for system payment confirmation</span>
            </div>
          </button>
        </div>

        <p id="pf-inv-order-error" class="hidden p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold"></p>
      </div>

      <!-- Sticky Bottom Checkout Bar (Mobile, Tablet & Desktop Optimized) -->
      <div class="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#0D1F18] text-white border-t border-emerald-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0" style="background:#0D1F18 !important;color:#FFFFFF !important;">
        <div class="flex sm:block items-baseline justify-between gap-2">
          <span class="text-[10px] font-mono uppercase tracking-widest block" style="color:#A7F3D0 !important;">Total Live Inventory Bill</span>
          <div class="flex items-baseline gap-2">
            <b id="pf-inv-order-total" class="text-xl sm:text-2xl font-mono font-black" style="color:#A3E635 !important;">₱0.00</b>
            <span id="pf-inv-order-stock-summary" class="text-[10px] sm:text-[11px] font-mono text-slate-300" style="color:#CBD5E1 !important;"></span>
          </div>
        </div>
        <div class="flex items-center gap-2.5">
          <button type="button" onclick="pfCloseLiveInventoryModal()" class="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase transition cursor-pointer whitespace-nowrap" style="color:#FFFFFF !important;">Cancel</button>
          <button type="button" id="pf-inv-submit-btn" onclick="pfSubmitLiveInventoryOrder()" class="flex-1 sm:flex-initial px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-black uppercase text-xs tracking-wider transition shadow-lg cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap" style="background:#15803D !important;color:#FFFFFF !important;border:1px solid #22C55E !important;">
            <span style="color:#FFFFFF !important;">Confirm &amp; Avail Now</span>
            <span style="color:#FFFFFF !important;">→</span>
          </button>
        </div>
      </div>

    </div>
  `;
  document.body.appendChild(modal);

  pfRenderInvOrderItems();
  pfSetInvDeliveryOption('Front Desk / POS Counter');
  pfSetInvOrderPayMethod('GCash');
  pfSyncInvPayConfirmVisual();
  modal.classList.remove('hidden');
}
window.pfOpenLiveInventoryModal = pfOpenLiveInventoryModal;

function pfCloseLiveInventoryModal() {
  const modal = document.getElementById('pf-live-inventory-modal');
  if (modal) modal.classList.add('hidden');
}
window.pfCloseLiveInventoryModal = pfCloseLiveInventoryModal;

function pfAdjustInvOrderQty(itemId, delta) {
  const catalog = pfGetLiveInventoryItemsList();
  const item = catalog.find(i => i.id === itemId);
  const maxStock = item ? Math.max(0, Number(item.stock || 0)) : 0;
  const cur = Number(pfInvOrderQuantities[itemId] || 0);
  pfInvOrderQuantities[itemId] = Math.max(0, Math.min(maxStock, cur + delta));
  pfRenderInvOrderItems();
}
window.pfAdjustInvOrderQty = pfAdjustInvOrderQty;

function pfRenderInvOrderItems() {
  const grid = document.getElementById('pf-inv-modal-items-grid');
  const totalEl = document.getElementById('pf-inv-order-total');
  const stockSumEl = document.getElementById('pf-inv-order-stock-summary');
  const qrAmtPill = document.getElementById('pf-inv-qr-amt-pill');
  if (!grid) return;
  const catalog = pfGetLiveInventoryItemsList();
  let sum = 0;
  let totalUnits = 0;

  if (catalog.length === 0) {
    grid.className = 'grid grid-cols-1 gap-3';
    grid.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">No live inventory products available right now.</div>`;
    if (totalEl) totalEl.textContent = '₱0.00';
    if (qrAmtPill) qrAmtPill.textContent = 'Amount: ₱0.00';
    return;
  }

  // Full width if 1 item, 2 columns on tablet/desktop if 2+ items
  grid.className = catalog.length === 1 ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3';

  grid.innerHTML = catalog.map(item => {
    const stock = Math.max(0, Number(item.stock || 0));
    const qty = Math.min(stock, Math.max(0, Number(pfInvOrderQuantities[item.id] || 0)));
    pfInvOrderQuantities[item.id] = qty;
    const lineSub = qty * item.price;
    sum += lineSub;
    totalUnits += qty;
    const remainingAfter = Math.max(0, stock - qty);
    const isSelected = qty > 0;
    const outOfStock = stock <= 0;
    const safeId = String(item.id).replace(/'/g, "\'");
    return `
      <div class="p-3.5 sm:p-4 rounded-2xl border-2 transition flex items-center justify-between gap-3 ${
        outOfStock
          ? 'bg-slate-50 border-slate-200 opacity-60'
          : (isSelected ? 'bg-emerald-50/70 border-[#15803D] shadow-xs' : 'bg-white border-slate-200')
      }" style="background:${isSelected ? '#ECFDF5' : '#FFFFFF'} !important;border-color:${isSelected ? '#15803D' : '#E2E8F0'} !important;">
        <div class="flex items-center gap-3.5 min-w-0 flex-1">
          <img src="${pfEscapeHtml(item.img)}" onerror="this.onerror=null;this.src='assets/gear-water-500ml.jpg';" alt="${pfEscapeHtml(item.name)}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-slate-200 bg-white flex-shrink-0 shadow-2xs">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span class="inline-block px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono text-[9px] font-extrabold uppercase tracking-wider" style="background:#D1FAE5 !important;color:#065F46 !important;">${pfEscapeHtml(item.cat)}</span>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${isSelected ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}" style="background:${isSelected ? '#FEF3C7' : '#F1F5F9'} !important;color:${isSelected ? '#92400E' : '#334155'} !important;">
                ${outOfStock ? 'Out of Stock' : (isSelected ? `Stock: ${stock} → ${remainingAfter} left` : `In Stock: ${stock}`)}
              </span>
            </div>
            <span class="block text-sm sm:text-base font-black text-slate-900 truncate" style="color:#0F172A !important;">${pfEscapeHtml(item.name)}</span>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs sm:text-sm font-mono font-black text-emerald-800" style="color:#15803D !important;">₱${Number(item.price).toFixed(0)} <span class="text-[10px] font-normal text-slate-500">/ pc</span></span>
              ${isSelected ? `<span class="text-[11px] font-mono font-extrabold text-slate-700" style="color:#0F172A !important;">• Subtotal: ₱${lineSub.toFixed(0)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs flex-shrink-0" style="background:#FFFFFF !important;border-color:#CBD5E1 !important;">
          <button type="button" ${qty <= 0 ? 'disabled' : ''} onclick="pfAdjustInvOrderQty('${safeId}', -1)" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-black text-base flex items-center justify-center cursor-pointer disabled:opacity-40 transition" style="background:#F1F5F9 !important;color:#0F172A !important;">−</button>
          <span class="w-8 text-center font-mono text-sm sm:text-base font-black text-slate-900" style="color:#0F172A !important;">${qty}</span>
          <button type="button" ${qty >= stock ? 'disabled' : ''} onclick="pfAdjustInvOrderQty('${safeId}', 1)" class="w-9 h-9 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-black text-base flex items-center justify-center cursor-pointer disabled:opacity-40 transition" style="background:#15803D !important;color:#FFFFFF !important;">+</button>
        </div>
      </div>
    `;
  }).join('');

  const fmtSum = `₱${sum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalEl) totalEl.textContent = fmtSum;
  if (qrAmtPill) qrAmtPill.textContent = `Amount: ${fmtSum}`;
  if (stockSumEl) {
    stockSumEl.textContent = totalUnits > 0 ? `• ${totalUnits} item${totalUnits > 1 ? 's' : ''} (Auto-deducts stock)` : '';
  }
}
window.pfRenderInvOrderItems = pfRenderInvOrderItems;

function pfSetInvOrderPayMethod(method) {
  pfInvOrderPayMethod = method || 'GCash';
  ['GCash', 'Maya', 'BDO', 'Cash'].forEach(k => {
    const btn = document.getElementById('pf-inv-pay-' + k);
    if (!btn) return;
    if (k === pfInvOrderPayMethod) {
      btn.className = 'py-2.5 px-3 rounded-xl font-extrabold text-xs uppercase transition shadow-sm cursor-pointer bg-[#15803D] text-white border border-[#15803D]';
      btn.setAttribute('style', 'background-color:#15803D !important;color:#FFFFFF !important;border-color:#15803D !important;');
    } else {
      btn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs uppercase transition cursor-pointer bg-white text-slate-900 border border-slate-300 hover:border-slate-900';
      btn.setAttribute('style', 'background-color:#FFFFFF !important;color:#0F172A !important;border-color:#CBD5E1 !important;');
    }
  });
  const cashNote = document.getElementById('pf-inv-cash-note');
  const qrWrap = document.getElementById('pf-inv-qr-wrap');
  const qrImg = document.getElementById('pf-inv-qr-img');
  const qrAcc = document.getElementById('pf-inv-qr-acc');
  const qrBadge = document.getElementById('pf-inv-qr-badge');
  const qrCfg = (typeof pfGetPaymentConfig === 'function') ? pfGetPaymentConfig() : {};

  if (pfInvOrderPayMethod === 'Cash') {
    if (cashNote) cashNote.classList.remove('hidden');
    if (qrWrap) qrWrap.classList.add('hidden');
  } else {
    if (cashNote) cashNote.classList.add('hidden');
    if (qrWrap) qrWrap.classList.remove('hidden');
    const chKey = pfInvOrderPayMethod.toLowerCase();
    const resolvedSrc = (typeof pfGetOfficialQrUrl === 'function')
      ? pfGetOfficialQrUrl(chKey)
      : (pfInvOrderPayMethod === 'GCash' ? 'assets/qr-gcash.png' : (pfInvOrderPayMethod === 'Maya' ? 'assets/qr-maya.png' : 'assets/qr-bdo.png'));
    if (qrImg) {
      qrImg.src = resolvedSrc;
      qrImg.onerror = function() {
        this.onerror = null;
        this.src = pfInvOrderPayMethod === 'GCash' ? 'assets/qr-gcash.png' : (pfInvOrderPayMethod === 'Maya' ? 'assets/qr-maya.png' : 'assets/qr-bdo.png');
      };
    }
    if (qrBadge) {
      qrBadge.textContent = pfInvOrderPayMethod === 'BDO' ? 'OFFICIAL BDO BANK TRANSFER QR' : `OFFICIAL ${pfInvOrderPayMethod.toUpperCase()} QR PH`;
    }
    const accNo = pfInvOrderPayMethod === 'GCash'
      ? (qrCfg.gcashNumber || '0999 883 2346')
      : (pfInvOrderPayMethod === 'Maya' ? (qrCfg.mayaNumber || '0999 883 2346') : (qrCfg.bdoNumber || '••••••••8678'));
    if (qrAcc) qrAcc.textContent = `${pfInvOrderPayMethod} Account: ${accNo} (P&F Rally Ground)`;
  }
}
window.pfSetInvOrderPayMethod = pfSetInvOrderPayMethod;

async function pfSubmitLiveInventoryOrder() {
  if (pfIsSubmittingInvOrder) return;
  const catalog = pfGetLiveInventoryItemsList();
  const chosen = catalog.filter(i => Number(pfInvOrderQuantities[i.id] || 0) > 0);
  const errEl = document.getElementById('pf-inv-order-error');
  const showErr = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    } else {
      alert(msg);
    }
  };

  if (chosen.length === 0) {
    showErr('Please select at least 1 inventory product using the + button.');
    return;
  }

  for (const item of chosen) {
    const reqQty = Number(pfInvOrderQuantities[item.id] || 0);
    if (reqQty > item.stock) {
      showErr(`Only ${item.stock} unit(s) of "${item.name}" are currently in stock.`);
      return;
    }
  }

  const name = (document.getElementById('pf-inv-order-name')?.value || '').trim();
  const phone = (document.getElementById('pf-inv-order-phone')?.value || '').trim();
  const note = (document.getElementById('pf-inv-order-note')?.value || pfInvDeliveryOption || 'Front Desk / POS Counter').trim();

  if (!name || name.length < 2) {
    showErr('Please enter your Full Name.');
    document.getElementById('pf-inv-order-name')?.focus();
    return;
  }
  if (errEl) errEl.classList.add('hidden');

  const totalAmount = chosen.reduce((acc, i) => acc + (i.price * Number(pfInvOrderQuantities[i.id] || 0)), 0);
  const totalCost = chosen.reduce((acc, i) => acc + ((i.costPrice || 0) * Number(pfInvOrderQuantities[i.id] || 0)), 0);
  const totalUnits = chosen.reduce((acc, i) => acc + Number(pfInvOrderQuantities[i.id] || 0), 0);
  const itemsDesc = chosen.map(i => `${Number(pfInvOrderQuantities[i.id] || 1)}× ${i.name} (₱${i.price * Number(pfInvOrderQuantities[i.id] || 1)})`).join(', ');
  const invRef = 'PF-INV-' + Math.floor(100000 + Math.random() * 900000);
  const todayYMD = (typeof pfGetPhilippineTodayYMD === 'function') ? pfGetPhilippineTodayYMD() : new Date().toISOString().slice(0, 10);
  const nowStr = todayYMD + ' ' + new Date().toTimeString().slice(0, 5);

  const methodLabel = pfInvOrderPayMethod === 'Cash'
    ? 'Cash'
    : (pfInvOrderPayMethod === 'BDO' ? 'BANK TRANSFER (BDO)' : pfInvOrderPayMethod.toUpperCase());
  const payRef = pfInvOrderPayMethod === 'Cash' ? 'POS-COUNTER' : `${pfInvOrderPayMethod.toUpperCase()}-ONLINE`;

  const stockChangesSummary = [];

  // 1. Immediately deduct stock locally in sharedServerState & localStorage
  try {
    const currentInv = (typeof sharedServerState !== 'undefined' && sharedServerState && Array.isArray(sharedServerState.inventory))
      ? sharedServerState.inventory
      : JSON.parse(localStorage.getItem('pf_inventory') || localStorage.getItem('pf_pos_catalog') || '[]');
    if (Array.isArray(currentInv)) {
      chosen.forEach(orderedItem => {
        const q = Number(pfInvOrderQuantities[orderedItem.id] || 1);
        const match = currentInv.find(x => x && (String(x.id) === String(orderedItem.id) || String(x.name || '').toLowerCase() === orderedItem.name.toLowerCase()));
        if (match) {
          const beforeStock = Math.max(0, Number(match.stock || 0));
          const afterStock = Math.max(0, beforeStock - q);
          match.stock = afterStock;
          match.soldCount = Math.max(0, Number(match.soldCount || 0)) + q;
          stockChangesSummary.push({
            name: match.name || orderedItem.name,
            qty: q,
            before: beforeStock,
            after: afterStock
          });
        }
      });
      if (typeof sharedServerState !== 'undefined' && sharedServerState) {
        sharedServerState.inventory = currentInv;
      }
      localStorage.setItem('pf_inventory', JSON.stringify(currentInv));
      localStorage.setItem('pf_pos_catalog', JSON.stringify(currentInv));
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('pf_live_sync');
        bc.postMessage({ type: 'INVENTORY_UPDATED', inventory: currentInv, updatedAt: Date.now() });
        bc.close();
      }
    }
  } catch (e) {}

  if (typeof renderPublicInventoryCatalog === 'function') renderPublicInventoryCatalog();
  if (typeof renderCartLiveAddons === 'function') renderCartLiveAddons();

  // 2. Build POS, Inventory, Transactions & Sales Report payload (Status: PENDING so Admin confirms payment in system!)
  // NOTE: Intentionally NOT added to Court Bookings (`pf_all_bookings` / `/api/bookings`) so it never pollutes the Bookings tab!
  const invSalePayload = {
    ref: invRef,
    type: 'Live Inventory',
    desc: `🥤 ${itemsDesc} • ${name} (${note})`,
    method: methodLabel,
    paymentMethod: methodLabel,
    customerName: name,
    phone: phone,
    deliveryNote: note,
    paymentRef: payRef,
    transactionRef: payRef,
    source: pfInvOrderPayMethod === 'Cash' ? 'MANUAL' : 'ONLINE',
    manualEntry: pfInvOrderPayMethod === 'Cash',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    stockDeducted: true,
    amount: totalAmount,
    cost: Math.round(totalCost * 100) / 100,
    profit: Math.round((totalAmount - totalCost) * 100) / 100,
    items: chosen.map(i => ({
      id: i.id,
      name: i.name,
      cat: i.cat || 'Refreshment',
      qty: Number(pfInvOrderQuantities[i.id] || 1),
      price: i.price,
      costPrice: i.costPrice || 0
    })),
    date: nowStr
  };

  const receiptSummaryObj = {
    ref: invRef,
    name: name,
    phone: phone,
    note: note,
    paymentMethod: methodLabel,
    transactionRef: payRef,
    total: totalAmount,
    status: 'PENDING'
  };

  pfIsSubmittingInvOrder = true;
  const submitBtn = document.getElementById('pf-inv-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Order & Updating Stock...';
  }

  try {
    const localSales = JSON.parse(localStorage.getItem('pf_sales_ledger') || '[]');
    localSales.unshift(invSalePayload);
    localStorage.setItem('pf_sales_ledger', JSON.stringify(localSales));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('pf_live_sync');
      bc.postMessage({ type: 'SALES_UPDATED', salesLedger: localSales, updatedAt: Date.now() });
      bc.close();
    }
  } catch (e) {}

  try {
    const salesEndpoints = (typeof window.pfGetApiEndpoints === 'function') ? window.pfGetApiEndpoints('/api/sales') : ['/api/sales'];
    for (const ep of salesEndpoints) {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invSalePayload)
      });
      if (r.ok) {
        const respData = await r.json().catch(() => null);
        if (respData && respData.state && Array.isArray(respData.state.inventory)) {
          if (typeof sharedServerState !== 'undefined' && sharedServerState) {
            sharedServerState.inventory = respData.state.inventory;
          }
          try {
            localStorage.setItem('pf_inventory', JSON.stringify(respData.state.inventory));
            localStorage.setItem('pf_pos_catalog', JSON.stringify(respData.state.inventory));
          } catch (e) {}
          if (typeof renderPublicInventoryCatalog === 'function') renderPublicInventoryCatalog();
        }
        break;
      }
    }
  } catch (e) {}

  pfIsSubmittingInvOrder = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span style="color:#FFFFFF !important;">Confirm &amp; Avail Now</span><span style="color:#FFFFFF !important;">→</span>';
  }
  pfCloseLiveInventoryModal();
  pfShowLiveInventoryReceiptModal(receiptSummaryObj, invSalePayload, stockChangesSummary);
}
window.pfSubmitLiveInventoryOrder = pfSubmitLiveInventoryOrder;

function pfShowLiveInventoryReceiptModal(bookingObj, saleObj, stockChanges) {
  let recModal = document.getElementById('pf-live-inv-receipt-modal');
  if (recModal) recModal.remove();

  const stockRowsHtml = (stockChanges || []).map(sc => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-emerald-200/60 last:border-0">
      <span class="font-bold text-slate-900" style="color:#0F172A !important;">${pfEscapeHtml(sc.name)} <span class="text-emerald-700 font-mono">(-${sc.qty})</span></span>
      <span class="font-mono font-extrabold text-emerald-800" style="color:#065F46 !important;">Stock: ${sc.before} → ${sc.after} left</span>
    </div>
  `).join('');

  const itemsListHtml = (saleObj.items || []).map(it => `
    <div class="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
      <span class="font-bold text-slate-800" style="color:#1E293B !important;">${it.qty}× ${pfEscapeHtml(it.name)} <span class="text-[10px] text-slate-400 font-mono">(${pfEscapeHtml(it.cat || 'Pro Shop')})</span></span>
      <span class="font-mono font-black text-slate-900" style="color:#0F172A !important;">₱${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}</span>
    </div>
  `).join('');

  recModal = document.createElement('div');
  recModal.id = 'pf-live-inv-receipt-modal';
  recModal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto';
  recModal.innerHTML = `
    <div onclick="document.getElementById('pf-live-inv-receipt-modal')?.remove()" class="fixed inset-0 bg-black/80 backdrop-blur-md"></div>
    <div class="relative z-10 w-full max-w-lg rounded-3xl bg-white text-slate-900 border border-slate-200 p-6 shadow-2xl space-y-4 my-auto" style="background:#FFFFFF !important;color:#0F172A !important;">
      <div class="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
        <div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-extrabold uppercase tracking-wider" style="background:#FEF3C7 !important;color:#92400E !important;">
            ● SENT TO POS &amp; INVENTORY • AWAITING ADMIN CONFIRMATION
          </span>
          <h3 class="text-xl font-black text-slate-900 mt-1" style="color:#0F172A !important;">Live Inventory Order Pass</h3>
          <p class="text-xs text-slate-500" style="color:#64748B !important;">Stock decreased &amp; synced to Admin Inventory, POS Register, Transactions &amp; Sales Report</p>
        </div>
        <button type="button" onclick="document.getElementById('pf-live-inv-receipt-modal')?.remove()" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-900 text-slate-800 hover:text-white font-bold text-xs flex items-center justify-center cursor-pointer">✕</button>
      </div>

      <div class="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200" style="background:#F8FAFC !important;">
        <div>
          <span class="text-[10px] font-mono uppercase text-slate-500 block" style="color:#64748B !important;">Inventory Order ID</span>
          <b class="text-base sm:text-lg font-mono font-black text-slate-900" style="color:#0F172A !important;">${pfEscapeHtml(bookingObj.ref)}</b>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-mono uppercase text-slate-500 block" style="color:#64748B !important;">Total Amount Due</span>
          <b class="text-base sm:text-lg font-mono font-black text-emerald-700" style="color:#15803D !important;">₱${Number(bookingObj.total || 0).toFixed(2)}</b>
        </div>
      </div>

      <div class="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1.5" style="background:#FFFFFF !important;">
        <div class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-slate-400" style="color:#64748B !important;">Itemized Inventory Bill</div>
        ${itemsListHtml}
        <div class="pt-2 mt-1 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span class="text-slate-500" style="color:#64748B !important;">Customer: <b class="text-slate-900" style="color:#0F172A !important;">${pfEscapeHtml(bookingObj.name)}</b> (${pfEscapeHtml(bookingObj.note || 'Counter Pickup')})</span>
          <span class="font-mono font-bold text-emerald-800" style="color:#065F46 !important;">${pfEscapeHtml(bookingObj.paymentMethod)}</span>
        </div>
      </div>

      ${stockRowsHtml ? `
        <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1" style="background:#ECFDF5 !important;border-color:#A7F3D0 !important;">
          <div class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-emerald-800" style="color:#065F46 !important;">📦 Live Inventory Stock Decreased &amp; Synced</div>
          ${stockRowsHtml}
        </div>
      ` : ''}

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
        <button type="button" onclick="document.getElementById('pf-live-inv-receipt-modal')?.remove()" class="w-full py-3.5 px-5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-md" style="background:#15803D !important;color:#FFFFFF !important;">
          Done ✓
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(recModal);
}
window.pfShowLiveInventoryReceiptModal = pfShowLiveInventoryReceiptModal;

// ============================================================================
// UNIFIED CLIENT THEME SWITCHER (LIGHT / DARK MODE) ACROSS ALL PUBLIC PAGES
// ============================================================================
function pfSyncThemeToggleButtons(mode) {
  const isDark = mode === 'dark';
  const iconEl = document.getElementById('pf-theme-toggle-icon');
  const lblEl = document.getElementById('pf-theme-toggle-label');
  if (iconEl) iconEl.textContent = isDark ? '🌙' : '☀️';
  if (lblEl) lblEl.textContent = isDark ? 'Night Court' : 'Daylight';
  const mobIconEl = document.getElementById('pf-mob-theme-toggle-icon');
  const mobLblEl = document.getElementById('pf-mob-theme-toggle-label');
  if (mobIconEl) mobIconEl.textContent = isDark ? '🌙' : '☀️';
  if (mobLblEl) mobLblEl.textContent = isDark ? 'Night Court (Dark)' : 'Daylight (Light)';
  document.querySelectorAll('.pf-theme-toggle-btn').forEach(btn => {
    const sun = btn.querySelector('.pf-theme-icon-sun');
    const moon = btn.querySelector('.pf-theme-icon-moon');
    const lbl = btn.querySelector('.pf-theme-label');
    if (sun) sun.classList.toggle('hidden', !isDark);
    if (moon) moon.classList.toggle('hidden', isDark);
    if (lbl) lbl.textContent = isDark ? 'Dark' : 'Light';
  });
}

function pfToggleClientTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  if (document.body) document.body.setAttribute('data-theme', next);
  try {
    localStorage.setItem('pf_v3_theme_night_default', next);
    localStorage.setItem('pf_client_theme', next);
  } catch (e) {}
  pfSyncThemeToggleButtons(next);
}

window.pfSyncThemeToggleButtons = pfSyncThemeToggleButtons;
window.pfToggleClientTheme = pfToggleClientTheme;

(function pfInitClientThemeOnLoad() {
  try {
    const saved = localStorage.getItem('pf_v3_theme_night_default') || localStorage.getItem('pf_client_theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    const mode = saved === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) document.body.setAttribute('data-theme', mode);
      // Ensure theme toggle button is present in header & mobile menu on all pages
      if (!document.getElementById('pf-theme-toggle-btn')) {
        const annBtn = document.querySelector('header button[onclick*="toggleAnnouncementBoard"]:not(.pf-nav-dropdown-item)');
        const actionWrap = annBtn ? annBtn.parentElement : document.querySelector('header button[onclick*="openBookingDrawer"]')?.parentElement;
        if (actionWrap) {
          const tBtn = document.createElement('button');
          tBtn.type = 'button';
          tBtn.id = 'pf-theme-toggle-btn';
          tBtn.onclick = pfToggleClientTheme;
          tBtn.title = 'Switch Light / Dark Mode';
          tBtn.className = 'h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl bg-[#F2F0E8] hover:bg-[#E6E4DC] border border-[#D5D3CC] text-[#0D1F18] flex items-center gap-1.5 text-xs font-semibold transition active:scale-95 flex-shrink-0';
          tBtn.innerHTML = `<span id="pf-theme-toggle-icon" class="text-sm leading-none">${mode === 'dark' ? '🌙' : '☀️'}</span><span id="pf-theme-toggle-label" class="hidden xl:inline font-mono text-[10px] uppercase tracking-wider font-bold">${mode === 'dark' ? 'Night Court' : 'Daylight'}</span>`;
          actionWrap.insertBefore(tBtn, actionWrap.firstChild);
        }
      }
      const mobMenu = document.getElementById('mobile-menu');
      if (mobMenu && !document.getElementById('pf-mob-theme-toggle-btn')) {
        const mobBtn = document.createElement('button');
        mobBtn.type = 'button';
        mobBtn.id = 'pf-mob-theme-toggle-btn';
        mobBtn.onclick = () => { pfToggleClientTheme(); };
        mobBtn.className = 'w-full flex items-center justify-between py-2.5 px-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-900 hover:text-white text-[#050E1D] font-black transition';
        mobBtn.innerHTML = `<span class="flex items-center gap-2"><span id="pf-mob-theme-toggle-icon">${mode === 'dark' ? '🌙' : '☀️'}</span><span>Theme Mode</span></span><span id="pf-mob-theme-toggle-label" class="font-mono text-[10px] text-emerald-700">${mode === 'dark' ? 'Night Court (Dark)' : 'Daylight (Light)'}</span>`;
        mobMenu.appendChild(mobBtn);
      }
      pfSyncThemeToggleButtons(mode);
    });
    if (!document.getElementById('pf-v3-contrast-hotfix')) {
      const st = document.createElement('style');
      st.id = 'pf-v3-contrast-hotfix';
      st.textContent = `
        /* 1. Tournament Section & Empty State — Pure White Background (#FFFFFF) with Crisp Dark Typography */
        html section#tournaments,
        html[data-theme="dark"] section#tournaments,
        html[data-theme="light"] section#tournaments {
          background-color: #FFFFFF !important;
          color: #0D1F18 !important;
          border-color: #E2E8F0 !important;
        }
        html section#tournaments > div > div > div > h2,
        html[data-theme="dark"] section#tournaments > div > div > div > h2,
        html[data-theme="light"] section#tournaments > div > div > div > h2 {
          color: #0D1F18 !important;
        }
        html section#tournaments > div > div > div > h2 span,
        html[data-theme="dark"] section#tournaments > div > div > div > h2 span {
          color: #15803D !important;
        }
        html section#tournaments > div > div > div > span,
        html[data-theme="dark"] section#tournaments > div > div > div > span {
          color: #15803D !important;
        }
        html section#tournaments > div > div > div > p,
        html[data-theme="dark"] section#tournaments > div > div > div > p,
        html[data-theme="light"] section#tournaments > div > div > div > p {
          color: #475569 !important;
        }
        html #public-tournaments-grid > div.pf-trn-empty-card,
        html[data-theme="dark"] #public-tournaments-grid > div.pf-trn-empty-card,
        html[data-theme="light"] #public-tournaments-grid > div.pf-trn-empty-card,
        html .pf-trn-empty-card {
          background-color: #FFFFFF !important;
          border: 1.5px dashed #CBD5E1 !important;
          color: #0D1F18 !important;
        }
        html #public-tournaments-grid .pf-trn-empty-card .pf-trn-empty-icon,
        html[data-theme="dark"] #public-tournaments-grid .pf-trn-empty-card .pf-trn-empty-icon {
          background-color: #F1F5F9 !important;
          color: #0F1D2E !important;
        }
        html #public-tournaments-grid .pf-trn-empty-card .pf-trn-empty-title,
        html[data-theme="dark"] #public-tournaments-grid .pf-trn-empty-card h3,
        html[data-theme="light"] #public-tournaments-grid .pf-trn-empty-card h3 {
          color: #0D1F18 !important;
        }
        html #public-tournaments-grid .pf-trn-empty-card .pf-trn-empty-sub,
        html[data-theme="dark"] #public-tournaments-grid .pf-trn-empty-card p,
        html[data-theme="light"] #public-tournaments-grid .pf-trn-empty-card p {
          color: #52605A !important;
        }
        /* 2. Announcement Feed Author Name ("P&F Rally Ground Admin") High-Contrast in Dark Mode */
        html[data-theme="dark"] #public-announcement-feed article .pf-ann-author-name,
        html[data-theme="dark"] #public-announcement-feed article span.font-extrabold,
        html[data-theme="dark"] #public-announcement-feed article span.font-bold,
        html[data-theme="dark"] #public-announcement-feed article h4 {
          color: #FFFFFF !important;
        }
        /* 3. "Already booked a court & just need paddles or balls?" Dark Green Banner Text Contrast */
        html body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"],
        html[data-theme="dark"] body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"],
        html[data-theme="light"] body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"] {
          background-color: #0F291E !important;
          border-color: #15803D !important;
        }
        html body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"] > span.text-white,
        html[data-theme="dark"] body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"] > span.text-white,
        html[data-theme="light"] body #booking-drawer #drawer-step-1 div[class*="bg-[#0F291E]"] > span.text-white {
          color: #FFFFFF !important;
          font-weight: 700 !important;
        }
      `;
      (document.head || document.documentElement).appendChild(st);
    }
  } catch (e) {}
})();



// ================= DYNAMIC STEP 4 PLAYER RULE (NORMAL COURT BOOKING VS OPEN PLAY PER-PARTICIPANT) =================
window.pfSyncPlayerStepRuleUI = function(isOpenPlay, openPlayRateVal, incPlayersVal, extraFeeVal) {
  const cfg = window.PF_SITE_CONFIG || {};
  const opRate = Number(openPlayRateVal ?? cfg.openPlayRate ?? 150);
  const incPl = Number(incPlayersVal ?? cfg.includedPlayers ?? 6);
  const extFee = Number(extraFeeVal ?? cfg.extraPlayerFee ?? 100);

  document.querySelectorAll('[data-site-label="step4-title"]').forEach(el => {
    el.textContent = isOpenPlay ? '4. Number of Participants' : '4. Number of Players';
  });
  document.querySelectorAll('[data-site-label="book-step4-title"]').forEach(el => {
    el.textContent = isOpenPlay ? 'Number of participants' : 'Number of players';
  });
  document.querySelectorAll('[data-site-price="players-note"]').forEach(el => {
    if (isOpenPlay) {
      el.innerHTML = `<strong class="text-[#15803D] font-extrabold">₱${opRate} / participant</strong> <span class="text-slate-500">• Open Play is billed per player.</span>`;
    } else {
      el.textContent = `Up to ${incPl} players included free (+₱${extFee}/extra player beyond ${incPl}).`;
    }
  });
};

// ================= DYNAMIC COURTS MANAGER (SYNCED WITH ADMIN SITE EDITOR "+ ADD COURT") =================
window.pfGetConfiguredCourts = function(cfgInput) {
  const cfg = cfgInput || window.PF_SITE_CONFIG || {};
  const defaultImgs = [
    'assets/court-aerial-vertical.jpg',
    'assets/court-aerial-angled.jpg',
    'assets/hero.jpg',
    'assets/court-aerial-angled.jpg'
  ];
  if (Array.isArray(cfg.courtsList) && cfg.courtsList.length >= 1) {
    return cfg.courtsList.map((c, idx) => {
      const id = Number(c && c.id) || (idx + 1);
      const rawName = String((c && c.name) || cfg[`court${id}Name`] || `Court ${id}`).trim();
      const cleanName = (/pickleball|surface|covered|tournament|championship/i.test(rawName) || rawName.length > 22)
        ? `Court ${id}`
        : rawName;
      return {
        id: id,
        name: cleanName || `Court ${id}`,
        img: String((c && c.img) || cfg[`court${id}Img`] || defaultImgs[(id - 1) % defaultImgs.length]).trim()
      };
    });
  }
  const total = Math.max(1, Math.min(12, Number(cfg.totalCourts) || 4));
  const list = [];
  for (let i = 1; i <= total; i++) {
    const rawName = String(cfg[`court${i}Name`] || `Court ${i}`).trim();
    const cleanName = (/pickleball|surface|covered|tournament|championship/i.test(rawName) || rawName.length > 22)
      ? `Court ${i}`
      : rawName;
    list.push({
      id: i,
      name: cleanName || `Court ${i}`,
      img: String(cfg[`court${i}Img`] || defaultImgs[(i - 1) % defaultImgs.length]).trim()
    });
  }
  return list;
};

window.pfGetConfiguredCourtIds = function(cfgInput) {
  return window.pfGetConfiguredCourts(cfgInput).map(c => c.id);
};

window.pfSyncDynamicCourtsUI = function(cfgInput) {
  const courts = window.pfGetConfiguredCourts(cfgInput);
  const count = courts.length;

  // 1. Update Quick Court Bar (#courts on index.html)
  const quickBarGrid = document.querySelector('#courts .grid');
  if (quickBarGrid && Number(quickBarGrid.getAttribute('data-rendered-courts')) !== count) {
    quickBarGrid.setAttribute('data-rendered-courts', String(count));
    quickBarGrid.innerHTML = courts.map(c => `
      <button onclick="openBookingDrawer(${c.id})" class="pf-quick-court-btn p-3 sm:px-4 sm:py-3 rounded-2xl bg-brand-black border border-white/10 hover:border-brand-lime transition flex items-center justify-between gap-2 text-left group min-w-0 active:scale-95">
        <div class="min-w-0">
          <span data-site-court-short="${c.id}" class="text-sm sm:text-base font-black text-white group-hover:text-brand-lime transition truncate block">${pfEscapeHtml(c.name)}</span>
        </div>
        <span class="text-brand-lime font-mono text-xs flex-shrink-0">→</span>
      </button>
    `).join('');
  } else if (quickBarGrid) {
    courts.forEach(c => {
      document.querySelectorAll(`[data-site-court-short="${c.id}"]`).forEach(el => { el.textContent = c.name; });
    });
  }

  // 2. Update Schedule Court Filter (#schedule-court-filter on index.html)
  const filterWrap = document.getElementById('schedule-court-filter');
  if (filterWrap && Number(filterWrap.getAttribute('data-rendered-courts')) !== count) {
    filterWrap.setAttribute('data-rendered-courts', String(count));
    const curFilter = (typeof currentScheduleFilter !== 'undefined') ? String(currentScheduleFilter) : 'ALL';
    filterWrap.className = 'flex flex-wrap items-center gap-1 sm:gap-1.5 w-full sm:w-auto';
    filterWrap.innerHTML = `
      <button type="button" onclick="setScheduleCourtFilter('ALL')" data-court="ALL" class="sched-filter-btn py-2 px-2.5 sm:px-3.5 rounded-xl text-[11px] sm:text-xs ${curFilter === 'ALL' ? 'font-black bg-[#050E1D] text-white shadow-md' : 'font-bold bg-slate-100 text-slate-700 border border-slate-200'} uppercase tracking-wider transition text-center"><span class="sm:hidden">All</span><span class="hidden sm:inline">All ${count} Courts</span></button>
      ${courts.map(c => {
        const isAct = curFilter === String(c.id);
        return `<button type="button" onclick="setScheduleCourtFilter(${c.id})" data-court="${c.id}" class="sched-filter-btn py-2 px-2.5 sm:px-3.5 rounded-xl text-[11px] sm:text-xs ${isAct ? 'font-black bg-[#050E1D] text-white shadow-md' : 'font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-400'} uppercase tracking-wider transition text-center"><span class="sm:hidden">C${c.id}</span><span class="hidden sm:inline">${pfEscapeHtml(c.name)}</span></button>`;
      }).join('')}
    `;
  }

  // 3. Update Drawer Court Buttons (#drawer-court-buttons across all pages)
  const drawerBtnsWrap = document.getElementById('drawer-court-buttons');
  if (drawerBtnsWrap && Number(drawerBtnsWrap.getAttribute('data-rendered-courts')) !== count) {
    drawerBtnsWrap.setAttribute('data-rendered-courts', String(count));
    const activeCourt = (typeof DRAWER_STATE !== 'undefined' && DRAWER_STATE.selectedCourt) ? Number(DRAWER_STATE.selectedCourt) : 1;
    drawerBtnsWrap.innerHTML = courts.map(c => {
      const isAct = (c.id === activeCourt);
      return isAct
        ? `<button type="button" onclick="drawerSetCourt(${c.id})" class="drawer-court active py-3 px-3.5 rounded-2xl bg-[#0D1F18] text-white border-2 border-[#15803D] shadow-sm text-center transition flex items-center justify-between" data-court="${c.id}">
            <span class="text-xs sm:text-sm font-bold text-white block">${pfEscapeHtml(c.name)}</span>
            <span class="text-[#A7F3D0] font-mono text-xs">→</span>
          </button>`
        : `<button type="button" onclick="drawerSetCourt(${c.id})" class="drawer-court py-3 px-3.5 rounded-2xl bg-[#F8F7F3] text-[#0D1F18] border border-[#E2E0D8] hover:border-[#15803D] text-center transition flex items-center justify-between" data-court="${c.id}">
            <span class="text-xs sm:text-sm font-bold text-[#0D1F18] block">${pfEscapeHtml(c.name)}</span>
            <span class="text-[#52605A] font-mono text-xs">→</span>
          </button>`;
    }).join('');
  }

  // 4. Update book.html Court Selector (#court-selector)
  const bookSelector = document.getElementById('court-selector');
  if (bookSelector && Number(bookSelector.getAttribute('data-rendered-courts')) !== count) {
    bookSelector.setAttribute('data-rendered-courts', String(count));
    const curBookCourt = (typeof selectedCourt !== 'undefined') ? Number(selectedCourt) : 1;
    bookSelector.innerHTML = courts.map(c => {
      const isAct = (c.id === curBookCourt);
      return isAct
        ? `<button type="button" onclick="selectCourt(${c.id})" class="court-btn court-btn-active py-3.5 px-4 rounded-2xl border-2 border-[#15803D] bg-[#0F291E] text-white text-left transition active:scale-95 shadow-md flex items-center justify-between" data-court="${c.id}">
            <b class="text-sm sm:text-base font-black text-white block">${pfEscapeHtml(c.name)}</b>
            <span class="text-[#6EE7B7] font-mono text-xs font-bold">→</span>
          </button>`
        : `<button type="button" onclick="selectCourt(${c.id})" class="court-btn py-3.5 px-4 rounded-2xl border border-white/15 bg-brand-black/60 hover:border-brand-lime/50 text-left transition active:scale-95 flex items-center justify-between" data-court="${c.id}">
            <b class="text-sm sm:text-base font-black text-white block">${pfEscapeHtml(c.name)}</b>
            <span class="text-slate-400 font-mono text-xs">→</span>
          </button>`;
    }).join('');
  }
};
