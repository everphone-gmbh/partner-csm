/**
 * Native Vorschlagsliste für ein Freitextfeld: `<input list={id}>` zeigt die
 * Optionen beim Tippen an, lässt aber jeden anderen Wert zu. Funktioniert ohne
 * JavaScript-Popover auch auf dem Handy.
 */
export function SuggestionDatalist({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  )
}
