/**
 * Удалённое решение из карточки заявки: панели адреса заявки, действия с
 * пометкой в истории заявки, кадр в фото, «Решено удалённо».
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { intercomApi } from '@/api/intercom'
import { tasksApi } from '@/api/tasks'
import { commentKeys } from '@/hooks/useComments'
import { photoKeys } from '@/hooks/usePhotos'
import { myTaskKeys, syncTaskInPaginatedLists, taskKeys } from '@/hooks/useTasks'
import type { Task } from '@/types/task'

export const taskPanelKeys = {
  list: (taskId: number) => ['task-panels', taskId] as const,
}

export function useTaskPanels(taskId: number, enabled = true) {
  return useQuery({
    queryKey: taskPanelKeys.list(taskId),
    queryFn: () => intercomApi.getTaskPanels(taskId),
    enabled: enabled && taskId > 0,
    staleTime: 60_000,
  })
}

/** После действия из карточки — подтянуть историю заявки (там новая запись). */
function useHistoryRefresh(taskId: number) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: commentKeys.list(taskId) })
}

export function useTaskDoor(addressId: number, taskId: number) {
  const refreshHistory = useHistoryRefresh(taskId)
  return useMutation({
    mutationFn: (panelId: number) => intercomApi.openDoor(addressId, panelId, taskId),
    onSettled: refreshHistory,
  })
}

export function useTaskScanCode(addressId: number, taskId: number) {
  const refreshHistory = useHistoryRefresh(taskId)
  return useMutation({
    mutationFn: (panelId: number) => intercomApi.getMifareScanCode(addressId, panelId, taskId),
    onSuccess: refreshHistory,
  })
}

export function useSnapshotPhoto(taskId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (panelId: number) => intercomApi.saveSnapshotPhoto(taskId, panelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photoKeys.list(taskId) }),
  })
}

export function useResolveRemotely(taskId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (comment: string) => tasksApi.resolveRemotely(taskId, comment),
    onSuccess: (task: Task) => {
      queryClient.setQueryData(taskKeys.detail(taskId), task)
      syncTaskInPaginatedLists(queryClient, task)
      queryClient.invalidateQueries({ queryKey: myTaskKeys.all })
      queryClient.invalidateQueries({ queryKey: commentKeys.list(taskId) })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
