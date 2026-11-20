import type { ReactNode } from 'react';

// Campos comunes de los formularios de Personal. El prefijo distingue los identificados de cada documento.
export function personnelForm(prefix: string) {
  const fieldId = (key: string) => `${prefix}-${key.replace(/\./g, '-')}`;

  function Field({ name, label, value, onChange, error, optional, textarea, ...props }: {
    name: string; label: string; value: string; onChange: (value: string) => void; error?: string; optional?: boolean; textarea?: boolean;
    inputMode?: 'numeric' | 'decimal'; placeholder?: string; list?: string; type?: 'text' | 'time';
  }) {
    const id = fieldId(name), common = { id, value, className: 'cenit-input', 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined };
    return <div className="personnel-field">
      <label htmlFor={id}>{label}{optional && <span className="personnel-optional"> (opcional)</span>}</label>
      {textarea ? <textarea {...common} rows={4} onChange={event => onChange(event.target.value)} />
        : <input {...common} {...props} autoComplete="off" onChange={event => onChange(event.target.value)} />}
      {error && <p className="personnel-error" id={`${id}-error`}>{error}</p>}
    </div>;
  }

  function Choice<T extends string>({ name, legend, value, options, onChange, error, wide }: {
    name: string; legend: string; value: T | ''; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; error?: string; wide?: boolean;
  }) {
    return <fieldset className="personnel-field" aria-describedby={error ? `${fieldId(name)}-error` : undefined}>
      <legend>{legend}</legend>
      <div className={`personnel-choice${wide ? ' personnel-choice--wide' : ''}${error ? ' personnel-choice--invalid' : ''}`}>
        {options.map((option, index) => <label key={option.value}>
          <input type="radio" name={`${prefix}-${name}`} id={index === 0 ? fieldId(name) : undefined} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>)}
      </div>
      {error && <p className="personnel-error" id={`${fieldId(name)}-error`}>{error}</p>}
    </fieldset>;
  }

  return { fieldId, Field, Choice };
}
