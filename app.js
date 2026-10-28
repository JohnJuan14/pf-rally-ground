// P&F Rally Ground - Public Booking & Cart Engine (Manual GCash & Cash Verification)
// Phase IV, Doña Maria Subd., Velasco St., Tagas, Daraga, Albay | 0999 883 2346

let currentSelectedCourt = 1;
let currentSelectedSlot = "06:00 PM";
let isCurrentSlotPeak = true;
let playerCount = 4;
let selectedPaymentMode = "gcash"; // 'gcash', 'bank', 'cash'

// Live Cart Array
let cartItems = JSON.parse(localStorage.getItem('pf_cart_items') || '[]');

const courtNames = {
  1: "Court 01 (Indoor Championship)",
  2: "Court 02 (Indoor Tournament)",
  3: "Court 03 (Covered Outdoor)",
  4: "Court 04 (Pro Training Court)"
};

// ================= NAVIGATION & DRAWER TOGGLES =================

function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  const icon = document.getElementById('hamburger-icon');
  if (m) {
    const isHidden = m.classList.toggle('hidden');
    if (icon) {
      icon.innerHTML = isHidden 
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
    }
  }
}

function toggleCartDrawer() {
  const d = document.getElementById('cart-drawer');
  if (!d) return;
  const isOpening = d.classList.toggle('hidden');
  if (!isOpening) {
    document.body.classList.add('overflow-hidden');
    renderCartUI();
  } else {
    document.body.classList.remove('overflow-hidden');
  }
}

function openBookingDrawer(preSelectCourt = null) {
  if (preSelectCourt) {
    drawerSetCourt(preSelectCourt);
  }
  const drawer = document.getElementById('booking-drawer');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  initDrawerSlots();
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
    const tStr = (hr % 12 || 12) + ':00 ' + (hr >= 12 ? 'PM' : 'AM');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `min-h-[44px] p-2 rounded-xl border text-center text-xs font-bold transition touch-manipulation active:scale-95 ${
      tStr === currentSelectedSlot 
        ? 'border-brand-lime bg-brand-lime text-brand-black shadow-lg shadow-brand-lime/20' 
        : (isPeak ? 'border-brand-clay/30 bg-brand-clay/10 text-white hover:border-brand-clay' : 'border-white/10 bg-brand-black text-slate-300 hover:border-brand-lime/40')
    }`;
    btn.innerHTML = `<span>${tStr}</span><small class="block text-[9px] ${tStr === currentSelectedSlot ? 'text-brand-black font-black' : (isPeak ? 'text-brand-clay' : 'text-brand-lime')}">₱${isPeak ? 500 : 400}</small>`;
    btn.onclick = () => {
      currentSelectedSlot = tStr;
      isCurrentSlotPeak = isPeak;
      document.querySelectorAll('#drawer-slot-buttons button').forEach(b => {
        b.className = 'min-h-[44px] p-2 rounded-xl border text-center text-xs font-bold transition touch-manipulation active:scale-95 border-white/10 bg-brand-black text-slate-300 hover:border-brand-lime/40';
      });
      btn.className = 'min-h-[44px] p-2 rounded-xl border text-center text-xs font-bold transition touch-manipulation border-brand-lime bg-brand-lime text-brand-black shadow-lg shadow-brand-lime/20';
      const badge = document.getElementById('drawer-rate-badge');
      if (badge) badge.textContent = isPeak ? 'Peak Hour (₱500/hr)' : 'Regular Hour (₱400/hr)';
      recalculateDrawerTotal();
    };
    drawerSlots.appendChild(btn);
  }
}

