// P&F Rally Ground - Shared Booking & Checkout Engine (HitPay & GHL)
// Fully optimized for Mobile, Tablet Portrait, and Desktop

let currentSelectedCourt = 1;
let currentSelectedSlot = "06:00 PM";
let isCurrentSlotPeak = true;
let playerCount = 4;
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
  document.body.classList.add('overflow-hidden'); // Lock body scroll on mobile
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

function launchHitPayCheckout() {
  const termsCheckbox = document.getElementById('accept-terms');
  if (termsCheckbox && !termsCheckbox.checked) {
    alert('Please accept the Payment, Cancellation & Facility Rules before proceeding to checkout.');
    termsCheckbox.focus();
    return;
  }

  const total = recalculateDrawerTotal();
  const courtEl = document.getElementById('hitpay-modal-court');
  const amtEl = document.getElementById('hitpay-modal-amount');
  if (courtEl) courtEl.textContent = courtNames[currentSelectedCourt];
  if (amtEl) amtEl.textContent = '₱' + total + '.00';
  
  const modal = document.getElementById('hitpay-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeHitPayModal() {
  const modal = document.getElementById('hitpay-modal');
  if (modal) modal.classList.add('hidden');
}

function simulateSuccessfulPayment() {
  closeHitPayModal();
  closeBookingDrawer();
  
  const ref = 'PF-' + Math.floor(10000 + Math.random() * 90000);
  const passRef = document.getElementById('pass-ref');
  const passName = document.getElementById('pass-name');
  const passCourt = document.getElementById('pass-court');
  const passTime = document.getElementById('pass-time');
  const custName = document.getElementById('cust-name');
  const custEmail = document.getElementById('cust-email');

  if (passRef) passRef.textContent = ref;
  if (passName) passName.textContent = (custName && custName.value) ? custName.value : 'Dexter Lim';
  if (passCourt) passCourt.textContent = courtNames[currentSelectedCourt];
  if (passTime) passTime.textContent = 'Today • ' + currentSelectedSlot;
  
  const bookingData = {
    ref: ref,
    name: (custName && custName.value) ? custName.value : 'Dexter Lim',
    email: (custEmail && custEmail.value) ? custEmail.value : 'player@pfrally.ph',
    court: courtNames[currentSelectedCourt],
    time: 'Today • ' + currentSelectedSlot,
    status: 'PAID & CONFIRMED',
    total: recalculateDrawerTotal()
  };
  localStorage.setItem('latest_booking', JSON.stringify(bookingData));
  localStorage.setItem('booking_' + ref, JSON.stringify(bookingData));

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
  const icsData = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Pickleball Match at P&F Rally Ground\nDESCRIPTION:Court: " + court + "\\nRef: " + ref + "\\nAutomated HitPay Checkout\\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR";
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', 'pf-rally-match.ics');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ESC key to close drawer/modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBookingDrawer();
    closeHitPayModal();
    closeMatchPassModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initDrawerSlots();
});
