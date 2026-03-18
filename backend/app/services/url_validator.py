"""URL and DOI validation utilities for SSRF prevention."""

import ipaddress
import re
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset(
    {
        "metadata.google.internal",
        "metadata.amazonaws.com",
    }
)

DOI_PATTERN = re.compile(r"^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$")


def validate_url_safe(url: str) -> str:
    """Validate URL is safe for server-side fetch.

    Blocks private IPs, loopback, link-local, reserved, multicast,
    and known cloud metadata hostnames.

    Raises ValueError if the URL is unsafe.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: no hostname")

    if hostname in BLOCKED_HOSTNAMES:
        raise ValueError(f"Blocked hostname: {hostname}")

    try:
        addrinfos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise ValueError(f"DNS resolution failed for {hostname}: {e}") from e

    for info in addrinfos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError(f"Blocked: {hostname} resolves to private/reserved address {ip_str}")

    return url


def validate_doi(doi: str) -> str:
    """Validate DOI format. Raises ValueError if invalid."""
    if not DOI_PATTERN.match(doi):
        raise ValueError(f"Invalid DOI format: {doi}")
    return doi
