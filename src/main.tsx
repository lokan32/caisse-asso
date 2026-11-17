import { render } from 'preact';
import { App } from './ui/App';
import { requestPersistentStorage } from './db/db';
import { seedIfEmpty } from './db/catalog';
import { startSync } from './sync';
import './styles.css';

void requestPersistentStorage();
void seedIfEmpty();
startSync();

render(<App />, document.getElementById('app')!);
