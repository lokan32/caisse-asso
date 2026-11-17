import type { ComponentChildren } from 'preact';
import { fr } from '../i18n/fr';

export function Layout(props: {
  title: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  back?: string;
}) {
  const label = !props.back || props.back === '#/' ? fr.back : fr.previous;
  return (
    <div class="screen">
      <header class="topbar">
        <a class="back" href={props.back ?? '#/'} aria-label={label} data-testid="back">
          ‹ <span>{label}</span>
        </a>
        <h1>{props.title}</h1>
        <div class="topbar-actions">{props.actions}</div>
      </header>
      <main class="content">{props.children}</main>
    </div>
  );
}
