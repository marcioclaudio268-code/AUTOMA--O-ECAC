import React from 'react';

import {
  buildVigenciaOperacionalBadge,
  getVigenciaOperacionalToneClasses
} from '../../lib/vigencia-operacional';

type VigenciaOperacionalResumoProps = {
  certificadoDigitalValidoAte?: string | null | undefined;
  procuracaoValidaAte?: string | null | undefined;
};

const RESUMOS = [
  {
    expiredLabel: 'Vencido',
    label: 'Certificado',
    missingLabel: 'Sem informação',
    valueKey: 'certificadoDigitalValidoAte'
  },
  {
    expiredLabel: 'Vencida',
    label: 'Procuração',
    missingLabel: 'Sem informação',
    valueKey: 'procuracaoValidaAte'
  }
] as const;

export function VigenciaOperacionalResumo({
  certificadoDigitalValidoAte,
  procuracaoValidaAte
}: VigenciaOperacionalResumoProps) {
  const values = {
    certificadoDigitalValidoAte,
    procuracaoValidaAte
  };

  return (
    <div className="space-y-2">
      {RESUMOS.map((item) => {
        const vigencia = buildVigenciaOperacionalBadge(
          values[item.valueKey],
          {
            expiredLabel: item.expiredLabel,
            missingLabel: item.missingLabel
          }
        );

        return (
          <div
            className="flex items-center justify-between gap-3"
            key={item.label}
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </span>
            <span
              className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${getVigenciaOperacionalToneClasses(
                vigencia.tone
              )}`}
            >
              {vigencia.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
