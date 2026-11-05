package com.fieldworker.ui.materials

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.fieldworker.data.remote.generated.StockResponse
import com.fieldworker.data.repository.ActsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.math.BigDecimal
import javax.inject.Inject

data class MyMaterialsUiState(
    val stocks: List<StockResponse> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    /** Показаны сохранённые остатки — связи нет. */
    val fromCache: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class MyMaterialsViewModel @Inject constructor(
    private val actsRepository: ActsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MyMaterialsUiState())
    val state: StateFlow<MyMaterialsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            actsRepository.myStocks()
                .onSuccess { (stocks, fromCache) ->
                    _state.update {
                        it.copy(
                            stocks = stocks.sortedBy { stock -> stock.name.lowercase() },
                            fromCache = fromCache,
                            isLoading = false,
                            hasLoaded = true,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update { it.copy(isLoading = false, hasLoaded = true, error = e.message) }
                }
        }
    }
}

/** «Мои материалы»: что у мастера на руках; по акту материал списывается сам. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyMaterialsScreen(
    onBack: () -> Unit,
    viewModel: MyMaterialsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Мои материалы",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::load) {
                        Icon(Icons.Default.Refresh, contentDescription = "Обновить")
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            MyMaterialsContent(state = state, modifier = Modifier.fillMaxSize())
        }
    }
}

@Composable
internal fun MyMaterialsContent(state: MyMaterialsUiState, modifier: Modifier = Modifier) {
    Box(modifier = modifier) {
        when {
            state.isLoading && !state.hasLoaded ->
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))

            state.stocks.isEmpty() -> Text(
                text = state.error ?: "Материалы вам ещё не выдавали.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                item {
                    Text(
                        text = if (state.fromCache) {
                            "Нет связи — показаны последние сохранённые остатки."
                        } else {
                            "Материалы из прайса, отмеченные складом, списываются по акту автоматически."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                items(state.stocks, key = { it.materialId }) { stock -> StockRow(stock) }
            }
        }
    }
}

@Composable
private fun StockRow(stock: StockResponse) {
    val quantity = stock.quantity.toBigDecimalOrNull() ?: BigDecimal.ZERO
    val shortage = quantity.signum() < 0
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(stock.name, style = MaterialTheme.typography.bodyLarge)
                if (shortage) {
                    Text(
                        text = "Недостача — списано больше, чем выдано",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            Text(
                text = "${quantity.stripTrailingZeros().toPlainString()} ${stock.unit}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (shortage) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
    }
}
