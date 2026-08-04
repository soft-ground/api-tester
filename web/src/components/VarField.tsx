import { useRef, useState } from 'react';
import { VarName } from '../api/client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  names: VarName[];
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

// Input field that autocompletes variable names when you type {{ (shared by input / textarea)
export default function VarField({
  value,
  onChange,
  names,
  placeholder,
  className,
  multiline,
  style,
}: Props) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tokenStart, setTokenStart] = useState(-1);
  const [active, setActive] = useState(0);

  // The last detected query (prevents cursor resets from stray events like Korean IME)
  const queryRef = useRef<string | null>(null);

  // Find the "{{partial" pattern just before the cursor and update autocomplete state
  const detect = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const m = before.match(/\{\{\s*([\p{L}\p{N}_.\-]*)$/u);
    if (m) {
      setOpen(true);
      setTokenStart(caret - m[0].length); // '{{' start position
      setQuery(m[1]);
      // Reset the highlight cursor to the first only when the query actually changes. If the same query
      // is detected again (e.g. an IME composition-end event), keep the cursor.
      if (queryRef.current !== m[1]) {
        queryRef.current = m[1];
        setActive(0);
      }
    } else {
      setOpen(false);
      queryRef.current = null;
    }
  };

  const suggestions = open
    ? names.filter((n) =>
        n.name.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const choose = (name: string) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, tokenStart);
    const after = value.slice(caret);
    const inserted = `{{${name}}}`;
    const next = before + inserted + after;
    onChange(next);
    setOpen(false);
    // move the cursor past the insertion
    const pos = before.length + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(suggestions[active].name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const common = {
    ref,
    className,
    style,
    placeholder,
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChange(e.target.value);
      detect(e.target);
    },
    onKeyDown,
    onKeyUp: (e: React.KeyboardEvent) => {
      // exclude arrow/selection keys from detect so they do not reset the autocomplete cursor
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key))
        return;
      detect(e.target as HTMLInputElement);
    },
    onClick: (e: React.MouseEvent) =>
      detect(e.target as HTMLInputElement),
    onBlur: () => setTimeout(() => setOpen(false), 150),
  };

  return (
    <div className="varfield">
      {multiline ? <textarea {...common} /> : <input {...common} />}
      {open && suggestions.length > 0 && (
        <ul className="var-suggest">
          {suggestions.slice(0, 8).map((s, i) => (
            <li
              key={s.name}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s.name);
              }}
            >
              <span className="vs-name">{s.name}</span>
              <span className="vs-source">{s.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
