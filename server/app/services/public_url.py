"""Адрес портала снаружи — для ссылок клиенту и QR в PDF.

PUBLIC_BASE_URL из настроек, а без него — из запроса: за Caddy это Host
клиента и X-Forwarded-Proto. Ссылка строится из запроса того, кто её
получает, поэтому подменённый заголовок испортит только его собственный
ответ.
"""

from fastapi import Request

from app.config import settings


def public_base_url(request: Request) -> str:
    configured = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    if configured:
        return configured
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{proto.split(',')[0].strip()}://{host}"
