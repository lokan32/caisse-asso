import { fr } from '../i18n/fr';

export function NoEventPrompt() {
  return (
    <div class="banner warning" data-testid="no-event">
      <p>{fr.home.startEventFirst}</p>
      <a class="btn primary" href="#/settings">
        {fr.home.goToSettings}
      </a>
    </div>
  );
}
