import re
from pydantic import BaseModel, field_validator, Field
from datetime import date, time, datetime
from typing import Optional
from uuid import UUID

_TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


# ─── Auth ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=72)
    full_name: str = Field(min_length=1, max_length=100)
    company_code: str = Field(min_length=1, max_length=20)
    phone: Optional[str] = Field(default=None, max_length=20)
    position: Optional[str] = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Attendance ──────────────────────────────────────────────────────────────

class ClockInRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    notes: Optional[str] = Field(default=None, max_length=500)


class ClockOutRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    notes: Optional[str] = Field(default=None, max_length=500)


class AttendanceResponse(BaseModel):
    id: str
    user_id: str
    date: date
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    status: str
    clock_in_distance_m: Optional[int]
    clock_out_distance_m: Optional[int]
    notes: Optional[str]
    full_name: Optional[str] = None  # joined from profiles


class AttendanceListResponse(BaseModel):
    data: list[AttendanceResponse]
    total: int
    page: int
    per_page: int


# ─── Leave ───────────────────────────────────────────────────────────────────

_LEAVE_TYPES = {"annual", "sick", "personal", "other"}

class LeaveCreateRequest(BaseModel):
    leave_type: str
    start_date: date
    end_date: date
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("leave_type")
    @classmethod
    def valid_leave_type(cls, v):
        if v not in _LEAVE_TYPES:
            raise ValueError(f"leave_type must be one of: {', '.join(_LEAVE_TYPES)}")
        return v

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("end_date must be >= start_date")
        return v


class LeaveApproveRequest(BaseModel):
    status: str  # approved | rejected
    reviewer_note: Optional[str] = None


class LeaveResponse(BaseModel):
    id: str
    user_id: str
    leave_type: str
    start_date: date
    end_date: date
    days_count: int
    reason: str
    status: str
    reviewer_note: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime
    full_name: Optional[str] = None


class LeaveListResponse(BaseModel):
    data: list[LeaveResponse]
    total: int
    page: int
    per_page: int


# ─── Overtime ────────────────────────────────────────────────────────────────

class OvertimeCreateRequest(BaseModel):
    date: date
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time_format(cls, v):
        if not _TIME_RE.match(v):
            raise ValueError("time must be in HH:MM format (e.g. 08:00)")
        return v

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_time" in info.data and v <= info.data["start_time"]:
            raise ValueError("end_time must be after start_time")
        return v


class OvertimeApproveRequest(BaseModel):
    status: str  # approved | rejected
    reviewer_note: Optional[str] = None


class OvertimeResponse(BaseModel):
    id: str
    user_id: str
    date: date
    start_time: str
    end_time: str
    duration_minutes: int
    reason: str
    status: str
    reviewer_note: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime
    full_name: Optional[str] = None


class OvertimeListResponse(BaseModel):
    data: list[OvertimeResponse]
    total: int
    page: int
    per_page: int


# ─── Admin ───────────────────────────────────────────────────────────────────

class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 20
    search: Optional[str] = None
