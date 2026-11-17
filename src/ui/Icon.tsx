/** Small stroke icons (inline SVG so they render everywhere, offline, without emoji fonts). */
const paths: Record<string, string> = {
  cart: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2 M9 20a1 1 0 1 0 0-.01 M17 20a1 1 0 1 0 0-.01',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  cloud:
    'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z M12 11v5 M9.5 13.5 12 11l2.5 2.5',
  chart: 'M4 20h16 M7 16v-5 M12 16V6 M17 16v-8',
  pencil: 'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
};

export function Icon(props: { name: keyof typeof paths | string; size?: number }) {
  const size = props.size ?? 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name] ?? ''} />
    </svg>
  );
}