function drawerSetCourt(c) {
  currentSelectedCourt = c;
  document.querySelectorAll('#drawer-court-buttons button').forEach((b, idx) => {
    b.className = (idx === c - 1)
      ? 'drawer-court active p-3 rounded-xl border border-brand-lime bg-brand-lime/10 text-left transition'
      : 'drawer-court p-3 rounded-xl border border-white/10 bg-brand-card text-left transition hover:border-white/20';
    const label = b.querySelector('span:last-child');
    if (label) {
      label.className = (idx === c - 1) ? 'text-xs font-black text-brand-lime' : 'text-xs font-black text-white';
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
  selectedPaymentMode = mode;
  const cards = document.querySelectorAll('.pay-mode-card');
  cards.forEach(c => {
    c.classList.remove('border-brand-lime', 'bg-brand-lime/10');
    c.classList.add('border-white/10', 'bg-brand-card');
    const radio = c.querySelector('input[type="radio"]');
    if (radio) radio.checked = (radio.value === mode);
  });

  const activeRadio = document.querySelector(`input[name="pay-mode"][value="${mode}"]`);
  if (activeRadio) {
    const parentCard = activeRadio.closest('.pay-mode-card');
    if (parentCard) {
      parentCard.classList.remove('border-white/10', 'bg-brand-card');
      parentCard.classList.add('border-brand-lime', 'bg-brand-lime/10');
    }
  }

  const hint = document.getElementById('pay-mode-hint');
  if (hint) {
    hint.textContent = mode === 'cash' ? 'Pay Cash at Venue Desk' : (mode === 'bank' ? 'Bank Transfer (BDO / Maya)' : 'GCash (Manual Transfer / QR)');
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
  const existing = cartItems.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cartItems.push({
      id: id,
      name: name,
      price: price,
      subtitle: subtitle,
      qty: 1
    });
  }
  saveCart();
  renderCartUI();
  
  // Show brief feedback
  const badge = document.getElementById('header-cart-badge');
  if (badge) {
    badge.classList.add('scale-125');
    setTimeout(() => badge.classList.remove('scale-125'), 200);
  }
}

function addCurrentCourtToCart() {
  const courtPrice = isCurrentSlotPeak ? 500 : 400;
  const courtId = 'court-' + currentSelectedCourt + '-' + currentSelectedSlot.replace(/[:\s]/g, '');
  
  // Remove existing court reservation in this slot if any
  cartItems = cartItems.filter(i => !i.id.startsWith('court-'));
  
  cartItems.unshift({
    id: courtId,
    name: courtNames[currentSelectedCourt],
    subtitle: 'Today • ' + currentSelectedSlot + (playerCount > 6 ? ` (${playerCount} Players, +₱${(playerCount-6)*100})` : ` (${playerCount} Players)`),
    price: courtPrice + (playerCount > 6 ? (playerCount - 6) * 100 : 0),
    qty: 1,
    isCourt: true
  });

  // Check gear toggles
  const paddle = document.getElementById('rent-paddle');
  const balls = document.getElementById('rent-balls');
  const machine = document.getElementById('rent-machine');
  
  if (paddle && paddle.checked) addItemToCart('gear-paddle', 'Carbon Fiber Paddle Rental', 100, 'Add-on Gear');
  if (balls && balls.checked) addItemToCart('gear-balls', 'Training Balls (50 pcs) Rental', 100, 'Add-on Gear');
  if (machine && machine.checked) addItemToCart('gear-machine', 'Ball Machine Rental (1 Hour)', 100, 'Add-on Gear');

  saveCart();
  closeBookingDrawer();
  toggleCartDrawer();
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

function renderCartUI() {
  const container = document.getElementById('cart-items-container');
  const totalEl = document.getElementById('cart-total-amount');
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  updateHeaderBadge();

  if (!container) return;

  if (cartItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-xs">
        <span class="text-4xl block mb-2 opacity-50">🛒</span>
        Your cart is currently empty.<br>Select a court or add pro-shop gear!
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
  if (totalEl) totalEl.textContent = '₱' + total;

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

  toggleCartDrawer(); // Close cart drawer
  
  // Check if cart has a court item
  const courtItem = cartItems.find(i => i.isCourt);
  const total = calculateCartTotal();

  if (selectedPaymentMode === 'cash') {
    finalizeBookingRecord({
      mode: 'Cash (Pay at Venue Desk)',
      status: 'RESERVED (PAY AT VENUE)',
      refNo: 'CASH-' + Math.floor(10000 + Math.random() * 90000)
    });
  } else {
    // Open payment proof modal with cart summary
    const courtEl = document.getElementById('manual-modal-court');
    const amtEl = document.getElementById('manual-modal-amount');
    const titleEl = document.getElementById('modal-payment-title');
    const descEl = document.getElementById('modal-payment-desc');

    if (courtEl) courtEl.textContent = courtItem ? courtItem.name + ' • ' + courtItem.subtitle : 'Pro Shop & Court Items (' + cartItems.length + ')';
    if (amtEl) amtEl.textContent = '₱' + total + '.00';
    const qrImg = document.getElementById('locked-qr-img');
    if (qrImg) qrImg.src = generateLockedQrUrl(total);

    if (selectedPaymentMode === 'bank') {
      if (titleEl) titleEl.textContent = 'BDO / Bank Transfer Details';
      if (descEl) descEl.textContent = 'Transfer to BDO or scan QR Ph. Upload screenshot or enter reference below.';
    } else {
      if (titleEl) titleEl.textContent = 'Scan GCash QR Code';
      if (descEl) descEl.textContent = 'Scan the venue QR or send to GCash 0999 883 2346. Enter reference below.';
    }

    const modal = document.getElementById('payment-modal');
    if (modal) modal.classList.remove('hidden');
  }
}

// ================= DIRECT CHECKOUT & PAYMENT MODAL =================

function handleProceedToPayment() {
  const termsCheckbox = document.getElementById('accept-terms');
  if (termsCheckbox && !termsCheckbox.checked) {
    alert('Please agree to the booking and reschedule policy before proceeding.');
    termsCheckbox.focus();
    return;
  }

  const custName = document.getElementById('cust-name');
  if (custName && !custName.value.trim()) {
    alert('Please enter your full name.');
    custName.focus();
    return;
  }

  const custPhone = document.getElementById('cust-phone');
  if (custPhone && !custPhone.value.trim()) {
    alert('Please enter your contact phone number.');
    custPhone.focus();
    return;
  }

  // Also sync current selection into cart
  addCurrentCourtToCart();
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) modal.classList.add('hidden');
}

function submitManualPaymentConfirmation() {
  const manualRef = document.getElementById('manual-ref-input') ? document.getElementById('manual-ref-input').value.trim() : '';
  const refCode = 'PF-' + Math.floor(10000 + Math.random() * 90000);

  closePaymentModal();
  finalizeBookingRecord({
    mode: selectedPaymentMode === 'bank' ? 'Bank Transfer' : 'GCash (Manual Transfer)',
    status: 'PENDING VERIFICATION',
    transactionRef: manualRef || 'Submitted via Web',
    refNo: refCode
  });
}

function finalizeBookingRecord(details) {
  closeBookingDrawer();

  const custName = document.getElementById('cust-name');
  const custPhone = document.getElementById('cust-phone');
  const custEmail = document.getElementById('cust-email');
  const total = calculateCartTotal() || recalculateDrawerTotal();

  const guestName = (custName && custName.value.trim()) ? custName.value.trim() : 'Dexter Lim';
  const courtItem = cartItems.find(i => i.isCourt);
  const courtName = courtItem ? courtItem.name : courtNames[currentSelectedCourt];
  const timeSlot = courtItem ? courtItem.subtitle : ('Today • ' + currentSelectedSlot);

  const bookingData = {
    ref: details.refNo,
    name: guestName,
    phone: (custPhone && custPhone.value.trim()) ? custPhone.value.trim() : '0999 883 2346',
    email: (custEmail && custEmail.value.trim()) ? custEmail.value.trim() : 'guest@pfrally.ph',
    court: courtName,
    time: timeSlot,
    paymentMode: details.mode,
    status: details.status,
    total: total,
    items: [...cartItems],
    transactionRef: details.transactionRef || 'N/A',
    createdAt: new Date().toISOString()
  };

  localStorage.setItem('latest_booking', JSON.stringify(bookingData));
  localStorage.setItem('booking_' + details.refNo, JSON.stringify(bookingData));

  // Reset cart
  cartItems = [];
  saveCart();
  renderCartUI();

  // Update Match Pass Modal UI
  const passRef = document.getElementById('pass-ref');
  const passNoteRef = document.getElementById('pass-note-ref');
  const passName = document.getElementById('pass-name');
  const passCourt = document.getElementById('pass-court');
  const passTime = document.getElementById('pass-time');
  const passPayMethod = document.getElementById('pass-paymethod');
  const passStatus = document.getElementById('pass-status');
  const passTag = document.getElementById('pass-header-tag');

  if (passRef) passRef.textContent = details.refNo;
  if (passNoteRef) passNoteRef.textContent = details.refNo;
  if (passName) passName.textContent = guestName;
  if (passCourt) passCourt.textContent = courtName;
  if (passTime) passTime.textContent = timeSlot;
  if (passPayMethod) passPayMethod.textContent = details.mode;
  if (passStatus) passStatus.textContent = '● ' + details.status;
  if (passTag) passTag.textContent = details.status.includes('RESERVED') ? 'COURT RESERVED • PAY AT VENUE' : 'BOOKING RECEIVED • PENDING VERIFICATION';

  const matchModal = document.getElementById('match-pass-modal');
  if (matchModal) matchModal.classList.remove('hidden');
}

function closeMatchPassModal() {
  const modal = document.getElementById('match-pass-modal');
  if (modal) modal.classList.add('hidden');
}

function downloadCalendarInvite() {
  const ref = document.getElementById('pass-ref') ? document.getElementById('pass-ref').textContent : 'PF-84920';
  const court = courtNames[currentSelectedCourt];
  const icsData = "BEGIN:VCALENDAR\\nVERSION:2.0\\nBEGIN:VEVENT\\nSUMMARY:Pickleball Match at P&F Rally Ground\\nDESCRIPTION:Court: " + court + "\\nRef: " + ref + "\\nVenue: Phase IV, Dona Maria Subd., Velasco St., Tagas, Daraga, Albay\\nContact: 0999 883 2346\\nSTATUS:CONFIRMED\\nEND:VEVENT\\nEND:VCALENDAR";
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
    if (cart) cart.classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initDrawerSlots();
  renderCartUI();
});

// ================= AI RECEIPT SCANNER & DYNAMIC LOCKED QR =================

function generateLockedQrUrl(amount) {
  // Pre-locks Merchant, Tagas Daraga Albay, Contact, and Exact Amount in standard QR Ph format
  const payload = `00020101021226500010com.gcash01120999883234652045999530360854${amount < 1000 ? '0' + amount.toFixed(2).length : amount.toFixed(2).length}${amount.toFixed(2)}5802PH5916PF RALLY GROUND6006DARAGA6304`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(payload)}`;
}

async function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('ocr-status-badge');
  const refInput = document.getElementById('manual-ref-input');
  
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = `<span class="inline-block animate-spin mr-1.5">⚡</span> Scanning receipt with AI OCR...`;
    statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/10 border border-brand-lime/20 rounded-xl px-3 py-1.5 block mt-2';
  }

  try {
    // Check if Tesseract is available
    if (typeof Tesseract !== 'undefined') {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: m => {
          if (statusEl && m.status === 'recognizing text') {
            statusEl.innerHTML = `<span class="inline-block animate-spin mr-1.5">⚡</span> Reading text (${Math.floor(m.progress * 100)}%)...`;
          }
        }
      });

      const text = result.data.text;
      console.log("OCR Recognized Text:", text);

      // Regex matches GCash Ref No patterns:
      // "Ref No. 1029 3848 1029", "Reference No. 10293848", "Ref: 1002-9182-3849"
      const match = text.match(/(?:ref(?:erence)?\.?\s*(?:no\.?|#)?\s*[:\s]*)([0-9\s-]{9,24})/i) 
                 || text.match(/([0-9]{4}\s+[0-9]{4}\s+[0-9]{4,6})/)
                 || text.match(/([0-9]{10,16})/);

      if (match && match[1]) {
        const cleanRef = match[1].replace(/[^0-9]/g, '');
        if (cleanRef.length >= 8) {
          if (refInput) {
            refInput.value = cleanRef;
            refInput.classList.add('border-brand-lime', 'bg-brand-lime/10');
          }
          if (statusEl) {
            statusEl.innerHTML = `✓ Auto-Extracted Ref: <b class="font-mono text-white text-xs">${cleanRef}</b>`;
            statusEl.className = 'text-[11px] font-bold text-brand-lime bg-brand-lime/15 border border-brand-lime/40 rounded-xl px-3 py-1.5 block mt-2';
          }
          return;
        }
      }
    }

    // Fallback if OCR didn't catch a sharp number
    if (statusEl) {
      statusEl.innerHTML = `✓ Receipt attached. (Please verify reference number below)`;
      statusEl.className = 'text-[11px] font-bold text-slate-300 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 block mt-2';
    }
  } catch (err) {
    console.error("OCR Error:", err);
    if (statusEl) {
      statusEl.innerHTML = `✓ Receipt attached. (Enter Ref No. below if not detected)`;
      statusEl.className = 'text-[11px] text-slate-400 bg-white/5 rounded-xl px-3 py-1.5 block mt-2';
    }
  }
}
