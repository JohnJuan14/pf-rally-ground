import os
import shutil

root = r"C:\Users\Acer\.gemini\antigravity\scratch\pf-rally-ground-v2"
mockup = r"C:\Users\Acer\.gemini\antigravity\scratch\pf-rally-ground-mockup"

old_block = """    /* Expired / Past Time Slots: Crisp & Legible in Both Modes */
    .pf-cal-slot-past,
    html[data-theme="light"] .pf-cal-slot-past {
      background-color: #F1F5F9 !important;
      border: 1px solid #CBD5E1 !important;
      color: #334155 !important;
      opacity: 1 !important;
      cursor: not-allowed !important;
    }
    .pf-cal-slot-past span,
    html[data-theme="light"] .pf-cal-slot-past span {
      color: #475569 !important;
      opacity: 1 !important;
    }
    html[data-theme="dark"] .pf-cal-slot-past {
      background-color: #08182E !important;
      border: 1px solid rgba(148, 163, 184, 0.35) !important;
      color: #CBD5E1 !important;
      opacity: 1 !important;
      cursor: not-allowed !important;
    }
    html[data-theme="dark"] .pf-cal-slot-past span {
      color: #94A3B8 !important;
      opacity: 1 !important;
    }"""

new_block = """    /* Expired / Past Time Slots: Translucent in Both Daylight & Night Mode */
    .pf-cal-slot-past,
    html[data-theme="light"] .pf-cal-slot-past,
    html[data-theme="dark"] .pf-cal-slot-past {
      background-color: rgba(209, 250, 229, 0.38) !important;
      border: 1px solid rgba(110, 231, 183, 0.38) !important;
      color: rgba(6, 95, 70, 0.42) !important;
      opacity: 0.52 !important;
      cursor: not-allowed !important;
    }
    .pf-cal-slot-past span,
    html[data-theme="light"] .pf-cal-slot-past span,
    html[data-theme="dark"] .pf-cal-slot-past span {
      color: rgba(6, 95, 70, 0.42) !important;
      opacity: 1 !important;
    }
    html[data-theme="dark"] #time-chips-container .pf-cal-slot-past {
      background-color: rgba(209, 250, 229, 0.12) !important;
      border: 1px solid rgba(110, 231, 183, 0.25) !important;
      color: rgba(209, 250, 229, 0.55) !important;
      opacity: 0.52 !important;
    }
    html[data-theme="dark"] #time-chips-container .pf-cal-slot-past span {
      color: rgba(209, 250, 229, 0.55) !important;
    }"""

for fn in ["index.html", "book.html", "pricing.html", "check-booking.html", "open-play.html"]:
    p = os.path.join(root, fn)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    assert old_block in s, f"old_block not found in {fn}"
    s = s.replace(old_block, new_block)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)
    if os.path.exists(mockup):
        shutil.copy2(p, os.path.join(mockup, fn))
    print("Updated", fn)
