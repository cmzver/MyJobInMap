"""
Address Parser Service
======================
Парсинг полных адресов на составные части и наоборот.

Примеры входных данных:
- "Ленинский пр. , д. 82, корп. 3, СПб"
- "г. Санкт-Петербург, ул. Невский проспект, д. 1"
- "Центральная ул., д.3, корп. 1, Лен. обл. гп. Новоселье"
- "Невская, д. 9, г.п. Новоселье" — улица без типа
- "Замковая ул., 1" — дом без «д.»

Адрес режется по запятым, и каждая часть разбирается сама по себе: регион,
населённый пункт, улица, дом, корпус, подъезд. Улица без типа и посёлок без
«г.п.» узнаются по месту: улица идёт до номера дома, посёлок — после.
"""

import re
from dataclasses import dataclass
from typing import FrozenSet, List, Optional, Tuple


@dataclass
class ParsedAddress:
    """Распарсенный адрес."""

    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    corpus: Optional[str] = None
    entrance: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "city": self.city,
            "street": self.street,
            "building": self.building,
            "corpus": self.corpus,
            "entrance": self.entrance,
        }


# Словарь сокращений городов
CITY_ALIASES = {
    "спб": "Санкт-Петербург",
    "санкт-петербург": "Санкт-Петербург",
    "с.-петербург": "Санкт-Петербург",
    "с-петербург": "Санкт-Петербург",
    "питер": "Санкт-Петербург",
    "петербург": "Санкт-Петербург",
    "мск": "Москва",
    "москва": "Москва",
}

_LETTERS = "А-Яа-яЁёA-Za-z"
# Сокращения вроде «п.» ищутся только отдельным словом: иначе «п.» в «корп. 7»
# читается как подъезд.
_WORD_START = rf"(?<![{_LETTERS}])"
_WORD_END = rf"(?![{_LETTERS}])"

# Тип улицы → как он пишется в разобранном адресе. Проезд раньше проспекта,
# иначе «пр-д» прочитается как «пр.».
STREET_TYPES = [
    ("пр-д", r"проезд|пр-д\.?"),
    ("пр.", r"проспект|просп\.?|пр-кт\.?|пр-т\.?|пр\.?"),
    ("ул.", r"улица|ул\.?"),
    ("пер.", r"переулок|пер\.?"),
    ("ш.", r"шоссе|ш\.?"),
    ("б-р", r"бульвар|б-р\.?|бул\.?"),
    ("наб.", r"набережная|наб\.?"),
    ("пл.", r"площадь|пл\.?"),
    ("ал.", r"аллея|ал\.?"),
]
_STREET_TYPE_RE = re.compile(
    _WORD_START
    + "(?:"
    + "|".join(f"(?P<t{i}>{alts})" for i, (_, alts) in enumerate(STREET_TYPES))
    + ")"
    + _WORD_END,
    re.IGNORECASE,
)

# «82», «82А», «11/1»; буква после номера — литера, если за ней не идёт
# цифра («82к3» — это дом 82, корпус 3).
_HOUSE_NUMBER = (
    rf"\d{{1,4}}(?:[{_LETTERS}](?![\d{_LETTERS}]))?"
    rf"(?:/\d{{1,4}}(?:[{_LETTERS}](?![\d{_LETTERS}]))?)?"
)
_HOUSE_PATTERN = (
    rf"(?:(?:дом|д)\.?\s*)?(?P<house>{_HOUSE_NUMBER})"
    r"(?:\s*(?:корпус|корп|кор|к)\.?\s*(?P<corpus>\d+))?"
    r"(?:\s*(?:строение|стр)\.?\s*(?P<structure>\d+))?"
    rf"(?:\s*(?:литера?|лит)\.?\s*(?P<litera>[{_LETTERS}]){_WORD_END})?"
)
_HOUSE_RE = re.compile(_HOUSE_PATTERN, re.IGNORECASE)
# Дом в конце части без запятой: «ул. Ленина 10», «Невская д. 9».
_TRAILING_HOUSE_RE = re.compile(rf"^(?P<head>.*?\S)\s+{_HOUSE_PATTERN}$", re.IGNORECASE)
_CORPUS_RE = re.compile(r"(?:корпус|корп|кор|к)\.?\s*(\d+)", re.IGNORECASE)
_STRUCTURE_RE = re.compile(r"(?:строение|стр)\.?\s*(\d+)", re.IGNORECASE)
_LITERA_RE = re.compile(rf"(?:литера?|лит)\.?\s*([{_LETTERS}])", re.IGNORECASE)

