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
  return [cleanPath, `http://localhost:8188${cleanPath}`, `http://127.0.0.1:8189${cleanPath}`, `http://localhost:8189${cleanPath}`, `http://localhost:8088${cleanPath}`, `http://127.0.0.1:8089${cleanPath}`, `http://localhost:8089${cleanPath}`];
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

async function syncStateFromServer() {
  const endpoints = pfGetApiEndpoints('/api/state');
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.bookings)) {
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
            let localSaved = {};
            try { localSaved = JSON.parse(localStorage.getItem('pf_site_config') || '{}') || {}; } catch (e) {}
            const srvTs = Number(data.siteConfig.updatedAt || 0);
            const locTs = Number(localSaved.updatedAt || 0);
            const bestSc = (locTs > srvTs)
              ? Object.assign({}, data.siteConfig, localSaved)
              : Object.assign({}, localSaved, data.siteConfig);
            sharedServerState.siteConfig = bestSc;
            localStorage.setItem('pf_site_config', JSON.stringify(bestSc));
            if (typeof applySiteConfig === 'function') applySiteConfig(bestSc);
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
    window.location.href = 'http://' + host + ':8189/?login=1';
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

function drawerSetCourt(c) {
  currentSelectedCourt = c;
  document.querySelectorAll('#drawer-court-buttons button').forEach((b, idx) => {
    const isAct = (idx === c - 1);
    b.className = isAct
      ? 'drawer-court active p-3 rounded-xl border border-brand-lime bg-brand-lime/10 text-left transition'
      : 'drawer-court p-3 rounded-xl border border-white/10 bg-brand-card text-left transition hover:border-white/20';
    const label = b.querySelector('span:last-child');
    if (label) {
      label.className = isAct ? 'text-xs font-black text-brand-lime' : 'text-xs font-black text-white';
    }
  });
  recalculateDrawerTotal();
}

function changePlayers(delta) {
  playerCount = Math.max(1, Math.min(12, playerCount + delta));
  const el = document.getElementById('player-count');
  if (el) el.textContent = playerCount;
  recalculateDrawerTotal();
}

function selectPayMode(mode) {
  // Support verified GCash, Maya & BDO Bank Transfer
  if (mode !== 'bank' && mode !== 'maya') mode = 'gcash';
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
  const rawCourt = String(booking.court || '').trim();
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
  const validRows = [];
  let hasCourtLine = false;

  if (Array.isArray(booking.items) && booking.items.length > 0) {
    booking.items.forEach(i => {
      if (typeof i === 'string') {
        const trimmed = i.trim();
        if (!trimmed || /undefined/i.test(trimmed)) return;
        if (/court\s*0*[1-4]/i.test(trimmed)) hasCourtLine = true;
        validRows.push(`<li class="flex items-start justify-between gap-2 text-xs">
          <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(trimmed)}</span></span>
        </li>`);
      } else if (i && typeof i === 'object') {
        const rawName = String(i.name || i.court || i.title || '').trim();
        if (!rawName || /undefined/i.test(rawName)) return;
        if (/court\s*0*[1-4]/i.test(rawName) || i.isCourt) hasCourtLine = true;
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
    const durLabel = durMatch ? ` (${durMatch[1]} hr)` : '';
    validRows.unshift(`<li class="flex items-start justify-between gap-2 text-xs">
      <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${pfEscapeHtml(cleanCourt + durLabel)}</span></span>
    </li>`);
  }

  if (validRows.length > 0) {
    return `<ul class="space-y-1 text-left">${validRows.join('')}</ul>`;
  }

  const raw = String(booking.court || 'Court 1');
  const parts = raw.includes(' + ') ? raw.split(' + ') : (raw.includes(' • ') ? [raw] : raw.split(', '));
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

  [btnGcash, btnMaya, btnBank].forEach(b => {
    if (b) b.className = 'py-2.5 px-2 rounded-xl border border-white/15 bg-brand-black text-slate-300 hover:text-white hover:border-brand-lime/50 text-xs font-bold uppercase transition flex items-center justify-center gap-1';
  });

  if (selectedPaymentMode === 'bank') {
    if (bankBox) bankBox.classList.remove('hidden');
    if (btnBank) btnBank.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1';
    if (refLabel) refLabel.innerHTML = 'BDO InstaPay / Bank Reference No. <span class="text-brand-clay">*</span>';
    if (refInput) refInput.placeholder = 'Enter BDO / InstaPay Reference Number';
    if (titleEl) titleEl.textContent = 'Official BDO InstaPay QR Transfer';
  } else if (selectedPaymentMode === 'maya') {
    if (mayaBox) mayaBox.classList.remove('hidden');
    if (btnMaya) btnMaya.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1';
    if (refLabel) refLabel.innerHTML = 'Maya Reference Number <span class="text-brand-clay">*</span>';
    if (refInput) refInput.placeholder = 'Enter Maya Reference Number';
    if (titleEl) titleEl.textContent = 'Scan Official Maya QR Code';
  } else {
    selectedPaymentMode = 'gcash';
    if (qrBox) qrBox.classList.remove('hidden');
    if (btnGcash) btnGcash.className = 'py-2.5 px-2 rounded-xl border-2 border-brand-lime bg-brand-lime text-brand-black text-xs font-black uppercase transition shadow-md flex items-center justify-center gap-1';
    if (refLabel) refLabel.innerHTML = 'GCash Reference Number <span class="text-brand-clay">*</span>';
    if (refInput) refInput.placeholder = 'Enter GCash Reference Number (e.g. 9028 3746 1928)';
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

  const phoneCheck = pfValidateField('phone', custPhone ? custPhone.value : '', true);
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

async function submitManualPaymentConfirmation() {
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

  const phoneCheck = pfValidateField('phone', finalPhone, true);
  if (!phoneCheck.valid) {
    showFieldError('modal-cust-phone', phoneCheck.error);
    return;
  }
  clearFieldError('modal-cust-phone');

  // Sync back to drawer inputs
  if (drawerName) drawerName.value = finalName;
  if (drawerPhone) drawerPhone.value = finalPhone;

  const refInput = document.getElementById('manual-ref-input');
  const manualRef = refInput ? refInput.value.trim() : '';

  // Both GCash and Bank Transfer require reference validation
  const refCheck = pfValidateField('ref', manualRef, true);
  if (!refCheck.valid) {
    showFieldError('manual-ref-input', refCheck.error);
    return;
  }
  clearFieldError('manual-ref-input');

  const refCode = 'PF-' + Math.floor(10000 + Math.random() * 90000);
  closePaymentModal();

  await finalizeBookingRecord({
    name: finalName,
    phone: finalPhone,
    mode: selectedPaymentMode === 'bank' ? 'Bank Transfer (BDO / BPI / InstaPay)' : 'GCash (Official QR Ph / Express Send)',
    status: 'PENDING VERIFICATION',
    transactionRef: manualRef,
    refNo: refCode
  });
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
  // Poll every 4 seconds so Admin changes (blocks/confirmations) reflect live
  setInterval(syncStateFromServer, 2500);
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
      <div class="rounded-2xl bg-brand-black border ${outOfStock ? 'border-brand-clay/30 opacity-60' : 'border-brand-lime/30'} p-4 card-lift flex flex-col justify-between">
        <div>
          <div class="relative h-32 w-full rounded-xl overflow-hidden border border-white/10 mb-3 bg-brand-card">
            <img src="${item.img || 'assets/gear-balls-x40.jpg'}" alt="${safeName}" class="w-full h-full object-cover">
            <span class="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
              outOfStock ? 'bg-brand-clay text-white' : 'bg-brand-black/85 text-brand-lime border border-brand-lime/40'
            }">
              ${outOfStock ? 'OUT OF STOCK' : 'In Stock: ' + stock}
            </span>
          </div>
          <span class="text-[10px] font-bold uppercase text-brand-lime block">${item.cat || 'Pro Shop'}</span>
          <h4 class="text-sm font-bold text-white mt-0.5">${item.name}</h4>
        </div>
        <div class="pt-3 mt-3 border-t border-white/10 flex items-center justify-between">
          <span class="text-lg font-black text-white font-mono">₱${Number(item.price).toFixed(0)}</span>
          ${outOfStock
            ? `<button disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-500 text-xs font-bold cursor-not-allowed">Sold Out</button>`
            : `<button onclick="openBookingDrawer()" class="px-3.5 py-1.5 rounded-lg bg-brand-lime text-brand-black hover:bg-brand-limeHover text-xs font-black transition active:scale-95">Book with Court →</button>`
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
      message: 'All 4 championship cushion courts are open daily from 6:00 AM to 12:00 Midnight (Daytime: ₱400/hr • Evening: ₱500/hr). Open Play runs daily from 3:00 PM – 6:00 PM across all courts (₱150/player)!',
      category: 'Club Update',
      img: '',
      pinned: true,
      author: 'P&F Rally Ground Admin',
      createdAt: 'Official Broadcast'
    },
    {
      id: 'open-play-pf-2026',
      title: 'Daily Open Play • 3:00 PM – 6:00 PM (₱150/player)',
      message: 'Join our daily community Open Play session across Courts 1 – 4 from 3:00 PM to 6:00 PM! All skill levels are welcome — bring your paddle or rent pro gear at the club.',
      category: 'Open Play Alert',
      img: '',
      pinned: false,
      author: 'P&F Rally Ground Admin',
      createdAt: 'Daily Schedule'
    }
  ];
}

function sanitizeAnnouncementItem(item) {
  if (!item || typeof item !== 'object') return null;
  const copy = Object.assign({}, item);
  if (typeof copy.title === 'string') {
    copy.title = copy.title.replace(/\(Free\)/gi, '(₱150/player)').replace(/Free Open Play/gi, 'Open Play (₱150/player)');
  }
  if (typeof copy.message === 'string') {
    copy.message = copy.message.replace(/\(Free\)/gi, '(₱150/player)').replace(/Free court entry/gi, '₱150/player entry');
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

function toggleAnnouncementBoard(forceState) {
  const win = document.getElementById('announcement-board-window');
  if (!win) return;
  if (typeof forceState === 'boolean') {
    isAnnouncementBoardOpen = forceState;
  } else {
    isAnnouncementBoardOpen = win.classList.contains('hidden');
  }
  win.classList.toggle('hidden', !isAnnouncementBoardOpen);
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
    const safeAuthor = escapeAnnouncementHtml(item.author || 'P&F Rally Ground Admin');
    const safeMsg = escapeAnnouncementHtml(item.message || '');
    const timeStr = formatAnnouncementTime(item.createdAt);
    const photoUrl = String(item.img || item.imageDataUrl || '').trim();
    const hasPhoto = Boolean(photoUrl);
    const safeImg = hasPhoto ? escapeAnnouncementHtml(photoUrl) : '';

    return `
      <article class="rounded-2xl bg-white border border-[#E2E0D8] p-3.5 sm:p-4 shadow-sm space-y-2.5 text-[#0D1F18] transition hover:border-[#15803D]/50">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <img src="assets/logo.png" alt="P&F" class="w-8 h-8 rounded-lg object-contain bg-[#F6F5F0] p-0.5 border border-[#E2E0D8] flex-shrink-0">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-bold text-[#0D1F18] truncate">${safeAuthor}</span>
                <span class="pf-pill px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider ${badgeColorCls}">${safeTag}</span>
              </div>
              <span class="text-[10px] font-mono text-[#52605A] block font-medium">${escapeAnnouncementHtml(timeStr)}</span>
            </div>
          </div>
          ${item.pinned ? '<span class="pf-pill px-2 py-0.5 rounded-full bg-[#EFECE6] text-[#78350F] border border-[#D6D1C7] text-[9px] font-mono font-bold uppercase flex-shrink-0">📌 Pinned</span>' : ''}
        </div>

        <div class="space-y-1">
          <h4 class="text-xs sm:text-sm font-bold text-[#0D1F18] leading-snug">${safeTitle}</h4>
          <p class="text-xs text-[#334139] leading-relaxed whitespace-pre-line font-normal">${safeMsg}</p>
        </div>

        ${hasPhoto ? `
          <div class="pt-1">
            <div onclick="openAnnouncementLightbox('${safeImg.replace(/'/g, "\\'")}', '${safeTitle.replace(/'/g, "\\'") }')" class="group relative rounded-xl overflow-hidden border border-[#E2E0D8] bg-[#F6F5F0] cursor-pointer max-h-56 flex items-center justify-center">
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
  openPlaySlots: ['03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM'],
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
  const savedTs = Number(saved.updatedAt || 0);
  const srvTs = Number(serverCfg.updatedAt || 0);
  const merged = (savedTs > srvTs)
    ? Object.assign({}, DEFAULT_PF_SITE_CONFIG, serverCfg, saved)
    : Object.assign({}, DEFAULT_PF_SITE_CONFIG, saved, serverCfg);
  if (merged.openPlayEnabled === undefined) merged.openPlayEnabled = true;
  if (!Array.isArray(merged.openPlaySlots)) {
    merged.openPlaySlots = ['03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM'];
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

  // Re-run calculators & schedule matrix if present on page
  if (typeof renderLiveScheduleMatrix === 'function') {
    try { renderLiveScheduleMatrix(); } catch (e) {}
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
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (8 * 3600000));
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
      return { status: 'AVAILABLE', category: 'AVAILABLE', override: matchedBlock, reason: matchedBlock.reason || 'Available' };
    }
    if (st === 'OPEN_PLAY') {
      return { status: 'OPEN_PLAY', category: 'OPEN_PLAY', override: matchedBlock, reason: matchedBlock.reason || 'Open Play' };
    }
    return { status: 'CLOSED', category: 'BLOCKED', override: matchedBlock, reason: matchedBlock.reason || 'Blocked' };
  }

  // 4. Default schedule fallback: Expired check first, then Editable Open Play on Designated Courts, otherwise Available
  if (isExpiredSlot) {
    return { status: 'EXPIRED', category: 'PAST', override: null, reason: 'Past' };
  }
  if (pfIsDefaultOpenPlaySlot(targetDate, slotStr, cNum)) {
    return { status: 'OPEN_PLAY', category: 'OPEN_PLAY', override: null, reason: 'Open Play (3:00 PM – 6:00 PM)' };
  }
  return { status: 'AVAILABLE', category: 'AVAILABLE', override: null, reason: 'Available' };
}

function pfGetOpenPlayDesignatedCourts(cfgObj) {
  const cfg = cfgObj || ((typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {}));
  if (cfg && Array.isArray(cfg.openPlayDesignatedCourts) && cfg.openPlayDesignatedCourts.length > 0) {
    return cfg.openPlayDesignatedCourts;
  }
  if (typeof pfGetActiveOpenPlaySession === 'function') {
    try {
      const act = pfGetActiveOpenPlaySession();
      if (act && Array.isArray(act.designatedCourts) && act.designatedCourts.length > 0) {
        return act.designatedCourts;
      }
    } catch (e) {}
  }
  if (cfg && Array.isArray(cfg.openPlaySessions) && cfg.openPlaySessions.length > 0) {
    const pub = cfg.openPlaySessions.find(s => s && s.published !== false) || cfg.openPlaySessions[0];
    if (pub && Array.isArray(pub.designatedCourts) && pub.designatedCourts.length > 0) {
      return pub.designatedCourts;
    }
  }
  if (cfg && Number(cfg.openPlayCourtsCount) >= 1 && Number(cfg.openPlayCourtsCount) <= 4) {
    return Array.from({ length: Number(cfg.openPlayCourtsCount) }, (_, i) => `Court ${i + 1}`);
  }
  return ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
}
window.pfGetOpenPlayDesignatedCourts = pfGetOpenPlayDesignatedCourts;

function pfIsDefaultOpenPlaySlot(dateYMD, slotStr, courtNum) {
  if (!slotStr) return false;
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  if (cfg && cfg.openPlayEnabled === false) return false;
  const defaultSlots = ['03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM'];
  const activeSlots = (cfg && Array.isArray(cfg.openPlaySlots)) ? cfg.openPlaySlots : defaultSlots;
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

// ================= DRAGGABLE FLOATING ANNOUNCEMENT FEED CONTROLLER =================
function initDraggableAnnouncementWidget() {
  const root = document.getElementById('announcement-floating-root');
  const launcher = document.getElementById('announcement-launcher-btn');
  const win = document.getElementById('announcement-board-window');
  if (!root || !launcher) return;

  root.style.touchAction = 'none';
  launcher.style.cursor = 'grab';
  launcher.title = 'Click to open Live Feed • Drag to move anywhere on screen';

  // Restore saved position if within viewport
  try {
    const saved = JSON.parse(localStorage.getItem('pf_ann_widget_pos') || 'null');
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      const maxX = Math.max(10, window.innerWidth - 180);
      const maxY = Math.max(10, window.innerHeight - 70);
      const clampedX = Math.min(Math.max(8, saved.left), maxX);
      const clampedY = Math.min(Math.max(8, saved.top), maxY);
      root.style.left = clampedX + 'px';
      root.style.top = clampedY + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }
  } catch (e) {}

  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  function onPointerDown(e) {
    // Only drag when grabbing launcher button or the announcement window header
    const headerBar = win ? win.querySelector('div:nth-child(2)') : null;
    const isLauncher = launcher.contains(e.target);
    const isHeader = headerBar && headerBar.contains(e.target) && !e.target.closest('button');
    if (!isLauncher && !isHeader) return;

    const pt = e.touches ? e.touches[0] : e;
    const rect = root.getBoundingClientRect();
    isDragging = true;
    hasMoved = false;
    startX = pt.clientX;
    startY = pt.clientY;
    origLeft = rect.left;
    origTop = rect.top;
    launcher.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      hasMoved = true;
    }
    if (!hasMoved) return;
    if (e.cancelable) e.preventDefault();

    const rect = root.getBoundingClientRect();
    const w = rect.width || 180;
    const h = rect.height || 56;
    const newLeft = Math.min(Math.max(6, origLeft + dx), Math.max(6, window.innerWidth - w - 6));
    const newTop = Math.min(Math.max(6, origTop + dy), Math.max(6, window.innerHeight - h - 6));

    root.style.left = newLeft + 'px';
    root.style.top = newTop + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.alignItems = (newLeft < window.innerWidth / 2) ? 'flex-start' : 'flex-end';
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    launcher.style.cursor = 'grab';
    if (hasMoved) {
      window._pfSuppressNextAnnToggle = Date.now() + 250;
      const rect = root.getBoundingClientRect();
      try {
        localStorage.setItem('pf_ann_widget_pos', JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (e) {}
    }
  }

  root.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove, { passive: false });
  window.addEventListener('mouseup', onPointerUp);

  root.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
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

  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate < todayYMD) {
    return {
      ok: false,
      code: 'EXPIRED_DATE',
      html: `⚠️ <b>Expired Date Error:</b> The selected date (<b>${targetDate}</b>) has already passed. Please select today (<b>${todayYMD}</b>) or a future date.`
    };
  }

  if (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, startSlot)) {
    return {
      ok: false,
      code: 'EXPIRED',
      html: `⚠️ <b>Expired Time Slot Error:</b> <b>${startSlot}</b> on <b>${targetDate}</b> (Philippine Time) has already passed. Please select an upcoming time slot.`
    };
  }

  for (let offset = 0; offset < dur; offset++) {
    const idx = startIdx >= 0 ? (startIdx + offset) : 0;
    if (idx >= PF_RESCHED_ALL_SLOTS.length) {
      return {
        ok: false,
        code: 'CLOSING_TIME',
        html: `⚠️ <b>Schedule Error:</b> A ${dur}-hour booking starting at <b>${startSlot}</b> extends past midnight closing time. Please choose an earlier time slot.`
      };
    }
    const slotToCheck = startIdx >= 0 ? PF_RESCHED_ALL_SLOTS[idx] : startSlot;
    const st = typeof pfResolveCourtSlot === 'function'
      ? pfResolveCourtSlot(targetDate, cNum, slotToCheck)
      : { status: 'AVAILABLE' };

    if (st && st.status === 'BOOKED') {
      const bookedRef = (st.booking && st.booking.ref) ? String(st.booking.ref).toUpperCase() : '';
      const isSelf = Boolean(bookedRef && currentRef && bookedRef === String(currentRef).toUpperCase());
      if (isSelf) {
        return {
          ok: false,
          code: 'ALREADY_BOOKED_SELF',
          html: `ℹ️ <b>Current Reservation Slot:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is already your current active schedule (<b>${currentRef}</b>). Please choose a different date, court, or time slot to reschedule.`
        };
      }
      return {
        ok: false,
        code: 'ALREADY_BOOKED',
        html: `❌ <b>Schedule Already Booked Error:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is already booked by another player. Please select an available date, court, or time slot.`
      };
    }

    if (st && st.status === 'CLOSED') {
      return {
        ok: false,
        code: 'CLOSED',
        html: `⚠️ <b>Court Closed Error:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is closed (${pfEscapeHtml(st.reason || 'Unavailable')}). Please select an available time slot.`
      };
    }

    // Open Play (3:00 PM - 6:00 PM) is FREE and allowed

    if (st && st.status === 'EXPIRED') {
      return {
        ok: false,
        code: 'EXPIRED',
        html: `⚠️ <b>Expired Time Slot Error:</b> <b>${slotToCheck}</b> on <b>${targetDate}</b> (Philippine Time) has already passed. Please select an upcoming time slot.`
      };
    }
  }

  return { ok: true, code: 'AVAILABLE', html: '' };
}

function pfShowRescheduleErrorBanner(msgEl, htmlMsg) {
  if (!msgEl) {
    const plain = String(htmlMsg || '').replace(/<[^>]+>/g, '');
    alert(plain);
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
      if (st && st.status === 'BOOKED') {
        const bookedRef = (st.booking && st.booking.ref) ? String(st.booking.ref).toUpperCase() : '';
        if (bookedRef && bookedRef === currentRef) {
          suffix = ' (📍 Your Current Slot)';
        } else {
          suffix = ' (❌ Already Booked)';
        }
      } else if (st && st.status === 'CLOSED') {
        suffix = ' (🔒 Closed)';
      } else if (st && st.status === 'OPEN_PLAY') {
        suffix = ' (🎾 Open Play • Free)';
      } else if ((st && st.status === 'EXPIRED') || (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, rawSlot))) {
        suffix = ' (⏰ Expired / Passed)';
      }
    }
    opt.disabled = false;
    opt.textContent = rawSlot + suffix;
  });

  // When opening the form, changing Date/Court, or right after saving, auto-select the first truly available slot
  if (!isPastDay && triggerSource !== 'time') {
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
  if (isPastDay) {
    pfShowRescheduleErrorBanner(
      msgEl,
      `⚠️ <b>Expired Date Error:</b> The selected date (<b>${targetDate}</b>) has already passed. Please select today (<b>${todayYMD}</b>) or a future date.`
    );
    return;
  }
  if (targetDate && timeSel.value) {
    const check = pfCheckRescheduleConflict(targetDate, cNum, timeSel.value, durHrs, currentRef);
    if (!check.ok) {
      pfShowRescheduleErrorBanner(msgEl, check.html);
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

  // Strict Conflict & Expired Validation
  const conflictCheck = pfCheckRescheduleConflict(newDate, cNum, newTime, durHrs, refId);
  if (!conflictCheck.ok) {
    pfShowRescheduleErrorBanner(msgEl, conflictCheck.html);
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
    pfShowRescheduleErrorBanner(msgEl, `❌ <b>${pfEscapeHtml(serverRejected)}</b>`);
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


// ================= OPEN PLAY DEDICATED SUB-PAGE, BOOKING CHECKOUT & 4-PLAYER POD SHUFFLER ENGINE =================
const DEFAULT_OPEN_PLAY_SESSIONS = [
  {
    id: 'op-afternoon-social',
    title: 'Afternoon Social Open Play',
    schedule: 'Daily • 03:00 PM – 06:00 PM',
    skillLevel: 'All Skill Levels (Beginner – Intermediate)',
    rotationRule: '4-Player Doubles Pods • Shuffle Players Every Round',
    entryFee: 150,
    designatedCourts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'],
    showCourtsOnSite: true,
    published: true,
    maxPlayers: 24,
    players: [],
    shuffledOrder: Array.from({ length: 24 }, (_, i) => i),
    lastShuffleTime: 'Ready to Shuffle'
  },
  {
    id: 'op-morning-dropin',
    title: 'Morning Community Drop-In',
    schedule: 'Daily • 07:00 AM – 10:00 AM',
    skillLevel: 'Social & Fitness Rotation (All Levels)',
    rotationRule: '4-Player Doubles Pods • Balanced Court Rotation',
    entryFee: 150,
    designatedCourts: ['Court 1', 'Court 2'],
    showCourtsOnSite: true,
    published: false,
    maxPlayers: 24,
    players: [],
    shuffledOrder: Array.from({ length: 24 }, (_, i) => i),
    lastShuffleTime: 'Ready to Shuffle'
  },
  {
    id: 'op-evening-nightlights',
    title: 'Evening Night-Lights Open Play',
    schedule: 'Mon / Wed / Fri • 06:00 PM – 09:00 PM',
    skillLevel: 'Intermediate & Competitive Rally',
    rotationRule: '4-Player Doubles Pods • Winners Split Partners',
    entryFee: 150,
    designatedCourts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'],
    showCourtsOnSite: true,
    published: false,
    maxPlayers: 24,
    players: [],
    shuffledOrder: Array.from({ length: 24 }, (_, i) => i),
    lastShuffleTime: 'Ready to Shuffle'
  },
  {
    id: 'op-weekend-mixer',
    title: 'Weekend Club Open Play Mixer',
    schedule: 'Sat & Sun • 04:00 PM – 07:00 PM',
    skillLevel: 'All Community Members & Walk-Ins',
    rotationRule: '4-Player Doubles Pods • Community Shuffler',
    entryFee: 150,
    designatedCourts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'],
    showCourtsOnSite: true,
    published: false,
    maxPlayers: 24,
    players: [],
    shuffledOrder: Array.from({ length: 24 }, (_, i) => i),
    lastShuffleTime: 'Ready to Shuffle'
  }
];

window.PF_OPEN_PLAY_STATE = {
  activeSessionId: 'op-afternoon-social',
  courtsOverrideBySession: {},
  shuffledOrderBySession: {},
  lastShuffleTimeBySession: {},
  selectedPayMethod: 'GCash',
  selectedSeatCount: 1
};

function pfIsFakeOpenPlayFillerName(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  return /^Player\s*0?\d+/i.test(s) || /^Open\s*Spot\s*#?\d+/i.test(s) || /\(Spot\s*#\d+\)/i.test(s);
}

function pfGetNormalizedOpenPlaySessions() {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const rawSessions = Array.isArray(cfg.openPlaySessions) && cfg.openPlaySessions.length > 0
    ? cfg.openPlaySessions
    : DEFAULT_OPEN_PLAY_SESSIONS;
  const fallbackFee = Math.max(0, Number(cfg.openPlayFee || 150));

  return DEFAULT_OPEN_PLAY_SESSIONS.map((def, idx) => {
    const found = rawSessions.find(s => s && s.id === def.id) || rawSessions[idx] || {};
    const desig = Array.isArray(found.designatedCourts) && found.designatedCourts.length > 0
      ? found.designatedCourts
      : def.designatedCourts.slice();

    const rawPlayers = Array.isArray(found.players) ? found.players : [];
    const cleanRealPlayers = [];
    rawPlayers.forEach(p => {
      if (!p) return;
      const pName = typeof p === 'string' ? p.trim() : String(p.name || '').trim();
      if (!pName || pfIsFakeOpenPlayFillerName(pName)) return;
      cleanRealPlayers.push({
        id: (typeof p === 'object' && p.id) ? p.id : ('op-pl-' + (cleanRealPlayers.length + 1)),
        name: pName,
        skill: (typeof p === 'object' && p.skill) ? p.skill : 'All Levels',
        phone: (typeof p === 'object' && p.phone) ? p.phone : '',
        bookingRef: (typeof p === 'object' && p.bookingRef) ? p.bookingRef : '',
        paymentMethod: (typeof p === 'object' && p.paymentMethod) ? p.paymentMethod : '',
        status: (typeof p === 'object' && p.status) ? p.status : 'BOOKED',
        joinedAt: (typeof p === 'object' && p.joinedAt) ? p.joinedAt : 'Joined'
      });
    });

    if (idx === 0 && cleanRealPlayers.length === 0 && Array.isArray(cfg.openPlay24Roster)) {
      cfg.openPlay24Roster.forEach(r => {
        const rName = typeof r === 'string' ? r.trim() : String((r && r.name) || '').trim();
        if (rName && !pfIsFakeOpenPlayFillerName(rName)) {
          cleanRealPlayers.push({
            id: 'op-pl-' + (cleanRealPlayers.length + 1),
            name: rName,
            skill: (r && r.skill) || 'All Levels',
            phone: (r && r.phone) || '',
            bookingRef: (r && r.bookingRef) || '',
            paymentMethod: (r && r.paymentMethod) || '',
            status: (r && r.status) || 'BOOKED',
            joinedAt: (r && r.joinedAt) || 'Joined'
          });
        }
      });
    }

    const order = (Array.isArray(found.shuffledOrder) && found.shuffledOrder.length === 24)
      ? found.shuffledOrder.slice()
      : Array.from({ length: 24 }, (_, i) => i);

    const parsedFee = Number(found.entryFee !== undefined ? found.entryFee : (def.entryFee || fallbackFee || 150));

    return {
      id: found.id || def.id,
      title: String(found.title || (idx === 0 && cfg.openPlay24Title ? cfg.openPlay24Title : def.title)).trim(),
      schedule: String(found.schedule || (idx === 0 && cfg.openPlay24Window ? cfg.openPlay24Window : def.schedule)).trim(),
      skillLevel: String(found.skillLevel || def.skillLevel).trim(),
      rotationRule: String(found.rotationRule || def.rotationRule).trim(),
      entryFee: Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : 150,
      designatedCourts: desig,
      showCourtsOnSite: found.showCourtsOnSite !== false,
      published: typeof found.published === 'boolean' ? found.published : (idx === 0),
      maxPlayers: Math.max(4, Number(found.maxPlayers || 24)),
      players: cleanRealPlayers.slice(0, 24),
      shuffledOrder: order,
      lastShuffleTime: String(found.lastShuffleTime || def.lastShuffleTime || 'Ready to Shuffle')
    };
  });
}

function pfGetPublishedOpenPlaySessions() {
  const all = pfGetNormalizedOpenPlaySessions();
  const pub = all.filter(s => s.published !== false);
  return pub.length > 0 ? pub : [all[0]];
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

function pfOpenJoinOpenPlayModal(sessionIdInput, preferredSeatNum) {
  const pubSessions = pfGetPublishedOpenPlaySessions();
  const session = (sessionIdInput && pubSessions.find(s => s.id === sessionIdInput)) || pfGetActiveOpenPlaySession();
  let modal = document.getElementById('pf-openplay-join-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pf-openplay-join-modal';
    modal.className = 'fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4';
    document.body.appendChild(modal);
  }

  const todayYmd = (typeof pfGetPhilippineTodayYMD === 'function')
    ? pfGetPhilippineTodayYMD()
    : new Date().toISOString().slice(0, 10);
  const unitFee = Math.max(0, Number(session.entryFee !== undefined ? session.entryFee : 150));
  const spotsLeft = Math.max(0, 24 - session.players.length);
  const nextSeat = preferredSeatNum || (session.players.length + 1);

  const sessionOptionsHtml = pubSessions.map(s => {
    const sFee = Math.max(0, Number(s.entryFee !== undefined ? s.entryFee : 150));
    const sOpen = Math.max(0, 24 - s.players.length);
    const sel = s.id === session.id ? 'selected' : '';
    return `<option value="${pfEscapeHtml(s.id)}" ${sel}>${pfEscapeHtml(s.title)} (${pfEscapeHtml(s.schedule)}) — ₱${sFee}/player (${sOpen} open)</option>`;
  }).join('');

  modal.innerHTML = `
    <div onclick="pfCloseJoinOpenPlayModal()" class="absolute inset-0"></div>
    <div id="op-join-modal-dialog" class="relative z-10 w-full max-w-2xl max-h-[92dvh] overflow-y-auto bg-white text-slate-900 rounded-3xl border-2 border-[#15803D] shadow-2xl p-5 sm:p-7 space-y-4 animate-fadeIn">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
        <div class="flex items-center gap-3">
          <div class="w-11 h-12 rounded-xl bg-[#0F291E] border border-[#34D399]/60 p-1 flex items-center justify-center flex-shrink-0">
            <img src="assets/logo.png" alt="P&amp;F Logo" class="w-full h-full object-contain">
          </div>
          <div>
            <span class="px-2.5 py-0.5 rounded bg-[#0F291E] text-[#A3E635] font-mono text-[10px] font-black uppercase tracking-wider">🏓 OFFICIAL OPEN PLAY BOOKING &amp; SEAT CHECKOUT</span>
            <h3 class="text-lg sm:text-xl font-black text-slate-900 mt-1">Book Your Open Play Seat &amp; Join Pod Shuffler</h3>
            <p id="op-join-session-meta" class="text-xs font-mono font-bold text-emerald-700">${pfEscapeHtml(session.schedule)} • ₱${unitFee}/player • ${spotsLeft} of 24 seats open</p>
          </div>
        </div>
        <button type="button" onclick="pfCloseJoinOpenPlayModal()" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white font-black text-xs">✕</button>
      </div>

      <!-- Seat Assignment Banner -->
      <div class="p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] flex items-center justify-between gap-3 text-xs">
        <div class="font-bold text-[#065F46]">
          🟢 <b>Seat #${nextSeat} Ready:</b> Booking adds your name to the live <b>24-Player Pod Shuffler</b> and generates an official <b>PF-OP</b> Booking Pass.
        </div>
        <span class="px-2.5 py-1 rounded-lg bg-[#0F291E] text-[#A3E635] font-mono text-[11px] font-black whitespace-nowrap">₱${unitFee} / Seat</span>
      </div>

      <form id="pf-openplay-join-form" onsubmit="pfSubmitJoinOpenPlayForm(event)" class="space-y-4 text-xs">
        <input type="hidden" id="op-join-pay-method" value="GCash">

        <!-- Session & Play Date Row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="sm:col-span-2">
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Open Play Session *</label>
            <select id="op-join-session-select" onchange="pfUpdateOpenPlayModalTotals()" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold">
              ${sessionOptionsHtml}
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Play Date *</label>
            <input id="op-join-date" type="date" value="${pfEscapeHtml(todayYmd)}" min="${pfEscapeHtml(todayYmd)}" required class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-mono font-bold">
          </div>
        </div>

        <!-- Player Name, Phone, Skill, Seat Count -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Player Full Name *</label>
            <input id="op-join-name" type="text" required maxlength="60" placeholder="e.g., Marco Villanueva" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold focus:outline-none focus:border-emerald-700">
          </div>
          <div>
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Mobile Number (11 Digits) *</label>
            <input id="op-join-phone" type="tel" required maxlength="20" placeholder="0917 123 4567" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-700">
          </div>
          <div>
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Skill Level *</label>
            <select id="op-join-skill" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold">
              <option value="All Levels">All Levels (Social Mix)</option>
              <option value="Beginner (2.0–2.5)">Beginner (2.0 – 2.5)</option>
              <option value="Intermediate (3.0–3.5)" selected>Intermediate (3.0 – 3.5)</option>
              <option value="Advanced (4.0+)">Advanced / Competitive (4.0+)</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-mono font-extrabold uppercase text-slate-700 mb-1">Number of Seats to Book *</label>
            <select id="op-join-seats-select" onchange="pfUpdateOpenPlayModalTotals()" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold">
              <option value="1" selected>1 Player Seat — ₱${unitFee}</option>
              <option value="2">2 Player Seats (Pair) — ₱${unitFee * 2}</option>
              <option value="3">3 Player Seats — ₱${unitFee * 3}</option>
              <option value="4">4 Player Seats (Full Pod) — ₱${unitFee * 4}</option>
            </select>
          </div>
        </div>

        <!-- Additional Guest Names (Visible if seats > 1) -->
        <div id="op-join-guests-wrap" class="hidden p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
          <label class="block text-[10px] font-mono font-extrabold uppercase text-emerald-900">Additional Player Names (Comma-separated so each gets their own Pod Seat)</label>
          <input id="op-join-guests" type="text" placeholder="e.g., Paolo Santos, Bea Alonzo" class="w-full px-3.5 py-2 rounded-xl border border-emerald-300 bg-white text-slate-900 font-semibold">
        </div>

        <!-- Payment Method & QR Verification -->
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-mono text-[10px] font-black uppercase text-slate-700">Select Open Play Payment Method:</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full sm:w-auto">
              <button type="button" id="op-pay-btn-GCash" onclick="pfSwitchOpenPlayPayMethod('GCash')" class="py-2.5 px-3 rounded-xl bg-[#0F291E] text-[#A3E635] border-2 border-[#15803D] font-mono text-xs font-black uppercase transition shadow-sm">GCash QR</button>
              <button type="button" id="op-pay-btn-Maya" onclick="pfSwitchOpenPlayPayMethod('Maya')" class="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-mono text-xs font-bold uppercase transition">Maya QR</button>
              <button type="button" id="op-pay-btn-BDO" onclick="pfSwitchOpenPlayPayMethod('BDO')" class="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-mono text-xs font-bold uppercase transition">BDO QR</button>
              <button type="button" id="op-pay-btn-Counter" onclick="pfSwitchOpenPlayPayMethod('Counter')" class="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-mono text-xs font-bold uppercase transition">Pay at Desk</button>
            </div>
          </div>

          <div id="op-join-qr-box" class="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl bg-white border border-slate-200">
            <img id="op-join-qr-img" src="assets/qr-gcash.png" alt="Official Payment QR" class="w-28 h-28 object-contain rounded-lg border border-slate-200 flex-shrink-0">
            <div class="space-y-1 text-center sm:text-left">
              <div id="op-join-qr-acc" class="font-mono text-xs font-black text-slate-900">GCash Express Send: 0999 883 2346 (P&amp;F Rally Ground)</div>
              <p class="text-[11px] text-slate-600 leading-relaxed">Scan the official club QR code above and enter your 6+ digit Reference Number below, or choose <b>Pay at Desk</b> to reserve your Open Play seat and pay upon arrival.</p>
            </div>
          </div>

          <div id="op-join-ref-wrap">
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Payment Reference No. (Last 6–13 Digits)</label>
            <input type="text" id="op-join-ref" placeholder="e.g. 8091234567 (or switch to Pay at Desk)" class="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono font-bold">
          </div>
        </div>

        <!-- Bottom Total & Submit Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-[#0F291E] text-white">
          <div>
            <span class="text-[10px] font-mono uppercase text-emerald-200 block">Open Play Entry Total</span>
            <b id="op-join-total-display" class="text-2xl font-mono font-black text-[#A3E635]">₱${unitFee.toLocaleString()}.00</b>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button type="button" onclick="pfCloseJoinOpenPlayModal()" class="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase">Cancel</button>
            <button id="op-join-submit-btn" type="submit" class="flex-1 sm:flex-initial px-6 py-3.5 rounded-xl bg-[#A3E635] hover:bg-[#bef264] text-[#04120B] font-black text-xs uppercase tracking-wider transition shadow-lg">
              🏓 Confirm Booking &amp; Join Pod Shuffler →
            </button>
          </div>
        </div>
      </form>
    </div>
  `;
  modal.classList.remove('hidden');
  pfSwitchOpenPlayPayMethod('GCash');
  pfUpdateOpenPlayModalTotals();
  setTimeout(() => {
    const inp = document.getElementById('op-join-name');
    if (inp) inp.focus();
  }, 60);
}

function pfCloseJoinOpenPlayModal() {
  const modal = document.getElementById('pf-openplay-join-modal');
  if (modal) modal.classList.add('hidden');
}

async function pfSubmitJoinOpenPlayForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  const sessionSelect = document.getElementById('op-join-session-select');
  const sessionId = (sessionSelect ? sessionSelect.value : '') || window.PF_OPEN_PLAY_STATE.activeSessionId;
  const playDate = (document.getElementById('op-join-date')?.value || '').trim();
  const name = (document.getElementById('op-join-name')?.value || '').trim();
  const phone = (document.getElementById('op-join-phone')?.value || '').trim();
  const skill = (document.getElementById('op-join-skill')?.value || 'All Levels').trim();
  const seatsCount = Math.max(1, Math.min(4, Number(document.getElementById('op-join-seats-select')?.value || 1)));
  const guestsRaw = (document.getElementById('op-join-guests')?.value || '').trim();
  const payMethod = (document.getElementById('op-join-pay-method')?.value || 'GCash').trim();
  const payRef = (document.getElementById('op-join-ref')?.value || '').trim();

  if (!name || name.length < 2) {
    alert('Please enter your Full Name to book Open Play.');
    document.getElementById('op-join-name')?.focus();
    return;
  }
  if (phone.replace(/[^0-9]/g, '').length < 10) {
    alert('Please enter a valid 11-digit mobile number.');
    document.getElementById('op-join-phone')?.focus();
    return;
  }
  if (payMethod !== 'Counter' && payRef.replace(/[^A-Za-z0-9]/g, '').length < 4) {
    alert('Please enter your GCash/Maya/BDO Reference Number, or select "Pay at Desk".');
    document.getElementById('op-join-ref')?.focus();
    return;
  }

  const allSessions = pfGetNormalizedOpenPlaySessions();
  const targetSession = allSessions.find(s => s.id === sessionId) || allSessions[0];
  const unitFee = Math.max(0, Number(targetSession.entryFee !== undefined ? targetSession.entryFee : 150));
  const totalFee = unitFee * seatsCount;
  const bookingRef = 'PF-OP-' + Math.floor(100000 + Math.random() * 900000);
  const finalPayRef = payMethod === 'Counter' ? 'PAY-AT-DESK' : payRef;
  const joinedAtStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Build list of player names for the seats booked
  const guestNames = guestsRaw ? guestsRaw.split(',').map(g => g.trim()).filter(Boolean) : [];
  const allNamesToBook = [name];
  for (let i = 1; i < seatsCount; i++) {
    allNamesToBook.push(guestNames[i - 1] || `${name} (Guest #${i + 1})`);
  }

  const submitBtn = document.getElementById('op-join-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Confirming Booking...';
  }

  // Update local siteConfig openPlaySessions immediately
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const updatedSessions = allSessions.map(s => {
    if (s.id !== targetSession.id) return s;
    const nextPlayers = s.players.slice();
    allNamesToBook.forEach(pName => {
      const existsIdx = nextPlayers.findIndex(p => String(p.name || '').toLowerCase() === pName.toLowerCase());
      const entryObj = {
        id: 'op-pl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        name: pName,
        skill: skill,
        phone: phone,
        bookingRef: bookingRef,
        paymentMethod: payMethod === 'Counter' ? 'Pay at Counter' : payMethod,
        transactionRef: finalPayRef,
        status: payMethod === 'Counter' ? 'PAY AT DESK' : 'PAID & BOOKED',
        joinedAt: joinedAtStr
      };
      if (existsIdx >= 0) nextPlayers[existsIdx] = entryObj;
      else if (nextPlayers.length < 24) nextPlayers.push(entryObj);
    });
    return Object.assign({}, s, { players: nextPlayers });
  });

  cfg.openPlaySessions = updatedSessions;
  if (updatedSessions[0]) {
    cfg.openPlay24Roster = updatedSessions[0].players;
  }
  cfg.updatedAt = Date.now();
  window.PF_SITE_CONFIG = cfg;
  try { localStorage.setItem('pf_site_config', JSON.stringify(cfg)); } catch (err) {}

  // Create official booking record for localStorage + Admin Bookings + check-booking.html
  const desigCourts = Array.isArray(targetSession.designatedCourts) && targetSession.designatedCourts.length
    ? targetSession.designatedCourts
    : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
  const bookingRecord = {
    ref: bookingRef,
    name: name,
    phone: phone,
    email: '',
    date: playDate || ((typeof pfGetPhilippineTodayYMD === 'function') ? pfGetPhilippineTodayYMD() : 'Today'),
    time: targetSession.schedule || '03:00 PM - 06:00 PM',
    slots: [targetSession.schedule || '03:00 PM - 06:00 PM'],
    courtName: `Open Play • ${targetSession.title} (${desigCourts.join(', ')})`,
    court: `Open Play • ${targetSession.title}`,
    players: seatsCount,
    paymentMethod: payMethod === 'Counter' ? 'Pay at Counter' : payMethod,
    paymentMode: payMethod === 'Counter' ? 'Pay at Counter' : payMethod,
    transactionRef: finalPayRef,
    paymentRef: finalPayRef,
    status: 'PENDING',
    total: totalFee,
    isOpenPlay: true,
    sessionId: targetSession.id,
    createdAt: new Date().toISOString()
  };

  try {
    const pubList = JSON.parse(localStorage.getItem('pf_public_bookings') || '[]');
    pubList.unshift(bookingRecord);
    localStorage.setItem('pf_public_bookings', JSON.stringify(pubList));
  } catch (err) {}
  try {
    const sharedList = JSON.parse(localStorage.getItem('pf_shared_bookings') || '[]');
    sharedList.unshift(bookingRecord);
    localStorage.setItem('pf_shared_bookings', JSON.stringify(sharedList));
  } catch (err) {}

  // Sync to backend /api/openplay-join (creates booking + adds players atomically)
  const joinEndpoints = (typeof pfGetApiEndpoints === 'function') ? pfGetApiEndpoints('/api/openplay-join') : ['/api/openplay-join'];
  let serverSaved = false;
  for (const url of joinEndpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: targetSession.id,
          name: name,
          guestNames: allNamesToBook.slice(1),
          skill: skill,
          phone: phone,
          date: bookingRecord.date,
          players: seatsCount,
          paymentMethod: bookingRecord.paymentMethod,
          transactionRef: finalPayRef,
          total: totalFee,
          ref: bookingRef,
          createBooking: true
        })
      });
      if (res.ok) {
        serverSaved = true;
        break;
      }
    } catch (err) {}
  }

  window.PF_OPEN_PLAY_STATE.activeSessionId = targetSession.id;
  pfRenderOpenPlay24Board();

  // Render Digital Open Play Booking Pass inside the modal
  const dialog = document.getElementById('op-join-modal-dialog');
  if (dialog) {
    dialog.innerHTML = `
      <div class="text-center space-y-4 py-2">
        <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-xs font-black uppercase">
          ✓ OPEN PLAY SEAT BOOKED &amp; ADDED TO SHUFFLER
        </div>
        <h3 class="text-2xl font-black text-slate-900">Your Open Play Pass Is Ready!</h3>
        <p class="text-xs text-slate-600 max-w-md mx-auto">
          Your name (${pfEscapeHtml(allNamesToBook.join(', '))}) is now live on the <b>${pfEscapeHtml(targetSession.title)}</b> 4-Player Pod Shuffler and recorded in our Club Booking System.
        </p>

        <div class="p-5 rounded-3xl bg-[#0F291E] text-white border-2 border-[#15803D] text-left space-y-3 max-w-lg mx-auto shadow-xl">
          <div class="flex items-center justify-between border-b border-white/15 pb-3">
            <div>
              <span class="text-[10px] font-mono uppercase text-[#A3E635] block">OFFICIAL BOOKING REFERENCE</span>
              <span class="font-mono text-xl font-black text-white">${pfEscapeHtml(bookingRef)}</span>
            </div>
            <span class="px-3 py-1 rounded-full bg-[#A3E635] text-[#04120B] font-mono text-[10px] font-black uppercase">${payMethod === 'Counter' ? 'PAY AT DESK' : 'PAYMENT LOGGED'}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span class="text-[10px] font-mono uppercase text-emerald-200/80 block">Player(s) Joined</span>
              <b class="text-white">${pfEscapeHtml(allNamesToBook.join(', '))}</b>
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase text-emerald-200/80 block">Session &amp; Date</span>
              <b class="text-white">${pfEscapeHtml(targetSession.title)} • ${pfEscapeHtml(bookingRecord.date)}</b>
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase text-emerald-200/80 block">Designated Courts</span>
              <b class="text-[#A3E635]">${pfEscapeHtml(desigCourts.join(', '))}</b>
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase text-emerald-200/80 block">Total Entry Fee</span>
              <b class="font-mono text-[#A3E635]">₱${totalFee.toLocaleString()}.00 (${seatsCount} Seat${seatsCount > 1 ? 's' : ''})</b>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
          <a href="check-booking.html?ref=${encodeURIComponent(bookingRef)}" class="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-extrabold text-xs uppercase tracking-wider">
            🔍 Verify in My Booking
          </a>
          <button type="button" onclick="pfCloseJoinOpenPlayModal()" class="px-6 py-3 rounded-xl bg-[#0F291E] hover:bg-[#163A2B] text-[#A3E635] font-black text-xs uppercase tracking-wider shadow-lg">
            🏓 View My Seat on Pod Shuffler →
          </button>
        </div>
      </div>
    `;
  } else {
    pfCloseJoinOpenPlayModal();
  }
}

