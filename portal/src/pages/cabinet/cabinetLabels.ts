import type { CabinetAct } from '@/api/cabinet'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

/** Заголовок акта для представителя: сводный — за месяц, по заявке — с номером. */
export function actTitle(act: CabinetAct): string {
  if (act.kind === 'summary' && act.period_start) {
    const [year, month] = act.period_start.split('-').map(Number)
    return `Сводный акт за ${MONTHS[(month ?? 1) - 1]} ${year}`
  }
  return act.task_number ? `Акт по заявке ${act.task_number}` : 'Акт выполненных работ'
}