_ENTRANCE_RES = [
    re.compile(
        rf"{_WORD_START}(?:подъезд|под\.|парадная|парад\.|п\.)\s*№?\s*(\d+)",
        re.IGNORECASE,
    ),
    re.compile(
        rf"{_WORD_START}(\d+)\s*(?:-?[йя])?\s*(?:подъезд|парадная){_WORD_END}",
        re.IGNORECASE,
    ),
    # «117 к1 п3» — «п» без точки только сразу после номера дома и в конце:
    # иначе это посёлок («п Новоселье»)
    re.compile(r"(?<=\d)\s*п\s*(\d{1,2})\s*$", re.IGNORECASE),
]
_APARTMENT_RE = re.compile(
    rf"{_WORD_START}(?:квартира|кв|офис|оф|помещение|пом)\.?\s*№?\s*\d+[{_LETTERS}]?",
    re.IGNORECASE,
)
# «Лен. обл.», «Ленинградская область», «Всеволожский р-н» — не город.
_REGION_RE = re.compile(
    rf"{_WORD_START}[{_LETTERS}\-]+(?:\.\s*|\s+)"
    rf"(?:область|обл\.?|край|республика|респ\.?|район|р-н\.?){_WORD_END}",
    re.IGNORECASE,
)
_SKIPPED_PART_RE = re.compile(r"(?:россия|рф|\d{6})", re.IGNORECASE)
_SETTLEMENT_RE = re.compile(
    r"^(?:г\.?\s*п|гп|пгт|рп|город|г|посёлок|поселок|пос|п|деревня|дер|д|село|с)"
    rf"(?:\.\s*|\s+)(?P<name>[{_LETTERS}][{_LETTERS}\-\s]*)$",
    re.IGNORECASE,
)
_CITY_ALIAS_PATTERN = (
    r"(?:санкт[\s-]петербург|с\.?-петербург|спб|петербург|питер|москва|мск)"
)
# Город без запятой перед улицей или после неё: «СПб ул. Ленина 1».
_LEADING_CITY_RE = re.compile(
    rf"^(?P<city>{_CITY_ALIAS_PATTERN}){_WORD_END}\.?\s+(?P<rest>\S.*)$",
    re.IGNORECASE,
)
_TRAILING_CITY_RE = re.compile(
    rf"^(?P<rest>.*\S)\s+(?P<city>{_CITY_ALIAS_PATTERN})\.?$", re.IGNORECASE
)
_PLACE_NAME_RE = re.compile(
    rf"[{_LETTERS}][{_LETTERS}\-]*(?:\s+[{_LETTERS}\-]+){{0,2}}"
)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" .-")


def _alias_city(text: str) -> Optional[str]:
    key = re.sub(r"\s+", "-", text.strip(" .").lower())
    return CITY_ALIASES.get(key)


def _normalize_city(name: str) -> str:
    name = _clean(name)
    alias = _alias_city(name)
    if alias:
        return alias
    return name if any(char.isupper() for char in name) else name.title()


def street_name(street: str) -> str:
    """Название улицы без типа: «Невская ул.» → «Невская»."""
    return _clean(_STREET_TYPE_RE.sub(" ", street))


def _typed_street(text: str) -> Optional[str]:
    types = [
        STREET_TYPES[int(m.lastgroup[1:])][0] for m in _STREET_TYPE_RE.finditer(text)
    ]
    if not types:
        return None
    name = street_name(text)
    if not name:
        return None
    # «ул. Невский проспект» — проспект, а не улица.
    specific = [kind for kind in types if kind != "ул."]
    return f"{name} {specific[0] if specific else 'ул.'}"


