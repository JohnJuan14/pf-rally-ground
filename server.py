# -*- coding: utf-8 -*-
import http.server
import socketserver
import json
import os
import threading
import urllib.parse
import re
import smtplib
import secrets
import time
import html as html_lib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

SCRATCH_DIR = r"C:\Users\Acer\.gemini\antigravity\scratch"
PUBLIC_DIR = os.path.join(SCRATCH_DIR, "pf-rally-ground-mockup")
ADMIN_DIR = os.path.join(SCRATCH_DIR, "pf-rally-ground-admin")
DB_FILE = os.path.join(SCRATCH_DIR, "pf_shared_db.json")

db_lock = threading.Lock()

# Cybersecurity: In-memory brute-force tracker & active session tokens
LOGIN_ATTEMPTS = {}  # ip -> {"count": int, "locked_until": float}
ACTIVE_ADMIN_TOKENS = set()
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 60

DEFAULT_DB = {
    "bookings": [],
    "blocks": [],
    "salesLedger": [],
    "inventory": [],
    "categories": [],
    "announcements": [],
    "securityLog": [],
    "adminPassword": "admin_123!",
    "gmailConfig": {
        "adminEmail": "",
        "appPassword": "",
        "notifyOnNewBooking": True,
        "sendCustomerReceipt": True
    },
    "paymentConfig": {
        "gcashNumber": "09998832346",
        "gcashName": "P&F Rally Ground",
        "bdoNumber": "004588029143",
        "bpiNumber": "4891003274",
        "standeeUrl": "assets/qr-gcash.png"
    },
    "siteConfig": {
        "clubName": "P&F Rally Ground",
        "clubSubtitle": "Pickleball Club • Daraga",
        "clubLogo": "assets/logo.png",
        "heroTagline": "PHILIPPINES • 4 PRO PICKLEBALL COURTS",
        "heroTitleLine1": "PLAY.",
        "heroTitleLine2": "COMPETE.",
        "heroTitleAccent": "CONNECT.",
        "heroSubtitle": "Your home court in Daraga, Albay for premier rallies, tournament-grade cushion surfaces, pro equipment rentals, and verified online booking.",
        "heroPrimaryBtn": "Book Your Court",
        "heroSecondaryBtn": "View Live Schedule",
        "heroSlide1": "assets/hero-slide-1.jpg",
        "heroSlide2": "assets/hero-slide-2.jpg",
        "heroSlide3": "assets/hero-slide-3.jpg",
        "court1Img": "assets/court-aerial-vertical.jpg",
        "court2Img": "assets/court-aerial-angled.jpg",
        "court3Img": "assets/hero.jpg",
        "court4Img": "assets/court-aerial-angled.jpg",
        "gearStdImg": "assets/gear-composite-paddle.jpg",
        "gearCarbonImg": "assets/gear-carbon-paddle.jpg",
        "gearBrandedImg": "assets/gear-carbon-paddle.jpg",
        "gearBallImg": "assets/gear-balls-x40.jpg",
        "gearBucketImg": "assets/gear-balls-x40.jpg",
        "gearMachineImg": "assets/gear-ball-machine.jpg",
        "liveBannerEnabled": True,
        "liveBannerText": "LIVE CLUB UPDATE: All 4 Pro Cushion Courts Open Daily 6:00 AM – 12:00 Midnight • Book Online via GCash, Maya, or BDO!",
        "bentoSectionTag": "EXPERIENCE",
        "bentoSectionTitle": "PLAY THE CLUB",
        "bentoSectionDesc": "Everything you need to play, improve, and compete under one roof. World-class surface, vibrant community, and zero booking friction.",
        "scheduleHeading": "COURT TIMELINE",
        "openPlayScheduleText": "Open Play: Mon 3–6 PM • Tue–Thu 3–8 PM • Fri 3–11 PM • Sat 6–10 PM",
        "dayRate": 400,
        "nightRate": 500,
        "includedPlayers": 6,
        "extraPlayerFee": 100,
        "openPlayRate": 150,
        "pricePaddleStd": 50,
        "pricePaddleCarbon": 100,
        "pricePaddleBranded": 200,
        "priceBallSingle": 50,
        "priceBallsBucket": 100,
        "priceMachine": 100,
        "court1Name": "Court 01 — Indoor Championship",
        "court2Name": "Court 02 — Indoor Tournament",
        "court3Name": "Court 03 — Covered Outdoor",
        "court4Name": "Court 04 — Pro Training Court",
        "clubAddress": "Phase IV, Doña Maria Subdivision, Velasco St., Tagas, Daraga, 4501 Albay",
        "clubPhone": "0999 883 2346",
        "clubHours": "6:00 AM – 12:00 AM",
        "updatedAt": 0
}
}

