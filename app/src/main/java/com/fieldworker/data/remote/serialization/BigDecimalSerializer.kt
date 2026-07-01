package com.fieldworker.data.remote.serialization

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonUnquotedLiteral
import java.math.BigDecimal

/**
 * Contextual-сериализатор для [java.math.BigDecimal]. Генератор OpenAPI помечает
 * поля BigDecimal (lat/lon, суммы) как @Contextual, поэтому Json нужен модуль с
 * этим сериализатором — иначе парсинг падает с "Serializer for class 'BigDecimal'
 * is not found".
 *
 * На проводе значение представлено JSON-числом. Читаем как строку из JSON-примитива,
 * чтобы не терять точность; при записи выводим неквотированным литералом (числом).
 */
object BigDecimalSerializer : KSerializer<BigDecimal> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("java.math.BigDecimal", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): BigDecimal {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return BigDecimal(decoder.decodeString())
        // content без кавычек для числа, без кавычек и для строкового представления
        return BigDecimal(jsonDecoder.decodeJsonElement().let { element ->
            (element as JsonPrimitive).content
        })
    }

    @OptIn(ExperimentalSerializationApi::class)
    override fun serialize(encoder: Encoder, value: BigDecimal) {
        val jsonEncoder = encoder as? JsonEncoder
        if (jsonEncoder != null) {
            jsonEncoder.encodeJsonElement(JsonUnquotedLiteral(value.toPlainString()))
        } else {
            encoder.encodeString(value.toPlainString())
        }
    }
}
