from __future__ import annotations

from math import atan2, cos, isfinite, radians, sin, sqrt
import json
import time
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.db import models
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from amex.models import TicketAMEX
from conciliacion.models import AlertaConciliacion, Factura
from flotilla.models import Vehicle, VehicleAlert
from viaticos.models import Viatico


NEARBY_PLACES_CACHE: dict[str, tuple[float, list[dict[str, float | str]]]] = {}
NEARBY_PLACES_CACHE_TTL_SECONDS = 300
NEARBY_PLACES_EMPTY_CACHE_TTL_SECONDS = 20
NEARBY_PLACES_MAX_LIMIT = 300
ROAD_PREFIXES = ('calle', 'av', 'avenida', 'blvd', 'boulevard', 'carretera', 'camino', 'autopista', 'ruta')
HTTP_HEADERS = {
    'User-Agent': 'FinanzasV2/1.0 (nearby-places-service)',
    'Accept': 'application/json',
}


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize('NFD', str(value or '').strip().lower())
    return ''.join(char for char in normalized if unicodedata.category(char) != 'Mn')


def is_likely_business_name(name: str) -> bool:
    normalized = normalize_text(name)
    if not normalized:
        return False
    return not normalized.startswith(ROAD_PREFIXES)


def to_unique_text_parts(parts: list[str | None]) -> list[str]:
    seen: set[str] = set()
    values: list[str] = []
    for raw_value in parts:
        value = str(raw_value or '').strip()
        if not value:
            continue
        normalized = normalize_text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        values.append(value)
    return values


def join_unique_text_parts(parts: list[str | None]) -> str:
    return ', '.join(to_unique_text_parts(parts))


def get_distance_meters(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    earth_radius_meters = 6_371_000
    d_lat = radians(to_lat - from_lat)
    d_lng = radians(to_lng - from_lng)
    lat1 = radians(from_lat)
    lat2 = radians(to_lat)
    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lng / 2) ** 2
    return earth_radius_meters * (2 * atan2(sqrt(a), sqrt(1 - a)))


def _http_get_json(url: str, timeout_seconds: int = 10):
    request = Request(url, headers=HTTP_HEADERS)
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode('utf-8'))


