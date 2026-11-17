import { useRoute } from './router';
import { HomeScreen } from './screens/Home';
import { OrderScreen } from './screens/Order';
import { EditScreen } from './screens/Edit';
import { HistoryScreen } from './screens/History';
import { StatsScreen } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { ExportScreen } from './screens/Export';
import { ConfirmHost, ToastHost } from './components';

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'order':
      return <OrderScreen />;
    case 'edit':
      return <EditScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'stats':
      return <StatsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'export':
      return <ExportScreen />;
    default:
      return <HomeScreen />;
  }
}

export function App() {
  return (
    <>
      <Screen />
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
