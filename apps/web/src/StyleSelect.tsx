import { useEffect, useState } from 'react';
import { api } from './api';

const defaults = [
  'Scandinavian',
  'Japandi',
  'Korean Pastel',
  'Modern Minimalist',
  'Industrial',
];

export default function StyleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (style: string) => void;
}) {
  const [names, setNames] = useState(defaults);
  useEffect(() => {
    let active = true;
    api<{ name: string }[]>('/design-styles')
      .then((profiles) => {
        if (active) setNames(profiles.map((profile) => profile.name));
      })
      .catch(() => {
        /* Bundled names keep the form usable while offline. */
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {!names.includes(value) && <option value={value}>{value}</option>}
      {names.map((name) => (
        <option key={name}>{name}</option>
      ))}
    </select>
  );
}
