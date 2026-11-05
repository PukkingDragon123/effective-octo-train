"""Printed matter built from REAL stock photographs (CC0 / public domain, see sources.py 'st_*' and
docs/credits/textures.md): posters, calendars, wall pictures, packaging, labels, newspapers, stickers.

Each design is one real photo (cover-cropped, lightly graded like an old print) plus a few lines of
printed Srisakdi type. No drawn illustrations: no painted figures, sunbursts or clip-art shapes.
The physical printing / ageing pass (halftone, paper scans, sun, folds, water, tape) is printed.render().

Stock photos are read from <PHOTOBASH_STOCK or PHOTOBASH_RAW>/<id>/photo.jpg (fetch.py downloads them).
"""
import os

import cv2
import numpy as np
from PIL import Image

import pbcore
from pbcore import fbm, hex2rgb, load, lum, saturate
from printed import Doc, thd, _column, font, SS

# design slot -> stock source id (sources.py)
PHOTOS = {
    'buddha_hall': 'st_buddha_hall', 'buddha_seated': 'st_buddha_seated', 'buddha_gold': 'st_buddha_gold',
    'temple_river': 'st_temple_river', 'temple_sunset': 'st_temple_sunset', 'temple_sukhothai': 'st_temple_sukhothai',
    'rice_field': 'st_rice_field', 'rice_bridge': 'st_rice_bridge', 'waterfall': 'st_waterfall', 'sunset': 'st_sunset_sky',
    'lotus': 'st_lotus', 'marigold': 'st_marigold', 'chrysanthemum': 'st_chrysanthemum', 'elephant': 'st_elephant',
    'tomyum': 'st_tomyum', 'pork_noodle': 'st_pork_noodle', 'noodles': 'st_noodles', 'corn': 'st_corn', 'prawn': 'st_prawn',
    'squid': 'st_squid', 'chili': 'st_chili', 'ginger': 'st_ginger', 'parrot': 'st_parrot', 'incense': 'st_incense',
    'helmet': 'st_helmet', 'old_moto': 'st_old_moto', 'house_fog': 'st_house_fog', 'mist_road': 'st_mist_road',
    'yellow_car': 'st_yellow_car', 'pipe': 'st_pipe', 'lanterns': 'st_lanterns', 'candles': 'st_candles',
    'car_wreck': 'st_car_wreck', 'drink': 'st_drink', 'lime': 'st_lime', 'strawberry': 'st_strawberry',
}
_CACHE = {}


def stock_dir():
    return os.environ.get('PHOTOBASH_STOCK') or pbcore.RAW


def _load(name):
    sid = PHOTOS[name]
    if sid not in _CACHE:
        p = os.path.join(stock_dir(), sid, 'photo.jpg')
        im = Image.open(p).convert('RGB')
        _CACHE[sid] = np.asarray(im, np.float32) / 255.0
    return _CACHE[sid]


def photo(name, w, h, focus=(0.5, 0.5), zoom=1.0, sat=0.82, contrast=1.04, warm=0.0, mono=False, gain=1.0):
    """Cover-crop stock photo `name` to w x h around focus (relative), zoom >= 1 crops tighter."""
    a = _load(name)
    H, W = a.shape[:2]
    sc = max(w / W, h / H) * zoom
    cw, ch = w / sc, h / sc
    cx = min(max(focus[0] * W, cw / 2), W - cw / 2)
    cy = min(max(focus[1] * H, ch / 2), H - ch / 2)
    x0, y0 = int(round(cx - cw / 2)), int(round(cy - ch / 2))
    crop = a[max(0, y0):y0 + int(round(ch)), max(0, x0):x0 + int(round(cw))]
    out = cv2.resize(crop, (int(w), int(h)), interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC)
    if mono:
        out = np.repeat(lum(out)[..., None], 3, 2)
    else:
        out = saturate(out, sat)
    if gain != 1.0:  # lift dark night photos so they survive the print (screen + lifted mids)
        out = 1 - (1 - np.clip(out, 0, 1)) ** gain
    out = np.clip((out - 0.5) * contrast + 0.5, 0, 1)
    if warm:
        out = out * (1 - warm) + out * hex2rgb('#ffe8c0') * warm
    return np.clip(out, 0, 1).astype(np.float32)