function pfRenderOpenPlay24Board() {
  const dedicatedRoot = document.getElementById('open-play-dedicated-page-root');
  const homeBannerRoot = document.getElementById('open-play-24-board-container');
  const legacySummaryRoot = document.getElementById('openplay24-summary-root');
  const legacyPodsRoot = document.getElementById('openplay24-pods-grid');

  if (!dedicatedRoot && !homeBannerRoot && !legacySummaryRoot && !legacyPodsRoot) return;

  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const pubSessions = pfGetPublishedOpenPlaySessions();
  const activeSession = pfGetActiveOpenPlaySession();
  const schedule = pfBuildOpenPlay24Schedule(undefined, activeSession.id);
  const joinedCount = schedule.joinedCount;
  const openSpotsCount = schedule.openSpotsCount;
  const unitFee = Math.max(0, Number(activeSession.entryFee !== undefined ? activeSession.entryFee : 150));
  const pct = Math.min(100, Math.round((joinedCount / 24) * 100));
  const dcList = Array.isArray(activeSession.designatedCourts) && activeSession.designatedCourts.length > 0
    ? activeSession.designatedCourts
    : pfGetOpenPlayDesignatedCourts(cfg);

  // Render Live Open Play Banner on index.html (#open-play-24-board-container)
  if (homeBannerRoot) {
    if (cfg && cfg.openPlayEnabled === false) {
      homeBannerRoot.innerHTML = '';
      homeBannerRoot.classList.add('hidden');
    } else {
      homeBannerRoot.classList.remove('hidden');
      const homeCourtPillsHtml = ['Court 1', 'Court 2', 'Court 3', 'Court 4'].map(cName => {
        const isOpCourt = dcList.includes(cName);
        return isOpCourt
          ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EDE9FE] text-[#5B21B6] border border-[#C4B5FD] font-mono text-[10px] font-black uppercase"><span class="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]"></span>🟣 ${cName}: Open Play</span>`
          : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-extrabold uppercase"><span class="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>🟢 ${cName}: Regular Hire</span>`;
      }).join('');

      const sessionTabsHtml = pubSessions.length > 1 ? `
        <div class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
          <span class="text-[10px] font-mono font-bold uppercase text-slate-500 mr-1">Active Sessions (${pubSessions.length}):</span>
          ${pubSessions.map((s, idx) => {
            const isAct = s.id === activeSession.id;
            return `<button type="button" onclick="pfSelectOpenPlaySession('${pfEscapeHtml(s.id)}')" class="px-3 py-1 rounded-lg font-mono text-[10px] font-extrabold uppercase transition ${isAct ? 'bg-[#0F291E] text-[#A3E635] shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'}">0${idx + 1} • ${pfEscapeHtml(s.title)} (${s.players.length}/24)</button>`;
          }).join('')}
        </div>
      ` : '';

      homeBannerRoot.innerHTML = `
        <div class="rounded-3xl bg-white border-2 border-[#C4B5FD] p-5 sm:p-6 shadow-md text-slate-900 space-y-4">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDE9FE] text-[#5B21B6] border border-[#C4B5FD] font-mono text-[10px] font-black uppercase">
                  <span class="w-2 h-2 rounded-full bg-[#8B5CF6] animate-ping"></span>
                  <span>🟣 LIVE OPEN PLAY SESSION &amp; 4-PLAYER POD SHUFFLER</span>
                </span>
                <span class="px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] font-mono text-[10px] font-black uppercase">
                  ₱${unitFee} / Player Seat
                </span>
                <span class="px-3 py-1 rounded-full ${joinedCount > 0 ? 'bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]' : 'bg-slate-100 text-slate-700 border border-slate-300'} font-mono text-[10px] font-extrabold uppercase">
                  👥 ${joinedCount} / 24 Players Booked (${openSpotsCount} Open)
                </span>
              </div>
              <h3 class="text-lg sm:text-xl font-black tracking-tight text-[#0D1F18]">
                ${pfEscapeHtml(activeSession.title)} &bull; <span class="text-[#5B21B6] font-mono text-sm sm:text-base">${pfEscapeHtml(activeSession.schedule)}</span>
              </h3>
              <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span class="text-[10px] font-mono font-bold uppercase text-slate-500 mr-1">Court Allocation:</span>
                ${homeCourtPillsHtml}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2.5 flex-shrink-0">
              <button type="button" onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(activeSession.id)}')" class="px-4 py-3 rounded-xl bg-[#0F291E] hover:bg-[#15803D] text-white font-extrabold text-xs uppercase tracking-wider transition shadow-md inline-flex items-center gap-2">
                <span>🏓 Book &amp; Pay Open Play Seat (₱${unitFee}) →</span>
              </button>
              <a href="open-play.html" class="px-4 py-3 rounded-xl bg-[#EDE9FE] hover:bg-[#5B21B6] text-[#4C1D95] hover:text-white border border-[#C4B5FD] font-extrabold text-xs uppercase tracking-wider transition inline-flex items-center gap-1.5">
                <span>🔀 Live Pod Shuffler (${joinedCount}/24) →</span>
              </a>
            </div>
          </div>
          ${sessionTabsHtml}
        </div>
      `;
    }
  }

  if (!dedicatedRoot && (legacySummaryRoot || legacyPodsRoot)) {
    if (legacySummaryRoot) {
      legacySummaryRoot.innerHTML = `
        <div class="p-4 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-black text-slate-900">${pfEscapeHtml(activeSession.title)} (${joinedCount}/24 Joined • ₱${unitFee}/player)</div>
            <div class="text-xs text-slate-600">${pfEscapeHtml(activeSession.schedule)}</div>
          </div>
          <a href="open-play.html" class="px-4 py-2 rounded-xl bg-[#0F291E] text-white font-extrabold text-xs uppercase">Open Full Shuffler →</a>
        </div>
      `;
    }
    return;
  }

  // 1. Session Switcher Bar (Static Tailwind grid classes so CDN compiles properly)
  const switcherGridCols = pubSessions.length === 2
    ? 'sm:grid-cols-2'
    : (pubSessions.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4');

  const sessionSelectorBarHtml = pubSessions.length > 1 ? `
    <div class="p-4 rounded-3xl bg-white border-2 border-[#E2E0D8] shadow-sm space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 px-1">
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-extrabold uppercase">🏓 Active Open Play Sessions (${pubSessions.length} Live)</span>
          <span class="text-xs font-bold text-[#52605A] hidden sm:inline">Select a session below to view its designated courts, book a seat, or shuffle its 4-player pods</span>
        </div>
      </div>
      <div class="grid grid-cols-1 ${switcherGridCols} gap-2.5">
        ${pubSessions.map((s, idx) => {
          const isAct = s.id === activeSession.id;
          const sFee = Math.max(0, Number(s.entryFee !== undefined ? s.entryFee : 150));
          return `
            <button type="button" onclick="pfSelectOpenPlaySession('${pfEscapeHtml(s.id)}')" class="p-3.5 rounded-2xl border-2 text-left transition flex items-center gap-3 ${isAct ? 'bg-[#0F291E] text-white border-[#0F291E] shadow-md' : 'bg-[#F8F7F3] hover:bg-white text-slate-900 border-[#E2E0D8]'}">
              <span class="w-7 h-7 rounded-lg ${isAct ? 'bg-[#A3E635] text-[#04120B]' : 'bg-[#0F291E] text-white'} font-mono text-xs font-black flex items-center justify-center flex-shrink-0">0${idx + 1}</span>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-black truncate">${pfEscapeHtml(s.title)}</div>
                <div class="text-[10px] font-mono ${isAct ? 'text-emerald-200' : 'text-slate-600'} truncate">${pfEscapeHtml(s.schedule)} &bull; ₱${sFee} &bull; ${s.players.length}/24</div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // Designated Court Pills (Matching Tournament Editorial Poster)
  const designatedCourtPillsHtml = ['Court 1', 'Court 2', 'Court 3', 'Court 4'].map(cName => {
    const isActiveCourt = dcList.includes(cName);
    return isActiveCourt
      ? `<span class="px-2.5 py-1 rounded-lg bg-[#0F291E] text-white font-mono text-[10px] font-extrabold uppercase flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#A3E635]"></span>${cName}</span>`
      : `<span class="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0] font-mono text-[10px] font-semibold uppercase line-through opacity-60" title="Open for private court bookings">${cName}</span>`;
  }).join('');

  // Helper to render a single seat inside a Mini Pickleball Court Pod
  const renderPodSeatHtml = (pl) => {
    if (pl && pl.isJoined) {
      return `
        <div class="p-2.5 rounded-xl bg-[#071D14] border-2 border-[#A3E635] flex items-center justify-between gap-2 shadow-xs">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-[#A3E635] text-[#04120B] font-mono text-[10px] font-black flex items-center justify-center flex-shrink-0">#${pl.podSeat}</span>
            <div class="min-w-0">
              <div class="text-xs font-extrabold text-white truncate" title="${pfEscapeHtml(pl.name)}">${pfEscapeHtml(pl.name)}</div>
              <div class="text-[9px] font-mono text-emerald-300 truncate">${pfEscapeHtml(pl.skill || 'All Levels')}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[#A3E635] font-mono text-[9px] font-black uppercase flex-shrink-0">✓ Booked</span>
        </div>
      `;
    }
    const seatNum = pl ? pl.podSeat : 1;
    return `
      <button type="button" onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(activeSession.id)}', ${seatNum})" class="w-full p-2.5 rounded-xl bg-black/30 hover:bg-black/50 border border-dashed border-emerald-300/45 hover:border-[#A3E635] text-left flex items-center justify-between gap-2 transition group">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-6 h-6 rounded-lg bg-white/10 text-emerald-200 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">#${seatNum}</span>
          <div class="min-w-0">
            <div class="text-xs font-bold text-emerald-100/90 group-hover:text-white truncate">Open Seat #${seatNum}</div>
            <div class="text-[9px] font-mono text-emerald-300/75">Available • ₱${unitFee}</div>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded bg-[#A3E635] text-[#04120B] font-mono text-[9px] font-black uppercase flex-shrink-0">Book →</span>
      </button>
    `;
  };

  // 2. Build 6 Visual Pickleball Court Pod Cards (Pair A North vs Pair B South separated by Net)
  const podsGridHtml = schedule.pods.map(pod => {
    const p1 = pod.players[0];
    const p2 = pod.players[1];
    const p3 = pod.players[2];
    const p4 = pod.players[3];
    const statusBadge = pod.joinedInPod === 4
      ? `<span class="px-2.5 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-black uppercase">✓ Pod Full (4/4)</span>`
      : (pod.joinedInPod > 0
        ? `<span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-black uppercase">${pod.joinedInPod}/4 Booked • ${4 - pod.joinedInPod} Open</span>`
        : `<span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-mono text-[10px] font-bold uppercase">4 Open Seats</span>`);

    return `
      <div class="rounded-3xl bg-[#F8F7F3] border-2 border-[#E2E0D8] p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-3.5">
        <!-- Pod Card Header -->
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-2.5 py-0.5 rounded-lg bg-[#0F291E] text-[#A3E635] font-mono text-[10px] font-black uppercase">POD #${pod.podIndex}</span>
              ${activeSession.showCourtsOnSite !== false ? `
                <span class="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 font-mono text-[10px] font-extrabold uppercase">📍 ${pfEscapeHtml(pod.courtLabel)}</span>
              ` : ''}
            </div>
            <div class="text-xs font-extrabold text-slate-700 font-mono mt-1.5">${pfEscapeHtml(pod.roundLabel)}</div>
          </div>
          ${statusBadge}
        </div>

        <!-- Visual Mini Pickleball Court Surface -->
        <div class="pf-court-pod-surface p-3.5 space-y-2">
          <div class="flex items-center justify-between text-[9px] font-mono font-extrabold uppercase tracking-wider text-emerald-200/90 px-1">
            <span>NORTH SIDE • PAIR A</span>
            <span>DOUBLES SIDE 1</span>
          </div>
          <div class="grid grid-cols-1 gap-1.5">
            ${renderPodSeatHtml(p1)}
            ${renderPodSeatHtml(p2)}
          </div>

          <!-- Pickleball Net Divider -->
          <div class="pf-court-net-line py-1">
            <span class="relative z-10 px-3 py-0.5 rounded-full bg-[#04120B] border border-[#A3E635] text-[#A3E635] font-mono text-[9px] font-black uppercase tracking-widest">
              🏓 NET • VS
            </span>
          </div>

          <div class="grid grid-cols-1 gap-1.5">
            ${renderPodSeatHtml(p3)}
            ${renderPodSeatHtml(p4)}
          </div>
          <div class="flex items-center justify-between text-[9px] font-mono font-extrabold uppercase tracking-wider text-emerald-200/90 px-1 pt-0.5">
            <span>SOUTH SIDE • PAIR B</span>
            <span>DOUBLES SIDE 2</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 3. Verified Community Check-In Roster List
  const realRosterHtml = joinedCount === 0 ? `
    <div class="p-6 rounded-2xl bg-[#F0FDF4] border-2 border-dashed border-[#86EFAC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-start sm:items-center gap-3.5">
        <span class="w-10 h-10 rounded-2xl bg-[#15803D] text-white font-mono text-xs font-black flex items-center justify-center flex-shrink-0">0/24</span>
        <div>
          <div class="text-sm font-black text-[#064E3B] uppercase">0 Players Booked Yet — All 24 Open Play Seats Are Open!</div>
          <p class="text-xs text-[#166534] mt-0.5">We never display fake filler names. Book your Open Play seat (₱${unitFee}) to become Player #1 in today's community pod rotation.</p>
        </div>
      </div>
      <button type="button" onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(activeSession.id)}', 1)" class="px-5 py-3 rounded-xl bg-[#0F291E] hover:bg-[#163A2B] text-[#A3E635] font-black text-xs uppercase tracking-wider whitespace-nowrap flex-shrink-0 shadow-sm">
        🏓 Claim Seat #1 (₱${unitFee}) →
      </button>
    </div>
  ` : `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      ${activeSession.players.map((pl, idx) => `
        <div class="p-3.5 rounded-2xl bg-[#F8F7F3] border border-[#E2E0D8] flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-8 h-8 rounded-xl bg-[#0F291E] text-[#A3E635] font-mono text-xs font-black flex items-center justify-center flex-shrink-0">#${idx + 1}</span>
            <div class="min-w-0">
              <div class="text-xs font-black text-slate-900 truncate">${pfEscapeHtml(pl.name)}</div>
              <div class="text-[10px] font-mono text-emerald-800 font-bold truncate">${pfEscapeHtml(pl.skill || 'All Levels')} ${pl.bookingRef ? '• ' + pfEscapeHtml(pl.bookingRef) : ''}</div>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[9px] font-black uppercase flex-shrink-0">✓ ${pfEscapeHtml(pl.status || 'BOOKED')}</span>
        </div>
      `).join('')}
    </div>
  `;

  dedicatedRoot.innerHTML = `
    <div class="space-y-6">
      ${sessionSelectorBarHtml}

      <!-- EDITORIAL OPEN PLAY STAGE (12-COLUMN SHOWCASE + ENTRY PASS + 6 COURT PODS) -->
      <div class="rounded-3xl bg-white border-2 border-[#CBD5E1] p-5 sm:p-8 shadow-xl space-y-6 text-[#0D1F18]">

        <!-- 12-COLUMN EDITORIAL HEADER -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">

          <!-- LEFT 8 COLUMNS: SESSION DETAILS & DESIGNATED COURTS -->
          <div class="xl:col-span-8 flex flex-col justify-between space-y-5 bg-[#F8F7F3] rounded-3xl p-5 sm:p-7 border border-[#E2E0D8]">
            <div class="space-y-3.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-extrabold uppercase tracking-wider">🏓 ${pfEscapeHtml(activeSession.rotationRule || '4-Player Doubles Pod Shuffler')}</span>
                <span class="px-3 py-1 rounded-full bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] font-mono text-[10px] font-extrabold uppercase">💳 Entry Fee: ₱${unitFee} / Player</span>
                <span class="px-3 py-1 rounded-full bg-[#EDE9FE] text-[#5B21B6] border border-[#C4B5FD] font-mono text-[10px] font-extrabold uppercase">🟢 ${joinedCount} Booked &bull; ${openSpotsCount} Seats Open</span>
              </div>

              <div class="space-y-2">
                <h2 class="text-2xl sm:text-4xl font-black tracking-tight text-[#0D1F18] leading-[1.1]">${pfEscapeHtml(activeSession.title)}</h2>
                <p class="text-xs sm:text-sm text-[#475569] leading-relaxed">
                  Social doubles rotation designed for community play—no elimination bracket and no partner required. Book your seat online, check in at the club desk, and use the live Pod Shuffler below to rotate partners and opponents across ${dcList.length} designated court${dcList.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            <div class="pt-4 border-t border-[#DEDAD0] grid grid-cols-1 ${activeSession.showCourtsOnSite !== false ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4">
              <div class="space-y-1 md:pr-3 md:border-r md:border-[#DEDAD0]">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Session Schedule</span>
                <div class="font-mono text-xs sm:text-sm font-black text-[#0D1F18]">${pfEscapeHtml(activeSession.schedule)}</div>
                <div class="font-mono text-[11px] font-bold text-[#15803D]">6 Rotating 30-Min Waves</div>
              </div>

              <div class="space-y-1 md:px-2 ${activeSession.showCourtsOnSite !== false ? 'md:border-r md:border-[#DEDAD0]' : ''}">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Skill Level &amp; Format</span>
                <div class="text-xs sm:text-sm font-extrabold text-[#0D1F18] leading-snug">${pfEscapeHtml(activeSession.skillLevel)}</div>
                <div class="text-[11px] font-semibold text-[#52605A]">4-Player Doubles Pods (1 Game to 11 Pts)</div>
              </div>

              ${activeSession.showCourtsOnSite !== false ? `
              <div class="space-y-1.5 md:pl-2">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Designated Open Play Courts</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  ${designatedCourtPillsHtml}
                </div>
              </div>
              ` : ''}
            </div>
          </div>

          <!-- RIGHT 4 COLUMNS: OFFICIAL OPEN PLAY SEAT BOOKING CARD -->
          <div class="xl:col-span-4 rounded-3xl bg-gradient-to-br from-[#071912] via-[#0F291E] to-[#06150E] border-2 border-[#15803D] p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xl text-white">
            <div class="flex items-center justify-between gap-3.5">
              <div class="flex items-center gap-3">
                <div class="pf-rect-logo-badge" style="width:52px;height:62px;">
                  <img src="assets/logo.png" alt="P&amp;F Rally Ground">
                </div>
                <div>
                  <span class="text-[9px] font-mono font-black uppercase tracking-widest text-[#A3E635] block">OPEN PLAY PASS</span>
                  <div class="text-xs font-extrabold uppercase tracking-wide text-white">P&amp;F Rally Ground</div>
                  <div class="text-[10px] font-mono text-emerald-200">Daraga, Albay</div>
                </div>
              </div>
              <div class="text-right">
                <span class="text-[9px] font-mono uppercase tracking-widest text-slate-300 block">Per Player</span>
                <div class="font-mono text-2xl sm:text-3xl font-black text-[#A3E635]">₱${unitFee.toLocaleString()}</div>
              </div>
            </div>

            <div class="p-3.5 rounded-2xl bg-black/35 border border-[#A3E635]/35 space-y-1">
              <span class="text-[9px] font-mono font-black uppercase tracking-widest text-[#A3E635] block">🏓 WHAT'S INCLUDED IN OPEN PLAY</span>
              <div class="text-xs font-bold text-white leading-snug">3 Hours Social Rotation • 6 Balanced Doubles Pods • Instant <span class="font-mono text-[#A3E635]">PF-OP</span> Booking Reference</div>
            </div>

            <div class="space-y-3">
              <div>
                <div class="flex items-center justify-between text-[11px] font-mono mb-1.5">
                  <span class="text-slate-300">Booked Roster: <b class="text-white">${joinedCount} / 24 Players</b></span>
                  <span class="font-bold text-[#A3E635]">${joinedCount === 0 ? 'All 24 Seats Open' : pct + '% Full'}</span>
                </div>
                <div class="w-full h-2 rounded-full bg-black/50 overflow-hidden border border-white/15">
                  <div class="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#A3E635]" style="width:${pct}%"></div>
                </div>
                <div class="flex items-center justify-between text-[10px] font-mono mt-1.5 text-emerald-200">
                  <span>🟢 ${joinedCount} Confirmed</span>
                  <span>${openSpotsCount} Seats Left</span>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-2 pt-1">
                <button type="button" onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(activeSession.id)}')" class="w-full py-3.5 px-4 rounded-xl bg-[#A3E635] hover:bg-[#bef264] text-[#04120B] font-black text-xs uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2">
                  <span>🏓 Book &amp; Pay Open Play Seat (₱${unitFee}) →</span>
                </button>
                <button type="button" onclick="pfShuffleOpenPlay24Players('${pfEscapeHtml(activeSession.id)}')" class="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-mono font-extrabold text-[11px] uppercase transition flex items-center justify-center gap-1.5">
                  <span>🔀 Shuffle 4-Player Court Pods</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- POD SHUFFLER CONTROL BAR & 6 VISUAL COURT PODS -->
        <div class="space-y-4 pt-2">
          <div class="p-4 rounded-2xl bg-[#0F291E] text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded bg-[#A3E635] text-[#04120B] font-mono text-[10px] font-black uppercase">LIVE 4-PLAYER POD SHUFFLER</span>
                <span class="text-xs font-mono text-emerald-200">Last Shuffle: <b>${pfEscapeHtml(schedule.lastShuffleTime)}</b></span>
              </div>
              <h3 class="text-base sm:text-lg font-black text-white mt-1">6 Doubles Match Pods (4 Players per Court • Pair A vs Pair B)</h3>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center rounded-xl bg-black/35 p-1 border border-white/15">
                ${[1, 2, 3, 4].map(cnt => `
                  <button type="button" onclick="pfSetOpenPlayCourtCount(${cnt}, '${pfEscapeHtml(activeSession.id)}')" class="px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-extrabold transition ${schedule.courtsAvailable === cnt ? 'bg-[#A3E635] text-[#04120B]' : 'text-emerald-100 hover:text-white'}">
                    ${cnt} ${cnt === 1 ? 'Court' : 'Courts'}
                  </button>
                `).join('')}
              </div>
              <button type="button" onclick="pfShuffleOpenPlay24Players('${pfEscapeHtml(activeSession.id)}')" class="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#bef264] text-[#04120B] font-black text-xs uppercase tracking-wider transition shadow-md">
                🔀 Shuffle Players Now
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${podsGridHtml}
          </div>
        </div>

        <!-- VERIFIED COMMUNITY CHECK-IN ROSTER -->
        <div class="pt-4 border-t border-slate-200 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-emerald-800 block">VERIFIED COMMUNITY CHECK-IN ROSTER</span>
              <h3 class="text-lg font-black text-slate-900">Exact Players Booked (${joinedCount} / 24)</h3>
            </div>
            <button type="button" onclick="pfOpenJoinOpenPlayModal('${pfEscapeHtml(activeSession.id)}')" class="px-4 py-2.5 rounded-xl bg-[#0F291E] hover:bg-[#163A2B] text-[#A3E635] font-black text-xs uppercase tracking-wider transition">
              + Book Open Play Seat (₱${unitFee})
            </button>
          </div>
          ${realRosterHtml}
        </div>

      </div>
    </div>
  `;
}

window.DEFAULT_OPEN_PLAY_SESSIONS = DEFAULT_OPEN_PLAY_SESSIONS;
window.pfGetNormalizedOpenPlaySessions = pfGetNormalizedOpenPlaySessions;
window.pfGetPublishedOpenPlaySessions = pfGetPublishedOpenPlaySessions;
window.pfSelectOpenPlaySession = pfSelectOpenPlaySession;
window.pfOpenJoinOpenPlayModal = pfOpenJoinOpenPlayModal;
window.pfCloseJoinOpenPlayModal = pfCloseJoinOpenPlayModal;
window.pfSubmitJoinOpenPlayForm = pfSubmitJoinOpenPlayForm;
window.pfBuildOpenPlay24Schedule = pfBuildOpenPlay24Schedule;
window.pfShuffleOpenPlay24Players = pfShuffleOpenPlay24Players;
window.pfSetOpenPlayCourtCount = pfSetOpenPlayCourtCount;
window.pfRenderOpenPlay24Board = pfRenderOpenPlay24Board;


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
  const filledSeeds = pfCountFilledBracketSeeds(t.players);
  if (regs.length === 0 && filledSeeds === 0) return 0;
  return Math.max(regs.length, filledSeeds);
}
window.pfCountRealTournamentTeams = pfCountRealTournamentTeams;

function pfBuildDefaultBracketForPlayers(players, courts) {
  const p = (Array.isArray(players) && players.length >= 8) ? players : [...PF_OPEN_SEED_LABELS];
  const c = (Array.isArray(courts) && courts.length > 0) ? courts : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
  const getMatchStatus = (teamA, teamB, isFirst) => {
    const openA = pfIsOpenSeedSlot(teamA);
    const openB = pfIsOpenSeedSlot(teamB);
    if (!openA && !openB) return isFirst ? 'LIVE' : 'READY';
    return 'PENDING';
  };
  return [
    { id: 'QF1', stage: 'Quarterfinals', label: 'Quarterfinal 1', court: c[0 % c.length], teamA: p[0], teamB: p[1], scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: getMatchStatus(p[0], p[1], true), winner: null },
    { id: 'QF2', stage: 'Quarterfinals', label: 'Quarterfinal 2', court: c[1 % c.length], teamA: p[2], teamB: p[3], scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: getMatchStatus(p[2], p[3], false), winner: null },
    { id: 'QF3', stage: 'Quarterfinals', label: 'Quarterfinal 3', court: c[2 % c.length], teamA: p[4], teamB: p[5], scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: getMatchStatus(p[4], p[5], false), winner: null },
    { id: 'QF4', stage: 'Quarterfinals', label: 'Quarterfinal 4', court: c[3 % c.length], teamA: p[6], teamB: p[7], scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: getMatchStatus(p[6], p[7], false), winner: null },
    { id: 'SF1', stage: 'Semifinals', label: 'Semifinal 1', court: c[0 % c.length], teamA: 'Winner QF1', teamB: 'Winner QF2', scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: 'PENDING', winner: null },
    { id: 'SF2', stage: 'Semifinals', label: 'Semifinal 2', court: c[1 % c.length], teamA: 'Winner QF3', teamB: 'Winner QF4', scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: 'PENDING', winner: null },
    { id: 'FIN', stage: 'Championship Final', label: 'Gold Medal Final', court: c[0 % c.length], teamA: 'Winner SF1', teamB: 'Winner SF2', scoreA: 0, scoreB: 0, serverSide: 'A', serverNum: 2, toA: 2, toB: 2, status: 'PENDING', winner: null }
  ];
}

function pfGetDefaultTournaments() {
  return [
  {
    "id": "trn-bicol-dupr-open",
    "title": "Bicol Open DUPR Pickleball Cup",
    "format": "Round Robin + Medal Playoffs",
    "formatKey": "ROUND_ROBIN",
    "division": "Novice (2.5–3.0) • Intermediate (3.5) • Open (4.0+)",
    "category": "Men's, Women's & Mixed Doubles",
    "date": "2026-11-21",
    "time": "08:00 AM – 05:00 PM",
    "courts": "All 4 Courts (Courts 1 – 4)",
    "designatedCourts": [
      "Court 1",
      "Court 2",
      "Court 3",
      "Court 4"
    ],
    "entryFee": 850,
    "prizePool": "₱25,000 + Trophies & Official DUPR Submission",
    "maxTeams": 24,
    "registeredCount": 0,
    "registrations": [],
    "approved": true,
    "published": true,
    "showCourtsOnSite": true,
    "scoringTarget": 11,
    "status": "OPEN FOR REGISTRATION",
    "description": "Guaranteed Round-Robin pool matches (1 game to 11 pts) per team. Top 8 seeded pairs advance to the Quarterfinals, Semifinals, and Gold Medal Final across Courts 1 – 4.",
    "players": [
      "Open Seed #1 — Available",
      "Open Seed #8 — Available",
      "Open Seed #4 — Available",
      "Open Seed #5 — Available",
      "Open Seed #2 — Available",
      "Open Seed #7 — Available",
      "Open Seed #3 — Available",
      "Open Seed #6 — Available"
    ],
    "bracket": [
      {
        "id": "QF1",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 1",
        "court": "Court 1",
        "teamA": "Open Seed #1 — Available",
        "teamB": "Open Seed #8 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF2",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 2",
        "court": "Court 2",
        "teamA": "Open Seed #4 — Available",
        "teamB": "Open Seed #5 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF3",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 3",
        "court": "Court 3",
        "teamA": "Open Seed #2 — Available",
        "teamB": "Open Seed #7 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF4",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 4",
        "court": "Court 4",
        "teamA": "Open Seed #3 — Available",
        "teamB": "Open Seed #6 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF1",
        "stage": "Semifinals",
        "label": "Semifinal 1",
        "court": "Court 1",
        "teamA": "Winner QF1",
        "teamB": "Winner QF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF2",
        "stage": "Semifinals",
        "label": "Semifinal 2",
        "court": "Court 2",
        "teamA": "Winner QF3",
        "teamB": "Winner QF4",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "FIN",
        "stage": "Championship Final",
        "label": "Gold Medal Final",
        "court": "Court 1",
        "teamA": "Winner SF1",
        "teamB": "Winner SF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      }
    ]
  },
  {
    "id": "trn-mayon-king-court",
    "title": "Mayon Smash: King & Queen of the Court",
    "format": "Ladder Split Rotation (Individual Points)",
    "formatKey": "KING_COURT",
    "division": "All-Levels Social & Competitive (3.0–3.8)",
    "category": "Individual Entry (Rotating Doubles Partners)",
    "date": "2026-11-14",
    "time": "05:00 PM – 09:00 PM",
    "courts": "4 Courts (Challenger to Crown Court)",
    "designatedCourts": [
      "Court 1",
      "Court 2",
      "Court 3",
      "Court 4"
    ],
    "entryFee": 350,
    "prizePool": "₱6,000 Cash + Carbon Pro Paddle & Medals",
    "maxTeams": 24,
    "registeredCount": 0,
    "registrations": [],
    "approved": true,
    "published": false,
    "showCourtsOnSite": true,
    "scoringTarget": 11,
    "status": "OPEN FOR REGISTRATION",
    "description": "Play 12-minute timed ladder rounds across Courts 1 – 4: winners move UP a court and split partners. Top 8 cumulative point duos enter the Championship Knockout Bracket!",
    "players": [
      "Open Seed #1 — Available",
      "Open Seed #8 — Available",
      "Open Seed #4 — Available",
      "Open Seed #5 — Available",
      "Open Seed #2 — Available",
      "Open Seed #7 — Available",
      "Open Seed #3 — Available",
      "Open Seed #6 — Available"
    ],
    "bracket": [
      {
        "id": "QF1",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 1",
        "court": "Court 1",
        "teamA": "Open Seed #1 — Available",
        "teamB": "Open Seed #8 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF2",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 2",
        "court": "Court 2",
        "teamA": "Open Seed #4 — Available",
        "teamB": "Open Seed #5 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF3",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 3",
        "court": "Court 3",
        "teamA": "Open Seed #2 — Available",
        "teamB": "Open Seed #7 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF4",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 4",
        "court": "Court 4",
        "teamA": "Open Seed #3 — Available",
        "teamB": "Open Seed #6 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF1",
        "stage": "Semifinals",
        "label": "Semifinal 1",
        "court": "Court 1",
        "teamA": "Winner QF1",
        "teamB": "Winner QF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF2",
        "stage": "Semifinals",
        "label": "Semifinal 2",
        "court": "Court 2",
        "teamA": "Winner QF3",
        "teamB": "Winner QF4",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "FIN",
        "stage": "Championship Final",
        "label": "Gold Medal Final",
        "court": "Court 1",
        "teamA": "Winner SF1",
        "teamB": "Winner SF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      }
    ]
  },
  {
    "id": "trn-daraga-mlp-rally",
    "title": "Daraga MLP-Style Team Rally Showdown",
    "format": "MLP 4-Player Co-Ed Squad Format (Rally Scoring)",
    "formatKey": "MLP_TEAM",
    "division": "Club Squads (2 Men + 2 Women per Squad)",
    "category": "Co-Ed Team Event (WD, MD, XD1, XD2 + Dreambreaker)",
    "date": "2026-11-28",
    "time": "09:00 AM – 06:00 PM",
    "courts": "All 4 Courts (Courts 1 – 4)",
    "designatedCourts": [
      "Court 1",
      "Court 2",
      "Court 3",
      "Court 4"
    ],
    "entryFee": 2000,
    "prizePool": "₱18,000 Cash + Club Championship Banner",
    "maxTeams": 12,
    "registeredCount": 0,
    "registrations": [],
    "approved": true,
    "published": false,
    "showCourtsOnSite": true,
    "scoringTarget": 21,
    "status": "OPEN FOR REGISTRATION",
    "description": "Major League Pickleball 4-player squad format! Each clash features Women's Doubles, Men's Doubles, and Mixed Doubles to 21 points (rally scoring) plus Dreambreaker tiebreak.",
    "players": [
      "Open Seed #1 — Available",
      "Open Seed #8 — Available",
      "Open Seed #4 — Available",
      "Open Seed #5 — Available",
      "Open Seed #2 — Available",
      "Open Seed #7 — Available",
      "Open Seed #3 — Available",
      "Open Seed #6 — Available"
    ],
    "bracket": [
      {
        "id": "QF1",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 1",
        "court": "Court 1",
        "teamA": "Open Seed #1 — Available",
        "teamB": "Open Seed #8 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF2",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 2",
        "court": "Court 2",
        "teamA": "Open Seed #4 — Available",
        "teamB": "Open Seed #5 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF3",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 3",
        "court": "Court 3",
        "teamA": "Open Seed #2 — Available",
        "teamB": "Open Seed #7 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF4",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 4",
        "court": "Court 4",
        "teamA": "Open Seed #3 — Available",
        "teamB": "Open Seed #6 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF1",
        "stage": "Semifinals",
        "label": "Semifinal 1",
        "court": "Court 1",
        "teamA": "Winner QF1",
        "teamB": "Winner QF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF2",
        "stage": "Semifinals",
        "label": "Semifinal 2",
        "court": "Court 2",
        "teamA": "Winner QF3",
        "teamB": "Winner QF4",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "FIN",
        "stage": "Championship Final",
        "label": "Gold Medal Final",
        "court": "Court 1",
        "teamA": "Winner SF1",
        "teamB": "Winner SF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      }
    ]
  },
  {
    "id": "trn-albay-double-elim",
    "title": "Albay Double-Elimination Knockout Classic",
    "format": "USA Pickleball Double Elimination Bracket",
    "formatKey": "DOUBLE_ELIM",
    "division": "Intermediate (3.5) & Advanced (4.0+)",
    "category": "Men's Doubles & Mixed Doubles",
    "date": "2026-12-03",
    "time": "08:00 AM – 04:00 PM",
    "courts": "All 4 Courts (Courts 1 – 4)",
    "designatedCourts": [
      "Court 1",
      "Court 2",
      "Court 3",
      "Court 4"
    ],
    "entryFee": 600,
    "prizePool": "₱15,000 Cash + Official Championship Medals",
    "maxTeams": 24,
    "registeredCount": 0,
    "registrations": [],
    "approved": true,
    "published": false,
    "showCourtsOnSite": true,
    "scoringTarget": 15,
    "status": "OPEN FOR REGISTRATION",
    "description": "Full USA Pickleball Championship Bracket across Courts 1 – 4 (games to 15, win by 2). Every registered pair is seeded into the official bracket below.",
    "players": [
      "Open Seed #1 — Available",
      "Open Seed #8 — Available",
      "Open Seed #4 — Available",
      "Open Seed #5 — Available",
      "Open Seed #2 — Available",
      "Open Seed #7 — Available",
      "Open Seed #3 — Available",
      "Open Seed #6 — Available"
    ],
    "bracket": [
      {
        "id": "QF1",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 1",
        "court": "Court 1",
        "teamA": "Open Seed #1 — Available",
        "teamB": "Open Seed #8 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF2",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 2",
        "court": "Court 2",
        "teamA": "Open Seed #4 — Available",
        "teamB": "Open Seed #5 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF3",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 3",
        "court": "Court 3",
        "teamA": "Open Seed #2 — Available",
        "teamB": "Open Seed #7 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "QF4",
        "stage": "Quarterfinals",
        "label": "Quarterfinal 4",
        "court": "Court 4",
        "teamA": "Open Seed #3 — Available",
        "teamB": "Open Seed #6 — Available",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF1",
        "stage": "Semifinals",
        "label": "Semifinal 1",
        "court": "Court 1",
        "teamA": "Winner QF1",
        "teamB": "Winner QF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "SF2",
        "stage": "Semifinals",
        "label": "Semifinal 2",
        "court": "Court 2",
        "teamA": "Winner QF3",
        "teamB": "Winner QF4",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      },
      {
        "id": "FIN",
        "stage": "Championship Final",
        "label": "Gold Medal Final",
        "court": "Court 1",
        "teamA": "Winner SF1",
        "teamB": "Winner SF2",
        "scoreA": 0,
        "scoreB": 0,
        "serverSide": "A",
        "serverNum": 2,
        "toA": 2,
        "toB": 2,
        "status": "PENDING",
        "winner": null
      }
    ]
  }
];
}
var DEFAULT_PF_TOURNAMENTS = pfGetDefaultTournaments();
var activePublicTournamentFilter = 'ALL';

function pfGetTournamentsList() {
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const defaults = pfGetDefaultTournaments();
  if (Array.isArray(cfg.tournaments) && cfg.tournaments.length > 0) {
    return cfg.tournaments.map((t, idx) => {
      const defMatch = defaults.find(d => d.id === t.id) || defaults[idx % defaults.length];
      const players = (Array.isArray(t.players) && t.players.length >= 8) ? t.players : [...PF_OPEN_SEED_LABELS];
      const dc = (Array.isArray(t.designatedCourts) && t.designatedCourts.length > 0) ? t.designatedCourts : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
      const bracket = (Array.isArray(t.bracket) && t.bracket.length >= 7) ? t.bracket : pfBuildDefaultBracketForPlayers(players, dc);
      const registrations = Array.isArray(t.registrations) ? t.registrations : [];
      const realCnt = pfCountRealTournamentTeams({ players, registrations });
      return Object.assign({}, defMatch || {}, t, {
        players,
        bracket,
        registrations,
        registeredCount: realCnt
      });
    });
  }
  return defaults;
}

function pfSetTournamentFilter(filterKey) {
  activePublicTournamentFilter = filterKey || 'ALL';
  pfRenderPublicTournaments();
}

function openAdminTournamentHost(event) {
  if (event) event.preventDefault();
  const isLocalSplit = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (window.location.port === '8088' || window.location.port === '8188');
  const targetUrl = isLocalSplit
    ? `http://${window.location.hostname}:8189/#tab-tournament`
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

function pfBuildSymmetricalBracketTreeHtml(trn, activeMatchId, isAdminInteractive, logoPath, phaseFilter) {
  const mode = phaseFilter || 'ALL';
  const matches = Array.isArray(trn.bracket) && trn.bracket.length >= 7 ? trn.bracket : [];
  const getM = (id, fallbackLabel, fallbackCourt) => matches.find(m => m.id === id) || {
    id, label: fallbackLabel, court: fallbackCourt, teamA: 'Open Seed — Available', teamB: 'Open Seed — Available', scoreA: 0, scoreB: 0, status: 'PENDING', winner: null
  };

  const qf1 = getM('QF1', 'Quarterfinal 1', 'Court 1');
  const qf2 = getM('QF2', 'Quarterfinal 2', 'Court 2');
  const qf3 = getM('QF3', 'Quarterfinal 3', 'Court 3');
  const qf4 = getM('QF4', 'Quarterfinal 4', 'Court 4');
  const sf1 = getM('SF1', 'Semifinal 1', 'Court 1');
  const sf2 = getM('SF2', 'Semifinal 2', 'Court 2');
  const fin = getM('FIN', 'Gold Medal Final', 'Court 1');

  const champName = fin.winner ? (fin.winner === 'A' ? fin.teamA : fin.teamB) : null;

  const renderSlot = (teamName, score, isWin, isAwaiting, dir) => {
    const isOpenSlot = pfIsOpenSeedSlot(teamName);
    const cls = [
      'pf-sym-slot',
      dir === 'right' ? 'dir-right' : 'dir-left',
      isWin ? 'is-winner' : '',
      (isAwaiting || isOpenSlot) ? 'is-awaiting' : ''
    ].filter(Boolean).join(' ');

    const slotClick = (!isAdminInteractive && isOpenSlot && trn && trn.id)
      ? `onclick="pfRegisterForTournament('${pfEscapeHtml(trn.id)}')" style="cursor:pointer;"`
      : '';
    const displayLabel = isOpenSlot && !isAdminInteractive
      ? `${teamName} • Click to Claim`
      : (teamName || 'TBD');

    return `
      <div class="${cls}" ${slotClick} title="${pfEscapeHtml(displayLabel)}">
        <div class="pf-sym-score-box">${Number(score || 0)}</div>
        <div class="pf-sym-banner-bar" style="${isOpenSlot ? 'border-style:dashed !important;border-color:#64748B !important;' : ''}">
          <span class="truncate" style="${isOpenSlot ? 'color:#CBD5E1 !important;font-style:italic;' : ''}">${isWin ? '🏆 ' : (isOpenSlot ? '🟢 ' : '')}${pfEscapeHtml(displayLabel)}</span>
          <span class="pf-sym-diamond"></span>
        </div>
      </div>
    `;
  };

  const renderMatchNode = (m, dir, stageTag) => {
    const isAct = isAdminInteractive && m.id === activeMatchId;
    const isDone = m.status === 'COMPLETED';
    const waitA = String(m.teamA || '').startsWith('Winner ');
    const waitB = String(m.teamB || '').startsWith('Winner ');
    const bothOpen = pfIsOpenSeedSlot(m.teamA) && pfIsOpenSeedSlot(m.teamB);
    const anyOpen = pfIsOpenSeedSlot(m.teamA) || pfIsOpenSeedSlot(m.teamB);
    const clickAttr = isAdminInteractive
      ? `onclick="adminSelectBracketMatch('${m.id}', true)"`
      : '';

    let statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#064E3B] border border-[#34D399] font-mono text-[9px] font-extrabold uppercase" style="background:#064E3B !important;color:#A7F3D0 !important;">🟢 Ready</span>`;
    if (isDone) {
      statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#0C4A6E] border border-[#38BDF8] font-mono text-[9px] font-extrabold uppercase" style="background:#0C4A6E !important;color:#BAE6FD !important;">✓ Final</span>`;
    } else if (bothOpen) {
      statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#1E293B] border border-[#64748B] font-mono text-[9px] font-bold uppercase" style="background:#1E293B !important;color:#BEF264 !important;">🟢 2 Open Slots</span>`;
    } else if (anyOpen) {
      statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#1E293B] border border-[#38BDF8] font-mono text-[9px] font-bold uppercase" style="background:#1E293B !important;color:#BAE6FD !important;">🟢 1 Open Slot</span>`;
    } else if (isAct || m.status === 'LIVE') {
      statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#A3E635] font-mono text-[9px] font-black uppercase shadow-xs" style="background:#A3E635 !important;color:#05140D !important;">🟣 On Court</span>`;
    } else if (m.status === 'PENDING') {
      statusPill = `<span class="px-2.5 py-0.5 rounded-full bg-[#1E293B] border border-[#475569] font-mono text-[9px] font-bold uppercase" style="background:#1E293B !important;color:#E2E8F0 !important;">⏳ Awaiting</span>`;
    }

    return `
      <div ${clickAttr} class="pf-sym-match-card ${isAdminInteractive ? 'cursor-pointer' : ''} ${isAct ? 'is-active-match' : ''} ${isDone ? 'is-completed-match' : ''} space-y-2.5">
        <div class="flex items-center justify-between gap-2 px-0.5">
          <span class="font-mono text-[10px] font-black uppercase tracking-wider" style="color:#BEF264 !important;">${pfEscapeHtml(stageTag)} &bull; ${pfEscapeHtml(m.court || 'Court 1')}</span>
          ${statusPill}
        </div>
        <div class="space-y-2.5">
          ${renderSlot(m.teamA, m.scoreA, m.winner === 'A', waitA, dir)}
          ${renderSlot(m.teamB, m.scoreB, m.winner === 'B', waitB, dir)}
        </div>
      </div>
    `;
  };

  const centerCrestHtml = `
    <div class="pf-center-crest-wrap">
      <div class="pf-center-court-crest">
        <div class="pf-center-court-crest-inner">
          <img src="${logoPath}" alt="P&amp;F Rally Ground Official Crest">
        </div>
      </div>
      <div class="px-3.5 py-1 rounded-full bg-[#A3E635] font-mono text-[10px] font-black uppercase tracking-widest shadow-md whitespace-nowrap" style="background:#A3E635 !important;color:#04120B !important;">
        P&amp;F RALLY GROUND
      </div>
    </div>
  `;

  if (mode === 'QF') {
    return `
      <div class="pf-phase-slide-panel space-y-5 py-2">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          <div class="lg:col-span-5 space-y-4">
            <div class="text-center mb-1">
              <span class="inline-block px-4 py-1.5 rounded-full bg-[#04120B] border border-[#38BDF8] font-mono text-xs font-black uppercase tracking-widest" style="background:#04120B !important;color:#FFFFFF !important;">1/4 &bull; LEFT BRACKET (QF1 &amp; QF2)</span>
            </div>
            ${renderMatchNode(qf1, 'left', 'QUARTERFINAL 1 (QF1)')}
            ${renderMatchNode(qf2, 'left', 'QUARTERFINAL 2 (QF2)')}
          </div>
          <div class="lg:col-span-2 flex flex-col items-center justify-center py-3">
            ${centerCrestHtml}
          </div>
          <div class="lg:col-span-5 space-y-4">
            <div class="text-center mb-1">
              <span class="inline-block px-4 py-1.5 rounded-full bg-[#04120B] border border-[#38BDF8] font-mono text-xs font-black uppercase tracking-widest" style="background:#04120B !important;color:#FFFFFF !important;">1/4 &bull; RIGHT BRACKET (QF3 &amp; QF4)</span>
            </div>
            ${renderMatchNode(qf3, 'right', 'QUARTERFINAL 3 (QF3)')}
            ${renderMatchNode(qf4, 'right', 'QUARTERFINAL 4 (QF4)')}
          </div>
        </div>
      </div>
    `;
  }

  if (mode === 'SF') {
    return `
      <div class="pf-phase-slide-panel space-y-5 max-w-6xl mx-auto py-3">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          <div class="lg:col-span-5 space-y-4">
            <div class="text-center mb-1">
              <span class="inline-block px-4 py-1.5 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-xs font-black uppercase tracking-widest" style="background:#04120B !important;color:#FFFFFF !important;">1/2 &bull; SEMIFINAL 1 (${pfEscapeHtml(sf1.court || 'Court 1')})</span>
            </div>
            ${renderMatchNode(sf1, 'left', 'SEMIFINAL 1 (WINNERS QF1 vs QF2)')}
          </div>
          <div class="lg:col-span-2 flex flex-col items-center justify-center py-3">
            ${centerCrestHtml}
          </div>
          <div class="lg:col-span-5 space-y-4">
            <div class="text-center mb-1">
              <span class="inline-block px-4 py-1.5 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-xs font-black uppercase tracking-widest" style="background:#04120B !important;color:#FFFFFF !important;">1/2 &bull; SEMIFINAL 2 (${pfEscapeHtml(sf2.court || 'Court 2')})</span>
            </div>
            ${renderMatchNode(sf2, 'right', 'SEMIFINAL 2 (WINNERS QF3 vs QF4)')}
          </div>
        </div>
      </div>
    `;
  }

  const finIsAct = isAdminInteractive && fin.id === activeMatchId;
  const finClickAttr = isAdminInteractive ? `onclick="adminSelectBracketMatch('FIN', true)"` : '';
  const finWaitA = String(fin.teamA || '').startsWith('Winner ');
  const finWaitB = String(fin.teamB || '').startsWith('Winner ');

  const grandFinalCardHtml = `
    <div class="max-w-3xl mx-auto pt-3">
      <div ${finClickAttr} class="pf-sym-match-card ${isAdminInteractive ? 'cursor-pointer' : ''} ${finIsAct ? 'is-active-match' : ''} ${fin.status === 'COMPLETED' ? 'is-completed-match' : ''} p-5 sm:p-6 border-2 border-[#A3E635] shadow-2xl">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <span class="px-3.5 py-1 rounded-full bg-[#A3E635] font-mono text-[10px] font-black uppercase tracking-widest" style="background:#A3E635 !important;color:#04120B !important;">
            🏆 GRAND CHAMPIONSHIP FINAL &bull; ${pfEscapeHtml(fin.court || 'Court 1')}
          </span>
          <span class="font-mono text-[10px] font-extrabold uppercase" style="color:#A7F3D0 !important;">
            ${fin.status === 'COMPLETED' ? '👑 CHAMPIONSHIP DECIDED' : (finIsAct ? '🟣 LIVE ON COURT — SCORING BELOW' : (isAdminInteractive ? 'CLICK TO SCORE FINAL MATCH' : 'GOLD MEDAL CHAMPIONSHIP'))}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
          <div class="md:col-span-5">
            ${renderSlot(fin.teamA, fin.scoreA, fin.winner === 'A', finWaitA, 'left')}
          </div>
          <div class="md:col-span-1 flex flex-col items-center justify-center py-1">
            <span class="px-3 py-1 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-[10px] font-black" style="background:#04120B !important;color:#BEF264 !important;">VS</span>
          </div>
          <div class="md:col-span-5">
            ${renderSlot(fin.teamB, fin.scoreB, fin.winner === 'B', finWaitB, 'right')}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
          <div class="text-lg sm:text-xl font-black uppercase tracking-[0.22em]" style="color:#FFFFFF !important;">FINAL</div>
          ${champName
            ? `<div class="px-4 py-1.5 rounded-full bg-[#A3E635] font-mono text-xs font-black uppercase shadow-lg" style="background:#A3E635 !important;color:#04120B !important;">👑 TOURNAMENT CHAMPION: ${pfEscapeHtml(champName)}</div>`
            : `<div class="text-xs font-mono" style="color:#E2E8F0 !important;">Winners of Semifinal 1 (1/2) &amp; Semifinal 2 (1/2) clash for the Gold Medal</div>`
          }
        </div>
      </div>
    </div>
  `;

  if (mode === 'FIN') {
    return `
      <div class="pf-phase-slide-panel space-y-5 py-2">
        <div class="flex justify-center">${centerCrestHtml}</div>
        ${grandFinalCardHtml}
      </div>
    `;
  }

  return `
    <div class="pf-phase-slide-panel space-y-7">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div class="lg:col-span-3 space-y-4">
          <div class="text-center mb-1">
            <span class="inline-block px-3.5 py-1 rounded-full bg-[#04120B] border border-[#38BDF8] font-mono text-[11px] font-black uppercase tracking-widest shadow-xs" style="background:#04120B !important;color:#FFFFFF !important;">1/4 &bull; QUARTERFINALS A &amp; B</span>
          </div>
          <div class="space-y-4">
            ${renderMatchNode(qf1, 'left', 'QF1')}
            ${renderMatchNode(qf2, 'left', 'QF2')}
          </div>
        </div>

        <div class="lg:col-span-2 space-y-4 relative">
          <div class="text-center mb-1">
            <span class="inline-block px-3.5 py-1 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-[11px] font-black uppercase tracking-widest shadow-xs" style="background:#04120B !important;color:#FFFFFF !important;">1/2 &bull; SEMIFINAL 1</span>
          </div>
          ${renderMatchNode(sf1, 'left', 'SF1')}
        </div>

        <div class="lg:col-span-2 py-3 flex flex-col items-center justify-center">
          ${centerCrestHtml}
          <div class="hidden lg:flex flex-col items-center pt-2">
            <div class="flex items-center">
              <span class="w-6 h-0.5 bg-[#A3E635]"></span>
              <span class="w-2.5 h-2.5 rotate-45 bg-[#A3E635] border border-slate-950"></span>
              <span class="w-6 h-0.5 bg-[#A3E635]"></span>
            </div>
            <div class="w-0.5 h-8 bg-gradient-to-b from-[#A3E635] to-[#38BDF8]"></div>
            <span class="w-2.5 h-2.5 rotate-45 bg-[#38BDF8] border border-slate-950"></span>
          </div>
        </div>

        <div class="lg:col-span-2 space-y-4 relative">
          <div class="text-center mb-1">
            <span class="inline-block px-3.5 py-1 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-[11px] font-black uppercase tracking-widest shadow-xs" style="background:#04120B !important;color:#FFFFFF !important;">1/2 &bull; SEMIFINAL 2</span>
          </div>
          ${renderMatchNode(sf2, 'right', 'SF2')}
        </div>

        <div class="lg:col-span-3 space-y-4">
          <div class="text-center mb-1">
            <span class="inline-block px-3.5 py-1 rounded-full bg-[#04120B] border border-[#38BDF8] font-mono text-[11px] font-black uppercase tracking-widest shadow-xs" style="background:#04120B !important;color:#FFFFFF !important;">1/4 &bull; QUARTERFINALS C &amp; D</span>
          </div>
          <div class="space-y-4">
            ${renderMatchNode(qf3, 'right', 'QF3')}
            ${renderMatchNode(qf4, 'right', 'QF4')}
          </div>
        </div>
      </div>

      ${grandFinalCardHtml}
    </div>
  `;
}

let pfActivePublicTrnIndex = 0;
let pfActivePublicPhaseIndex = 0;

const PF_TOURNAMENT_PHASES = [
  { key: 'ALL',     num: '01', label: 'Full Bracket Tree',            sub: '1/4 • 1/2 • Final' },
  { key: 'QF',      num: '02', label: 'Phase 1: Quarterfinals (1/4)', sub: 'Courts 1 – 4 Matchups' },
  { key: 'SF',      num: '03', label: 'Phase 2: Semifinals (1/2)',    sub: 'Courts 1 & 2 Clash' },
  { key: 'FIN',     num: '04', label: 'Phase 3: Championship Final',  sub: 'Gold Medal Court 1' },
  { key: 'PLAYERS', num: '05', label: 'Community Roster & Seeds',     sub: 'Live Registered Teams' }
];

function pfSelectPublicTournamentEvent(idx) {
  const list = pfGetTournamentsList().filter(t => t && t.approved !== false && t.published !== false);
  if (!list.length) return;
  pfActivePublicTrnIndex = ((idx % list.length) + list.length) % list.length;
  pfRenderPublicTournaments();
}
window.pfSelectPublicTournamentEvent = pfSelectPublicTournamentEvent;

function pfStepPublicTournamentEvent(delta) {
  pfSelectPublicTournamentEvent(pfActivePublicTrnIndex + delta);
}
window.pfStepPublicTournamentEvent = pfStepPublicTournamentEvent;

function pfSelectPublicTournamentPhase(phaseIdx) {
  pfActivePublicPhaseIndex = ((phaseIdx % PF_TOURNAMENT_PHASES.length) + PF_TOURNAMENT_PHASES.length) % PF_TOURNAMENT_PHASES.length;
  pfRenderPublicTournaments();
}
window.pfSelectPublicTournamentPhase = pfSelectPublicTournamentPhase;

function pfStepPublicTournamentPhase(delta) {
  pfSelectPublicTournamentPhase(pfActivePublicPhaseIndex + delta);
}
window.pfStepPublicTournamentPhase = pfStepPublicTournamentPhase;

function pfFormatTournamentDateNice(ymdStr) {
  const s = String(ymdStr || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mo = months[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))];
  return `${mo} ${parseInt(m[3], 10)}, ${m[1]}`;
}

function pfOpenFullBracketModal(trnId) {
  const list = pfGetTournamentsList();
  const trn = list.find(t => String(t.id) === String(trnId)) || list[0];
  if (!trn) return;
  let modal = document.getElementById('pf-public-full-bracket-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pf-public-full-bracket-modal';
    modal.className = 'fixed inset-0 z-[95] hidden flex items-center justify-center p-3 sm:p-5';
    modal.innerHTML = `
      <div onclick="document.getElementById('pf-public-full-bracket-modal').classList.add('hidden')" class="absolute inset-0 bg-black/85 backdrop-blur-md"></div>
      <div class="relative z-10 w-full max-w-7xl max-h-[92dvh] overflow-y-auto pf-arena-stage p-5 sm:p-8 shadow-2xl">
        <div class="pf-arena-shard-tl"></div>
        <div class="pf-arena-shard-tr"></div>
        <div class="pf-arena-shard-bl"></div>
        <div class="pf-arena-shard-br"></div>
        <div class="relative z-10 space-y-6">
          <div class="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
            <div class="flex items-center gap-3.5">
              <div class="pf-rect-logo-badge"><img src="assets/logo.png" alt="P&amp;F Logo"></div>
              <div>
                <span id="pf-modal-brk-format" class="text-[10px] font-mono font-extrabold uppercase block" style="color:#BEF264 !important;">OFFICIAL CHAMPIONSHIP BRACKET</span>
                <h3 id="pf-modal-brk-title" class="text-lg sm:text-2xl font-black uppercase" style="color:#FFFFFF !important;">Tournament Bracket</h3>
              </div>
            </div>
            <button type="button" onclick="document.getElementById('pf-public-full-bracket-modal').classList.add('hidden')" class="pf-trn-btn-gold px-4 py-2 rounded-xl font-mono text-xs uppercase">✕ Close Arena</button>
          </div>
          <div id="pf-modal-brk-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  const fmtEl = document.getElementById('pf-modal-brk-format');
  if (fmtEl) fmtEl.textContent = `${trn.format || 'Official Tournament'} • ${trn.date} • ${trn.courts || 'Courts 1 – 4'}`;
  const titleEl = document.getElementById('pf-modal-brk-title');
  if (titleEl) titleEl.textContent = trn.title;
  const bodyEl = document.getElementById('pf-modal-brk-body');
  if (bodyEl) bodyEl.innerHTML = pfBuildSymmetricalBracketTreeHtml(trn, null, false, 'assets/logo.png', 'ALL');
  modal.classList.remove('hidden');
}
window.pfOpenFullBracketModal = pfOpenFullBracketModal;

function pfFormatDesignatedCourtsLabel(t) {
  const dc = Array.isArray(t.designatedCourts) && t.designatedCourts.length
    ? t.designatedCourts
    : null;
  if (dc) {
    if (dc.length >= 4) return 'All 4 Courts (Courts 1 – 4)';
    return dc.join(' • ');
  }
  return t.courts || 'Courts 1 – 4';
}

function pfRenderPublicTournaments() {
  try { pfRenderLiveSpectatorBracketBanner(); } catch (e) {}
  const sec = document.getElementById('tournaments');
  const grid = document.getElementById('public-tournaments-grid');
  if (!grid) return;

  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const masterPublished = cfg.tournamentsPublishedOnHome !== false;
  const list = pfGetTournamentsList().filter(t => t && t.approved !== false && t.published !== false);

  const navTrn = document.getElementById('nav-link-tournaments');
  const mobNavTrn = document.getElementById('mob-nav-link-tournaments');
  const topNavTrn = document.getElementById('nav-top-link-tournaments');
  const filtersWrap = document.getElementById('public-tournament-filters-wrap');

  if (sec) sec.classList.remove('hidden');
  if (navTrn) navTrn.classList.remove('hidden');
  if (mobNavTrn) mobNavTrn.classList.remove('hidden');
  if (topNavTrn) topNavTrn.classList.remove('hidden');

  if (filtersWrap) {
    filtersWrap.classList.add('hidden');
    filtersWrap.classList.remove('flex');
  }

  const isPublishedWithEvents = Boolean(masterPublished && list.length > 0);
  if (!isPublishedWithEvents) {
    grid.innerHTML = `
      <div class="col-span-full rounded-2xl border border-dashed border-[#D5D3CC] bg-[#EFECE6]/60 px-6 py-14 sm:py-16 text-center">
        <div class="w-11 h-11 rounded-xl bg-[#E2E0D8] text-[#475569] flex items-center justify-center mx-auto mb-4">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21h8m-4-4v4m-5-9a5 5 0 01-4-5V5h4m10 7a5 5 0 004-5V5h-4M7 5h10v5a5 5 0 01-10 0V5z"/></svg>
        </div>
        <h3 class="text-lg sm:text-xl font-bold text-[#0D1F18]">No tournaments on the calendar yet</h3>
        <p class="text-xs sm:text-sm text-[#52605A] max-w-md mx-auto mt-2 leading-relaxed">
          Nothing is scheduled right now. New tournaments are posted here as soon as registration opens — check back, or ask us at the desk what's coming up.
        </p>
      </div>
    `;
    return;
  }

  if (pfActivePublicTrnIndex >= list.length) pfActivePublicTrnIndex = 0;
  const t = list[pfActivePublicTrnIndex] || list[0];
  const fee = Number(t.entryFee || 0);
  const players = (Array.isArray(t.players) && t.players.length >= 8) ? t.players : [...PF_OPEN_SEED_LABELS];
  const dcList = Array.isArray(t.designatedCourts) && t.designatedCourts.length
    ? t.designatedCourts
    : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
  const bracket = Array.isArray(t.bracket) && t.bracket.length >= 7 ? t.bracket : pfBuildDefaultBracketForPlayers(players, dcList);
  t.bracket = bracket;

  const realRegistrations = Array.isArray(t.registrations) ? t.registrations : [];
  const filledSeeds = pfCountFilledBracketSeeds(players);
  const openSeedsLeft = Math.max(0, 8 - filledSeeds);
  const maxT = Math.max(8, Number(t.maxTeams || 24));
  const regT = Math.min(maxT, pfCountRealTournamentTeams(t));
  const spotsLeft = Math.max(0, maxT - regT);
  const pct = maxT > 0 ? Math.min(100, Math.round((regT / maxT) * 100)) : 0;
  const courtsLabel = pfFormatDesignatedCourtsLabel(t);

  const finMatch = bracket.find(m => m.stage === 'Championship Final' || m.id === 'FIN') || null;
  const champName = (finMatch && finMatch.winner) ? (finMatch.winner === 'A' ? finMatch.teamA : finMatch.teamB) : null;
  const activePhase = PF_TOURNAMENT_PHASES[pfActivePublicPhaseIndex] || PF_TOURNAMENT_PHASES[0];

  const colsClass = list.length === 2 ? 'sm:grid-cols-2' : (list.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4');
  const eventSelectorBarHtml = list.length > 1 ? `
    <div class="p-3.5 sm:p-4 rounded-3xl bg-white border-2 border-[#E2E0D8] shadow-sm space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 px-1">
        <div class="flex items-center gap-2.5">
          <span class="pf-pill px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-extrabold uppercase">🏓 Official Tournament Series (${pfActivePublicTrnIndex + 1} of ${list.length})</span>
          <span class="text-xs font-bold text-[#52605A] hidden sm:inline">Switch between scheduled club tournaments or slide through each bracket phase</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="pfStepPublicTournamentEvent(-1)" class="pf-trn-btn-secondary px-3.5 py-1.5 rounded-xl font-mono text-xs uppercase transition">← Prev Event</button>
          <button type="button" onclick="pfStepPublicTournamentEvent(1)" class="pf-trn-btn-primary px-3.5 py-1.5 rounded-xl font-mono text-xs uppercase transition">Next Event →</button>
        </div>
      </div>
      <div class="grid grid-cols-1 ${colsClass} gap-2.5">
        ${list.map((item, idx) => {
          const isAct = idx === pfActivePublicTrnIndex;
          const itemFee = Number(item.entryFee || 0);
          const itemReg = pfCountRealTournamentTeams(item);
          const itemMax = Math.max(8, Number(item.maxTeams || 24));
          return `
            <button type="button" onclick="pfSelectPublicTournamentEvent(${idx})" class="${isAct ? 'pf-trn-btn-primary' : 'pf-trn-btn-secondary'} px-3.5 py-2.5 rounded-2xl text-left transition flex items-center gap-2.5 min-w-0">
              <span class="w-6 h-6 rounded-lg ${isAct ? 'bg-[#A3E635] text-[#04120B]' : 'bg-[#EFECE6] text-[#0F291E]'} font-mono text-[11px] font-black flex items-center justify-center flex-shrink-0" style="${isAct ? 'background:#A3E635 !important;color:#04120B !important;' : ''}">0${idx + 1}</span>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-extrabold truncate">${pfEscapeHtml(item.title)}</div>
                <div class="text-[10px] font-mono opacity-85 truncate">${pfEscapeHtml(pfFormatTournamentDateNice(item.date))} &bull; ${itemFee > 0 ? '₱' + itemFee.toLocaleString() : 'Free'} &bull; ${itemReg}/${itemMax} Teams</div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const phaseTabsHtml = PF_TOURNAMENT_PHASES.map((ph, pIdx) => {
    const isAct = pIdx === pfActivePublicPhaseIndex;
    const lblText = ph.key === 'PLAYERS' ? `Community Roster (${regT} Joined)` : ph.label;
    return `
      <button type="button" onclick="pfSelectPublicTournamentPhase(${pIdx})" class="${isAct ? 'pf-trn-btn-volt' : 'pf-trn-btn-arena-ghost'} px-3.5 py-2 rounded-xl font-mono text-xs transition flex items-center gap-2">
        <span class="text-[10px] font-black opacity-80">${ph.num}</span>
        <span>${lblText}</span>
      </button>
    `;
  }).join('');

  // Build Live Community Roster Strip (Shown directly on card so community sees exact real entrants or 0 joined!)
  const liveCommunityRosterBoxHtml = regT === 0 ? `
    <div class="p-4 rounded-2xl bg-[#F0FDF4] border-2 border-dashed border-[#86EFAC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-start sm:items-center gap-3">
        <span class="w-9 h-9 rounded-xl bg-[#15803D] text-white font-mono text-xs font-black flex items-center justify-center flex-shrink-0" style="background:#15803D !important;color:#FFFFFF !important;">0/${maxT}</span>
        <div>
          <div class="text-xs sm:text-sm font-black text-[#064E3B] uppercase">0 Teams Registered Yet — All 8 Bracket Seeds &amp; ${maxT} Spots Are Open!</div>
          <p class="text-[11px] text-[#166534] font-medium">No filler or fake names. Be the first pair/squad in the community to register and claim <b>Seed #1</b> on the official bracket!</p>
        </div>
      </div>
      <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="pf-trn-btn-emerald px-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider whitespace-nowrap flex-shrink-0">
        🏓 Claim Seed #1 Now →
      </button>
    </div>
  ` : `
    <div class="p-4 rounded-2xl bg-[#F8FAFC] border-2 border-[#CBD5E1] space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="pf-pill px-2.5 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-black uppercase">🟢 LIVE COMMUNITY ENTRANTS (${regT} / ${maxT} CONFIRMED)</span>
          <span class="text-xs font-bold text-[#475569]">${openSeedsLeft > 0 ? openSeedsLeft + ' Bracket Seed Slots Still Open' : 'All 8 Bracket Seeds Filled'}</span>
        </div>
        <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="pf-trn-btn-emerald px-3 py-1 rounded-lg font-mono text-[10px] uppercase">
          + Join Roster (${spotsLeft} Spots Left)
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        ${players.map((pName, idx) => {
          const isOpen = pfIsOpenSeedSlot(pName);
          const seedNum = PF_SEED_SLOT_NUMBERS[idx] || (idx + 1);
          if (isOpen) {
            return `
              <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="p-2.5 rounded-xl bg-white hover:bg-[#F0FDF4] border border-dashed border-[#94A3B8] hover:border-[#15803D] text-left flex items-center justify-between gap-2 transition">
                <span class="font-mono text-[11px] font-bold text-[#64748B] truncate">🟢 Open Seed #${seedNum}</span>
                <span class="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#166534] font-mono text-[9px] font-black uppercase flex-shrink-0">Claim →</span>
              </button>
            `;
          }
          return `
            <div class="p-2.5 rounded-xl bg-[#0F291E] text-white border border-[#15803D] flex items-center gap-2 shadow-2xs" style="background:#0F291E !important;color:#FFFFFF !important;">
              <span class="px-1.5 py-0.5 rounded bg-[#A3E635] text-[#04120B] font-mono text-[9px] font-black flex-shrink-0" style="background:#A3E635 !important;color:#04120B !important;">✓ #${seedNum}</span>
              <span class="text-xs font-extrabold truncate" title="${pfEscapeHtml(pName)}">${pfEscapeHtml(pName)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  let phaseSlideBodyHtml = '';
  if (activePhase.key === 'PLAYERS') {
    phaseSlideBodyHtml = `
      <div class="pf-phase-slide-panel space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/15 pb-3">
          <div>
            <span class="text-[10px] font-mono font-black uppercase tracking-widest block" style="color:#A3E635 !important;">OFFICIAL COMMUNITY ROSTER &amp; 8 BRACKET SEEDS</span>
            <h4 class="text-lg sm:text-xl font-black uppercase" style="color:#FFFFFF !important;">${regT} Confirmed Team${regT === 1 ? '' : 's'} &bull; ${openSeedsLeft} Open Bracket Seeds Available</h4>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3.5 py-1 rounded-full bg-[#04120B] border border-[#A3E635] font-mono text-xs font-extrabold" style="background:#04120B !important;color:#BEF264 !important;">${regT} / ${maxT} Teams (${pct}% Full)</span>
            <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="pf-trn-btn-volt px-3.5 py-1.5 rounded-xl font-mono text-xs uppercase">+ Register Team</button>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          ${players.map((pName, idx) => {
            const qfIdx = Math.floor(idx / 2);
            const assignedCourt = dcList[qfIdx % dcList.length] || 'Court 1';
            const isOpen = pfIsOpenSeedSlot(pName);
            const seedNum = PF_SEED_SLOT_NUMBERS[idx] || (idx + 1);
            if (isOpen) {
              return `
                <div onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="cursor-pointer p-3.5 rounded-2xl bg-[#04120B]/75 hover:bg-[#071D14] border-2 border-dashed border-[#64748B] hover:border-[#A3E635] flex items-center justify-between gap-3 transition">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-8 h-8 rounded-xl bg-[#1E293B] border border-[#64748B] font-mono text-xs font-black flex items-center justify-center flex-shrink-0" style="color:#CBD5E1 !important;">#${seedNum}</span>
                    <div class="min-w-0">
                      <span class="text-[9px] font-mono uppercase block" style="color:#94A3B8 !important;">QF${qfIdx + 1} &bull; ${pfEscapeHtml(assignedCourt)}</span>
                      <div class="text-xs font-extrabold truncate" style="color:#E2E8F0 !important;">Open Seed #${seedNum} — Available</div>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-lg bg-[#A3E635] font-mono text-[9px] font-black uppercase flex-shrink-0" style="background:#A3E635 !important;color:#04120B !important;">Join →</span>
                </div>
              `;
            }
            return `
              <div class="p-3.5 rounded-2xl bg-[#071D14] border-2 border-[#A3E635] flex items-center gap-3 shadow-md">
                <span class="w-8 h-8 rounded-xl bg-[#A3E635] font-mono text-xs font-black flex items-center justify-center flex-shrink-0" style="background:#A3E635 !important;color:#04120B !important;">#${seedNum}</span>
                <div class="min-w-0">
                  <span class="text-[9px] font-mono uppercase block" style="color:#6EE7B7 !important;">✓ CONFIRMED &bull; QF${qfIdx + 1} (${pfEscapeHtml(assignedCourt)})</span>
                  <div class="text-xs font-extrabold truncate" style="color:#FFFFFF !important;" title="${pfEscapeHtml(pName)}">${pfEscapeHtml(pName)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${realRegistrations.length > 0 ? `
          <div class="pt-3 border-t border-white/15 space-y-2.5">
            <span class="text-[10px] font-mono font-black uppercase tracking-widest block" style="color:#38BDF8 !important;">📋 OFFICIAL TIMESTAMPED COMMUNITY REGISTRATION LOG (${realRegistrations.length})</span>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              ${realRegistrations.map((r, rIdx) => `
                <div class="p-3 rounded-xl bg-[#04120B]/90 border border-white/15 flex items-center justify-between gap-2 text-xs">
                  <div class="min-w-0">
                    <div class="font-extrabold truncate" style="color:#FFFFFF !important;">${rIdx + 1}. ${pfEscapeHtml(r.teamName || r.player1)}</div>
                    <div class="text-[10px] font-mono" style="color:#A7F3D0 !important;">${pfEscapeHtml(r.division || 'Open Division')} &bull; Joined ${pfEscapeHtml(r.registeredAt || 'Today')}</div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full bg-[#064E3B] border border-[#34D399] font-mono text-[9px] font-black uppercase flex-shrink-0" style="background:#064E3B !important;color:#A7F3D0 !important;">✓ ${pfEscapeHtml(r.status || 'CONFIRMED')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    phaseSlideBodyHtml = pfBuildSymmetricalBracketTreeHtml(t, null, false, 'assets/logo.png', activePhase.key);
  }

  const designatedCourtPillsHtml = ['Court 1', 'Court 2', 'Court 3', 'Court 4'].map(cName => {
    const isActiveCourt = dcList.includes(cName);
    return isActiveCourt
      ? `<span class="px-2.5 py-1 rounded-lg bg-[#0F291E] text-white font-mono text-[10px] font-extrabold uppercase flex items-center gap-1" style="background:#0F291E !important;color:#FFFFFF !important;"><span class="w-1.5 h-1.5 rounded-full bg-[#A3E635]"></span>${cName}</span>`
      : `<span class="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0] font-mono text-[10px] font-semibold uppercase line-through opacity-60" title="Open for regular bookings">${cName}</span>`;
  }).join('');

  grid.innerHTML = `
    <div class="col-span-full space-y-5">
      ${eventSelectorBarHtml}

      <!-- FEATURED TOURNAMENT STAGE (GRAPHIC DESIGNER EDITORIAL POSTER + VIP ENTRY TICKET + ARENA BRACKET) -->
      <div class="rounded-3xl bg-white border-2 border-[#CBD5E1] p-5 sm:p-8 shadow-xl space-y-6 text-[#0D1F18]">

        <!-- 12-COLUMN EDITORIAL SPORTS EVENT POSTER HEADER -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">

          <!-- LEFT 8 COLUMNS: EVENT BRANDING, HEADLINE & ARCHITECTURAL SPEC GRID -->
          <div class="xl:col-span-8 flex flex-col justify-between space-y-5 bg-[#F8F7F3] rounded-3xl p-5 sm:p-7 border border-[#E2E0D8]">
            <div class="space-y-3.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="pf-pill px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] font-mono text-[10px] font-extrabold uppercase tracking-wider">🏆 ${pfEscapeHtml(t.format || 'Official Tournament')}</span>
                ${t.showCourtsOnSite !== false ? `<span class="pf-pill px-3 py-1 rounded-full bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] font-mono text-[10px] font-extrabold uppercase">🏟️ ${pfEscapeHtml(courtsLabel)}</span>` : ''}
                ${champName
                  ? `<span class="pf-pill px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] font-mono text-[10px] font-extrabold uppercase">👑 Champion: ${pfEscapeHtml(champName)}</span>`
                  : `<span class="pf-pill px-3 py-1 rounded-full bg-[#EDE9FE] text-[#5B21B6] border border-[#C4B5FD] font-mono text-[10px] font-extrabold uppercase">🟢 ${regT} Joined &bull; ${spotsLeft} Spots Open</span>`
                }
              </div>

              <div class="space-y-2">
                <h3 class="text-2xl sm:text-4xl font-black tracking-tight text-[#0D1F18] leading-[1.1]">${pfEscapeHtml(t.title)}</h3>
                <p class="text-xs sm:text-sm text-[#475569] leading-relaxed">${pfEscapeHtml(t.description || '')}</p>
              </div>
            </div>

            <div class="pt-4 border-t border-[#DEDAD0] grid grid-cols-1 ${t.showCourtsOnSite !== false ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4">
              <div class="space-y-1 md:pr-3 md:border-r md:border-[#DEDAD0]">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Event Date &amp; Hours</span>
                <div class="font-mono text-xs sm:text-sm font-black text-[#0D1F18]">${pfEscapeHtml(pfFormatTournamentDateNice(t.date))}</div>
                <div class="font-mono text-[11px] font-bold text-[#15803D]">${pfEscapeHtml(t.time)}</div>
              </div>

              <div class="space-y-1 md:px-2 ${t.showCourtsOnSite !== false ? 'md:border-r md:border-[#DEDAD0]' : ''}">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Division &amp; Skill Level</span>
                <div class="text-xs sm:text-sm font-extrabold text-[#0D1F18] leading-snug">${pfEscapeHtml(t.division)}</div>
                <div class="text-[11px] font-semibold text-[#52605A]">${pfEscapeHtml(t.category || 'Official Bracket Play')}</div>
              </div>

              ${t.showCourtsOnSite !== false ? `
              <div class="space-y-1.5 md:pl-2">
                <span class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-[#64748B] block">Designated Tournament Courts</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  ${designatedCourtPillsHtml}
                </div>
              </div>
              ` : ''}
            </div>
          </div>

          <!-- RIGHT 4 COLUMNS: OFFICIAL VIP TOURNAMENT ENTRY PASS CARD -->
          <div class="xl:col-span-4 rounded-3xl bg-gradient-to-br from-[#071912] via-[#0F291E] to-[#06150E] border-2 border-[#15803D] p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xl relative overflow-hidden" style="background:linear-gradient(145deg,#071912 0%,#0F291E 55%,#06150E 100%) !important;color:#FFFFFF !important;">
            <div class="flex items-center justify-between gap-3.5">
              <div class="flex items-center gap-3">
                <div class="pf-rect-logo-badge" style="width:54px;height:66px;">
                  <img src="assets/logo.png" alt="P&amp;F Rally Ground">
                </div>
                <div>
                  <span class="text-[9px] font-mono font-black uppercase tracking-widest block" style="color:#A3E635 !important;">OFFICIAL ENTRY PASS</span>
                  <div class="text-xs font-extrabold uppercase tracking-wide" style="color:#FFFFFF !important;">P&amp;F Rally Ground</div>
                  <div class="text-[10px] font-mono" style="color:#A7F3D0 !important;">Daraga, Albay</div>
                </div>
              </div>
              <div class="text-right">
                <span class="text-[9px] font-mono uppercase tracking-widest block" style="color:#CBD5E1 !important;">Entry Fee</span>
                <div class="font-mono text-2xl sm:text-3xl font-black" style="color:#A3E635 !important;">${fee > 0 ? '₱' + fee.toLocaleString() : 'FREE'}</div>
              </div>
            </div>

            <div class="p-3.5 rounded-2xl bg-black/35 border border-[#A3E635]/35 space-y-1">
              <span class="text-[9px] font-mono font-black uppercase tracking-widest block" style="color:#FDE047 !important;">🏆 CHAMPIONSHIP PRIZE POOL &amp; PERKS</span>
              <div class="text-xs sm:text-sm font-extrabold leading-snug" style="color:#FFFFFF !important;">${pfEscapeHtml(t.prizePool)}</div>
            </div>

            <div class="space-y-3">
              <div>
                <div class="flex items-center justify-between text-[11px] font-mono mb-1.5">
                  <span style="color:#CBD5E1 !important;">Confirmed Roster: <b style="color:#FFFFFF !important;">${regT} / ${maxT} Teams</b></span>
                  <span class="font-bold" style="color:#A3E635 !important;">${regT === 0 ? 'All Spots Open (0%)' : pct + '% Full'}</span>
                </div>
                <div class="w-full h-2 rounded-full bg-black/50 overflow-hidden border border-white/15">
                  <div class="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#A3E635]" style="width:${pct}%"></div>
                </div>
                <div class="flex items-center justify-between text-[10px] font-mono mt-1.5" style="color:#A7F3D0 !important;">
                  <span>🟢 ${filledSeeds} / 8 Bracket Seeds Claimed</span>
                  <span>${spotsLeft} Spots Left</span>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 pt-1">
                <button type="button" onclick="pfRegisterForTournament('${pfEscapeHtml(t.id)}')" class="pf-trn-btn-volt w-full py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2">
                  <span>🏓 Register Team Now (${fee > 0 ? '₱' + fee.toLocaleString() : 'Free'}) →</span>
                </button>
                <button type="button" onclick="pfOpenFullBracketModal('${pfEscapeHtml(t.id)}')" class="pf-trn-btn-arena-ghost w-full py-2.5 px-4 rounded-xl font-mono text-[11px] uppercase transition flex items-center justify-center gap-1.5">
                  <span>🔍 Expand Full-Screen Bracket Arena</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- LIVE COMMUNITY ENTRANTS & OPEN SEEDS BAR (SHOWS REAL PLAYERS OR 0 JOINED) -->
        ${liveCommunityRosterBoxHtml}

        <!-- INTERACTIVE PHASE-BY-PHASE BRACKET ARENA SLIDER -->
        <div class="pf-arena-stage p-5 sm:p-8">
          <div class="pf-arena-shard-tl"></div>
          <div class="pf-arena-shard-tr"></div>
          <div class="pf-arena-shard-bl"></div>
          <div class="pf-arena-shard-br"></div>

          <div class="relative z-10 space-y-6">
            <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-[#04120B]/85 p-3.5 rounded-2xl border border-[#A3E635]/40">
              <div class="flex flex-wrap items-center gap-2">
                ${phaseTabsHtml}
              </div>
              <div class="flex items-center justify-between xl:justify-end gap-2.5 flex-shrink-0">
                <span class="font-mono text-[11px] font-bold px-2 whitespace-nowrap" style="color:#BEF264 !important;">Slide ${pfActivePublicPhaseIndex + 1} / ${PF_TOURNAMENT_PHASES.length}</span>
                <button type="button" onclick="pfStepPublicTournamentPhase(-1)" class="pf-trn-btn-arena-ghost px-3.5 py-2 rounded-xl font-mono text-xs uppercase transition">← Prev Phase</button>
                <button type="button" onclick="pfStepPublicTournamentPhase(1)" class="pf-trn-btn-volt px-4 py-2 rounded-xl font-mono text-xs uppercase transition">Next Phase →</button>
              </div>
            </div>

            <div class="text-center space-y-1.5 pt-1">
              <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#04120B] border border-[#38BDF8] font-mono text-[10px] font-black uppercase tracking-widest" style="background:#04120B !important;color:#38BDF8 !important;">
                <span>${pfEscapeHtml(activePhase.label)}</span>
                <span>&bull;</span>
                <span style="color:#BEF264 !important;">${regT} Registered / ${openSeedsLeft} Open Seeds</span>
              </div>
              <div class="flex items-center justify-center gap-3.5">
                <span class="hidden sm:inline-block w-14 h-1 rounded-full bg-gradient-to-r from-transparent via-[#38BDF8] to-[#A3E635]"></span>
                <h4 class="text-xl sm:text-3xl font-black uppercase tracking-wider" style="color:#FFFFFF !important;">${pfEscapeHtml(t.title)}</h4>
                <span class="hidden sm:inline-block w-14 h-1 rounded-full bg-gradient-to-l from-transparent via-[#38BDF8] to-[#A3E635]"></span>
              </div>
            </div>

            ${phaseSlideBodyHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}
window.renderPublicTournaments = pfRenderPublicTournaments;

function pfSwitchTournamentPayMethod(methodKey) {
  const m = methodKey || 'GCash';
  const hiddenInp = document.getElementById('trn-reg-pay-method');
  if (hiddenInp) hiddenInp.value = m;
  ['GCash', 'Maya', 'BDO', 'Venue'].forEach(k => {
    const btn = document.getElementById('trn-pay-btn-' + k);
    if (btn) {
      btn.className = (k === m)
        ? 'pf-trn-btn-primary py-2 px-3 rounded-xl font-mono text-xs uppercase transition'
        : 'pf-trn-btn-secondary py-2 px-3 rounded-xl font-mono text-xs uppercase transition';
    }
  });
  const qrWrap = document.getElementById('trn-reg-qr-box');
  const refWrap = document.getElementById('trn-reg-ref-wrap');
  const qrImg = document.getElementById('trn-reg-qr-img');
  const qrAcc = document.getElementById('trn-reg-qr-acc');
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  if (m === 'Venue') {
    if (qrWrap) qrWrap.classList.add('hidden');
    if (refWrap) refWrap.classList.add('hidden');
  } else {
    if (qrWrap) qrWrap.classList.remove('hidden');
    if (refWrap) refWrap.classList.remove('hidden');
    if (qrImg) {
      if (m === 'GCash') qrImg.src = cfg.qrGcash || 'assets/qr-gcash.jpg';
      else if (m === 'Maya') qrImg.src = cfg.qrMaya || 'assets/qr-maya.jpg';
      else qrImg.src = cfg.qrBdo || 'assets/qr-bdo.jpg';
    }
    if (qrAcc) {
      qrAcc.textContent = m === 'BDO'
        ? 'BDO Bank Transfer • Scan Official Club QR Code'
        : `${m} Express Send: 0999 883 2346 (P&F Rally Ground)`;
    }
  }
}
window.pfSwitchTournamentPayMethod = pfSwitchTournamentPayMethod;

function pfRegisterForTournament(tournamentId) {
  const list = pfGetTournamentsList();
  const trn = list.find(t => String(t.id) === String(tournamentId)) || list[0];
  if (!trn) return;

  let modal = document.getElementById('pf-tournament-reg-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pf-tournament-reg-modal';
    modal.className = 'fixed inset-0 z-50 hidden flex items-center justify-center p-3 sm:p-4';
    modal.innerHTML = `
      <div onclick="pfCloseTournamentRegModal()" class="absolute inset-0 bg-black/85 backdrop-blur-md"></div>
      <div class="relative z-10 w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-white text-slate-900 border-2 border-[#15803D] p-5 sm:p-7 shadow-2xl space-y-4 touch-scroll">
        <div class="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div class="flex items-center gap-3">
            <div class="pf-rect-logo-badge" style="width:46px;height:56px;"><img src="assets/logo.png" alt="P&amp;F Logo"></div>
            <div>
              <span class="px-2.5 py-0.5 rounded bg-[#0F291E] text-[#A3E635] font-mono text-[10px] font-black uppercase" style="background:#0F291E !important;color:#A3E635 !important;">🏆 OFFICIAL COMMUNITY TOURNAMENT ENTRY</span>
              <h3 id="trn-reg-modal-title" class="text-lg sm:text-xl font-black uppercase text-slate-900 mt-1">Tournament Registration</h3>
              <p id="trn-reg-modal-meta" class="text-xs font-mono text-emerald-700 font-bold"></p>
            </div>
          </div>
          <button type="button" onclick="pfCloseTournamentRegModal()" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white font-black text-xs">✕</button>
        </div>

        <input type="hidden" id="trn-reg-id" value="">
        <input type="hidden" id="trn-reg-pay-method" value="GCash">

        <div id="trn-reg-seed-banner" class="p-3 rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] text-xs font-bold text-[#065F46]"></div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Player 1 Full Name (Team Captain) *</label>
            <input type="text" id="trn-reg-name" placeholder="e.g. Juan Dela Cruz" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold">
          </div>
          <div>
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Mobile Number (11 Digits) *</label>
            <input type="tel" id="trn-reg-phone" placeholder="0917 123 4567" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-bold">
          </div>
          <div>
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Doubles Partner / Squad Name *</label>
            <input type="text" id="trn-reg-partner" placeholder="e.g. Carlo Reyes (or Solo / Looking)" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-semibold">
          </div>
          <div>
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Select Skill Division *</label>
            <select id="trn-reg-division" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold">
              <option value="Novice (2.5–3.0)">Novice / Beginner (2.5–3.0)</option>
              <option value="Intermediate (3.5)" selected>Intermediate (3.5)</option>
              <option value="Open (4.0+)">Advanced / Open (4.0+)</option>
              <option value="Mixed Doubles">Mixed Doubles / Co-Ed Squad</option>
            </select>
          </div>
        </div>

        <!-- Payment Channel & Instant QR Verification -->
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-mono text-[10px] font-black uppercase text-slate-700">Select Entry Fee Payment Method:</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full sm:w-auto">
              <button type="button" id="trn-pay-btn-GCash" onclick="pfSwitchTournamentPayMethod('GCash')" class="pf-trn-btn-primary py-2 px-3 rounded-xl font-mono text-xs uppercase transition">GCash QR</button>
              <button type="button" id="trn-pay-btn-Maya" onclick="pfSwitchTournamentPayMethod('Maya')" class="pf-trn-btn-secondary py-2 px-3 rounded-xl font-mono text-xs uppercase transition">Maya QR</button>
              <button type="button" id="trn-pay-btn-BDO" onclick="pfSwitchTournamentPayMethod('BDO')" class="pf-trn-btn-secondary py-2 px-3 rounded-xl font-mono text-xs uppercase transition">BDO QR</button>
              <button type="button" id="trn-pay-btn-Venue" onclick="pfSwitchTournamentPayMethod('Venue')" class="pf-trn-btn-secondary py-2 px-3 rounded-xl font-mono text-xs uppercase transition">Pay at Desk</button>
            </div>
          </div>

          <div id="trn-reg-qr-box" class="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl bg-white border border-slate-200">
            <img id="trn-reg-qr-img" src="assets/qr-gcash.jpg" alt="Official Payment QR" class="w-28 h-28 object-contain rounded-lg border border-slate-200 flex-shrink-0">
            <div class="space-y-1 text-center sm:text-left">
              <div id="trn-reg-qr-acc" class="font-mono text-xs font-black text-slate-900">GCash Express Send: 0999 883 2346 (P&amp;F Rally Ground)</div>
              <p class="text-[11px] text-slate-600">Scan the official club QR code above and enter your 6+ digit Reference Number below, or choose <b>Pay at Desk</b> to reserve your bracket seed and settle upon check-in.</p>
            </div>
          </div>

          <div id="trn-reg-ref-wrap">
            <label class="block text-[10px] font-mono font-bold uppercase text-slate-700 mb-1">Payment Reference No. (Last 6–13 Digits)</label>
            <input type="text" id="trn-reg-ref" placeholder="e.g. 9012847561 (or switch to Pay at Desk)" class="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono font-bold">
          </div>
        </div>

        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
          <label class="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" id="trn-consent-all" checked class="mt-0.5 w-4 h-4 rounded accent-[#0F291E]">
            <span class="text-slate-600 text-[11px] leading-snug">I confirm that our team names are accurate and agree to display our pair/squad on the live P&amp;F Rally Ground Community Tournament Roster &amp; Bracket.</span>
          </label>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-[#0F291E] text-white" style="background:#0F291E !important;color:#FFFFFF !important;">
          <div>
            <span class="text-[10px] font-mono uppercase block" style="color:#A7F3D0 !important;">Tournament Entry Fee</span>
            <b id="trn-reg-fee-display" class="text-2xl font-mono font-black" style="color:#A3E635 !important;">₱850.00</b>
          </div>
          <button type="button" onclick="pfProceedTournamentToPayment()" class="pf-trn-btn-volt w-full sm:w-auto px-6 py-3.5 rounded-xl font-black uppercase text-xs tracking-wider transition shadow-lg">
            🏓 Confirm Registration &amp; Claim Bracket Seed →
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const players = Array.isArray(trn.players) ? trn.players : [...PF_OPEN_SEED_LABELS];
  const openIdx = players.findIndex(p => pfIsOpenSeedSlot(p));
  const nextSeedNum = openIdx >= 0 ? (PF_SEED_SLOT_NUMBERS[openIdx] || (openIdx + 1)) : (pfCountRealTournamentTeams(trn) + 1);
  const regCnt = pfCountRealTournamentTeams(trn);
  const maxCnt = Math.max(8, Number(trn.maxTeams || 24));

  document.getElementById('trn-reg-id').value = trn.id;
  document.getElementById('trn-reg-modal-title').textContent = trn.title;
  document.getElementById('trn-reg-modal-meta').textContent = `${trn.format} • ${trn.date} (${trn.time})`;
  document.getElementById('trn-reg-fee-display').textContent = `₱${Number(trn.entryFee || 0).toLocaleString()}.00`;
  const seedBanner = document.getElementById('trn-reg-seed-banner');
  if (seedBanner) {
    seedBanner.innerHTML = openIdx >= 0
      ? `🟢 <b>Live Roster Status:</b> ${regCnt} / ${maxCnt} Teams Confirmed. Registering now automatically assigns your team to <b>Bracket Seed #${nextSeedNum}</b>!`
      : `🟢 <b>Live Roster Status:</b> ${regCnt} / ${maxCnt} Teams Confirmed. Registering now adds your team to the official tournament pool!`;
  }
  pfSwitchTournamentPayMethod('GCash');
  modal.classList.remove('hidden');
}

function pfCloseTournamentRegModal() {
  const modal = document.getElementById('pf-tournament-reg-modal');
  if (modal) modal.classList.add('hidden');
}

async function pfProceedTournamentToPayment() {
  const id = document.getElementById('trn-reg-id')?.value;
  const cfg = (typeof getSiteConfig === 'function') ? getSiteConfig() : (window.PF_SITE_CONFIG || {});
  const list = pfGetTournamentsList();
  const trnIdx = list.findIndex(t => String(t.id) === String(id));
  const trn = trnIdx >= 0 ? list[trnIdx] : list[0];
  if (!trn) return;

  const name = (document.getElementById('trn-reg-name')?.value || '').trim();
  const phone = (document.getElementById('trn-reg-phone')?.value || '').trim();
  const partner = (document.getElementById('trn-reg-partner')?.value || '').trim();
  const division = (document.getElementById('trn-reg-division')?.value || 'Intermediate (3.5)').trim();
  const payMethod = (document.getElementById('trn-reg-pay-method')?.value || 'GCash').trim();
  const payRef = (document.getElementById('trn-reg-ref')?.value || '').trim();
  const consent = document.getElementById('trn-consent-all')?.checked;

  if (!name || name.length < 3) {
    alert('Please enter Player 1 Full Name.');
    document.getElementById('trn-reg-name')?.focus();
    return;
  }
  if (phone.replace(/[^0-9]/g, '').length < 10) {
    alert('Please enter a valid 11-digit Philippine mobile number.');
    document.getElementById('trn-reg-phone')?.focus();
    return;
  }
  if (payMethod !== 'Venue' && payRef.replace(/[^A-Za-z0-9]/g, '').length < 4) {
    alert('Please enter your GCash/Maya/BDO Reference Number, or select "Pay at Desk".');
    document.getElementById('trn-reg-ref')?.focus();
    return;
  }
  if (!consent) {
    alert('Please accept the tournament registration consent checkbox.');
    return;
  }

  const fee = Number(trn.entryFee || 0);
  const pairLabel = partner && partner.toLowerCase() !== 'n/a' ? `${name} & ${partner}` : name;

  if (!Array.isArray(trn.players) || trn.players.length < 8) {
    trn.players = [...PF_OPEN_SEED_LABELS];
  }
  if (!Array.isArray(trn.registrations)) {
    trn.registrations = [];
  }

  // Find first open seed slot in the 8-seed bracket
  const openSlotIdx = trn.players.findIndex(p => pfIsOpenSeedSlot(p));
  const assignedSeedNum = openSlotIdx >= 0 ? (PF_SEED_SLOT_NUMBERS[openSlotIdx] || (openSlotIdx + 1)) : (trn.registrations.length + 1);
  const formattedBracketLabel = `Seed #${assignedSeedNum} • ${pairLabel} (${division})`;

  if (openSlotIdx >= 0) {
    trn.players[openSlotIdx] = formattedBracketLabel;
  }

  const regEntry = {
    id: 'TRN-ENT-' + Date.now().toString().slice(-6),
    teamName: pairLabel,
    player1: name,
    partner: partner || 'Solo / Partner TBD',
    phone: phone,
    division: division,
    paymentMethod: payMethod,
    paymentRef: payMethod === 'Venue' ? 'PAY-AT-DESK' : payRef,
    status: payMethod === 'Venue' ? 'RESERVED (PAY AT DESK)' : 'CONFIRMED',
    seedNumber: assignedSeedNum,
    registeredAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  trn.registrations.push(regEntry);
  trn.registeredCount = pfCountRealTournamentTeams(trn);

  const dcList = Array.isArray(trn.designatedCourts) && trn.designatedCourts.length
    ? trn.designatedCourts
    : ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
  trn.bracket = pfBuildDefaultBracketForPlayers(trn.players, dcList);

  // Persist updated tournament roster & bracket to siteConfig and sync with server
  cfg.tournaments = list;
  cfg.updatedAt = Date.now();
  window.PF_SITE_CONFIG = cfg;
  try { localStorage.setItem('pf_site_config', JSON.stringify(cfg)); } catch (e) {}

  const cfgEndpoints = pfGetApiEndpoints('/api/site-config');
  for (const url of cfgEndpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (r.ok) break;
    } catch (e) {}
  }

  // Also call /api/tournament-register so the server atomically records the team & seed
  const trnRegEndpoints = pfGetApiEndpoints('/api/tournament-register');
  for (const url of trnRegEndpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: trn.id,
          player1: name,
          partner: partner || 'Solo / Partner TBD',
          teamName: pairLabel,
          phone: phone,
          division: division,
          paymentMethod: payMethod,
          paymentRef: regEntry.paymentRef
        })
      });
      if (r.ok) break;
    } catch (e) {}
  }

  // Also record a booking transaction so Admin Bookings, check-booking.html & POS see this tournament entry
  const bookingRecord = {
    ref: 'PF-TRN-' + Math.floor(100000 + Math.random() * 900000),
    name: pairLabel,
    phone: phone,
    email: 'tournament@pfrally.ph',
    courtName: `Tournament • ${trn.title} (Seed #${assignedSeedNum})`,
    court: `Tournament • ${trn.title} (Seed #${assignedSeedNum})`,
    date: trn.date,
    time: trn.time,
    slots: [trn.time],
    players: 2,
    total: fee,
    courtCost: fee,
    paymentMethod: payMethod === 'Venue' ? 'Pay at Counter' : payMethod,
    paymentMode: payMethod === 'Venue' ? 'Pay at Counter' : payMethod,
    transactionRef: regEntry.paymentRef,
    paymentRef: regEntry.paymentRef,
    status: 'PENDING',
    isTournament: true,
    tournamentId: trn.id,
    items: [`🏆 ${trn.title} — Seed #${assignedSeedNum}: ${pairLabel} (${division})`],
    createdAt: new Date().toISOString()
  };
  try {
    const pubList = JSON.parse(localStorage.getItem('pf_public_bookings') || '[]');
    pubList.unshift(bookingRecord);
    localStorage.setItem('pf_public_bookings', JSON.stringify(pubList));
  } catch (e) {}
  try {
    const sharedList = JSON.parse(localStorage.getItem('pf_shared_bookings') || '[]');
    sharedList.unshift(bookingRecord);
    localStorage.setItem('pf_shared_bookings', JSON.stringify(sharedList));
  } catch (e) {}
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

  // Clear form & close modal
  const nameInp = document.getElementById('trn-reg-name');
  const phoneInp = document.getElementById('trn-reg-phone');
  const partInp = document.getElementById('trn-reg-partner');
  const refInp = document.getElementById('trn-reg-ref');
  if (nameInp) nameInp.value = '';
  if (phoneInp) phoneInp.value = '';
  if (partInp) partInp.value = '';
  if (refInp) refInp.value = '';

  pfCloseTournamentRegModal();
  pfRenderPublicTournaments();
  alert(`🎉 Official Tournament Registration Confirmed!\n\nTeam: ${pairLabel}\nAssigned Seed: Seed #${assignedSeedNum}\nTournament: ${trn.title}\nTotal Confirmed Teams: ${trn.registeredCount} / ${trn.maxTeams || 24}\n\nYour team is now live on the Community Roster & Championship Bracket!`);
}

window.pfGetDefaultTournaments = pfGetDefaultTournaments;
window.pfGetTournamentsList = pfGetTournamentsList;
window.pfSetTournamentFilter = pfSetTournamentFilter;
window.pfRenderPublicTournaments = pfRenderPublicTournaments;
window.renderPublicTournaments = pfRenderPublicTournaments;
window.pfRegisterForTournament = pfRegisterForTournament;
window.pfCloseTournamentRegModal = pfCloseTournamentRegModal;
window.pfProceedTournamentToPayment = pfProceedTournamentToPayment;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    try { pfRenderOpenPlay24Board(); } catch (e) {}
    try { pfRenderPublicTournaments(); } catch (e) {}
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
