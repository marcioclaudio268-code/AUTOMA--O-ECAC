export type VigenciaOperacionalStatus =
  | 'SEM_INFORMACAO'
  | 'VENCIDO'
  | 'A_VENCER'
  | 'REGULAR';

export type VigenciaOperacionalTone =
  | 'danger'
  | 'neutral'
  | 'success'
  | 'warning';

export type VigenciaOperacionalBadge = {
  label: string;
  status: VigenciaOperacionalStatus;
  tone: VigenciaOperacionalTone;
};

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

export function buildVigenciaOperacionalBadge(
  value: string | null | undefined,
  options: {
    expiredLabel?: string;
    missingLabel?: string;
    referenceDate?: Date;
  } = {}
): VigenciaOperacionalBadge {
  const status = classifyVigenciaOperacional(value, options.referenceDate);

  switch (status) {
    case 'VENCIDO':
      return {
        label: options.expiredLabel ?? 'Vencido',
        status,
        tone: 'danger'
      };
    case 'A_VENCER':
      return {
        label: 'A vencer',
        status,
        tone: 'warning'
      };
    case 'REGULAR':
      return {
        label: 'Regular',
        status,
        tone: 'success'
      };
    case 'SEM_INFORMACAO':
    default:
      return {
        label: options.missingLabel ?? 'Sem informacao',
        status,
        tone: 'neutral'
      };
  }
}

export function formatVigenciaOperacionalLabel(
  status: VigenciaOperacionalStatus,
  options: {
    expiredLabel?: string;
    missingLabel?: string;
  } = {}
): string {
  switch (status) {
    case 'VENCIDO':
      return options.expiredLabel ?? 'Vencido';
    case 'A_VENCER':
      return 'A vencer';
    case 'REGULAR':
      return 'Regular';
    case 'SEM_INFORMACAO':
    default:
      return options.missingLabel ?? 'Sem informacao';
  }
}

export function getVigenciaOperacionalToneClasses(
  tone: VigenciaOperacionalTone
): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'neutral':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}