def shade(a, y0=0.6, y1=1.0, k=0.75, top=False):
    """Photographic darkening toward the bottom (or top) so printed type stays legible."""
    h = a.shape[0]
    t = np.linspace(0, 1, h)[:, None, None]
    if top:
        t = 1 - t
    m = np.clip((t - y0) / max(1e-3, y1 - y0), 0, 1) ** 1.3
    return a * (1 - m * k)


def _mono_copy(img, seed, k=1.6):
    L = lum(img)
    t = np.clip((L - 0.5) * k + 0.55, 0, 1) * (0.93 + 0.1 * fbm((img.shape[1], img.shape[0]), 90, 3, seed))
    return np.repeat(t[..., None], 3, 2)


# =======================================================================================
# Posters (640 x 896)
# =======================================================================================
PW, PH = 640, 896
POSTER_AGE = dict(paper='cream', halftone=3.0, misreg=1.2, sun=0.45, folds=(1, 1), water=0.25, mould=0.15)


def poster_movie(seed):
    D = Doc(PW, PH, '#0c0f10')
    p = shade(photo('house_fog', PW, PH, focus=(0.5, 0.45), sat=0.6, gain=1.9, contrast=1.15), 0.62, 1.0, 0.7)
    p = shade(p, 0.8, 1.0, 0.45, top=True)
    D.paste(p, 0, 0, PW, PH)
    D.text('วิญญาณริมทางโค้ง', PW / 2, PH * 0.1, 66, '#d8d2c0', max_w=PW - 60)
    D.text('อย่าจอด... ถ้าเธอโบกเรียก', PW / 2, PH * 0.8, 34, '#c8202a')
    D.text('ฉายพร้อมกันทั่วประเทศ ๑๓ เมษายน', PW / 2, PH * 0.88, 26, '#c8c0a8')
    D.text('มังกรพุก ภาพยนตร์', PW / 2, PH * 0.935, 20, '#8a8478')
    return D.finish(), dict(POSTER_AGE, sun=0.55, water=0.35, mould=0.25, tape=((0.08, 0.04, -20), (0.92, 0.05, 18)), tear=0.3)


def poster_movie2(seed):
    D = Doc(PW, PH, '#101210')
    p = shade(photo('mist_road', PW, PH, focus=(0.5, 0.5), sat=0.7, warm=0.15, gain=1.5, contrast=1.12), 0.66, 1.0, 0.7)
    D.paste(p, 0, 0, PW, PH)
    D.text('ทุ่งร้าง', PW / 2, PH * 0.12, 92, '#f0e6cc')
    D.text('ภาพยนตร์ไทย เสียงในฟิล์ม', PW / 2, PH * 0.86, 28, '#e0d6bc')
    D.text('ตั้งแต่วันนี้ ที่ โรงภาพยนตร์ มารวยรามา', PW / 2, PH * 0.92, 26, '#e8b030')
    return D.finish(), dict(POSTER_AGE, sun=0.7, water=0.2, tape=((0.5, 0.02, 2),), tear=0.15)


def poster_concert(seed):
    D = Doc(PW, PH, '#0a0a0c')
    p = shade(photo('sunset', PW, PH, focus=(0.5, 0.5), sat=0.95, gain=1.2), 0.66, 1.0, 0.6)
    D.paste(p, 0, 0, PW, PH)
    D.text('คอนเสิร์ตลูกทุ่ง', PW / 2, PH * 0.1, 70, '#f2d27a')
    D.text('คืนวันเสาร์  ลานวัดมารวย', PW / 2, PH * 0.84, 36, '#f0eadc')
    D.text('บัตรราคา ๕๐ บาท', PW / 2, PH * 0.91, 28, '#e8b030')
    return D.finish(), dict(POSTER_AGE, sun=0.6, folds=(1, 2), water=0.3, mould=0.2, tape=((0.1, 0.04, -12),), tear=0.2)


