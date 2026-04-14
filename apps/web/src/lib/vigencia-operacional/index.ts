export type VigenciaOperacionalStatus =
  | 'SEM_INFORMACAO'
  | 'VENCIDO'
  | 'A_VENCER'
  | 'REGULAR';

function startOfLocalDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function classifyVigenciaOperacional(
  value: string | null | undefined,
  referenceDate: Date = new Date()
): VigenciaOperacionalStatus {
  if (!value) {
    return 'SEM_INFORMACAO';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'SEM_INFORMACAO';
  }

  const validityDay = startOfLocalDay(date).getTime();
  const today = startOfLocalDay(referenceDate);

  if (validityDay < today.getTime()) {
    return 'VENCIDO';
  }

  const limit = new Date(today);
  limit.setDate(limit.getDate() + 30);

  return validityDay <= limit.getTime() ? 'A_VENCER' : 'REGULAR';
}

export function formatVigenciaOperacionalLabel(
  status: VigenciaOperacionalStatus
): string {
  switch (status) {
    case 'VENCIDO':
      return 'Vencido';
    case 'A_VENCER':
      return 'A vencer';
    case 'REGULAR':
      return 'Regular';
    case 'SEM_INFORMACAO':
    default:
      return 'Sem informacao';
  }
}
