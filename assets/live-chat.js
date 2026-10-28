// P&F Rally Ground Pickleball Club - Interactive Customer Live Chat Support Widget
(function() {
  'use strict';

  // Inject CSS styles for the widget
  const style = document.createElement('style');
  style.textContent = `
    .pf-chat-btn-pulse {
      box-shadow: 0 0 0 0 rgba(155, 230, 0, 0.7);
      animation: pfPulse 2s infinite;
    }
    @keyframes pfPulse {
      0% { box-shadow: 0 0 0 0 rgba(155, 230, 0, 0.7); }
      70% { box-shadow: 0 0 0 14px rgba(155, 230, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(155, 230, 0, 0); }
    }
    .pf-chat-window {
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pf-chat-window.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(16px) scale(0.96);
    }
    .pf-chat-window:not(.hidden) {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
  `;
  document.head.appendChild(style);

  // Widget Container
  const container = document.createElement('div');
  container.id = 'pf-live-chat-container';
  container.className = 'fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 select-none';
  container.innerHTML = `
    <!-- Floating Chat Launcher Button -->
    <button id="pf-chat-launcher" onclick="window.togglePfLiveChat()" class="pf-chat-btn-pulse relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-brand-lime text-brand-black font-black uppercase text-xs tracking-wider shadow-2xl hover:bg-brand-limeHover transition active:scale-95 cursor-pointer border-2 border-white/20">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-dark opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-dark"></span>
      </span>
      <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      <span class="hidden sm:inline font-black">Live Chat &bull; Help</span>
    </button>

    <!-- Chat Window Modal -->
    <div id="pf-chat-modal" class="pf-chat-window hidden fixed bottom-20 right-3 sm:right-6 w-[calc(100vw-24px)] sm:w-[380px] h-[520px] max-h-[80vh] bg-brand-dark border border-brand-lime/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-50">
      <!-- Header -->
      <div class="px-4 py-3.5 bg-brand-black/90 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="relative">
            <img src="assets/logo.png" alt="P&F Logo" class="w-9 h-9 rounded-xl object-contain bg-white p-0.5 shadow">
            <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-lime border-2 border-brand-black"></span>
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <h4 class="text-sm font-black uppercase text-white leading-tight">P&amp;F Live Support</h4>
              <span class="px-1.5 py-0.2 rounded bg-brand-lime/20 text-brand-lime text-[9px] font-mono font-bold">ONLINE</span>
            </div>
            <p class="text-[10px] text-slate-300">Staff replies instantly &bull; Daraga, Albay</p>
          </div>
        </div>
        <button onclick="window.togglePfLiveChat(false)" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition" aria-label="Close Chat">✕</button>
      </div>

      <!-- Messages Thread -->
      <div id="pf-chat-messages" class="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
        <!-- Initial Bot Greeting -->
        <div class="flex items-start gap-2.5">
          <img src="assets/logo.png" alt="Staff" class="w-7 h-7 rounded-lg object-contain bg-white p-0.5 flex-shrink-0 mt-0.5">
          <div class="bg-brand-black/90 border border-white/10 rounded-2xl rounded-tl-sm p-3.5 text-slate-200 leading-relaxed shadow-sm max-w-[85%]">
            <p class="font-bold text-white mb-1">Mabuhay! Welcome to P&amp;F Rally Ground! 🎾</p>
            <p>How can we help your game today? Tap any topic below or ask us directly:</p>
          </div>
        </div>

        <!-- Quick Topic Chips -->
        <div class="pt-1 flex flex-wrap gap-1.5" id="pf-chat-chips">
          <button type="button" onclick="window.sendPfQuickQuestion('rates')" class="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-brand-lime hover:text-brand-black border border-white/10 text-[11px] text-slate-200 font-semibold transition">💰 Court Rates &amp; Hours</button>
          <button type="button" onclick="window.sendPfQuickQuestion('payment')" class="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-brand-lime hover:text-brand-black border border-white/10 text-[11px] text-slate-200 font-semibold transition">💳 GCash / Bank Info</button>
          <button type="button" onclick="window.sendPfQuickQuestion('rentals')" class="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-brand-lime hover:text-brand-black border border-white/10 text-[11px] text-slate-200 font-semibold transition">🏓 Racket &amp; Ball Rental</button>
          <button type="button" onclick="window.sendPfQuickQuestion('location')" class="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-brand-lime hover:text-brand-black border border-white/10 text-[11px] text-slate-200 font-semibold transition">📍 Location &amp; Parking</button>
          <button type="button" onclick="window.sendPfQuickQuestion('staff')" class="px-2.5 py-1.5 rounded-full bg-brand-lime/15 hover:bg-brand-lime hover:text-brand-black border border-brand-lime/40 text-[11px] text-brand-lime font-bold transition">💬 Chat with Human Staff</button>
        </div>
      </div>

      <!-- Human Staff Banner -->
      <div class="px-3.5 py-2 bg-brand-black/95 border-t border-white/10 flex items-center justify-between text-[11px]">
        <span class="text-slate-300 flex items-center gap-1 font-medium">Direct Club Line: <b class="text-brand-lime font-mono">0999 883 2346</b></span>
        <a href="https://wa.me/639998832346?text=Hi%20P%26F%20Rally%20Ground%20team,%20I%20have%20a%20question%20about%20court%20reservation" target="_blank" rel="noopener noreferrer" class="text-brand-lime font-bold hover:underline flex items-center gap-1">WhatsApp ↗</a>
      </div>

      <!-- Chat Input Field -->
      <form onsubmit="window.handlePfChatSubmit(event)" class="p-3 bg-brand-card/90 border-t border-white/10 flex items-center gap-2">
        <input type="text" id="pf-chat-input" placeholder="Type your question here..." autocomplete="off" class="flex-1 bg-brand-black border border-white/15 focus:border-brand-lime rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition font-sans">
        <button type="submit" class="w-10 h-10 rounded-xl bg-brand-lime text-brand-black hover:bg-brand-limeHover flex items-center justify-center font-black active:scale-95 transition flex-shrink-0" aria-label="Send Message">
          <svg class="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 19V5m0 0l-7 7m7-7l7 7"/></svg>
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(container);

  // Toggle Function
  window.togglePfLiveChat = function(force) {
    const modal = document.getElementById('pf-chat-modal');
    if (!modal) return;
    const isClosed = modal.classList.contains('hidden');
    const shouldOpen = typeof force === 'boolean' ? force : isClosed;
    if (shouldOpen) {
      modal.classList.remove('hidden');
      const input = document.getElementById('pf-chat-input');
      if (input) setTimeout(() => input.focus(), 150);
    } else {
      modal.classList.add('hidden');
    }
  };

  // Bot Knowledge Base
  const KNOWLEDGE = {
    rates: `<b>Court Rates & Hours:</b><br>
      &bull; <b>Regular Hours (₱400/hr):</b> Mon–Fri 6:00 AM – 5:00 PM<br>
      &bull; <b>Peak Hours (₱500/hr):</b> Weekdays 5:00 PM – 10:00 PM & All Weekends/Holidays<br>
      &bull; Includes USAPA-spec net, pro LED illumination, and clean perimeter court divider netting.`,
    
    payment: `<b>Online Payment Options:</b><br>
      &bull; <b>GCash:</b> Scan the QR code or send to <b class="text-brand-lime font-mono">0999 883 2346</b> (P&F Rally Ground).<br>
      &bull; <b>Bank Transfer:</b> BDO (<b class="font-mono">0045 8802 9143</b>) or BPI (<b class="font-mono">4891 0032 74</b>).<br>
      &bull; After sending, submit your <b>Reference Number</b> in the booking form for instant reservation!`,

    rentals: `<b>Equipment & Paddle Rentals:</b><br>
      &bull; <b>Pro Carbon Paddle:</b> ₱50 per session<br>
      &bull; <b>Dura Fast 40 Outdoor Balls (Set of 3):</b> ₱100<br>
      &bull; Grip tape, hydration drinks, and court towels are also available at the desk!`,

    location: `<b>Location & Parking:</b><br>
      &bull; <b>Address:</b> Bagumbayan, Daraga, Albay 4501 (near Bicol University & Daraga Church).<br>
      &bull; <b>Parking:</b> 15+ secured, flood-lit parking slots for cars and motorcycles.<br>
      &bull; Search <i>"P&F Rally Ground"</i> on Google Maps or Waze!`,

    staff: `<b>Talk to Staff Directly:</b><br>
      &bull; <b>Phone / SMS:</b> <a href="tel:09998832346" class="text-brand-lime font-mono underline font-bold">0999 883 2346</a><br>
      &bull; <b>WhatsApp:</b> <a href="https://wa.me/639998832346" target="_blank" class="text-brand-lime underline font-bold">Tap to Chat on WhatsApp &nearr;</a><br>
      &bull; <b>Club Desk:</b> Staff is on-site daily from 6:00 AM to 10:00 PM.`
  };

  function appendChatMessage(sender, htmlContent) {
    const thread = document.getElementById('pf-chat-messages');
    if (!thread) return;

    const row = document.createElement('div');
    if (sender === 'user') {
      row.className = 'flex justify-end';
      row.innerHTML = `<div class="bg-brand-lime text-brand-black font-bold rounded-2xl rounded-tr-sm p-3 max-w-[85%] leading-relaxed shadow">${htmlContent}</div>`;
    } else {
      row.className = 'flex items-start gap-2.5';
      row.innerHTML = `
        <img src="assets/logo.png" alt="Staff" class="w-7 h-7 rounded-lg object-contain bg-white p-0.5 flex-shrink-0 mt-0.5 shadow">
        <div class="bg-brand-black/90 border border-white/10 rounded-2xl rounded-tl-sm p-3.5 text-slate-200 leading-relaxed shadow-sm max-w-[85%]">
          ${htmlContent}
        </div>
      `;
    }
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  window.sendPfQuickQuestion = function(key) {
    const titles = {
      rates: 'Court Rates & Hours',
      payment: 'GCash & Bank Payment Info',
      rentals: 'Paddle & Ball Rental Fees',
      location: 'Location & Parking',
      staff: 'Chat with Human Staff'
    };
    appendChatMessage('user', titles[key] || key);
    setTimeout(() => {
      appendChatMessage('bot', KNOWLEDGE[key] || 'How else can we assist you?');
    }, 350);
  };

  window.handlePfChatSubmit = function(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('pf-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    appendChatMessage('user', text);

    const q = text.toLowerCase();
    setTimeout(() => {
      if (q.includes('rate') || q.includes('price') || q.includes('cost') || q.includes('magkano') || q.includes('hour')) {
        appendChatMessage('bot', KNOWLEDGE.rates);
      } else if (q.includes('gcash') || q.includes('pay') || q.includes('bank') || q.includes('bdo') || q.includes('bpi') || q.includes('bayad')) {
        appendChatMessage('bot', KNOWLEDGE.payment);
      } else if (q.includes('rental') || q.includes('paddle') || q.includes('racket') || q.includes('ball') || q.includes('rent')) {
        appendChatMessage('bot', KNOWLEDGE.rentals);
      } else if (q.includes('location') || q.includes('where') || q.includes('saan') || q.includes('parking') || q.includes('address') || q.includes('daraga')) {
        appendChatMessage('bot', KNOWLEDGE.location);
      } else if (q.includes('staff') || q.includes('human') || q.includes('person') || q.includes('call') || q.includes('number') || q.includes('contact')) {
        appendChatMessage('bot', KNOWLEDGE.staff);
      } else if (q.includes('open play') || q.includes('schedule') || q.includes('coaching') || q.includes('court')) {
        appendChatMessage('bot', `You can view available courts and book directly using the calendar and court selector above! We have 4 tournament-grade courts ready for singles and doubles.`);
      } else {
        appendChatMessage('bot', `Thanks for reaching out! Our Daraga front-desk staff can answer that right away. You can call or WhatsApp us at <a href="tel:09998832346" class="text-brand-lime font-mono font-bold underline">0999 883 2346</a>, or let us know if you need help reserving a slot!`);
      }
    }, 450);
  };

})();