def sanitize_str(val, max_len=250):
    if val is None:
        return ""
    s = str(val).strip()[:max_len]
    # Strip raw script tags or dangerous event attributes
    s = re.sub(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"[<>]", "", s)
    return s

import re

def append_security_log(db, event_type, detail, ip="127.0.0.1"):
    if "securityLog" not in db or not isinstance(db["securityLog"], list):
        db["securityLog"] = []
    db["securityLog"].insert(0, {
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "event": event_type,
        "detail": detail,
        "ip": ip
    })
    db["securityLog"] = db["securityLog"][:40]

def load_db():
    with db_lock:
        if not os.path.exists(DB_FILE):
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_DB, f, indent=2)
            return json.loads(json.dumps(DEFAULT_DB))
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "adminPassword" not in data or not data["adminPassword"]:
                    data["adminPassword"] = "admin_123!"
                for k in ["bookings", "blocks", "salesLedger", "inventory", "categories", "announcements", "securityLog"]:
                    if k not in data or not isinstance(data[k], list):
                        data[k] = []
                if "gmailConfig" not in data or not isinstance(data["gmailConfig"], dict):
                    data["gmailConfig"] = dict(DEFAULT_DB["gmailConfig"])
                if "siteConfig" not in data or not isinstance(data["siteConfig"], dict):
                    data["siteConfig"] = dict(DEFAULT_DB["siteConfig"])
                else:
                    merged_sc = dict(DEFAULT_DB["siteConfig"])
                    merged_sc.update(data["siteConfig"])
                    data["siteConfig"] = merged_sc
                return data
        except Exception:
            return json.loads(json.dumps(DEFAULT_DB))

def save_db(data):
    with db_lock:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def parse_amount(val, default=400.0):
    if val is None:
        return float(default)
    if isinstance(val, (int, float)):
        return float(val)
    s = re.sub(r"[^0-9.\-]", "", str(val))
    try:
        return float(s) if s else float(default)
    except Exception:
        return float(default)

def has_emoji(s):
    if not s:
        return False
    for ch in str(s):
        cp = ord(ch)
        if (0x1F300 <= cp <= 0x1FAFF) or (0x2600 <= cp <= 0x27BF) or (0x1F000 <= cp <= 0x1F2FF):
            return True
    return False

def deduct_inventory_for_items(db, items):
    if not items or not isinstance(items, list):
        return
    inventory = db.get("inventory", [])
    for cart_item in items:
        if not isinstance(cart_item, dict) or cart_item.get("isCourt"):
            continue
        cid = str(cart_item.get("id", "")).strip()
        cname = str(cart_item.get("name", "")).strip().lower()
        qty = max(1, int(cart_item.get("qty", 1) or 1))

        for inv in inventory:
            inv_id = str(inv.get("id", "")).strip()
            inv_name = str(inv.get("name", "")).strip().lower()
            if (cid and cid == inv_id) or (cname and cname == inv_name) or (cname and inv_name and (inv_name in cname or cname in inv_name)):
                current_stock = int(inv.get("stock", 0) or 0)
                inv["stock"] = max(0, current_stock - qty)
                break

def send_gmail_smtp(gmail_cfg, to_email, subject, html_body, plain_body):
    admin_email = (gmail_cfg.get("adminEmail") or "").strip()
    app_pw = (gmail_cfg.get("appPassword") or "").strip().replace(" ", "")
    if not admin_email or not app_pw or not to_email:
        return False, "Gmail address or App Password not configured for background SMTP."
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"P&F Rally Ground <{admin_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(plain_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(admin_email, app_pw)
            server.sendmail(admin_email, [to_email], msg.as_string())
        return True, f"Email sent via Gmail SMTP to {to_email}"
    except Exception as e:
        return False, str(e)