def poster_missing(seed):
    """Photocopied appeal for Boy M: the helmet found at the bus stop instead of a face."""
    D = Doc(PW, PH, '#f4f2ec')
    D.text('ประกาศ! เด็กหาย', PW / 2, PH * 0.075, 74, '#111111')
    D.paste(photo('helmet', 400, 360, focus=(0.5, 0.42), mono=True, contrast=1.1, gain=1.6), PW / 2 - 200, PH * 0.135, PW / 2 + 200, PH * 0.135 + 360)
    D.text('หมวกที่พบ ณ ป้ายรถเมล์ กม.๑๑', PW / 2, PH * 0.565, 24, '#222222')
    D.text('ด.ช. เอ็ม  อายุ ๙ ขวบ', PW / 2, PH * 0.635, 48, '#111111')
    D.lines(['หายตัวไปเย็นวันศุกร์ หลังเลิกเรียน', 'สวมชุดนักเรียน สะพายกระเป๋าสีแดง'],
            PW / 2, PH * 0.7, 30, '#151515', weight=700, lh=1.35, anchor='mm', max_w=PW - 60)
    D.text('ใครพบเห็น กรุณาแจ้งแม่ด้วย', PW / 2, PH * 0.83, 34, '#111111')
    D.text('โทร ๐๘๙-๔๔๔-๐๔๔๔', PW / 2, PH * 0.895, 42, '#111111')
    return _mono_copy(D.finish(), seed), dict(paper='white', halftone=0, sun=0.45, folds=(1, 1), water=0.45, mould=0.15,
                                              tape=((0.06, 0.03, -25), (0.94, 0.03, 25), (0.5, 0.98, 3)), streaks=0.5)


def poster_temple_fair(seed):
    D = Doc(PW, PH, '#120c08')
    p = shade(photo('lanterns', PW, PH, focus=(0.5, 0.5), sat=0.9), 0.6, 1.0, 0.75)
    D.paste(p, 0, 0, PW, PH)
    D.text('งานประจำปี วัดมารวย', PW / 2, PH * 0.1, 56, '#f6e2a0', max_w=PW - 50)
    D.text('ขึ้น ๑๔ - ๑๕ ค่ำ เดือน ๑๒', PW / 2, PH * 0.84, 34, '#f0eadc')
    D.text('ลิเก  รำวง  หนังกลางแปลง', PW / 2, PH * 0.905, 28, '#e8b030')
    return D.finish(), dict(POSTER_AGE, sun=0.5, folds=(1, 1), water=0.3, tape=((0.5, 0.02, -3),), tear=0.1)


def poster_election(seed):
    D = Doc(PW, PH, '#f2ecdc')
    D.paste(photo('rice_field', PW, int(PH * 0.62), focus=(0.5, 0.55), sat=0.8), 0, PH * 0.12, PW, PH * 0.74)
    D.text('เลือกตั้งผู้ใหญ่บ้าน', PW / 2, PH * 0.065, 52, '#1a3a1a')
    D.text('เบอร์ ๓', PW / 2, PH * 0.81, 84, '#a81a10')
    D.text('บ้านห้วยทราย  ๒๔ ธันวาคม', PW / 2, PH * 0.9, 30, '#2a2a2a')
    return D.finish(), dict(POSTER_AGE, sun=0.65, folds=(1, 1), water=0.3, mould=0.2, tape=((0.08, 0.05, -15),), tear=0.25)


def poster_lottery(seed):
    D = Doc(PW, PH, '#f2ecdc')
    D.paste(photo('elephant', PW, int(PH * 0.6), focus=(0.5, 0.5), sat=0.85), 0, 0, PW, PH * 0.6)
    D.text('เลขเด็ดงวดนี้', PW / 2, PH * 0.67, 48, '#7a1010')
    D.text(thd('44  09  11'), PW / 2, PH * 0.77, 84, '#111111')
    D.text('ลอตเตอรี่ ร้านเจ๊หมวย ตลาดมารวย', PW / 2, PH * 0.88, 28, '#2a2a2a')
    return D.finish(), dict(POSTER_AGE, sun=0.5, folds=(0, 1), water=0.2, tape=((0.92, 0.04, 20),), tear=0.1)


