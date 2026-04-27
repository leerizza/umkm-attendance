import math


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """
    Calculate great-circle distance in meters between two GPS coordinates.
    Uses Haversine formula.
    """
    R = 6_371_000  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return round(R * c)


def is_within_radius(
    user_lat: float, user_lng: float,
    office_lat: float, office_lng: float,
    radius_m: int,
) -> tuple[bool, int]:
    """Returns (within_radius, distance_meters)"""
    distance = haversine_meters(user_lat, user_lng, office_lat, office_lng)
    return distance <= radius_m, distance
