package com.fieldworker.next.features.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fieldworker.next.domain.model.UserSession
import com.fieldworker.next.domain.usecase.ObserveSessionUseCase
import com.fieldworker.next.domain.usecase.SignOutUseCase
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProfileViewModel(
    observeSessionUseCase: ObserveSessionUseCase,
    private val signOutUseCase: SignOutUseCase,
) : ViewModel() {

    val session: StateFlow<UserSession> = observeSessionUseCase()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = UserSession.Guest,
        )

    fun signOut() {
        viewModelScope.launch { signOutUseCase() }
    }
}
