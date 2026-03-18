"""Tests for app.services.url_validator."""

import pytest

from app.services.url_validator import validate_doi, validate_url_safe


def test_valid_https_url():
    result = validate_url_safe("https://8.8.8.8/")
    assert result == "https://8.8.8.8/"


def test_valid_http_url():
    result = validate_url_safe("http://1.1.1.1/")
    assert result == "http://1.1.1.1/"


def test_ftp_scheme_rejected():
    with pytest.raises(ValueError, match="Unsupported scheme: ftp"):
        validate_url_safe("ftp://example.com/file")


def test_no_scheme_rejected():
    with pytest.raises(ValueError, match="Unsupported scheme"):
        validate_url_safe("example.com/path")


def test_private_ip_rejected():
    with pytest.raises(ValueError, match="Blocked.*private"):
        validate_url_safe("http://192.168.1.1/")


def test_loopback_rejected():
    with pytest.raises(ValueError, match="Blocked.*private"):
        validate_url_safe("http://127.0.0.1/")


def test_metadata_google_rejected():
    with pytest.raises(ValueError, match="Blocked hostname"):
        validate_url_safe("http://metadata.google.internal/")


def test_metadata_aws_rejected():
    with pytest.raises(ValueError, match="Blocked hostname"):
        validate_url_safe("http://metadata.amazonaws.com/")


def test_valid_doi():
    result = validate_doi("10.1038/nature12373")
    assert result == "10.1038/nature12373"


def test_valid_doi_with_special_chars():
    result = validate_doi("10.1000/xyz123")
    assert result == "10.1000/xyz123"


def test_invalid_doi_no_prefix():
    with pytest.raises(ValueError, match="Invalid DOI format"):
        validate_doi("not-a-doi")


def test_invalid_doi_wrong_format():
    with pytest.raises(ValueError, match="Invalid DOI format"):
        validate_doi("11.1234/abc")
