// API сетевых домофонных панелей (Beward) на адресе.
//
// CRUD панелей + «живые» действия (открыть/закрыть/статус/код ключей/кадр).
// Все действия идут на бэкенд, который сам ходит на устройство по запросу.
import apiClient from './client'
import type {
  IntercomPanel,
  CreateIntercomPanelData,
  UpdateIntercomPanelData,
  PanelLockStatus,
  PanelDoorAction,
  PanelMifareScanCode,
} from '@/types/address'

export const intercomApi = {
  // --- CRUD панелей ---

  async getPanels(addressId: number): Promise<IntercomPanel[]> {
    const { data } = await apiClient.get<IntercomPanel[]>(
      `/addresses/${addressId}/panels`,
    )
    return data
  },

  async createPanel(
    addressId: number,
    panel: CreateIntercomPanelData,
  ): Promise<IntercomPanel> {
    const { data } = await apiClient.post<IntercomPanel>(
      `/addresses/${addressId}/panels`,
      panel,
    )
    return data
  },

  async updatePanel(
    addressId: number,
    panelId: number,
    panel: UpdateIntercomPanelData,
  ): Promise<IntercomPanel> {
    const { data } = await apiClient.patch<IntercomPanel>(
      `/addresses/${addressId}/panels/${panelId}`,
      panel,
    )
    return data
  },

  async deletePanel(addressId: number, panelId: number): Promise<void> {
    await apiClient.delete(`/addresses/${addressId}/panels/${panelId}`)
  },

  // --- Живые действия (on-demand) ---

  async openDoor(addressId: number, panelId: number): Promise<PanelDoorAction> {
    const { data } = await apiClient.post<PanelDoorAction>(
      `/addresses/${addressId}/panels/${panelId}/door/open`,
    )
    return data
  },

  async closeDoor(addressId: number, panelId: number): Promise<PanelDoorAction> {
    const { data } = await apiClient.post<PanelDoorAction>(
      `/addresses/${addressId}/panels/${panelId}/door/close`,
    )
    return data
  },

  async getLockStatus(
    addressId: number,
    panelId: number,
  ): Promise<PanelLockStatus> {
    const { data } = await apiClient.get<PanelLockStatus>(
      `/addresses/${addressId}/panels/${panelId}/lock-status`,
    )
    return data
  },

  async getMifareScanCode(
    addressId: number,
    panelId: number,
  ): Promise<PanelMifareScanCode> {
    const { data } = await apiClient.get<PanelMifareScanCode>(
      `/addresses/${addressId}/panels/${panelId}/mifare-scan-code`,
    )
    return data
  },

  // JPEG-кадр как Blob (Bearer-токен не пройдёт через <img src>, тянем через axios).
  async getSnapshot(addressId: number, panelId: number): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(
      `/addresses/${addressId}/panels/${panelId}/snapshot`,
      { responseType: 'blob' },
    )
    return data
  },
}
