from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
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


def fetch_overpass_places(lat: float, lng: float) -> list[dict[str, float | str]]:
    radius_meters = 4500
    query = f"""
[out:json][timeout:10];
(
  nwr(around:{radius_meters},{lat},{lng})["name"];
  nwr(around:{radius_meters},{lat},{lng})["brand"];
  nwr(around:{radius_meters},{lat},{lng})["operator"];
  nwr(around:{radius_meters},{lat},{lng})["amenity"];
  nwr(around:{radius_meters},{lat},{lng})["shop"];
  nwr(around:{radius_meters},{lat},{lng})["office"];
);
out center 1200;
"""
    endpoints = (
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    )
    data = None
    for endpoint in endpoints:
        try:
            data = _http_post_form_json(endpoint, {'data': query}, timeout_seconds=12)
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
        if distance > 6000:
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


def fetch_nominatim_places(lat: float, lng: float) -> list[dict[str, float | str]]:
    delta = 0.06
    left = lng - delta
    right = lng + delta
    top = lat + delta
    bottom = lat - delta
    queries = ('parque industrial', 'industrial', 'fabrica', 'empresa', 'planta')
    places: list[dict[str, float | str]] = []
    seen_names: set[str] = set()

    for query in queries:
        params = {
            'format': 'jsonv2',
            'limit': '15',
            'accept-language': 'es',
            'bounded': '1',
            'viewbox': f'{left},{top},{right},{bottom}',
            'q': query,
        }
        url = f"https://nominatim.openstreetmap.org/search?{urlencode(params)}"
        try:
            data = _http_get_json(url, timeout_seconds=10)
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

    places.sort(key=lambda item: float(item['score']))
    return places


def get_nearby_places(lat: float, lng: float, limit: int) -> list[dict[str, float | str]]:
    cache_key = f'{round(lat, 4)}:{round(lng, 4)}:{limit}'
    now = time.time()
    cache_entry = NEARBY_PLACES_CACHE.get(cache_key)
    if cache_entry and now - cache_entry[0] < NEARBY_PLACES_CACHE_TTL_SECONDS:
        return cache_entry[1]

    overpass_places = fetch_overpass_places(lat, lng)
    # Skip expensive fallback when Overpass already returns enough nearby business names.
    nominatim_places = fetch_nominatim_places(lat, lng) if len(overpass_places) < max(8, min(limit, 20)) else []
    merged = overpass_places + nominatim_places
    deduped: list[dict[str, float | str]] = []
    seen_names: set[str] = set()
    for place in sorted(merged, key=lambda item: float(item['score'])):
        normalized = normalize_text(str(place['name']))
        if not normalized or normalized in seen_names:
            continue
        seen_names.add(normalized)
        deduped.append(place)
        if len(deduped) >= limit:
            break

    NEARBY_PLACES_CACHE[cache_key] = (now, deduped)
    return deduped


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

        try:
            lat = float(raw_lat)
            lng = float(raw_lng)
            limit = max(1, min(int(raw_limit), 50))
        except (TypeError, ValueError):
            return Response({'detail': 'Parámetros inválidos. Usa lat, lng y limit numéricos.'}, status=400)

        places = get_nearby_places(lat=lat, lng=lng, limit=limit)
        return Response({'places': places})


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