def _take_entrance(text: str) -> Tuple[str, Optional[str]]:
    for pattern in _ENTRANCE_RES:
        match = pattern.search(text)
        if match:
            return _clean(
                text[: match.start()] + " " + text[match.end() :]
            ), match.group(1)
    return text, None


def _apply_house(result: ParsedAddress, match: re.Match) -> None:
    result.building = match.group("house") + (match.group("litera") or "")
    if match.group("corpus"):
        result.corpus = match.group("corpus")
    elif match.group("structure"):
        result.corpus = f"стр.{match.group('structure')}"


def parse_address(full_address: str) -> ParsedAddress:
    """
    Парсит полный адрес и извлекает город, улицу, дом, корпус и подъезд.

    Args:
        full_address: Полный адрес в свободной форме

    Returns:
        ParsedAddress с извлечёнными компонентами
    """
    result = ParsedAddress()
    if not full_address:
        return result

    # Части, которые не распознались сами: голое название улицы или посёлка.
    untyped: List[Tuple[int, str]] = []
    building_index: Optional[int] = None

    for index, raw_part in enumerate(re.split(r"[,;\n]", full_address)):
        part = _clean(_REGION_RE.sub(" ", raw_part))
        if not part or _SKIPPED_PART_RE.fullmatch(part):
            continue

        part, entrance = _take_entrance(part)
        if entrance and result.entrance is None:
            result.entrance = entrance
        part = _clean(_APARTMENT_RE.sub(" ", part))
        if not part:
            continue

        alias = _alias_city(part)
        if alias:
            result.city = result.city or alias
            continue
        city_match = _LEADING_CITY_RE.match(part) or _TRAILING_CITY_RE.match(part)
        if city_match:
            result.city = result.city or _normalize_city(city_match.group("city"))
            part = city_match.group("rest")

        house_match = _HOUSE_RE.fullmatch(part)
        if house_match:
            if result.building is None:
                _apply_house(result, house_match)
                building_index = index
            continue
        corpus_match = _CORPUS_RE.fullmatch(part)
        if corpus_match:
            result.corpus = result.corpus or corpus_match.group(1)
            continue
        structure_match = _STRUCTURE_RE.fullmatch(part)
        if structure_match:
            result.corpus = result.corpus or f"стр.{structure_match.group(1)}"
            continue
        litera_match = _LITERA_RE.fullmatch(part)
        if litera_match:
            if result.building and result.building[-1].isdigit():
                result.building += litera_match.group(1)
            continue

        trailing_match = _TRAILING_HOUSE_RE.match(part)
        if trailing_match:
            if result.building is None:
                _apply_house(result, trailing_match)
                building_index = index
            part = trailing_match.group("head")

        street = _typed_street(part)
        if street:
            result.street = result.street or street
            continue
        settlement_match = _SETTLEMENT_RE.match(part)
        if settlement_match:
            result.city = result.city or _normalize_city(settlement_match.group("name"))
            continue
        untyped.append((index, part))

    # Улица идёт до номера дома: «Невская, д. 9, Новоселье»; если номер
    # в той же части — это она: «Новоселье, Невская 9».
    if result.street is None:
        untyped.sort(key=lambda item: item[0] != building_index)
        for position, (index, text) in enumerate(untyped):
            if building_index is None or index <= building_index:
                result.street = text
                del untyped[position]
                break
    # Из оставшихся город — последнее похожее на название места.
    if result.city is None:
        for _, text in reversed(untyped):
            if _PLACE_NAME_RE.fullmatch(text):
                result.city = _normalize_city(text)
                break

    return result


def _words(text: str) -> FrozenSet[str]:
    return frozenset(re.findall(rf"[{_LETTERS}\d\-]+", text.lower().replace("ё", "е")))


def street_key(street: Optional[str]) -> FrozenSet[str]:
    """Слова названия улицы без типа — для сравнения «ул. Невская» и «Невская»."""
    return _words(street_name(street)) if street else frozenset()