def _http_post_form_json(url: str, form_data: dict[str, str], timeout_seconds: int = 12):
    encoded = urlencode(form_data).encode('utf-8')
    request = Request(url, data=encoded, headers={**HTTP_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
    with urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode('utf-8'))


def fetch_overpass_places(lat: float, lng: float, limit: int, fast_mode: bool = False) -> list[dict[str, float | str]]:
    if limit <= 100:
        radius_meters = 5000
        overpass_timeout = 5
        out_limit = 1400
        endpoint_timeout = 3
        max_total_seconds = 5.5
        max_distance = 8000
    elif limit <= 200:
        radius_meters = 7000
        overpass_timeout = 6
        out_limit = 1900
        endpoint_timeout = 4
        max_total_seconds = 7.0
        max_distance = 10000
    else:
        radius_meters = 9000
        overpass_timeout = 6
        out_limit = 2400
        endpoint_timeout = 4
        max_total_seconds = 8.0
        max_distance = 12000
    if fast_mode:
        radius_meters = min(radius_meters, 4200)
        overpass_timeout = min(overpass_timeout, 4)
        out_limit = min(out_limit, max(500, limit * 8))
        endpoint_timeout = 2
        max_total_seconds = 2.8
        max_distance = min(max_distance, 7000)

    query = f"""
[out:json][timeout:{overpass_timeout}];
(
  nwr(around:{radius_meters},{lat},{lng})["name"];
  nwr(around:{radius_meters},{lat},{lng})["brand"];
  nwr(around:{radius_meters},{lat},{lng})["operator"];
  nwr(around:{radius_meters},{lat},{lng})["amenity"];
  nwr(around:{radius_meters},{lat},{lng})["shop"];
  nwr(around:{radius_meters},{lat},{lng})["office"];
);
out center {out_limit};
"""
    endpoints = (
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
    ) if fast_mode else (
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    )
    data = None
    started_at = time.monotonic()
    for endpoint in endpoints:
        if time.monotonic() - started_at > max_total_seconds:
            break
        try:
            data = _http_post_form_json(endpoint, {'data': query}, timeout_seconds=endpoint_timeout)
            break
        except Exception:
            continue

    if not data:
        return []

    places: list[dict[str, float | str]] = []
    seen_names: set[str] = set()
    for element in data.get('elements', []):
        tags = element.get('tags') or {}
        place_name = str(tags.get('name') or tags.get('brand') or tags.get('operator') or '').strip()
        if not place_name or not is_likely_business_name(place_name):
            continue

        point_lat = element.get('lat')
        point_lng = element.get('lon')
        center = element.get('center') or {}
        if point_lat is None or point_lng is None:
            point_lat = center.get('lat')
            point_lng = center.get('lon')
        if point_lat is None or point_lng is None:
            continue

        try:
            point_lat = float(point_lat)
            point_lng = float(point_lng)
        except (TypeError, ValueError):
            continue

        normalized = normalize_text(place_name)
        if normalized in seen_names:
            continue

        has_business_tag = any((
            tags.get('shop'),
            tags.get('amenity'),
            tags.get('office'),
            tags.get('brand'),
            tags.get('operator'),
            tags.get('craft'),
            tags.get('industrial'),
            tags.get('commercial'),
            tags.get('retail'),
            tags.get('landuse') == 'industrial',
            tags.get('building') in {'industrial', 'commercial', 'retail'},
        ))
        is_mostly_infrastructure = any((
            tags.get('highway'),
            tags.get('railway'),
            tags.get('route'),
            tags.get('boundary'),
            tags.get('admin_level'),
            tags.get('place'),
            tags.get('waterway'),
            tags.get('aeroway'),
        ))
        if not has_business_tag and is_mostly_infrastructure:
            continue

        distance = get_distance_meters(lat, lng, point_lat, point_lng)
        if distance > max_distance:
            continue

        seen_names.add(normalized)
        score = distance + (0 if has_business_tag else 800) + (120 if tags.get('building') else 0)
        places.append({
            'name': place_name,
            'lat': point_lat,
            'lng': point_lng,
            'distance': round(distance, 2),
            'score': round(score, 2),
            'source': 'overpass',
        })

    places.sort(key=lambda item: float(item['score']))
    return places


def fetch_nominatim_places(lat: float, lng: float, limit: int, fast_mode: bool = False) -> list[dict[str, float | str]]:
    if fast_mode:
        delta = 0.05
        max_total_seconds = 2.6
        per_query_limit = '8'
        max_results = 36
    elif limit <= 100:
        delta = 0.06
        max_total_seconds = 4.0
        per_query_limit = '18'
        max_results = 80
    else:
        delta = 0.09
        max_total_seconds = 8.0
        per_query_limit = '25'
        max_results = min(max(limit + 30, 100), 180)
    left = lng - delta
    right = lng + delta
    top = lat + delta
    bottom = lat - delta
    queries = (
        'parque industrial',
        'industrial',
        'fabrica',
        'empresa',
        'planta',
        'manufactura',
        'almacen',
        'logistica',
        'taller',
        'maquiladora',
        'automotriz',
        'proveedor',
        'gasolinera',
        'restaurant',
        'hotel',
        'hospital',
        'farmacia',
        'banco',
        'supermercado',
        'tienda',
    )
    if fast_mode:
        queries = queries[:8]
    places: list[dict[str, float | str]] = []
    seen_names: set[str] = set()
    started_at = time.monotonic()

    for query in queries:
        if time.monotonic() - started_at > max_total_seconds:
            break
        params = {
            'format': 'jsonv2',
            'limit': per_query_limit,
            'accept-language': 'es',
            'bounded': '1',
            'viewbox': f'{left},{top},{right},{bottom}',
            'q': query,
        }
        url = f"https://nominatim.openstreetmap.org/search?{urlencode(params)}"
        try:
            data = _http_get_json(url, timeout_seconds=3)
        except Exception:
            continue

        for item in data:
            display_name = str(item.get('display_name') or '')
            place_name = display_name.split(',')[0].strip()
            if not place_name or not is_likely_business_name(place_name):
                continue
            normalized = normalize_text(place_name)
            if normalized in seen_names:
                continue
            seen_names.add(normalized)
            try:
                point_lat = float(item.get('lat'))
                point_lng = float(item.get('lon'))
            except (TypeError, ValueError):
                continue
            distance = get_distance_meters(lat, lng, point_lat, point_lng)
            if distance > 8000:
                continue
            places.append({
                'name': place_name,
                'lat': point_lat,
                'lng': point_lng,
                'distance': round(distance, 2),
                'score': round(distance + 1200, 2),
                'source': 'nominatim',
            })
        if len(places) >= max_results:
            break

    places.sort(key=lambda item: float(item['score']))
    return places


def fetch_overpass_bbox_labels(
    north: float,
    south: float,
    east: float,
    west: float,
    limit: int,
    query_text: str = '',
    center_lat: float | None = None,
    center_lng: float | None = None,
) -> list[dict[str, float | str]]:
    if not (north > south and east > west):
        return []
    safe_limit = max(1, min(int(limit), 220))
    bbox_height = abs(north - south)
    bbox_width = abs(east - west)
    is_tight_box = bbox_height < 0.35 and bbox_width < 0.35
    out_limit = min(2600, max(700, safe_limit * 14))
    timeout_value = 5 if is_tight_box else 6
    query = f"""
[out:json][timeout:{timeout_value}];
(
  nwr({south},{west},{north},{east})["name"];
  nwr({south},{west},{north},{east})["brand"];
  nwr({south},{west},{north},{east})["operator"];
);
out center {out_limit};
"""
    endpoints = (
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass-api.de/api/interpreter',
    )
    data = None
    started_at = time.monotonic()
    max_total_seconds = 4.8 if is_tight_box else 6.8
    for endpoint in endpoints:
        if time.monotonic() - started_at > max_total_seconds:
            break
        try:
            data = _http_post_form_json(endpoint, {'data': query}, timeout_seconds=3 if is_tight_box else 4)
            break
        except Exception:
            continue
    if not data:
        return []

    normalized_query = normalize_text(query_text)
    tokens = [token for token in normalized_query.split() if token]
    has_query_filter = bool(tokens) and normalized_query not in {'__any__', '*'}
    anchor_lat = center_lat if center_lat is not None else (north + south) / 2
    anchor_lng = center_lng if center_lng is not None else (east + west) / 2

    places: list[dict[str, float | str]] = []
    seen: set[str] = set()
    for element in data.get('elements', []):
        tags = element.get('tags') or {}
        name = str(tags.get('name') or tags.get('brand') or tags.get('operator') or '').strip()
        if not name:
            continue
        normalized_name = normalize_text(name)
        if has_query_filter and not all(token in normalized_name for token in tokens):
            continue
        lat_value = element.get('lat')
        lng_value = element.get('lon')
        center = element.get('center') or {}
        if lat_value is None or lng_value is None:
            lat_value = center.get('lat')
            lng_value = center.get('lon')
        if lat_value is None or lng_value is None:
            continue
        try:
            lat_value = float(lat_value)
            lng_value = float(lng_value)
        except (TypeError, ValueError):
            continue
        if not (south <= lat_value <= north and west <= lng_value <= east):
            continue

        key = f'{normalized_name}:{round(lat_value, 5)}:{round(lng_value, 5)}'
        if key in seen:
            continue
        seen.add(key)

        has_business_tag = any((
            tags.get('shop'),
            tags.get('amenity'),
            tags.get('office'),
            tags.get('brand'),
            tags.get('operator'),
            tags.get('craft'),
            tags.get('industrial'),
            tags.get('commercial'),
            tags.get('retail'),
            tags.get('landuse') == 'industrial',
            tags.get('building') in {'industrial', 'commercial', 'retail'},
        ))
        is_mostly_infrastructure = any((
            tags.get('highway'),
            tags.get('railway'),
            tags.get('route'),
            tags.get('boundary'),
            tags.get('admin_level'),
            tags.get('place'),
            tags.get('waterway'),
            tags.get('aeroway'),
        ))
        distance = get_distance_meters(anchor_lat, anchor_lng, lat_value, lng_value)
        score = distance + (0 if has_business_tag else 380) + (120 if is_mostly_infrastructure else 0)
        places.append({
            'name': name,
            'lat': lat_value,
            'lng': lng_value,
            'distance': round(distance, 2),
            'score': round(score, 2),
            'source': 'overpass-bbox',
        })

    places.sort(key=lambda item: float(item['score']))
    return places[:safe_limit]


def get_nearby_places(lat: float, lng: float, limit: int, *, mode: str = 'full') -> list[dict[str, float | str]]:
    safe_limit = max(1, min(int(limit), NEARBY_PLACES_MAX_LIMIT))
    safe_mode = 'quick' if str(mode or '').strip().lower() == 'quick' else 'full'
    cache_key = f'{round(lat, 3)}:{round(lng, 3)}:{safe_limit}:{safe_mode}'
    now = time.time()
    cache_entry = NEARBY_PLACES_CACHE.get(cache_key)
    if cache_entry:
        cached_places = cache_entry[1]
        ttl = NEARBY_PLACES_CACHE_TTL_SECONDS if cached_places else NEARBY_PLACES_EMPTY_CACHE_TTL_SECONDS
        if now - cache_entry[0] < ttl:
            return cached_places

    fast_mode = safe_mode == 'quick'
    overpass_places = fetch_overpass_places(lat, lng, safe_limit, fast_mode=fast_mode)
    # Keep quick mode responsive, but still provide a light fallback when Overpass is sparse.
    nominatim_places = (
        fetch_nominatim_places(lat, lng, min(safe_limit, 72), fast_mode=True) if fast_mode and len(overpass_places) < 10
        else fetch_nominatim_places(lat, lng, safe_limit, fast_mode=False) if len(overpass_places) < max(12, min(safe_limit, 30)) else []
    )
    merged = overpass_places + nominatim_places
    deduped: list[dict[str, float | str]] = []
    seen_names: set[str] = set()
    for place in sorted(merged, key=lambda item: float(item['score'])):
        normalized = normalize_text(str(place['name']))
        if not normalized or normalized in seen_names:
            continue
        seen_names.add(normalized)
        deduped.append(place)
        if len(deduped) >= safe_limit:
            break

    NEARBY_PLACES_CACHE[cache_key] = (now, deduped)
    return deduped


def search_geocode_places(
    query: str,
    limit: int = 8,
    near_lat: float | None = None,
    near_lng: float | None = None,
    north: float | None = None,
    south: float | None = None,
    east: float | None = None,
    west: float | None = None,
    bounded: bool = False,
) -> list[dict[str, float | str]]:
    safe_query = str(query or '').strip()
    normalized_query = normalize_text(safe_query)
    is_any_query = normalized_query in {'__any__', '*'}
    if len(safe_query) < 3 and not is_any_query:
        return []
    safe_limit = max(1, min(int(limit), 80))
    params = {
        'format': 'jsonv2',
        'addressdetails': '1',
        'accept-language': 'es',
        'limit': str(safe_limit),
        'q': safe_query,
    }
    has_bbox = (
        north is not None and south is not None and east is not None and west is not None
        and north > south and east > west
    )
    if has_bbox:
        params['viewbox'] = f'{west},{north},{east},{south}'
        if bounded:
            params['bounded'] = '1'
    elif near_lat is not None and near_lng is not None:
        delta = 0.35
        left = near_lng - delta
        right = near_lng + delta
        top = near_lat + delta
        bottom = near_lat - delta
        # viewbox as hint to prioritize nearby matches without hard bounding.
        params['viewbox'] = f'{left},{top},{right},{bottom}'
    if has_bbox and bounded and is_any_query:
        overpass_labels = fetch_overpass_bbox_labels(
            north=north,
            south=south,
            east=east,
            west=west,
            limit=safe_limit,
            query_text='',
            center_lat=near_lat,
            center_lng=near_lng,
        )
        if overpass_labels:
            return overpass_labels
        if near_lat is not None and near_lng is not None:
            nominatim_fallback = fetch_nominatim_places(near_lat, near_lng, safe_limit, fast_mode=True)
            if has_bbox:
                nominatim_fallback = [
                    place for place in nominatim_fallback
                    if south - 0.01 <= float(place.get('lat') or 0) <= north + 0.01
                    and west - 0.01 <= float(place.get('lng') or 0) <= east + 0.01
                ]
            return nominatim_fallback[:safe_limit]
        return []

    url = f"https://nominatim.openstreetmap.org/search?{urlencode(params)}"
    data = _http_get_json(url, timeout_seconds=6)
    if not isinstance(data, list):
        data = []

    unique: dict[str, dict[str, float | str]] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        display_name = str(item.get('display_name') or '').strip()
        raw_name = str(item.get('name') or '').strip()
        name = raw_name or (display_name.split(',')[0].strip() if display_name else '')
        if not name:
            continue
        try:
            lat_value = float(item.get('lat'))
            lng_value = float(item.get('lon'))
        except (TypeError, ValueError):
            continue
        if not (isfinite(lat_value) and isfinite(lng_value)):
            continue
        key = f"{normalize_text(name)}:{round(lat_value, 5)}:{round(lng_value, 5)}"
        if key in unique:
            continue
        distance = (
            get_distance_meters(near_lat, near_lng, lat_value, lng_value)
            if near_lat is not None and near_lng is not None else -1
        )
        unique[key] = {
            'name': name,
            'address': display_name,
            'lat': lat_value,
            'lng': lng_value,
            'distance': round(distance, 2) if distance >= 0 else -1,
            'source': 'nominatim-search',
        }

    values = list(unique.values())
    values.sort(key=lambda value: float(value.get('distance', -1)) if float(value.get('distance', -1)) >= 0 else 9999999)
    if values:
        return values[:safe_limit]

    if has_bbox:
        fallback = fetch_overpass_bbox_labels(
            north=north,
            south=south,
            east=east,
            west=west,
            limit=safe_limit,
            query_text=safe_query,
            center_lat=near_lat,
            center_lng=near_lng,
        )
        if fallback:
            return fallback
    return []


def reverse_geocode_details(lat: float, lng: float, include_nearby: bool = False) -> dict[str, object]:
    data = None
    # Keep reverse-geocode fast: try only a couple zoom levels with short timeouts.
    for zoom in ('18', '16'):
        params = {
            'format': 'jsonv2',
            'addressdetails': '1',
            'accept-language': 'es',
            'zoom': zoom,
            'lat': str(lat),
            'lon': str(lng),
        }
        url = f"https://nominatim.openstreetmap.org/reverse?{urlencode(params)}"
        try:
            candidate = _http_get_json(url, timeout_seconds=4)
            if candidate:
                data = candidate
                break
        except Exception:
            continue

    address = (data or {}).get('address') or {}
    display_name = str((data or {}).get('display_name') or '').strip()
    display_parts = to_unique_text_parts(display_name.split(','))
    display_main = display_parts[0] if display_parts else ''

    road = (
        str(address.get('road') or '')
        or str(address.get('pedestrian') or '')
        or str(address.get('footway') or '')
        or str(address.get('path') or '')
        or str(address.get('highway') or '')
    ).strip()
    industrial = str(address.get('industrial') or address.get('commercial') or '').strip()
    neighborhood = str(address.get('neighbourhood') or address.get('suburb') or address.get('quarter') or address.get('hamlet') or '').strip()
    city = str(address.get('city') or address.get('town') or address.get('village') or address.get('municipality') or address.get('county') or '').strip()
    state = str(address.get('state') or '').strip()
    postcode = str(address.get('postcode') or '').strip()
    country = str(address.get('country') or '').strip()

    nearby_places = get_nearby_places(lat, lng, NEARBY_PLACES_MAX_LIMIT) if include_nearby else []
    nearby_names = [str(place.get('name') or '').strip() for place in nearby_places if str(place.get('name') or '').strip()]
    nearby_poi = ''
    if include_nearby:
        for place in nearby_places:
            distance = float(place.get('distance') or 999999)
            name = str(place.get('name') or '').strip()
            if name and distance <= 500:
                nearby_poi = name
                break

    generic_tokens = {normalize_text(value) for value in to_unique_text_parts([neighborhood, city, state, country])}
    poi_candidates = to_unique_text_parts([
        str((data or {}).get('name') or '').strip(),
        str(address.get('amenity') or '').strip(),
        str(address.get('shop') or '').strip(),
        str(address.get('office') or '').strip(),
        str(address.get('tourism') or '').strip(),
        str(address.get('leisure') or '').strip(),
        str(address.get('retail') or '').strip(),
        str(address.get('building') or '').strip(),
        display_main,
        nearby_poi,
    ])
    poi = ''
    for candidate in poi_candidates:
        normalized = normalize_text(candidate)
        if is_likely_business_name(candidate) and normalized not in generic_tokens:
            poi = candidate
            break

    formatted_address = (
        join_unique_text_parts([poi, road, industrial, neighborhood, city, state, postcode, country])
        or ', '.join(display_parts[:7])
        or join_unique_text_parts([road, industrial, city, state, country])
        or 'Direccion no disponible en este punto.'
    )

    try:
        reverse_lat = float(data.get('lat')) if data and str(data.get('lat') or '').strip() else lat
    except (TypeError, ValueError):
        reverse_lat = lat
    try:
        reverse_lng = float(data.get('lon')) if data and str(data.get('lon') or '').strip() else lng
    except (TypeError, ValueError):
        reverse_lng = lng
    reverse_distance = get_distance_meters(lat, lng, reverse_lat, reverse_lng)
    if reverse_distance > 1500:
        # Protect against occasional geocoder mismatch by keeping user-selected coordinates.
        reverse_lat = lat
        reverse_lng = lng

    return {
        'formatted_address': formatted_address,
        'lat': round(reverse_lat, 7),
        'lng': round(reverse_lng, 7),
        'details': {
            'poi': poi,
            'road': road,
            'industrial': industrial,
            'neighborhood': neighborhood,
            'city': city,
            'state': state,
            'postcode': postcode,
            'country': country,
        },
        'nearby_places': nearby_names[:NEARBY_PLACES_MAX_LIMIT],
        'nearby_points': nearby_places[:NEARBY_PLACES_MAX_LIMIT] if include_nearby else [],
    }


class HealthCheckView(APIView):
    permission_classes = []

    def get(self, request):
        return Response({'status': 'ok'})


class NearbyPlacesView(APIView):
    permission_classes = []

    def get(self, request):
        raw_lat = request.query_params.get('lat')
        raw_lng = request.query_params.get('lng')
        raw_limit = request.query_params.get('limit', '18')
        raw_mode = str(request.query_params.get('mode', 'full') or 'full').strip().lower()

        try:
            lat = float(raw_lat)
            lng = float(raw_lng)
            limit = max(1, min(int(raw_limit), NEARBY_PLACES_MAX_LIMIT))
        except (TypeError, ValueError):
            return Response({'detail': 'Parámetros inválidos. Usa lat, lng y limit numéricos.'}, status=400)

        mode = 'quick' if raw_mode == 'quick' else 'full'
        if mode == 'quick':
            limit = min(limit, 140)
        places = get_nearby_places(lat=lat, lng=lng, limit=limit, mode=mode)
        return Response({'places': places})


class GeocodeSearchView(APIView):
    permission_classes = []

    def get(self, request):
        raw_query = str(request.query_params.get('q') or '').strip()
        raw_limit = request.query_params.get('limit', '8')
        raw_near_lat = request.query_params.get('near_lat')
        raw_near_lng = request.query_params.get('near_lng')
        raw_north = request.query_params.get('north')
        raw_south = request.query_params.get('south')
        raw_east = request.query_params.get('east')
        raw_west = request.query_params.get('west')
        raw_bounded = str(request.query_params.get('bounded', '0')).strip().lower()
        bounded = raw_bounded in {'1', 'true', 'yes', 'si'}
        if len(raw_query) < 3:
            return Response({'results': []})

        try:
            limit = max(1, min(int(raw_limit), 80))
        except (TypeError, ValueError):
            limit = 8

        near_lat: float | None = None
        near_lng: float | None = None
        north: float | None = None
        south: float | None = None
        east: float | None = None
        west: float | None = None
        try:
            if raw_near_lat is not None and raw_near_lng is not None:
                near_lat = float(raw_near_lat)
                near_lng = float(raw_near_lng)
        except (TypeError, ValueError):
            near_lat = None
            near_lng = None
        try:
            if raw_north is not None and raw_south is not None and raw_east is not None and raw_west is not None:
                north = float(raw_north)
                south = float(raw_south)
                east = float(raw_east)
                west = float(raw_west)
        except (TypeError, ValueError):
            north = None
            south = None
            east = None
            west = None

        try:
            results = search_geocode_places(
                raw_query,
                limit=limit,
                near_lat=near_lat,
                near_lng=near_lng,
                north=north,
                south=south,
                east=east,
                west=west,
                bounded=bounded,
            )
        except Exception:
            results = []
        return Response({'results': results})


class ReverseGeocodeView(APIView):
    permission_classes = []

    def get(self, request):
        raw_lat = request.query_params.get('lat')
        raw_lng = request.query_params.get('lng')
        include_nearby_raw = str(request.query_params.get('include_nearby', '0')).strip().lower()
        include_nearby = include_nearby_raw in {'1', 'true', 'yes', 'si'}
        try:
            lat = float(raw_lat)
            lng = float(raw_lng)
        except (TypeError, ValueError):
            return Response({'detail': 'Parametros invalidos. Usa lat y lng numericos.'}, status=400)

        payload = reverse_geocode_details(lat=lat, lng=lng, include_nearby=include_nearby)
        return Response(payload)


class DashboardMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, 'role', '')

        privileged_viatico_roles = {Role.ADMIN, Role.FINANCE, Role.PM}
        can_view_flotilla = role in {Role.ADMIN, Role.FINANCE}
        can_view_amex = role in {Role.ADMIN, Role.FINANCE}

        viaticos_queryset = Viatico.objects.all()
        if role not in privileged_viatico_roles:
            viaticos_queryset = viaticos_queryset.filter(user=user)

        viaticos_activos = viaticos_queryset.filter(
            status__in=['aprobado', 'dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion']
        ).count()
        viaticos_pendientes = viaticos_queryset.filter(status='pendiente').count()
        total_dispersado = viaticos_queryset.exclude(monto_dispersado__isnull=True).aggregate(
            total=models.Sum('monto_dispersado')
        )
        total_recuperar = viaticos_queryset.exclude(saldo_restante__isnull=True).aggregate(
            total=models.Sum('saldo_restante')
        )

        facturas_queryset = Factura.objects.all()
        if role not in privileged_viatico_roles:
            facturas_queryset = facturas_queryset.filter(user=user)
        facturas_pendientes = facturas_queryset.filter(status='pendiente').count()

        if role in privileged_viatico_roles:
            alertas_conciliacion = AlertaConciliacion.objects.count()
        else:
            alertas_conciliacion = (
                AlertaConciliacion.objects.filter(
                    models.Q(factura__user=user) | models.Q(consumo__user=user)
                )
                .distinct()
                .count()
            )

        vehiculos_disponibles = Vehicle.objects.filter(status='disponible').count() if can_view_flotilla else 0
        vehiculos_asignados = Vehicle.objects.filter(status='asignado').count() if can_view_flotilla else 0
        alertas_mantenimiento = VehicleAlert.objects.filter(atendido=False).count() if can_view_flotilla else 0
        gastos_amex_pendientes = TicketAMEX.objects.filter(matched=False).count() if can_view_amex else 0

        return Response({
            'viaticosActivos': viaticos_activos,
            'viaticosAprobacionPendiente': viaticos_pendientes,
            'totalDispersado': float(total_dispersado['total'] or 0),
            'totalRecuperar': float(total_recuperar['total'] or 0),
            'facturasPendientes': facturas_pendientes,
            'alertasConciliacion': alertas_conciliacion,
            'vehiculosDisponibles': vehiculos_disponibles,
            'vehiculosAsignados': vehiculos_asignados,
            'alertasMantenimiento': alertas_mantenimiento,
            'gastosAMEXPendientes': gastos_amex_pendientes,
        })
