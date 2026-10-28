// P&F Rally Ground - Court Booking Engine (Manual GCash & Cash Verification)
// Phase IV, Doña Maria Subd., Velasco St., Tagas, Daraga, Albay | 0999 883 2346

let currentSelectedCourt = 1;
let currentSelectedSlot = "06:00 PM";
let isCurrentSlotPeak = true;
let playerCount = 4;
let selectedPaymentMode = "gcash"; // 'gcash', 'bank', 'cash'

const courtNames = {
  1: "Court 01 (Indoor Championship)",
  2: "Court 02 (Indoor Tournament)",
  3: "Court 03 (Covered Outdoor)",
  4: "Court 04 (Pro Training Court)"
};

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
  const btnText = document.getElementById('proceed-btn-text');
  
  if (mode === 'cash') {
    if (hint) hint.textContent = 'Pay at Venue Desk upon Arrival';
    if (btnText) btnText.textContent = 'Reserve Court (Pay Cash at Venue) →';
  } else if (mode === 'bank') {
    if (hint) hint.textContent = 'Bank Transfer (BDO / Maya / QR Ph)';
    if (btnText) btnText.textContent = 'Proceed to Bank Transfer Details →';
  } else {
    if (hint) hint.textContent = 'Manual GCash Transfer / QR Scan';
    if (btnText) btnText.textContent = 'Proceed to GCash Payment Details →';
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

  const total = recalculateDrawerTotal();

  if (selectedPaymentMode === 'cash') {
    // Immediate Cash Reservation
    finalizeBookingRecord({
      mode: 'Cash (Pay at Venue Desk)',
      status: 'RESERVED (PAY AT VENUE)',
      refNo: 'CASH-' + Math.floor(10000 + Math.random() * 90000)
    });
  } else {
    // Open Manual Payment Details Modal
    const courtEl = document.getElementById('manual-modal-court');
    const amtEl = document.getElementById('manual-modal-amount');
    const titleEl = document.getElementById('modal-payment-title');
    const descEl = document.getElementById('modal-payment-desc');

    if (courtEl) courtEl.textContent = courtNames[currentSelectedCourt] + ' • ' + currentSelectedSlot;
    if (amtEl) amtEl.textContent = '₱' + total + '.00';

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
  const total = recalculateDrawerTotal();

  const guestName = (custName && custName.value.trim()) ? custName.value.trim() : 'Dexter Lim';
  const courtName = courtNames[currentSelectedCourt];
  const timeSlot = 'Today • ' + currentSelectedSlot;

  const bookingData = {
    ref: details.refNo,
    name: guestName,
    phone: (custPhone && custPhone.value.trim()) ? custPhone.value.trim() : '0999 883 2346',
    email: (custEmail && custEmail.value.trim()) ? custEmail.value.trim() : 'player@pfrally.ph',
    court: courtName,
    time: timeSlot,
    paymentMode: details.mode,
    status: details.status,
    total: total,
    transactionRef: details.transactionRef || 'N/A',
    createdAt: new Date().toISOString()
  };

  localStorage.setItem('latest_booking', JSON.stringify(bookingData));
  localStorage.setItem('booking_' + details.refNo, JSON.stringify(bookingData));

  // Update Match Pass Modal UI
  const passRef = document.getElementById('pass-ref');
  const passName = document.getElementById('pass-name');
  const passCourt = document.getElementById('pass-court');
  const passTime = document.getElementById('pass-time');
  const passPayMethod = document.getElementById('pass-paymethod');
  const passStatus = document.getElementById('pass-status');
  const passTag = document.getElementById('pass-header-tag');

  if (passRef) passRef.textContent = details.refNo;
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
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initDrawerSlots();
});
