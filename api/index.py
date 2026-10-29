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
        "heroSlide1": "assets/hero-slide-1.jpg",
        "heroSlide2": "assets/hero-slide-2.jpg",
        "heroSlide3": "assets/hero-slide-3.jpg",
        "liveBannerEnabled": True,
        "liveBannerText": "LIVE CLUB UPDATE: All 4 Pro Cushion Courts Open Daily 6:00 AM - 12:00 Midnight • Book Online via GCash, Maya, or BDO!",
        "heroTagline": "PHILIPPINES • 4 PRO PICKLEBALL COURTS",
        "heroTitleLine1": "PLAY.",
        "heroTitleLine2": "COMPETE.",
        "heroTitleAccent": "CONNECT.",
        "heroSubtitle": "Your home court in Daraga, Albay for premier rallies, tournament-grade cushion surfaces, pro equipment rentals, and verified online booking.",
        "heroPrimaryBtn": "Book Your Court",
        "heroSecondaryBtn": "View Live Schedule",
        "clubName": "P&F Rally Ground",
        "clubSubtitle": "Pickleball Club • Daraga",
        "clubAddress": "Phase IV, Doña Maria Subdivision, Velasco St., Tagas, Daraga, 4501 Albay",
        "clubHours": "6:00 AM – 12:00 AM",
        "clubPhone": "0999 883 2346",
        "bentoSectionTag": "EXPERIENCE",
        "bentoSectionTitle": "PLAY THE CLUB",
        "bentoSectionDesc": "Everything you need to play, improve, and compete under one roof. World-class surface, vibrant community, and zero booking friction.",
        "scheduleHeading": "COURT TIMELINE",
        "openPlayScheduleText": "Open Play: Mon 3–6 PM • Tue–Thu 3–8 PM • Fri 3–11 PM • Sat 6–10 PM",
        "court1Name": "Championship",
        "court2Name": "Tournament",
        "court3Name": "Covered Outdoor",
        "court4Name": "Pro Training",
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
        "priceMachine": 100
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
        if cart_item.get("isCourt"):
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
            self._send_json({"ok": True, "siteConfig": db.get("siteConfig") or DEFAULT_DB["siteConfig"]})
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
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "announcements": db["announcements"], "state": db})
            return

        elif parsed.path == "/api/bookings":
            raw_name = sanitize_str(body.get("name", ""), 80)
            raw_phone = sanitize_str(body.get("phone", ""), 30)
            raw_ref = sanitize_str(body.get("transactionRef", ""), 40)
            items = body.get("items", [])
            new_booking = {
                "ref": sanitize_str(body.get("ref", "PF-" + str(int(datetime.now().timestamp()))[-5:]), 25),
                "name": raw_name or "Valued Guest",
                "phone": raw_phone or "0999 883 2346",
                "email": sanitize_str(body.get("email", ""), 100),
                "court": sanitize_str(body.get("court", "Court 01"), 250),
                "date": sanitize_str(body.get("date", ""), 30),
                "time": sanitize_str(body.get("time", "Today • 06:00 PM"), 80),
                "paymentMode": sanitize_str(body.get("paymentMode") or body.get("paymentMethod") or "GCash", 50),
                "paymentMethod": sanitize_str(body.get("paymentMethod") or body.get("paymentMode") or "GCash", 50),
                "transactionRef": raw_ref or "N/A",
                "receiptDataUrl": body.get("receiptDataUrl", ""),
                "total": float(str(body.get("total", 400)).replace("₱", "").replace(",", "") or 400),
                "status": sanitize_str(body.get("status", "PENDING"), 40),
                "items": items,
                "createdAt": sanitize_str(body.get("createdAt") or datetime.now().strftime("%Y-%m-%d %H:%M"), 30)
            }
            deduct_inventory_for_items(db, items)
            db["bookings"] = [b for b in db["bookings"] if b.get("ref") != new_booking["ref"]]
            db["bookings"].insert(0, new_booking)
            save_db(db)
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
            if action == "add":
                blk = body.get("block") or body
                db["blocks"].append({
                    "id": sanitize_str(blk.get("id") or ("blk-" + str(int(datetime.now().timestamp() * 1000))), 40),
                    "court": sanitize_str(blk.get("court", "Court 01"), 60),
                    "date": sanitize_str(blk.get("date", "Today"), 40),
                    "hours": sanitize_str(blk.get("hours", "06:00 PM"), 60),
                    "reason": sanitize_str(blk.get("reason", "Reserved Block"), 120)
                })
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

        elif parsed.path == "/api/site-config":
            incoming = body.get("siteConfig") if isinstance(body.get("siteConfig"), dict) else body
            current_sc = dict(DEFAULT_DB["siteConfig"])
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            if body.get("action") == "reset":
                current_sc = dict(DEFAULT_DB["siteConfig"])
            elif isinstance(incoming, dict):
                for k, v in incoming.items():
                    if k in current_sc:
                        if isinstance(DEFAULT_DB["siteConfig"][k], bool):
                            current_sc[k] = bool(v)
                        elif isinstance(DEFAULT_DB["siteConfig"][k], (int, float)):
                            try:
                                current_sc[k] = float(v) if "." in str(v) else int(float(v))
                            except Exception:
                                pass
                        elif k in ("heroSlide1", "heroSlide2", "heroSlide3"):
                            current_sc[k] = str(v or "").strip() or DEFAULT_DB["siteConfig"][k]
                        else:
                            current_sc[k] = sanitize_str(v, 500)
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
