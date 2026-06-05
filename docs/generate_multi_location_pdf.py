"""Generate PDF documentation for the multi-location attendance feature.

Run from project root:
    python docs/generate_multi_location_pdf.py
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)
from pathlib import Path

OUT_PATH = Path(__file__).parent / "panduan-mode-multi-lokasi.pdf"

# ─── Styles (matching flexible-attendance PDF palette) ──────────────────────
CYAN = colors.HexColor("#06b6d4")
CYAN_DARK = colors.HexColor("#0e7490")
EMERALD = colors.HexColor("#10b981")
AMBER = colors.HexColor("#f59e0b")
INDIGO = colors.HexColor("#4f46e5")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748b")
SLATE_100 = colors.HexColor("#f1f5f9")
SLATE_50 = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")

styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=22, leading=28, textColor=CYAN_DARK,
    spaceBefore=4, spaceAfter=10,
)
H2 = ParagraphStyle(
    "H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=15, leading=20, textColor=CYAN,
    spaceBefore=18, spaceAfter=8,
)
H3 = ParagraphStyle(
    "H3", parent=styles["Heading3"], fontName="Helvetica-Bold",
    fontSize=12, leading=16, textColor=SLATE_700,
    spaceBefore=10, spaceAfter=4,
)
BODY = ParagraphStyle(
    "BODY", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=10.5, leading=15, textColor=SLATE_700, alignment=TA_LEFT,
    spaceAfter=6,
)
BULLET = ParagraphStyle(
    "BULLET", parent=BODY, leftIndent=14, bulletIndent=2, spaceAfter=3,
)
SMALL = ParagraphStyle(
    "SMALL", parent=BODY, fontSize=9, leading=12, textColor=SLATE_500,
)
SUBTITLE = ParagraphStyle(
    "SUBTITLE", parent=BODY, fontSize=12, leading=16, textColor=SLATE_500,
    alignment=TA_CENTER, spaceAfter=20,
)
CALLOUT = ParagraphStyle(
    "CALLOUT", parent=BODY, leftIndent=10, rightIndent=10,
    backColor=colors.HexColor("#fef3c7"), borderPadding=8,
    textColor=colors.HexColor("#78350f"),
)
INFO = ParagraphStyle(
    "INFO", parent=BODY, leftIndent=10, rightIndent=10,
    backColor=colors.HexColor("#ecfeff"), borderPadding=8,
    textColor=CYAN_DARK,
)


def hr():
    t = Table([[""]], colWidths=[17 * cm], rowHeights=[1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER)]))
    return t


def section_header(num, title):
    return Paragraph(f'<font color="{CYAN.hexval()}">{num}.</font> {title}', H2)


def comparison_table():
    data = [
        ["", "Mode Biasa (1 Titik)", "Mode Multi-Lokasi"],
        ["Jumlah lokasi", "1 titik kantor", "Tidak terbatas"],
        ["Cocok untuk", "Toko / kantor tunggal", "UMKM dengan beberapa cabang"],
        ["Assignment", "Semua karyawan boleh absen", "Per karyawan bisa dibatasi"],
        ["Validasi GPS", "Radius dari 1 titik", "Radius dari titik ter-assign manapun"],
    ]
    t = Table(data, colWidths=[3.6 * cm, 5.5 * cm, 7.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CYAN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE_50]),
    ]))
    return t


def example_table():
    data = [
        ["Karyawan", "Cabang yang Di-assign"],
        ["Andi", "Cabang Jakarta, Cabang Bekasi"],
        ["Budi", "Cabang Jakarta saja"],
        ["Sari", "Cabang Bekasi, Cabang Bandung, Cabang Depok"],
        ["Dewi", "Cabang Bandung saja"],
    ]
    t = Table(data, colWidths=[4 * cm, 11 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), EMERALD),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE_50]),
    ]))
    return t


def step_card(num, title, body_lines, color=CYAN):
    badge = Paragraph(
        f'<para alignment="center"><font color="white" size="13"><b>{num}</b></font></para>',
        BODY,
    )
    badge_tbl = Table([[badge]], colWidths=[0.9 * cm], rowHeights=[0.9 * cm])
    badge_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))

    body_paragraphs = [Paragraph(f"<b>{title}</b>", H3)]
    for line in body_lines:
        body_paragraphs.append(Paragraph(f"• {line}", BULLET))

    return Table([[badge_tbl, body_paragraphs]], colWidths=[1.2 * cm, 15.5 * cm])


def faq_item(q, a):
    return [
        Paragraph(f'<b><font color="{CYAN_DARK.hexval()}">Q:</font> {q}</b>', BODY),
        Paragraph(f'<font color="{EMERALD.hexval()}"><b>A:</b></font> {a}', BODY),
        Spacer(1, 4),
    ]


def build():
    doc = SimpleDocTemplate(
        str(OUT_PATH), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.8 * cm, bottomMargin=1.8 * cm,
        title="Panduan Mode Multi-Lokasi",
        author="Donkap",
    )

    story = []

    # ── Cover ──
    story.append(Spacer(1, 6))
    story.append(Paragraph("Panduan Mode Multi-Lokasi", H1))
    story.append(Paragraph(
        "Satu perusahaan, banyak cabang — setiap karyawan bisa di-assign ke lokasi tertentu saja.",
        SUBTITLE,
    ))
    story.append(hr())
    story.append(Spacer(1, 12))

    # ── 1. Apa itu ──
    story.append(section_header(1, "Apa itu Mode Multi-Lokasi?"))
    story.append(Paragraph(
        "Mode absensi yang memungkinkan satu perusahaan punya <b>beberapa titik lokasi absen</b> "
        "(cabang/toko/kios), dengan tiap karyawan diberi izin hanya untuk lokasi tertentu. Cocok untuk:",
        BODY,
    ))
    story.append(Paragraph("• UMKM dengan lebih dari satu cabang toko atau kantor", BULLET))
    story.append(Paragraph("• Warung makan dengan beberapa outlet di kota berbeda", BULLET))
    story.append(Paragraph("• Salon, laundry, atau bengkel dengan cabang multiple", BULLET))
    story.append(Paragraph("• Bisnis yang punya gudang + toko terpisah", BULLET))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Perbedaan dengan mode biasa:</b>", BODY))
    story.append(Spacer(1, 4))
    story.append(comparison_table())

    # ── 2. Untuk Admin: aktifkan ──
    story.append(section_header(2, "Untuk ADMIN: Cara Mengaktifkan"))
    story.append(Paragraph(
        "<b>Langkah-langkah pengaktifan (sekali setup):</b>",
        BODY,
    ))
    admin_steps = [
        "Login sebagai admin",
        "Buka menu <b>Admin</b> &rarr; tab <b>Pengaturan</b>",
        'Scroll ke card <b>"Mode Multi-Lokasi"</b>',
        'Geser toggle <b>"Aktifkan mode multi-lokasi"</b> ke ON',
        'Klik tombol <b>"Simpan Pengaturan"</b>',
    ]
    for i, s in enumerate(admin_steps, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s}", BULLET))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "<b>&#9989; Auto-migrasi otomatis:</b> saat toggle pertama kali dinyalakan, sistem otomatis bikin "
        "1 lokasi bernama <b>\"Kantor Utama\"</b> dari setting lat/lng lama, dan auto-assign <b>semua "
        "karyawan existing</b> ke titik tersebut. Jadi tidak ada karyawan yang ke-blokir setelah migrasi.",
        INFO,
    ))

    story.append(section_header(3, "Tambah Lokasi Baru"))
    story.append(Paragraph(
        "Setelah toggle aktif, card akan menampilkan daftar lokasi. Untuk menambah:",
        BODY,
    ))
    add_steps = [
        'Klik tombol <b>"+ Tambah Lokasi"</b>',
        'Isi <b>Nama Lokasi</b> (contoh: "Cabang Jakarta Timur")',
        "Isi <b>Alamat</b> (opsional)",
        "Pilih <b>Titik Lokasi</b> di map — klik atau geser pin",
        "Atur <b>Radius</b> dalam meter (default 100m)",
        'Klik <b>Tambah</b>',
    ]
    for i, s in enumerate(add_steps, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s}", BULLET))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<b>&#128161; Tip:</b> Radius yang lebih besar = lebih toleran terhadap akurasi GPS, tapi karyawan bisa absen dari area lebih jauh. "
        "Untuk toko kecil cukup 50-100m; untuk gedung besar 150-300m.",
        CALLOUT,
    ))

    story.append(PageBreak())

    # ── 4. Untuk Admin: assign karyawan ──
    story.append(section_header(4, "Assign Karyawan ke Lokasi"))
    story.append(Paragraph(
        "Setiap karyawan harus di-assign ke lokasi yang diizinkan untuk absen. Caranya:",
        BODY,
    ))
    assign_steps = [
        "Buka tab <b>Karyawan</b> di Admin Panel",
        'Klik tombol <b>"Lokasi"</b> berwarna indigo di samping nama karyawan',
        "Modal akan terbuka menampilkan semua lokasi perusahaan",
        "<b>Centang</b> lokasi yang diizinkan untuk karyawan ini",
        'Klik <b>"Simpan"</b>',
    ]
    for i, s in enumerate(assign_steps, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s}", BULLET))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        '<b>&#9888;&#65039; Penting:</b> Karyawan yang <b>tidak di-assign ke lokasi manapun</b> tidak akan bisa clock-in. '
        'Pastikan setiap karyawan punya minimal 1 lokasi yang dicentang.',
        CALLOUT,
    ))

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Contoh skenario assignment:</b>", H3))
    story.append(Spacer(1, 4))
    story.append(example_table())

    # ── 5. Untuk Karyawan ──
    story.append(section_header(5, "Untuk KARYAWAN: Cara Pakai"))
    story.append(Paragraph(
        "Karyawan tidak perlu setting apa-apa. Dashboard otomatis menyesuaikan:",
        BODY,
    ))

    story.append(KeepTogether(step_card(
        1, "Buka Dashboard",
        [
            "Card <b>Area Absensi</b> akan menampilkan <b>jumlah lokasi ter-assign</b>",
            "Sistem otomatis cari lokasi terdekat dari posisi GPS karyawan",
            "Tampil: <b>\"X lokasi ter-assign · Terdekat: Cabang Y\"</b>",
        ],
        EMERALD,
    )))
    story.append(Spacer(1, 10))

    story.append(KeepTogether(step_card(
        2, "Pergi ke lokasi cabang",
        [
            'Tunggu sampai status muncul: <b><font color="#10b981">"&#10003; Xm dari Cabang Y"</font></b>',
            "Tombol Clock In aktif (hijau) ketika dalam radius",
            "Tidak peduli ke cabang yang mana — selama ter-assign, GPS dalam radius cukup",
        ],
        CYAN,
    )))
    story.append(Spacer(1, 10))

    story.append(KeepTogether(step_card(
        3, "Clock-in seperti biasa",
        [
            "Tekan tombol <b>Clock In</b>",
            "Sistem otomatis catat <b>nama lokasi</b> di record absensi",
            "Bisa dilihat di Riwayat &mdash; kolom <b>Lokasi</b>",
        ],
        AMBER,
    )))

    story.append(PageBreak())

    # ── 6. Contoh kasus ──
    story.append(section_header(6, "Contoh Kasus Pemakaian"))
    story.append(Paragraph(
        "<b>Studi Kasus: Toko Bu Siti dengan 3 cabang</b>",
        H3,
    ))
    story.append(Paragraph(
        "Bu Siti punya toko di Jakarta, Bekasi, dan Bandung dengan total 10 karyawan. Setup-nya:",
        BODY,
    ))
    story.append(Paragraph("• <b>Karyawan Jakarta (3 orang):</b> assign ke Cabang Jakarta saja", BULLET))
    story.append(Paragraph("• <b>Karyawan Bekasi (4 orang):</b> assign ke Cabang Bekasi saja", BULLET))
    story.append(Paragraph("• <b>Karyawan Bandung (2 orang):</b> assign ke Cabang Bandung saja", BULLET))
    story.append(Paragraph("• <b>Supervisor (1 orang):</b> assign ke <b>ketiga cabang</b> &mdash; bisa absen di mana saja saat keliling", BULLET))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "<b>Hasil:</b> Karyawan Jakarta tidak bisa <b>titip absen</b> dari rumah temennya di Bekasi karena GPS akan ketahuan di luar radius semua lokasi yang ter-assign untuk dia. "
        "Supervisor tetap fleksibel keliling cabang tanpa perlu re-assign tiap hari.",
        BODY,
    ))

    # ── 7. FAQ ──
    story.append(section_header(7, "FAQ &mdash; Pertanyaan yang Sering Ditanya"))

    faqs = [
        ("Karyawan baru daftar setelah mode aktif, gimana?",
         "Karyawan baru otomatis <b>belum ter-assign ke lokasi manapun</b>. Admin harus assign manual via "
         "tombol \"Lokasi\" di tab Karyawan, baru karyawan tersebut bisa clock-in."),
        ("Berapa maksimal jumlah lokasi?",
         "Tidak ada batas. Bisa tambah berapa pun sesuai kebutuhan cabang kamu."),
        ("Kalau saya hapus suatu lokasi, riwayat absen di lokasi itu hilang?",
         "Tidak. Riwayat absen tetap tersimpan, hanya kolom nama lokasi yang berubah jadi kosong (\"-\"). "
         "Karyawan yang punya assignment ke lokasi itu otomatis kehilangan akses ke lokasi yang dihapus."),
        ("Bisa balik ke mode 1 titik lagi?",
         "Bisa. Cukup matikan toggle Mode Multi-Lokasi di Pengaturan. Sistem kembali pakai lat/lng tunggal "
         "seperti semula. <b>Data lokasi dan assignment tetap tersimpan</b> kalau-kalau diaktifkan lagi nanti."),
        ("Apa karyawan harus install ulang app setelah admin assign lokasi?",
         "Tidak perlu install ulang. Tapi karyawan perlu <b>logout dan login ulang</b> agar data assignment "
         "ke-refresh di HP-nya. Atau bisa juga tunggu auto-refresh (~30 detik)."),
        ("Kalau karyawan di luar radius semua lokasinya, pesan errornya jelas?",
         'Ya. Sistem nampilkan pesan: <i>"Kamu di luar radius semua lokasi yang ter-assign. Terdekat: '
         'Cabang X (450m, maks 100m)."</i> &mdash; karyawan tahu harus ke mana.'),
        ("Export Excel/CSV apakah include nama lokasi?",
         "Ya. CSV export di tab Absensi punya kolom tambahan <b>Lokasi</b> yang menampilkan nama cabang "
         "untuk tiap baris absensi."),
        ("Mode Multi-Lokasi bisa dikombinasi dengan Mode Fleksibel?",
         "Bisa. Kedua toggle independent. Bisa aktifkan keduanya: karyawan bisa istirahat di tengah hari "
         "<b>dan</b> dibatasi hanya di cabang tertentu saja."),
    ]
    for q, a in faqs:
        for item in faq_item(q, a):
            story.append(item)

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        '<para alignment="center"><font color="#94a3b8">Donkap &middot; Sistem Absensi UMKM</font></para>',
        SMALL,
    ))

    doc.build(story)
    print(f"OK - PDF created: {OUT_PATH}")


if __name__ == "__main__":
    build()
