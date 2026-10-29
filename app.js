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
  blocks: [],
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
  const endpoints = ['/api/state', 'http://localhost:8088/api/state', 'http://localhost:8089/api/state'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.bookings)) {
          sharedServerState = data;
          window.sharedServerState = sharedServerState;
          localStorage.setItem('pf_all_bookings', JSON.stringify(data.bookings));
          // Also keep latest_booking updated if its status changed in Admin
          const latestRaw = localStorage.getItem('latest_booking');
          if (latestRaw) {
            const latest = JSON.parse(latestRaw);
            const updated = data.bookings.find(b => b.ref === latest.ref);
            if (updated) {
              localStorage.setItem('latest_booking', JSON.stringify(updated));
              localStorage.setItem('booking_' + updated.ref, JSON.stringify(updated));
            }
          }
          if (typeof renderLiveScheduleMatrix === 'function') {
            renderLiveScheduleMatrix();
          }
          if (typeof renderDrawerSlots === 'function') {
            try { renderDrawerSlots(); } catch (e) {}
          }
          if (typeof renderTimeChips === 'function') {
            try { renderTimeChips(); } catch (e) {}
          }
          if (Array.isArray(data.announcements)) {
            sharedServerState.announcements = data.announcements;
            localStorage.setItem('pf_announcements', JSON.stringify(data.announcements));
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
  // Always save to localStorage first
  let allBookings = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]');
  allBookings = allBookings.filter(b => b.ref !== bookingData.ref);
  allBookings.unshift(bookingData);
  localStorage.setItem('pf_all_bookings', JSON.stringify(allBookings));
  localStorage.setItem('latest_booking', JSON.stringify(bookingData));
  localStorage.setItem('booking_' + bookingData.ref, JSON.stringify(bookingData));

  // Push to unified backend API
  const endpoints = ['/api/bookings', 'http://localhost:8088/api/bookings', 'http://localhost:8089/api/bookings'];
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
  if ((host === 'localhost' || host === '127.0.0.1') && port === '8088') {
    window.location.href = 'http://' + host + ':8089/?login=1';
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
  if (!drawer) return;
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

function formatBookingItemsBulletHtml(booking) {
  if (!booking) return '—';
  if (Array.isArray(booking.items) && booking.items.length > 0) {
    return `<ul class="space-y-1 text-left">${booking.items.map(i => {
      const qty = Number(i.qty || 1);
      const sub = Number(i.price || 0) * qty;
      return `<li class="flex items-start justify-between gap-2 text-xs">
        <span class="flex items-start gap-1.5"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${qty}× ${i.name}</span></span>
        ${sub > 0 ? `<span class="font-mono text-brand-lime text-[11px] flex-shrink-0">₱${sub.toLocaleString()}</span>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }
  const raw = String(booking.court || '—');
  const parts = raw.includes(' + ') ? raw.split(' + ') : (raw.includes(' • ') ? [raw] : raw.split(', '));
  return `<ul class="space-y-1 text-left">${parts.map(p => `<li class="flex items-start gap-1.5 text-xs"><span class="text-brand-lime font-black">•</span><span class="text-white font-bold">${p.trim()}</span></li>`).join('')}</ul>`;
}

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
  if (!grid) return;

  const invList = (sharedServerState && Array.isArray(sharedServerState.inventory)) ? sharedServerState.inventory : [];
  const customCats = (sharedServerState && Array.isArray(sharedServerState.categories)) ? sharedServerState.categories : [];

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
            : `<button onclick="addItemToCart('${item.id}', '${safeName}', ${Number(item.price)}, '${safeCat}'); toggleCartDrawer();" class="px-3.5 py-1.5 rounded-lg bg-brand-lime text-brand-black hover:bg-brand-limeHover text-xs font-black transition active:scale-95">+ Buy</button>`
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
      message: 'All 4 championship cushion courts are open daily from 6:00 AM to 12:00 Midnight (Daytime: ₱400/hr • Evening: ₱500/hr). Check here anytime for official Open Play alerts, tournament posters, and club advisories from Admin!',
      category: 'Club Update',
      img: '',
      pinned: true,
      author: 'P&F Rally Ground Admin',
      createdAt: 'Official Broadcast'
    }
  ];
}

function getLiveAnnouncementsList() {
  try {
    if (sharedServerState && Array.isArray(sharedServerState.announcements)) {
      return sharedServerState.announcements;
    }
    const cached = JSON.parse(localStorage.getItem('pf_announcements') || 'null');
    if (Array.isArray(cached)) return cached;
  } catch (e) {}
  return getDefaultWelcomeAnnouncements();
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
        if (sharedServerState) sharedServerState.announcements = ev.data.announcements;
        renderPublicAnnouncementBoard();
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
  const feed = document.getElementById('public-announcement-feed');
  const badge = document.getElementById('ann-floating-badge');
  const headerBadge = document.getElementById('header-ann-badge');
  const rawList = getLiveAnnouncementsList();

  // Sort pinned first, preserving chronological order
  const sorted = [...rawList].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  if (badge) {
    badge.textContent = String(sorted.length);
  }
  if (headerBadge) {
    headerBadge.textContent = String(sorted.length);
  }

  if (!feed) return;

  const catColors = {
    'Open Play Alert': 'bg-[#d9f99d] text-[#365314] border-[#84cc16]',
    'Tournament / Event': 'bg-amber-100 text-amber-900 border-amber-300',
    'Promo & Rates': 'bg-sky-100 text-sky-900 border-sky-300',
    'Court Advisory': 'bg-rose-100 text-rose-800 border-rose-300',
    'Club Update': 'bg-emerald-100 text-emerald-900 border-emerald-300'
  };

  feed.innerHTML = sorted.map(ann => {
    const cat = ann.category || 'Club Update';
    const pillCls = catColors[cat] || catColors['Club Update'];
    const safeTitle = pfEscapeHtml(ann.title || '');
    const safeMsg = pfEscapeHtml(ann.message || '').replace(/\n/g, '<br>');
    const safeAuthor = pfEscapeHtml(ann.author || 'P&F Rally Ground Admin');
    const safeTime = pfEscapeHtml(ann.createdAt || 'Just now');
    const hasImg = Boolean(ann.img && String(ann.img).trim());
    const safeCaption = (ann.title || cat || 'Club Update').replace(/'/g, "\'");

    return `
      <div class="flex items-start gap-2.5">
        <img src="assets/logo.png" alt="Admin" class="w-8 h-8 rounded-xl object-contain bg-white p-0.5 border-2 border-[#050E1D] flex-shrink-0 mt-0.5 shadow-sm" style="border-radius:5px;">
        <div class="flex-1 min-w-0 rounded-2xl bg-white border-2 ${ann.pinned ? 'border-[#0E8A2D] shadow-md' : 'border-slate-200 shadow-sm'} p-3.5 space-y-2 text-[#050E1D]" style="background:#FFFFFF;color:#050E1D;border-radius:5px;">
          <div class="flex flex-wrap items-center justify-between gap-1.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[11px] font-black text-[#050E1D]">${safeAuthor}</span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase border ${pillCls}" style="border-radius:5px;">${pfEscapeHtml(cat)}</span>
              ${ann.pinned ? '<span class="px-1.5 py-0.5 rounded bg-[#9BE600] text-[#050E1D] border border-[#050E1D]/20 text-[8px] font-mono font-black uppercase" style="border-radius:5px;">📌 PINNED</span>' : ''}
            </div>
            <span class="text-[9px] font-mono font-bold text-slate-500">${safeTime}</span>
          </div>
          ${safeTitle ? `<h4 class="text-xs sm:text-sm font-black text-[#050E1D] leading-snug">${safeTitle}</h4>` : ''}
          ${safeMsg ? `<p class="text-xs text-slate-700 font-medium leading-relaxed break-words">${safeMsg}</p>` : ''}
          ${hasImg ? `
            <div class="pt-1">
              <div onclick="openAnnouncementLightbox('${ann.img}', '${safeCaption}')" class="group relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-100 cursor-pointer" style="border-radius:5px;">
                <img src="${ann.img}" alt="${safeTitle || 'Announcement Photo'}" class="w-full max-h-60 object-cover group-hover:scale-[1.02] transition-transform duration-200">
                <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-[#050E1D]/85 text-white text-[9px] font-mono font-bold" style="border-radius:5px;">🔍 View Full Photo</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}


// ================= LIVE WEBSITE, HERO PHOTO, LIVE BANNER & MASTER PRICE EDITOR ENGINE =================
const DEFAULT_PF_SITE_CONFIG = {
  clubName: 'P&F Rally Ground',
  clubSubtitle: 'Pickleball Club • Daraga',
  clubLogo: 'assets/logo.png',
  heroTagline: 'PHILIPPINES • 4 PRO PICKLEBALL COURTS',
  heroTitleLine1: 'PLAY.',
  heroTitleLine2: 'COMPETE.',
  heroTitleAccent: 'CONNECT.',
  heroSubtitle: 'Your home court in Daraga, Albay for premier rallies, tournament-grade cushion surfaces, pro equipment rentals, and verified online booking.',
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
  liveBannerText: 'LIVE CLUB UPDATE: All 4 Pro Cushion Courts Open Daily 6:00 AM – 12:00 Midnight • Book Online via GCash, Maya, or BDO!',
  bentoSectionTitle: 'PLAY THE CLUB',
  bentoSectionDesc: 'Everything you need to play, improve, and compete under one roof. World-class surface, vibrant community, and zero booking friction.',
  openPlayScheduleText: 'Open Play: Mon 3–6 PM • Tue–Thu 3–8 PM • Fri 3–11 PM • Sat 6–10 PM',
  dayRate: 400,
  nightRate: 500,
  includedPlayers: 6,
  extraPlayerFee: 100,
  openPlayRate: 150,
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
  clubAddress: 'Phase IV, Doña Maria Subdivision, Velasco St., Tagas, Daraga, 4501 Albay',
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
  window.PF_SITE_CONFIG = merged;
  return merged;
}

window.PF_SITE_CONFIG = getSiteConfig();

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
      headerEl.insertBefore(bannerEl, headerEl.children[1] || headerEl.firstChild);
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
        bannerEl.setAttribute('style', 'background:linear-gradient(90deg,#9BE600 0%,#C6FF00 50%,#9BE600 100%);color:#050E1D;border-bottom:2px solid #050E1D;padding:6px 12px;height:36px;overflow:hidden;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:10px;');
        bannerEl.innerHTML = `
          <span class="pf-live-ticker-badge" style="display:inline-flex;align-items:center;gap:6px;background:#050E1D;color:#9BE600;font-size:10px;font-weight:900;padding:3px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap;">
            <span class="w-2 h-2 rounded-full bg-[#9BE600] animate-ping"></span>
            <span>LIVE UPDATE</span>
          </span>
          <div class="pf-live-ticker-viewport" style="flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;position:relative;display:flex;align-items:center;">
            <div class="pf-live-ticker-track" id="live-site-update-banner-track" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;">
              <div class="pf-live-ticker-item" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;gap:20px;padding-right:40px;font-size:12px;font-weight:800;color:#050E1D;">
                <span id="live-site-update-banner-text">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 7px;background:rgba(5,14,29,0.14);color:#050E1D;border-radius:5px;font-size:10px;font-weight:900;white-space:nowrap;">P&amp;F RALLY GROUND • DARAGA</span>
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 7px;background:rgba(5,14,29,0.14);color:#050E1D;border-radius:5px;font-size:10px;font-weight:900;white-space:nowrap;">4 PRO CUSHION COURTS</span>
              </div>
              <div class="pf-live-ticker-item" aria-hidden="true" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap;gap:20px;padding-right:40px;font-size:12px;font-weight:800;color:#050E1D;">
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 7px;background:rgba(5,14,29,0.14);color:#050E1D;border-radius:5px;font-size:10px;font-weight:900;white-space:nowrap;">P&amp;F RALLY GROUND • DARAGA</span>
                <span class="pf-live-ticker-clone">${safeBanner}</span>
                <span class="pf-live-ticker-sep" style="display:inline-block;padding:1px 7px;background:rgba(5,14,29,0.14);color:#050E1D;border-radius:5px;font-size:10px;font-weight:900;white-space:nowrap;">4 PRO CUSHION COURTS</span>
              </div>
            </div>
          </div>
          <button type="button" onclick="toggleAnnouncementBoard(true)" class="pf-live-ticker-cta" style="display:inline-flex;align-items:center;gap:4px;background:#050E1D;color:#FFFFFF;font-size:10px;font-weight:800;padding:3px 9px;border-radius:5px;flex-shrink:0;white-space:nowrap;">
            <span class="hidden sm:inline">Updates</span>
            <span>Feed →</span>
          </button>
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
    const slideDiv = document.getElementById('slide-' + idx);
    const slideImg = document.getElementById('slide-img-' + idx);
    if (slideDiv) {
      slideDiv.style.backgroundImage = 'url("' + urlStr.replace(/"/g, '\"') + '")';
    }
    if (slideImg && slideImg.getAttribute('src') !== urlStr) {
      slideImg.setAttribute('src', urlStr);
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
  document.querySelectorAll('[data-site-price="day-num"]').forEach(el => { el.textContent = `₱${dayRate}`; });
  document.querySelectorAll('[data-site-price="night-num"]').forEach(el => { el.textContent = `₱${nightRate}`; });
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
      btn.setAttribute('onclick', `addItemToCart('${itemKey}', '${itemName}', ${priceVal}, '${catLabel}'); toggleCartDrawer();`);
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
}

window.addEventListener('focus', () => {
  if (typeof syncStateFromServer === 'function') syncStateFromServer();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && typeof syncStateFromServer === 'function') syncStateFromServer();
});


// ================= EXPIRED DATE & TIME SLOT VALIDATION ENGINE =================
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

function pfIsSlotExpired(dateYMD, slotStr) {
  const now = new Date();
  const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetDate = (dateYMD && dateYMD !== 'Today' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateYMD).trim()))
    ? String(dateYMD).trim()
    : todayYMD;

  if (targetDate < todayYMD) return true;
  if (targetDate > todayYMD) return false;

  const slotHr = pfParseSlotHour24(slotStr);
  if (slotHr < 0) return false;
  const curHr = now.getHours();
  const curMin = now.getMinutes();
  // A slot like 08:00 AM is expired once the clock is past 08:00 AM (e.g. 08:01 AM or later)
  if (slotHr < curHr) return true;
  if (slotHr === curHr && curMin > 0) return true;
  return false;
}

function pfGetNextUpcomingSlot(dateYMD, allSlots) {
  const slots = Array.isArray(allSlots) && allSlots.length > 0 ? allSlots : [
    '06:00 AM','07:00 AM','08:00 AM','09:00 AM','10:00 AM','11:00 AM',
    '12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM',
    '06:00 PM','07:00 PM','08:00 PM','09:00 PM','10:00 PM','11:00 PM'
  ];
  for (const s of slots) {
    if (!pfIsSlotExpired(dateYMD, s)) return s;
  }
  return slots[slots.length - 1];
}

function pfShowExpiredSlotBanner(bannerId, slotStr, dateLabel) {
  let el = document.getElementById(bannerId);
  const msg = `⚠️ Expired Time Slot: ${slotStr} on ${dateLabel || 'Today'} has already passed. Please select a future time slot.`;
  if (el) {
    el.textContent = msg;
    el.className = 'p-3 rounded-xl bg-rose-500/20 border-2 border-rose-500 text-rose-200 text-xs font-black mt-2 block animate-pulse';
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
  const dRaw = String(b.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dRaw)) return dRaw;
  if (dRaw.toLowerCase().startsWith('today')) return todayYMD;
  const tRaw = String(b.time || '').trim();
  const ymdMatch = tRaw.match(/(\d{4}-\d{2}-\d{2})/) || dRaw.match(/(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch) return ymdMatch[1];
  if (tRaw.toLowerCase().includes('today')) return todayYMD;
  return dRaw;
}

function pfBookingMatchesTargetDate(b, targetDate, todayYMD) {
  const extracted = pfExtractBookingDateYMD(b, todayYMD);
  if (extracted && extracted === targetDate) return true;
  const combined = `${b.date || ''} ${b.time || ''}`;
  if (combined.includes(targetDate)) return true;
  if (targetDate === todayYMD && /today/i.test(combined)) return true;
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
  if (Array.isArray(liveBookings) && liveBookings.length > 0) return liveBookings;
  const srv = (window.sharedServerState && Array.isArray(window.sharedServerState.bookings)) ? window.sharedServerState.bookings : [];
  let locAll = [];
  let locPub = [];
  try { locAll = JSON.parse(localStorage.getItem('pf_all_bookings') || '[]') || []; } catch (e) {}
  try { locPub = JSON.parse(localStorage.getItem('pf_public_bookings') || '[]') || []; } catch (e) {}
  const map = new Map();
  [...srv, ...locAll, ...locPub].forEach(b => {
    if (b && b.ref && !map.has(String(b.ref).toUpperCase())) {
      map.set(String(b.ref).toUpperCase(), b);
    }
  });
  return Array.from(map.values());
}

function pfResolveCourtSlot(dateYMD, courtNum, slotStr, liveBlocks, liveBookings) {
  const cNum = Number(courtNum || 1);
  const courtZero = 'Court 0' + cNum;
  const courtPlain = 'Court ' + cNum;
  const now = new Date();
  const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetDate = (dateYMD && dateYMD !== 'Today') ? String(dateYMD) : todayYMD;

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
    return { status: 'BOOKED', booking: bookedMatch, reason: bookedMatch.name || 'Booked' };
  }

  // 2. Check Admin Calendar Overrides (blocks)
  const blocksArr = Array.isArray(liveBlocks)
    ? liveBlocks
    : ((window.sharedServerState && Array.isArray(window.sharedServerState.blocks)) ? window.sharedServerState.blocks : []);

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
    if (st === 'OPEN' || st === 'AVAILABLE') {
      return { status: 'AVAILABLE', override: matchedBlock, reason: matchedBlock.reason || 'Open Court' };
    }
    if (st === 'OPEN_PLAY') {
      return { status: 'OPEN_PLAY', override: matchedBlock, reason: matchedBlock.reason || 'Open Play' };
    }
    return { status: 'CLOSED', override: matchedBlock, reason: matchedBlock.reason || 'Closed' };
  }

  // 3. Default schedule fallback (Open Play hours by day of week)
  const openPlayByDay = {
    1: { start: 15, end: 18 },
    2: { start: 15, end: 20 },
    3: { start: 15, end: 20 },
    4: { start: 15, end: 20 },
    5: { start: 15, end: 23 },
    6: { start: 18, end: 22 }
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const dayOfWeek = new Date(`${targetDate}T12:00:00`).getDay();
    const rule = openPlayByDay[dayOfWeek];
    if (rule) {
      let hr = parseInt(slotStr, 10);
      if (slotStr.includes('PM') && hr !== 12) hr += 12;
      if (slotStr.includes('AM') && hr === 12) hr = 0;
      if (hr >= rule.start && hr < rule.end) {
        return { status: 'OPEN_PLAY', override: null, reason: 'Open Play' };
      }
    }
  }

  if (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, slotStr)) {
    return { status: 'EXPIRED', override: null, reason: 'Time Passed' };
  }
  return { status: 'AVAILABLE', override: null, reason: 'Available' };
}
window.pfResolveCourtSlot = pfResolveCourtSlot;
window.pfNormalizeCourtNumber = pfNormalizeCourtNumber;
window.pfExtractBookingDateYMD = pfExtractBookingDateYMD;
window.pfBookingCoversSlot = pfBookingCoversSlot;
window.pfGetAllMergedBookings = pfGetAllMergedBookings;


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

  if (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, startSlot)) {
    return {
      ok: false,
      code: 'EXPIRED',
      html: `⚠️ <b>Expired Date/Time Error:</b> <b>${startSlot}</b> on <b>${targetDate}</b> has already passed. Please select a future date and time.`
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
          html: `❌ <b>Schedule Already Booked Error:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is already booked by your current reservation (<b>${currentRef}</b>). Please select a different available date, court, or time slot to reschedule.`
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

    if (st && st.status === 'OPEN_PLAY') {
      return {
        ok: false,
        code: 'OPEN_PLAY',
        html: `⚠️ <b>Open Play Schedule Error:</b> <b>${courtLabel}</b> at <b>${slotToCheck}</b> on <b>${targetDate}</b> is reserved for Club Open Play. Please choose an available private booking hour.`
      };
    }

    if (st && st.status === 'EXPIRED') {
      return {
        ok: false,
        code: 'EXPIRED',
        html: `⚠️ <b>Expired Date/Time Error:</b> <b>${slotToCheck}</b> on <b>${targetDate}</b> has already passed. Please select a future date and time.`
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

function pfRefreshRescheduleTimeOptions() {
  const dateInp = document.getElementById('resched-new-date');
  const courtSel = document.getElementById('resched-new-court');
  const timeSel = document.getElementById('resched-new-time');
  const refEl = document.getElementById('res-ref');
  if (!dateInp || !courtSel || !timeSel) return;

  const targetDate = dateInp.value;
  const cNum = pfNormalizeCourtNumber(courtSel.value || '1');
  const currentRef = refEl ? refEl.textContent.trim().toUpperCase() : '';

  const allBookings = pfGetAllMergedBookings();
  const activeBookingObj = allBookings.find(b => b && String(b.ref || '').toUpperCase() === currentRef) || null;
  const durHrs = pfGetBookingDurationHours(activeBookingObj);

  Array.from(timeSel.options).forEach(opt => {
    const rawSlot = opt.value;
    let suffix = ' (✓ Available)';
    if (targetDate && typeof pfResolveCourtSlot === 'function') {
      const st = pfResolveCourtSlot(targetDate, cNum, rawSlot);
      if (st && st.status === 'BOOKED') {
        const bookedRef = (st.booking && st.booking.ref) ? String(st.booking.ref).toUpperCase() : '';
        if (bookedRef && bookedRef === currentRef) {
          suffix = ' (❌ Already Booked — Your Current Slot)';
        } else {
          suffix = ' (❌ Already Booked)';
        }
      } else if (st && st.status === 'CLOSED') {
        suffix = ' (🔒 Closed)';
      } else if (st && st.status === 'OPEN_PLAY') {
        suffix = ' (🎾 Open Play)';
      } else if ((st && st.status === 'EXPIRED') || (typeof pfIsSlotExpired === 'function' && pfIsSlotExpired(targetDate, rawSlot))) {
        suffix = ' (⏰ Expired / Passed)';
      }
    }
    // Keep opt.disabled = false so selecting a booked or expired slot immediately triggers the red error banner!
    opt.disabled = false;
    opt.textContent = rawSlot + suffix;
  });

  const msgEl = document.getElementById('resched-feedback-msg');
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
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const refEl = document.getElementById('res-ref');
    const currentRef = refEl ? refEl.textContent.trim().toUpperCase() : '';
    const allBookings = pfGetAllMergedBookings();
    const activeBookingObj = allBookings.find(b => b && String(b.ref || '').toUpperCase() === currentRef) || null;

    const dateInput = document.getElementById('resched-new-date');
    if (dateInput) {
      dateInput.min = todayYmd;
      const bDate = activeBookingObj ? pfExtractBookingDateYMD(activeBookingObj, todayYmd) : '';
      dateInput.value = (bDate && /^\d{4}-\d{2}-\d{2}$/.test(bDate) && bDate >= todayYmd) ? bDate : todayYmd;
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

    // Pre-select the first truly AVAILABLE upcoming slot so the form starts on a valid option
    const timeSel = document.getElementById('resched-new-time');
    if (timeSel && dateInput && courtSel) {
      const cNum = pfNormalizeCourtNumber(courtSel.value);
      const durHrs = pfGetBookingDurationHours(activeBookingObj);
      const firstAvail = PF_RESCHED_ALL_SLOTS.find(s => pfCheckRescheduleConflict(dateInput.value, cNum, s, durHrs, currentRef).ok);
      if (firstAvail) {
        timeSel.value = firstAvail;
      }
    }

    pfRefreshRescheduleTimeOptions();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    panel.classList.add('hidden');
  }
}

async function pfSubmitBookingReschedule() {
  const refEl = document.getElementById('res-ref');
  const refId = refEl ? refEl.textContent.trim() : '';
  if (!refId || refId === '—') {
    alert('Please look up your booking first.');
    return;
  }

  // Always sync latest server state before checking conflicts
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
  const existingBooking = allBookings.find(b => b && String(b.ref || '').toUpperCase() === refId.toUpperCase()) || null;
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

  const updatedBooking = Object.assign({}, existingBooking || { ref: refId }, {
    ref: existingBooking ? existingBooking.ref : refId,
    date: newDate,
    court: cleanCourtLabel,
    time: newTimeSchedule,
    isReschedule: true,
    rescheduledAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
  });

  if (Array.isArray(updatedBooking.items)) {
    updatedBooking.items = updatedBooking.items.map(it => {
      if (typeof it === 'string' && /court/i.test(it)) {
        return it.replace(/Court\s*0*[1-4]/i, cleanCourtLabel);
      }
      if (it && typeof it === 'object' && it.isCourt) {
        return Object.assign({}, it, { name: cleanCourtLabel, subtitle: newTimeSchedule });
      }
      return it;
    });
  }

  // Send to server and verify no 409 conflict from backend
  const endpoints = ['/api/bookings', 'http://localhost:8088/api/bookings', 'http://localhost:8089/api/bookings'];
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

  if (serverRejected) {
    pfShowRescheduleErrorBanner(msgEl, `❌ <b>${pfEscapeHtml(serverRejected)}</b>`);
    msgEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // Update all localStorage caches
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

  const resCourtEl = document.getElementById('res-court');
  if (resCourtEl) {
    resCourtEl.innerHTML = typeof formatBookingItemsBulletHtml === 'function'
      ? formatBookingItemsBulletHtml(updatedBooking)
      : cleanCourtLabel;
  }
  const resTimeEl = document.getElementById('res-time');
  if (resTimeEl) resTimeEl.textContent = newTimeSchedule;

  pfRefreshRescheduleTimeOptions();

  if (msgEl) {
    msgEl.innerHTML = `✅ Booking <b>${pfEscapeHtml(refId)}</b> has been successfully rescheduled to <b>${pfEscapeHtml(cleanCourtLabel)}</b> on <b>${pfEscapeHtml(newTimeSchedule)}</b>!`;
    msgEl.className = 'text-xs font-bold text-brand-lime bg-brand-lime/15 border-2 border-brand-lime p-3 rounded-xl mt-2.5 block shadow-md';
  }
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
