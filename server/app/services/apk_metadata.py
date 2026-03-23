from pathlib import Path

from pyaxmlparser import APK


def extract_apk_version_info(apk_path: Path) -> tuple[str, int]:
    """Извлечь versionName и versionCode из APK файла."""
    apk = APK(str(apk_path))

    version_name = (apk.version_name or apk.get_androidversion_name() or "").strip()
    version_code_raw = apk.version_code or apk.get_androidversion_code()

    if not version_name:
        raise ValueError("Не удалось определить versionName в AndroidManifest.xml")

    if version_code_raw in (None, ""):
        raise ValueError("Не удалось определить versionCode в AndroidManifest.xml")

    try:
        version_code = int(str(version_code_raw).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError("Некорректный versionCode в AndroidManifest.xml") from exc

    if version_code <= 0:
        raise ValueError("versionCode должен быть положительным числом")

    return version_name, version_code
