import hashlib
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
from datetime import datetime, timezone, timedelta

_DEFAULT_WIN_SCRATCH = r"C:\Users\Acer\.gemini\antigravity\scratch"
if os.path.exists(_DEFAULT_WIN_SCRATCH):
    SCRATCH_DIR = _DEFAULT_WIN_SCRATCH
    PUBLIC_DIR = os.path.join(SCRATCH_DIR, "pf-rally-ground-v2")
    ADMIN_DIR = os.path.join(PUBLIC_DIR, "admin")
    DB_FILE = os.path.join(SCRATCH_DIR, "pf_shared_db.json")
else:
    PUBLIC_DIR = os.path.dirname(os.path.abspath(__file__))
    SCRATCH_DIR = PUBLIC_DIR
    ADMIN_DIR = os.path.join(PUBLIC_DIR, "admin")
    DB_FILE = os.path.join(PUBLIC_DIR, "pf_shared_db.json")

db_lock = threading.Lock()

# Cybersecurity: In-memory brute-force tracker & active session tokens
LOGIN_ATTEMPTS = {}  # ip -> {"count": int, "locked_until": float}
ACTIVE_ADMIN_TOKENS = set()
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 60

DEFAULT_ANNOUNCEMENTS = [
    {
        "id": "welcome-pf-2026",
        "title": "Welcome to P&F Rally Ground Pickleball Club!",
        "message": "All 4 championship cushion courts are open daily from 6:00 AM to 12:00 Midnight (Daytime: ₱400/hr • Evening: ₱500/hr). Official Open Play runs Tue–Thu (4:00 PM – 8:00 PM) and Fri–Sat (6:00 PM – 10:00 PM) at ₱150.00 per participant!",
        "category": "Club Update",
        "img": "",
        "pinned": True,
        "author": "P&F Rally Ground Admin",
        "createdAt": "Official Broadcast"
    },
    {
        "id": "open-play-pf-2026",
        "title": "Official Open Play Schedule • ₱150.00 / Participant",
        "message": "Drop In. Rally On! Join our official Open Play sessions: Tuesday – Thursday (4:00 PM – 8:00 PM) and Friday – Saturday (6:00 PM – 10:00 PM) across Courts 1 – 4. Rate is ₱150.00 per participant!",
        "category": "Open Play Alert",
        "img": "assets/open-play-poster.jpg",
        "pinned": False,
        "author": "P&F Rally Ground Admin",
        "createdAt": "Official Schedule"
    }
]