def poster_drink(seed):
    D = Doc(PW, PH, '#f2ecdc')
    D.paste(photo('drink', PW, int(PH * 0.72), focus=(0.5, 0.5), sat=0.95, gain=1.25), 0, 0, PW, PH * 0.72)
    D.text('น้ำแดง ม้าเหลือง', PW / 2, PH * 0.8, 60, '#a81a10')
    D.text('เย็นชื่นใจ  ขวดละ ๕ บาท', PW / 2, PH * 0.89, 32, '#2a2a2a')
    return D.finish(), dict(POSTER_AGE, paper='board', halftone=2.6, sun=0.7, water=0.2, streaks=0.4, tear=0.05)


def poster_balm(seed):
    D = Doc(PW, PH, '#e8e2cc')
    D.paste(photo('ginger', PW, int(PH * 0.66), focus=(0.5, 0.5), sat=0.9, gain=1.4), 0, PH * 0.14, PW, PH * 0.8)
    D.text('ยาหม่อง ตราเขียว', PW / 2, PH * 0.075, 56, '#1a4a2a')
    D.text('ไพล ขิง ตะไคร้  แก้ปวดเมื่อย', PW / 2, PH * 0.86, 32, '#1a1a1a', max_w=PW - 60)
    D.text('มีขายทุกร้านค้า', PW / 2, PH * 0.925, 26, '#3a3a3a')
    return D.finish(), dict(POSTER_AGE, paper='board', sun=0.6, water=0.25, mould=0.2, streaks=0.4)


# =======================================================================================
# Calendars (512 x 768): a big photo over a printed month grid
# =======================================================================================
MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม',
          'พฤศจิกายน', 'ธันวาคม']


