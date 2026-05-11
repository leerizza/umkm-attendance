import asyncio
import logging
import httpx
from config import settings
from db import supabase

_log = logging.getLogger(__name__)


async def _get_user_email(user_id: str) -> str | None:
    try:
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(
            None, lambda: supabase.auth.admin.get_user_by_id(user_id)
        )
        return res.user.email if res.user else None
    except Exception as e:
        _log.error("_get_user_email(%s) failed: %s", user_id, e)
        return None


async def _send(to: str, subject: str, html: str) -> None:
    if not settings.resend_api_key:
        _log.warning("RESEND_API_KEY not set — skipping email to %s", to)
        return
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.from_email, "to": [to], "subject": subject, "html": html},
                timeout=10,
            )
            if res.status_code >= 400:
                _log.error("Resend error %s sending to %s: %s", res.status_code, to, res.text)
            else:
                _log.info("Email sent to %s (status %s)", to, res.status_code)
    except Exception as e:
        _log.error("_send to %s failed: %s", to, e)


_LEAVE_TYPE_LABEL = {
    "annual": "Cuti Tahunan",
    "sick": "Cuti Sakit",
    "personal": "Cuti Pribadi",
    "other": "Cuti Lainnya",
}


def _card(title: str, color: str, body: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:{color};padding:20px 24px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Donkap</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">{title}</p>
        </td></tr>
        <tr><td style="padding:24px;">{body}</td></tr>
        <tr><td style="padding:0 24px 24px;color:#71717a;font-size:12px;">
          Email ini dikirim otomatis oleh sistem Donkap. Jangan balas email ini.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _row(label: str, value: str) -> str:
    return f"""
    <tr>
      <td style="padding:6px 0;color:#71717a;font-size:14px;width:130px;">{label}</td>
      <td style="padding:6px 0;color:#09090b;font-size:14px;font-weight:600;">{value}</td>
    </tr>"""


async def send_leave_decision_email(
    user_id: str,
    full_name: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    status: str,
    reviewer_note: str | None,
) -> None:
    email = await _get_user_email(user_id)
    if not email:
        return

    type_label = _LEAVE_TYPE_LABEL.get(leave_type, leave_type.title())
    note_row = _row("Catatan:", reviewer_note) if reviewer_note else ""

    if status == "approved":
        title = "Pengajuan Cuti Disetujui"
        color = "#16a34a"
        intro = f"Halo <strong>{full_name}</strong>, pengajuan cuti Anda telah <strong>disetujui</strong>."
    else:
        title = "Pengajuan Cuti Ditolak"
        color = "#dc2626"
        intro = f"Halo <strong>{full_name}</strong>, pengajuan cuti Anda <strong>ditolak</strong>."

    body = f"""
    <p style="margin:0 0 20px;color:#09090b;font-size:15px;">{intro}</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      {_row("Jenis Cuti:", type_label)}
      {_row("Tanggal Mulai:", start_date)}
      {_row("Tanggal Selesai:", end_date)}
      {note_row}
    </table>"""

    await _send(email, title, _card(title, color, body))


async def send_overtime_decision_email(
    user_id: str,
    full_name: str,
    date: str,
    start_time: str,
    end_time: str,
    status: str,
    reviewer_note: str | None,
) -> None:
    email = await _get_user_email(user_id)
    if not email:
        return

    note_row = _row("Catatan:", reviewer_note) if reviewer_note else ""

    if status == "approved":
        title = "Pengajuan Lembur Disetujui"
        color = "#16a34a"
        intro = f"Halo <strong>{full_name}</strong>, pengajuan lembur Anda telah <strong>disetujui</strong>."
    else:
        title = "Pengajuan Lembur Ditolak"
        color = "#dc2626"
        intro = f"Halo <strong>{full_name}</strong>, pengajuan lembur Anda <strong>ditolak</strong>."

    body = f"""
    <p style="margin:0 0 20px;color:#09090b;font-size:15px;">{intro}</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      {_row("Tanggal:", date)}
      {_row("Jam Mulai:", start_time)}
      {_row("Jam Selesai:", end_time)}
      {note_row}
    </table>"""

    await _send(email, title, _card(title, color, body))


async def send_new_company_notification(
    company_name: str,
    company_code: str,
    owner_email: str,
    owner_name: str,
    company_id: str,
) -> None:
    if not settings.superadmin_email:
        return
    title = "Perusahaan Baru Menunggu Persetujuan"
    body = f"""
    <p style="margin:0 0 20px;color:#09090b;font-size:15px;">
      Ada pendaftaran perusahaan baru yang perlu disetujui.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%">
      {_row("Nama Perusahaan:", company_name)}
      {_row("Kode:", company_code)}
      {_row("Owner:", owner_name)}
      {_row("Email:", owner_email)}
      {_row("Company ID:", company_id)}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#71717a;">
      Approve via endpoint:<br/>
      <code style="background:#f4f4f5;padding:4px 8px;border-radius:4px;font-size:12px;">
        PATCH /superadmin/companies/{company_id}/approve
      </code>
    </p>"""
    await _send(settings.superadmin_email, title, _card(title, "#2563eb", body))


async def send_company_approved_email(
    owner_email: str,
    owner_name: str,
    company_name: str,
    approved: bool,
) -> None:
    if approved:
        title = "Perusahaan Anda Telah Disetujui"
        color = "#16a34a"
        intro = f"Halo <strong>{owner_name}</strong>, perusahaan <strong>{company_name}</strong> telah disetujui. Kamu sudah bisa login dan menggunakan Donkap."
    else:
        title = "Pendaftaran Perusahaan Ditolak"
        color = "#dc2626"
        intro = f"Halo <strong>{owner_name}</strong>, maaf pendaftaran perusahaan <strong>{company_name}</strong> tidak dapat disetujui. Hubungi kami untuk informasi lebih lanjut."

    body = f"""
    <p style="margin:0 0 20px;color:#09090b;font-size:15px;">{intro}</p>
    {"<a href='https://www.donkap.space' style='display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:8px;'>Login Sekarang</a>" if approved else ""}"""

    await _send(owner_email, title, _card(title, color, body))
