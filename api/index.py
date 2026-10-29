import hashlib
# -*- coding: utf-8 -*-
import http.server
import json
import os
import urllib.parse
import re
import secrets
import time
from datetime import datetime

DB_FILE = "/tmp/pf_shared_db.json"

LOGIN_ATTEMPTS = {}
ACTIVE_ADMIN_TOKENS = set()
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 60

DEFAULT_DB = {
    "bookings": [],
    "blocks": [],
    "salesLedger": [],
    "expenses": [],
    "inventory": [],
    "categories": [],
    "announcements": [],
    "securityLog": [],
    "adminPassword": "",
    "gmailConfig": {
        "adminEmail": "",
        "appPassword": "",
        "notifyOnNewBooking": True,
        "sendCustomerReceipt": True
    },
    "paymentConfig": {
        "gcashName": "KA******E L.",
        "gcashNumber": "0999 883 2346",
        "gcashQrUrl": "assets/qr-gcash.png?v=20261029v10",
        "standeeUrl": "assets/qr-gcash.png?v=20261029v10",
        "mayaName": "KATHERINE LIM",
        "mayaNumber": "0999 883 2346",
        "mayaQrUrl": "assets/qr-maya.png?v=20261029v10",
        "bdoName": "BDO Unibank • Dex",
        "bdoNumber": "••••••••8678",
        "bankQrUrl": "assets/qr-bdo.png?v=20261029v10",
        "bpiNumber": "0999 883 2346",
        "updatedAt": 0
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
        "costCourtPerHour": 0,
        "costPaddleStd": 0,
        "costPaddleCarbon": 0,
        "costPaddleBranded": 0,
        "costBallSingle": 30,
        "costBallsBucket": 0,
        "costMachine": 0,
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
    s = re.sub(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"[<>]", "", s)
    return s


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
    if not os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_DB, f, indent=2)
        except Exception:
            pass
        return json.loads(json.dumps(DEFAULT_DB))
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "adminPassword" not in data or not data["adminPassword"]:
                data["adminPassword"] = ""
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
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


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


def compute_and_deduct_inventory_for_items(db, items, deduct_stock=True):
    total_cogs = 0.0
    if not items or not isinstance(items, list):
        return 0.0
    inventory = db.get("inventory", [])
    sc = db.get("siteConfig") or {}
    for cart_item in items:
        if isinstance(cart_item, str):
            s_low = cart_item.lower()
            for inv in inventory:
                inv_name = str(inv.get("name", "")).strip().lower()
                if inv_name and inv_name in s_low:
                    unit_cost = float(inv.get("costPrice", 0) or 0)
                    if unit_cost <= 0 and float(inv.get("pcsPerBox", 0) or 0) > 0:
                        unit_cost = round(float(inv.get("costPerBox", 0) or 0) / float(inv.get("pcsPerBox", 1)), 2)
                    total_cogs += unit_cost
                    break
            continue
        if not isinstance(cart_item, dict):
            continue
        if cart_item.get("isCourt"):
            hrs = max(1, int(cart_item.get("qty", 1) or 1))
            total_cogs += float(sc.get("costCourtPerHour", 0) or 0) * hrs
            continue
        cid = str(cart_item.get("id", "")).strip()
        cname = str(cart_item.get("name", "")).strip().lower()
        qty = max(1, int(cart_item.get("qty", 1) or 1))
        for inv in inventory:
            inv_id = str(inv.get("id", "")).strip()
            inv_name = str(inv.get("name", "")).strip().lower()
            if (cid and cid == inv_id) or (cname and cname == inv_name) or (cname and inv_name and (inv_name in cname or cname in inv_name)):
                if deduct_stock:
                    current_stock = int(inv.get("stock", 0) or 0)
                    inv["stock"] = max(0, current_stock - qty)
                    inv["soldCount"] = int(inv.get("soldCount", 0) or 0) + qty
                unit_cost = float(inv.get("costPrice", 0) or 0)
                if unit_cost <= 0 and float(inv.get("pcsPerBox", 0) or 0) > 0:
                    unit_cost = round(float(inv.get("costPerBox", 0) or 0) / float(inv.get("pcsPerBox", 1)), 2)
                total_cogs += unit_cost * qty
                break
    return round(total_cogs, 2)


def deduct_inventory_for_items(db, items):
    return compute_and_deduct_inventory_for_items(db, items, deduct_stock=True)


def trigger_booking_gmail_notifications(db, booking):
    return


class handler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, obj, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def do_OPTIONS(self):
        self._send_json({"ok": True})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        db = load_db()
        if parsed.path == "/api/state":
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["sales"] = db.get("salesLedger", [])
            public_state["passwordProtected"] = True
            gcfg = dict(db.get("gmailConfig") or {})
            gcfg["hasAppPassword"] = bool((gcfg.get("appPassword") or "").strip())
            gcfg["appPassword"] = ""
            public_state["gmailConfig"] = gcfg
            self._send_json(public_state)
            return
        elif parsed.path == "/api/announcements":
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
            def_pc = dict(DEFAULT_DB.get("paymentConfig") or {})
            cfg = dict(def_pc)
            if isinstance(db.get("paymentConfig"), dict):
                cfg.update(db["paymentConfig"])
            self._send_json({"ok": True, "paymentConfig": cfg})
            return
        elif parsed.path.startswith("/api/booking/"):
            ref = parsed.path.split("/api/booking/")[1].strip().upper()
            found = next((b for b in db["bookings"] if b.get("ref", "").upper() == ref), None)
            payload = {"found": bool(found), "booking": found}
            if found:
                payload.update(found)
            self._send_json(payload)
            return
        self._send_json({"ok": True, "status": "P&F Rally Ground Live API"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

        client_ip = self.headers.get("x-forwarded-for", "127.0.0.1").split(",")[0].strip()
        db = load_db()

        if parsed.path == "/api/announcements":
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
                db["announcements"] = [a for a in db["announcements"] if a.get("id") != new_ann["id"]]
                db["announcements"].insert(0, new_ann)
            elif action == "sync":
                incoming = body.get("announcements")
                if isinstance(incoming, list):
                    db["announcements"] = incoming
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

        elif parsed.path in ("/api/bookings", "/api/booking"):
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
            # Deduplicate identical rapid double-click booking submissions
            dup_existing = next((
                b for b in db["bookings"]
                if b.get("ref") == new_booking["ref"] or (
                    b.get("court") == new_booking["court"]
                    and b.get("time") == new_booking["time"]
                    and b.get("transactionRef") == new_booking["transactionRef"]
                    and new_booking["transactionRef"] not in ("", "N/A")
                )
            ), None)
            if dup_existing and dup_existing.get("ref") != new_booking["ref"]:
                db["sales"] = db.get("salesLedger", [])
                self._send_json({"ok": True, "ref": dup_existing["ref"], "booking": dup_existing, "deduplicated": True, "state": db})
                return

            existing_bk = next((b for b in db["bookings"] if b.get("ref") == new_booking["ref"]), None)
            if not existing_bk:
                deduct_inventory_for_items(db, items)
            else:
                # Preserve existing status & receipt on customer reschedule
                if existing_bk.get("status") == "CONFIRMED":
                    new_booking["status"] = "CONFIRMED"
                if existing_bk.get("receiptDataUrl") and not new_booking.get("receiptDataUrl"):
                    new_booking["receiptDataUrl"] = existing_bk["receiptDataUrl"]
                new_booking["rescheduledAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")

            db["bookings"] = [b for b in db["bookings"] if b.get("ref") != new_booking["ref"]]
            db["bookings"].insert(0, new_booking)

            if new_booking["status"] == "CONFIRMED" and not any(s.get("ref") == new_booking["ref"] for s in db.get("salesLedger", [])):
                bk_cost = compute_and_deduct_inventory_for_items(db, items, deduct_stock=False)
                if bk_cost <= 0:
                    bk_cost = float((db.get("siteConfig") or {}).get("costCourtPerHour", 0) or 0)
                db["salesLedger"].insert(0, {
                    "ref": new_booking["ref"],
                    "type": "Court Rental",
                    "desc": f"{new_booking['court']} ({new_booking['name']}) - Ref: {new_booking['transactionRef']}",
                    "method": new_booking["paymentMethod"],
                    "amount": new_booking["total"],
                    "cost": round(bk_cost, 2),
                    "profit": round(float(new_booking["total"]) - bk_cost, 2),
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                })

            save_db(db)
            trigger_booking_gmail_notifications(db, new_booking)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "ref": new_booking["ref"], "booking": new_booking, "state": db})
            return
        elif parsed.path == "/api/auth/login":
            mode = str(body.get("mode", "password")).strip().lower()
            entered_pw = str(body.get("password", "")).strip()
            official_key_hashes = {
                "ca1023ba604e3f989f59b853ff3de14470f8ac5d8911d59cf1d33027a8ffb05b": "Club Owner (Key #1)",
                "b79c480a8e32c4a3259688150ea360d2d8a7062544cf9403fc16caa5ffedf959": "General Manager (Key #2)",
                "777298d14860a3730c4faca49cbb2e0a421d033c3ebef3fc83ce56a26406c8ee": "Front Desk Staff (Key #3)",
                "b1f1adb6f95964cd7cf5616cd52c95d4b6cea2824205071e95fecc3d30567e69": "POS Cashier (Key #4)",
                "88a30711924a8fd5c7eecf1f0e3ca2a7ec5436a4ad887b64baea0db8331c8b44": "Emergency Backup (Key #5)"
            }
            entered_hash = hashlib.sha256(("PF_RALLY_GROUND_v2_SALT_2026::" + entered_pw).encode("utf-8")).hexdigest()
            custom_pw = str(db.get("adminPassword", "")).strip()
            matched_role = official_key_hashes.get(entered_hash)
            if not matched_role and custom_pw and custom_pw != "" and entered_pw == custom_pw:
                matched_role = "Custom Owner Key"
            if not matched_role:
                self._send_json({"ok": False, "authenticated": False, "error": "Invalid Staff/Owner Access Key"}, status=401)
                return
            token = secrets.token_hex(32)
            if mode == "gmail":
                entered_email = sanitize_str(body.get("email", ""), 120).lower() or "owner@gmail.com"
                gcfg = db.get("gmailConfig") or {}
                gcfg["adminEmail"] = entered_email
                db["gmailConfig"] = gcfg
                save_db(db)
                self._send_json({"ok": True, "authenticated": True, "method": "gmail", "role": matched_role, "token": token, "ownerEmail": entered_email})
                return
            else:
                self._send_json({"ok": True, "authenticated": True, "method": "password", "role": matched_role, "token": token})
                return

        elif parsed.path == "/api/bookings/status":
            ref = body.get("ref")
            new_status = sanitize_str(body.get("status", "CONFIRMED"), 40)
            target = next((b for b in db["bookings"] if b.get("ref") == ref), None)
            if target:
                target["status"] = new_status
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
            if "blocks" not in db or not isinstance(db["blocks"], list):
                db["blocks"] = []

            if action in ("add", "set", "set_slot"):
                blk = body.get("block") or body
                court_val = sanitize_str(blk.get("court", "Court 01"), 60) or "Court 01"
                date_val = sanitize_str(blk.get("date", "Today"), 40) or "Today"
                hours_val = sanitize_str(blk.get("hours", "06:00 PM"), 60) or "06:00 PM"
                status_type = sanitize_str(blk.get("statusType", "CLOSED"), 30).upper() or "CLOSED"
                reason_val = sanitize_str(blk.get("reason", ""), 120)
                if not reason_val:
                    if status_type in ("OPEN", "AVAILABLE"):
                        reason_val = "Open Court"
                    elif status_type == "OPEN_PLAY":
                        reason_val = "Open Play"
                    else:
                        reason_val = "Closed"

                # Remove any existing override for the exact same (court, date, hours)
                db["blocks"] = [
                    b for b in db["blocks"]
                    if not (
                        str(b.get("court", "")).strip().lower() == court_val.lower()
                        and str(b.get("date", "")).strip().lower() == date_val.lower()
                        and str(b.get("hours", "")).strip().lower() == hours_val.lower()
                    )
                ]
                # If setting a specific court or specific hour on a date, and there was an ALL override on that date, keep specific after ALL so specific wins
                db["blocks"].append({
                    "id": sanitize_str(blk.get("id") or ("blk-" + str(int(datetime.now().timestamp() * 1000))), 40),
                    "court": court_val,
                    "date": date_val,
                    "hours": hours_val,
                    "statusType": status_type,
                    "reason": reason_val
                })
            elif action == "bulk_set":
                date_val = sanitize_str(body.get("date", "Today"), 40) or "Today"
                court_val = sanitize_str(body.get("court", "ALL"), 60) or "ALL"
                status_type = sanitize_str(body.get("statusType", "OPEN"), 30).upper() or "OPEN"
                reason_val = sanitize_str(body.get("reason", ""), 120)
                if not reason_val:
                    reason_val = "Open Court" if status_type in ("OPEN", "AVAILABLE") else ("Open Play" if status_type == "OPEN_PLAY" else "Closed")
                # Clear existing overrides on that date (for that court or all courts)
                if court_val.upper() == "ALL" or "all" in court_val.lower():
                    db["blocks"] = [b for b in db["blocks"] if str(b.get("date", "")).strip() != date_val]
                    db["blocks"].append({
                        "id": "blk-" + str(int(datetime.now().timestamp() * 1000)),
                        "court": "ALL",
                        "date": date_val,
                        "hours": "ALL",
                        "statusType": status_type,
                        "reason": reason_val
                    })
                else:
                    db["blocks"] = [
                        b for b in db["blocks"]
                        if not (str(b.get("date", "")).strip() == date_val and str(b.get("court", "")).strip().lower() == court_val.lower())
                    ]
                    db["blocks"].append({
                        "id": "blk-" + str(int(datetime.now().timestamp() * 1000)),
                        "court": court_val,
                        "date": date_val,
                        "hours": "ALL",
                        "statusType": status_type,
                        "reason": reason_val
                    })
            elif action == "reset_slot":
                court_val = sanitize_str(body.get("court", ""), 60).lower()
                date_val = sanitize_str(body.get("date", ""), 40).lower()
                hours_val = sanitize_str(body.get("hours", ""), 60).lower()
                db["blocks"] = [
                    b for b in db["blocks"]
                    if not (
                        str(b.get("court", "")).strip().lower() == court_val
                        and str(b.get("date", "")).strip().lower() == date_val
                        and str(b.get("hours", "")).strip().lower() == hours_val
                    )
                ]
            elif action == "clear_date":
                date_val = sanitize_str(body.get("date", ""), 40)
                if not date_val or date_val.upper() == "ALL":
                    db["blocks"] = []
                else:
                    db["blocks"] = [b for b in db["blocks"] if str(b.get("date", "")).strip() != date_val]
            elif action == "remove":
                bid = body.get("id")
                db["blocks"] = [b for b in db["blocks"] if b.get("id") != bid]
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
                buy_mode = sanitize_str(item.get("buyMode", "unit"), 20).lower()
                if buy_mode not in ("wholesale", "unit"):
                    buy_mode = "unit"
                wh_unit = sanitize_str(item.get("wholesaleUnit", "Box / Case"), 40) or "Box / Case"
                wh_boxes = max(0.0, float(item.get("wholesaleBoxes", 1) or 1))
                pcs_per_box = max(1, int(float(item.get("pcsPerBox", 1) or 1)))
                cost_per_box = max(0.0, float(item.get("costPerBox", 0) or 0))
                raw_cost_price = max(0.0, float(item.get("costPrice", 0) or 0))
                if buy_mode == "wholesale" and cost_per_box > 0 and pcs_per_box > 0:
                    cost_price = round(cost_per_box / pcs_per_box, 2)
                else:
                    cost_price = round(raw_cost_price, 2)
                stock_val = max(0, int(float(item.get("stock", 0) or 0)))
                price_val = max(0.0, float(item.get("price", 0) or 0))
                total_cap = round(wh_boxes * cost_per_box, 2) if (buy_mode == "wholesale" and cost_per_box > 0) else round(stock_val * cost_price, 2)

                existing_idx = next((i for i, x in enumerate(db["inventory"]) if x.get("id") == item.get("id")), None)
                prev_sold = int(db["inventory"][existing_idx].get("soldCount", 0) or 0) if existing_idx is not None else int(item.get("soldCount", 0) or 0)

                new_item = {
                    "id": sanitize_str(item.get("id") or ("inv-" + str(int(datetime.now().timestamp() * 1000))), 50),
                    "name": sanitize_str(item.get("name", "Custom Product"), 100),
                    "cat": cat_val,
                    "buyMode": buy_mode,
                    "wholesaleUnit": wh_unit,
                    "wholesaleBoxes": wh_boxes,
                    "pcsPerBox": pcs_per_box,
                    "costPerBox": cost_per_box,
                    "costPrice": cost_price,
                    "totalCapitalInvested": total_cap,
                    "price": price_val,
                    "stock": stock_val,
                    "soldCount": prev_sold,
                    "img": item.get("img", "assets/gear-balls-x40.jpg")
                }
                if existing_idx is not None:
                    db["inventory"][existing_idx] = new_item
                else:
                    db["inventory"].append(new_item)
            elif action == "restock_wholesale":
                iid = body.get("id")
                boxes_added = max(0.0, float(body.get("boxesAdded", 1) or 1))
                pcs_per_box = max(1, int(float(body.get("pcsPerBox", 24) or 24)))
                cost_per_box = max(0.0, float(body.get("costPerBox", 0) or 0))
                log_expense = bool(body.get("logExpense", False))
                for x in db["inventory"]:
                    if x.get("id") == iid:
                        added_pcs = int(round(boxes_added * pcs_per_box))
                        x["buyMode"] = "wholesale"
                        x["pcsPerBox"] = pcs_per_box
                        if cost_per_box > 0:
                            x["costPerBox"] = cost_per_box
                            x["costPrice"] = round(cost_per_box / pcs_per_box, 2)
                        x["wholesaleBoxes"] = float(x.get("wholesaleBoxes", 0) or 0) + boxes_added
                        x["stock"] = max(0, int(x.get("stock", 0) or 0) + added_pcs)
                        x["totalCapitalInvested"] = round(float(x.get("totalCapitalInvested", 0) or 0) + (boxes_added * cost_per_box), 2)
                        if "price" in body and float(body.get("price", 0) or 0) > 0:
                            x["price"] = float(body.get("price"))
                        if log_expense and (boxes_added * cost_per_box) > 0:
                            if "expenses" not in db or not isinstance(db["expenses"], list):
                                db["expenses"] = []
                            db["expenses"].insert(0, {
                                "id": "exp-" + str(int(datetime.now().timestamp() * 1000)),
                                "category": "Wholesale Restock / Capital",
                                "title": f"Restocked {boxes_added:g}x {x.get('wholesaleUnit', 'Box')} of {x.get('name')} (+{added_pcs} pcs)",
                                "amount": round(boxes_added * cost_per_box, 2),
                                "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                            })
                        break
            elif action == "update_stock":
                iid = body.get("id")
                new_stock = int(body.get("stock", 0))
                for x in db["inventory"]:
                    if x.get("id") == iid:
                        x["stock"] = max(0, new_stock)
                        break
            elif action in ("update_price", "update_cost"):
                iid = body.get("id")
                for x in db["inventory"]:
                    if x.get("id") == iid:
                        if "price" in body and body.get("price") is not None:
                            x["price"] = max(0.0, float(body.get("price", 0) or 0))
                        if "costPrice" in body and body.get("costPrice") is not None:
                            x["costPrice"] = max(0.0, round(float(body.get("costPrice", 0) or 0), 2))
                        if "pcsPerBox" in body and body.get("pcsPerBox") is not None:
                            x["pcsPerBox"] = max(1, int(float(body.get("pcsPerBox", 1) or 1)))
                        if "costPerBox" in body and body.get("costPerBox") is not None:
                            x["costPerBox"] = max(0.0, float(body.get("costPerBox", 0) or 0))
                            if x.get("pcsPerBox", 1) > 0 and x["costPerBox"] > 0:
                                x["costPrice"] = round(x["costPerBox"] / x["pcsPerBox"], 2)
                                x["buyMode"] = "wholesale"
                        if "buyMode" in body:
                            x["buyMode"] = sanitize_str(body.get("buyMode", "unit"), 20)
                        if "stock" in body and body.get("stock") is not None:
                            x["stock"] = max(0, int(float(body.get("stock", 0) or 0)))
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

        elif parsed.path == "/api/sales":
            action = body.get("action", "add")
            if action == "update_cost":
                ref = body.get("ref")
                new_cost = max(0.0, round(float(body.get("cost", 0) or 0), 2))
                for s in db["salesLedger"]:
                    if s.get("ref") == ref:
                        s["cost"] = new_cost
                        if "amount" in body and body.get("amount") is not None:
                            s["amount"] = max(0.0, round(float(body.get("amount", 0) or 0), 2))
                        s["profit"] = round(float(s.get("amount", 0) or 0) - new_cost, 2)
                        break
                save_db(db)
                db["sales"] = db.get("salesLedger", [])
                self._send_json({"ok": True, "state": db})
                return
            elif action == "delete":
                ref = body.get("ref")
                db["salesLedger"] = [s for s in db["salesLedger"] if s.get("ref") != ref]
                save_db(db)
                db["sales"] = db.get("salesLedger", [])
                self._send_json({"ok": True, "state": db})
                return

            items = body.get("items", [])
            computed_cogs = compute_and_deduct_inventory_for_items(db, items, deduct_stock=True)
            explicit_cost = body.get("cost")
            final_cost = round(float(explicit_cost), 2) if (explicit_cost is not None and float(explicit_cost or 0) > 0) else computed_cogs
            amt = round(float(body.get("amount", 0) or 0), 2)
            sale = {
                "ref": sanitize_str(body.get("ref", "POS-" + str(int(datetime.now().timestamp()))[-4:]), 30),
                "type": sanitize_str(body.get("type", "POS Retail"), 40),
                "desc": sanitize_str(body.get("desc", "POS Order"), 240),
                "method": sanitize_str(body.get("method", "Cash"), 40),
                "amount": amt,
                "cost": final_cost,
                "profit": round(amt - final_cost, 2),
                "items": items if isinstance(items, list) else [],
                "date": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            db["salesLedger"].insert(0, sale)
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/expenses":
            action = body.get("action", "add")
            if "expenses" not in db or not isinstance(db["expenses"], list):
                db["expenses"] = []
            if action == "add":
                exp = body.get("expense") or body
                new_exp = {
                    "id": sanitize_str(exp.get("id") or ("exp-" + str(int(datetime.now().timestamp() * 1000))), 40),
                    "category": sanitize_str(exp.get("category", "Wholesale Restock / Capital"), 60) or "Wholesale Restock / Capital",
                    "title": sanitize_str(exp.get("title", "Club Expense"), 160) or "Club Expense",
                    "amount": max(0.0, round(float(exp.get("amount", 0) or 0), 2)),
                    "date": sanitize_str(exp.get("date") or datetime.now().strftime("%Y-%m-%d %H:%M"), 40)
                }
                db["expenses"].insert(0, new_exp)
            elif action == "delete":
                eid = body.get("id")
                db["expenses"] = [e for e in db["expenses"] if e.get("id") != eid]
            elif action == "clear":
                db["expenses"] = []
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "expenses": db["expenses"], "state": db})
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
                        "priceBallSingle", "priceBallsBucket", "priceMachine", "costCourtPerHour", "costPaddleStd", "costPaddleCarbon", "costPaddleBranded", "costBallSingle", "costBallsBucket", "costMachine"
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
            def_pc = dict(DEFAULT_DB.get("paymentConfig") or {})
            cfg = dict(def_pc)
            if isinstance(db.get("paymentConfig"), dict):
                cfg.update(db["paymentConfig"])
            if body.get("action") == "reset":
                ch = str(body.get("channel") or "all").lower()
                if ch == "gcash":
                    for k in ["gcashName", "gcashNumber", "gcashQrUrl", "standeeUrl"]:
                        cfg[k] = def_pc.get(k, "")
                elif ch == "maya":
                    for k in ["mayaName", "mayaNumber", "mayaQrUrl"]:
                        cfg[k] = def_pc.get(k, "")
                elif ch in ("bank", "bdo"):
                    for k in ["bdoName", "bdoNumber", "bankQrUrl"]:
                        cfg[k] = def_pc.get(k, "")
                else:
                    cfg = dict(def_pc)
            else:
                for k in [
                    "gcashNumber", "gcashName", "gcashQrUrl", "standeeUrl",
                    "mayaNumber", "mayaName", "mayaQrUrl",
                    "bdoNumber", "bdoName", "bankQrUrl",
                    "bpiNumber"
                ]:
                    if k in body and body[k] is not None:
                        cfg[k] = str(body[k]).strip()
                if "gcashQrUrl" in body and body["gcashQrUrl"]:
                    cfg["standeeUrl"] = str(body["gcashQrUrl"]).strip()
                elif "standeeUrl" in body and body["standeeUrl"]:
                    cfg["gcashQrUrl"] = str(body["standeeUrl"]).strip()
            cfg["updatedAt"] = int(time.time() * 1000)
            db["paymentConfig"] = cfg
            save_db(db)
            self._send_json({"ok": True, "paymentConfig": cfg, "state": db})
            return

        elif parsed.path == "/api/gmail/config":
            gcfg = db.get("gmailConfig") or {}
            if body.get("unlink"):
                gcfg["adminEmail"] = ""
                gcfg["appPassword"] = ""
            else:
                gcfg["adminEmail"] = sanitize_str(body.get("adminEmail", ""), 120).lower()
                if body.get("appPassword"):
                    gcfg["appPassword"] = str(body.get("appPassword", "")).strip()
            db["gmailConfig"] = gcfg
            save_db(db)
            resp_cfg = dict(gcfg)
            resp_cfg["hasAppPassword"] = bool((gcfg.get("appPassword") or "").strip())
            resp_cfg["appPassword"] = ""
            self._send_json({"ok": True, "gmailConfig": resp_cfg})
            return

        elif parsed.path == "/api/reset":
            keep_pw = db.get("adminPassword", "")
            keep_sc = db.get("siteConfig")
            keep_pc = db.get("paymentConfig")
            db = json.loads(json.dumps(DEFAULT_DB))
            db["adminPassword"] = keep_pw
            if isinstance(keep_sc, dict):
                db["siteConfig"] = keep_sc
            if isinstance(keep_pc, dict):
                db["paymentConfig"] = keep_pc
            save_db(db)
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["sales"] = []
            self._send_json({"ok": True, "state": public_state})
            return

        self._send_json({"ok": True})
