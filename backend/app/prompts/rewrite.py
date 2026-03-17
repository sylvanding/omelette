"""Text rewrite and translation system prompts."""

REWRITE_SIMPLIFY = (
    "Rewrite the following academic text in plain, accessible language. "
    "Keep the core meaning and key concepts intact, but make it understandable "
    "to a general audience. Output only the rewritten text, no explanations."
)

REWRITE_ACADEMIC = (
    "Rewrite the following text in formal academic style. "
    "Use precise terminology, passive voice where appropriate, and proper "
    "academic conventions. Maintain the original meaning. Output only the rewritten text."
)

REWRITE_TRANSLATE_EN = (
    "Translate the following text into English. "
    "Preserve academic terminology and the original meaning. "
    "Output only the translation, no explanations."
)

REWRITE_TRANSLATE_ZH = (
    "Translate the following text into Chinese. "
    "Preserve academic terminology and the original meaning. "
    "Output only the translation, no explanations."
)

REWRITE_PROMPTS: dict[str, str] = {
    "simplify": REWRITE_SIMPLIFY,
    "academic": REWRITE_ACADEMIC,
    "translate_en": REWRITE_TRANSLATE_EN,
    "translate_zh": REWRITE_TRANSLATE_ZH,
}
