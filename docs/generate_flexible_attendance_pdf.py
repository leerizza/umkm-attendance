"""Generate PDF documentation for the flexible attendance feature.

Run from project root:
    python docs/generate_flexible_attendance_pdf.py
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem,
)
from pathlib import Path

OUT_PATH = Path(__file__).parent / "panduan-mode-absensi-fleksibel.pdf"

# ─── Styles ──────────────────────────────────────────────────────────────────
INDIGO = colors.HexColor("#4f46e5")
INDIGO_DARK = colors.HexColor("#3730a3")
EMERALD = colors.HexColor("#10b981")
AMBER = colors.HexColor("#f59e0b")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748b")
SLATE_100 = colors.HexColor("#f1f5f9")
SLATE_50 = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")

styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=22, leading=28, textColor=INDIGO_DARK,
    spaceBefore=4, spaceAfter=10,
)
H2 = ParagraphStyle(
    "H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=15, leading=20, textColor=INDIGO,
    spaceBefore=18, spaceAfter=8,
    borderPadding=(0, 0, 4, 0),
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
CODE = ParagraphStyle(
    "CODE", parent=BODY, fontName="Courier-Bold", fontSize=11, leading=15,
    backColor=SLATE_100, borderPadding=8, textColor=INDIGO_DARK,
    alignment=TA_CENTER, spaceBefore=6, spaceAfter=6,
)


def hr():
    """A simple horizontal divider."""
    t = Table([[""]], colWidths=[17 * cm], rowHeights=[1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER)]))
    return t


def section_header(num, title):
    return Paragraph(f'<font color="{INDIGO.hexval()}">{num}.</font> {title}', H2)


def comparison_table():
    data = [
        ["", "Mode Biasa", "Mode Fleksibel"],
        ["Tombol absen", "2x (masuk, pulang)", "4x (masuk, istirahat, kembali, pulang)"],
        ["Status \"Hadir\"", "Berdasarkan jam masuk", "Berdasarkan total durasi kerja"],
        ["Cocok untuk", "Jam kerja standar", "Jam kerja terpecah / fleksibel"],
    ]
    t = Table(data, colWidths=[3.6 * cm, 5.2 * cm, 7.7 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
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
        ["Kegiatan", "Jam"],
        ["Clock In", "09:15"],
        ["Mulai Istirahat", "13:00"],
        ["Selesai Istirahat", "17:45"],
        ["Clock Out", "22:00"],
    ]
    t = Table(data, colWidths=[8 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), EMERALD),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (1, 1), (1, -1), "Courier-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE_50]),
    ]))
    return t


def step_card(num, title, body_lines, color=INDIGO):
    """A numbered step with colored circle badge."""
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

    return Table(
        [[badge_tbl, body_paragraphs]],
        colWidths=[1.2 * cm, 15.5 * cm],
    )


def faq_item(q, a):
    return [
        Paragraph(f'<b><font color="{INDIGO.hexval()}">Q:</font> {q}</b>', BODY),
        Paragraph(f'<font color="{EMERALD.hexval()}"><b>A:</b></font> {a}', BODY),
        Spacer(1, 4),
    ]


# ─── Build doc ───────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        str(OUT_PATH),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Panduan Mode Absensi Fleksibel",
        author="Donkap",
    )

    story = []

    # ── Cover-ish title ──
    story.append(Spacer(1, 6))
    story.append(Paragraph("Panduan Mode Absensi Fleksibel", H1))
    story.append(Paragraph(
        "Absen 4 kali sehari dengan jeda istirahat — status hadir dihitung dari total durasi kerja efektif.",
        SUBTITLE,
    ))
    story.append(hr())
    story.append(Spacer(1, 12))

    # ── 1. Apa itu ──
    story.append(section_header(1, "Apa itu Mode Fleksibel?"))
    story.append(Paragraph(
        "Mode absensi yang memungkinkan karyawan <b>istirahat di tengah hari kerja</b> "
        "tanpa harus menutup sesi (clock out). Cocok untuk:",
        BODY,
    ))
    story.append(Paragraph("• Karyawan toko/warung yang istirahat siang lalu balik lagi sore", BULLET))
    story.append(Paragraph("• Pekerjaan dengan jam masuk-pulang yang fleksibel", BULLET))
    story.append(Paragraph("• UMKM yang punya jeda operasional (mis. tutup jam 13:00, buka lagi jam 17:00)", BULLET))
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Perbedaan dengan mode biasa:</b>", BODY))
    story.append(Spacer(1, 4))
    story.append(comparison_table())

    # ── 2. Untuk Admin ──
    story.append(section_header(2, "Untuk ADMIN: Cara Mengaktifkan"))
    admin_steps = [
        "Login sebagai admin",
        "Buka menu <b>Admin</b> → tab <b>Pengaturan</b>",
        'Scroll ke card <b>"Mode Absensi Fleksibel"</b>',
        'Geser toggle <b>"Aktifkan mode fleksibel"</b> ke ON',
        "Isi <b>Minimum Jam Kerja</b> (default 8 jam) — batas minimum durasi agar dianggap hadir",
        'Klik tombol <b>"Simpan Pengaturan"</b>',
        "Beritahu karyawan untuk <b>logout & login ulang</b> agar tampilan baru muncul",
    ]
    for i, s in enumerate(admin_steps, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s}", BULLET))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "<b>💡 Tip:</b> Minimum jam bisa diatur sesuai kebutuhan — misalnya 6 jam untuk part-time, 8 jam untuk full-time.",
        CALLOUT,
    ))

    story.append(PageBreak())

    # ── 3. Untuk Karyawan ──
    story.append(section_header(3, "Untuk KARYAWAN: Cara Pakai Harian"))
    story.append(Paragraph(
        "Dashboard hanya menampilkan <b>1 tombol pintar</b> yang labelnya berubah otomatis "
        "mengikuti urutan kerja:",
        BODY,
    ))
    story.append(Spacer(1, 8))

    story.append(KeepTogether(step_card(
        1, "Datang ke kantor → Tekan tombol \"Clock In\" (hijau)",
        [
            "Pastikan posisi GPS dalam radius kantor",
            'Setelah berhasil, status berubah menjadi <b>"Sedang bekerja"</b>',
        ],
        EMERALD,
    )))
    story.append(Spacer(1, 10))

    story.append(KeepTogether(step_card(
        2, "Mau istirahat → Tekan \"Mulai Istirahat\" (ungu)",
        [
            "<b>TIDAK perlu clock out!</b> Sesi tetap terbuka.",
            "Bisa keluar kantor untuk makan, sholat, atau urusan pribadi",
            'Status berubah menjadi <b>"Sedang istirahat"</b>',
            'Kalau hari itu tidak mau ambil istirahat sama sekali, ada tombol kecil <b>"Langsung Clock Out (tanpa istirahat)"</b>',
        ],
        INDIGO,
    )))
    story.append(Spacer(1, 10))

    story.append(KeepTogether(step_card(
        3, "Kembali kerja → Tekan \"Selesai Istirahat\" (ungu)",
        [
            "Harus dalam radius kantor lagi",
            'Status kembali ke <b>"Sedang bekerja"</b>',
        ],
        INDIGO,
    )))
    story.append(Spacer(1, 10))

    story.append(KeepTogether(step_card(
        4, "Pulang → Tekan \"Clock Out\" (oranye)",
        [
            "Sistem otomatis hitung total durasi kerja efektif",
            'Kalau cukup minimum jam → status <b><font color="#10b981">Hadir ✓</font></b>',
            'Kalau kurang → status <b><font color="#f59e0b">Pulang Lebih Awal</font></b>',
        ],
        AMBER,
    )))

    story.append(PageBreak())

    # ── 4. Cara Hitung ──
    story.append(section_header(4, "Cara Hitung Durasi Kerja"))
    story.append(Paragraph("<b>Rumus:</b>", BODY))
    story.append(Paragraph(
        "Durasi Efektif = (Mulai Istirahat − Clock In) + (Clock Out − Selesai Istirahat)",
        CODE,
    ))
    story.append(Paragraph(
        "Waktu istirahat <b>tidak dihitung</b> sebagai jam kerja.",
        BODY,
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Contoh nyata:</b>", H3))
    story.append(example_table())
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Perhitungan:</b>", H3))
    story.append(Paragraph("• Sesi pagi: 13:00 − 09:15 = <b>3 jam 45 menit</b>", BULLET))
    story.append(Paragraph("• Sesi malam: 22:00 − 17:45 = <b>4 jam 15 menit</b>", BULLET))
    story.append(Paragraph(
        '• <b>Total: 8 jam 0 menit</b> → status <b><font color="#10b981">Hadir ✓</font></b>',
        BULLET,
    ))

    # ── 5. FAQ ──
    story.append(section_header(5, "FAQ — Pertanyaan yang Sering Ditanya"))

    faqs = [
        ('Kalau lupa tekan "Selesai Istirahat" lalu mau clock out?',
         "Sistem akan menolak. Harus tekan <b>Selesai Istirahat</b> dulu, baru bisa clock out."),
        ("Bisa istirahat berapa kali sehari?",
         "Saat ini <b>1 kali istirahat per hari</b>. Cukup untuk istirahat siang/sore."),
        ("Kalau telat masuk apa langsung dianggap absen?",
         "Tidak. Yang penting <b>total durasi kerja</b> memenuhi minimum. Mau masuk jam 10 atau jam 14, "
         "selama totalnya cukup, tetap hadir."),
        ("Kalau durasi kurang dari minimum gimana?",
         'Tetap tercatat, tapi status jadi <b>"Pulang Lebih Awal"</b> (bukan "Absen"). '
         "Admin tetap bisa lihat berapa jam karyawan kerja hari itu."),
        ("Bagaimana dengan validasi GPS?",
         "Setiap tekan tombol (Clock In, Mulai Istirahat, Selesai Istirahat, Clock Out) <b>harus "
         "dalam radius kantor</b> — sama seperti mode biasa."),
        ("Kalau salah pencet tombol bagaimana?",
         "Karyawan bisa ajukan <b>Koreksi Absensi</b> di menu Riwayat, lalu admin yang menyetujui."),
        ("Riwayat absensi tampil seperti apa?",
         "Di menu Riwayat akan ada kolom tambahan: <b>Istirahat</b> dan <b>Kembali</b>, plus "
         "<b>Durasi Kerja Efektif</b> (sudah dikurangi waktu istirahat)."),
    ]
    for q, a in faqs:
        for item in faq_item(q, a):
            story.append(item)

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        '<para alignment="center"><font color="#94a3b8">Donkap · Sistem Absensi UMKM</font></para>',
        SMALL,
    ))

    doc.build(story)
    print(f"OK - PDF created: {OUT_PATH}")


if __name__ == "__main__":
    build()
