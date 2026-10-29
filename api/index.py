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
        "gcashName": "KA******E L.",
        "bdoNumber": "••••••••8678 (Dex)",
        "bpiNumber": "09998832346 (KATHERINE LIM)",
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
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


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
            cfg = db.get("paymentConfig") or DEFAULT_DB["paymentConfig"]
            self._send_json(cfg)
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
            token = secrets.token_hex(32)
            if mode == "gmail":
                entered_email = sanitize_str(body.get("email", ""), 120).lower() or "owner@gmail.com"
                gcfg = db.get("gmailConfig") or {}
                gcfg["adminEmail"] = entered_email
                db["gmailConfig"] = gcfg
                save_db(db)
                self._send_json({"ok": True, "authenticated": True, "method": "gmail", "token": token, "ownerEmail": entered_email})
                return
            else:
                self._send_json({"ok": True, "authenticated": True, "method": "password", "token": token})
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
            keep_pw = db.get("adminPassword", "admin_123!")
            db = json.loads(json.dumps(DEFAULT_DB))
            db["adminPassword"] = keep_pw
            save_db(db)
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["sales"] = []
            self._send_json({"ok": True, "state": public_state})
            return

        self._send_json({"ok": True})