def building_key(building: Optional[str]) -> str:
    """Номер дома для сравнения: «д. 82 лит. А» и «82а» — один дом."""
    if not building:
        return ""
    text = _clean(building).lower().replace("ё", "е")
    match = _HOUSE_RE.fullmatch(text)
    if match:
        return match.group("house") + (match.group("litera") or "")
    return re.sub(r"\s+", "", text)


def corpus_key(corpus: Optional[str]) -> str:
    """Корпус для сравнения: «корп. 2» и «2», «стр. 1» и «стр.1»."""
    if not corpus:
        return ""
    text = _clean(corpus).lower()
    corpus_match = _CORPUS_RE.fullmatch(text)
    if corpus_match:
        return corpus_match.group(1)
    structure_match = _STRUCTURE_RE.fullmatch(text)
    if structure_match:
        return f"стр{structure_match.group(1)}"
    return re.sub(r"\s+", "", text)


def city_key(city: Optional[str]) -> str:
    """Город для сравнения: «гп. Новоселье» и «Новоселье», «СПб» и «Санкт-Петербург»."""
    if not city:
        return ""
    text = _clean(_REGION_RE.sub(" ", city))
    settlement_match = _SETTLEMENT_RE.match(text)
    if settlement_match:
        text = settlement_match.group("name")
    return _normalize_city(text).lower().replace("ё", "е") if text else ""


def compose_address(
    city: str = "",
    street: str = "",
    building: str = "",
    corpus: str = "",
    entrance: str = "",
) -> str:
    """
    Собирает полный адрес из компонентов.

    Args:
        city: Город
        street: Улица
        building: Номер дома
        corpus: Корпус/строение

    Returns:
        Полный адрес в формате "Улица, д. X, к. Y, Город"
    """
    parts = []

    if street:
        parts.append(street.strip())

    if building:
        building_str = building.strip()
        # Добавляем "д." если нет
        if not re.match(r"^(?:д\.|дом)", building_str, re.IGNORECASE):
            parts.append(f"д. {building_str}")
        else:
            parts.append(building_str)

    if corpus:
        corpus_str = corpus.strip()
        # Добавляем "к." если нет
        if not re.match(r"^(?:к\.|корп|стр)", corpus_str, re.IGNORECASE):
            parts.append(f"к. {corpus_str}")
        else:
            parts.append(corpus_str)

    if entrance:
        entrance_str = entrance.strip()
        # Добавляем "подъезд" если нет
        if not re.match(
            r"^(?:подъезд|под\.|п\.|парадная|парад\.)", entrance_str, re.IGNORECASE
        ):
            parts.append(f"подъезд {entrance_str}")
        else:
            parts.append(entrance_str)

    if city:
        city = city.strip()
        # Сокращаем Санкт-Петербург до СПб
        if city.lower() in ["санкт-петербург", "питер", "петербург"]:
            parts.append("СПб")
        elif city.lower() in ["москва"]:
            parts.append("Москва")
        else:
            parts.append(city)

    return ", ".join(parts) if parts else ""


# Пример использования
if __name__ == "__main__":
    test_addresses = [
        "Ленинский пр. , д. 82, корп. 3, СПб",
        "г. Санкт-Петербург, ул. Невский проспект, д. 1",
        "Центральная ул., д.3, корп. 1, Лен. обл. гп. Новоселье",
        "пр. Просвещения, д. 14, к. 2, СПб",
        "Московский проспект 200А, Санкт-Петербург",
    ]

    for addr in test_addresses:
        parsed = parse_address(addr)
        print(f"\nВход: {addr}")
        print(f"Город: {parsed.city}")
        print(f"Улица: {parsed.street}")
        print(f"Дом: {parsed.building}")
        print(f"Корпус: {parsed.corpus}")
        print(f"Подъезд: {parsed.entrance}")

        composed = compose_address(
            parsed.city or "",
            parsed.street or "",
            parsed.building or "",
            parsed.corpus or "",
            parsed.entrance or "",
        )
        print(f"Собранный: {composed}")