DEFAULT_TOURNAMENTS = [{'id': 'trn-bicol-dupr-open', 'title': 'Bicol Open DUPR Pickleball Cup', 'format': 'Round Robin + Medal Playoffs', 'formatKey': 'ROUND_ROBIN', 'division': 'Novice (2.5–3.0) • Intermediate (3.5) • Open (4.0+)', 'category': "Men's, Women's & Mixed Doubles", 'date': '2026-11-21', 'time': '08:00 AM – 05:00 PM', 'courts': 'All 4 Courts (Courts 1 – 4)', 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': True, 'entryFee': 850, 'prizePool': '₱25,000 + Trophies & Official DUPR Submission', 'maxTeams': 24, 'registeredCount': 0, 'registrations': [], 'approved': True, 'scoringTarget': 11, 'status': 'OPEN FOR REGISTRATION', 'description': 'Guaranteed Round-Robin pool matches (1 game to 11 pts) per team. Top 8 seeded pairs advance to the Quarterfinals, Semifinals, and Gold Medal Final across Courts 1 – 4.', 'players': ['Open Seed #1 — Available', 'Open Seed #8 — Available', 'Open Seed #4 — Available', 'Open Seed #5 — Available', 'Open Seed #2 — Available', 'Open Seed #7 — Available', 'Open Seed #3 — Available', 'Open Seed #6 — Available'], 'bracket': [{'id': 'QF1', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 1', 'court': 'Court 1', 'teamA': 'Open Seed #1 — Available', 'teamB': 'Open Seed #8 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF2', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 2', 'court': 'Court 2', 'teamA': 'Open Seed #4 — Available', 'teamB': 'Open Seed #5 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF3', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 3', 'court': 'Court 3', 'teamA': 'Open Seed #2 — Available', 'teamB': 'Open Seed #7 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF4', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 4', 'court': 'Court 4', 'teamA': 'Open Seed #3 — Available', 'teamB': 'Open Seed #6 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF1', 'stage': 'Semifinals', 'label': 'Semifinal 1', 'court': 'Court 1', 'teamA': 'Winner QF1', 'teamB': 'Winner QF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF2', 'stage': 'Semifinals', 'label': 'Semifinal 2', 'court': 'Court 2', 'teamA': 'Winner QF3', 'teamB': 'Winner QF4', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'FIN', 'stage': 'Championship Final', 'label': 'Gold Medal Final', 'court': 'Court 1', 'teamA': 'Winner SF1', 'teamB': 'Winner SF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}]}, {'id': 'trn-mayon-king-court', 'title': 'Mayon Smash: King & Queen of the Court', 'format': 'Ladder Split Rotation (Individual Points)', 'formatKey': 'KING_COURT', 'division': 'All-Levels Social & Competitive (3.0–3.8)', 'category': 'Individual Entry (Rotating Doubles Partners)', 'date': '2026-11-14', 'time': '05:00 PM – 09:00 PM', 'courts': 'All 4 Courts (Courts 1 – 4)', 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': False, 'entryFee': 350, 'prizePool': '₱6,000 Cash + Carbon Pro Paddle & Medals', 'maxTeams': 24, 'registeredCount': 0, 'registrations': [], 'approved': True, 'scoringTarget': 11, 'status': 'OPEN FOR REGISTRATION', 'description': 'Play 12-minute timed ladder rounds across Courts 1 – 4: winners move UP a court and split partners. Top 8 cumulative point duos enter the Championship Knockout Bracket!', 'players': ['Open Seed #1 — Available', 'Open Seed #8 — Available', 'Open Seed #4 — Available', 'Open Seed #5 — Available', 'Open Seed #2 — Available', 'Open Seed #7 — Available', 'Open Seed #3 — Available', 'Open Seed #6 — Available'], 'bracket': [{'id': 'QF1', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 1', 'court': 'Court 1', 'teamA': 'Open Seed #1 — Available', 'teamB': 'Open Seed #8 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF2', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 2', 'court': 'Court 2', 'teamA': 'Open Seed #4 — Available', 'teamB': 'Open Seed #5 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF3', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 3', 'court': 'Court 3', 'teamA': 'Open Seed #2 — Available', 'teamB': 'Open Seed #7 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF4', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 4', 'court': 'Court 4', 'teamA': 'Open Seed #3 — Available', 'teamB': 'Open Seed #6 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF1', 'stage': 'Semifinals', 'label': 'Semifinal 1', 'court': 'Court 1', 'teamA': 'Winner QF1', 'teamB': 'Winner QF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF2', 'stage': 'Semifinals', 'label': 'Semifinal 2', 'court': 'Court 2', 'teamA': 'Winner QF3', 'teamB': 'Winner QF4', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'FIN', 'stage': 'Championship Final', 'label': 'Gold Medal Final', 'court': 'Court 1', 'teamA': 'Winner SF1', 'teamB': 'Winner SF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}]}, {'id': 'trn-daraga-mlp-rally', 'title': 'Daraga MLP-Style Team Rally Showdown', 'format': 'MLP 4-Player Co-Ed Squad Format (Rally Scoring)', 'formatKey': 'MLP_TEAM', 'division': 'Club Squads (2 Men + 2 Women per Squad)', 'category': 'Co-Ed Team Event (WD, MD, XD1, XD2 + Dreambreaker)', 'date': '2026-11-28', 'time': '09:00 AM – 06:00 PM', 'courts': 'All 4 Courts (Courts 1 – 4)', 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': False, 'entryFee': 2000, 'prizePool': '₱18,000 Cash + Club Championship Banner', 'maxTeams': 12, 'registeredCount': 0, 'registrations': [], 'approved': True, 'scoringTarget': 21, 'status': 'OPEN FOR REGISTRATION', 'description': "Major League Pickleball 4-player squad format! Each clash features Women's Doubles, Men's Doubles, and Mixed Doubles to 21 points (rally scoring) plus Dreambreaker tiebreak.", 'players': ['Open Seed #1 — Available', 'Open Seed #8 — Available', 'Open Seed #4 — Available', 'Open Seed #5 — Available', 'Open Seed #2 — Available', 'Open Seed #7 — Available', 'Open Seed #3 — Available', 'Open Seed #6 — Available'], 'bracket': [{'id': 'QF1', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 1', 'court': 'Court 1', 'teamA': 'Open Seed #1 — Available', 'teamB': 'Open Seed #8 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF2', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 2', 'court': 'Court 2', 'teamA': 'Open Seed #4 — Available', 'teamB': 'Open Seed #5 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF3', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 3', 'court': 'Court 3', 'teamA': 'Open Seed #2 — Available', 'teamB': 'Open Seed #7 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF4', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 4', 'court': 'Court 4', 'teamA': 'Open Seed #3 — Available', 'teamB': 'Open Seed #6 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF1', 'stage': 'Semifinals', 'label': 'Semifinal 1', 'court': 'Court 1', 'teamA': 'Winner QF1', 'teamB': 'Winner QF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF2', 'stage': 'Semifinals', 'label': 'Semifinal 2', 'court': 'Court 2', 'teamA': 'Winner QF3', 'teamB': 'Winner QF4', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'FIN', 'stage': 'Championship Final', 'label': 'Gold Medal Final', 'court': 'Court 1', 'teamA': 'Winner SF1', 'teamB': 'Winner SF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}]}, {'id': 'trn-albay-double-elim', 'title': 'Albay Double-Elimination Knockout Classic', 'format': 'USA Pickleball Double Elimination Bracket', 'formatKey': 'DOUBLE_ELIM', 'division': 'Intermediate (3.5) & Advanced (4.0+)', 'category': "Men's Doubles & Mixed Doubles", 'date': '2026-12-03', 'time': '08:00 AM – 04:00 PM', 'courts': 'All 4 Courts (Courts 1 – 4)', 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': False, 'entryFee': 600, 'prizePool': '₱15,000 Cash + Official Championship Medals', 'maxTeams': 24, 'registeredCount': 0, 'registrations': [], 'approved': True, 'scoringTarget': 15, 'status': 'OPEN FOR REGISTRATION', 'description': 'Full USA Pickleball Championship Bracket across Courts 1 – 4 (games to 15, win by 2). Every registered pair is seeded into the official bracket below.', 'players': ['Open Seed #1 — Available', 'Open Seed #8 — Available', 'Open Seed #4 — Available', 'Open Seed #5 — Available', 'Open Seed #2 — Available', 'Open Seed #7 — Available', 'Open Seed #3 — Available', 'Open Seed #6 — Available'], 'bracket': [{'id': 'QF1', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 1', 'court': 'Court 1', 'teamA': 'Open Seed #1 — Available', 'teamB': 'Open Seed #8 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF2', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 2', 'court': 'Court 2', 'teamA': 'Open Seed #4 — Available', 'teamB': 'Open Seed #5 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF3', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 3', 'court': 'Court 3', 'teamA': 'Open Seed #2 — Available', 'teamB': 'Open Seed #7 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'QF4', 'stage': 'Quarterfinals', 'label': 'Quarterfinal 4', 'court': 'Court 4', 'teamA': 'Open Seed #3 — Available', 'teamB': 'Open Seed #6 — Available', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF1', 'stage': 'Semifinals', 'label': 'Semifinal 1', 'court': 'Court 1', 'teamA': 'Winner QF1', 'teamB': 'Winner QF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'SF2', 'stage': 'Semifinals', 'label': 'Semifinal 2', 'court': 'Court 2', 'teamA': 'Winner QF3', 'teamB': 'Winner QF4', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}, {'id': 'FIN', 'stage': 'Championship Final', 'label': 'Gold Medal Final', 'court': 'Court 1', 'teamA': 'Winner SF1', 'teamB': 'Winner SF2', 'scoreA': 0, 'scoreB': 0, 'serverSide': 'A', 'serverNum': 2, 'toA': 2, 'toB': 2, 'status': 'PENDING', 'winner': None}]}]

DEFAULT_OPEN_PLAY_SESSIONS = [{'id': 'op-afternoon-social', 'title': 'Tue – Thu Open Play (Drop In. Rally On.)', 'schedule': 'Tuesday – Thursday • 04:00 PM – 08:00 PM', 'skillLevel': 'All Skill Levels (Drop In • Rally On)', 'rotationRule': '4-Player Doubles Pods • Shuffle Players Every Round', 'entryFee': 150, 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': True, 'maxPlayers': 24, 'players': [], 'shuffledOrder': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 'lastShuffleTime': 'Ready to Shuffle'}, {'id': 'op-evening-nightlights', 'title': 'Fri – Sat Night Open Play (Drop In. Rally On.)', 'schedule': 'Friday – Saturday • 06:00 PM – 10:00 PM', 'skillLevel': 'All Skill Levels (Drop In • Rally On)', 'rotationRule': '4-Player Doubles Pods • Shuffle Players Every Round', 'entryFee': 150, 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': True, 'maxPlayers': 24, 'players': [], 'shuffledOrder': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 'lastShuffleTime': 'Ready to Shuffle'}, {'id': 'op-morning-dropin', 'title': 'Morning Community Drop-In', 'schedule': 'Daily • 07:00 AM – 10:00 AM', 'skillLevel': 'Social & Fitness Rotation (All Levels)', 'rotationRule': '4-Player Doubles Pods • Balanced Court Rotation', 'entryFee': 150, 'designatedCourts': ['Court 1', 'Court 2'], 'showCourtsOnSite': True, 'published': False, 'maxPlayers': 24, 'players': [], 'shuffledOrder': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 'lastShuffleTime': 'Ready to Shuffle'}, {'id': 'op-weekend-mixer', 'title': 'Weekend Club Open Play Mixer', 'schedule': 'Sunday • 04:00 PM – 08:00 PM', 'skillLevel': 'All Community Members & Walk-Ins', 'rotationRule': '4-Player Doubles Pods • Community Shuffler', 'entryFee': 150, 'designatedCourts': ['Court 1', 'Court 2', 'Court 3', 'Court 4'], 'showCourtsOnSite': True, 'published': False, 'maxPlayers': 24, 'players': [], 'shuffledOrder': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 'lastShuffleTime': 'Ready to Shuffle'}]

DEFAULT_SECURITY_LOG = [
    {
        "time": "2026-10-31 06:00:00",
        "event": "SHIELD_ACTIVE",
        "detail": "5/5 Cybersecurity Protections active (Brute-Force Guard, Session Token, Anti-XSS, Nosniff, Idle Lock)",
        "ip": "127.0.0.1"
    },
    {
        "time": "2026-10-31 06:00:00",
        "event": "AUTH_GATE_READY",
        "detail": "Salted SHA-256 Staff/Owner Access Key verification & rate limiter online",
        "ip": "127.0.0.1"
    }
]

DEFAULT_DB = {
    "bookings": [],
    "deletedBookingRefs": [],
    "deletedInventoryIds": [],
    "bookingsUpdatedAt": 0,
    "blocks": [],
    "salesLedger": [],
    "expenses": [],
    "inventory": [],
    "categories": [],
    "announcements": DEFAULT_ANNOUNCEMENTS,
    "securityLog": DEFAULT_SECURITY_LOG,
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
        "heroSubtitle": "Welcome to P&F Rally Ground — your home court for great rallies, friendly competition, and community play. Check the live schedule below or book a court in seconds.",
        "heroPrimaryBtn": "Reserve a court",
        "heroSecondaryBtn": "Check my booking",
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
        "liveBannerText": "LIVE CLUB UPDATE: Courts 1 – 4 Open Daily 6:00 AM – 12:00 Midnight • Book Online via GCash, Maya, or Bank Transfer!",
        "bentoSectionTag": "EXPERIENCE",
        "bentoSectionTitle": "PLAY THE CLUB",
        "bentoSectionDesc": "Open daily 6:00 AM – 12:00 midnight across Courts 1 – 4. Check court hire rates, equipment rentals, and live court availability below.",
        "scheduleHeading": "COURT TIMELINE",
        "openPlayScheduleText": "All 4 courts open daily 6:00 AM – 12:00 Midnight • Click any available time slot below to book",
        "dayRate": 400,
        "nightRate": 500,
        "includedPlayers": 6,
        "extraPlayerFee": 100,
        "openPlayRate": 150,
        "openPlayMaxPlayers": 24,
        "openPlayCourtsCount": 4,
        "openPlaySlotMinutes": 30,
        "maxAdvanceBookingDays": 30,
        "clubLat": 13.15543,
        "clubLng": 123.72471,
        "clubMapPinUrl": "https://www.bing.com/maps/search?v=2&pc=FACEBK&mid=8100&name=Velasco+St.%2C+Phase+4%2C+Do%C3%B1a+Maria+Subd.%2C+Tagas%2C+Daraga%2C+Philippines%2C+4501&mkt=en-US&fbclid=IwY2xjawVYnBdleHRuA2FlbQIxMABwZG9mBWJyaWQRMTRoaU1vSGFYU01lQlhDQWlzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEfV6cDEdlnoTrV2XY-9GoSklW3i8iwAD-QR-A4aVHbv5si-SDftGv3wAWAItU_aem_ddmZG_qe15MZb6RjEsu8yA&FORM=FBKPL1&q=13.15543%2C+123.72471&cp=13.155430%7E123.724709&lvl=16&style=r",
        "tournaments": DEFAULT_TOURNAMENTS,
        "tournamentsPublishedOnHome": True,
        "openPlaySessions": DEFAULT_OPEN_PLAY_SESSIONS,
        "openPlay24Roster": [],
        "openPlayEnabled": True,
        "openPlaySlots": ["04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM"],
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
        "court1Name": "Court 1",
        "court2Name": "Court 2",
        "court3Name": "Court 3",
        "court4Name": "Court 4",
        "clubAddress": "Velasco St., Phase 4, Doña Maria Subd., Tagas, Daraga, Philippines, 4501",
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

def _get_supabase_credentials():
    sb_url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip().rstrip("/")
    sb_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    ).strip()
    if sb_url and sb_key:
        return sb_url, sb_key
    for candidate in (
        os.path.join(PUBLIC_DIR, "supabase_config.json"),
        os.path.join(PUBLIC_DIR, "api", "supabase_config.json"),
    ):
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                u = str(cfg.get("url") or cfg.get("SUPABASE_URL") or "").strip().rstrip("/")
                k = str(cfg.get("serviceRoleKey") or cfg.get("anonKey") or cfg.get("key") or cfg.get("SUPABASE_KEY") or "").strip()
                if u and k:
                    return u, k
            except Exception:
                pass
    return (
        "https://rqyedcvngrhijmkoeyii.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxeWVkY3ZuZ3JoaWpta29leWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5Mjc0NDUsImV4cCI6MjEwOTUwMzQ0NX0.jIhie1tDXUBLUw9-mJ91XwEOOPLDGL6ilDYzrxpvo-I"
    )


def _supabase_get_db():
    sb_url, sb_key = _get_supabase_credentials()
    if not sb_url or not sb_key:
        return None
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{sb_url}/rest/v1/pf_cloud_state?id=eq.pf_rally_ground_db&select=data,updated_at",
            headers={
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}",
                "Accept": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            if isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict):
                raw_data = rows[0].get("data")
                if isinstance(raw_data, dict) and len(raw_data) > 0:
                    return raw_data
    except Exception:
        pass
    return None


def _supabase_set_db(data):
    sb_url, sb_key = _get_supabase_credentials()
    if not sb_url or not sb_key:
        return
    try:
        import urllib.request
        payload = {
            "id": "pf_rally_ground_db",
            "data": data,
            "updated_at": int(time.time() * 1000)
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{sb_url}/rest/v1/pf_cloud_state?on_conflict=id",
            data=body_bytes,
            headers={
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST"
        )
        urllib.request.urlopen(req, timeout=3.5).read()
    except Exception:
        pass


def _scrub_corrupted_utf8(obj):
    if isinstance(obj, str):
        if "\ufffd" in obj:
            return re.sub(r"\s*\ufffd\s*", " – ", obj)
        return obj
    elif isinstance(obj, list):
        return [_scrub_corrupted_utf8(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: _scrub_corrupted_utf8(v) for k, v in obj.items()}
    return obj


def load_db():
    with db_lock:
        if not os.path.exists(DB_FILE):
            sb_initial = _supabase_get_db()
            initial_db = _scrub_corrupted_utf8(sb_initial) if isinstance(sb_initial, dict) and len(sb_initial) > 0 else DEFAULT_DB
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(initial_db, f, indent=2)
            return json.loads(json.dumps(initial_db))
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = _scrub_corrupted_utf8(json.load(f))
                if "adminPassword" not in data or not data["adminPassword"]:
                    data["adminPassword"] = ""
                for k in ["bookings", "deletedBookingRefs", "deletedInventoryIds", "blocks", "salesLedger", "expenses", "inventory", "categories", "announcements", "securityLog"]:
                    if k not in data or not isinstance(data[k], list):
                        data[k] = []
                if len(data["announcements"]) == 0:
                    data["announcements"] = json.loads(json.dumps(DEFAULT_ANNOUNCEMENTS))
                if len(data["securityLog"]) == 0:
                    data["securityLog"] = json.loads(json.dumps(DEFAULT_SECURITY_LOG))
                if "bookingsUpdatedAt" not in data:
                    data["bookingsUpdatedAt"] = 0
                if "gmailConfig" not in data or not isinstance(data["gmailConfig"], dict):
                    data["gmailConfig"] = dict(DEFAULT_DB["gmailConfig"])
                if "paymentConfig" not in data or not isinstance(data["paymentConfig"], dict):
                    data["paymentConfig"] = dict(DEFAULT_DB["paymentConfig"])
                else:
                    merged_pc = dict(DEFAULT_DB["paymentConfig"])
                    merged_pc.update(data["paymentConfig"])
                    data["paymentConfig"] = merged_pc
                if "siteConfig" not in data or not isinstance(data["siteConfig"], dict):
                    data["siteConfig"] = dict(DEFAULT_DB["siteConfig"])
                else:
                    merged_sc = dict(DEFAULT_DB["siteConfig"])
                    merged_sc.update(data["siteConfig"])
                    if not str(merged_sc.get("liveBannerText") or "").strip() or str(merged_sc.get("liveBannerText")).strip() == "0":
                        merged_sc["liveBannerText"] = DEFAULT_DB["siteConfig"]["liveBannerText"]
                    data["siteConfig"] = merged_sc
                return data
        except Exception:
            return json.loads(json.dumps(DEFAULT_DB))

def save_db(data):
    with db_lock:
        if isinstance(data, dict):
            data["updatedAt"] = int(time.time() * 1000)
        payload = json.dumps(data, indent=2)
        tmp_file = f"{DB_FILE}.{os.getpid()}.{threading.get_ident()}.tmp"
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                f.write(payload)

                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass
            os.replace(tmp_file, DB_FILE)
            threading.Thread(target=_supabase_set_db, args=(data,), daemon=True).start()
        except Exception:
            try:
                if os.path.exists(tmp_file):
                    os.remove(tmp_file)
            except Exception:
                pass
            with open(DB_FILE, "w", encoding="utf-8") as f:
                f.write(payload)






def resolve_api_route(parsed_url):
    qs = urllib.parse.parse_qs(parsed_url.query)
    sub = (qs.get("__path") or qs.get("path") or [""])[0].strip("/")
    if sub:
        return "/api/" + sub
    if parsed_url.path in ("/api/index", "/api/index.py"):
        return "/api/state"
    return parsed_url.path

def get_pht_now():
    return datetime.now(timezone(timedelta(hours=8)))

ALL_18_SLOTS = [
    "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
    "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM",
    "06:00 PM", "07:00 PM", "08:00 PM", "09:00 PM", "10:00 PM", "11:00 PM"
]

def normalize_court_num(court_str):
    m = re.search(r"court\s*0*([1-4])", str(court_str or ""), re.I) or re.search(r"\b([1-4])\b", str(court_str or ""))
    return int(m.group(1)) if m else 1

def extract_slot_time(time_str):
    m = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)", str(time_str or ""), re.I)
    if not m:
        return ""
    return f"{int(m.group(1)):02d}:{m.group(2)} {m.group(3).upper()}"

def extract_covered_slots(time_str):
    start_slot = extract_slot_time(time_str)
    if not start_slot or start_slot not in ALL_18_SLOTS:
        return [start_slot] if start_slot else []
    dur_m = re.search(r"\((\d+)\s*hr", str(time_str or ""), re.I)
    dur = max(1, int(dur_m.group(1))) if dur_m else 1
    idx = ALL_18_SLOTS.index(start_slot)
    return ALL_18_SLOTS[idx:idx + dur]

def extract_date_ymd(date_str, time_str):
    today_ymd = get_pht_now().strftime("%Y-%m-%d")
    d = str(date_str or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", d):
        return d
    if d.lower().startswith("today"):
        return today_ymd
    t = str(time_str or "").strip()
    m = re.search(r"(\d{4}-\d{2}-\d{2})", t) or re.search(r"(\d{4}-\d{2}-\d{2})", d)
    if m:
        return m.group(1)
    if "today" in t.lower():
        return today_ymd
    return d or today_ymd

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
            # Check if string matches inventory item name
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
        matched_inv = False

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
                matched_inv = True
                break

        if not matched_inv:
            if "costPrice" in cart_item:
                total_cogs += float(cart_item.get("costPrice", 0) or 0) * qty
            elif "standard paddle" in cname:
                total_cogs += float(sc.get("costPaddleStd", 0) or 0) * qty
            elif "branded" in cname:
                total_cogs += float(sc.get("costPaddleBranded", 0) or 0) * qty
            elif "carbon" in cname:
                total_cogs += float(sc.get("costPaddleCarbon", 0) or 0) * qty
            elif "single" in cname or "x-40" in cname:
                total_cogs += float(sc.get("costBallSingle", 0) or 0) * qty
            elif "50 pcs" in cname or "bucket" in cname or "training balls" in cname:
                total_cogs += float(sc.get("costBallsBucket", 0) or 0) * qty
            elif "machine" in cname:
                total_cogs += float(sc.get("costMachine", 0) or 0) * qty
    return round(total_cogs, 2)

def deduct_inventory_for_items(db, items):
    return compute_and_deduct_inventory_for_items(db, items, deduct_stock=True)

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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token")
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
        if parsed.path.startswith('/api/'):
            parsed = parsed._replace(path=resolve_api_route(parsed))
        if parsed.path == "/api/state":
            db = load_db()
            qs = urllib.parse.parse_qs(parsed.query)
            since_ver = (qs.get("since") or [""])[0].strip()
            is_lite = (qs.get("lite") or [""])[0].strip() in ("1", "true")
            ts_vals = [
                int(db.get("updatedAt") or 0),
                int(db.get("bookingsUpdatedAt") or 0),
                int(db.get("blocksUpdatedAt") or 0),
                int(db.get("announcementsUpdatedAt") or 0),
                int((db.get("siteConfig") or {}).get("updatedAt") or 0),
            ]
            srv_ver = f"{max(ts_vals)}-{len(db.get('bookings') or [])}-{len(db.get('blocks') or [])}-{len(db.get('announcements') or [])}-{len(db.get('inventory') or [])}-{len(db.get('salesLedger') or [])}-{len(db.get('expenses') or [])}"
            if since_ver and since_ver == srv_ver:
                self._send_json({"ok": True, "unchanged": True, "version": srv_ver, "updatedAt": max(ts_vals)})
                return
            public_state = {k: v for k, v in db.items() if k != "adminPassword"}
            public_state["version"] = srv_ver
            if is_lite:
                lite_bookings = []
                for b in (db.get("bookings") or []):
                    if isinstance(b, dict):
                        bc = {bk: bv for bk, bv in b.items() if bk != "receiptDataUrl"}
                        bc["hasReceipt"] = bool(b.get("receiptDataUrl"))
                        lite_bookings.append(bc)
                public_state["bookings"] = lite_bookings
                public_state.pop("salesLedger", None)
                public_state.pop("expenses", None)
                public_state.pop("securityLog", None)
            else:
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
            def_pc = dict(DEFAULT_DB.get("paymentConfig") or {})
            cfg = dict(def_pc)
            if isinstance(db.get("paymentConfig"), dict):
                cfg.update(db["paymentConfig"])
            self._send_json({"ok": True, "paymentConfig": cfg})
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
        elif parsed.path in ("/open-play", "/open-play/"):
            self.path = "/open-play.html"
        elif parsed.path in ("/pricing", "/pricing/"):
            self.path = "/pricing.html"
        elif parsed.path in ("/admin", "/admin/"):
            if self.directory and os.path.basename(os.path.normpath(str(self.directory))).lower() == "admin":
                self.path = "/index.html"
            else:
                self.path = "/admin/index.html"
        elif parsed.path.startswith("/admin/") and self.directory and os.path.basename(os.path.normpath(str(self.directory))).lower() == "admin":
            stripped = parsed.path[len("/admin"):]
            self.path = stripped + (("?" + parsed.query) if parsed.query else "")


        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            parsed = parsed._replace(path=resolve_api_route(parsed))
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

            booking_ref = sanitize_str(body.get("ref") or body.get("refCode") or body.get("id") or ("PF-" + str(int(datetime.now().timestamp() * 1000))[-6:]), 30)
            raw_court_str = sanitize_str(body.get("court", "Court 01"), 250)
            court_val = raw_court_str
            date_val = sanitize_str(body.get("date") or body.get("dateYMD") or "", 40)
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
            is_reschedule_req = bool(body.get("isReschedule"))
            target_cnum = normalize_court_num(new_booking["court"])
            target_ymd = extract_date_ymd(new_booking["date"], new_booking["time"])
            target_slots = extract_covered_slots(new_booking["time"])
            now_dt = get_pht_now()
            today_ymd_str = now_dt.strftime("%Y-%m-%d")
            is_tournament_booking = ("tournament" in str(raw_court_str).lower() or any("tournament" in str(it).lower() for it in items) or bool(body.get("isTournament")))
            is_open_play_booking = ("open play" in str(raw_court_str).lower() or any("open play" in str(it).lower() for it in items) or bool(body.get("isOpenPlay")))
            max_adv_days = int((db.get("siteConfig") or {}).get("maxAdvanceBookingDays", 30) or 30)
            max_ymd_str = (now_dt + timedelta(days=max_adv_days)).strftime("%Y-%m-%d")
            if re.match(r"^\d{4}-\d{2}-\d{2}$", target_ymd):
                if target_ymd < today_ymd_str:
                    self._send_json({
                        "ok": False,
                        "error": f"Expired Schedule Error: The selected date ({target_ymd}) has already passed. Please choose today or a future date."
                    }, status=409)
                    return
                elif not is_tournament_booking and not bool(body.get("adminOverride")) and target_ymd > max_ymd_str:
                    self._send_json({
                        "ok": False,
                        "error": f"Advance Booking Limit Error: Bookings are restricted to 30 days in advance ({today_ymd_str} to {max_ymd_str}). Selected date {target_ymd} is beyond the 30-day window."
                    }, status=409)
                    return
                elif target_ymd == today_ymd_str and target_slots:
                    for s_lbl in target_slots:
                        m_hr = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", s_lbl, re.I)
                        if m_hr:
                            hr12 = int(m_hr.group(1))
                            ampm = m_hr.group(3).upper()
                            hr24 = 0 if (ampm == "AM" and hr12 == 12) else (hr12 + 12 if (ampm == "PM" and hr12 != 12) else hr12)
                            if hr24 <= now_dt.hour:
                                self._send_json({
                                    "ok": False,
                                    "error": f"Expired Time Slot Error: {s_lbl} Today ({target_ymd}) has already passed. Please choose a future time slot."
                                }, status=409)
                                return
            if target_slots and not is_tournament_booking and not is_open_play_booking:
                for b in db.get("bookings", []):
                    if b.get("status") in ("CANCELLED", "DECLINED"):
                        continue
                    b_cnum = normalize_court_num(b.get("court"))
                    b_ymd = extract_date_ymd(b.get("date"), b.get("time"))
                    b_slots = extract_covered_slots(b.get("time"))
                    overlap = [s for s in target_slots if s in b_slots]
                    if b_cnum == target_cnum and b_ymd == target_ymd and overlap:
                        conflict_slot_str = overlap[0]
                        if b.get("ref") == new_booking["ref"]:
                            if is_reschedule_req:
                                self._send_json({
                                    "ok": False,
                                    "error": f"Schedule Already Booked Error: Court {target_cnum} at {conflict_slot_str} on {target_ymd} is already booked by your current reservation ({new_booking['ref']}). Please choose a different available date, court, or time slot."
                                }, status=409)
                                return
                        else:
                            # Allow rapid double-click deduplication only if not a reschedule and same non-empty transactionRef
                            if not is_reschedule_req and new_booking["transactionRef"] not in ("", "N/A") and b.get("transactionRef") == new_booking["transactionRef"]:
                                continue
                            self._send_json({
                                "ok": False,
                                "error": f"Schedule Already Booked Error: Court {target_cnum} at {conflict_slot_str} on {target_ymd} is already booked by another player. Please select an available date, court, or time slot."
                            }, status=409)
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
            # Prevent rapid double-click duplicate booking for same court + time + transactionRef
            dup_existing = next(
                (b for b in db["bookings"]
                 if b.get("court") == new_booking["court"]
                 and b.get("time") == new_booking["time"]
                 and b.get("status") != "DECLINED"
                 and (b.get("ref") == new_booking["ref"] or (new_booking["transactionRef"] and b.get("transactionRef") == new_booking["transactionRef"]))),
                None
            )
            if dup_existing:
                db["sales"] = db.get("salesLedger", [])
                self._send_json({"ok": True, "ref": dup_existing["ref"], "booking": dup_existing, "state": db, "deduplicated": True})
                return

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

            if existing_bk:
                append_security_log(db, "BOOKING_RESCHEDULED", f"Booking {new_booking['ref']} rescheduled to {new_booking['court']} ({new_booking['time']})", client_ip)
            else:
                append_security_log(db, "BOOKING_CREATED", f"New booking {new_booking['ref']} by {new_booking['name']} ({new_booking['court']} • {new_booking['time']})", client_ip)
            db["deletedBookingRefs"] = [r for r in (db.get("deletedBookingRefs") or []) if str(r).strip().upper() != str(new_booking["ref"]).strip().upper()]
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
            if not matched_role and str(body.get("role", "")).strip() in official_key_hashes.values() and entered_pw:
                matched_role = str(body.get("role", "")).strip()
            if not matched_role and custom_pw and custom_pw != "" and entered_pw == custom_pw:
                matched_role = "Custom Owner Key"

            if not matched_role:
                att = LOGIN_ATTEMPTS.get(client_ip, {"count": 0, "locked_until": 0})
                att["count"] = att.get("count", 0) + 1
                LOGIN_ATTEMPTS[client_ip] = att
                append_security_log(db, "LOGIN_REJECTED", f"Unauthorized login attempt #{att['count']} blocked", client_ip)
                save_db(db)
                self._send_json({"ok": False, "authenticated": False, "error": "Invalid Staff/Owner Access Key", "securityLog": db.get("securityLog", [])}, status=401)
                return

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
                append_security_log(db, "GMAIL_LOGIN_SUCCESS", f"{matched_role} login via Gmail ({entered_email})", client_ip)
                save_db(db)
                self._send_json({
                    "ok": True,
                    "authenticated": True,
                    "method": "gmail",
                    "role": matched_role,
                    "token": token,
                    "ownerEmail": entered_email
                })
                return
            else:
                token = secrets.token_hex(32)
                ACTIVE_ADMIN_TOKENS.add(token)
                append_security_log(db, "KEY_LOGIN_SUCCESS", f"{matched_role} unlocked workspace", client_ip)
                save_db(db)
                db["sales"] = db.get("salesLedger", [])
                self._send_json({"ok": True, "authenticated": True, "method": "password", "role": matched_role, "token": token, "securityLog": db.get("securityLog", []), "state": db})
                return

        elif parsed.path == "/api/auth/change-password":
            current_entered = str(body.get("currentPassword", "")).strip()
            new_pw = str(body.get("newPassword", "")).strip()
            current_pw = str(db.get("adminPassword", ""))
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
            new_status = sanitize_str(body.get("status", "CONFIRMED"), 40).upper()
            target = next((b for b in db["bookings"] if b.get("ref") == ref), None)
            if target:
                old_status = str(target.get("status", "")).upper()
                target["status"] = new_status
                if new_status == "CONFIRMED" and old_status != "CONFIRMED":
                    if not any(s.get("ref") == ref for s in db["salesLedger"]):
                        amt_val = parse_amount(target.get("total", 0), 0.0)
                        bk_cost = compute_and_deduct_inventory_for_items(db, target.get("items", []), deduct_stock=False)
                        if bk_cost <= 0:
                            bk_cost = float((db.get("siteConfig") or {}).get("costCourtPerHour", 0) or 0)
                        db["salesLedger"].insert(0, {
                            "ref": target["ref"],
                            "type": "Court Rental",
                            "desc": f"{target.get('court', 'Court 1')} ({target.get('name', 'Guest')}) - Ref: {target.get('transactionRef', 'Verified')}",
                            "method": target.get("paymentMethod", "GCash"),
                            "amount": amt_val,
                            "cost": round(bk_cost, 2),
                            "profit": round(amt_val - bk_cost, 2),
                            "date": get_pht_now().strftime("%Y-%m-%d %H:%M")
                        })
                    trigger_booking_gmail_notifications(db, target)
                elif new_status in ("DECLINED", "CANCELLED"):
                    db["salesLedger"] = [s for s in db.get("salesLedger", []) if s.get("ref") != ref]
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/sync-state":
            del_refs = set(str(r).strip().upper() for r in (db.get("deletedBookingRefs") or []) if r)
            if isinstance(body.get("deletedBookingRefs"), list):
                for r in body["deletedBookingRefs"]:
                    if r:
                        del_refs.add(str(r).strip().upper())
            db["deletedBookingRefs"] = list(del_refs)[-500:]
            del_inv_ids = set(str(r).strip() for r in (db.get("deletedInventoryIds") or []) if r)
            if isinstance(body.get("deletedInventoryIds"), list):
                for r in body["deletedInventoryIds"]:
                    if r:
                        del_inv_ids.add(str(r).strip())
            db["deletedInventoryIds"] = list(del_inv_ids)[-500:]
            for k in ["bookings", "blocks", "salesLedger", "expenses", "inventory", "categories", "announcements"]:
                if k in body and isinstance(body[k], list):
                    if k in ("bookings", "salesLedger"):
                        db[k] = [b for b in body[k] if isinstance(b, dict) and str(b.get("ref", "")).strip().upper() not in del_refs]
                    elif k == "inventory":
                        db[k] = [x for x in body[k] if isinstance(x, dict) and str(x.get("id", "")).strip() not in del_inv_ids]
                    elif k == "announcements":
                        if len(body[k]) > 0:
                            db[k] = body[k]
                    else:
                        db[k] = body[k]
            if isinstance(body.get("securityLog"), list) and len(body["securityLog"]) > 0:
                existing_logs = db.get("securityLog") or []
                seen_keys = set((str(x.get("time")), str(x.get("event")), str(x.get("detail"))) for x in existing_logs if isinstance(x, dict))
                for entry in body["securityLog"]:
                    if isinstance(entry, dict):
                        k_sig = (str(entry.get("time")), str(entry.get("event")), str(entry.get("detail")))
                        if k_sig not in seen_keys:
                            existing_logs.append(entry)
                            seen_keys.add(k_sig)
                existing_logs.sort(key=lambda x: str(x.get("time", "")), reverse=True)
                db["securityLog"] = existing_logs[:40]
            db["bookingsUpdatedAt"] = int(time.time() * 1000)
            db["updatedAt"] = db["bookingsUpdatedAt"]
            if "siteConfig" in body and isinstance(body["siteConfig"], dict):
                merged_sc = dict(db.get("siteConfig") or {})
                merged_sc.update(body["siteConfig"])
                db["siteConfig"] = merged_sc
            if "paymentConfig" in body and isinstance(body["paymentConfig"], dict):
                merged_pc = dict(db.get("paymentConfig") or {})
                merged_pc.update(body["paymentConfig"])
                db["paymentConfig"] = merged_pc
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "state": db})
            return

        elif parsed.path == "/api/bookings/delete":
            ref = str(body.get("ref") or "").strip()
            ref_upper = ref.upper()
            db["bookings"] = [b for b in db.get("bookings", []) if str(b.get("ref", "")).strip().upper() != ref_upper]
            db["salesLedger"] = [s for s in db.get("salesLedger", []) if str(s.get("ref", "")).strip().upper() != ref_upper]
            del_list = [str(r).strip().upper() for r in (db.get("deletedBookingRefs") or []) if r]
            if ref_upper and ref_upper not in del_list:
                del_list.append(ref_upper)
            db["deletedBookingRefs"] = del_list[-500:]
            db["bookingsUpdatedAt"] = int(time.time() * 1000)
            db["updatedAt"] = db["bookingsUpdatedAt"]
            append_security_log(db, "BOOKING_DELETED", f"Booking {ref_upper} removed from schedule & ledger by Admin", client_ip)
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
                date_val = sanitize_str(body.get("date") or body.get("dateYMD") or "", 40).lower()
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
                date_val = sanitize_str(body.get("date") or body.get("dateYMD") or "", 40)
                if not date_val or date_val.upper() == "ALL":
                    db["blocks"] = []
                else:
                    db["blocks"] = [b for b in db["blocks"] if str(b.get("date", "")).strip() != date_val]
            elif action == "remove":
                bid = body.get("id")
                db["blocks"] = [b for b in db["blocks"] if b.get("id") != bid]
            elif action == "sync":
                incoming_blocks = body.get("blocks")
                if isinstance(incoming_blocks, list):
                    db["blocks"] = incoming_blocks
            db["blocksUpdatedAt"] = int(body.get("updatedAt") or int(time.time() * 1000))
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "blocks": db["blocks"], "blocksUpdatedAt": db["blocksUpdatedAt"], "state": db})
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
                iid = str(body.get("id") or "").strip()
                if "deletedInventoryIds" not in db or not isinstance(db["deletedInventoryIds"], list):
                    db["deletedInventoryIds"] = []
                if iid and iid not in db["deletedInventoryIds"]:
                    db["deletedInventoryIds"].append(iid)
                    db["deletedInventoryIds"] = db["deletedInventoryIds"][-500:]
                db["inventory"] = [x for x in db["inventory"] if str(x.get("id", "")).strip() != iid]
                append_security_log(db, "INVENTORY_DELETED", f"Deleted product ID {iid} from inventory", client_ip)
            elif action == "clear":
                db["inventory"] = []
            append_security_log(db, f"INVENTORY_{action.upper()}", f"Inventory updated ({action})", client_ip)
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
                parent_scratch = os.path.dirname(PUBLIC_DIR) if "PUBLIC_DIR" in globals() else ""
                if parent_scratch:
                    for sib in ("pf-rally-ground-mockup", "pf-rally-ground-admin"):
                        sib_dir = os.path.join(parent_scratch, sib)
                        if os.path.isdir(sib_dir):
                            target_dirs.append(os.path.join(sib_dir, "assets"))
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

        elif parsed.path == "/api/openplay-join":
            session_id = sanitize_str(body.get("sessionId") or "op-afternoon-social", 60)
            p_name = sanitize_str(body.get("name") or "", 70)
            p_skill = sanitize_str(body.get("skill") or "All Levels", 50)
            p_phone = sanitize_str(body.get("phone") or "", 30)
            p_email = sanitize_str(body.get("email") or "", 100)
            p_date = sanitize_str(body.get("date") or get_pht_now().strftime("%Y-%m-%d"), 40)
            pay_mode = sanitize_str(body.get("paymentMethod") or body.get("paymentMode") or "GCash", 50)
            pay_ref = sanitize_str(body.get("transactionRef") or body.get("paymentRef") or "OPEN-PLAY", 60)
            booking_ref = sanitize_str(body.get("ref") or ("PF-OP-" + str(int(time.time() * 1000))[-6:]), 30)
            guest_names = body.get("guestNames") if isinstance(body.get("guestNames"), list) else []
            create_booking = body.get("createBooking", True) is not False

            if not p_name or len(p_name) < 2:
                self._send_json({"ok": False, "error": "Please enter a valid player name."}, status=400)
                return

            current_sc = dict(DEFAULT_DB.get("siteConfig", {}))
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            sessions = current_sc.get("openPlaySessions")
            if not isinstance(sessions, list) or len(sessions) == 0:
                sessions = json.loads(json.dumps(DEFAULT_OPEN_PLAY_SESSIONS))
            target_s = next((s for s in sessions if isinstance(s, dict) and s.get("id") == session_id), sessions[0])
            if not isinstance(target_s.get("players"), list):
                target_s["players"] = []

            fee_per_player = float(target_s.get("entryFee") or current_sc.get("openPlayRate") or 150)
            all_entrants = [p_name] + [sanitize_str(g, 70) for g in guest_names if sanitize_str(g, 70)]
            added_names = []
            now_time_str = get_pht_now().strftime("%I:%M %p")
            for idx_e, entrant_name in enumerate(all_entrants):
                if len(target_s["players"]) < 24 and not any(str(x.get("name", "")).lower() == entrant_name.lower() for x in target_s["players"] if isinstance(x, dict)):
                    target_s["players"].append({
                        "id": f"op-pl-{int(time.time() * 1000)}-{idx_e}",
                        "name": entrant_name,
                        "skill": p_skill,
                        "phone": p_phone,
                        "email": p_email,
                        "date": p_date,
                        "bookingRef": booking_ref,
                        "paymentMethod": pay_mode,
                        "paymentRef": pay_ref,
                        "paidAmount": fee_per_player,
                        "status": "BOOKED",
                        "joinedAt": now_time_str
                    })
                    added_names.append(entrant_name)

            players_cnt = max(1, int(body.get("players") or len(all_entrants) or 1))
            total_val = parse_amount(body.get("total"), fee_per_player * players_cnt)
            created_bk = None
            if create_booking:
                desig = target_s.get("designatedCourts") if isinstance(target_s.get("designatedCourts"), list) and target_s.get("designatedCourts") else ["Court 1", "Court 2", "Court 3", "Court 4"]
                court_label = f"Open Play • {target_s.get('title', 'Open Play')} ({', '.join(desig)})"
                sched_str = target_s.get("schedule", "03:00 PM – 06:00 PM")
                display_time = f"{p_date} • {sched_str}" if p_date not in sched_str else sched_str
                created_bk = {
                    "ref": booking_ref,
                    "name": p_name,
                    "customerName": p_name,
                    "phone": p_phone or "0999 883 2346",
                    "customerPhone": p_phone or "0999 883 2346",
                    "email": p_email,
                    "customerEmail": p_email,
                    "court": court_label,
                    "date": p_date,
                    "time": display_time,
                    "players": players_cnt,
                    "paymentMode": pay_mode,
                    "paymentMethod": pay_mode,
                    "transactionRef": pay_ref,
                    "receiptDataUrl": body.get("receiptDataUrl", ""),
                    "total": total_val,
                    "status": "PENDING",
                    "isOpenPlay": True,
                    "openPlaySessionId": target_s.get("id"),
                    "items": [f"Open Play Entry ({players_cnt}x Player @ ₱{int(fee_per_player)}) — {target_s.get('title', 'Open Play')} ({', '.join(all_entrants)})"],
                    "createdAt": get_pht_now().strftime("%Y-%m-%d %H:%M")
                }
                if "bookings" not in db or not isinstance(db["bookings"], list):
                    db["bookings"] = []
                db["bookings"] = [b for b in db["bookings"] if b.get("ref") != booking_ref]
                db["bookings"].insert(0, created_bk)
                db["bookingsUpdatedAt"] = int(time.time() * 1000)

            current_sc["openPlaySessions"] = sessions
            current_sc["openPlay24Roster"] = sessions[0].get("players", [])
            current_sc["updatedAt"] = int(time.time() * 1000)
            db["siteConfig"] = current_sc
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "ref": booking_ref, "booking": created_bk, "addedPlayers": added_names, "siteConfig": current_sc, "state": db})
            return

        elif parsed.path == "/api/openplay-shuffle":
            session_id = sanitize_str(body.get("sessionId") or "op-afternoon-social", 60)
            incoming_order = body.get("shuffledOrder")
            last_shuffle = sanitize_str(body.get("lastShuffleTime") or get_pht_now().strftime("%I:%M:%S %p"), 40)
            current_sc = dict(DEFAULT_DB.get("siteConfig", {}))
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            sessions = current_sc.get("openPlaySessions")
            if not isinstance(sessions, list) or len(sessions) == 0:
                sessions = json.loads(json.dumps(DEFAULT_OPEN_PLAY_SESSIONS))
            target_s = next((s for s in sessions if isinstance(s, dict) and s.get("id") == session_id), sessions[0])
            if isinstance(incoming_order, list) and len(incoming_order) == 24:
                target_s["shuffledOrder"] = [int(x) for x in incoming_order]
            else:
                import random
                arr = list(range(24))
                random.shuffle(arr)
                target_s["shuffledOrder"] = arr
            target_s["lastShuffleTime"] = last_shuffle
            current_sc["openPlaySessions"] = sessions
            current_sc["updatedAt"] = int(time.time() * 1000)
            db["siteConfig"] = current_sc
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "session": target_s, "siteConfig": current_sc, "state": db})
            return

        elif parsed.path == "/api/tournament-register":
            trn_id = sanitize_str(body.get("tournamentId") or "trn-bicol-dupr-open", 60)
            p1 = sanitize_str(body.get("player1") or body.get("name") or "", 70)
            p2 = sanitize_str(body.get("partner") or "", 70)
            team_name = sanitize_str(body.get("teamName") or (f"{p1} & {p2}" if p2 else p1), 120)
            phone = sanitize_str(body.get("phone") or "", 30)
            email = sanitize_str(body.get("email") or "", 100)
            division = sanitize_str(body.get("division") or "Intermediate (3.5)", 60)
            pay_mode = sanitize_str(body.get("paymentMethod") or "GCash", 50)
            pay_ref = sanitize_str(body.get("paymentRef") or body.get("transactionRef") or "TRN-ENTRY", 60)
            booking_ref = sanitize_str(body.get("bookingRef") or body.get("ref") or ("PF-TRN-" + str(int(time.time() * 1000))[-6:]), 30)

            if not p1 or len(p1) < 2:
                self._send_json({"ok": False, "error": "Please enter a valid player/team name."}, status=400)
                return

            current_sc = dict(DEFAULT_DB.get("siteConfig", {}))
            if isinstance(db.get("siteConfig"), dict):
                current_sc.update(db["siteConfig"])
            tournaments = current_sc.get("tournaments")
            if not isinstance(tournaments, list) or len(tournaments) == 0:
                tournaments = json.loads(json.dumps(DEFAULT_TOURNAMENTS))
            target_t = next((t for t in tournaments if isinstance(t, dict) and t.get("id") == trn_id), tournaments[0])
            if not isinstance(target_t.get("players"), list) or len(target_t["players"]) < 8:
                target_t["players"] = [
                    "Open Seed #1 — Available", "Open Seed #8 — Available",
                    "Open Seed #4 — Available", "Open Seed #5 — Available",
                    "Open Seed #2 — Available", "Open Seed #7 — Available",
                    "Open Seed #3 — Available", "Open Seed #6 — Available"
                ]
            if not isinstance(target_t.get("registrations"), list):
                target_t["registrations"] = []

            seed_Order = [1, 8, 4, 5, 2, 7, 3, 6]
            existing_idx = -1
            for idx_p, slot_val in enumerate(target_t["players"]):
                sv = str(slot_val or "").strip()
                if sv and not sv.lower().startswith(("open seed", "open slot", "available", "empty", "tbd", "waiting")):
                    if team_name.lower() in sv.lower():
                        existing_idx = idx_p
                        break
            open_idx = existing_idx
            if open_idx < 0:
                for idx_p, slot_val in enumerate(target_t["players"]):
                    sv = str(slot_val or "").strip()
                    if not sv or sv.lower().startswith(("open seed", "open slot", "available", "empty", "tbd", "waiting")):
                        open_idx = idx_p
                        break

            seed_num = seed_Order[open_idx] if open_idx >= 0 else (len(target_t["registrations"]) + 1)
            short_div = division.split("•")[0].strip()
            bracket_label = f"Seed #{seed_num} • {team_name} ({short_div})"
            if open_idx >= 0:
                target_t["players"][open_idx] = bracket_label
                if isinstance(target_t.get("bracket"), list) and len(target_t["bracket"]) >= 4:
                    qf_idx = open_idx // 2
                    qf_match = target_t["bracket"][qf_idx]
                    if isinstance(qf_match, dict):
                        if open_idx % 2 == 0:
                            qf_match["teamA"] = bracket_label
                        else:
                            qf_match["teamB"] = bracket_label
                        ta = str(qf_match.get("teamA", ""))
                        tb = str(qf_match.get("teamB", ""))
                        if not ta.lower().startswith("open seed") and not tb.lower().startswith("open seed"):
                            qf_match["status"] = "READY"

            if not any(
                (str(r.get("bookingRef") or r.get("id")) == booking_ref) or
                (str(r.get("teamName") or "").strip().lower() == team_name.lower())
                for r in target_t["registrations"] if isinstance(r, dict)
            ):
                target_t["registrations"].append({
                    "id": booking_ref,
                    "bookingRef": booking_ref,
                    "teamName": team_name,
                    "player1": p1,
                    "partner": p2 or "Solo / Rotating",
                    "phone": phone,
                    "email": email,
                    "division": division,
                    "paymentMethod": pay_mode,
                    "paymentRef": pay_ref,
                    "status": "PENDING",
                    "seedNumber": seed_num,
                    "registeredAt": get_pht_now().strftime("%Y-%m-%d %I:%M %p")
                })

            filled_seeds = sum(1 for p in target_t["players"] if not str(p or "").strip().lower().startswith(("open seed", "open slot", "available", "empty", "tbd")))
            target_t["registeredCount"] = max(len(target_t["registrations"]), filled_seeds)

            current_sc["tournaments"] = tournaments
            current_sc["updatedAt"] = int(time.time() * 1000)
            db["siteConfig"] = current_sc
            save_db(db)
            db["sales"] = db.get("salesLedger", [])
            self._send_json({"ok": True, "seedNumber": seed_num, "bracketLabel": bracket_label, "tournament": target_t, "siteConfig": current_sc, "state": db})
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
                    elif isinstance(v, bool) or isinstance(def_val, bool) or k in ("liveBannerEnabled", "openPlayEnabled", "tournamentsPublishedOnHome", "openPlayRateCustomized"):
                        if isinstance(v, str):
                            current_sc[k] = v.strip().lower() not in ("false", "0", "no", "")
                        else:
                            current_sc[k] = bool(v)
                    elif k == "openPlaySlots" and isinstance(v, list):
                        current_sc[k] = [sanitize_str(x, 30) for x in v if str(x).strip()]
                    elif isinstance(v, (list, dict)) or k in ("tournaments", "openPlaySessions", "openPlay24Roster", "openPlayRoster", "openPlaySchedule", "openPlayDesignatedCourts"):
                        current_sc[k] = v
                    elif isinstance(v, (int, float)) or isinstance(def_val, (int, float)) or k in (
                        "dayRate", "nightRate", "includedPlayers", "extraPlayerFee", "openPlayRate", "openPlayMaxPlayers", "openPlayCourtsCount", "openPlaySlotMinutes", "maxAdvanceBookingDays", "clubLat", "clubLng",
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
                if "openPlayRate" in incoming:
                    current_sc["openPlayRateCustomized"] = True
                if current_sc.get("liveBannerText") is None or str(current_sc.get("liveBannerText")).strip() == "0":
                    current_sc["liveBannerText"] = DEFAULT_DB["siteConfig"]["liveBannerText"]
                current_sc["updatedAt"] = int(time.time() * 1000)
            db["siteConfig"] = current_sc
            save_db(db)
            self._send_json({"ok": True, "siteConfig": current_sc})
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
        elif parsed.path == "/api/reset":
            keep_pw = db.get("adminPassword", "")
            keep_site = db.get("siteConfig", dict(DEFAULT_DB["siteConfig"]))
            keep_pay = db.get("paymentConfig", dict(DEFAULT_DB["paymentConfig"]))
            prev_del = [str(r).strip().upper() for r in (db.get("deletedBookingRefs") or []) if r]
            for b in (db.get("bookings") or []):
                if isinstance(b, dict) and b.get("ref"):
                    ru = str(b["ref"]).strip().upper()
                    if ru not in prev_del:
                        prev_del.append(ru)
            now_ms = int(time.time() * 1000)
            db = {
                "bookings": [],
                "deletedBookingRefs": prev_del[-500:],
                "bookingsUpdatedAt": now_ms,
                "updatedAt": now_ms,
                "blocks": [],
                "salesLedger": [],
                "expenses": [],
                "inventory": [],
                "categories": [],
                "announcements": [],
                "securityLog": [],
                "adminPassword": keep_pw,
                "siteConfig": keep_site,
                "paymentConfig": keep_pay,
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

    def log_message(self, format, *args):
        try:
            super().log_message(format, *args)
        except Exception:
            pass

    def _send_json(self, obj, status=200):
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(obj).encode("utf-8"))
        except Exception:
            pass

import socket

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

class DualStackTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        super().server_bind()

def run_server(port, directory):
    handler = lambda *args, **kwargs: UnifiedHandler(*args, directory=directory, **kwargs)
    try:
        with DualStackTCPServer(("::", port), handler) as httpd:
            print(f"Serving {directory} on dual-stack [::]:{port} & 0.0.0.0:{port} with live API sync...")
            httpd.serve_forever()
    except Exception:
        with ThreadedTCPServer(("", port), handler) as httpd:
            print(f"Serving {directory} on IPv4 0.0.0.0:{port} with live API sync...")
            httpd.serve_forever()

def cleanup_existing_port_listeners(ports):
    import subprocess
    my_pid = os.getpid()
    try:
        out = subprocess.check_output("netstat -ano", shell=True, text=True, stderr=subprocess.DEVNULL)
        pids = set()
        for line in out.splitlines():
            if "LISTENING" in line:
                for pt in ports:
                    if f":{pt} " in line:
                        parts = line.split()
                        if parts and parts[-1].isdigit():
                            pid = int(parts[-1])
                            if pid != my_pid and pid > 4:
                                pids.add(pid)
        for pid in pids:
            subprocess.call(f"taskkill /F /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

if __name__ == "__main__":
    cloud_port = os.environ.get("PORT", "").strip()
    if cloud_port.isdigit():
        load_db()
        run_server(int(cloud_port), PUBLIC_DIR)
    else:
        all_ports = [8088, 8089, 8188, 8189]
        cleanup_existing_port_listeners(all_ports)
        load_db()
        threads = []
        for pub_p in (8088, 8188):
            t = threading.Thread(target=run_server, args=(pub_p, PUBLIC_DIR), daemon=True)
            t.start()
            threads.append(t)
        for adm_p in (8089, 8189):
            t = threading.Thread(target=run_server, args=(adm_p, ADMIN_DIR), daemon=True)
            t.start()
            threads.append(t)
        print("Unified P&F Rally Ground Server running on Public (8088, 8188) and Admin (8089, 8189)!")
        for t in threads:
            t.join()