def calendar(seed, name, month=10, year=2526, focus=(0.5, 0.45)):
    W, H = 512, 768
    D = Doc(W, H, '#f6f0e2')
    D.paste(photo(name, W - 40, int(H * 0.56), focus=focus, sat=0.9), 20, 20, W - 20, 20 + H * 0.56)
    D.text(f'{MONTHS[month]}  พ.ศ. {thd(year)}', W / 2, H * 0.635, 34, '#7a1010')
    D.line([(30, H * 0.665), (W - 30, H * 0.665)], '#8a8070', 1.5)
    for i, dname in enumerate(['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']):
        D.text(dname, W * (0.11 + i * 0.13), H * 0.695, 22, '#b81a10' if i == 0 else '#333333')
    start = (month * 3 + year) % 7
    for d in range(31 if month not in (1, 3, 5, 8, 10) else 30):
        k = d + start
        x, y = W * (0.11 + (k % 7) * 0.13), H * (0.74 + (k // 7) * 0.046)
        D.text(thd(d + 1), x, y, 23, '#b81a10' if k % 7 == 0 else '#222222')
    D.text('ร้านทองเยาวราช แม่จิตร  ขอมอบ', W / 2, H * 0.975, 18, '#5a3a20')
    return D.finish(), dict(paper='cream', halftone=2.6, misreg=0.8, sun=0.45, water=0.15, mould=0.15, grime=0.5)


# =======================================================================================
# Wall pictures (photo prints)
# =======================================================================================
def picture(seed, name, w, h, focus=(0.5, 0.5), border=0.0, warm=0.2, sat=0.75):
    D = Doc(w, h, '#f2eee4')
    b = int(min(w, h) * border)
    D.paste(photo(name, w - 2 * b, h - 2 * b - (int(b * 2.2) if border else 0), focus=focus, sat=sat, warm=warm), b, b,
            w - b, h - b - (int(b * 2.2) if border else 0))
    return D.finish(), dict(paper='white', halftone=0, solid=True, sun=0.35, grime=0.35, alpha=False, gloss=True)


# =======================================================================================
# Devotional / paper money / labels
# =======================================================================================
def amulet_card(seed, name, label, gen):
    W, H = 384, 512
    D = Doc(W, H, '#14100c')
    D.paste(photo(name, W - 48, int(H * 0.68), focus=(0.5, 0.3), sat=0.85, gain=1.2), 24, 24, W - 24, 24 + H * 0.68)
    D.text(label, W / 2, H * 0.8, 34, '#e8c860', max_w=W - 30)
    D.text(gen, W / 2, H * 0.89, 24, '#c8b088')
    return D.finish(), dict(paper='board', halftone=0, solid=True, sun=0.2, grime=0.4, alpha=False, scratch=0.6, gloss=True)


def lottery_ticket(seed):
    W, H = 640, 320
    D = Doc(W, H, '#eef0ea')
    D.paste(photo('temple_river', 230, 290, focus=(0.5, 0.5), sat=0.8), 15, 15, 245, 305)
    D.text('สลากการกุศล งานวัดมารวย', 445, 46, 28, '#1a3a6a', max_w=370)
    D.text(thd('447094'), 445, 140, 76, '#a81a10')
    D.text('งวดวันที่ ๑๖ กรกฎาคม', 445, 220, 24, '#222222')
    D.text('ราคา ๘๐ บาท', 445, 268, 30, '#1a3a6a')
    return D.finish(), dict(paper='white', halftone=2.4, misreg=0.8, sun=0.3, folds=(1, 0), water=0.1, crumple=0.4, grime=0.35)


def joss_paper(seed, variant='gold'):
    if variant == 'gold':
        W, H = 384, 384
        D = Doc(W, H, '#d8c8a0')
        # real gold-foil scan (ambientCG Foil002, CC0) on coarse kraft: what joss paper physically is
        D.paste(load('acg_Foil002', 'color', (int(W * 0.6), int(H * 0.6))) * hex2rgb('#ffd890') * 1.1, W * 0.2, H * 0.2, W * 0.8, H * 0.8)
        return D.finish(), dict(paper='kraft', halftone=0, solid=True, sun=0.1, crumple=0.8, grime=0.25, alpha=True, edge_wear=0.8)
    W, H = 640, 320
    D = Doc(W, H, '#e8d8a8')
    D.paste(photo('temple_sunset', 230, 280, focus=(0.5, 0.45), sat=0.7, warm=0.3), 20, 20, 250, 300)
    D.text('ธนาคารโลกวิญญาณ', 445, 64, 38, '#1a5a3a', max_w=370)
    D.text('๑๐,๐๐๐,๐๐๐', 445, 160, 60, '#a81a10')
    D.text('ใช้จ่ายได้ในปรโลก', 445, 250, 26, '#1a5a3a')
    return D.finish(), dict(paper='white', halftone=2.6, misreg=1.2, sun=0.2, crumple=0.5, grime=0.3, alpha=True)


def offering_label(seed, variant='spirit'):
    W, H = 384, 256
    D = Doc(W, H, '#f4f0e6')
    name, text, col = ('marigold', 'ถวายเจ้าที่', '#8a1a10') if variant == 'spirit' else ('chrysanthemum', 'ด้วยความอาลัย', '#1a1a2a')
    D.paste(photo(name, W - 24, int(H * 0.62), focus=(0.5, 0.5), sat=0.85 if variant == 'spirit' else 0.4), 12, 12, W - 12, 12 + H * 0.62)
    D.text(text, W / 2, H * 0.82, 40, col)
    return D.finish(), dict(paper='white', halftone=0, solid=True, sun=0.4, crumple=0.6, water=0.3, grime=0.4)


# =======================================================================================
# Newspapers (768 x 1024)
# =======================================================================================
BODY = ('เมื่อคืนวันพุธ เวลาประมาณ ๐๔.๓๐ น. ร้อยเวรรับแจ้งเหตุรถแท็กซี่สีเขียวเหลืองเสียหลักพลิกคว่ำ '
        'ตกข้างทางบริเวณโค้ง กม.๙ ถนนสายมารวย ทราบชื่อคนขับคือ นายสมชาย อายุ ๕๔ ปี '
        'เสียชีวิตคาที่ ชาวบ้านละแวกนั้นเล่าว่า คืนก่อนเกิดเหตุเห็นผู้หญิงชุดขาวยืนโบกรถอยู่ริมโค้ง '
        'ขณะที่ฝนตกหนัก พระในวัดใกล้เคียงได้นิมนต์มาทำพิธีบังสุกุลให้ผู้เสียชีวิตแล้ว ')


def newspaper(seed, page=1):
    W, H = 768, 1024
    D = Doc(W, H, '#ffffff')
    D.text('ข่าวราตรี', W * 0.3, 52, 76, '#111111')
    D.text('ฉบับวันศุกร์ที่ ๑๔ กรกฎาคม  ราคา ๑๐ บาท', W * 0.76, 40, 18, '#222222')
    D.text('หนังสือพิมพ์รายวัน เพื่อคนต่างจังหวัด', W * 0.76, 68, 18, '#222222')
    D.rect(20, 96, W - 20, 100, fill='#111111')
    if page == 1:
        D.text('สยอง! แท็กซี่เขียวเหลืองพลิกคว่ำ โค้ง กม.๙', W / 2, 140, 40, '#111111', max_w=W - 40)
        D.text('คนขับดับคาที่ ชาวบ้านลือ "ผีโค้งร้อยศพ"', W / 2, 186, 28, '#c81414', max_w=W - 40)
        D.paste(photo('car_wreck', int(W * 0.58), 340, mono=True, contrast=1.15), 20, 215, 20 + W * 0.58, 555)
        D.text('ภาพ: ซากรถ ณ จุดเกิดเหตุ ทางโค้งก่อนถึงศาลเจ้ามารวย', 20 + W * 0.29, 572, 16, '#333333')
        _column(D, BODY * 2, 20 + W * 0.6, 220, W * 0.36, 17, 32)
        _column(D, BODY * 3, 20, 600, W * 0.45, 17, 22)
        D.rect(W * 0.5, 600, W - 20, 990, outline='#111111', width=2)
        D.text('ผลสลากกินแบ่ง', W * 0.75, 630, 30, '#111111')
        for i, (lab, num) in enumerate((('รางวัลที่ ๑', '๔๔๗๐๙๔'), ('เลขท้าย ๒ ตัว', '๐๙'), ('เลขหน้า ๓ ตัว', '๔๔๔  ๑๑๙'))):
            D.text(lab, W * 0.75, 690 + i * 100, 22, '#333333')
            D.text(num, W * 0.75, 730 + i * 100, 44, '#111111')
    else:
        D.text('ประกาศ - รับสมัครงาน - ซื้อขาย', W / 2, 140, 36, '#111111')
        ads = [('รับคนขับกะดึก ติดต่ออากง อู่ กม.๙', None), ('ขายรถจักรยานยนต์มือสอง สภาพดี', 'old_moto'),
               ('ห้องเช่าราคาถูก ใกล้ตลาดมารวย', None), ('รับซ่อมวิทยุ เทป ทีวี ร้านช่างแดง', None),
               ('ขายที่นา ๕ ไร่ ติดถนน', 'rice_bridge'), ('ด.ช. เอ็ม หายตัว ใครพบเห็นโปรดแจ้ง', None)]
        for i, (a, ph) in enumerate(ads):
            x0 = 20 + (i % 2) * (W - 40) / 2
            y0 = 180 + (i // 2) * 270
            cw = (W - 40) / 2
            D.rect(x0 + 4, y0, x0 + cw - 4, y0 + 258, outline='#111111', width=2)
            D.text(a, x0 + cw / 2, y0 + 34, 22, '#111111', max_w=cw - 24)
            if ph:
                D.paste(photo(ph, int(cw - 40), 150, mono=True), x0 + 20, y0 + 60, x0 + cw - 20, y0 + 210)
                D.text('โทร ๐๘๑-๙๐๙-๔๔๐๔', x0 + cw / 2, y0 + 234, 18, '#222222')
            else:
                _column(D, 'ติดต่อด้วยตนเอง ทุกวัน ไม่เว้นวันหยุด เงื่อนไขเป็นไปตามที่ตกลง โทร ๐๘๑-๙๐๙-๔๔๐๔ ', x0 + 14, y0 + 80,
                        cw - 28, 16, 7)
    return D.finish(), dict(paper='cream', halftone=2.6, misreg=0.8, sun=0.75, folds=(1, 1), water=0.3, mould=0.15, tear=0.15)


def noodle_menu(seed):
    W, H = 640, 896
    D = Doc(W, H, '#ece2c8')
    D.paste(photo('noodles', W, int(H * 0.3), focus=(0.5, 0.5), sat=0.9), 0, 0, W, H * 0.3)
    D.text('ก๋วยเตี๋ยวเรือ เจ๊หมวย', W / 2, H * 0.36, 52, '#a81a10')
    items = [('เส้นเล็ก น้ำตก', '๔๐'), ('เส้นใหญ่ ต้มยำ', '๔๐'), ('บะหมี่ เย็นตาโฟ', '๔๐'), ('เกาเหลา หมูตุ๋น', '๕๐'),
             ('ข้าวขาหมู', '๔๕'), ('ชาดำเย็น โอเลี้ยง', '๑๕')]
    for i, (n, p) in enumerate(items):
        y = H * (0.45 + i * 0.075)
        D.text(n, 50, y, 36, '#1a2a4a', 700, 'lm', max_w=W * 0.6)
        D.text(p + ' .-', W - 50, y, 38, '#a81a10', 700, 'rm')
    D.text('พิเศษ เพิ่ม ๑๐ บาท', W / 2, H * 0.94, 30, '#3a3a3a')
    return D.finish(), dict(paper='board', halftone=0, solid=True, sun=0.4, water=0.2, mould=0.1, grime=0.7, streaks=0.6, alpha=False)


# =======================================================================================
# Packaging & labels: the product photographed on the pack
# =======================================================================================
def snack_bag(seed, variant='corn'):
    W, H = 448, 640
    name, brand, sub, col = {'corn': ('corn', 'กรุบกรอบ', 'ข้าวโพดอบกรอบ', '#c8341a'),
                             'prawn': ('prawn', 'ตรากุ้งทอง', 'ข้าวเกรียบกุ้ง', '#1a4a8a'),
                             'squid': ('squid', 'ทะเลทอง', 'ปลาหมึกอบรส', '#2a1a4a')}[variant]
    D = Doc(W, H, col)
    D.paste(photo(name, W, int(H * 0.62), focus=(0.5, 0.5), sat=1.0, contrast=1.08), 0, H * 0.24, W, H * 0.86)
    D.text(brand, W / 2, H * 0.12, 64, '#f8f0d8')
    D.text(sub, W / 2, H * 0.92, 34, '#f8f0d8')
    return D.finish(), dict(paper='white', halftone=2.6, misreg=0.6, sun=0.25, crumple=0.9, grime=0.3, alpha=True, gloss=True)


def noodle_cup(seed, variant='tomyum'):
    W, H = 768, 256
    name, label, col = ('tomyum', 'เส้นรีบ รสต้มยำกุ้ง', '#c8401a') if variant == 'tomyum' else ('pork_noodle', 'เส้นรีบ รสหมูสับ', '#8a5a1a')
    D = Doc(W, H, col)
    D.paste(photo(name, 300, H, focus=(0.5, 0.5), sat=1.0), 0, 0, 300, H)
    D.paste(photo(name, 300, H, focus=(0.5, 0.5), sat=1.0), W - 300, 0, W, H)
    D.text(label, W / 2 + 6, H * 0.45, 40, '#f8f0d8', max_w=150)
    return D.finish(), dict(paper='white', halftone=2.4, misreg=0.6, sun=0.2, grime=0.35, alpha=False, gloss=True)


def drink_label(seed, variant='energy'):
    W, H = 768, 288
    name, label, col = {'energy': ('ginger', 'แรงม้า ๙๙', '#e8b020'), 'energy_red': ('chili', 'ช้างพลัง', '#b81a10'),
                        'soda_red': ('strawberry', 'น้ำแดง ม้าเหลือง', '#c81a20'), 'soda_green': ('lime', 'น้ำเขียว ม้าเหลือง', '#2a7a2a')}[variant]
    D = Doc(W, H, col)
    D.paste(photo(name, 360, H, focus=(0.5, 0.5), sat=1.0), 0, 0, 360, H)
    D.text(label, 360 + (W - 360) / 2, H * 0.5, 50, '#fbf4e0', max_w=W - 400)
    return D.finish(), dict(paper='white', halftone=2.2, misreg=0.5, sun=0.35, grime=0.4, alpha=False, gloss=True)


def cigarette_pack(seed, variant='plaifah'):
    W, H = 320, 448
    name, label = ('sunset', 'ปลายฟ้า') if variant == 'plaifah' else ('candles', 'ควันเทียน')
    D = Doc(W, H, '#f0ece2')
    D.paste(photo(name, W, int(H * 0.5), focus=(0.5, 0.5), sat=0.9), 0, 0, W, H * 0.5)
    D.text(label, W / 2, H * 0.58, 48, '#7a1010')
    D.rect(16, H * 0.66, W - 16, H - 16, fill='#111111')
    D.lines(['คำเตือน', 'สูบบุหรี่ทำให้', 'เป็นมะเร็งปอด'], W / 2, H * 0.72, 30, '#ffffff', weight=700, lh=1.3, anchor='mm')
    return D.finish(), dict(paper='board', halftone=2.0, misreg=0.4, sun=0.3, crumple=0.5, grime=0.45, alpha=False)


def betel_pack(seed):
    W, H = 384, 384
    D = Doc(W, H, '#1a5a2a')
    D.paste(photo('parrot', W, int(H * 0.7), focus=(0.5, 0.35), sat=0.95, gain=1.2), 0, 0, W, H * 0.7)
    D.text('หมากแห้ง ตรานกแก้ว', W / 2, H * 0.84, 38, '#f8ecc8', max_w=W - 30)
    return D.finish(), dict(paper='kraft', halftone=2.4, misreg=0.6, sun=0.3, crumple=0.6, grime=0.5, alpha=False)


def incense_box(seed):
    W, H = 512, 320
    D = Doc(W, H, '#8a1a10')
    D.paste(photo('incense', 230, H, focus=(0.5, 0.45), sat=0.9), 0, 0, 230, H)
    D.text('ธูปหอม', 230 + (W - 230) / 2, H * 0.38, 56, '#f2d27a')
    D.text('ตราเจ็ดดาว', 230 + (W - 230) / 2, H * 0.62, 40, '#f8ecd0')
    return D.finish(), dict(paper='board', halftone=2.4, misreg=0.5, sun=0.35, grime=0.5, alpha=False, crumple=0.2)


def candle_pack(seed):
    W, H = 448, 320
    D = Doc(W, H, '#f4f0e6')
    D.paste(photo('lotus', 200, H, focus=(0.5, 0.5), sat=0.9), 0, 0, 200, H)
    D.text('เทียนไข', 200 + (W - 200) / 2, H * 0.38, 48, '#a81a40')
    D.text('ตราดอกบัว', 200 + (W - 200) / 2, H * 0.62, 36, '#2a2a2a')
    return D.finish(), dict(paper='white', halftone=2.4, misreg=0.5, sun=0.3, crumple=0.7, grime=0.35, alpha=False)


# =======================================================================================
# Stickers (384 square, die-cut): a photo with a short printed line
# =======================================================================================
STICKERS = {
    'drive_slow': ('rice_field', 'ขับช้า ๆ ได้ถึงบ้าน', '#fff4c8'),
    'yantra': ('buddha_gold', 'ทำดี ได้ดี', '#f2d27a'),
    'cartoon': ('elephant', 'น้องช้าง สู้ ๆ', '#fff4c8'),
    'lucky': ('marigold', 'เลขมงคล ๙๙๙', '#fff4c8'),
    'no_smoking': ('pipe', 'ห้ามสูบบุหรี่ในรถ', '#fff4c8'),
    'merit': ('lotus', 'สาธุ', '#fff4c8'),
    'meter': ('yellow_car', 'กดมิเตอร์ทุกครั้ง', '#fff4c8'),
    'no_stop': ('mist_road', 'ห้ามแวะระหว่างทาง', '#fff4c8'),
}


def sticker(seed, variant):
    S = 384
    name, text, col = STICKERS[variant]
    D = Doc(S, S, '#111111')
    D.paste(shade(photo(name, S, S, focus=(0.5, 0.45), sat=1.0, contrast=1.08), 0.55, 1.0, 0.8), 0, 0, S, S)
    D.text(text, S / 2, S * 0.84, 40, col, max_w=S - 50)
    return D.finish(), dict(sticker=True, sun=0.45, grime=0.3, scratch=0.4)
