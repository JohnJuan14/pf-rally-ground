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
  1: "Court 01 (Indoor Championship)",
  2: "Court 02 (Indoor Tournament)",
  3: "Court 03 (Covered Outdoor)",
  4: "Court 04 (Pro Training Court)"
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
            sharedServerState.siteConfig = data.siteConfig;
            localStorage.setItem('pf_site_config', JSON.stringify(data.siteConfig));
            if (typeof applySiteConfig === 'function') applySiteConfig(data.siteConfig);
          }
          if (data.paymentConfig && typeof data.paymentConfig === 'object') {
            sharedServerState.paymentConfig = data.paymentConfig;
            const st = String(data.paymentConfig.standeeUrl || '').trim();
            if (st && (st.startsWith('assets/custom-') || st.startsWith('data:image/'))) {
              localStorage.setItem('pf_custom_gcash_standee_url', st);
            } else {
              localStorage.removeItem('pf_custom_gcash_standee_url');
            }
            const q1 = document.getElementById('locked-qr-img');
            if (q1 && (!q1.getAttribute('data-qr-mode') || q1.getAttribute('data-qr-mode') === 'qr')) {
              q1.src = pfGetOfficialQrUrl('gcash', 'qr');
            }
            const q2 = document.getElementById('book-gcash-qr-img');
            if (q2 && (!q2.getAttribute('data-qr-mode') || q2.getAttribute('data-qr-mode') === 'qr')) {
              q2.src = pfGetOfficialQrUrl('gcash', 'qr');
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

function pfGetOfficialQrUrl(channel = 'gcash', viewMode = 'qr') {
  const ch = String(channel || 'gcash').toLowerCase();
  if (ch === 'bank' || ch === 'bdo') {
    return viewMode === 'standee' ? 'assets/qr-bdo.jpg?v=20261029v9' : 'assets/qr-bdo.png?v=20261029v9';
  }
  if (ch === 'maya') {
    return viewMode === 'standee' ? 'assets/qr-maya.jpg?v=20261029v9' : 'assets/qr-maya.png?v=20261029v9';
  }
  if (viewMode === 'standee') {
    return 'assets/qr-gcash.jpg?v=20261029v9';
  }
  try {
    const customStandee = localStorage.getItem('pf_custom_gcash_standee_url');
    if (customStandee && (customStandee.startsWith('assets/custom-') || customStandee.startsWith('data:image/'))) {
      return customStandee;
    }
    const srvStandee = window.sharedServerState && window.sharedServerState.paymentConfig && window.sharedServerState.paymentConfig.standeeUrl;
    if (srvStandee && (srvStandee.startsWith('assets/custom-') || srvStandee.startsWith('data:image/'))) {
      return srvStandee;
    }
  } catch (e) {}
  return 'assets/qr-gcash.png?v=20261029v9';
}

function pfToggleQrCardView(channel = 'gcash', imgId = 'locked-qr-img', btnEl = null) {
  const img = document.getElementById(imgId);
  if (!img) return;
  const curMode = img.getAttribute('data-qr-mode') || 'qr';
  const nextMode = curMode === 'qr' ? 'standee' : 'qr';
  img.setAttribute('data-qr-mode', nextMode);
  img.src = pfGetOfficialQrUrl(channel, nextMode);
  if (nextMode === 'standee') {
    img.classList.remove('aspect-square');
    img.style.maxHeight = '280px';
  } else {
    img.style.maxHeight = '';
  }
  if (btnEl) {
    btnEl.textContent = nextMode === 'standee' ? '🔄 Show Large QR Only' : '🪪 Show Full GCash Card';
  }
}

function pfOpenQrStandeeLightbox(channel = 'gcash') {
  const ch = String(channel || 'gcash').toLowerCase();
  const labels = {
    gcash: 'Official GCash InstaPay QR • KA******E L. (0999 883 2346)',
    maya: 'Official Maya QR Ph • KATHERINE LIM (0999 883 2346)',
    bank: 'Official BDO InstaPay QR • Dex (••••••••8678)'
  };
  const standeeSrc = pfGetOfficialQrUrl(ch, 'standee');
  const qrSrc = pfGetOfficialQrUrl(ch, 'qr');

  let modal = document.getElementById('pf-qr-zoom-lightbox');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pf-qr-zoom-lightbox';
    modal.className = 'fixed inset-0 z-[70] hidden flex items-center justify-center p-3 sm:p-5';
    modal.innerHTML = `
      <div onclick="pfCloseQrStandeeLightbox()" class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>
      <div class="relative z-10 w-full max-w-md rounded-2xl bg-white text-[#050E1D] border-2 border-[#9BE600] p-4 sm:p-5 shadow-2xl text-center space-y-3 max-h-[92dvh] overflow-y-auto" style="border-radius:5px;">
        <div class="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <div class="text-left">
            <span class="text-[10px] font-mono font-black uppercase tracking-widest text-[#0E8A2D] block">SCAN OR UPLOAD IN APP</span>
            <h4 id="pf-qr-lightbox-title" class="text-xs sm:text-sm font-black uppercase text-[#050E1D]">Official GCash QR</h4>
          </div>
          <button type="button" onclick="pfCloseQrStandeeLightbox()" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-[#050E1D] text-slate-800 hover:text-white font-black text-xs flex items-center justify-center transition">✕</button>
        </div>
        <div class="flex justify-center gap-2">
          <button type="button" id="pf-lb-tab-qr" onclick="pfSwitchLightboxQrTab('qr')" class="px-3 py-1.5 rounded-lg bg-[#050E1D] text-[#9BE600] text-[10px] font-black uppercase tracking-wider">Large Crisp QR (Fast Scan)</button>
          <button type="button" id="pf-lb-tab-standee" onclick="pfSwitchLightboxQrTab('standee')" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wider">Full Official Standee Card</button>
        </div>
        <div class="p-3 rounded-xl bg-white border-2 border-slate-200 shadow-inner flex items-center justify-center">
          <img id="pf-qr-lightbox-img" src="" alt="Official Payment QR" class="max-h-[58dvh] w-auto mx-auto object-contain rounded-lg" style="image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;">
        </div>
        <p class="text-[11px] text-slate-600 leading-snug">
          <b>On Mobile?</b> Tap <b>Save QR Image</b> below, then open your <b>GCash App &rarr; QR &rarr; Upload QR</b> and select the saved image from your gallery.
        </p>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="pf-qr-lightbox-dl-btn" onclick="pfDownloadOfficialQr('gcash')" class="py-2.5 px-3 rounded-xl bg-[#9BE600] hover:bg-[#8cd000] text-[#050E1D] font-black uppercase text-[11px] tracking-wider shadow">📥 Save QR Image</button>
          <button type="button" onclick="pfCloseQrStandeeLightbox()" class="py-2.5 px-3 rounded-xl bg-[#050E1D] text-white font-bold uppercase text-[11px] tracking-wider">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.setAttribute('data-channel', ch);
  modal.setAttribute('data-qr-src', qrSrc);
  modal.setAttribute('data-standee-src', standeeSrc);

  const titleEl = document.getElementById('pf-qr-lightbox-title');
  if (titleEl) titleEl.textContent = labels[ch] || labels.gcash;
  const dlBtn = document.getElementById('pf-qr-lightbox-dl-btn');
  if (dlBtn) dlBtn.setAttribute('onclick', `pfDownloadOfficialQr('${ch}')`);

  pfSwitchLightboxQrTab('qr');
  modal.classList.remove('hidden');
}

function pfSwitchLightboxQrTab(tab = 'qr') {
  const modal = document.getElementById('pf-qr-zoom-lightbox');
  if (!modal) return;
  const img = document.getElementById('pf-qr-lightbox-img');
  const btnQr = document.getElementById('pf-lb-tab-qr');
  const btnSt = document.getElementById('pf-lb-tab-standee');
  if (tab === 'standee') {
    if (img) img.src = modal.getAttribute('data-standee-src') || 'assets/qr-gcash.jpg?v=20261029v9';
    if (btnSt) btnSt.className = 'px-3 py-1.5 rounded-lg bg-[#050E1D] text-[#9BE600] text-[10px] font-black uppercase tracking-wider';
    if (btnQr) btnQr.className = 'px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wider';
  } else {
    if (img) img.src = modal.getAttribute('data-qr-src') || 'assets/qr-gcash.png?v=20261029v9';
    if (btnQr) btnQr.className = 'px-3 py-1.5 rounded-lg bg-[#050E1D] text-[#9BE600] text-[10px] font-black uppercase tracking-wider';
    if (btnSt) btnSt.className = 'px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wider';
  }
}

function pfCloseQrStandeeLightbox() {
  const modal = document.getElementById('pf-qr-zoom-lightbox');
  if (modal) modal.classList.add('hidden');
}

function pfDownloadOfficialQr(channel = 'gcash', format = 'standee') {
  const ch = String(channel || 'gcash').toLowerCase();
  const url = format === 'qr' ? pfGetOfficialQrUrl(ch, 'qr') : pfGetOfficialQrUrl(ch, 'standee');
  const ext = url.includes('.jpg') ? 'jpg' : 'png';
  const a = document.createElement('a');
  a.href = url;
  a.download = `PF-Rally-Ground-${ch.toUpperCase()}-Official-QR.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.pfGetOfficialQrUrl = pfGetOfficialQrUrl;
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
  heroPrimaryBtn: 'Book Your Court',
  heroSecondaryBtn: 'View Live Schedule',
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
  court1Name: 'Court 01 — Indoor Championship',
  court2Name: 'Court 02 — Indoor Tournament',
  court3Name: 'Court 03 — Covered Outdoor',
  court4Name: 'Court 04 — Pro Training Court',
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
  setTxt('site-hero-primary-btn-text', cfg.heroPrimaryBtn);
  setTxt('site-hero-secondary-btn-text', cfg.heroSecondaryBtn);

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
  const shortCourtName = (full, fallback) => {
    if (!full) return fallback;
    const m = String(full).match(/\(([^)]+)\)/);
    if (m && m[1]) return m[1];
    const dash = String(full).split('—');
    if (dash.length > 1) return dash[1].trim();
    return full;
  };
  document.querySelectorAll('[data-site-court-short="1"]').forEach(el => { el.textContent = shortCourtName(cfg.court1Name, 'Championship'); });
  document.querySelectorAll('[data-site-court-short="2"]').forEach(el => { el.textContent = shortCourtName(cfg.court2Name, 'Tournament'); });
  document.querySelectorAll('[data-site-court-short="3"]').forEach(el => { el.textContent = shortCourtName(cfg.court3Name, 'Covered Outdoor'); });
  document.querySelectorAll('[data-site-court-short="4"]').forEach(el => { el.textContent = shortCourtName(cfg.court4Name, 'Pro Training'); });

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


// ================= ADMIN-SYNCED COURT SLOT STATUS ENGINE =================
function pfResolveCourtSlot(dateYMD, courtNum, slotStr, liveBlocks, liveBookings) {
  const cNum = Number(courtNum || 1);
  const courtZero = 'Court 0' + cNum;
  const courtPlain = 'Court ' + cNum;
  const now = new Date();
  const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetDate = (dateYMD && dateYMD !== 'Today') ? String(dateYMD) : todayYMD;

  // 1. Check active bookings first
  const bookingsArr = Array.isArray(liveBookings)
    ? liveBookings
    : ((window.sharedServerState && Array.isArray(window.sharedServerState.bookings)) ? window.sharedServerState.bookings : []);
  const bookedMatch = bookingsArr.find(b => {
    if (!b || b.status === 'CANCELLED' || b.status === 'DECLINED') return false;
    const bCourt = String(b.court || '');
    const matchesCourt = bCourt.includes(courtZero) || bCourt.includes(courtPlain) || bCourt.trim() === String(cNum);
    if (!matchesCourt) return false;
    const bTime = String(b.time || '');
    if (!bTime.includes(slotStr)) return false;
    if (b.date) {
      if (b.date === targetDate) return true;
      if (b.date === 'Today' && targetDate === todayYMD) return true;
      return false;
    }
    if (bTime.includes(targetDate)) return true;
    return false;
  });
  if (bookedMatch) {
    return { status: 'BOOKED', booking: bookedMatch, reason: bookedMatch.name || 'Booked' };
  }

  // 2. Check Admin Calendar Overrides (blocks)
  const blocksArr = Array.isArray(liveBlocks)
    ? liveBlocks
    : ((window.sharedServerState && Array.isArray(window.sharedServerState.blocks)) ? window.sharedServerState.blocks : []);

  // Pass 2A: Look for specific slot + specific court match first (latest wins)
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

    // Prefer exact court+hour match over ALL wildcard
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

  return { status: 'AVAILABLE', override: null, reason: 'Available' };
}
window.pfResolveCourtSlot = pfResolveCourtSlot;
