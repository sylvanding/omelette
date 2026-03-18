"""Tests for LLMConfigResolver — ensures consistent LLM config resolution."""

import pytest

from app.config import settings
from app.services.llm_config_resolver import LLMConfigResolver


class TestFromEnv:
    def test_default_uses_mock(self):
        config = LLMConfigResolver.from_env()
        assert config.provider == settings.llm_provider

    def test_override_provider(self):
        config = LLMConfigResolver.from_env(provider="volcengine")
        assert config.provider == "volcengine"
        assert config.model == settings.volcengine_model
        assert config.base_url == settings.volcengine_base_url

    def test_override_model(self):
        config = LLMConfigResolver.from_env(provider="openai", model="gpt-4o")
        assert config.model == "gpt-4o"
        assert config.provider == "openai"

    def test_override_temperature_and_max_tokens(self):
        config = LLMConfigResolver.from_env(temperature=0.1, max_tokens=100)
        assert config.temperature == 0.1
        assert config.max_tokens == 100

    def test_defaults_from_settings(self):
        config = LLMConfigResolver.from_env()
        assert config.temperature == settings.llm_temperature
        assert config.max_tokens == settings.llm_max_tokens

    @pytest.mark.parametrize(
        "provider,expected_base_url_attr",
        [
            ("openai", ""),
            ("anthropic", ""),
            ("aliyun", "aliyun_base_url"),
            ("volcengine", "volcengine_base_url"),
            ("ollama", "ollama_base_url"),
        ],
    )
    def test_provider_base_urls(self, provider, expected_base_url_attr):
        config = LLMConfigResolver.from_env(provider=provider)
        expected = getattr(settings, expected_base_url_attr, "") if expected_base_url_attr else ""
        assert config.base_url == expected

    def test_unknown_provider_returns_empty_fields(self):
        config = LLMConfigResolver.from_env(provider="nonexistent")
        assert config.provider == "nonexistent"
        assert config.api_key == ""
        assert config.base_url == ""
        assert config.model == "mock-model"

    def test_mock_provider(self):
        config = LLMConfigResolver.from_env(provider="mock")
        assert config.provider == "mock"
        assert config.api_key == ""
        assert config.model == "mock-model"


class TestFromMerged:
    def _make_merged(self, **overrides):
        defaults = {
            "llm_provider": "mock",
            "llm_model": "",
            "openai_api_key": "",
            "openai_model": "",
            "anthropic_api_key": "",
            "anthropic_model": "",
            "aliyun_api_key": "",
            "aliyun_base_url": "",
            "aliyun_model": "",
            "volcengine_api_key": "test-key",
            "volcengine_base_url": "https://ark.test",
            "volcengine_model": "doubao-test",
            "ollama_base_url": "",
            "ollama_model": "",
        }
        defaults.update(overrides)

        class FakeMerged:
            pass

        obj = FakeMerged()
        for k, v in defaults.items():
            setattr(obj, k, v)
        return obj

    def test_basic_mock_provider(self):
        merged = self._make_merged()
        config = LLMConfigResolver.from_merged(merged)
        assert config.provider == "mock"
        assert config.model == "mock-model"

    def test_volcengine_from_merged(self):
        merged = self._make_merged(llm_provider="volcengine")
        config = LLMConfigResolver.from_merged(merged)
        assert config.provider == "volcengine"
        assert config.api_key == "test-key"
        assert config.base_url == "https://ark.test"
        assert config.model == "doubao-test"

    def test_llm_model_override(self):
        merged = self._make_merged(llm_provider="volcengine", llm_model="custom-model")
        config = LLMConfigResolver.from_merged(merged)
        assert config.model == "custom-model"

    def test_temperature_override(self):
        merged = self._make_merged()
        config = LLMConfigResolver.from_merged(merged, temperature=0.2)
        assert config.temperature == 0.2

    def test_max_tokens_override(self):
        merged = self._make_merged()
        config = LLMConfigResolver.from_merged(merged, max_tokens=256)
        assert config.max_tokens == 256
