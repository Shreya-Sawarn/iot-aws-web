'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeviceStore } from '@/store/deviceStore';
import { useCommandStore } from '@/store/commandStore';
import { useAlertStore } from '@/store/alertStore';
import { useSimulatorStore } from '@/store/simulatorStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

function StoreInitializer() {
  const initDevices = useDeviceStore(s => s.initialize);
  const initCommands = useCommandStore(s => s.initialize);
  const initAlerts = useAlertStore(s => s.initialize);
  const startSimulator = useSimulatorStore(s => s.startSimulator);

  useEffect(() => {
    initDevices();
    initCommands();
    initAlerts();
    startSimulator('demo_mode');
    return () => {
      useSimulatorStore.getState().stopSimulator();
    };
  }, [initDevices, initCommands, initAlerts, startSimulator]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreInitializer />
      {children}
    </QueryClientProvider>
  );
}
