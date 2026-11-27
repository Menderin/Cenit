import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseCatalog } from '../api/purchases.js';
import type { ComboOption } from '../components/Combobox.js';

/**
 * Opciones de unidad, proyecto y cuenta desde los catálogos oficiales. Los proyectos de la unidad elegida van primero;
 * sin unidad se ofrecen todos los de la Facultad. Los catálogos nombran códigos, no los restringen.
 */
export function useCatalogOptions(unitCode?: string | null) {
  const catalog = useQuery({ queryKey: ['purchases', 'catalog'], queryFn: ({ signal }) => getPurchaseCatalog(signal), staleTime: Infinity });
  const data = catalog.data?.data;
  const unitOptions = useMemo<ComboOption[]>(() => (data?.units ?? []).map(unit => ({ value: unit.code, label: unit.name, group: unit.famed ? 'Facultad de Medicina' : 'Otras unidades' })), [data]);
  const projectOptions = useMemo<ComboOption[]>(() => {
    const projects = data?.projects ?? [];
    const own = projects.filter(project => project.unitCode === unitCode);
    return own.length ? own.map(project => ({ value: project.code, label: project.name, group: `Proyectos de la unidad ${unitCode}` }))
      : [...new Map(projects.map(project => [project.code, { value: project.code, label: project.name, group: 'Todos los proyectos de la Facultad' }])).values()];
  }, [data, unitCode]);
  const accountOptions = useMemo<ComboOption[]>(() => [...(data?.accounts ?? [])].sort((a, b) => Number(b.famed) - Number(a.famed))
    .map(item => ({ value: item.code, label: item.name, group: item.famed ? 'Cuentas que usa la Facultad' : 'Plan de cuentas UCN' })), [data]);
  const unitName = (code: string | null) => data?.units.find(unit => unit.code === code)?.name ?? null;
  const projectName = (code: string | null, unit: string | null = unitCode ?? null) => data?.projects.find(project => project.code === code && (!unit || project.unitCode === unit))?.name
    ?? data?.projects.find(project => project.code === code)?.name ?? null;
  const accountName = (code: string | null) => data?.accounts.find(item => item.code === code)?.name ?? null;
  return { catalog, unitOptions, projectOptions, accountOptions, unitName, projectName, accountName };
}
