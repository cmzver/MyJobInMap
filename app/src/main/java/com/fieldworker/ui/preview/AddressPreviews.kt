package com.fieldworker.ui.preview

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.fieldworker.domain.model.AddressDetails
import com.fieldworker.domain.model.AddressPanel
import com.fieldworker.domain.model.AddressSummary
import com.fieldworker.domain.model.AddressTaskStats
import com.fieldworker.ui.addresses.AddressDetailContent
import com.fieldworker.ui.addresses.AddressList
import com.fieldworker.ui.theme.FieldWorkerTheme

private object AddressPreviewData {
    val addresses = listOf(
        AddressSummary(1, "Ленинский проспект, д.82, корп.3", city = "Санкт-Петербург", street = "Ленинский пр.", building = "82"),
        AddressSummary(2, "пр. Стачек, д.15", city = "Санкт-Петербург", street = "пр. Стачек", building = "15"),
        AddressSummary(3, "Невская, д. 9, г.п. Новоселье"),
    )

    val details = AddressDetails(
        id = 1,
        address = "Ленинский проспект, д.82, корп.3",
        city = "Санкт-Петербург",
        street = "Ленинский пр.",
        building = "82",
        corpus = "3",
        entranceCount = 6,
        floorCount = 16,
        apartmentCount = 384,
        hasElevator = true,
        hasIntercom = true,
        intercomCode = "К1234",
        managementCompany = "УК «Южный дом»",
        managementPhone = "88124567890",
        panels = listOf(
            AddressPanel(id = 10, addressId = 1, label = "Подъезд 1", ip = "10.8.0.21", entrance = "1", model = "Beward DKS15198"),
            AddressPanel(id = 11, addressId = 1, label = "Подъезд 2", ip = "10.8.0.22", entrance = "2", model = "Beward DKS15198"),
        ),
        taskStats = AddressTaskStats(total = 12, newCount = 2, inProgress = 1, done = 8, cancelled = 1),
    )
}

@Preview(name = "My Addresses", showBackground = true, showSystemUi = true)
@Composable
internal fun MyAddressesListPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AddressList(addresses = AddressPreviewData.addresses, onClick = {})
        }
    }
}

@Preview(name = "Address Detail", showBackground = true, showSystemUi = true)
@Composable
internal fun AddressDetailPreview() {
    FieldWorkerTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AddressDetailContent(
                details = AddressPreviewData.details,
                isLoading = false,
                openingPanelId = null,
                onOpenDoor = { _, _ -> },
            )
        }
    }
}
