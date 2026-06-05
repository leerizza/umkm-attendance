"""Multi-location attendance: CRUD for office points + per-employee assignment.

These endpoints are only meaningful when company.multi_location = True.
The clock-in/out validation in routers/attendance.py automatically picks
between the legacy single-point flow and this multi-location flow.
"""
from fastapi import APIRouter, Depends, HTTPException
from models.schemas import (
    LocationCreateRequest, LocationUpdateRequest, EmployeeLocationsAssignRequest,
)
from utils.auth import require_admin, get_current_profile
from db import supabase

router = APIRouter(tags=["locations"])


# ─── Admin: CRUD locations ───────────────────────────────────────────────────

@router.get("/admin/locations")
async def list_locations(admin: dict = Depends(require_admin)):
    res = (
        supabase.table("locations")
        .select("*")
        .eq("company_id", admin["company_id"])
        .order("created_at")
        .execute()
    )
    return {"data": res.data or []}


@router.post("/admin/locations")
async def create_location(body: LocationCreateRequest, admin: dict = Depends(require_admin)):
    payload = body.model_dump()
    payload["company_id"] = admin["company_id"]
    try:
        res = supabase.table("locations").insert(payload).execute()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(400, f"Nama lokasi \"{body.name}\" sudah ada")
        raise HTTPException(400, "Gagal membuat lokasi")
    return {"message": "Lokasi dibuat", "data": (res.data or [None])[0]}


@router.patch("/admin/locations/{location_id}")
async def update_location(
    location_id: str,
    body: LocationUpdateRequest,
    admin: dict = Depends(require_admin),
):
    # Verify ownership
    try:
        rec = supabase.table("locations").select("company_id").eq("id", location_id).single().execute()
    except Exception:
        raise HTTPException(404, "Lokasi tidak ditemukan")
    if not rec.data or rec.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Lokasi tidak ditemukan")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Tidak ada perubahan")

    supabase.table("locations").update(updates).eq("id", location_id).execute()
    return {"message": "Lokasi diupdate"}


@router.delete("/admin/locations/{location_id}")
async def delete_location(location_id: str, admin: dict = Depends(require_admin)):
    try:
        rec = supabase.table("locations").select("company_id").eq("id", location_id).single().execute()
    except Exception:
        raise HTTPException(404, "Lokasi tidak ditemukan")
    if not rec.data or rec.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Lokasi tidak ditemukan")

    supabase.table("locations").delete().eq("id", location_id).execute()
    return {"message": "Lokasi dihapus"}


# ─── Admin: assign employee → locations ──────────────────────────────────────

@router.get("/admin/employees/{user_id}/locations")
async def get_employee_locations(user_id: str, admin: dict = Depends(require_admin)):
    try:
        emp = supabase.table("profiles").select("company_id").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    if not emp.data or emp.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Karyawan tidak ditemukan")

    res = (
        supabase.table("employee_locations")
        .select("location_id")
        .eq("user_id", user_id)
        .execute()
    )
    return {"location_ids": [r["location_id"] for r in (res.data or [])]}


@router.put("/admin/employees/{user_id}/locations")
async def assign_employee_locations(
    user_id: str,
    body: EmployeeLocationsAssignRequest,
    admin: dict = Depends(require_admin),
):
    """Replace the full set of locations for one employee."""
    try:
        emp = supabase.table("profiles").select("company_id").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    if not emp.data or emp.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Karyawan tidak ditemukan")

    # Verify all location_ids belong to this company
    if body.location_ids:
        locs = (
            supabase.table("locations")
            .select("id")
            .in_("id", body.location_ids)
            .eq("company_id", admin["company_id"])
            .execute()
        )
        valid_ids = {r["id"] for r in (locs.data or [])}
        invalid = [lid for lid in body.location_ids if lid not in valid_ids]
        if invalid:
            raise HTTPException(400, f"Beberapa lokasi tidak valid: {invalid}")

    # Replace: delete all, then insert
    supabase.table("employee_locations").delete().eq("user_id", user_id).execute()
    if body.location_ids:
        rows = [{"user_id": user_id, "location_id": lid} for lid in body.location_ids]
        supabase.table("employee_locations").insert(rows).execute()

    return {"message": "Lokasi karyawan diupdate", "count": len(body.location_ids)}


# ─── Employee: list of own assigned locations (for Dashboard) ───────────────

@router.get("/attendance/my-locations")
async def my_locations(profile: dict = Depends(get_current_profile)):
    """Returns the locations this employee is allowed to clock-in at.
    When company.multi_location is False, returns an empty list (Dashboard
    falls back to the legacy company.lat/lng/radius_meters)."""
    company = profile["companies"]
    if not company.get("multi_location"):
        return {"multi_location": False, "data": []}

    res = (
        supabase.table("employee_locations")
        .select("location_id, locations(id, name, address, lat, lng, radius_meters, is_active)")
        .eq("user_id", profile["id"])
        .execute()
    )
    locations = [r["locations"] for r in (res.data or []) if r.get("locations") and r["locations"].get("is_active")]
    return {"multi_location": True, "data": locations}