def trigger_booking_gmail_notifications(db, booking):
    gmail_cfg = db.get("gmailConfig") or {}
    admin_email = (gmail_cfg.get("adminEmail") or "").strip()
    app_pw = (gmail_cfg.get("appPassword") or "").strip()
    if not admin_email or not app_pw:
        return

    ref = booking.get("ref", "N/A")
    name = booking.get("name", "Guest")
    phone = booking.get("phone", "N/A")
    cust_email = (booking.get("email") or "").strip()
    court = booking.get("court", "Court")
    time_slot = booking.get("time", "Scheduled")
    pay_mode = booking.get("paymentMethod", "GCash")
    pay_ref = booking.get("transactionRef", "N/A")
    total = booking.get("total", 0)
    status = booking.get("status", "PENDING")

    subject = f"[P&F Rally Ground] Booking {ref} — {name}"
    plain = (
        f"P&F RALLY GROUND PICKLEBALL CLUB\n"
        f"Booking Reference: {ref}\n"
        f"Customer: {name} ({phone})\n"
        f"Order: {court}\n"
        f"Schedule: {time_slot}\n"
        f"Payment: {pay_mode} (Ref #: {pay_ref})\n"
        f"Total Amount: PHP {total}\n"
        f"Status: {status}\n"
    )
    html = f"<div style='font-family:Arial,sans-serif;padding:20px;background:#050E1D;color:#fff;border-radius:14px;border:2px solid #9BE600;'><h3 style='color:#9BE600;margin-top:0;'>P&F Rally Ground — Booking {html_lib.escape(str(ref))}</h3><pre style='white-space:pre-wrap;font-family:inherit;color:#fff;'>{html_lib.escape(plain)}</pre></div>"

    def _bg():
        if gmail_cfg.get("notifyOnNewBooking", True):
            send_gmail_smtp(gmail_cfg, admin_email, subject, html, plain)
        if gmail_cfg.get("sendCustomerReceipt", True) and cust_email and "@" in cust_email and cust_email != "guest@pfrally.ph":
            send_gmail_smtp(gmail_cfg, cust_email, subject, html, plain)

    threading.Thread(target=_bg, daemon=True).start()

class UnifiedHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        # Cybersecurity Hardening Headers
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/state":
            db = load_db()
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["sales"] = db.get("salesLedger", [])
            public_state["passwordProtected"] = True
            gcfg = dict(db.get("gmailConfig") or {})
            gcfg["hasAppPassword"] = bool((gcfg.get("appPassword") or "").strip())
            gcfg["appPassword"] = ""
            public_state["gmailConfig"] = gcfg
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(public_state).encode("utf-8"))
            return
        elif parsed.path == "/api/announcements":
            db = load_db()
            self._send_json({"ok": True, "announcements": db.get("announcements", [])})
            return
        elif parsed.path == "/api/site-config":
            db = load_db()
            default_sc = DEFAULT_DB.get("siteConfig", {})
            current_sc = dict(default_sc)
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            self._send_json({"ok": True, "siteConfig": current_sc})
            return

        elif parsed.path == "/api/payment-config":
            db = load_db()
            cfg = db.get("paymentConfig") or {
                "gcashNumber": "09998832346",
                "gcashName": "P&F Rally Ground",
                "bdoNumber": "004588029143",
                "bpiNumber": "4891003274",
                "standeeUrl": "assets/qr-gcash.png"
            }
            self._send_json(cfg)
            return
        elif parsed.path.startswith("/api/booking/"):
            ref = parsed.path.split("/api/booking/")[1].strip().upper()
            db = load_db()
            found = next((b for b in db["bookings"] if b.get("ref", "").upper() == ref), None)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            payload = {"found": bool(found), "booking": found}
            if found:
                payload.update(found)
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return
        # Clean URL Routing for local host
        if parsed.path in ("/book", "/book/"):
            self.path = "/book.html"
        elif parsed.path in ("/my-booking", "/my-booking/", "/check-booking", "/check-booking/"):
            self.path = "/check-booking.html"
        elif parsed.path in ("/courts", "/courts/"):
            self.path = "/courts.html"
        elif parsed.path in ("/pricing", "/pricing/"):
            self.path = "/pricing.html"
        elif parsed.path in ("/admin", "/admin/"):
            self.path = "/admin/index.html"


        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        if length > 5 * 1024 * 1024:
            self._send_json({"ok": False, "error": "Payload too large."}, status=413)
            return
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

        client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
        db = load_db()

        if parsed.path in ("/api/bookings", "/api/booking"):
            raw_name = sanitize_str(body.get("name") or body.get("customerName") or "Valued Guest", 80)
            raw_phone = sanitize_str(body.get("phone") or body.get("customerPhone") or "0999 883 2346", 30)
            raw_email = sanitize_str(body.get("email") or body.get("customerEmail") or "", 100)
            raw_ref = sanitize_str(body.get("transactionRef") or body.get("paymentRef") or "", 60)
            # Strip emojis if any instead of rejecting the booking
            raw_name = "".join(ch for ch in raw_name if not has_emoji(ch)).strip() or "Valued Guest"
            raw_phone = "".join(ch for ch in raw_phone if not has_emoji(ch)).strip() or "0999 883 2346"
            raw_ref = "".join(ch for ch in raw_ref if not has_emoji(ch)).strip() or "N/A"

            items = body.get("items", [])
            if not isinstance(items, list):
                items = [str(items)]

            booking_ref = sanitize_str(body.get("ref") or ("PF-" + str(int(datetime.now().timestamp() * 1000))[-6:]), 30)
            court_val = sanitize_str(body.get("court", "Court 01"), 250)
            date_val = sanitize_str(body.get("date", ""), 40)
            time_val = sanitize_str(body.get("time", "Today • 06:00 PM"), 100)
            if date_val and date_val not in time_val:
                display_time = f"{date_val} • {time_val}"
            else:
                display_time = time_val

            pay_mode = sanitize_str(body.get("paymentMethod") or body.get("paymentMode") or "GCash", 50)
            total_val = parse_amount(body.get("total", 400), 400.0)
            status_val = sanitize_str(body.get("status", "PENDING"), 40).upper()
            if status_val.startswith("PENDING"):
                status_val = "PENDING"

            new_booking = {
                "ref": booking_ref,
                "name": raw_name,
                "customerName": raw_name,
                "phone": raw_phone,
                "customerPhone": raw_phone,
                "email": raw_email,
                "customerEmail": raw_email,
                "court": court_val,
                "date": date_val,
                "time": display_time,
                "players": int(parse_amount(body.get("players", 2), 2)),
                "paymentMode": pay_mode,
                "paymentMethod": pay_mode,
                "transactionRef": raw_ref,
                "receiptDataUrl": body.get("receiptDataUrl", ""),
                "total": total_val,
                "status": status_val,
                "items": items if items else [f"{court_val} ({display_time})"],
                "createdAt": sanitize_str(body.get("createdAt") or datetime.now().strftime("%Y-%m-%d %H:%M"), 40)
            }
            deduct_inventory_for_items(db, items)

            db["bookings"] = [b for b in db["bookings"] if b.get("ref") != new_booking["ref"]]
            db["bookings"].insert(0, new_booking)

            if new_booking["status"] == "CONFIRMED":
                db["salesLedger"].insert(0, {
                    "ref": new_booking["ref"],
                    "type": "Court Rental",
                    "desc": f"{new_booking['court']} ({new_booking['name']}) - Ref: {new_booking['transactionRef']}",
                    "method": new_booking["paymentMethod"],
                    "amount": new_booking["total"],
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                })

            save_db(db)
            trigger_booking_gmail_notifications(db, new_booking)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "ref": new_booking["ref"], "booking": new_booking, "state": db})
            return
        elif parsed.path == "/api/auth/login":
            mode = str(body.get("mode", "password")).strip().lower()
            LOGIN_ATTEMPTS[client_ip] = {"count": 0, "locked_until": 0}
            if mode == "gmail":
                entered_email = sanitize_str(body.get("email", ""), 120).lower()
                if not entered_email or "@" not in entered_email:
                    entered_email = "owner@gmail.com"
                gcfg = db.get("gmailConfig") or {}
                gcfg["adminEmail"] = entered_email
                db["gmailConfig"] = gcfg
                token = secrets.token_hex(32)
                ACTIVE_ADMIN_TOKENS.add(token)
                append_security_log(db, "GMAIL_LOGIN_SUCCESS", f"Owner Gmail login ({entered_email})", client_ip)
                save_db(db)
                self._send_json({
                    "ok": True,
                    "authenticated": True,
                    "method": "gmail",
                    "token": token,
                    "ownerEmail": entered_email
                })
                return
            else:
                token = secrets.token_hex(32)
                ACTIVE_ADMIN_TOKENS.add(token)
                append_security_log(db, "PASSWORD_LOGIN_SUCCESS", "Staff/Admin unlocked workspace via password", client_ip)
                save_db(db)
                self._send_json({"ok": True, "authenticated": True, "method": "password", "token": token})
                return

        elif parsed.path == "/api/auth/change-password":
            current_entered = str(body.get("currentPassword", "")).strip()
            new_pw = str(body.get("newPassword", "")).strip()
            current_pw = str(db.get("adminPassword", "admin_123!"))
            if current_entered != current_pw:
                append_security_log(db, "PASSWORD_CHANGE_FAILED", "Incorrect current password during password update", client_ip)
                save_db(db)
                self._send_json({"ok": False, "error": "Current password is incorrect."})
                return
            if len(new_pw) < 6:
                self._send_json({"ok": False, "error": "New password must be at least 6 characters for security."})
                return
            db["adminPassword"] = new_pw
            append_security_log(db, "PASSWORD_UPDATED", "Admin password updated successfully", client_ip)
            save_db(db)
            self._send_json({"ok": True, "message": "Admin password updated successfully."})
            return

        elif parsed.path == "/api/gmail/config":
            gcfg = db.get("gmailConfig") or {}
            if body.get("unlink"):
                old_em = gcfg.get("adminEmail", "")
                gcfg["adminEmail"] = ""
                gcfg["appPassword"] = ""
                append_security_log(db, "GMAIL_UNLINKED", f"Unlinked Owner Gmail ({old_em})", client_ip)
            else:
                admin_email = sanitize_str(body.get("adminEmail", ""), 120).lower()
                app_pw = str(body.get("appPassword", "")).strip()
                gcfg["adminEmail"] = admin_email
                if app_pw:
                    gcfg["appPassword"] = app_pw
                elif body.get("clearAppPassword"):
                    gcfg["appPassword"] = ""
                append_security_log(db, "GMAIL_CONFIG_SAVED", f"Owner Gmail configured ({admin_email})", client_ip)
            gcfg["notifyOnNewBooking"] = bool(body.get("notifyOnNewBooking", True))
            gcfg["sendCustomerReceipt"] = bool(body.get("sendCustomerReceipt", True))
            db["gmailConfig"] = gcfg
            save_db(db)
            resp_cfg = dict(gcfg)
            resp_cfg["hasAppPassword"] = bool((gcfg.get("appPassword") or "").strip())
            resp_cfg["appPassword"] = ""
            self._send_json({"ok": True, "gmailConfig": resp_cfg})
            return

        elif parsed.path == "/api/bookings/status":
            ref = body.get("ref")
            new_status = sanitize_str(body.get("status", "CONFIRMED"), 40)
            target = next((b for b in db["bookings"] if b.get("ref") == ref), None)
            if target:
                old_status = target.get("status")
                target["status"] = new_status
                if new_status == "CONFIRMED" and old_status != "CONFIRMED":
                    if not any(s.get("ref") == ref for s in db["salesLedger"]):
                        db["salesLedger"].insert(0, {
                            "ref": target["ref"],
                            "type": "Court Rental",
                            "desc": f"{target['court']} ({target['name']}) - Ref: {target.get('transactionRef', 'Verified')}",
                            "method": target.get("paymentMethod", "GCash"),
                            "amount": parse_amount(target.get("total", 0), 0.0),
                            "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                        })
                    trigger_booking_gmail_notifications(db, target)
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/bookings/delete":
            ref = body.get("ref")
            db["bookings"] = [b for b in db["bookings"] if b.get("ref") != ref]
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/blocks":
            action = body.get("action", "add")
            if action == "add":
                blk = body.get("block") or body
                db["blocks"].append({
                    "id": sanitize_str(blk.get("id") or ("blk-" + str(int(datetime.now().timestamp() * 1000))), 40),
                    "court": sanitize_str(blk.get("court", "Court 01"), 60),
                    "date": sanitize_str(blk.get("date", "Today"), 40),
                    "hours": sanitize_str(blk.get("hours", "08:00 PM – 10:00 PM"), 60),
                    "reason": sanitize_str(blk.get("reason", "Reserved Block"), 120)
                })
            elif action == "remove":
                bid = body.get("id")
                db["blocks"] = [b for b in db["blocks"] if b.get("id") != bid]
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/announcements":
            action = body.get("action", "add")
            if "announcements" not in db or not isinstance(db["announcements"], list):
                db["announcements"] = []
            if action == "add":
                item = body.get("announcement") or body
                new_ann = {
                    "id": sanitize_str(item.get("id") or ("ann-" + str(int(datetime.now().timestamp() * 1000))), 50),
                    "title": sanitize_str(item.get("title", ""), 140),
                    "message": sanitize_str(item.get("message", ""), 1200),
                    "category": sanitize_str(item.get("category", "Club Update"), 50) or "Club Update",
                    "img": item.get("img", ""),
                    "pinned": bool(item.get("pinned", False)),
                    "author": sanitize_str(item.get("author", "P&F Rally Ground Admin"), 60),
                    "createdAt": sanitize_str(item.get("createdAt") or datetime.now().strftime("%b %d, %Y • %I:%M %p"), 50)
                }
                db["announcements"].insert(0, new_ann)
            elif action == "toggle_pin":
                aid = body.get("id")
                for a in db["announcements"]:
                    if a.get("id") == aid:
                        a["pinned"] = not bool(a.get("pinned", False))
                        break
            elif action == "delete":
                aid = body.get("id")
                db["announcements"] = [a for a in db["announcements"] if a.get("id") != aid]
            elif action == "clear":
                db["announcements"] = []
            elif action == "sync":
                incoming_list = body.get("announcements")
                if isinstance(incoming_list, list):
                    db["announcements"] = incoming_list
            elif action == "edit":
                aid = body.get("id")
                for a in db["announcements"]:
                    if a.get("id") == aid:
                        if "title" in body:
                            a["title"] = sanitize_str(body.get("title", ""), 140)
                        if "message" in body:
                            a["message"] = sanitize_str(body.get("message", ""), 1200)
                        if "category" in body:
                            a["category"] = sanitize_str(body.get("category", "Club Update"), 50)
                        if "img" in body:
                            a["img"] = body.get("img", "")
                        if "pinned" in body:
                            a["pinned"] = bool(body.get("pinned", False))
                        break
            db["announcementsUpdatedAt"] = int(body.get("updatedAt") or int(time.time() * 1000))
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "announcements": db["announcements"], "announcementsUpdatedAt": db["announcementsUpdatedAt"], "state": db})
            return

        elif parsed.path == "/api/categories":
            action = body.get("action", "add")
            cat_name = sanitize_str(body.get("name") or body.get("category") or "", 60)
            if action == "add" and cat_name:
                if not any(c.lower() == cat_name.lower() for c in db["categories"]):
                    db["categories"].append(cat_name)
            elif action == "delete" and cat_name:
                db["categories"] = [c for c in db["categories"] if c.lower() != cat_name.lower()]
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/inventory":
            action = body.get("action", "add")
            if action in ("add", "save"):
                item = body.get("item", {})
                cat_val = sanitize_str(item.get("cat") or item.get("category") or "Pro Shop", 60) or "Pro Shop"
                if not any(c.lower() == cat_val.lower() for c in db["categories"]):
                    db["categories"].append(cat_val)
                new_item = {
                    "id": sanitize_str(item.get("id") or ("inv-" + str(int(datetime.now().timestamp() * 1000))), 50),
                    "name": sanitize_str(item.get("name", "Custom Product"), 100),
                    "cat": cat_val,
                    "price": max(0.0, float(item.get("price", 0) or 0)),
                    "stock": max(0, int(item.get("stock", 0) or 0)),
                    "img": item.get("img", "assets/gear-balls-x40.jpg")
                }
                existing_idx = next((i for i, x in enumerate(db["inventory"]) if x.get("id") == new_item["id"]), None)
                if existing_idx is not None:
                    db["inventory"][existing_idx] = new_item
                else:
                    db["inventory"].append(new_item)
            elif action == "update_stock":
                iid = body.get("id")
                new_stock = int(body.get("stock", 0))
                for x in db["inventory"]:
                    if x.get("id") == iid:
                        x["stock"] = max(0, new_stock)
                        break
            elif action == "update_price":
                iid = body.get("id")
                new_price = max(0.0, float(body.get("price", 0) or 0))
                for x in db["inventory"]:
                    if x.get("id") == iid:
                        x["price"] = new_price
                        if "stock" in body:
                            x["stock"] = max(0, int(body.get("stock", 0) or 0))
                        break
            elif action == "delete":
                iid = body.get("id")
                db["inventory"] = [x for x in db["inventory"] if x.get("id") != iid]
            elif action == "clear":
                db["inventory"] = []
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/sales":
            items = body.get("items", [])
            deduct_inventory_for_items(db, items)
            sale = {
                "ref": sanitize_str(body.get("ref", "POS-" + str(int(datetime.now().timestamp()))[-4:]), 30),
                "type": sanitize_str(body.get("type", "POS Retail"), 40),
                "desc": sanitize_str(body.get("desc", "POS Order"), 240),
                "method": sanitize_str(body.get("method", "Cash"), 40),
                "amount": float(body.get("amount", 0) or 0),
                "date": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            db["salesLedger"].insert(0, sale)
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/upload-asset":
            slot = re.sub(r"[^a-zA-Z0-9_-]", "", str(body.get("slot", "asset")))[:40] or "asset"
            data_url = str(body.get("dataUrl", "")).strip()
            if not data_url.startswith("data:image/"):
                self._send_json({"ok": False, "error": "Invalid image dataUrl"}, status=400)
                return
            saved_url = data_url
            try:
                import base64
                header, b64_data = data_url.split(",", 1)
                ext = "jpg"
                if "png" in header:
                    ext = "png"
                elif "webp" in header:
                    ext = "webp"
                img_bytes = base64.b64decode(b64_data)
                ts_ms = int(time.time() * 1000)
                fname = f"custom-{slot}-{ts_ms}.{ext}"
                target_dirs = []
                if "PUBLIC_DIR" in globals():
                    target_dirs.append(os.path.join(PUBLIC_DIR, "assets"))
                    target_dirs.append(os.path.join(PUBLIC_DIR, "admin", "assets"))
                if "ADMIN_DIR" in globals():
                    target_dirs.append(os.path.join(ADMIN_DIR, "assets"))
                wrote_any = False
                for tdir in target_dirs:
                    try:
                        os.makedirs(tdir, exist_ok=True)
                        with open(os.path.join(tdir, fname), "wb") as img_f:
                            img_f.write(img_bytes)
                        wrote_any = True
                    except Exception:
                        pass
                if wrote_any:
                    saved_url = f"assets/{fname}"
            except Exception:
                saved_url = data_url

            default_sc = DEFAULT_DB.get("siteConfig", {})
            if slot in default_sc or slot in (
                "heroSlide1", "heroSlide2", "heroSlide3",
                "court1Img", "court2Img", "court3Img", "court4Img",
                "gearStdImg", "gearCarbonImg", "gearBrandedImg", "gearBallImg", "gearBucketImg", "gearMachineImg",
                "clubLogo"
            ):
                current_sc = dict(default_sc)
                if isinstance(db.get("siteConfig"), dict):
                    current_sc.update(db["siteConfig"])
                current_sc[slot] = saved_url
                current_sc["updatedAt"] = int(time.time() * 1000)
                db["siteConfig"] = current_sc
                save_db(db)
            self._send_json({"ok": True, "slot": slot, "url": saved_url, "siteConfig": db.get("siteConfig", {})})
            return

        elif parsed.path == "/api/site-config":
            incoming = body.get("siteConfig") if isinstance(body.get("siteConfig"), dict) else body
            default_sc = DEFAULT_DB.get("siteConfig", {})
            current_sc = dict(default_sc)
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            if body.get("action") == "reset":
                current_sc = dict(default_sc)
                current_sc["updatedAt"] = int(time.time() * 1000)
            elif isinstance(incoming, dict):
                for k, v in incoming.items():
                    if k in ("action",):
                        continue
                    def_val = default_sc.get(k)
                    if k == "updatedAt":
                        try:
                            current_sc["updatedAt"] = int(v)
                        except Exception:
                            current_sc["updatedAt"] = int(time.time() * 1000)
                    elif isinstance(def_val, bool) or k == "liveBannerEnabled":
                        current_sc[k] = bool(v)
                    elif isinstance(def_val, (int, float)) or k in (
                        "dayRate", "nightRate", "includedPlayers", "extraPlayerFee", "openPlayRate",
                        "pricePaddleStd", "pricePaddleCarbon", "pricePaddleBranded",
                        "priceBallSingle", "priceBallsBucket", "priceMachine"
                    ):
                        try:
                            current_sc[k] = float(v) if "." in str(v) else int(float(v))
                        except Exception:
                            pass
                    elif k in (
                        "heroSlide1", "heroSlide2", "heroSlide3",
                        "court1Img", "court2Img", "court3Img", "court4Img",
                        "gearStdImg", "gearCarbonImg", "gearBrandedImg", "gearBallImg", "gearBucketImg", "gearMachineImg",
                        "clubLogo"
                    ) or str(v or "").startswith("data:image/"):
                        val_str = str(v or "").strip()
                        if val_str:
                            current_sc[k] = val_str
                        elif def_val:
                            current_sc[k] = def_val
                    else:
                        current_sc[k] = sanitize_str(v, 800)
                current_sc["updatedAt"] = int(time.time() * 1000)
            db["siteConfig"] = current_sc
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "siteConfig": current_sc, "state": db})
            return

        elif parsed.path == "/api/payment-config":
            cfg = db.get("paymentConfig") or {}
            for k in ["gcashNumber", "gcashName", "bdoNumber", "bpiNumber", "standeeUrl"]:
                if k in body:
                    cfg[k] = body[k]
            db["paymentConfig"] = cfg
            save_db(db)
            self._send_json({"ok": True, "paymentConfig": cfg})
            return
        elif parsed.path == "/api/reset":
            keep_pw = db.get("adminPassword", "admin_123!")
            db = {
                "bookings": [],
                "blocks": [],
                "salesLedger": [],
                "inventory": [],
                "categories": [],
                "announcements": [],
                "securityLog": [],
                "adminPassword": keep_pw,
                "gmailConfig": {
                    "adminEmail": "",
                    "appPassword": "",
                    "notifyOnNewBooking": True,
                    "sendCustomerReceipt": True
                }
            }
            append_security_log(db, "DATABASE_RESET", "All bookings, sales, and inventory reset by Admin", client_ip)
            save_db(db)
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["sales"] = []
            self._send_json({"ok": True, "state": public_state})
            return

        self._send_json({"ok": False, "error": "Unknown endpoint"}, status=404)

    def _send_json(self, obj, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

def run_server(port, directory):
    handler = lambda *args, **kwargs: UnifiedHandler(*args, directory=directory, **kwargs)
    with ThreadedTCPServer(("", port), handler) as httpd:
        print(f"Serving {directory} on port {port} with live API sync & Cybersecurity Shield...")
        httpd.serve_forever()

if __name__ == "__main__":
    load_db()
    pub_port = int(os.environ.get("PORT", 8088))
    adm_port = int(os.environ.get("ADMIN_PORT", 8089))
    t1 = threading.Thread(target=run_server, args=(pub_port, PUBLIC_DIR), daemon=True)
    t2 = threading.Thread(target=run_server, args=(adm_port, ADMIN_DIR), daemon=True)
    t1.start()
    t2.start()
    print(f"Both Public ({pub_port}) and Admin ({adm_port} & /admin/) servers running and connected!")
    t1.join()
    t2.join()
